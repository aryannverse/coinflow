import pytest

from coinflow_agent.money import format_inr, parse_rupees_to_paise


@pytest.mark.parametrize(
    ("text", "paise"),
    [
        ("250", 25_000),
        ("₹1,250.50", 125_050),
        ("1250.5", 125_050),
        ("Rs. 450", 45_000),
        ("INR 99", 9_900),
        (250, 25_000),
        (99.5, 9_950),
    ],
)
def test_plain_amounts_parse_exactly(text, paise):
    assert parse_rupees_to_paise(text) == paise


@pytest.mark.parametrize("text", ["1.5k", "2 lakh", "12.345", "0", "-50", "", "two hundred", "10000001"])
def test_anything_else_is_refused_so_the_agent_asks(text):
    assert parse_rupees_to_paise(text) is None


def test_format_inr_uses_lakh_grouping():
    assert format_inr(12_500_000) == "₹1,25,000"
    assert format_inr(125_050) == "₹1,250.50"
    assert format_inr(-60_000) == "−₹600"


@pytest.mark.parametrize("text", ["1,5", "2 50", "1,2500", "12,34", "1,25,00", ",250", "250,", "1,,250", "₹ 2 50"])
def test_misplaced_commas_and_inner_spaces_are_refused(text):
    assert parse_rupees_to_paise(text) is None


@pytest.mark.parametrize(
    ("text", "paise"),
    [
        ("1,250", 125_000),
        ("1,25,000", 12_500_000),
        ("125,000", 12_500_000),
        ("1,25,000.50", 12_500_050),
        ("12,34,567", 123_456_700),
        ("₹1,250.50", 125_050),
        ("₹ 250", 25_000),
        (" 250 ", 25_000),
    ],
)
def test_proper_grouping_still_parses(text, paise):
    assert parse_rupees_to_paise(text) == paise
