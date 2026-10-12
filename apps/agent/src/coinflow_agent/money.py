import re
from decimal import Decimal

MAX_PAISE = 1_000_000_000  # ₹1,00,00,000, same cap as the web app
_PLAIN = re.compile(r"\d+(\.\d{1,2})?")


def parse_rupees_to_paise(text: str | int | float) -> int | None:
    """'₹1,250.50' → 125050. Anything that isn't a plain amount ('1.5k', '2 lakh', '12.345') → None, so the agent asks."""
    cleaned = re.sub(r"[₹,\s]", "", str(text))
    for prefix in ("Rs.", "Rs", "INR"):
        cleaned = cleaned.removeprefix(prefix)
    if not _PLAIN.fullmatch(cleaned):
        return None
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
