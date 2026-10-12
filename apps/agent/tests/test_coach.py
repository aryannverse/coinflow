from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

from coinflow_agent.api_client import InternalClient
from coinflow_agent.coach.job import CoachRunner
from coinflow_agent.coach.rules import in_quiet_hours, pick_nudges, should_run
from tests.conftest import SECRET

IST = ZoneInfo("Asia/Kolkata")
MONDAY = datetime(2026, 10, 12, 8, 30, tzinfo=IST)
SUNDAY = datetime(2026, 10, 18, 8, 30, tzinfo=IST)


def facts(**over):  # noqa: ANN003, ANN201
    base = {
        "userId": "u1",
        "name": "Yash",
        "quietHours": None,
        "coachSentToday": 0,
        "sentKeys": [],
        "billsDueTomorrow": [],
        "budgets": [],
        "settlementsAwaiting": [],
        "unclaimedPlaceholders": [],
        "weekly": None,
    }
    return {**base, **over}


def iso(dt: datetime) -> str:
    return dt.astimezone(ZoneInfo("UTC")).isoformat().replace("+00:00", "Z")


BILL = {"recurringId": "r1", "name": "Rent", "amountPaise": 1_500_000, "dueOn": "2026-10-13"}
BUDGET = {
    "categoryId": "c1",
    "name": "Food & Dining",
    "spentPaise": 400_000,
    "limitPaise": 500_000,
    "cycleStart": "2026-10-01",
    "daysLeft": 8,
}
SETTLE = {
    "settlementId": "s1",
    "groupId": "g1",
    "groupName": "Goa Trip",
    "fromName": "Asha",
    "amountPaise": 120_000,
    "markedAt": iso(MONDAY - timedelta(hours=25)),
}
UNCLAIMED = {
    "memberId": "m1",
    "groupId": "g1",
    "groupName": "Goa Trip",
    "displayName": "Ravi",
    "createdAt": iso(MONDAY - timedelta(days=3)),
}
WEEK = {"spentPaise": 420_000, "transactionCount": 12, "topCategory": "Food & Dining"}


def test_bill_due_tomorrow():
    [n] = pick_nudges(facts(billsDueTomorrow=[BILL]), MONDAY)
    assert (n.kind, n.title, n.body, n.href, n.dedupe_key) == (
        "coach_bill",
        "Rent is due tomorrow",
        "₹15,000 is already set aside in Safe to spend.",
        "/recurring",
        "bill:r1:2026-10-13",
    )


def test_budget_needs_80_percent_and_more_than_7_days_left():
    [n] = pick_nudges(facts(budgets=[BUDGET]), MONDAY)
    assert n.title == "Food & Dining is at 80% of your plan"
    assert pick_nudges(facts(budgets=[{**BUDGET, "daysLeft": 7}]), MONDAY) == []
    assert pick_nudges(facts(budgets=[{**BUDGET, "spentPaise": 399_999}]), MONDAY) == []


def test_settlement_waiting_more_than_a_day():
    [n] = pick_nudges(facts(settlementsAwaiting=[SETTLE]), MONDAY)
    assert n.title == "Asha says they paid you ₹1,200" and n.href == "/groups/g1?tab=balances"
    fresh = {**SETTLE, "markedAt": iso(MONDAY - timedelta(hours=23))}
    assert pick_nudges(facts(settlementsAwaiting=[fresh]), MONDAY) == []


def test_unclaimed_placeholder_after_three_days():
    [n] = pick_nudges(facts(unclaimedPlaceholders=[UNCLAIMED]), MONDAY)
    assert n.title == "Ravi hasn’t joined Goa Trip yet"
    young = {**UNCLAIMED, "createdAt": iso(MONDAY - timedelta(days=2, hours=23))}
    assert pick_nudges(facts(unclaimedPlaceholders=[young]), MONDAY) == []


def test_weekly_summary_only_on_sunday():
    assert pick_nudges(facts(weekly=WEEK), MONDAY) == []
    [n] = pick_nudges(facts(weekly=WEEK), SUNDAY)
    assert n.body == "You spent ₹4,200 across 12 entries, mostly on Food & Dining." and n.dedupe_key == "weekly:2026-W42"


def test_at_most_two_a_day_in_priority_order():
    everything = facts(billsDueTomorrow=[BILL], budgets=[BUDGET], settlementsAwaiting=[SETTLE], unclaimedPlaceholders=[UNCLAIMED])
    assert [n.kind for n in pick_nudges(everything, MONDAY)] == ["coach_settlement", "coach_bill"]
    assert [n.kind for n in pick_nudges({**everything, "coachSentToday": 1}, MONDAY)] == ["coach_settlement"]
    assert pick_nudges({**everything, "coachSentToday": 2}, MONDAY) == []
    assert [n.kind for n in pick_nudges({**everything, "sentKeys": ["settle:s1"]}, MONDAY)] == ["coach_bill", "coach_budget"]


def test_tone_is_never_punitive():
    everything = facts(
        billsDueTomorrow=[BILL], budgets=[BUDGET], settlementsAwaiting=[SETTLE], unclaimedPlaceholders=[UNCLAIMED], weekly=WEEK
    )
    for n in pick_nudges({**everything, "coachSentToday": -10}, SUNDAY):
        text = f"{n.title} {n.body}".lower()
        assert "!" not in text and not any(w in text for w in ("overspent", "warning", "alert", "too much", "failed"))


def test_quiet_hours_can_wrap_midnight():
    q = {"start": "22:00", "end": "07:00"}
    assert in_quiet_hours(MONDAY.replace(hour=22, minute=30), q)
    assert in_quiet_hours(MONDAY.replace(hour=6, minute=59), q)
    assert not in_quiet_hours(MONDAY.replace(hour=7, minute=0), q)
    assert not in_quiet_hours(MONDAY, {"start": "09:00", "end": "17:00"})
    assert not in_quiet_hours(MONDAY, {"start": "08:00", "end": "08:00"})


def test_runs_once_a_day_from_0830_outside_quiet_hours():
    assert not should_run(MONDAY.replace(minute=29), None, None)
    assert should_run(MONDAY, None, None)
    assert not should_run(MONDAY, date(2026, 10, 12), None)
    q = {"start": "08:00", "end": "10:00"}
    assert not should_run(MONDAY, None, q)
    assert should_run(MONDAY.replace(hour=10, minute=30), None, q)


async def test_runner_posts_nudges_once_per_user_per_day():
    posted: list[dict] = []

    def handler(req: httpx.Request) -> httpx.Response:
        assert req.headers["authorization"].startswith("Bearer ")
        if req.url.path == "/api/internal/coach/digest":
            return httpx.Response(
                200,
                json={
                    "data": [facts(billsDueTomorrow=[BILL]), facts(userId="u2", quietHours={"start": "08:00", "end": "09:00"})]
                },
            )
        posted.append(httpx.Response(200, content=req.content).json())
        return httpx.Response(201, json={"ok": True})

    client = InternalClient("http://coinflow.test", SECRET, transport=httpx.MockTransport(handler))
    runner = CoachRunner(client, clock=lambda: MONDAY)
    assert await runner.run_once() == 1
    assert posted == [
        {
            "userId": "u1",
            "kind": "coach_bill",
            "title": "Rent is due tomorrow",
            "body": "₹15,000 is already set aside in Safe to spend.",
            "href": "/recurring",
            "dedupeKey": "bill:r1:2026-10-13",
        }
    ]
    assert await runner.run_once() == 0  # same day: u1 already ran, u2 still in quiet hours
    await client.aclose()
