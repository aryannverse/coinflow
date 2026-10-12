from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven configuration (spec §4.1). No LLM → no chat; no vision model → no receipt scan."""

    # env_ignore_empty: a blank line in .env (as in .env.example) means "use the default".
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore", env_ignore_empty=True)

    agent_shared_secret: str = ""
    coinflow_api_url: str = "http://localhost:3000"
    agent_database_url: str = "postgresql://coinflow:coinflow@localhost:5436/coinflow"
    checkpointer: str = "postgres"  # "memory" runs without a database

    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""
    llm_vision_model: str = ""
    llm_timeout_s: float = 60.0  # spec §5

    # Speech (spec §4.5, §10): "local" runs faster-whisper/Kokoro (the optional speech extra); "groq" calls Groq's
    # OpenAI-compatible audio endpoints on LLM_BASE_URL with LLM_API_KEY. Local stays the default for development.
    stt_provider: Literal["local", "groq"] = "local"
    tts_provider: Literal["local", "groq"] = "local"
    stt_model: str = "small"
    stt_compute_type: str = "int8"
    stt_language: str | None = None
    tts_voice: str = ""  # blank: Kokoro's af_heart when local, Orpheus's hannah on Groq
    speech_timeout_s: float = 25.0  # per Groq audio call; the web proxy gives /stt and /tts 30 s

    # Receipts on Groq: strict json_schema garbled qwen3.8's values (live check 2026-10-13); json_object reads them right.
    receipt_json_mode: Literal["json_object", "json_schema"] = "json_object"
    # "deep" is the Deep Agents planner (spec §4.3); "light" is a plain create_agent with the same tools and prompt, ~1.8k
    # fewer tokens per call, which keeps a plan inside Groq's free-tier 8,000 tokens a minute.
    planner_engine: Literal["light", "deep"] = "light"

    coach_enabled: bool = True
    # "scheduler": APScheduler in-process (local, docker). "cron": a Vercel Cron calls /coach/run with CRON_SECRET.
    coach_mode: Literal["scheduler", "cron"] = "scheduler"
    cron_secret: str = ""

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_base_url and self.llm_model)

    @property
    def vision_configured(self) -> bool:
        return bool(self.llm_base_url and self.llm_vision_model)

    @property
    def tts_voice_name(self) -> str:
        return self.tts_voice or ("hannah" if self.tts_provider == "groq" else "af_heart")


@lru_cache
def get_settings() -> Settings:
    return Settings()
