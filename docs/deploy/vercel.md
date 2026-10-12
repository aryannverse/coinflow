# Deploying Coinflow on Vercel

This runbook puts Coinflow online on the free **Vercel Hobby** plan. You end up with two Vercel projects built from the
`aryannverse/coinflow` GitHub repo:

| Project | Root directory | What it is |
| --- | --- | --- |
| `coinflow-web` | `apps/web` | The Next.js website and its `/api/v1` backend |
| `coinflow-agent` | `apps/agent` | The Python (FastAPI) AI assistant: chat, receipts, voice, the daily coach |

They share one **Neon Postgres** database (in Mumbai), a private **Vercel Blob** store holds UPI QR images, and **Groq**
runs every AI model (chat, receipt reading, speech-to-text and read-aloud). Sign-in stays on **Clerk development keys**,
so a small "Development mode" badge shows on the sign-in screen. That is expected.

The design behind this is spec §10 (`docs/superpowers/specs/2026-10-12-coinflow-parts-b-c-design.md`).

> **Never paste secrets into files in the repo.** Every key below goes only into the Vercel dashboard (or your terminal
> for one command). `vercel.json` holds no secrets.

Allow about an hour the first time. Work through the steps in order: some values (like URLs) only exist after an earlier
step.

---

## 0. What you need

- A **GitHub** account with access to `aryannverse/coinflow`. The code must be pushed to `main`.
- A **Vercel** account on the Hobby plan. Sign up at <https://vercel.com/signup> with "Continue with GitHub", so Vercel can
  see the repo.
- Your **Groq** account and API key (`gsk_…`), from <https://console.groq.com/keys>. It's the same key as in
  `apps/agent/.env`.
- Your **Clerk** development instance, from <https://dashboard.clerk.com>. It's the one already used locally.
- On your laptop: the repo checked out, `pnpm install` done, and Node 22 or newer.

Generate three random secrets now and keep them in a password manager. Run this command three times:

```bash
openssl rand -hex 32
```

Call them:

- **AGENT_SHARED_SECRET**: shared by both projects. It must be identical on both.
- **INVITE_SECRET**: web only.
- **CRON_SECRET**: agent only.

---

## 1. Create the web project (first deploy will fail; that's fine)

1. In Vercel, click **Add New… → Project**.
2. Pick `aryannverse/coinflow` and click **Import**.
3. Set **Project Name** to `coinflow-web`.
4. Next to **Root Directory**, click **Edit**, choose `apps/web` and click **Continue**. Vercel detects **Next.js**.
5. Leave the build and install commands on their defaults. Vercel finds `pnpm-lock.yaml` at the repo root and installs
   the workspace. The `packageManager` field pins pnpm 12.11.2. `pnpm-workspace.yaml` lists every dependency build
   script, so the strict build check passes on a clean install.
6. Click **Deploy**. The build fails or the site errors at runtime, because there is no database or keys yet. Continue
   to step 2.

`apps/web/vercel.json` already pins the functions to **`bom1` (Mumbai)**, next to the database. Hobby allows one region.

## 2. Create the Neon database (Mumbai) through Vercel

1. Open the `coinflow-web` project and go to the **Storage** tab.
2. Click **Create Database**, choose **Neon** (Serverless Postgres) and click **Continue**.
3. Accept the terms, then choose:
   - **Region:** `Asia Pacific (Mumbai)`, i.e. `aws-ap-south-1`.
   - **Plan:** Free.
   - **Name:** `coinflow`.
4. When asked which environments to connect, keep **Production** (Preview and Development can stay on too).
   - Don't turn on preview branching. Preview databases are out of scope.
5. Click **Connect**.

Neon now adds environment variables to `coinflow-web` automatically. The two that matter:

| Variable | What it is | Used for |
| --- | --- | --- |
| `DATABASE_URL` | **Pooled** URL (host contains `-pooler`) | Every normal query |
| `DATABASE_URL_UNPOOLED` | **Direct** URL | The live-notification listener (`LISTEN` doesn't work through the pooler) and migrations |

Both end in `?sslmode=require`, which turns on TLS. Leave them exactly as Neon wrote them.

To see the values later, open **Storage**, choose the database, then **.env.local** tab → **Show secret**. You need the
direct URL twice: in step 3 and in step 6.

## 3. Create the tables (run the migrations once)

Migrations run from your laptop against the **direct** URL. Copy the value of `DATABASE_URL_UNPOOLED` from step 2, then
run the following from the repo root. `read -rs` keeps the URL out of your shell history and off the screen; paste it
and press Enter.

```bash
read -rs NEON_DIRECT
DATABASE_URL_UNPOOLED="$NEON_DIRECT" pnpm db:migrate
unset NEON_DIRECT
```

You should see drizzle apply each migration in `apps/web/drizzle/`. The migration config prefers `DATABASE_URL_UNPOOLED`
over the local `DATABASE_URL` from `.env.local`, so this never touches your Docker database.

Run the same command again after any future change that adds a migration, before (or right after) that deploy.

## 4. Create the private Blob store (UPI QR images)

1. Open `coinflow-web` and go to the **Storage** tab.
2. Click **Create Database** (or **Create Store**), choose **Blob** and click **Continue**.
3. Set **Access** to **Private**. This matters: a private store's files can't be opened by URL. Coinflow serves them
   only through `/api/v1/files/…`, and only to the owner and their group co-members.
4. Name it `coinflow-qr`. For the region, choose Mumbai (`bom1`) if it's offered.
5. Connect it to `coinflow-web` for **Production** (and Preview if you like).

On Vercel the SDK signs in with OIDC automatically. If the dashboard also shows a `BLOB_READ_WRITE_TOKEN`, that's
fine; you don't need to copy it anywhere.

## 5. Create the agent project

1. Click **Add New… → Project** and import `aryannverse/coinflow` again.
2. Set **Project Name** to `coinflow-agent`.
3. Set **Root Directory** to `apps/agent`. Vercel detects **FastAPI** (Python).
4. Leave the build settings on their defaults:
   - Vercel installs with `uv sync --no-dev --frozen` from `uv.lock`, without the optional `speech` extra (torch,
     faster-whisper, Kokoro). The production dependencies come to about 160 MB, under the 500 MB Python limit.
   - The app is served from `index.py`, as set by `[tool.vercel] entrypoint = "index:app"` in `pyproject.toml`.
   - `apps/agent/vercel.json` sets the region `bom1`, the 300 s function limit and the daily cron.
5. Click **Deploy**. Like the web project, it won't work until step 7.

## 6. Give the agent the database

The agent stores chat threads in its own schema, `agent`, inside the same database. It needs the **direct** URL.

1. Open `coinflow-agent`, go to **Settings → Environment Variables** and add:
   - **Key:** `AGENT_DATABASE_URL`
   - **Value:** the `DATABASE_URL_UNPOOLED` value from step 2, unchanged (including `?sslmode=require`)
   - **Environment:** Production
2. The agent creates the `agent` schema and its tables on first start. There's no migration to run.

Alternatively, attach the database to the agent project too: **Storage → (database) → Connect Project →
coinflow-agent**. That adds `DATABASE_URL_UNPOOLED` there, but the agent reads **`AGENT_DATABASE_URL`**, so you'd still
copy the value into that key.

## 7. Environment variables

Add each variable in **Settings → Environment Variables** for **Production**. "Auto" means Vercel adds it for you.

### `coinflow-web`

| Variable | Value | Where it comes from |
| --- | --- | --- |
| `DATABASE_URL` | Pooled Neon URL | Auto (step 2) |
| `DATABASE_URL_UNPOOLED` | Direct Neon URL | Auto (step 2) |
| `STORAGE_DRIVER` | `vercel-blob` | Type it. Vercel's disk is read-only, so the local driver can't work there |
| `BLOB_READ_WRITE_TOKEN` | (leave unset) | Not needed on Vercel (OIDC). Auto if the dashboard adds it |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_…` | Clerk dashboard → **Configure → API keys** (development instance) |
| `CLERK_SECRET_KEY` | `sk_test_…` | Same page |
| `CLERK_WEBHOOK_SIGNING_SECRET` | `whsec_…` | Step 8 |
| `APP_URL` | `https://coinflow-web.vercel.app` (your real URL, no trailing slash) | The project's **Domains** list |
| `INVITE_SECRET` | Random 64 hex chars | Step 0 |
| `AGENT_URL` | `https://coinflow-agent.vercel.app` (no trailing slash) | The agent project's **Domains** list |
| `AGENT_SHARED_SECRET` | Random 64 hex chars | Step 0. **Same value as on the agent** |
| `LOG_LEVEL` | `info` | Type it (optional) |
| `SSE_MAX_MS` | (leave unset) | Defaults to 280000 on Vercel. Notification streams close before the 300 s limit and resume |

Don't set `UPLOADS_DIR` or any `E2E_*` or `DEMO_*` variables on Vercel. They're for local use only.

### `coinflow-agent`

| Variable | Value | Where it comes from |
| --- | --- | --- |
| `AGENT_SHARED_SECRET` | Random 64 hex chars | Step 0. **Same value as on the web** |
| `COINFLOW_API_URL` | `https://coinflow-web.vercel.app` (no trailing slash) | The web project's URL |
| `AGENT_DATABASE_URL` | Direct Neon URL | Step 6 |
| `CHECKPOINTER` | `postgres` | Type it (it's also the default) |
| `LLM_BASE_URL` | `https://api.groq.com/openai/v1` | Type it |
| `LLM_API_KEY` | `gsk_…` | <https://console.groq.com/keys> |
| `LLM_MODEL` | `openai/gpt-oss-120b` (or `openai/gpt-oss-20b`) | Your choice. The live check found 120b much better at tool use |
| `LLM_VISION_MODEL` | `qwen/qwen3.8-27b` | Type it |
| `RECEIPT_JSON_MODE` | `json_object` | Type it (it's also the default) |
| `PLANNER_ENGINE` | `light` | Type it (it's also the default). Keeps a trip plan under Groq's free 8,000 tokens a minute |
| `STT_PROVIDER` | `groq` | Type it. **Required**: the default `local` needs the speech extra, which isn't installed on Vercel |
| `TTS_PROVIDER` | `groq` | Type it. **Required**, for the same reason |
| `TTS_VOICE` | (leave unset → `hannah`) | Optional. Choose from `autumn`, `diana`, `hannah`, `austin`, `daniel`, `troy` |
| `STT_LANGUAGE` | (leave unset) or `en` | Optional hint |
| `COACH_ENABLED` | `true` | Type it |
| `COACH_MODE` | `cron` | Type it. **Required**: there's no long-running process for the in-app scheduler on Vercel |
| `CRON_SECRET` | Random 64 hex chars | Step 0. Vercel sends it to the cron route automatically |

After adding the variables, **redeploy both projects**: go to **Deployments**, open the latest deployment's **⋯** menu
and choose **Redeploy**. Variables only apply to new deployments.

Use the URLs Vercel actually gave you. If `coinflow-web` was taken, your URL may be something like
`coinflow-web-aryannverse.vercel.app`. In that case `APP_URL` and `COINFLOW_API_URL` change to match, and so does
`AGENT_URL`.

## 8. Clerk (development keys)

1. In the Clerk dashboard (development instance), go to **Configure → Webhooks** and click **Add Endpoint**.
2. Set the endpoint URL to `https://coinflow-web.vercel.app/api/webhooks/clerk` (your real web URL).
3. Subscribe to these events: `user.created`, `user.updated`, `user.deleted`.
4. Create the endpoint, open it and copy its **Signing Secret** (`whsec_…`).
5. In `coinflow-web`, set `CLERK_WEBHOOK_SIGNING_SECRET` to that secret and redeploy.

The webhook is optional: users are also synced on their first request. With it, profile changes and deletions sync too.
Development keys work on `*.vercel.app` and show a "Development mode" badge. Production keys and a custom domain are
out of scope.

## 9. Groq

1. **Accept the Orpheus terms.** This is required for "Read replies aloud". Open
   <https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english> while signed in as the org owner, and
   accept the model terms. Until you do, every read-aloud request fails with Groq's `model_terms_required` error, and
   Coinflow shows "Couldn't read that aloud". The live check on 2026-10-13 hit exactly this.
2. Speech-to-text uses `whisper-large-v3-turbo` and needs no extra step.
3. Free-tier limits to keep in mind:
   - gpt-oss models: 8,000 tokens a minute.
   - The qwen vision model: 7,000 input tokens a minute, roughly 3 receipt scans a minute.
   - Orpheus reads at most 200 characters per request. Coinflow splits longer replies, so a long reply makes several
     requests.

   Coinflow retries rate-limited calls 3 times. Heavy use in a short burst can still ask you to try again in a moment.

## 10. The daily coach (Vercel Cron)

`apps/agent/vercel.json` declares the cron:

```json
"crons": [{ "path": "/coach/run", "schedule": "0 3 * * *" }]
```

- `0 3 * * *` is 03:00 UTC, which is **08:30 IST**.
- On Hobby, a cron runs once a day and may fire any time within that hour (08:30–09:29 IST).
- Vercel calls `GET /coach/run` on the **production** deployment with `Authorization: Bearer $CRON_SECRET`. Anything
  without the secret gets a 401, and the route returns 404 unless `COACH_MODE=cron`.
- Each run handles every user once. A user whose quiet hours include 08:30 IST is skipped that day.
- The cap of 2 nudges a day and the dedupe are enforced by the web app.

To check that the cron is set up, open `coinflow-agent` and go to **Settings → Cron Jobs**. The job is listed there, and
**Run** triggers it now. The result shows in **Logs**: filter by the `/coach/run` path and look for a line like
`coach run {'users': 3, 'sent': 1, 'skipped': 0, 'failed': 0}`.

## 11. Smoke test after deploying

Open `https://coinflow-web.vercel.app` in a fresh browser window and check each item:

- [ ] **Sign in** with your Clerk test user. The "Development mode" badge is expected. You land on Home.
- [ ] **Add an expense** with quick add, for example ₹250 Food & Dining. It shows on Home and in Activity.
- [ ] **Create a group and invite**: create a group, copy the invite link and open it in a private window as a second
      user. The link starts with your `APP_URL`, and joining works.
- [ ] **Upload a UPI QR** (Profile). It shows for you and, in settle up, for a co-member. Opening the image URL while
      signed out never shows the image.
- [ ] **Settle and confirm**: mark a payment as paid as one user, then confirm it as the other. The notification bell
      updates within a few seconds, without a refresh.
- [ ] **Chat**: open "Ask Coinflow" and type "I spent 250 on lunch". A staging chip appears; approve it.
- [ ] **Scan a receipt**: use the camera button with a real receipt photo (a large phone photo is fine; it is shrunk
      first). The amounts fill in.
- [ ] **Hold to talk**: hold the mic, say "two fifty for lunch" and let go. The text appears and the assistant answers.
- [ ] **Read aloud**: turn on "Read replies aloud" and send a message. You hear the reply (needs the Orpheus terms from
      step 9).
- [ ] **Coach**: in `coinflow-agent`, go to **Settings → Cron Jobs → Run**, then check **Logs** for `coach run {...}`
      with `failed: 0`.
- [ ] **Assistant health**: `https://coinflow-agent.vercel.app/health` shows
      `{"ok":true,"capabilities":{"chat":true,"vision":true,"stt":true,"tts":true}}`.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| The pill says "Assistant offline" | `AGENT_URL` is wrong, or `AGENT_SHARED_SECRET` differs between the projects, or the agent's `/health` shows `chat:false` (check `LLM_*` and `AGENT_DATABASE_URL`) |
| The agent fails at start with a database error | `AGENT_DATABASE_URL` is the pooled URL (it must be the direct one, with no `-pooler` in the host) or is missing `?sslmode=require` |
| Notifications only update every 30 s | `DATABASE_URL_UNPOOLED` is missing on the web project, so the live listener can't connect. The 30 s polling fallback still works |
| QR upload fails with a 500 | `STORAGE_DRIVER` isn't `vercel-blob`, or the Blob store isn't connected to `coinflow-web`, or it was created as public |
| "That photo is over 4 MB" | The photo is still over 4 MB after shrinking (rare), or the browser couldn't shrink it (for example HEIC). Take a screenshot of it instead |
| `/health` shows `stt:false` or `tts:false` | `STT_PROVIDER`/`TTS_PROVIDER` aren't `groq`, or `LLM_API_KEY` is missing |
| The build fails at "installing dependencies" | Check the build log for the pnpm version. If it isn't 12.x, add the environment variable `ENABLE_EXPERIMENTAL_COREPACK=1` to the project so the `packageManager` pin is used |
| The cron never runs | Crons only run on the **production** deployment. Check **Settings → Cron Jobs** and that `COACH_MODE=cron` and `CRON_SECRET` are set |
