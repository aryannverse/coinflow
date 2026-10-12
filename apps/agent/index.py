"""Vercel entrypoint (spec §10). Vercel's Python runtime serves a top-level `app` from this file (pyproject.toml
[tool.vercel] entrypoint = "index:app"); the package itself is installed by `uv sync`, without the speech extra."""

from coinflow_agent.main import app

__all__ = ["app"]
