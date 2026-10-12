from types import SimpleNamespace

import pytest

from coinflow_agent.tools.propose import PayerArg, draft_event, draft_expense, draft_group_expense, draft_settle_reminder
from coinflow_agent.tools.read import get_group, get_group_balances
from tests.fake_api import ASHA, FOOD, GROUP, ME, RAVI


def bad_runtime(ctx):  # noqa: ANN001, ANN201
    return SimpleNamespace(context=ctx)


async def test_expense_proposal_is_the_exact_api_body(ctx):
    text, p = await draft_expense(ctx, "expense", "₹1,250.50", "food", note="Toit dinner")
    assert p is not None and p["kind"] == "expense"
    assert p["payload"] == {
        "type": "expense",
        "amount": 125_050,
        "categoryId": FOOD,
        "note": "Toit dinner",
        "method": "upi",
        "source": "chat",
    }
    assert p["summary"] == "Expense ₹1,250.50 · Food & Dining · “Toit dinner”"
    assert "not saved" in text


async def test_an_unclear_amount_is_asked_about_not_guessed(ctx):
    for amount in ["1.5k", "2 lakh", "12.345", "0"]:
        text, p = await draft_expense(ctx, "expense", amount, "food")
        assert p is None and "plain rupee amount" in text


async def test_voice_source_travels_with_the_proposal(ctx):
    ctx.source = "voice"
    _, p = await draft_expense(ctx, "expense", "90", "food")
    assert p is not None and p["payload"]["source"] == "voice"


async def test_group_expense_multi_payer_subset(ctx):
    ctx.group_id = GROUP
    _, p = await draft_group_expense(
        ctx,
        description="Dinner",
        amount_rupees="900",
        paid_by=[PayerArg(name="me", amount_rupees="500"), PayerArg(name="ravi", amount_rupees="400")],
        participants=["me", "Asha", "Ravi"],
        category="food",
    )
    assert p is not None and p["groupId"] == GROUP
    assert p["payload"] == {
        "description": "Dinner",
        "amountPaise": 90_000,
        "categoryId": FOOD,
        "payers": [{"memberId": ME, "paidPaise": 50_000}, {"memberId": RAVI, "paidPaise": 40_000}],
        "split": {"mode": "equal", "memberIds": [ME, ASHA, RAVI]},
    }


async def test_unknown_member_asks_instead_of_proposing(ctx):
    ctx.group_id = GROUP
    text, p = await draft_group_expense(ctx, description="Cab", amount_rupees="300", participants=["me", "Kiran"])
    assert p is None
    assert "couldn't find “Kiran”" in text and "Asha" in text


async def test_payers_that_do_not_add_up_ask(ctx):
    ctx.group_id = GROUP
    text, p = await draft_group_expense(
        ctx, description="Cab", amount_rupees="900", paid_by=[PayerArg(name="me", amount_rupees="500")]
    )
    assert p is None and "₹500, not ₹900" in text


async def test_no_group_in_context_asks_which(ctx):
    text, p = await draft_group_expense(ctx, description="Cab", amount_rupees="300")
    assert p is None and "Which group" in text


async def test_percent_split_must_reach_100(ctx):
    ctx.group_id = GROUP
    text, p = await draft_group_expense(
        ctx,
        description="Villa",
        amount_rupees="999.99",
        split_mode="percent",
        split_values={"me": "33.33", "Asha": "33.33", "Ravi": "33.33"},
    )
    assert p is None and "99.99%" in text


async def test_settle_reminder_defaults_to_what_they_owe_me(ctx):
    ctx.group_id = GROUP
    _, p = await draft_settle_reminder(ctx, member_name="Asha")
    assert p is not None and p["groupId"] == GROUP
    assert p["payload"] == {"memberId": ASHA, "amountPaise": 20_000}


async def test_event_leaves_me_out_of_the_placeholders(ctx):
    _, p = await draft_event(ctx, name="Goa", starts_on="2026-11-01", ends_on="2026-11-04", people=["me", "Asha", "Ravi"])
    assert p is not None
    assert p["payload"]["placeholders"] == [{"displayName": "Asha"}, {"displayName": "Ravi"}]


async def test_a_two_word_name_never_falls_back_to_a_first_name(ctx):
    ctx.group_id = GROUP
    text, p = await draft_group_expense(ctx, description="Cab", amount_rupees="300", participants=["me", "Ravi Sharma"])
    assert p is None and "couldn't find “Ravi Sharma”" in text and "Ravi" in text
    _, ok = await draft_group_expense(ctx, description="Cab", amount_rupees="300", participants=["me", "Ravi"])
    assert ok is not None and ok["payload"]["split"]["memberIds"] == [ME, RAVI]


@pytest.mark.parametrize("bad", ["../me", "../../internal/coach/digest", f"{GROUP}?x=1", f"{GROUP}/../me", "not-a-uuid"])
async def test_a_group_id_that_is_not_a_uuid_is_refused_before_any_request(ctx, fake_api, bad):
    text, p = await draft_group_expense(ctx, description="Cab", amount_rupees="300", group_id=bad)
    assert p is None and "group" in text.lower()
    text, p = await draft_settle_reminder(ctx, member_name="Asha", group_id=bad)
    assert p is None and "group" in text.lower()
    assert "group" in (await get_group.coroutine(bad_runtime(ctx), group_id=bad)).lower()
    assert "group" in (await get_group_balances.coroutine(bad_runtime(ctx), group_id=bad)).lower()
    assert fake_api.requests == []


async def test_the_user_client_refuses_paths_that_could_escape_the_read_list(ctx):
    for path in ("/groups/../me", "/groups/x?y=1", "/groups/x#y", "/groups/%2e%2e/me", "/groups\\..\\me"):
        with pytest.raises(ValueError):
            await ctx.api.get(path)
