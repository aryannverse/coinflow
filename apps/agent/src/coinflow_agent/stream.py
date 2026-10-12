"""LangGraph stream → the SSE events the Next proxy forwards (Task 4): status, token, proposal, error, done."""

import asyncio
import json
import logging
from collections.abc import AsyncIterator

from langchain_core.messages import AIMessage, AIMessageChunk, ToolMessage

from .context import AgentContext

log = logging.getLogger("coinflow.agent")

PROPOSAL_TOOLS = {
    "propose_expense",
    "propose_income",
    "propose_group_expense",
    "propose_recurring",
    "propose_budget",
    "propose_group_event",
    "propose_settle_reminder",
    "plan_event",
}


def label_for(tool_name: str) -> str:
    if tool_name == "plan_event":
        return "Planning…"
    return "Drafting…" if tool_name.startswith("propose_") else "Looking that up…"


def sse(event: str, data: object) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode()


def _text(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") in (None, "text"))
    return ""


async def chat_events(
    agent,
    message: str,
    thread_id: str,
    ctx: AgentContext,
    *,
    timeout_s: float,  # noqa: ANN001
    client_thread: str = "main",
) -> AsyncIterator[bytes]:
    yield sse("status", {"state": "thinking"})  # visible within 100 ms of sending (spec §4.7)
    config = {"configurable": {"thread_id": thread_id}}
    announced: set[str] = set()
    try:
        async with asyncio.timeout(timeout_s):  # 60 s in production (spec §5)
            async for msg, meta in agent.astream(
                {"messages": [{"role": "user", "content": message}]}, config, context=ctx, stream_mode="messages"
            ):
                if isinstance(msg, ToolMessage):
                    if msg.name in PROPOSAL_TOOLS and isinstance(msg.artifact, dict) and "kind" in msg.artifact:
                        yield sse("proposal", msg.artifact)
                    continue
                if not isinstance(msg, AIMessage | AIMessageChunk) or meta.get("langgraph_node") != "model":
                    continue
                for tc in [*(getattr(msg, "tool_call_chunks", None) or []), *(msg.tool_calls or [])]:
                    name = tc.get("name")
                    if name and name not in announced:
                        announced.add(name)
                        yield sse("status", {"state": "tool", "label": label_for(name)})
                text = _text(msg.content)
                if text:
                    yield sse("token", {"text": text})
    except TimeoutError:
        yield sse("error", {"code": "llm_timeout", "message": "That took longer than a minute, so I stopped. Please try again."})
    except Exception:
        log.exception("chat failed")
        yield sse("error", {"code": "agent_error", "message": "Something went wrong on my side. Please try again."})
    yield sse("done", {"threadId": client_thread})
