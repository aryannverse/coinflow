# Coinflow on Vercel: Implementation Plan

> **For agentic workers:** this is one large task, plus a deployment checklist that the user and controller work through together. The binding spec is `docs/superpowers/specs/2026-10-12-coinflow-parts-b-c-design.md` §10 (read it first), with §4.5 (speech/receipts) and §4.6 (coach) for context.

**Goal:** make `apps/web` and `apps/agent` deployable as two Vercel Hobby projects (Neon Postgres, Vercel Blob, Groq for LLM + STT + TTS, a daily Vercel Cron for the coach) without breaking local development or any existing test.

**Branch:** `main` (the repo now lives at github.com/aryannverse/coinflow, and main equals coinflow-rebuild). Commit to `main`. Run `zsh -ic 'gituse personal'` before the first commit and confirm `git config user.email` is the aryannverse noreply address.

## Global constraints

- **Gates and tests.** Every existing test stays green. `pnpm verify` (apps/web) and `uv run pytest` plus ruff (apps/agent) must pass at the end.
- **TDD.** New behaviour gets tests first: record a RED run, then GREEN.
- **Local development is unchanged by default:**
  - `STORAGE_DRIVER=local`, `STT_PROVIDER=local`, `TTS_PROVIDER=local`, `COACH_MODE=scheduler`;
  - Docker Postgres on 5436;
  - the compose `agent` profile still works.
- **Secrets.** Never read or print `apps/web/.env.local` or `apps/agent/.env`. Any new env var gets an entry in the matching `.env.example` with an empty value and a one-line comment.
- **Money and privacy constraints still bind:**
  - audio and receipt images are processed in memory and never stored;
  - QR files are readable only by co-members;
  - agent tokens are read-only on `/api/v1`.
- **No secrets in `vercel.json`.** Each env var it relies on is listed in the deploy checklist below.

## Task 1: Deployable on Vercel (code)

### Web (`apps/web`)

1. **Database connections.**
   - Keep `DATABASE_URL` for queries. Size postgres.js for serverless when `process.env.VERCEL` is set: `max` 5, `idle_timeout` 20, `connect_timeout` 10, with Neon's TLS handled by the `sslmode=require` in the URL.
   - The notification bus (`src/server/notify-bus.ts`) uses `DATABASE_URL_UNPOOLED` when set, else `DATABASE_URL`.
   - `drizzle.config.ts` and the migrate script prefer `DATABASE_URL_UNPOOLED` when set.
   - Test: a unit test for the URL-picking helper.
2. **SSE on serverless** (`src/app/api/v1/notifications/stream/route.ts`).
   - Add `export const maxDuration = 300`.
   - The stream closes itself after `SSE_MAX_MS`, default 280 000 in production and unlimited locally (0 = off). Before closing it sends a `retry: 2000` line and leaves the client's `Last-Event-ID` resume working.
   - Add the same `maxDuration` to `/api/v1/agent/chat`, `/api/v1/agent/stt` and `/api/v1/agent/receipt`.
   - Test (int): with `SSE_MAX_MS` set small, the stream ends cleanly after the timeout, and a reconnect with `Last-Event-ID` receives a notification created in between.
3. **Vercel Blob storage driver** (`src/server/storage.ts`).
   - Add `vercelBlobStorageDriver()` implementing the existing `Storage` interface with `@vercel/blob` (install it).
   - Select the driver with `STORAGE_DRIVER=vercel-blob`; the default stays `local`.
   - Use private access if the installed `@vercel/blob` supports it. Otherwise use random, unguessable pathnames and never return the blob URL to clients. Reads stream through the existing `/api/v1/files/[...key]` route (auth unchanged), and deletes work.
   - Test: unit tests with `@vercel/blob` mocked (put/get/delete/key validation). Also confirm the existing QR upload and read int tests still pass with the local driver.
4. **Upload caps under Vercel's 4.5 MB body limit.**
   - Receipt and audio caps become 4 MB everywhere: the web proxy pre-checks, the agent's `UploadLimit` and the error copy.
   - Before upload, the camera/receipt button downscales the photo in the browser: draw it to a canvas with the longest side ≤ 2,000 px and export JPEG at quality 0.85. If the result is still over 4 MB, show the existing too-large message.
   - Tests: the downscale helper (pure; mock canvas, or test the size-math function), and the cap constants.
5. **Config.** Add `vercel.json` in `apps/web` with `"regions": ["bom1"]`. Also add notes on the install/build commands only if pnpm workspaces need them; verify against current Vercel monorepo docs.
6. **Env example.** Add `DATABASE_URL_UNPOOLED`, `STORAGE_DRIVER`, `BLOB_READ_WRITE_TOKEN` and `SSE_MAX_MS` to `.env.example`.

### Agent (`apps/agent`)

7. **Speech providers.**
   - Add `STT_PROVIDER` (`local` | `groq`) and `TTS_PROVIDER` (`local` | `groq`) to the settings. Both default to `local`.
   - Groq STT: POST to `{LLM_BASE_URL}/audio/transcriptions` (multipart, `model=whisper-large-v3-turbo`, `response_format=json`, `language` from `STT_LANGUAGE` if set), authenticated with `LLM_API_KEY`. Keep the existing ≤ 30 s duration check before sending (`probe_seconds` doesn't need the speech extra; if it does, use a light container-header probe). Bytes stay in memory.
   - Groq TTS: POST to `{LLM_BASE_URL}/audio/speech` with `model=canopylabs/orpheus-v1-english`, `voice` from `TTS_VOICE` (default `hannah` when the provider is groq; check the current Orpheus voice list), `input`, `response_format=wav`. Return audio/wav.
   - `/health`: `stt` and `tts` are true when the chosen provider is usable (groq: API key and base URL set; local: extra installed).
   - Map timeouts and HTTP errors to the existing sanitized error shapes.
   - Tests: pytest with an httpx mock transport for both providers (success, 4xx/5xx, timeout), plus health capability cases.
8. **Coach in cron mode.**
   - Add `COACH_MODE` (`scheduler` | `cron`) and `CRON_SECRET`. In `cron` mode don't start APScheduler. Instead expose `POST /coach/run`, which requires `Authorization: Bearer {CRON_SECRET}`; otherwise return 401 (and 404 if `COACH_MODE != cron`).
   - The run processes every user once using the existing coach rules, digest and notification endpoints (cap and dedupe stay server-side).
   - Users whose quiet hours include 08:30 IST are skipped.
   - One user's failure is logged and doesn't stop the others; return a summary `{users, sent, skipped, failed}`.
   - Tests: auth (missing/wrong/right secret), the per-user isolation, the quiet-hours skip, and mode off returning 404.
9. **Vercel Python runtime.**
   - Make the FastAPI app deployable as a Vercel Python function. Follow current Vercel docs for FastAPI with `pyproject.toml`/`uv.lock` (e.g. an `api/index.py`, or whatever entrypoint convention the docs specify, exporting `app`).
   - Keep the `speech` extra out of the Vercel install; production dependencies must stay under the 500 MB Python bundle limit. Measure an approximate installed size of the base dependencies with `uv pip install` into a temp dir, and report it.
   - Add `apps/agent/vercel.json` with `"regions": ["bom1"]`, the cron `{ "path": "/coach/run", "schedule": "0 3 * * *" }`, and `maxDuration` 300 for the app function.
   - The checkpointer must work with Neon's direct URL (`sslmode=require`) and the `agent` schema (create it if missing, as today). Check: startup with `CHECKPOINTER=postgres` against the local DB still works.
10. **Env example.** Add `STT_PROVIDER`, `TTS_PROVIDER`, `COACH_MODE` and `CRON_SECRET` to `apps/agent/.env.example`.

### Groq fixes from the live check (2026-10-13)

Evidence: `/private/tmp/claude-501/-Users-vermaryan1-Desktop-HCI-Project/d2493aeb-a4e0-4730-bf2c-ec68565af308/scratchpad/groq-check/report.md`. It contains the exact prototyped diffs and their measured results. Read it.

12. **Receipts work on Groq** (`receipt.py` `read_receipt`).
    - Groq's strict `json_schema` on `qwen/qwen3.8-27b` returned garbled values. Switch to `model.bind(response_format={"type": "json_object"})`.
    - Spell out the exact JSON keys and types in the prompt; it must contain the word "json".
    - Strip any code fences, then call `RawReceipt.model_validate_json`. Any validation failure becomes the existing friendly error.
    - Make the method a setting, `RECEIPT_JSON_MODE=json_object|json_schema`, defaulting to `json_object`.
    - Keep the honesty rules (mismatch and the confidence cap).
    - Extend the fake LLM in tests to support `.bind(...).ainvoke`. Add tests for code-fenced and invalid JSON.
13. **Planner engine** (`planner.py` `build_planner`).
    - Add `PLANNER_ENGINE=deep|light`. `deep` is the current `create_deep_agent`, kept as the spec's Deep Agents planner.
    - `light` builds the planner with `langchain.agents.create_agent(model, [list_categories, propose_group_event, propose_budget, finish_plan], system_prompt=PLANNER_PROMPT, context_schema=AgentContext)`, as in the report.
    - The default is `light`, because Deep Agents adds about 1.8k tokens per call and exceeds Groq's free-tier limit of 8,000 tokens per minute.
    - Keep the "inner drafts never leak" guarantee and its test for both engines (adjust `tests/test_planner.py` fakes).
    - Note the engine choice in spec §4.3 as a deployment setting, not a removal.
14. **Rate limits** (`llm.py`). Raise `max_retries` from 1 to 3 so Groq 429s (retry-after 0.4–2.7 s) are absorbed. The total stays within the 60 s turn budget.
15. **Prompt hygiene.** The 20b run leaked third person ("Drafted for the user…"). Add one line to the system prompt telling the agent to speak directly to the user in second person and never narrate its tools.
16. **Env examples.** Add `RECEIPT_JSON_MODE` and `PLANNER_ENGINE` to `apps/agent/.env.example`. `LLM_MODEL` stays whatever the user chooses; the controller sets it.

### Docs

11. Add `docs/deploy/vercel.md`, the deployment runbook, written for the owner (a student who hasn't used Vercel or Neon before). It covers:
    - creating the Neon database through the Vercel Marketplace on the web project, in the Mumbai region;
    - running migrations against the direct URL;
    - creating both projects from the GitHub repo with their root directories;
    - setting every env var per project, in a table with where each value comes from;
    - creating the Blob store;
    - connecting the agent's database (attach the same Neon database to the agent project, or copy its direct URL);
    - Clerk development keys plus the webhook URL;
    - Groq settings;
    - the cron;
    - a smoke checklist after deployment (sign in, add an expense, create a group and invite, settle and confirm, send a chat, scan a receipt, hold to talk, read aloud, check the coach run in the cron logs).

### Gates and commits

- Run `pnpm verify` in apps/web (port 3000 must be free first; don't kill processes you didn't start), and `uv run pytest` plus `uv run ruff check . && uv run ruff format --check .` in apps/agent.
- Make a few logical commits on `main` (e.g. `feat(deploy): …`, `feat(agent): groq speech providers …`, `docs(deploy): …`). Stage by path only. Don't touch unrelated pending changes (`.agent/`, `.agents/`, `.gemini/`, the root `.gitignore`, the root `*.md` files, the root `scripts/`, docs outside `docs/superpowers`, `docs/hci` and `docs/deploy`, and `*.pdf`).
- Don't push; the controller pushes after review.
