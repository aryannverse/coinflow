"""Coach rules (spec §4.6). Rule-based; the LLM may only reword (job.py). Non-punitive, at most two a day.

CoachFacts, as served by GET /api/internal/coach/digest (Task 4):
  {userId, name, quietHours: {start, end} | null, coachSentToday: int, sentKeys: str[],
   billsDueTomorrow: [{recurringId, name, amountPaise, dueOn}],
   budgets: [{categoryId, name, spentPaise, limitPaise, cycleStart, daysLeft}],
   settlementsAwaiting: [{settlementId, groupId, groupName, fromName, amountPaise, markedAt}],
   unclaimedPlaceholders: [{memberId, groupId, groupName, displayName, createdAt}],
   weekly: {spentPaise, transactionCount, topCategory | null} | null}
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from ..money import format_inr

MAX_PER_DAY = 2
FIRST_RUN = time(8, 30)


@dataclass(frozen=True)
class Nudge:
    kind: str
    title: str
    body: str
    href: str
    dedupe_key: str
    priority: int


def _hm(s: str) -> time:
    h, m = s.split(":")
    return time(int(h), int(m))


def _ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def in_quiet_hours(now: datetime, quiet: dict | None) -> bool:
    if not quiet:
        return False
    start, end = _hm(quiet["start"]), _hm(quiet["end"])
    t = now.time().replace(second=0, microsecond=0)
    if start == end:
        return False
    return start <= t < end if start < end else (t >= start or t < end)


def should_run(now: datetime, last_run: date | None, quiet: dict | None) -> bool:
    """Once per IST day, at the first slot from 08:30 that is outside the user's quiet hours (plan A9)."""
    return now.time() >= FIRST_RUN and last_run != now.date() and not in_quiet_hours(now, quiet)


def pick_nudges(f: dict, now: datetime) -> list[Nudge]:
    out: list[Nudge] = []
    for s in f.get("settlementsAwaiting", []):
        if now - _ts(s["markedAt"]) > timedelta(hours=24):
            out.append(
                Nudge(
                    "coach_settlement",
                    f"{s['fromName']} says they paid you {format_inr(s['amountPaise'])}",
                    f"{s['groupName']} · Confirm when you see it in your account.",
                    f"/groups/{s['groupId']}?tab=balances",
                    f"settle:{s['settlementId']}",
                    0,
                )
            )
    tomorrow = (now.date() + timedelta(days=1)).isoformat()
    for b in f.get("billsDueTomorrow", []):
        if b["dueOn"] == tomorrow:
            out.append(
                Nudge(
                    "coach_bill",
                    f"{b['name']} is due tomorrow",
                    f"{format_inr(b['amountPaise'])} is already set aside in Safe to spend.",
                    "/recurring",
                    f"bill:{b['recurringId']}:{b['dueOn']}",
                    1,
                )
            )
    for b in f.get("budgets", []):
        limit, spent = b["limitPaise"], b["spentPaise"]
        pct = spent * 100 // limit if limit > 0 else 0
        if limit > 0 and pct >= 80 and b["daysLeft"] > 7:
            out.append(
                Nudge(
                    "coach_budget",
                    f"{b['name']} is at {pct}% of your plan",
                    f"{b['daysLeft']} days to go. A lighter week keeps it on track, no pressure.",
                    "/insights",
                    f"budget:{b['categoryId']}:{b['cycleStart']}",
                    2,
                )
            )
    for p in f.get("unclaimedPlaceholders", []):
        if now - _ts(p["createdAt"]) >= timedelta(days=3):
            out.append(
                Nudge(
                    "coach_invite",
                    f"{p['displayName']} hasn’t joined {p['groupName']} yet",
                    "Share the invite link again so they can see their balance.",
                    f"/groups/{p['groupId']}?tab=members",
                    f"unclaimed:{p['memberId']}",
                    3,
                )
            )
    w = f.get("weekly")
    if now.weekday() == 6 and w:
        year, week, _ = now.isocalendar()
        top = f", mostly on {w['topCategory']}" if w.get("topCategory") else ""
        out.append(
            Nudge(
                "coach_weekly",
                "Your week in Coinflow",
                f"You spent {format_inr(w['spentPaise'])} across {w['transactionCount']} entries{top}.",
                "/insights",
                f"weekly:{year}-W{week:02d}",
                4,
            )
        )
    sent = set(f.get("sentKeys", []))
    room = max(0, MAX_PER_DAY - int(f.get("coachSentToday", 0)))
    fresh = sorted((n for n in out if n.dedupe_key not in sent), key=lambda n: (n.priority, n.dedupe_key))
    return fresh[:room]
