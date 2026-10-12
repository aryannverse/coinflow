from dataclasses import dataclass
from typing import Literal

from .api_client import CoinflowClient

Source = Literal["chat", "voice", "scan"]


@dataclass
class AgentContext:
    """Per-request runtime context. It is never checkpointed: who is asking, where from, and a client bound to them."""

    user_id: str
    api: CoinflowClient
    route: str = "/home"
    group_id: str | None = None
    source: Source = "chat"
