"""Coach in cron mode (spec §10): a daily Vercel Cron calls /coach/run with Bearer CRON_SECRET instead of APScheduler.
Each user runs once; quiet hours that cover 08:30 IST skip the day; one user's failure never stops the others."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from coinflow_agent import main as main_mod
from coinflow_agent.api_client import InternalClient
from coinflow_agent.coach.job import CoachRunner
from coinflow_agent.main import create_app
from tests.conftest import SECRET
from tests.test_coach import BILL, MONDAY, SETTLE, facts

CRON = "cron-secret-0123456789abcdef"


def digest_transport(users: list[dict], posted: list[dict], fail_for: set[str] = frozenset()) -> httpx.MockTransport:  # noqa: B006
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/api/internal/coach/digest":
            return httpx.Response(200, json={"data": users})
        body = httpx.Response(200, content=req.content).json()
        if body["userId"] in fail_for:
            raise httpx.ConnectError("boom", request=req)
        posted.append(body)
        return httpx.Response(201, json={"ok": True})

    return httpx.MockTransport(handler)


async def test_run_all_isolates_failures_and_skips_quiet_hours_at_0830():
    posted: list[dict] = []
    users = [
        facts(billsDueTomorrow=[BILL]),
        facts(userId="u2", billsDueTomorrow=[BILL]),
        facts(userId="u3", billsDueTomorrow=[BILL], quietHours={"start": "08:00", "end": "09:00"}),
        facts(userId="u4", billsDueTomorrow=[BILL], quietHours={"start": "22:00", "end": "07:00"}),
    ]
    client = InternalClient("http://coinflow.test", SECRET, transport=digest_transport(users, posted, fail_for={"u2"}))
    # The cron may fire late within the hour (Hobby): quiet hours are judged at 08:30 IST, not at the firing time.
    runner = CoachRunner(client, clock=lambda: MONDAY.replace(hour=9, minute=10))
    assert await runner.run_all() == {"users": 4, "sent": 2, "skipped": 1, "failed": 1}
    assert [p["userId"] for p in posted] == ["u1", "u4"]
    await client.aclose()


async def test_run_all_reports_users_with_nothing_to_say_as_neither_sent_nor_failed():
    posted: list[dict] = []
    client = InternalClient("http://coinflow.test", SECRET, transport=digest_transport([facts()], posted))
    assert await CoachRunner(client, clock=lambda: MONDAY).run_all() == {"users": 1, "sent": 0, "skipped": 0, "failed": 0}
    await client.aclose()


def cron_app(settings, users: list[dict], posted: list[dict], **over) -> TestClient:  # noqa: ANN001, ANN003
    # The shared fixture has the coach off; these runs need it on (COACH_ENABLED=false is honoured, see the last test).
    s = settings.model_copy(update={"coach_mode": "cron", "cron_secret": CRON, "coach_enabled": True, **over})
    return TestClient(create_app(s, api_transport=digest_transport(users, posted), start_coach=False))


@pytest.mark.parametrize("method", ["get", "post"])  # Vercel Cron sends GET; POST works for manual runs
def test_coach_run_needs_the_cron_secret(settings, method):
    posted: list[dict] = []
    c = cron_app(settings, [facts()], posted)
    call = getattr(c, method)
    assert call("/coach/run").status_code == 401
    assert call("/coach/run", headers={"authorization": "Bearer nope"}).status_code == 401
    assert call("/coach/run", headers={"authorization": f"Bearer {SECRET}"}).status_code == 401  # the agent secret is not it
    r = call("/coach/run", headers={"authorization": f"Bearer {CRON}"})
    assert r.status_code == 200 and r.json() == {"users": 1, "sent": 0, "skipped": 0, "failed": 0}


def test_coach_run_without_a_configured_cron_secret_is_always_401(settings):
    c = cron_app(settings, [facts()], [], cron_secret="")
    assert c.post("/coach/run", headers={"authorization": "Bearer "}).status_code == 401
    assert c.post("/coach/run", headers={"authorization": "Bearer"}).status_code == 401


def test_coach_run_is_404_outside_cron_mode(settings):
    c = TestClient(create_app(settings.model_copy(update={"cron_secret": CRON}), start_coach=False))
    assert c.post("/coach/run", headers={"authorization": f"Bearer {CRON}"}).status_code == 404


def test_coach_run_posts_nudges_through_the_internal_endpoint(settings):
    posted: list[dict] = []
    marked = (datetime.now(UTC) - timedelta(hours=30)).isoformat().replace("+00:00", "Z")
    c = cron_app(settings, [facts(settlementsAwaiting=[{**SETTLE, "markedAt": marked}])], posted)
    r = c.post("/coach/run", headers={"authorization": f"Bearer {CRON}"})
    assert r.json() == {"users": 1, "sent": 1, "skipped": 0, "failed": 0}
    assert posted[0]["kind"] == "coach_settlement" and posted[0]["dedupeKey"] == "settle:s1"


def test_coach_run_reports_a_digest_failure_without_leaking_details(settings):
    def down(req: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": {"code": "boom", "message": "stack trace"}})

    s = settings.model_copy(update={"coach_mode": "cron", "cron_secret": CRON, "coach_enabled": True})
    c = TestClient(create_app(s, api_transport=httpx.MockTransport(down), start_coach=False))
    r = c.post("/coach/run", headers={"authorization": f"Bearer {CRON}"})
    assert r.status_code == 502 and r.json()["error"]["code"] == "coach_failed" and "stack" not in r.text


def test_cron_mode_never_starts_the_scheduler(settings, monkeypatch):
    def never(_s):  # noqa: ANN001, ANN202
        raise AssertionError("APScheduler must not start in cron mode")

    monkeypatch.setattr(main_mod, "start_coach_scheduler", never)
    s = settings.model_copy(update={"coach_mode": "cron", "coach_enabled": True, "cron_secret": CRON})
    with TestClient(create_app(s, start_coach=True)) as c:
        assert c.get("/health").status_code == 200


def test_coach_enabled_false_is_honoured_in_cron_mode(settings):
    def never(req: httpx.Request) -> httpx.Response:
        raise AssertionError("the digest must not be called when the coach is off")

    s = settings.model_copy(update={"coach_mode": "cron", "cron_secret": CRON, "coach_enabled": False})
    c = TestClient(create_app(s, api_transport=httpx.MockTransport(never), start_coach=False))
    assert c.post("/coach/run").status_code == 401  # the secret still comes first
    r = c.get("/coach/run", headers={"authorization": f"Bearer {CRON}"})
    assert r.status_code == 200 and r.json() == {"users": 0, "sent": 0, "skipped": 0, "failed": 0, "disabled": True}
