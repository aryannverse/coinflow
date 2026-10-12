import pytest
from langgraph.checkpoint.memory import InMemorySaver

from coinflow_agent.agent import SYSTEM_PROMPT, build_agent
from coinflow_agent.llm import make_chat_model
from coinflow_agent.planner import build_planner
from coinflow_agent.settings import Settings
from tests.fake_llm import ScriptedChatModel, call, say
from tests.test_agent_routing import run


# Both engines keep the guarantee: the planner's inner drafts never leak as separate chips (spec §4.3).
@pytest.mark.parametrize("engine", ["deep", "light"])
async def test_planner_bundles_an_event_budgets_and_a_checklist(ctx, engine):
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
    events = await run(
        build_agent(main, InMemorySaver(), planner_model=planner, planner_engine=engine), ctx, "plan a Goa trip for 5 on ₹40k"
    )
    bundles = [d for e, d in events if e == "proposal"]
    assert [b["kind"] for b in bundles] == ["plan_bundle"]  # the planner's inner drafts never leak as separate chips
    p = bundles[0]["payload"]
    assert p["event"]["placeholders"] == [{"displayName": n} for n in ["Asha", "Ravi", "Dev", "Kiran"]]
    assert [b["monthlyLimit"] for b in p["budgets"]] == [2_000_000, 1_200_000]
    assert p["checklist"] == ["Book train tickets", "Share the invite link"]
    assert ("status", {"state": "tool", "label": "Planning…"}) in events
    own = ["list_categories", "propose_group_event", "propose_budget", "finish_plan"]
    if engine == "light":  # no Deep Agents scaffolding: only the planner's own four tools are offered to the model
        assert planner.bound_tools == own
    else:  # Deep Agents adds its own tools (todos, files, sub-agents) on top
        assert set(planner.bound_tools) > set(own)


def test_the_light_planner_is_the_default_and_deep_stays_available():
    # Groq's free tier allows 8,000 tokens a minute; Deep Agents adds ~1.8k tokens to every planner call (live check).
    assert Settings(_env_file=None).planner_engine == "light"
    with pytest.raises(ValueError):
        build_planner(ScriptedChatModel(script=[]), engine="shallow")


def test_groq_rate_limits_get_three_retries():
    s = Settings(_env_file=None, llm_base_url="http://llm.test/v1", llm_model="m")
    assert make_chat_model(s).max_retries == 3  # Groq 429s ask to retry after 0.4–2.7 s


def test_the_agent_speaks_to_the_user_not_about_them():
    assert "second person" in SYSTEM_PROMPT and "never narrate" in SYSTEM_PROMPT.lower()
