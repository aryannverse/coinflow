import asyncio
import json

from langgraph.checkpoint.memory import InMemorySaver

from coinflow_agent.agent import build_agent
from coinflow_agent.stream import chat_events
from tests.fake_api import GROUP
from tests.fake_llm import ScriptedChatModel, call, say


def parse(chunks: list[bytes]) -> list[tuple[str, dict]]:
    out = []
    for block in b"".join(chunks).decode().split("\n\n"):
        if not block.strip():
            continue
        fields = dict(line.split(": ", 1) for line in block.splitlines())
        out.append((fields["event"], json.loads(fields["data"])))
    return out


async def run(agent, ctx, message: str, timeout_s: float = 5) -> list[tuple[str, dict]]:  # noqa: ANN001
    return parse([c async for c in chat_events(agent, message, "user:user_1:main", ctx, timeout_s=timeout_s)])


def agent_with(script: list, planner: list | None = None):  # noqa: ANN001
    model = ScriptedChatModel(script=script)
    return model, build_agent(model, InMemorySaver(), planner_model=ScriptedChatModel(script=planner or []))


async def test_chat_routes_to_propose_expense_and_streams_a_proposal(ctx):
    model, agent = agent_with(
        [
            call("propose_expense", {"amount_rupees": "250", "category": "Food & Dining", "note": "lunch"}),
            say("I’ve drafted ₹250 for lunch. Approve it below."),
        ]
    )
    events = await run(agent, ctx, "250 lunch")
    assert events[0] == ("status", {"state": "thinking"})
    assert events[-1] == ("done", {"threadId": "main"})
    assert ("status", {"state": "tool", "label": "Drafting…"}) in events
    proposal = next(d for e, d in events if e == "proposal")
    assert proposal["payload"]["amount"] == 25_000 and proposal["payload"]["source"] == "chat"
    assert "".join(d["text"] for e, d in events if e == "token") == "I’ve drafted ₹250 for lunch. Approve it below."
    system = model.seen[0][0].content
    assert "paise" in system and "Asia/Kolkata" in system and "never say you saved" in system.lower()


async def test_an_ambiguous_request_gets_a_question_not_a_proposal(ctx):
    _, agent = agent_with([say("Who paid for the cab, and who was in it?")])
    events = await run(agent, ctx, "add the cab")
    assert not any(e == "proposal" for e, _ in events)
    assert any(e == "token" and "Who paid" in d["text"] for e, d in events)


async def test_group_page_context_reaches_the_prompt(ctx):
    ctx.group_id = GROUP
    ctx.route = f"/groups/{GROUP}"
    model, agent = agent_with([say("ok")])
    await run(agent, ctx, "split dinner")
    assert GROUP in model.seen[0][0].content


async def test_a_slow_model_becomes_a_friendly_timeout(ctx):
    class Slow(ScriptedChatModel):
        async def _agenerate(self, *args, **kwargs):  # noqa: ANN002, ANN003
            await asyncio.sleep(5)
            raise AssertionError("unreachable")

    agent = build_agent(Slow(script=[]), InMemorySaver(), planner_model=ScriptedChatModel(script=[]))
    events = await run(agent, ctx, "hi", timeout_s=0.2)
    assert (
        "error",
        {"code": "llm_timeout", "message": "That took longer than a minute, so I stopped. Please try again."},
    ) in events
    assert events[-1][0] == "done"
