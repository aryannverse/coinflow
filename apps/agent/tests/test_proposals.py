import pytest
from pydantic import ValidationError

from coinflow_agent.proposals import (
    BudgetPayload,
    GroupEventPayload,
    GroupExpensePayload,
    PlaceholderIn,
    TxnPayload,
    make_proposal,
)
from tests.fake_api import FOOD, ME


def test_envelope_carries_id_kind_summary_and_the_exact_api_body():
    p = make_proposal(
        "expense", "Expense ₹250 · Food & Dining", TxnPayload(type="expense", amount=25_000, categoryId=FOOD, source="voice")
    )
    assert set(p) == {"id", "kind", "summary", "payload"}
    assert p["payload"] == {"type": "expense", "amount": 25_000, "categoryId": FOOD, "method": "upi", "source": "voice"}


def test_unknown_fields_and_out_of_range_money_are_refused():
    with pytest.raises(ValidationError):
        TxnPayload(type="expense", amount=0, categoryId=FOOD, source="chat")
    with pytest.raises(ValidationError):
        BudgetPayload(categoryId=FOOD, monthlyLimit=100, extra=1)  # type: ignore[call-arg]
    with pytest.raises(ValidationError):
        GroupExpensePayload(
            description="x",
            amountPaise=100,
            categoryId=FOOD,
            payers=[{"memberId": ME, "paidPaise": 100}],
            split={"mode": "vibes"},
        )


def test_event_payload_drops_empty_dates_and_keeps_placeholders():
    p = make_proposal("group_event", "Goa", GroupEventPayload(name="Goa", placeholders=[PlaceholderIn(displayName="Asha")]))
    assert p["payload"] == {"name": "Goa", "emoji": "🧳", "kind": "event", "placeholders": [{"displayName": "Asha"}]}
