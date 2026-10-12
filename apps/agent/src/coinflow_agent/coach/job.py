"""Scheduler + runner (spec §4.6, plan A9). APScheduler, :30 past each hour 08:30–21:30 IST. Each user runs once per day
at their first slot outside quiet hours; the server also caps coach notifications at 2 per day and dedupes by key."""

import asyncio
import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import replace
from datetime import date, datetime
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from ..api_client import InternalClient
from ..settings import Settings
from .rules import Nudge, pick_nudges, should_run

IST = ZoneInfo("Asia/Kolkata")
log = logging.getLogger("coinflow.coach")
Polish = Callable[[Nudge], Awaitable[Nudge]]


class CoachRunner:
    def __init__(
        self, client: InternalClient, *, polish: Polish | None = None, clock: Callable[[], datetime] = lambda: datetime.now(IST)
    ) -> None:
        self.client = client
        self.polish = polish
        self.clock = clock
        self.last_run: dict[str, date] = {}

    async def run_once(self) -> int:
        now = self.clock()
        sent = 0
        for facts in await self.client.coach_digest():
            uid = facts["userId"]
            if not should_run(now, self.last_run.get(uid), facts.get("quietHours")):
                continue
            self.last_run[uid] = now.date()
            for nudge in pick_nudges(facts, now):
                if self.polish:
                    try:
                        nudge = await self.polish(nudge)
                    except Exception:
                        log.warning("coach wording failed; using the template", exc_info=True)
                status = await self.client.post_notification(
                    {
                        "userId": uid,
                        "kind": nudge.kind,
                        "title": nudge.title,
                        "body": nudge.body,
                        "href": nudge.href,
                        "dedupeKey": nudge.dedupe_key,
                    }
                )
                if status == 201:
                    sent += 1
        return sent


def make_polisher(settings: Settings) -> Polish | None:
    """The LLM only rewords the body. It keeps every ₹ amount, adds no '!', and the template is used on any doubt."""
    if not settings.llm_configured:
        return None
    from ..llm import make_chat_model

    model = make_chat_model(settings, streaming=False)

    async def polish(n: Nudge) -> Nudge:
        prompt = (
            "Rewrite this app notification body to sound warm and brief (at most 140 characters). Keep every number and ₹ amount "
            "exactly. No guilt, no warnings, no exclamation marks. Reply with the body only.\n\n" + n.body
        )
        out = await asyncio.wait_for(model.ainvoke(prompt), timeout=15)
        text = str(out.content).strip().strip('"')
        amounts = re.findall(r"₹[\d,]+(?:\.\d\d)?", n.body)
        if not text or len(text) > 160 or "!" in text or any(a not in text for a in amounts):
            return n
        return replace(n, body=text)

    return polish


def start_coach(settings: Settings) -> AsyncIOScheduler:
    runner = CoachRunner(InternalClient(settings.coinflow_api_url, settings.agent_shared_secret), polish=make_polisher(settings))
    scheduler = AsyncIOScheduler(timezone=IST)
    scheduler.add_job(
        runner.run_once,
        CronTrigger(hour="8-21", minute=30, timezone=IST),
        id="coach",
        coalesce=True,
        max_instances=1,
        misfire_grace_time=600,
    )
    scheduler.start()
    return scheduler
