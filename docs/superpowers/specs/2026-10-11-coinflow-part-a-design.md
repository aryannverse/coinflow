# Coinflow — Product Architecture & Part A Design Spec

- **Date:** 2026-10-11
- **Status:** Draft for review
- **Scope of this spec:** the overall architecture (shared by all parts) and the full design of **Part A: Foundation + Personal Finance**. Parts B and C are outlined only; each gets its own spec → plan → build cycle.
- **Source documents:** `docs/specs/CLARIFY SRS.pdf`, `docs/specs/CLARIFY HLD.pdf` (the product was called "ClarifyFinance" there; it is now **Coinflow**).

---

## 1. Intent

Coinflow is a **personal spending manager first** and a **Splitwise-style bill/event splitter second**. It is built for a Human-Computer Interaction (HCI) design class, so interaction quality, explainability, and accessibility are graded deliverables alongside working software.

**What the user said**
- Rebuild from scratch; the previous Antigravity-built project is discarded entirely (no archive).
- Real, live backend + database + Clerk authentication.
- A stunning, modern Mint-Bento UI with Lenis + GSAP smooth scrolling, many micro-animations, and components sourced from the **Magic UI** and **React Bits** MCPs.
- Agentic features via LangGraph / Deep Agents; LLM supplied through a CLI proxy (format unknown → provider-agnostic config).
- Open-source / free tooling everywhere (Whisper-family STT, free TTS).
- A **website first** (desktop + mobile browsers); installable PWA behavior is optional.
- India-focused: **INR** with lakh formatting; settle-up via **UPI QR** shown in-app (no in-app payments); payer marks paid, recipient confirms via notification.
- Group members can be **placeholders** that are later claimed via an invite link.
- Runs locally via docker-compose. **Deployment (free tiers) and the GitHub repo are deferred**: the user will create the repo later, and Part A targets local only.

**Deliberate departures from the SRS/HLD**
| SRS/HLD says | Coinflow does | Why |
|---|---|---|
| Group-first personas & tasks | Personal finance is the home and default; groups are a secondary area | User's stated priority |
| Local-only data, embedded DB, no hosted services | Postgres (local in Docker, Neon when deployed) + Clerk hosted auth | User wants a live, demoable site; constraint interpreted as "free / open-source", not "offline" |
| Social settlement "direct payment links" | UPI QR displayed from the payee's profile + mark-paid/confirm handshake | User does not want payments through the site |

**HCI requirements kept from the SRS (apply to every part)**
- AI outputs are always **staged** for explicit user approval before touching the ledger.
- Every ledger modification offers a **10-second, non-destructive Undo**.
- Visible system status within **100 ms** of any input.
- Primary targets ≥ **48×48 px**; WCAG 2.1 **AA** contrast (≥ 4.5:1); status never conveyed by color alone.
- **Non-punitive** budget visuals (neutral bands, no alarm red).

---

## 2. Product decomposition

| Part | Contents | Depends on |
|---|---|---|
| **A. Foundation + Personal Finance** (this spec) | Repo cleanup, monorepo scaffold, design system & motion language, landing page, Clerk auth, onboarding, home bento, quick add, activity with undo, insights & soft budgets, recurring & income, balance check-ins, Safe-to-Spend, settings, local docker-compose environment, local quality-gate script | — |
| **B. Groups & Events** | Groups/events, placeholder members + invite-link claiming, group expenses (equal/exact/shares/itemized), tap-to-claim receipt canvas with proportional tax/tip, min-cash-flow debt simplification with plain-language "why" proofs, interactive settlement graph, UPI QR settle-up with mark-paid → confirm/reject, polite reminder drafts, in-app notifications (SSE), personal-share ledger segregation, receivables feeding Safe-to-Spend | A |
| **C. AI Layer** | Python FastAPI service; LangGraph agent (+ Deep Agents for multi-step planning) for conversational logging, finance Q&A & insights, trip/event planning, and a proactive coach; faster-whisper STT; PaddleOCR receipt parsing; Kokoro TTS; staging-chip UI; "Ask Coinflow" pill upgraded from command palette to agent | A (B for group tools) |

Build order: **A → B → C**.

---

## 3. Overall architecture

```
Browser (desktop + mobile web)
  │  Clerk session cookie / JWT
  ▼
apps/web — Next.js (latest stable, App Router), TypeScript, pnpm
  ├─ UI: Tailwind CSS v4, shadcn/ui + Radix (accessible primitives),
  │      Magic UI + React Bits (effects & showcase components, via MCP),
  │      GSAP (+ScrollTrigger) + Lenis, Motion, anime.js (small SVG motion), Recharts
  ├─ lib/services/*  ← single domain/service layer (all money rules live here)
  │     ├─ used directly by Server Components (reads)
  │     └─ wrapped by /api/v1/* route handlers (zod-validated, Clerk-authenticated)
  ├─ /api/webhooks/clerk  (svix-verified user sync)
  └─ Drizzle ORM ──► PostgreSQL 16
                          ▲
apps/agent — Python FastAPI (Part C)
  ├─ LangGraph agent; tools call /api/v1/* with the user's Clerk token
  │   (every write produces a DRAFT; never a direct confirmed write)
  ├─ STT faster-whisper · OCR PaddleOCR · TTS Kokoro · scheduled coach (APScheduler)
  └─ LLM: provider-agnostic env config (LLM_PROVIDER, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL), Ollama fallback
```

**Principles**
1. **One home for money rules.** The service layer is the only code that writes financial data. The UI and the agent are both clients of it.
2. **Staging is data, not UI.** `status = draft` exists in the schema; confirming is an explicit state transition.
3. **Every mutation is reversible.** Mutations write `audit_log` rows; Undo replays `before`.
4. **Money is integer paise** (`bigint`) end-to-end; formatting happens only at the edge.

### 3.1 Repository layout (after cleanup)

```
/
├─ apps/
│  ├─ web/                    Next.js app (Part A)
│  └─ agent/                  FastAPI service (Part C; not created in Part A)
├─ docs/
│  ├─ specs/                  SRS/HLD PDFs (kept)
│  ├─ superpowers/specs|plans/
│  └─ hci/                    HCI rationale write-ups (deliverable)
├─ docker-compose.yml         postgres (+ web; + agent in Part C)
├─ pnpm-workspace.yaml, package.json (workspace root)
├─ .env.example
└─ kept tooling: .agent/ .agents/ .gemini/ .gsd/souls/ agentic-skills/ design-skills/ scripts/
   GSD-STYLE.md PROJECT_RULES.md model_capabilities.yaml skills-lock.json VERSION
```

### 3.2 Cleanup (first plan task)

No archive is kept; the old project is not recoverable afterwards (confirmed by user).

- **Delete:** `src/`, `drizzle/`, `.next/`, `node_modules/`, `package.json`, `package-lock.json`, `next.config.ts`, `next-env.d.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `tsconfig.tsbuildinfo`, `drizzle.config.ts`, `docker-compose.yml`, `.env.local`, `.env.example`.
- **Delete GSD planning:** `.gsd/DECISIONS.md`, `JOURNAL.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `SPEC.md`, `STATE.md`, `TODO.md`, `.gsd/phases/`, `.gsd/examples/`.
- **Keep:** `.gsd/souls/` (subagent personas) and the other `.gsd/` framework folders (`adapters/`, `docs/`, `templates/`), plus everything listed as kept in §3.1.
- **Do not touch** the user's unrelated pending changes (e.g. `.agent/workflows/*.bak`).

---

## 4. Part A — functional design

### 4.1 Routes & information architecture

| Route | Purpose | Auth |
|---|---|---|
| `/` | Marketing landing page | public |
| `/sign-in`, `/sign-up` | Clerk components, themed to Mint Bento | public |
| `/onboarding` | Stepper (resumable) | signed in |
| `/home` | Personal bento dashboard | signed in |
| `/activity` | Transactions list, search, filters, edit | signed in |
| `/insights` | Charts, month comparison, soft budgets | signed in |
| `/recurring` | Bills & income schedule | signed in |
| `/profile` | Profile, UPI details, preferences, export | signed in |

Signed-in users hitting `/` see a "Go to dashboard" CTA rather than an automatic redirect, so the landing page stays demoable. Users with unfinished onboarding are routed to `/onboarding` from app routes (they may skip at any step).

**Shell (Hybrid "C")**
- **Desktop (≥ 1024 px):** collapsible left sidebar (Home, Activity, Insights, Recurring, Profile; Groups added in Part B), content in a 12-column bento grid, a floating **"Ask Coinflow" pill** bottom-center, and a **+ Add** primary button in the top bar.
- **Mobile (< 1024 px):** bottom tab bar (Home, Activity, Insights, Profile), the pill floating above it with a lime **+** affordance; sheets replace dialogs.
- **In Part A the pill opens a ⌘K command palette** (navigation, quick add with natural shortcuts like "250 food", search transactions, toggle theme). Part C upgrades the same pill to the agent, so the location and habit are learned now.

### 4.2 Landing page (`/`)

Sections, top to bottom:
1. **Hero:** React Bits **Dither** background in lime-on-charcoal; React Bits **Split Text** headline ("Know what's safe to spend."); Magic UI **Shimmer Button** CTA; Magic UI **Safari** frame showing a real screenshot of the dashboard, captured from the running app with demo data by `pnpm shot:landing`.
2. **"Money flow" pinned section (GSAP ScrollTrigger):** Magic UI **Animated Beam** lines connecting Income → Bills → Safe-to-Spend tiles as the user scrolls; numbers animate with Magic UI **Number Ticker**.
3. **Feature bento:** React Bits **Magic Bento** / **Spotlight Card** tiles for Safe-to-Spend, Quick add, Undo, Insights, plus "Coming next: Groups & AI" teasers.
4. **How it feels:** Magic UI **Marquee** of example quick-add phrases; React Bits **Scroll Reveal** for the principles copy ("No guilt. No red alerts.").
5. **Footer CTA** with Magic UI **Interactive Hover Button**.

Lenis smooth scrolling is enabled on the landing page and long app lists.

### 4.3 Authentication (Clerk)

- `@clerk/nextjs` middleware protects app routes; Clerk `<SignIn/>`/`<SignUp/>` themed via the Clerk appearance API with the Mint Bento tokens.
- Providers: Google + email (code).
- **User sync:** (a) `POST /api/webhooks/clerk` with svix signature verification for `user.created/updated/deleted`; (b) a **lazy upsert** on the first authenticated request (`ensureUser()`), so local development works without a public webhook tunnel.

### 4.4 Onboarding (`/onboarding`)

A React Bits **Stepper** with progress saved after each step (`users.onboarding_step`); each step has **Skip** and **Back**.
1. **Welcome:** name and avatar (prefilled from Clerk).
2. **Income & payday:** monthly income (optional) and payday day-of-month (1–31; default 1).
3. **Balance check-in:** "Roughly how much is in your account right now?" with a big numeric input.
4. **Recurring bills:** suggestion chips (Rent, Electricity, Mobile recharge, Wi-Fi, Netflix, Spotify, Gym, EMI) that open a prefilled mini-form; or "Add custom".
5. **Fixed living costs:** an optional monthly estimate (groceries, commute) with a helper explaining why it matters.
6. **UPI details:** UPI ID and optional QR image upload (stored for Part B; validated as an image ≤ 2 MB; the UPI ID is format-checked `name@bank`).
7. **Done:** reveal of the first Safe-to-Spend number (Number Ticker + Magic UI **Confetti**, once).

**QR storage:** saved behind a `storage` interface. In Part A it writes to a local `uploads/` directory (a Docker volume when containerized) served by an authenticated route; a hosted blob provider can be added behind the same interface when deployment happens.

### 4.5 Home bento (`/home`)

| Tile | Content | Empty state |
|---|---|---|
| **Safe-to-Spend (hero, lime)** | Amount (Number Ticker), "≈ ₹X/day for N days", a dot strip of the pay cycle (past days filled, future hollow) | "Check in your balance to see this" + button |
| Today | Total spent today, count, last item | "Nothing yet today" |
| Upcoming bills | Next 3 recurring bills within the cycle, with due dates | "No bills scheduled" → link to Recurring |
| Top category (this cycle) | Category, amount, share bar | hidden until 3+ expenses |
| Recent activity | Last 5 transactions (Magic UI **Animated List**) | "Add your first expense" CTA |
| Pending confirmations | Recurring drafts awaiting confirmation (see §4.8) | hidden when none |

Tiles use React Bits **Spotlight Card** hover and Magic UI **Blur Fade** staggered entrance (40 ms apart). Layout: 4-column bento on desktop, 2-column on tablet, 1-column on mobile.

### 4.6 Quick add

Opened via **+ Add**, the mobile **+**, the keyboard shortcut **N**, or the palette.
1. **Amount first:** a large numeric input (React Bits **Counter** digit roll), with an on-screen keypad on mobile.
2. **Type toggle:** Expense / Income.
3. **Category chips:** recent first, then all; 48 px targets.
4. **Optional:** note, date/time (default now), method (UPI / Cash / Card / Other; remembered last-used).
5. **Save:** React Bits **Click Spark** on the button, the new row slides into Recent/Activity via Magic UI **Animated List**, and an **undo toast** appears.

Validation: amount > 0 and ≤ ₹1,00,00,000; the date is not more than 1 day in the future.

### 4.7 Activity (`/activity`)

- Grouped by day with day totals; infinite scroll (cursor pagination, 50 per page).
- Search (note/category), filters (type, category, method, date range), and the filter state is kept in the URL.
- Row tap → an edit sheet; swipe-left (mobile) or a hover action (desktop) → delete.
- Every edit/delete shows the undo toast.

### 4.8 Recurring & income (`/recurring`)

- Lists bills and income with cadence (weekly / monthly / yearly), amount, and next due date; add/edit/pause/delete.
- **Materialization:** when the user loads any app page, the server converts each recurring item with `next_due_on ≤ today` into a **draft** transaction (source `recurring`) and advances `next_due_on`. Drafts appear in the Home "Pending confirmations" tile with **Confirm** / **Edit** / **Skip**. This applies the SRS staging principle to automation and needs no cron job.
- Drafts are excluded from spending totals until confirmed, but **are** counted in Safe-to-Spend as committed outflow (they are expected money out).

### 4.9 Insights & budgets (`/insights`)

- Range selector: this cycle / last cycle / last 3 months / custom.
- Charts (built with Recharts following the `dataviz` skill): spend over time (daily bars plus a cumulative line), spending by category (horizontal bars, not a donut), and a this-cycle vs last-cycle comparison per category.
- **Soft budgets:** an optional monthly limit per category, edited with a React Bits **Elastic Slider**. Progress is shown as a neutral band with a text label ("₹3,200 of ₹5,000 · 64%"); going over shows a patterned overflow segment and "₹400 over plan". No red, no alarm icons.

### 4.10 Profile & settings (`/profile`)

Name/avatar, UPI ID + QR, payday, income, fixed-costs estimate, theme (dark/light/system via the Magic UI **Animated Theme Toggler**), reduced-motion override (on/off/system), **CSV export** of transactions, and sign out.

### 4.11 Safe-to-Spend — exact definition

Let `today` be the current date in `Asia/Kolkata`.

1. **Cycle:** `next_payday` = the next date ≥ tomorrow whose day equals `payday_day`, clamped to the month's last day (payday 31 in February → Feb 28/29). `cycle_end = next_payday − 1 day`. `cycle_start = previous payday`. `days_left = cycle_end − today + 1` (≥ 1).
2. **Current balance:** `B = latest_checkin.amount + Σ confirmed income after checkin.taken_at − Σ confirmed expense personal_share after checkin.taken_at`. No check-in → Safe-to-Spend is **unknown** (the tile shows the check-in CTA).
3. **Committed outflows:** `R` = Σ recurring bill occurrences due in `[today, cycle_end]` + Σ unconfirmed recurring drafts.
4. **Committed inflows (non-payday):** `I` = Σ recurring income occurrences due in `[today, cycle_end]`, excluding the salary paid on `next_payday` (which is outside the window by construction).
5. **Fixed costs remaining:** `F = fixed_costs_estimate × days_left / cycle_length_days` (prorated).
6. **Receivables:** `G = Σ (receivable × ω)`, which is **0 in Part A**; Part B supplies per-member reliability weights ω ∈ [0, 1].
7. **Safe-to-Spend:** `S = B − R + I − F + G`.
8. **Daily pace:** `max(S, 0) / days_left`.
9. **Display:** `S ≥ 0` → the amount. `S < 0` → "₹0 free this cycle" plus a neutral secondary line "₹X more committed than available", with no red and with a link to see what is committed.

All arithmetic is in integer paise; proration rounds down to the paise.

### 4.12 Undo (applies to all mutations)

- Every create/update/delete via the service layer writes `audit_log { before, after, action, actor }` in the **same DB transaction** as the change.
- The undo toast lasts 10 s, with a Magic UI **Animated Circular Progress** countdown and **⌘Z / Ctrl+Z**. Undo calls `POST /api/v1/undo/:auditId`, which restores `before` (or soft-deletes a create) and writes its own audit row.
- The server accepts an undo only from the same user, only for the latest audit entry on that entity, and only within **30 s** (a grace window beyond the visual 10 s for slow networks).
- Deletes are soft (`deleted_at`); a nightly hard-delete of rows soft-deleted > 30 days is **out of scope** for Part A.

---

## 5. Data model (Part A)

Postgres via Drizzle. Every table has `created_at`, `updated_at` (`timestamptz`). Amounts are `bigint` paise.

```
users
  id text PK (Clerk user id)
  name text, email text unique, avatar_url text
  upi_id text null, upi_qr_url text null
  payday_day smallint default 1 check 1..31
  monthly_income bigint null
  fixed_costs_estimate bigint default 0
  onboarding_step smallint default 0, onboarded_at timestamptz null
  theme text default 'dark'  -- dark|light|system
  reduced_motion text default 'system'  -- on|off|system

categories
  id uuid PK, user_id text null FK users (null = built-in)
  name text, emoji text, color text, kind text (expense|income), sort smallint
  unique (user_id, name, kind)

balance_checkins
  id uuid PK, user_id FK, amount bigint, taken_at timestamptz

transactions
  id uuid PK, user_id FK
  type text (expense|income)
  amount bigint check > 0
  personal_share bigint  -- = amount for personal; group share in Part B
  category_id uuid FK categories
  note text null, method text (upi|cash|card|other)
  occurred_at timestamptz
  source text (manual|recurring|voice|scan|chat)
  status text (draft|confirmed)
  recurring_item_id uuid null FK
  deleted_at timestamptz null
  index (user_id, occurred_at desc) where deleted_at is null

recurring_items
  id uuid PK, user_id FK, kind text (bill|income), name text
  amount bigint, cadence text (weekly|monthly|yearly)
  next_due_on date, anchor_day smallint (day-of-month the schedule snaps back to, so 31 → 28 → 31 never drifts)
  category_id uuid FK, active boolean default true

budgets
  id uuid PK, user_id FK, category_id FK, monthly_limit bigint
  unique (user_id, category_id)

audit_log
  id uuid PK, seq bigserial (strict ordering for latest-only undo), user_id FK, entity text, entity_id uuid
  action text (create|update|delete|restore|confirm)
  before jsonb null, after jsonb null, actor text (user|agent)
  created_at timestamptz
  index (user_id, entity, entity_id, created_at desc)
```

**Built-in categories.** Expense: Food & Dining 🍜, Groceries 🛒, Transport 🚕, Shopping 🛍️, Bills & Utilities 💡, Rent 🏠, Entertainment 🎬, Health 💊, Education 📚, Travel ✈️, Personal Care 💇, Gifts 🎁, Subscriptions 🔁, Other •. Income: Salary 💼, Allowance 🪙, Freelance 🧑‍💻, Refund ↩️, Other •.

**Data isolation.** Every service function takes `userId` from the verified Clerk session (never from the request body), and every query filters by it.

---

## 6. API (Part A)

Base `/api/v1`, JSON, Clerk-authenticated, zod-validated. The error shape is `{ error: { code, message, field? }, requestId }`.

| Method & path | Purpose |
|---|---|
| `GET /me` · `PATCH /me` | Profile & preferences (includes onboarding step) |
| `POST /me/upi-qr` | Upload a QR image (multipart) |
| `GET /categories` · `POST /categories` | List / add custom |
| `GET /transactions?cursor&type&category&method&from&to&q&status` | List |
| `POST /transactions` · `PATCH /transactions/:id` · `DELETE /transactions/:id` | Mutate (returns `auditId`) |
| `POST /transactions/:id/confirm` · `POST /transactions/:id/skip` | Resolve drafts |
| `GET /recurring` · `POST` · `PATCH /:id` · `DELETE /:id` | Recurring items |
| `POST /checkins` · `GET /checkins/latest` | Balance check-ins |
| `GET /budgets` · `PUT /budgets/:categoryId` · `DELETE /budgets/:categoryId` | Soft budgets |
| `GET /summary/safe-to-spend` | `{ amount, dailyPace, daysLeft, cycleStart, cycleEnd, breakdown:{B,R,I,F,G}, status:'ok'|'unknown' }` |
| `GET /insights?from&to` | Aggregates for charts |
| `GET /export.csv` | CSV export |
| `POST /undo/:auditId` | Undo |
| `POST /api/webhooks/clerk` | User sync (svix-verified; outside `/v1`) |

Server Components call `lib/services/*` directly; client components use these endpoints via TanStack Query (optimistic updates with rollback).

---

## 7. Design system & motion

### 7.1 Tokens (Mint Bento)

| Token | Dark (default) | Light |
|---|---|---|
| `--bg` | `#0E100F` | `#F4F6F1` |
| `--surface` / `--surface-2` | `#161917` / `#1B1F1D` | `#FFFFFF` / `#EEF1EA` |
| `--border` | `#262B28` | `#DDE2D8` |
| `--accent` | `#C8F560` (text on accent `#0F1210`) | `#4D6B0F` (text on accent `#FFFFFF`) |
| `--text` / `--muted` | `#F1F5F2` / `#9BA59F` | `#141714` / `#5A635D` |
| `--neutral-negative` | `#B9AFA4` (warm grey; paired with a "−" glyph) | `#6E6258` |
| `--danger` (destructive confirms only) | `#FF8A7A` | `#B3261E` |

All text/background pairs are verified ≥ 4.5:1 (≥ 3:1 for large numerals) in the plan's first UI task.

**Type:** Space Grotesk (headings, amounts; `font-variant-numeric: tabular-nums`), Inter (body), Geist Mono (labels). **Radii:** tiles 20–24 px, chips 12 px, buttons 14 px. **Targets:** ≥ 48 × 48 px. **Rupee formatting:** `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` → `₹1,25,000`; paise are hidden when zero.

### 7.2 Component sourcing

UI effects and showcase components come from the **Magic UI** and **React Bits** MCPs. shadcn/ui + Radix provide only accessible primitives (Dialog, Sheet, Popover, Dropdown, Tooltip, Toast base, Command). Icons come from Lucide (via the icons MCP). Before building any visual component, the implementer checks both MCPs for a fitting component and records the source in a comment header.

| Use | Component (MCP) |
|---|---|
| Landing background | Dither (React Bits) |
| Headline reveal | Split Text / Blur Text (React Bits) |
| Product frame | Safari, iPhone (Magic UI) |
| Money-flow section | Animated Beam (Magic UI) |
| Animated amounts | Number Ticker (Magic UI), Count Up / Counter (React Bits) |
| Bento tiles | Magic Bento, Spotlight Card (React Bits); Magic Card (Magic UI) |
| Entrance motion | Blur Fade (Magic UI), Animated Content / Fade Content (React Bits) |
| Lists & notifications | Animated List (Magic UI) |
| Onboarding | Stepper (React Bits) |
| Budget slider | Elastic Slider (React Bits) |
| Confirm feedback | Click Spark (React Bits) |
| Undo countdown | Animated Circular Progress (Magic UI) |
| Celebration (once) | Confetti (Magic UI) |
| CTAs | Shimmer Button, Interactive Hover Button (Magic UI) |
| Section reveals | Scroll Reveal (React Bits), Marquee (Magic UI) |
| Theme switch | Animated Theme Toggler (Magic UI) |
| Edge fade on scroll areas | Progressive Blur (Magic UI) |

### 7.3 Motion rules

- **Lenis** smooth scroll on the landing page and long lists; **GSAP ScrollTrigger** for pinned and parallax landing sections; **Motion** for component-level springs; **anime.js** for small SVG icon motion.
- Animate only `transform`, `opacity`, and `filter`; WebGL backgrounds only on the landing page and lazy-loaded.
- **Reduced motion** (OS setting or the profile override) disables Lenis, parallax, WebGL backgrounds, confetti, and cursor effects, and replaces transitions with ≤ 150 ms fades.
- Every pressable has an immediate (< 100 ms) press state (scale 0.97 + color shift); async actions show inline spinners/skeletons.

---

## 8. Error handling

- **Validation:** zod at every API boundary; field errors are rendered inline in plain language.
- **Optimistic UI:** mutations update the cache immediately; on failure they roll back and show a toast with **Retry**.
- **Offline:** a banner reads "You're offline — changes will sync when you're back"; quick adds made offline are queued in memory and retried on reconnect (lost on tab close; persistent offline storage is out of scope).
- **Auth:** an expired session triggers a silent refresh, otherwise a redirect to sign-in with `redirect_url` back to the current page.
- **Server:** structured logging (pino) with a per-request `requestId`, shown to users as "Ref: 7f3a" on unexpected errors. No stack traces are exposed.
- **Webhook:** an invalid svix signature returns 400 and is logged; webhook handling is idempotent (upsert).

---

## 9. Testing & quality gates

- **Unit (Vitest), test-first:** Safe-to-Spend (cycle boundaries, payday 29/30/31 in short months, leap years, no check-in, negative S), paise formatting/rounding, recurring materialization (multiple missed occurrences, paused items, weekly/yearly), undo rules (latest-only, 30 s window, cross-user rejection).
- **Integration:** route handlers against a real Postgres (Testcontainers) with a mocked Clerk session; data isolation tests (user A cannot read or modify user B's data).
- **E2E (Playwright, via MCP during development and in `pnpm verify`):** onboarding → quick add → undo → Safe-to-Spend updates; recurring draft confirm; budgets; theme switch. Viewports: 1440×900 and 390×844. Both themes.
- **Accessibility:** axe (a11y-axe MCP) on every route, zero serious/critical violations; keyboard-only pass on quick add and onboarding.
- **Lighthouse (chrome-devtools MCP):** Accessibility ≥ 95 on all app routes; Performance ≥ 85 on `/home`; landing page Performance ≥ 75 (WebGL allowance).
- **Reduced motion:** Playwright run with `reducedMotion: 'reduce'` asserting no Lenis instance and no WebGL canvas.
- **Local quality gate:** a single `pnpm verify` script runs lint → typecheck → unit → integration → build → E2E. A GitHub Actions workflow wrapping the same script is added when the user creates the repo (out of scope for Part A).

---

## 10. Team & execution

The plan is executed with `superpowers:subagent-driven-development`. Each task's subagent is primed with the matching soul from `.gsd/souls/`:

| Soul | Responsibility in Part A |
|---|---|
| `product_designer` | Stitch design system ("Coinflow Mint Bento") + key screen references; contrast verification; HCI rationale doc |
| `lead_developer` | Service layer, schema, API, Safe-to-Spend, undo (test-first) |
| `principal_engineer` | Architecture conformance, frontend shell, motion system, component integration |
| `devops_sre_lead` | Monorepo scaffold, docker-compose, env setup, `pnpm verify` quality-gate script |
| `qa_automation_lead` | Playwright E2E, axe, Lighthouse, reduced-motion checks |
| `security_architect` | Review of Clerk middleware, webhook verification, data isolation, upload validation |

A code review (`superpowers:requesting-code-review`) runs between tasks.

---

## 11. Environment (local only)

- **Local:** `docker compose up -d` starts Postgres 16 (port 5432, named volume); the web app runs on the host with `pnpm dev` (fast refresh), with an optional `web` compose service for a fully containerized run. `.env.example` documents `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET` (optional locally; lazy upsert covers user sync), `UPLOADS_DIR`, and `APP_URL`.
- **Clerk:** a Clerk development instance (free) works on `localhost`; the user supplies the keys.
- **Migrations:** `pnpm db:migrate` (drizzle-kit).
- **Seed:** `pnpm db:seed` creates built-in categories and an optional demo dataset for class demos.
- **Deferred:** Vercel + Neon + Clerk production deployment, hosted blob storage, and GitHub Actions CI are planned once the user creates the repo; nothing in Part A may assume a public URL.

## 12. HCI deliverable

`docs/hci/part-a-rationale.md` maps each Part A interaction to its HCI principle (Nielsen heuristics, Fitts's law, Jakob's law, recognition over recall, non-punitive feedback) with screenshots, plus the reduced-motion and accessibility evidence from §9. Written by the `product_designer` subagent at the end of Part A.

---

## 13. Out of scope for Part A

Deployment, GitHub repo & CI (deferred until the user creates the repo); groups/events, splitting, settlements, notifications, invite links (Part B); any AI, voice, OCR, TTS, agent, coach (Part C); bank sync or statement import; multi-currency; native apps; PWA install/service worker (optional later); persistent offline storage; hard-delete jobs; Storybook.

---

## 14. Part A success criteria

1. A new user can sign up, finish (or skip through) onboarding, and see a correct Safe-to-Spend number in under 2 minutes.
2. Logging an expense via quick add takes ≤ 3 interactions after opening (amount, category, save) on desktop and mobile.
3. Every mutation can be undone within 10 s, verified by E2E tests.
4. All quality gates in §9 pass via `pnpm verify`.
5. A fresh clone runs end-to-end locally with `docker compose up -d`, `pnpm install`, `pnpm db:migrate`, `pnpm dev` and the Clerk dev keys.
6. The landing page and app satisfy the motion rules in §7.3, including the reduced-motion mode.

---

## 15. Outlines for later parts

**Part B: Groups & Events.** Groups/events with emoji and cover; placeholder members claimed via a signed invite link; group expenses with split modes (equal, exact, shares, percentage, itemized); the receipt **tap-to-claim canvas** (drag member avatars onto line items; proportional tax/tip/discount per HLD §4.1 with largest-remainder rounding so totals match to the paise); **greedy min-cash-flow** simplification (≤ N−1 payments, < 50 ms for 50 members) with stored transitive "why" proofs; an interactive settlement graph (React Flow) where tapping an edge shows provenance; settle-up showing the payee's UPI QR/ID → payer **marks paid** → payee **confirms or rejects** (notification); polite reminder drafts; in-app notifications via SSE (+ optional web push); `personal_share` ledger segregation and receivables with reliability weight ω feeding Safe-to-Spend.

**Part C: AI layer.** `apps/agent` FastAPI service. A LangGraph agent with tools over `/api/v1` (create draft expense/split, query spending, explain Safe-to-Spend, create group/event plan) and Deep Agents for multi-step trip planning; multi-turn clarification; every write lands as a draft rendered as **editable staging chips** with a Border Beam; faster-whisper STT (audio in memory only, discarded after transcription; target ≤ 2.5 s for < 15 s clips); PaddleOCR receipts feeding the Part B canvas; Kokoro TTS for optional spoken replies; a proactive coach (scheduled) producing gentle nudges and weekly summaries; a provider-agnostic LLM config with Ollama fallback; run as a docker-compose service locally (hosting decided when deployment is planned).
