"""Internal token bridge (spec §4.2): HS256 JWT with sub = Coinflow user id, aud = 'agent', exp = 10 minutes.
Byte-compatible with apps/web/src/server/internal-token.ts; both test suites pin the same vector."""

import time

import jwt
from fastapi import Header, HTTPException, Request

AUD_USER = "agent"
AUD_SERVICE = "coinflow-internal"
SERVICE_SUB = "svc:agent"
TTL_S = 600


class InvalidToken(Exception):
    pass


def sign_token(secret: str, sub: str, *, aud: str = AUD_USER, now: int | None = None, ttl: int = TTL_S) -> str:
    if not secret:
        raise RuntimeError("AGENT_SHARED_SECRET is not set")
    iat = int(time.time()) if now is None else now
    return jwt.encode({"sub": sub, "aud": aud, "iat": iat, "exp": iat + ttl}, secret, algorithm="HS256")


def verify_token(secret: str, token: str, *, aud: str = AUD_USER, now: int | None = None) -> str:
    if not secret:
        raise InvalidToken("internal tokens are disabled")  # a missing secret disables the path
    try:
        claims = jwt.decode(
            token, secret, algorithms=["HS256"], audience=aud, options={"verify_exp": False, "require": ["sub", "aud", "exp"]}
        )
    except jwt.PyJWTError as e:
        raise InvalidToken(str(e)) from e
    current = int(time.time()) if now is None else now
    if not isinstance(claims.get("exp"), int) or claims["exp"] <= current:
        raise InvalidToken("expired")
    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub:
        raise InvalidToken("no subject")
    if aud == AUD_USER and sub.startswith("svc:"):
        raise InvalidToken("a service token is not a user token")
    return sub


def require_user(request: Request, authorization: str | None = Header(default=None)) -> str:
    """FastAPI dependency: the Coinflow user id from `Authorization: Bearer <internal token>` (minted by Next)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, {"code": "unauthorized", "message": "Missing token."})
    try:
        return verify_token(request.app.state.settings.agent_shared_secret, authorization.removeprefix("Bearer ").strip())
    except InvalidToken:
        raise HTTPException(401, {"code": "unauthorized", "message": "That token isn’t valid."}) from None
