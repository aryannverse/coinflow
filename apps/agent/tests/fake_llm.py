"""Scripted fake chat model (spec §6): deterministic tool routing. Each model call pops the next scripted AIMessage,
and every prompt it is shown is recorded. bind_tools returns self: the script already knows which tools it calls. .bind(...) is
langchain's own RunnableBinding, so its kwargs (like response_format) arrive here and are recorded too."""

from itertools import count
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import Field

_ids = count(1)


def call(name: str, args: dict[str, Any] | None = None) -> AIMessage:
    """An assistant turn that calls one tool."""
    return AIMessage(content="", tool_calls=[{"name": name, "args": args or {}, "id": f"call_{next(_ids)}", "type": "tool_call"}])


def say(text: str) -> AIMessage:
    """An assistant turn that just answers."""
    return AIMessage(content=text)


class ScriptedChatModel(BaseChatModel):
    script: list[AIMessage]
    seen: list[list[BaseMessage]] = Field(default_factory=list)
    bound_tools: list[str] = Field(default_factory=list)
    seen_kwargs: list[dict[str, Any]] = Field(default_factory=list)  # e.g. response_format from .bind(...)

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def bind_tools(self, tools, **kwargs):  # noqa: ANN001
        self.bound_tools = [getattr(t, "name", None) or (t.get("name") if isinstance(t, dict) else None) for t in tools]
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs) -> ChatResult:  # noqa: ANN001
        self.seen.append(list(messages))
        self.seen_kwargs.append(dict(kwargs))
        if not self.script:
            raise AssertionError("The scripted model ran out of replies")
        return ChatResult(generations=[ChatGeneration(message=self.script.pop(0))])
