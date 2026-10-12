import re
from decimal import Decimal

MAX_PAISE = 1_000_000_000  # ₹1,00,00,000, same cap as the web app
# Plain digits, en-IN grouping (12,34,567) or international grouping (1,234,567): commas only where they belong.
_AMOUNT = re.compile(r"(?:\d+|\d{1,2}(?:,\d{2})*,\d{3}|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?")
_PREFIX = re.compile(r"(?:₹|Rs\.?|INR)?\s*")


def parse_rupees_to_paise(text: str | int | float) -> int | None:
    """'₹1,250.50' → 125050. Anything that isn't a plain amount ('1.5k', '2 lakh', '12.345') → None, so the agent asks."""
    raw = str(text).strip()
    cleaned = raw[_PREFIX.match(raw).end() :]  # a currency marker may be followed by a space; digits never contain one
    if not _AMOUNT.fullmatch(cleaned):
        return None
    cleaned = cleaned.replace(",", "")
    paise = int(Decimal(cleaned) * 100)
    return paise if 0 < paise <= MAX_PAISE else None


def format_inr(paise: int) -> str:
    """en-IN rupees: ₹1,25,000 or ₹1,250.50; negatives with U+2212, like the web app."""
    sign = "−" if paise < 0 else ""
    rupees, rest = divmod(abs(paise), 100)
    digits = str(rupees)
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups: list[str] = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        digits = ",".join([*groups, tail])
    return f"{sign}₹{digits}" + (f".{rest:02d}" if rest else "")
