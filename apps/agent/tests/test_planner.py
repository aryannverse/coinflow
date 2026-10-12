from langgraph.checkpoint.memory import InMemorySaver

from coinflow_agent.agent import build_agent
from tests.fake_llm import ScriptedChatModel, call, say
from tests.test_agent_routing import run


async def test_planner_bundles_an_event_budgets_and_a_checklist(ctx):
    planner = ScriptedChatModel(
        script=[
            call(
                "propose_group_event",
                {
                    "name": "Goa trip",
                    "starts_on": "2026-11-01",
                    "ends_on": "2026-11-04",
                    "people": ["Asha", "Ravi", "Dev", "Kiran"],
                },
            ),
            call("propose_budget", {"category": "Travel", "monthly_limit_rupees": "20000"}),
            call("propose_budget", {"category": "Food & Dining", "monthly_limit_rupees": "12000"}),
            call("finish_plan", {"checklist": ["Book train tickets", "Share the invite link"]}),
            say("A four-day Goa plan for five within ₹40,000."),
        ]
    )
    main = ScriptedChatModel(
        script=[call("plan_event", {"request": "plan a Goa trip for 5 on ₹40k"}), say("Here’s a plan to approve.")]
    )
    events = await run(build_agent(main, InMemorySaver(), planner_model=planner), ctx, "plan a Goa trip for 5 on ₹40k")
    bundles = [d for e, d in events if e == "proposal"]
    assert [b["kind"] for b in bundles] == ["plan_bundle"]  # the planner's inner drafts never leak as separate chips
    p = bundles[0]["payload"]
    assert p["event"]["placeholders"] == [{"displayName": n} for n in ["Asha", "Ravi", "Dev", "Kiran"]]
    assert [b["monthlyLimit"] for b in p["budgets"]] == [2_000_000, 1_200_000]
    assert p["checklist"] == ["Book train tickets", "Share the invite link"]
    assert ("status", {"state": "tool", "label": "Planning…"}) in events
