# Coinflow agent: Python 3.12 + uv, with the speech extra (CPU torch, faster-whisper, Kokoro).
FROM python:3.12-slim-bookworm
COPY --from=ghcr.io/astral-sh/uv:0.12.17 /uv /uvx /bin/
# espeak-ng is Kokoro's fallback for words outside its lexicon.
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng && rm -rf /var/lib/apt/lists/*
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never HF_HOME=/models PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --extra speech --no-install-project
COPY src ./src
COPY scripts ./scripts
RUN uv sync --frozen --no-dev --extra speech
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8100
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8100/health')"
CMD ["uvicorn", "coinflow_agent.main:app", "--host", "0.0.0.0", "--port", "8100"]
