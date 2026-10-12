from langgraph.checkpoint.memory import InMemorySaver

from coinflow_agent.agent import build_agent
from coinflow_agent.api_client import CoinflowClient
from tests.fake_api import GROUP
from tests.fake_llm import ScriptedChatModel, call, say
from tests.test_agent_routing import run

READS = [
    call("get_safe_to_spend"),
    call("explain_safe_to_spend"),
    call("list_transactions", {"limit": 5}),
    call("get_insights", {"from_date": "2026-10-01", "to_date": "2026-10-12"}),
    call("list_recurring"),
    call("list_budgets"),
    call("list_categories", {"kind": "expense"}),
    call("list_groups"),
    call("get_group", {"group_id": GROUP}),
    call("get_group_balances", {"group_id": GROUP}),
]
PROPOSALS = [
    call("propose_expense", {"amount_rupees": "120", "category": "Food & Dining"}),
    call("propose_income", {"amount_rupees": "5000", "category": "Salary"}),
    call("propose_group_expense", {"description": "Cab", "amount_rupees": "300", "group_id": GROUP}),
    call("propose_recurring", {"name": "Wi-Fi", "amount_rupees": "700", "cadence": "monthly", "next_due_on": "2026-11-05"}),
    call("propose_budget", {"category": "Food & Dining", "monthly_limit_rupees": "6000"}),
    call("propose_group_event", {"name": "Goa", "people": ["Asha", "Ravi"]}),
    call("propose_settle_reminder", {"member_name": "Asha", "group_id": GROUP}),
]


async def test_every_tool_only_reads_and_every_proposal_streams(ctx, fake_api):
    agent = build_agent(
        ScriptedChatModel(script=[*READS, *PROPOSALS, say("Done.")]), InMemorySaver(), planner_model=ScriptedChatModel(script=[])
    )
    events = await run(agent, ctx, "do everything")
    assert [d["kind"] for e, d in events if e == "proposal"] == [
        "expense",
        "income",
        "group_expense",
        "recurring",
        "budget",
        "group_event",
        "settle_reminder",
    ]
    assert fake_api.requests, "the read tools should have called the API"
    assert {r.method for r in fake_api.requests} == {"GET"}
    assert all(r.url.path.startswith("/api/v1/") for r in fake_api.requests)
    assert not any(e == "error" for e, _ in events)


def test_the_user_client_cannot_write():
    for verb in ("post", "put", "patch", "delete", "request", "send"):
        assert not hasattr(CoinflowClient, verb)
