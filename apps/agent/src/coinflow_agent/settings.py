from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven configuration (spec §4.1). No LLM → no chat; no vision model → no receipt scan."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    agent_shared_secret: str = ""
    coinflow_api_url: str = "http://localhost:3000"
    agent_database_url: str = "postgresql://coinflow:coinflow@localhost:5436/coinflow"
    checkpointer: str = "postgres"  # "memory" runs without a database

    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""
    llm_vision_model: str = ""
    llm_timeout_s: float = 60.0  # spec §5

    stt_model: str = "small"
    stt_compute_type: str = "int8"
    stt_language: str | None = None
    tts_voice: str = "af_heart"

    coach_enabled: bool = True

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_base_url and self.llm_model)

    @property
    def vision_configured(self) -> bool:
        return bool(self.llm_base_url and self.llm_vision_model)


@lru_cache
def get_settings() -> Settings:
    return Settings()
