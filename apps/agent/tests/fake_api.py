"""A fake Coinflow /api/v1: canned JSON per path; every request is recorded so tests can prove the agent only reads."""

import httpx

ME = "11111111-1111-4111-8111-111111111111"
ASHA = "22222222-2222-4222-8222-222222222222"
RAVI = "33333333-3333-4333-8333-333333333333"
GROUP = "44444444-4444-4444-8444-444444444444"
FOOD = "55555555-5555-4555-8555-555555555555"
OTHER = "66666666-6666-4666-8666-666666666666"
BILLS = "77777777-7777-4777-8777-777777777777"
SALARY = "88888888-8888-4888-8888-888888888888"
TRAVEL = "99999999-9999-4999-8999-999999999999"


def _cat(id_: str, name: str, kind: str) -> dict:
    return {"id": id_, "name": name, "kind": kind, "userId": None, "system": False, "emoji": "•", "color": "#9BA59F"}


CATEGORIES = {
    "expense": [
        _cat(FOOD, "Food & Dining", "expense"),
        _cat(TRAVEL, "Travel", "expense"),
        _cat(BILLS, "Bills & Utilities", "expense"),
        _cat(OTHER, "Other", "expense"),
    ],
    "income": [_cat(SALARY, "Salary", "income")],
}
GROUP_DETAIL = {
    "id": GROUP,
    "name": "Goa Trip",
    "emoji": "🧳",
    "kind": "event",
    "myMemberId": ME,
    "myPositionPaise": 20_000,
    "memberCount": 3,
    "members": [
        {"id": ME, "displayName": "Yash", "isMe": True, "claimed": True, "removedAt": None, "upiId": "yash@okhdfc"},
        {"id": ASHA, "displayName": "Asha", "isMe": False, "claimed": True, "removedAt": None, "upiId": None},
        {"id": RAVI, "displayName": "Ravi", "isMe": False, "claimed": False, "removedAt": None, "upiId": None},
    ],
}
_WHY = {"debtorOwesPaise": 30_000, "debtorExpenses": [], "splitAcross": []}
BALANCES = {
    "nets": [
        {"memberId": ME, "netPaise": 20_000},
        {"memberId": ASHA, "netPaise": -30_000},
        {"memberId": RAVI, "netPaise": 10_000},
    ],
    "payments": [
        {"from": ASHA, "to": ME, "amountPaise": 20_000, "why": _WHY},
        {"from": ASHA, "to": RAVI, "amountPaise": 10_000, "why": _WHY},
    ],
    "pending": [],
}
STS = {
    "status": "ok",
    "amount": 1_234_500,
    "dailyPace": 61_725,
    "daysLeft": 20,
    "cycleStart": "2026-10-01",
    "cycleEnd": "2026-10-31",
    "nextPayday": "2026-11-01",
    "breakdown": {
        "balance": 2_000_000,
        "committedOut": 500_000,
        "committedIn": 0,
        "fixedRemaining": 285_500,
        "receivables": 20_000,
    },
}
TXNS = [
    {
        "id": "t1",
        "type": "expense",
        "amount": 50_000,
        "personalShare": 30_000,
        "occurredAt": "2026-10-11T14:00:00.000Z",
        "note": "Dinner",
        "category": {"id": FOOD, "name": "Food & Dining"},
        "group": {"id": GROUP, "name": "Goa Trip", "emoji": "🧳"},
    }
]
INSIGHTS = {
    "from": "2026-10-01",
    "to": "2026-10-12",
    "totalExpense": 420_000,
    "totalIncome": 0,
    "byDay": [],
    "byCategory": [
        {"categoryId": FOOD, "name": "Food & Dining", "emoji": "🍜", "color": "#C8F560", "amount": 300_000, "previous": 250_000}
    ],
}


def ok(data: object) -> httpx.Response:
    return httpx.Response(200, json={"data": data})


class FakeApi:
    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.method != "GET":
            return httpx.Response(405, json={"error": {"code": "read_only", "message": "The fake API is read-only."}})
        if not request.headers.get("authorization", "").startswith("Bearer "):
            return httpx.Response(401, json={"error": {"code": "unauthorized", "message": "No token."}})
        path = request.url.path.removeprefix("/api/v1")
        routes = {
            "/summary/safe-to-spend": lambda: ok(STS),
            "/transactions": lambda: httpx.Response(200, json={"data": TXNS, "nextCursor": None}),
            "/insights": lambda: ok(INSIGHTS),
            "/recurring": lambda: ok(
                [
                    {
                        "id": "r1",
                        "kind": "bill",
                        "name": "Rent",
                        "amount": 1_500_000,
                        "cadence": "monthly",
                        "nextDueOn": "2026-11-05",
                        "active": True,
                    }
                ]
            ),
            "/budgets": lambda: ok([{"categoryId": FOOD, "name": "Food & Dining", "monthlyLimit": 600_000, "spent": 300_000}]),
            "/categories": lambda: ok(CATEGORIES[request.url.params.get("kind", "expense")]),
            "/groups": lambda: ok(
                [{k: GROUP_DETAIL[k] for k in ("id", "name", "emoji", "kind", "myPositionPaise", "memberCount")}]
            ),
            f"/groups/{GROUP}": lambda: ok(GROUP_DETAIL),
            f"/groups/{GROUP}/balances": lambda: ok(BALANCES),
        }
        route = routes.get(path)
        return (
            route()
            if route
            else httpx.Response(404, json={"error": {"code": "not_member", "message": "We couldn’t find that group."}})
        )

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handler)
