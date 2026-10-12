"""Coinflow clients. CoinflowClient reads /api/v1 AS one user (spec §4.3) and has no method that writes, by design.
InternalClient is the coach's service channel (plan A9)."""

import httpx

from .auth import AUD_SERVICE, SERVICE_SUB, sign_token

READ_PREFIXES = ("/summary/safe-to-spend", "/transactions", "/insights", "/recurring", "/budgets", "/groups", "/categories")


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def _error(res: httpx.Response) -> ApiError:
    try:
        err = res.json().get("error", {})
    except ValueError:
        err = {}
    return ApiError(res.status_code, err.get("code", "http_error"), err.get("message", "Coinflow returned an error."))


class CoinflowClient:
    def __init__(
        self,
        base_url: str,
        secret: str,
        user_id: str,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 15.0,
    ) -> None:
        self._secret = secret
        self._user_id = user_id
        self._http = httpx.AsyncClient(base_url=f"{base_url.rstrip('/')}/api/v1", transport=transport, timeout=timeout)

    async def get(self, path: str, params: dict[str, object] | None = None) -> dict:
        # The allow-list is checked on the raw string and again after httpx normalises it, so '/groups/../me' can't escape.
        if not path.startswith(READ_PREFIXES) or any(c in path for c in ("..", "?", "#", "%", "\\")):
            raise ValueError(f"{path} is not a read endpoint the agent may call")
        token = sign_token(self._secret, self._user_id)
        query = {k: v for k, v in (params or {}).items() if v is not None}
        res = await self._http.get(path, params=query, headers={"authorization": f"Bearer {token}"})
        if res.status_code >= 400:
            raise _error(res)
        return res.json()

    async def aclose(self) -> None:
        await self._http.aclose()


class InternalClient:
    def __init__(
        self, base_url: str, secret: str, *, transport: httpx.AsyncBaseTransport | None = None, timeout: float = 20.0
    ) -> None:
        self._secret = secret
        self._http = httpx.AsyncClient(base_url=f"{base_url.rstrip('/')}/api/internal", transport=transport, timeout=timeout)

    def _headers(self) -> dict[str, str]:
        return {"authorization": f"Bearer {sign_token(self._secret, SERVICE_SUB, aud=AUD_SERVICE)}"}

    async def coach_digest(self) -> list[dict]:
        res = await self._http.get("/coach/digest", headers=self._headers())
        if res.status_code >= 400:
            raise _error(res)
        return res.json()["data"]

    async def post_notification(self, body: dict) -> int:
        res = await self._http.post("/notifications", json=body, headers=self._headers())
        return res.status_code

    async def aclose(self) -> None:
        await self._http.aclose()
