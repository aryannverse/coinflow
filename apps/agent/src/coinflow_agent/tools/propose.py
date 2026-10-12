"""Proposal tools (spec §4.3–4.4). They never call a write endpoint: each returns (text for the model, proposal | None).
A missing or unclear detail returns a question for the model to ask instead of a guess (spec §4.3 clarification)."""

import re
from typing import Literal

from langchain_core.tools import tool
from langgraph.prebuilt import ToolRuntime
from pydantic import BaseModel, Field, ValidationError

from ..api_client import ApiError
from ..context import AgentContext
from ..money import format_inr, parse_rupees_to_paise
from ..proposals import (
    BudgetPayload,
    EqualSplit,
    ExactEntry,
    ExactSplit,
    GroupEventPayload,
    GroupExpensePayload,
    PayerIn,
    PercentEntry,
    PercentSplit,
    PlaceholderIn,
    RecurringPayload,
    ReminderPayload,
    SharesEntry,
    SharesSplit,
    TxnPayload,
    is_uuid,
    make_proposal,
)
from .read import BAD_GROUP

Result = tuple[str, dict | None]
SELF = {"me", "i", "myself", "mine"}


class NeedsInfo(Exception):
    """Raised with the question the model should ask the user."""


def paise_of(text: str | None) -> int:
    p = parse_rupees_to_paise(text or "")
    if p is None:
        raise NeedsInfo(f"“{text}” isn't a plain rupee amount. Ask the user for the exact amount in digits, e.g. 1250.50.")
    return p


def paise_or_zero(text: str) -> int:
    return 0 if text.strip() in {"0", "0.0", "0.00"} else paise_of(text)


def noon_ist(day: str | None) -> str | None:
    if not day:
        return None
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        raise NeedsInfo("Dates need to look like 2026-10-12. Ask the user which day.")
    return f"{day}T12:00:00+05:30"


async def resolve_category(ctx: AgentContext, kind: str, wanted: str, *, shared_only: bool = False) -> tuple[str, str]:
    cats = [
        c
        for c in (await ctx.api.get("/categories", {"kind": kind}))["data"]
        if not c.get("system") and (not shared_only or c.get("userId") is None)
    ]
    w = wanted.strip().lower()
    for c in cats:
        if c["id"] == wanted or c["name"].lower() == w:
            return c["id"], c["name"]
    for c in cats:
        n = c["name"].lower()
        if w and (w in n or n in w):
            return c["id"], c["name"]
    other = next((c for c in cats if c["name"] == "Other"), None)
    if not other:
        raise NeedsInfo("I couldn't find a category for that. Ask the user to pick one.")
    return other["id"], other["name"]


def member_finder(members: list[dict]):
    def find(name: str) -> dict:
        n = name.strip().lower()
        if n in SELF:
            return next(m for m in members if m["isMe"])
        exact = [m for m in members if m["displayName"].lower() == n]
        if len(exact) == 1:
            return exact[0]
        # A first name may stand for a member ("Ravi" → "Ravi Sharma"), but a full name must match exactly:
        # "Ravi Sharma" must never quietly become a different Ravi.
        first = [m for m in members if n and len(n.split()) == 1 and m["displayName"].lower().split()[0] == n]
        if len(first) == 1:
            return first[0]
        known = ", ".join(m["displayName"] for m in members)
        raise NeedsInfo(f"I couldn't find “{name}” in this group. Members: {known}. Ask the user who they meant.")

    return find


def percent_bp(text: str) -> int | None:
    t = text.strip().removesuffix("%")
    if not re.fullmatch(r"\d{1,3}(\.\d{1,2})?", t):
        return None
    whole, _, frac = t.partition(".")
    return int(whole) * 100 + int(frac.ljust(2, "0"))


def fail(e: Exception) -> Result:
    if isinstance(e, NeedsInfo):
        return str(e), None
    if isinstance(e, ValidationError):
        return f"That draft didn't check out ({e.errors()[0]['msg']}). Ask the user to clarify.", None
    if isinstance(e, ApiError):
        return f"Coinflow couldn't load what I needed ({e.code}): {e.message}", None
    raise e


DRAFTED = "Drafted for the user to approve (not saved): "

# ── Implementations (plain async functions: unit-tested directly) ────────────────────────────────────────────────


async def draft_expense(
    ctx: AgentContext,
    kind: Literal["expense", "income"],
    amount_rupees: str,
    category: str,
    note: str | None = None,
    date: str | None = None,
    method: str = "upi",
) -> Result:
    try:
        amount = paise_of(amount_rupees)
        cat_id, cat_name = await resolve_category(ctx, kind, category)
        payload = TxnPayload(
            type=kind,
            amount=amount,
            categoryId=cat_id,
            note=(note or "").strip()[:200] or None,
            method=method,
            occurredAt=noon_ist(date),
            source=ctx.source,
        )
    except (NeedsInfo, ValidationError, ApiError) as e:
        return fail(e)
    label = "Expense" if kind == "expense" else "Income"
    summary = (
        f"{label} {format_inr(amount)} · {cat_name}"
        + (f" · “{payload.note}”" if payload.note else "")
        + (f" · {date}" if date else "")
    )
    return DRAFTED + summary, make_proposal(kind, summary, payload)


class PayerArg(BaseModel):
    name: str = Field(description="A member's name, or 'me'")
    amount_rupees: str | None = Field(default=None, description="What they paid; leave out when one person paid it all")


def build_split(mode: str, people: list[dict], values: dict[str, str], total: int, find):  # noqa: ANN001
    ids = [m["id"] for m in people]
    if mode == "equal":
        return EqualSplit(mode="equal", memberIds=ids)
    by_id = {find(k)["id"]: v for k, v in values.items()}
    missing = [m["displayName"] for m in people if m["id"] not in by_id]
    if missing:
        raise NeedsInfo(f"For a {mode} split I need a value for {', '.join(missing)}. Ask the user.")
    if mode == "exact":
        entries = [ExactEntry(memberId=i, paise=paise_or_zero(by_id[i])) for i in ids]
        got = sum(e.paise for e in entries)
        if got != total:
            raise NeedsInfo(f"The amounts add up to {format_inr(got)}, not {format_inr(total)}. Ask the user to fix them.")
        return ExactSplit(mode="exact", entries=entries)
    if mode == "shares":
        try:
            return SharesSplit(mode="shares", entries=[SharesEntry(memberId=i, shares=int(by_id[i])) for i in ids])
        except ValueError as e:
            raise NeedsInfo("Shares need to be whole numbers like 1 or 2. Ask the user.") from e
    bps = [percent_bp(by_id[i]) for i in ids]
    if any(b is None for b in bps):
        raise NeedsInfo("Percentages need to look like 33.33. Ask the user.")
    total_bp = sum(b for b in bps if b is not None)
    if total_bp != 10_000:
        raise NeedsInfo(f"The percentages add up to {total_bp / 100:g}%, not 100%. Ask the user to fix them.")
    return PercentSplit(mode="percent", entries=[PercentEntry(memberId=i, basisPoints=b) for i, b in zip(ids, bps, strict=True)])


async def draft_group_expense(
    ctx: AgentContext,
    description: str,
    amount_rupees: str,
    group_id: str | None = None,
    paid_by: list[PayerArg] | None = None,
    participants: list[str] | None = None,
    split_mode: str = "equal",
    split_values: dict[str, str] | None = None,
    category: str = "Other",
) -> Result:
    try:
        gid = group_id or ctx.group_id
        if not gid:
            raise NeedsInfo("Which group is this for? Call list_groups, then ask the user if it's unclear.")
        if not is_uuid(gid):
            raise NeedsInfo(BAD_GROUP)
        total = paise_of(amount_rupees)
        group = (await ctx.api.get(f"/groups/{gid}"))["data"]
        members = [m for m in group["members"] if not m.get("removedAt")]
        find = member_finder(members)
        payer_args = paid_by or [PayerArg(name="me")]
        if len(payer_args) == 1 and not payer_args[0].amount_rupees:
            payers = [PayerIn(memberId=find(payer_args[0].name)["id"], paidPaise=total)]
        else:
            payers = [PayerIn(memberId=find(p.name)["id"], paidPaise=paise_of(p.amount_rupees)) for p in payer_args]
            paid = sum(p.paidPaise for p in payers)
            if paid != total:
                raise NeedsInfo(f"The payers add up to {format_inr(paid)}, not {format_inr(total)}. Ask who paid the rest.")
        people = [find(n) for n in participants] if participants else members
        split = build_split(split_mode, people, split_values or {}, total, find)
        cat_id, _ = await resolve_category(ctx, "expense", category, shared_only=True)
        payload = GroupExpensePayload(
            description=description.strip()[:80] or "Expense", amountPaise=total, categoryId=cat_id, payers=payers, split=split
        )
    except (NeedsInfo, ValidationError, ApiError) as e:
        return fail(e)
    name_of = {m["id"]: ("you" if m["isMe"] else m["displayName"]) for m in members}
    paid_by_text = " and ".join(name_of[p.memberId] for p in payers)
    summary = f"{payload.description} {format_inr(total)} · {group['name']} · paid by {paid_by_text} · {split_mode} split, {len(people)} people"
    return DRAFTED + summary, make_proposal("group_expense", summary, payload, group_id=gid)


async def draft_recurring(
    ctx: AgentContext,
    name: str,
    amount_rupees: str,
    cadence: str,
    next_due_on: str,
    kind: Literal["bill", "income"] = "bill",
    category: str = "Bills & Utilities",
) -> Result:
    try:
        amount = paise_of(amount_rupees)
        cat_id, cat_name = await resolve_category(ctx, "expense" if kind == "bill" else "income", category)
        payload = RecurringPayload(
            kind=kind, name=name.strip()[:60], amount=amount, cadence=cadence, nextDueOn=next_due_on, categoryId=cat_id
        )
    except (NeedsInfo, ValidationError, ApiError) as e:
        return fail(e)
    summary = f"{'Bill' if kind == 'bill' else 'Income'} {payload.name} {format_inr(amount)} {cadence} · next {next_due_on} · {cat_name}"
    return DRAFTED + summary, make_proposal("recurring", summary, payload)


async def draft_budget(ctx: AgentContext, category: str, monthly_limit_rupees: str) -> Result:
    try:
        limit = paise_of(monthly_limit_rupees)
        cat_id, cat_name = await resolve_category(ctx, "expense", category)
        payload = BudgetPayload(categoryId=cat_id, monthlyLimit=limit)
    except (NeedsInfo, ValidationError, ApiError) as e:
        return fail(e)
    summary = f"Plan {format_inr(limit)} a month for {cat_name}"
    return DRAFTED + summary, make_proposal("budget", summary, payload)


async def draft_event(
    ctx: AgentContext,
    name: str,
    starts_on: str | None = None,
    ends_on: str | None = None,
    people: list[str] | None = None,
    kind: Literal["group", "event"] = "event",
    emoji: str = "🧳",
) -> Result:
    try:
        others = [p.strip() for p in (people or []) if p.strip() and p.strip().lower() not in SELF]
        if len({p.lower() for p in others}) != len(others):
            raise NeedsInfo("Two people have the same name. Ask the user how to tell them apart.")
        if starts_on and ends_on and ends_on < starts_on:
            raise NeedsInfo("The end date is before the start date. Ask the user for the dates.")
        payload = GroupEventPayload(
            name=name.strip()[:60],
            emoji=emoji,
            kind=kind,
            startsOn=starts_on,
            endsOn=ends_on,
            placeholders=[PlaceholderIn(displayName=p[:60]) for p in others],
        )
    except (NeedsInfo, ValidationError) as e:
        return fail(e)
    when = f" · {starts_on}–{ends_on}" if starts_on and ends_on else ""
    summary = f"New {kind} {payload.name}{when} · {len(others) + 1} people ({len(others)} to invite)"
    return DRAFTED + summary, make_proposal("group_event", summary, payload)


async def draft_settle_reminder(
    ctx: AgentContext, member_name: str, group_id: str | None = None, amount_rupees: str | None = None
) -> Result:
    try:
        gid = group_id or ctx.group_id
        if not gid:
            raise NeedsInfo("Which group is the reminder for? Call list_groups, then ask the user.")
        if not is_uuid(gid):
            raise NeedsInfo(BAD_GROUP)
        group = (await ctx.api.get(f"/groups/{gid}"))["data"]
        members = [m for m in group["members"] if not m.get("removedAt")]
        who = member_finder(members)(member_name)
        me = next(m for m in members if m["isMe"])
        if amount_rupees:
            amount = paise_of(amount_rupees)
        else:
            payments = (await ctx.api.get(f"/groups/{gid}/balances"))["data"]["payments"]
            owed = sum(p["amountPaise"] for p in payments if p["from"] == who["id"] and p["to"] == me["id"])
            if owed == 0:
                raise NeedsInfo(f"{who['displayName']} doesn't owe the user anything in {group['name']}. Tell the user.")
            amount = owed
        payload = ReminderPayload(memberId=who["id"], amountPaise=amount)
    except (NeedsInfo, ValidationError, ApiError) as e:
        return fail(e)
    summary = f"Remind {who['displayName']} about {format_inr(amount)} · {group['name']}"
    return DRAFTED + summary, make_proposal("settle_reminder", summary, payload, group_id=gid)


# ── LangChain tools (thin wrappers; the runtime supplies the user's context) ──────────────────────────────────────


@tool(response_format="content_and_artifact")
async def propose_expense(
    amount_rupees: str,
    category: str,
    runtime: ToolRuntime[AgentContext],
    note: str | None = None,
    date: str | None = None,
    method: Literal["upi", "cash", "card", "other"] = "upi",
) -> Result:
    """Draft a personal expense for the user to approve. amount_rupees: plain digits like "250" or "1250.50".
    category: a name from list_categories. date: YYYY-MM-DD when it wasn't today."""
    return await draft_expense(runtime.context, "expense", amount_rupees, category, note, date, method)


@tool(response_format="content_and_artifact")
async def propose_income(
    amount_rupees: str, category: str, runtime: ToolRuntime[AgentContext], note: str | None = None, date: str | None = None
) -> Result:
    """Draft personal income for the user to approve (same rules as propose_expense)."""
    return await draft_expense(runtime.context, "income", amount_rupees, category, note, date)


@tool(response_format="content_and_artifact")
async def propose_group_expense(
    description: str,
    amount_rupees: str,
    runtime: ToolRuntime[AgentContext],
    group_id: str | None = None,
    paid_by: list[PayerArg] | None = None,
    participants: list[str] | None = None,
    split_mode: Literal["equal", "exact", "shares", "percent"] = "equal",
    split_values: dict[str, str] | None = None,
    category: str = "Other",
) -> Result:
    """Draft a group expense. paid_by defaults to "me" paying everything; participants default to everyone in the group.
    For exact/shares/percent give split_values as {name: value} in rupees, share counts or percent."""
    return await draft_group_expense(
        runtime.context, description, amount_rupees, group_id, paid_by, participants, split_mode, split_values, category
    )


@tool(response_format="content_and_artifact")
async def propose_recurring(
    name: str,
    amount_rupees: str,
    cadence: Literal["weekly", "monthly", "yearly"],
    next_due_on: str,
    runtime: ToolRuntime[AgentContext],
    kind: Literal["bill", "income"] = "bill",
    category: str = "Bills & Utilities",
) -> Result:
    """Draft a recurring bill or income. next_due_on is YYYY-MM-DD."""
    return await draft_recurring(runtime.context, name, amount_rupees, cadence, next_due_on, kind, category)


@tool(response_format="content_and_artifact")
async def propose_budget(category: str, monthly_limit_rupees: str, runtime: ToolRuntime[AgentContext]) -> Result:
    """Draft a soft monthly plan for an expense category."""
    return await draft_budget(runtime.context, category, monthly_limit_rupees)


@tool(response_format="content_and_artifact")
async def propose_group_event(
    name: str,
    runtime: ToolRuntime[AgentContext],
    starts_on: str | None = None,
    ends_on: str | None = None,
    people: list[str] | None = None,
    kind: Literal["group", "event"] = "event",
    emoji: str = "🧳",
) -> Result:
    """Draft a new group or event. people: the other people's names (they become placeholders who join by invite link)."""
    return await draft_event(runtime.context, name, starts_on, ends_on, people, kind, emoji)


@tool(response_format="content_and_artifact")
async def propose_settle_reminder(
    member_name: str, runtime: ToolRuntime[AgentContext], group_id: str | None = None, amount_rupees: str | None = None
) -> Result:
    """Draft a polite reminder to someone who owes the user money. The user sends it themselves."""
    return await draft_settle_reminder(runtime.context, member_name, group_id, amount_rupees)


PROPOSAL_TOOLS = [
    propose_expense,
    propose_income,
    propose_group_expense,
    propose_recurring,
    propose_budget,
    propose_group_event,
    propose_settle_reminder,
]
