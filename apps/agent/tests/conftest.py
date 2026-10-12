import pytest

from coinflow_agent.api_client import CoinflowClient
from coinflow_agent.context import AgentContext
from coinflow_agent.settings import Settings
from tests.fake_api import FakeApi

SECRET = "coinflow-test-secret-0123456789abcdef"


@pytest.fixture
def settings() -> Settings:
    # _env_file=None: tests never read apps/agent/.env (it holds real keys).
    return Settings(
        _env_file=None,
        agent_shared_secret=SECRET,
        coinflow_api_url="http://coinflow.test",
        checkpointer="memory",
        llm_base_url="",
        llm_model="",
        llm_vision_model="",
        coach_enabled=False,
    )


@pytest.fixture
def fake_api() -> FakeApi:
    return FakeApi()


@pytest.fixture
async def ctx(fake_api: FakeApi, settings: Settings):
    api = CoinflowClient(settings.coinflow_api_url, SECRET, "user_1", transport=fake_api.transport())
    yield AgentContext(user_id="user_1", api=api)
    await api.aclose()
