"""Read tools (spec §4.3): GET /api/v1 as the user. Results are compact JSON; the system prompt says they are data."""

import json
from typing import Literal

from langchain_core.tools import tool
from langgraph.prebuilt import ToolRuntime

from ..api_client import ApiError
from ..context import AgentContext
from ..money import format_inr
from ..proposals import is_uuid

BAD_GROUP = "That group id isn't valid. Call list_groups for the real ids, then ask the user which group."


def dump(data: object) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))[:6000]


async def fetch(ctx: AgentContext, path: str, params: dict | None = None) -> tuple[dict | None, str | None]:
    """(body, None), or (None, a sentence the model can relay). Never a stack trace (spec §5)."""
    try:
        return await ctx.api.get(path, params), None
    except ApiError as e:
        return None, f"Coinflow couldn't load that ({e.code}): {e.message}"


@tool
async def get_safe_to_spend(runtime: ToolRuntime[AgentContext]) -> str:
    """How much the user can safely spend this pay cycle, the daily pace and the days left."""
    body, err = await fetch(runtime.context, "/summary/safe-to-spend")
    if err:
        return err
    d = body["data"]
    if d["status"] == "unknown":
        return "Safe-to-Spend is unknown until the user checks in their balance (Home → Check in balance)."
    return dump(
        {
            "safeToSpend": format_inr(d["amount"]),
            "perDay": format_inr(d["dailyPace"]),
            "daysLeft": d["daysLeft"],
            "cycleEnd": d["cycleEnd"],
        }
    )


@tool
async def explain_safe_to_spend(runtime: ToolRuntime[AgentContext]) -> str:
    """Explain how Safe-to-Spend is worked out, term by term."""
    body, err = await fetch(runtime.context, "/summary/safe-to-spend")
    if err:
        return err
    d = body["data"]
    b = d["breakdown"]
    if d["status"] == "unknown":
        return "There is no balance check-in yet, so Safe-to-Spend can't be worked out."
    return (
        f"Safe-to-Spend {format_inr(d['amount'])} = balance {format_inr(b['balance'])} − bills still due {format_inr(b['committedOut'])} "
        f"+ income still due {format_inr(b['committedIn'])} − fixed costs left {format_inr(b['fixedRemaining'])} "
        f"+ group position {format_inr(b['receivables'])}. {d['daysLeft']} days left, about {format_inr(d['dailyPace'])} a day."
    )


@tool
async def list_transactions(
    runtime: ToolRuntime[AgentContext],
    kind: Literal["expense", "income"] | None = None,
    category_id: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    query: str | None = None,
    limit: int = 20,
) -> str:
    """Recent confirmed transactions, newest first. Dates are YYYY-MM-DD (India time). `query` searches notes and categories."""
    params = {
        "type": kind,
        "categoryId": category_id,
        "from": from_date,
        "to": to_date,
        "q": query,
        "limit": max(1, min(limit, 50)),
    }
    body, err = await fetch(runtime.context, "/transactions", params)
    if err:
        return err
    return dump(
        [
            {
                "at": r["occurredAt"],
                "type": r["type"],
                "yourSpend" if r["type"] == "expense" else "amount": format_inr(
                    r["personalShare"] if r["type"] == "expense" else r["amount"]
                ),
                "category": r["category"]["name"],
                "note": r.get("note"),
                "group": (r.get("group") or {}).get("name"),
            }
            for r in body["data"]
        ]
    )


@tool
async def get_insights(runtime: ToolRuntime[AgentContext], from_date: str, to_date: str) -> str:
    """Spending totals and by-category amounts between two dates (YYYY-MM-DD), with the previous period for comparison."""
    body, err = await fetch(runtime.context, "/insights", {"from": from_date, "to": to_date})
    if err:
        return err
    d = body["data"]
    return dump(
        {
            "spent": format_inr(d["totalExpense"]),
            "byCategory": [
                {"category": c["name"], "spent": format_inr(c["amount"]), "previous": format_inr(c["previous"])}
                for c in d["byCategory"][:8]
            ],
        }
    )


@tool
async def list_recurring(runtime: ToolRuntime[AgentContext]) -> str:
    """Recurring bills and income with cadence and next due date."""
    body, err = await fetch(runtime.context, "/recurring")
    if err:
        return err
    return dump(
        [
            {
                "name": r["name"],
                "kind": r["kind"],
                "amount": format_inr(r["amount"]),
                "cadence": r["cadence"],
                "nextDueOn": r["nextDueOn"],
                "active": r["active"],
            }
            for r in body["data"]
        ]
    )


@tool
async def list_budgets(runtime: ToolRuntime[AgentContext]) -> str:
    """Soft monthly plans per category with what has been spent this cycle."""
    body, err = await fetch(runtime.context, "/budgets")
    if err:
        return err
    return dump(
        [{"category": b["name"], "plan": format_inr(b["monthlyLimit"]), "spent": format_inr(b["spent"])} for b in body["data"]]
    )


@tool
async def list_categories(runtime: ToolRuntime[AgentContext], kind: Literal["expense", "income"] = "expense") -> str:
    """Category names the user can pick from (use these exact names in propose_ tools)."""
    body, err = await fetch(runtime.context, "/categories", {"kind": kind})
    if err:
        return err
    return dump([c["name"] for c in body["data"] if not c.get("system")])


@tool
async def list_groups(runtime: ToolRuntime[AgentContext]) -> str:
    """The user's groups and events with their ids and the user's position in each."""
    body, err = await fetch(runtime.context, "/groups")
    if err:
        return err
    return dump(
        [
            {
                "groupId": g["id"],
                "name": g["name"],
                "kind": g["kind"],
                "people": g["memberCount"],
                "yourPosition": format_inr(g["myPositionPaise"]),
            }
            for g in body["data"]
        ]
    )


@tool
async def get_group(runtime: ToolRuntime[AgentContext], group_id: str | None = None) -> str:
    """One group's members (names to use in proposals). Defaults to the group the user is looking at."""
    gid = group_id or runtime.context.group_id
    if not gid:
        return "Which group? Call list_groups and ask the user if it's unclear."
    if not is_uuid(gid):
        return BAD_GROUP
    body, err = await fetch(runtime.context, f"/groups/{gid}")
    if err:
        return err
    g = body["data"]
    return dump(
        {
            "groupId": g["id"],
            "name": g["name"],
            "members": [
                {"name": "me" if m["isMe"] else m["displayName"], "joined": m["claimed"]}
                for m in g["members"]
                if not m.get("removedAt")
            ],
        }
    )


@tool
async def get_group_balances(runtime: ToolRuntime[AgentContext], group_id: str | None = None) -> str:
    """Who pays whom in a group (simplified), and each person's net position."""
    gid = group_id or runtime.context.group_id
    if not gid:
        return "Which group? Call list_groups and ask the user if it's unclear."
    if not is_uuid(gid):
        return BAD_GROUP
    group, err = await fetch(runtime.context, f"/groups/{gid}")
    if err:
        return err
    bal, err = await fetch(runtime.context, f"/groups/{gid}/balances")
    if err:
        return err
    names = {m["id"]: ("you" if m["isMe"] else m["displayName"]) for m in group["data"]["members"]}
    d = bal["data"]
    return dump(
        {
            "payments": [
                f"{names.get(p['from'], '?')} → {names.get(p['to'], '?')} {format_inr(p['amountPaise'])}" for p in d["payments"]
            ],
            "nets": {names.get(n["memberId"], "?"): format_inr(n["netPaise"]) for n in d["nets"]},
            "pendingConfirmations": len(d["pending"]),
        }
    )


READ_TOOLS = [
    get_safe_to_spend,
    explain_safe_to_spend,
    list_transactions,
    get_insights,
    list_recurring,
    list_budgets,
    list_categories,
    list_groups,
    get_group,
    get_group_balances,
]
