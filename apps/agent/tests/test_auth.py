import pytest

from coinflow_agent.auth import AUD_SERVICE, SERVICE_SUB, InvalidToken, sign_token, verify_token
from tests.conftest import SECRET

# Shared with apps/web/src/server/internal-token.test.ts: both sides must produce exactly this string.
VECTOR = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiJ1c2VyXzEiLCJhdWQiOiJhZ2VudCIsImlhdCI6MTc5MTczNDQwMCwiZXhwIjoxNzkxNzM1MDAwfQ."
    "PQtUZHqe-9eQEHngGpNX44j_pdg5OXPX9d9isYNp9sg"
)
IAT = 1_791_734_400


def test_signs_the_shared_vector():
    assert sign_token(SECRET, "user_1", now=IAT) == VECTOR


def test_verifies_until_ten_minutes_then_expires():
    assert verify_token(SECRET, VECTOR, now=IAT + 599) == "user_1"
    with pytest.raises(InvalidToken):
        verify_token(SECRET, VECTOR, now=IAT + 600)


def test_rejects_wrong_secret_audience_and_service_tokens():
    with pytest.raises(InvalidToken):
        verify_token("x" * 37, VECTOR, now=IAT)
    service = sign_token(SECRET, SERVICE_SUB, aud=AUD_SERVICE, now=IAT)
    with pytest.raises(InvalidToken):
        verify_token(SECRET, service, now=IAT)  # a service token is not a user
    assert verify_token(SECRET, service, aud=AUD_SERVICE, now=IAT) == SERVICE_SUB


def test_missing_secret_disables_the_path():
    with pytest.raises(InvalidToken):
        verify_token("", VECTOR, now=IAT)
