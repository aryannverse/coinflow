from langchain_openai import ChatOpenAI

from .settings import Settings


def make_chat_model(s: Settings, *, model: str | None = None, streaming: bool = True) -> ChatOpenAI:
    """Any OpenAI-compatible endpoint (spec §4.1). 60 s timeout (spec §5). Three retries: Groq's free-tier 429s ask for a
    0.4–2.7 s wait, which the client's backoff absorbs well inside the 60 s turn budget (live check 2026-10-13)."""
    return ChatOpenAI(
        model=model or s.llm_model,
        base_url=s.llm_base_url,
        api_key=s.llm_api_key or "not-needed",
        timeout=s.llm_timeout_s,
        max_retries=3,
        temperature=0.2,
        streaming=streaming,
    )


def make_vision_model(s: Settings) -> ChatOpenAI:
    return make_chat_model(s, model=s.llm_vision_model, streaming=False)
