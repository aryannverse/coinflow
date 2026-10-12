"""Typed proposals (spec §4.4). Each payload is exactly the request body of the Coinflow endpoint that saves it, so
Next re-validates it with the API's own Zod schemas before the user sees it. camelCase on purpose: it is the wire format."""

import re
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

MAX = 1_000_000_000
Paise = Annotated[int, Field(ge=1, le=MAX)]
PaiseOrZero = Annotated[int, Field(ge=0, le=MAX)]
UUID_PATTERN = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
Uuid = Annotated[str, Field(pattern=UUID_PATTERN)]
IsoDate = Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$")]
Name = Annotated[str, Field(min_length=1, max_length=60)]


def is_uuid(value: object) -> bool:
    """Ids that come from tool arguments are written into URL paths, so only a real UUID may pass."""
    return isinstance(value, str) and re.fullmatch(UUID_PATTERN[1:-1], value) is not None


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TxnPayload(Strict):  # POST /api/v1/transactions
    type: Literal["expense", "income"]
    amount: Paise
    categoryId: Uuid
    note: Annotated[str, Field(max_length=200)] | None = None
    method: Literal["upi", "cash", "card", "other"] = "upi"
    occurredAt: str | None = None
    source: Literal["chat", "voice", "scan"]


class PayerIn(Strict):
    memberId: Uuid
    paidPaise: PaiseOrZero


class EqualSplit(Strict):
    mode: Literal["equal"]
    memberIds: Annotated[list[Uuid], Field(min_length=1, max_length=50)]


class ExactEntry(Strict):
    memberId: Uuid
    paise: PaiseOrZero


class ExactSplit(Strict):
    mode: Literal["exact"]
    entries: Annotated[list[ExactEntry], Field(min_length=1, max_length=50)]


class SharesEntry(Strict):
    memberId: Uuid
    shares: Annotated[int, Field(ge=0, le=1000)]


class SharesSplit(Strict):
    mode: Literal["shares"]
    entries: Annotated[list[SharesEntry], Field(min_length=1, max_length=50)]


class PercentEntry(Strict):
    memberId: Uuid
    basisPoints: Annotated[int, Field(ge=0, le=10_000)]


class PercentSplit(Strict):
    mode: Literal["percent"]
    entries: Annotated[list[PercentEntry], Field(min_length=1, max_length=50)]


class ItemIn(Strict):
    name: Name
    amountPaise: Paise
    memberIds: Annotated[list[Uuid], Field(max_length=50)]


class ItemizedSplit(Strict):
    mode: Literal["itemized"]
    items: Annotated[list[ItemIn], Field(min_length=1, max_length=100)]
    taxPaise: PaiseOrZero = 0
    tipPaise: PaiseOrZero = 0
    discountPaise: PaiseOrZero = 0


Split = Annotated[EqualSplit | ExactSplit | SharesSplit | PercentSplit | ItemizedSplit, Field(discriminator="mode")]


class GroupExpensePayload(Strict):  # POST /api/v1/groups/{id}/expenses
    description: Annotated[str, Field(min_length=1, max_length=80)]
    amountPaise: Paise
    categoryId: Uuid
    occurredAt: str | None = None
    payers: Annotated[list[PayerIn], Field(min_length=1, max_length=50)]
    split: Split


class RecurringPayload(Strict):  # POST /api/v1/recurring
    kind: Literal["bill", "income"]
    name: Name
    amount: Paise
    cadence: Literal["weekly", "monthly", "yearly"]
    nextDueOn: IsoDate
    categoryId: Uuid


class BudgetPayload(Strict):  # PUT /api/v1/budgets/{categoryId}  (+ categoryId)
    categoryId: Uuid
    monthlyLimit: Paise


class PlaceholderIn(Strict):
    displayName: Name


class GroupEventPayload(Strict):  # POST /api/v1/groups
    name: Name
    emoji: Annotated[str, Field(min_length=1, max_length=8)] = "🧳"
    kind: Literal["group", "event"] = "event"
    startsOn: IsoDate | None = None
    endsOn: IsoDate | None = None
    placeholders: Annotated[list[PlaceholderIn], Field(max_length=49)] = []


class ReminderPayload(Strict):
    memberId: Uuid
    amountPaise: Paise


class PlanBundlePayload(Strict):
    event: GroupEventPayload
    budgets: Annotated[list[BudgetPayload], Field(max_length=12)] = []
    checklist: Annotated[list[Annotated[str, Field(min_length=1, max_length=120)]], Field(max_length=20)] = []


ProposalKind = Literal[
    "expense", "income", "group_expense", "recurring", "budget", "group_event", "settle_reminder", "plan_bundle"
]


def make_proposal(kind: ProposalKind, summary: str, payload: BaseModel, *, group_id: str | None = None) -> dict:
    """The envelope streamed to the client: {id, kind, summary, groupId?, payload}."""
    out: dict = {
        "id": str(uuid4()),
        "kind": kind,
        "summary": summary[:300],
        "payload": payload.model_dump(mode="json", exclude_none=True),
    }
    if group_id:
        out["groupId"] = group_id
    return out
