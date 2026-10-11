# Coinflow Part A1 — Foundation & Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the old project, scaffold the Coinflow monorepo, and build the fully tested personal-finance backend (schema, money/date logic, Safe-to-Spend, undo, and every `/api/v1` endpoint) behind Clerk auth, running locally.

**Architecture:** A pnpm workspace with one Next.js 16 app at `apps/web`. All money rules live in `src/server/services/*` (pure calculations in `src/lib/*`), which server components call directly and `/api/v1/*` route handlers wrap with Clerk auth + zod validation. Postgres 16 runs in docker-compose; integration tests use Testcontainers.

**Tech Stack:** Node 24, pnpm 12.11.2, Next.js 16.4.0 (App Router, `src/proxy.ts`), React 19.3, TypeScript 5.9.3, @clerk/nextjs 7.x, Drizzle ORM 0.45.x + drizzle-kit 0.31.x, postgres.js 3.4.x, zod 4.x, pino 10.x, Vitest 5.x, @testcontainers/postgresql 12.x, svix 2.x.

**Spec:** `docs/superpowers/specs/2026-10-11-coinflow-part-a-design.md` (read §3–§6, §8, §9, §11 before starting). Plan A2 (`2026-10-11-coinflow-a2-frontend.md`) builds the UI on top of this plan's interfaces.

## Global Constraints

- **Local only:** no GitHub repo, no CI service, no deployment; nothing may assume a public URL.
- **Versions:** Next.js `16.4.0`, React `19.3.0`, TypeScript `5.9.3` (NOT 7.x — typescript-eslint requires `<6.1`), drizzle-orm `^0.45.4`, drizzle-kit `^0.31.11`, postgres `^3.4.9`, zod `^4.6.5`, @clerk/nextjs `^7.9.14`, vitest `^5.0.3`, @testcontainers/postgresql `^12.2.0`, pino `^10.4.0`, svix `^2.8.0`.
- **Next 16:** the middleware file is `src/proxy.ts` (not `middleware.ts`); route `params` is a `Promise`.
- **Clerk 7:** `auth()` is async — always `await auth()`; `createRouteMatcher` is deprecated — protect at the resource (route/service) instead of in the proxy.
- **Money:** integer **paise** everywhere (`bigint` columns in `mode: 'number'`); valid amounts are `1 … 1_000_000_000` (₹1,00,00,000). Format only at the edge with `en-IN` INR.
- **Time:** all calendar logic in `Asia/Kolkata`; calendar dates are `YYYY-MM-DD` strings (`ISODate`); instants are `timestamptz`.
- **Identity:** `userId` comes only from the verified Clerk session — never from a request body or query.
- **API error shape:** `{ "error": { "code": string, "message": string, "field"?: string }, "requestId": string }`. Messages are plain language.
- **Undo:** every ledger mutation writes an `audit_log` row in the same DB transaction; server accepts undo for the latest entry on an entity, same user, within **30 s**.
- **Staging:** recurring items materialize as `status = 'draft'` transactions; drafts never count as spending until confirmed.
- **Commits:** every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Do not touch** the user's unrelated pending changes (e.g. `.agent/workflows/*.bak`, `.agents/`, `.gemini/`, `scripts/`).

## Review Focus

1. **Pay cycles in short months/leap years** (payday 29/30/31 in Feb, Apr, etc.) — users expect the cycle to end the day before the clamped payday, never skip a month. Pinned in Task 4 (`cycle.test.ts`).
2. **IST midnight boundary** — an expense at 00:30 IST on Oct 12 (18:00 UTC Oct 11) must count on Oct 12 in lists, insights and date filters. Pinned in Task 7 (`transactions.int.test.ts` "IST day filter") and Task 10 (`insights.int.test.ts` "groups by IST day").
3. **Concurrent page loads materializing recurring items** — two simultaneous requests must not create duplicate drafts. Pinned in Task 8 (`recurring.int.test.ts` "concurrent materialization").
4. **Guessed IDs across users** — user B using user A's transaction id, audit id, or QR file key gets 404, never data. Pinned in Task 6, Task 7 and Task 11.
5. **Spreadsheet formula injection in CSV export** — a note like `=HYPERLINK("http://x")` must be neutralized. Pinned in Task 10 (`export.int.test.ts`).

---

## File Structure (end state of A1)

```
/ (repo root)
├─ package.json                 workspace root scripts
├─ pnpm-workspace.yaml
├─ docker-compose.yml           postgres:16-alpine on host port 5436
├─ .gitignore                   (modified: node_modules, .next, uploads, test output)
└─ apps/web/
   ├─ package.json, tsconfig.json, next.config.ts, eslint.config.mjs, postcss.config.mjs   (create-next-app)
   ├─ .env.example              documented env vars
   ├─ drizzle.config.ts
   ├─ drizzle/                  generated SQL migrations + custom builtin-categories migration
   ├─ vitest.config.ts          unit tests (src/**/*.test.ts)
   ├─ vitest.int.config.ts      integration tests (src/**/*.int.test.ts) against Testcontainers
   ├─ test/
   │  ├─ empty.ts               stub for `server-only` in tests
   │  └─ int/ global-setup.ts, setup-env.ts, helpers.ts, clerk-mock.ts
   └─ src/
      ├─ proxy.ts               clerkMiddleware()
      ├─ app/
      │  ├─ sign-in/[[...sign-in]]/page.tsx, sign-up/[[...sign-up]]/page.tsx
      │  └─ api/
      │     ├─ webhooks/clerk/route.ts
      │     └─ v1/…             one folder per endpoint (Task 11)
      ├─ lib/                   pure, framework-free, shared with the client
      │  ├─ money.ts  dates.ts  cycle.ts  recurrence.ts  safe-to-spend.ts
      │  └─ schemas/ me.ts transactions.ts recurring.ts budgets.ts checkins.ts categories.ts common.ts
      └─ server/                server-only
         ├─ errors.ts  auth.ts  http.ts  logger.ts  storage.ts
         ├─ db/ schema.ts client.ts
         └─ services/ users.ts categories.ts audit.ts transactions.ts recurring.ts
                      checkins.ts safe-to-spend.ts budgets.ts insights.ts export.ts demo-seed.ts
```

Responsibilities: `lib/*` = pure functions + zod schemas (no DB, no Next imports, safe for client bundles). `server/services/*` = the only code that reads/writes financial data; each function takes `userId` first. `app/api/*` = thin adapters: auth → parse → service → JSON.

---

### Task 1: Clean the old project and scaffold the workspace

**Files:**
- Delete: `src/`, `drizzle/`, `.next/`, `node_modules/`, `package.json`, `package-lock.json`, `next.config.ts`, `next-env.d.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `tsconfig.tsbuildinfo`, `drizzle.config.ts`, `docker-compose.yml`, `.env.local`, `.env.example`, `.gsd/DECISIONS.md`, `.gsd/JOURNAL.md`, `.gsd/REQUIREMENTS.md`, `.gsd/ROADMAP.md`, `.gsd/SPEC.md`, `.gsd/STATE.md`, `.gsd/TODO.md`, `.gsd/phases/`, `.gsd/examples/`
- Create: `package.json`, `pnpm-workspace.yaml`, `docker-compose.yml`, `apps/web/**` (via create-next-app), `apps/web/.env.example`, `apps/web/.env.local`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `pnpm dev|build|verify|db:*` root scripts delegating to `apps/web`; Postgres reachable at `postgres://coinflow:coinflow@localhost:5436/coinflow`.

- [ ] **Step 1: Delete the old project files**

Run from the repo root:
```bash
rm -rf src drizzle .next node_modules package.json package-lock.json next.config.ts next-env.d.ts \
  tailwind.config.ts postcss.config.mjs tsconfig.json tsconfig.tsbuildinfo drizzle.config.ts \
  docker-compose.yml .env.local .env.example
rm -rf .gsd/DECISIONS.md .gsd/JOURNAL.md .gsd/REQUIREMENTS.md .gsd/ROADMAP.md .gsd/SPEC.md \
  .gsd/STATE.md .gsd/TODO.md .gsd/phases .gsd/examples
ls .gsd   # expect: adapters docs souls templates
```

- [ ] **Step 2: Install pnpm**

```bash
npm install -g pnpm@12.11.2
pnpm --version   # expect 12.11.2
```

- [ ] **Step 3: Create the workspace root files**

`package.json`:
```json
{
  "name": "coinflow",
  "private": true,
  "packageManager": "pnpm@12.11.2",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "pnpm --filter web dev",
    "build": "pnpm --filter web build",
    "verify": "pnpm --filter web verify",
    "db:up": "docker compose up -d --wait",
    "db:generate": "pnpm --filter web db:generate",
    "db:migrate": "pnpm --filter web db:migrate",
    "db:seed:demo": "pnpm --filter web db:seed:demo"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - apps/*
```

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: coinflow-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: coinflow
      POSTGRES_PASSWORD: coinflow
      POSTGRES_DB: coinflow
    ports:
      - "5436:5432"
    volumes:
      - coinflow_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U coinflow -d coinflow"]
      interval: 3s
      timeout: 3s
      retries: 20

volumes:
  coinflow_pgdata:
```

Append to the root `.gitignore` (keep existing lines):
```gitignore
# Coinflow
node_modules/
.next/
apps/web/uploads/
apps/web/test-results/
apps/web/playwright-report/
apps/web/.env.local
```
(`.superpowers/` is already ignored.)

- [ ] **Step 4: Scaffold the Next.js app**

```bash
pnpm create next-app@16.4.0 apps/web --ts --eslint --tailwind --app --src-dir \
  --import-alias "@/*" --use-pnpm --disable-git --yes
```
If any flag is rejected by the CLI, drop that flag and answer its prompt with: TypeScript **Yes**, ESLint **Yes**, Tailwind **Yes**, `src/` **Yes**, App Router **Yes**, Turbopack **Yes**, import alias `@/*`, React Compiler **No**.

Then pin TypeScript and set the package name:
```bash
cd apps/web
pnpm pkg set name=web
pnpm add -D typescript@5.9.3
cd ../..
```

- [ ] **Step 5: Add env files**

`apps/web/.env.example`:
```bash
# Postgres (docker compose, host port 5436)
DATABASE_URL=postgres://coinflow:coinflow@localhost:5436/coinflow

# Clerk — written into .env.local by `npx clerk init` (Task 2). Never commit real values.
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
# Optional locally: users are also synced lazily on first request
CLERK_WEBHOOK_SIGNING_SECRET=

# Local file storage for UPI QR uploads
UPLOADS_DIR=./uploads

APP_URL=http://localhost:3000
LOG_LEVEL=info
```

```bash
cp apps/web/.env.example apps/web/.env.local
grep -q '^!.env.example' apps/web/.gitignore || printf '\n!.env.example\n' >> apps/web/.gitignore
git check-ignore apps/web/.env.example || echo "ok: .env.example is tracked"
git check-ignore apps/web/.env.local   # expect: prints the path (ignored)
```

- [ ] **Step 6: Verify the scaffold builds and Postgres is healthy**

```bash
pnpm install
pnpm db:up            # expect: container coinflow-postgres Healthy
pnpm build            # expect: Next.js build completes with no errors
```

- [ ] **Step 7: Commit**

```bash
# Stage deletions of previously tracked files (ignores paths that were never tracked)
git rm -r -q --cached --ignore-unmatch src drizzle next.config.ts next-env.d.ts tailwind.config.ts \
  postcss.config.mjs tsconfig.json tsconfig.tsbuildinfo drizzle.config.ts package-lock.json .env.example \
  .gsd/DECISIONS.md .gsd/JOURNAL.md .gsd/REQUIREMENTS.md .gsd/ROADMAP.md .gsd/SPEC.md .gsd/STATE.md \
  .gsd/TODO.md .gsd/phases .gsd/examples
# Stage the new workspace
git add package.json pnpm-workspace.yaml pnpm-lock.yaml docker-compose.yml .gitignore apps/web
git status --short | grep -v '^??'   # sanity: only the paths above are staged (A/M/D)
git commit -m "chore: replace old project with Coinflow pnpm workspace and Next.js 16 app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(`.env.local` stays ignored. Do not stage the user's unrelated pending changes.)

---

### Task 2: Clerk authentication wiring

**Files:**
- Create/overwrite: `apps/web/src/proxy.ts`, `apps/web/src/app/sign-in/[[...sign-in]]/page.tsx`, `apps/web/src/app/sign-up/[[...sign-up]]/page.tsx`, `apps/web/src/server/errors.ts`, `apps/web/src/server/auth.ts`, `apps/web/vitest.config.ts`, `apps/web/test/empty.ts`
- Modify: `apps/web/src/app/layout.tsx`, `apps/web/package.json` (scripts)
- Test: `apps/web/src/server/auth.test.ts`

**Interfaces:**
- Produces:
  - `class AppError extends Error { code: string; status: number; field?: string }` with `constructor(code: string, message: string, status = 400, field?: string)`
  - `notFound(what: string): AppError` (404, code `not_found`), `invalid(field: string, message: string): AppError` (422, code `invalid`), `conflict(code: string, message: string): AppError` (409)
  - `requireUserId(): Promise<string>` — throws `AppError('unauthorized', …, 401)` when signed out.

- [ ] **Step 1: [USER CHECKPOINT] Link the user's Clerk application**

Stop and ask the user to run these in `apps/web` (they open a browser login; keys never pass through chat):
```bash
cd apps/web
npx -y clerk@latest auth login
npx -y clerk@latest apps list --json      # user picks the "Coinflow" application id
npx -y clerk@latest init --app <application_id>
npx -y clerk@latest doctor
```
If the user has not created an application, `npx -y clerk@latest init` (no `--app`) provisions a claimable dev app instead. Afterwards confirm `apps/web/.env.local` still contains `DATABASE_URL` and now contains `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` — check with `grep -c '^CLERK_SECRET_KEY=sk_' apps/web/.env.local` (expect `1`) without printing values. If `DATABASE_URL` was removed, re-append it from `.env.example`.

- [ ] **Step 2: Normalize the files `clerk init` generated**

`apps/web/src/proxy.ts` (overwrite whatever init produced; delete any root-level `apps/web/proxy.ts` or `middleware.ts` it created):
```ts
import { clerkMiddleware } from '@clerk/nextjs/server'

// Auth is enforced at each resource (route handlers / server components), not here.
export default clerkMiddleware()

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
}
```

`apps/web/src/app/layout.tsx` — keep create-next-app's font setup; ensure `ClerkProvider` sits **inside** `<body>` with these props (Plan A2 replaces this file entirely):
```tsx
import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = { title: 'Coinflow', description: 'Know what’s safe to spend.' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/home"
          signUpFallbackRedirectUrl="/onboarding"
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  )
}
```

`apps/web/src/app/sign-in/[[...sign-in]]/page.tsx`:
```tsx
import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <SignIn />
    </main>
  )
}
```

`apps/web/src/app/sign-up/[[...sign-up]]/page.tsx`:
```tsx
import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <SignUp />
    </main>
  )
}
```

- [ ] **Step 3: Set up Vitest (unit)**

```bash
cd apps/web && pnpm add server-only && pnpm add -D vitest@^5.0.3 && cd ../..
```

`apps/web/test/empty.ts`:
```ts
export {}
```

`apps/web/vitest.config.ts`:
```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@test': fileURLToPath(new URL('./test', import.meta.url)),
      'server-only': fileURLToPath(new URL('./test/empty.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.int.test.ts', 'node_modules/**'],
  },
})
```

Add scripts to `apps/web/package.json`:
```bash
cd apps/web
pnpm pkg set scripts.test="vitest run"
pnpm pkg set scripts.typecheck="tsc --noEmit"
cd ../..
```

- [ ] **Step 4: Write the failing test**

`apps/web/src/server/auth.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock(), currentUser: vi.fn() }))

import { AppError } from './errors'
import { requireUserId } from './auth'

describe('requireUserId', () => {
  beforeEach(() => authMock.mockReset())

  it('returns the Clerk user id when signed in', async () => {
    authMock.mockResolvedValue({ userId: 'user_123' })
    await expect(requireUserId()).resolves.toBe('user_123')
  })

  it('throws a 401 AppError when signed out', async () => {
    authMock.mockResolvedValue({ userId: null })
    const err = await requireUserId().catch((e) => e)
    expect(err).toBeInstanceOf(AppError)
    expect(err).toMatchObject({ code: 'unauthorized', status: 401 })
  })
})
```

- [ ] **Step 5: Run it to verify it fails**

Run: `pnpm --filter web test -- src/server/auth.test.ts`
Expected: FAIL — cannot resolve `./errors` / `./auth`.

- [ ] **Step 6: Implement errors and auth**

`apps/web/src/server/errors.ts`:
```ts
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly field?: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFound = (what: string) => new AppError('not_found', `We couldn’t find that ${what}.`, 404)
export const invalid = (field: string, message: string) => new AppError('invalid', message, 422, field)
export const conflict = (code: string, message: string) => new AppError(code, message, 409)
```

`apps/web/src/server/auth.ts`:
```ts
import 'server-only'
import { auth } from '@clerk/nextjs/server'
import { AppError } from './errors'

export async function requireUserId(): Promise<string> {
  const { userId } = await auth()
  if (!userId) throw new AppError('unauthorized', 'Please sign in to continue.', 401)
  return userId
}
```

- [ ] **Step 7: Run tests and a manual auth check**

Run: `pnpm --filter web test -- src/server/auth.test.ts` → Expected: PASS (2 tests).
Run: `pnpm dev`, open `http://localhost:3000/sign-in` → the Clerk sign-in card renders. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src apps/web/vitest.config.ts apps/web/test apps/web/package.json pnpm-lock.yaml
git commit -m "feat(auth): wire Clerk 7 with proxy.ts, auth pages and requireUserId

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Database schema, migrations, built-in categories, integration-test harness

**Files:**
- Create: `apps/web/src/server/db/schema.ts`, `apps/web/src/server/db/client.ts`, `apps/web/drizzle.config.ts`, `apps/web/drizzle/*` (generated), `apps/web/vitest.int.config.ts`, `apps/web/test/int/global-setup.ts`, `apps/web/test/int/setup-env.ts`, `apps/web/test/int/helpers.ts`
- Test: `apps/web/src/server/db/schema.int.test.ts`

**Interfaces:**
- Produces:
  - Tables: `users`, `categories`, `balanceCheckins`, `recurringItems`, `transactions`, `budgets`, `auditLog` (exact columns below); inferred types `User`, `Category`, `Transaction`, `RecurringItem`, `Budget`, `BalanceCheckin`, `AuditRow`.
  - `getDb(): Db`; `type Db`; `type Tx` (transaction handle with the same query API).
  - Test helpers: `resetDb(): Promise<void>`, `makeUser(id?: string, overrides?: Partial<NewUser>): Promise<User>`, `builtinCategory(name: string, kind?: 'expense' | 'income'): Promise<Category>`.

- [ ] **Step 1: Install DB dependencies**

```bash
cd apps/web
pnpm add drizzle-orm@^0.45.4 postgres@^3.4.9
pnpm add -D drizzle-kit@^0.31.11 @testcontainers/postgresql@^12.2.0 @next/env@16.4.0 tsx
cd ../..
```

- [ ] **Step 2: Write the schema**

`apps/web/src/server/db/schema.ts`:
```ts
import { sql } from 'drizzle-orm'
import {
  bigint, bigserial, boolean, check, date, index, jsonb, pgTable, smallint, text, timestamp, unique, uuid,
} from 'drizzle-orm/pg-core'

const money = (name: string) => bigint(name, { mode: 'number' })
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(), // Clerk user id
    name: text('name').notNull().default(''),
    email: text('email').notNull().unique(),
    avatarUrl: text('avatar_url'),
    upiId: text('upi_id'),
    upiQrUrl: text('upi_qr_url'),
    paydayDay: smallint('payday_day').notNull().default(1),
    monthlyIncome: money('monthly_income'),
    fixedCostsEstimate: money('fixed_costs_estimate').notNull().default(0),
    onboardingStep: smallint('onboarding_step').notNull().default(0),
    onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
    theme: text('theme', { enum: ['dark', 'light', 'system'] }).notNull().default('dark'),
    reducedMotion: text('reduced_motion', { enum: ['on', 'off', 'system'] }).notNull().default('system'),
    ...timestamps,
  },
  (t) => [check('users_payday_day_range', sql`${t.paydayDay} between 1 and 31`)],
)

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }), // null = built-in
    name: text('name').notNull(),
    emoji: text('emoji').notNull(),
    color: text('color').notNull(),
    kind: text('kind', { enum: ['expense', 'income'] }).notNull(),
    sort: smallint('sort').notNull().default(100),
    ...timestamps,
  },
  (t) => [unique('categories_owner_name_kind').on(t.userId, t.name, t.kind).nullsNotDistinct()],
)

export const balanceCheckins = pgTable(
  'balance_checkins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    amount: money('amount').notNull(),
    takenAt: timestamp('taken_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index('balance_checkins_user_time').on(t.userId, t.takenAt.desc())],
)

export const recurringItems = pgTable(
  'recurring_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['bill', 'income'] }).notNull(),
    name: text('name').notNull(),
    amount: money('amount').notNull(),
    cadence: text('cadence', { enum: ['weekly', 'monthly', 'yearly'] }).notNull(),
    nextDueOn: date('next_due_on', { mode: 'string' }).notNull(),
    anchorDay: smallint('anchor_day').notNull(), // day-of-month the schedule snaps back to (prevents 31→28→28 drift)
    categoryId: uuid('category_id').notNull().references(() => categories.id),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    check('recurring_amount_positive', sql`${t.amount} > 0`),
    check('recurring_anchor_range', sql`${t.anchorDay} between 1 and 31`),
  ],
)

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['expense', 'income'] }).notNull(),
    amount: money('amount').notNull(),
    personalShare: money('personal_share').notNull(),
    categoryId: uuid('category_id').notNull().references(() => categories.id),
    note: text('note'),
    method: text('method', { enum: ['upi', 'cash', 'card', 'other'] }).notNull().default('upi'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    source: text('source', { enum: ['manual', 'recurring', 'voice', 'scan', 'chat'] }).notNull().default('manual'),
    status: text('status', { enum: ['draft', 'confirmed'] }).notNull().default('confirmed'),
    recurringItemId: uuid('recurring_item_id').references(() => recurringItems.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('transactions_amount_positive', sql`${t.amount} > 0`),
    check('transactions_share_range', sql`${t.personalShare} >= 0 and ${t.personalShare} <= ${t.amount}`),
    index('transactions_user_time').on(t.userId, t.occurredAt.desc()).where(sql`${t.deletedAt} is null`),
  ],
)

export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
    monthlyLimit: money('monthly_limit').notNull(),
    ...timestamps,
  },
  (t) => [
    unique('budgets_user_category').on(t.userId, t.categoryId),
    check('budgets_limit_positive', sql`${t.monthlyLimit} > 0`),
  ],
)

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seq: bigserial('seq', { mode: 'number' }).notNull(), // strict ordering; createdAt can tie
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    entity: text('entity', { enum: ['transaction', 'recurring_item', 'budget', 'balance_checkin'] }).notNull(),
    entityId: uuid('entity_id').notNull(),
    action: text('action', { enum: ['create', 'update', 'delete', 'restore', 'confirm'] }).notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    actor: text('actor', { enum: ['user', 'agent'] }).notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_entity').on(t.userId, t.entity, t.entityId, t.seq.desc())],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Category = typeof categories.$inferSelect
export type BalanceCheckin = typeof balanceCheckins.$inferSelect
export type RecurringItem = typeof recurringItems.$inferSelect
export type Transaction = typeof transactions.$inferSelect
export type Budget = typeof budgets.$inferSelect
export type AuditRow = typeof auditLog.$inferSelect
```

- [ ] **Step 3: Write the DB client and drizzle config**

`apps/web/src/server/db/client.ts`:
```ts
import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

function create() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return drizzle(postgres(url, { max: 10 }), { schema })
}

export type Db = ReturnType<typeof create>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const globalForDb = globalThis as unknown as { __coinflowDb?: Db }

/** One pool per process (survives Next dev hot reloads). */
export function getDb(): Db {
  globalForDb.__coinflowDb ??= create()
  return globalForDb.__coinflowDb
}
```

`apps/web/drizzle.config.ts`:
```ts
import { loadEnvConfig } from '@next/env'
import { defineConfig } from 'drizzle-kit'

loadEnvConfig(process.cwd())

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
})
```

Scripts:
```bash
cd apps/web
pnpm pkg set scripts.db:generate="drizzle-kit generate"
pnpm pkg set scripts.db:migrate="drizzle-kit migrate"
pnpm pkg set scripts.test:int="vitest run --config vitest.int.config.ts"
cd ../..
```

- [ ] **Step 4: Generate migrations, including the built-in categories migration**

```bash
cd apps/web
pnpm db:generate --name init
pnpm db:generate --custom --name builtin_categories
cd ../..
```
Fill the generated empty file `apps/web/drizzle/0001_builtin_categories.sql` with:
```sql
INSERT INTO categories (user_id, name, emoji, color, kind, sort) VALUES
  (NULL, 'Food & Dining',     '🍜', '#C8F560', 'expense', 10),
  (NULL, 'Groceries',         '🛒', '#8FD694', 'expense', 20),
  (NULL, 'Transport',         '🚕', '#F5D76E', 'expense', 30),
  (NULL, 'Shopping',          '🛍️', '#F2A2C0', 'expense', 40),
  (NULL, 'Bills & Utilities', '💡', '#7FC8F8', 'expense', 50),
  (NULL, 'Rent',              '🏠', '#B79CED', 'expense', 60),
  (NULL, 'Entertainment',     '🎬', '#FF9F80', 'expense', 70),
  (NULL, 'Health',            '💊', '#6EE7B7', 'expense', 80),
  (NULL, 'Education',         '📚', '#93C5FD', 'expense', 90),
  (NULL, 'Travel',            '✈️', '#FCD34D', 'expense', 100),
  (NULL, 'Personal Care',     '💇', '#F9A8D4', 'expense', 110),
  (NULL, 'Gifts',             '🎁', '#FDBA74', 'expense', 120),
  (NULL, 'Subscriptions',     '🔁', '#A5B4FC', 'expense', 130),
  (NULL, 'Other',             '•',  '#9BA59F', 'expense', 999),
  (NULL, 'Salary',            '💼', '#C8F560', 'income', 10),
  (NULL, 'Allowance',         '🪙', '#F5D76E', 'income', 20),
  (NULL, 'Freelance',         '🧑‍💻', '#7FC8F8', 'income', 30),
  (NULL, 'Refund',            '↩️', '#8FD694', 'income', 40),
  (NULL, 'Other',             '•',  '#9BA59F', 'income', 999)
ON CONFLICT ON CONSTRAINT categories_owner_name_kind DO NOTHING;
```
(The generated file name may have a different numeric prefix — fill whichever file drizzle-kit created for `builtin_categories`.)

Apply to the dev database:
```bash
pnpm db:migrate   # expect: migrations applied successfully
```

- [ ] **Step 5: Write the integration-test harness**

`apps/web/test/int/global-setup.ts`:
```ts
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}

export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start()
  const url = container.getConnectionUri()
  const client = postgres(url, { max: 1 })
  await migrate(drizzle(client), { migrationsFolder: 'drizzle' })
  await client.end()
  project.provide('databaseUrl', url)
  return async () => {
    await container.stop()
  }
}
```

`apps/web/test/int/setup-env.ts`:
```ts
import { inject } from 'vitest'

process.env.DATABASE_URL = inject('databaseUrl')
process.env.UPLOADS_DIR = process.env.UPLOADS_DIR ?? './test-results/uploads'
```

`apps/web/test/int/helpers.ts`:
```ts
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { getDb } from '@/server/db/client'
import { categories, users, type Category, type NewUser, type User } from '@/server/db/schema'

export async function resetDb(): Promise<void> {
  const db = getDb()
  await db.execute(sql`delete from audit_log`)
  await db.execute(sql`delete from budgets`)
  await db.execute(sql`delete from transactions`)
  await db.execute(sql`delete from recurring_items`)
  await db.execute(sql`delete from balance_checkins`)
  await db.delete(categories).where(isNotNull(categories.userId))
  await db.execute(sql`delete from users`)
}

export async function makeUser(id = 'user_a', overrides: Partial<NewUser> = {}): Promise<User> {
  const [user] = await getDb()
    .insert(users)
    .values({ id, email: `${id}@example.com`, name: id, ...overrides })
    .returning()
  return user
}

export async function builtinCategory(name: string, kind: 'expense' | 'income' = 'expense'): Promise<Category> {
  const [cat] = await getDb()
    .select()
    .from(categories)
    .where(and(isNull(categories.userId), eq(categories.name, name), eq(categories.kind, kind)))
  if (!cat) throw new Error(`No built-in category ${name}/${kind}`)
  return cat
}
```

`apps/web/vitest.int.config.ts`:
```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@test': fileURLToPath(new URL('./test', import.meta.url)),
      'server-only': fileURLToPath(new URL('./test/empty.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.int.test.ts'],
    globalSetup: ['test/int/global-setup.ts'],
    setupFiles: ['test/int/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
})
```

- [ ] **Step 6: Write the failing schema test**

`apps/web/src/server/db/schema.int.test.ts`:
```ts
import { isNull } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { getDb } from './client'
import { categories, transactions } from './schema'

describe('schema', () => {
  beforeEach(resetDb)

  it('ships 19 built-in categories', async () => {
    const rows = await getDb().select().from(categories).where(isNull(categories.userId))
    expect(rows).toHaveLength(19)
  })

  it('rejects non-positive amounts', async () => {
    const user = await makeUser()
    const food = await builtinCategory('Food & Dining')
    await expect(
      getDb().insert(transactions).values({
        userId: user.id, type: 'expense', amount: 0, personalShare: 0,
        categoryId: food.id, occurredAt: new Date(),
      }),
    ).rejects.toThrow(/transactions_amount_positive/)
  })

  it('treats built-in category names as unique even with NULL owner', async () => {
    await expect(
      getDb().insert(categories).values({ userId: null, name: 'Rent', emoji: '🏠', color: '#000', kind: 'expense' }),
    ).rejects.toThrow(/categories_owner_name_kind/)
  })
})
```

- [ ] **Step 7: Run it**

Run: `pnpm --filter web test:int -- src/server/db/schema.int.test.ts`
Expected: PASS (3 tests). (Docker must be running; first run pulls `postgres:16-alpine`.) If it fails because migrations are missing, re-check Step 4.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/server/db apps/web/drizzle apps/web/drizzle.config.ts apps/web/vitest.int.config.ts \
  apps/web/test apps/web/package.json pnpm-lock.yaml
git commit -m "feat(db): add Coinflow schema, migrations with built-in categories, Testcontainers harness

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pure money, date, pay-cycle, recurrence and Safe-to-Spend logic

**Files:**
- Create: `apps/web/src/lib/money.ts`, `apps/web/src/lib/dates.ts`, `apps/web/src/lib/cycle.ts`, `apps/web/src/lib/recurrence.ts`, `apps/web/src/lib/safe-to-spend.ts`
- Test: `apps/web/src/lib/money.test.ts`, `dates.test.ts`, `cycle.test.ts`, `recurrence.test.ts`, `safe-to-spend.test.ts` (all in `src/lib/`)

**Interfaces:**
- Produces:
  - `MAX_AMOUNT_PAISE = 1_000_000_000`; `parseRupeesToPaise(input: string): number | null`; `formatINR(paise: number, opts?: { signed?: boolean }): string`; `paiseToRupeeString(paise: number): string` (e.g. `"1250.50"`, `"450"`).
  - `type ISODate = string`; `IST = 'Asia/Kolkata'`; `toISTDate(instant: Date): ISODate`; `istStartOfDay(d: ISODate): Date`; `istNoon(d: ISODate): Date`; `daysInMonth(year: number, month: number): number` (month 1–12); `clampDayInMonth(year, month, day): ISODate`; `addDays(d: ISODate, n: number): ISODate`; `diffDays(a: ISODate, b: ISODate): number` (a − b); `addMonthsAnchored(d: ISODate, months: number, anchorDay: number): ISODate`; `dayOfMonth(d: ISODate): number`.
  - `interface PayCycle { cycleStart: ISODate; cycleEnd: ISODate; nextPayday: ISODate; daysLeft: number; cycleLength: number }`; `payCycle(today: ISODate, paydayDay: number): PayCycle`.
  - `type Cadence = 'weekly' | 'monthly' | 'yearly'`; `nextOccurrence(d: ISODate, cadence: Cadence, anchorDay: number): ISODate`; `occurrencesInRange(nextDueOn: ISODate, cadence: Cadence, anchorDay: number, from: ISODate, to: ISODate): ISODate[]`.
  - `interface RecurringLike { kind: 'bill' | 'income'; amount: number; cadence: Cadence; nextDueOn: ISODate; anchorDay: number; active: boolean }`
  - `interface SafeToSpendInput { today: ISODate; paydayDay: number; fixedCostsEstimate: number; receivables: number; checkin: { amount: number } | null; confirmedIncomeSinceCheckin: number; confirmedExpenseShareSinceCheckin: number; pendingBillDrafts: number; pendingIncomeDrafts: number; recurring: RecurringLike[] }`
  - `interface SafeToSpendResult { status: 'ok' | 'unknown'; amount: number; dailyPace: number; daysLeft: number; cycleStart: ISODate; cycleEnd: ISODate; nextPayday: ISODate; breakdown: { balance: number; committedOut: number; committedIn: number; fixedRemaining: number; receivables: number } }`
  - `computeSafeToSpend(input: SafeToSpendInput): SafeToSpendResult`

- [ ] **Step 1: Write failing tests for money**

`apps/web/src/lib/money.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { formatINR, parseRupeesToPaise, paiseToRupeeString } from './money'

describe('parseRupeesToPaise', () => {
  it.each([
    ['450', 45000],
    ['450.5', 45050],
    ['1,250.50', 125050],
    ['₹ 1,25,000', 12500000],
    [' 99 ', 9900],
    ['0.01', 1],
  ])('parses %j → %d paise', (input, expected) => {
    expect(parseRupeesToPaise(input)).toBe(expected)
  })

  it.each(['', 'abc', '-50', '1.234', '1e5', '12.'])('rejects %j', (input) => {
    expect(parseRupeesToPaise(input)).toBeNull()
  })
})

describe('formatINR', () => {
  it('uses Indian grouping and hides zero paise', () => {
    expect(formatINR(12500000)).toBe('₹1,25,000')
    expect(formatINR(0)).toBe('₹0')
  })
  it('shows paise when present', () => {
    expect(formatINR(45050)).toBe('₹450.50')
  })
  it('uses a true minus sign for negatives and optional plus', () => {
    expect(formatINR(-31000)).toBe('−₹310')
    expect(formatINR(31000, { signed: true })).toBe('+₹310')
  })
})

describe('paiseToRupeeString', () => {
  it('produces plain decimal strings for inputs and CSV', () => {
    expect(paiseToRupeeString(125050)).toBe('1250.50')
    expect(paiseToRupeeString(45000)).toBe('450')
  })
})
```

- [ ] **Step 2: Write failing tests for dates, cycles and recurrence**

`apps/web/src/lib/dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { addDays, addMonthsAnchored, clampDayInMonth, diffDays, istStartOfDay, toISTDate } from './dates'

describe('dates', () => {
  it('converts instants to the IST calendar day', () => {
    // 18:30 UTC on Oct 11 is 00:00 IST on Oct 12
    expect(toISTDate(new Date('2026-10-11T18:29:59Z'))).toBe('2026-10-11')
    expect(toISTDate(new Date('2026-10-11T18:30:00Z'))).toBe('2026-10-12')
  })
  it('gives the UTC instant of IST midnight', () => {
    expect(istStartOfDay('2026-10-12').toISOString()).toBe('2026-10-11T18:30:00.000Z')
  })
  it('adds and diffs days across month/year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
    expect(diffDays('2026-11-01', '2026-10-01')).toBe(31)
  })
  it('clamps day to month length', () => {
    expect(clampDayInMonth(2026, 2, 31)).toBe('2026-02-28')
    expect(clampDayInMonth(2024, 2, 30)).toBe('2024-02-29')
  })
  it('adds months snapping back to the anchor day', () => {
    expect(addMonthsAnchored('2026-01-31', 1, 31)).toBe('2026-02-28')
    expect(addMonthsAnchored('2026-02-28', 1, 31)).toBe('2026-03-31')
    expect(addMonthsAnchored('2024-02-29', 12, 29)).toBe('2025-02-28')
  })
})
```

`apps/web/src/lib/cycle.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { payCycle } from './cycle'

describe('payCycle', () => {
  it('payday 1, mid-month', () => {
    expect(payCycle('2026-10-11', 1)).toEqual({
      cycleStart: '2026-10-01', nextPayday: '2026-11-01', cycleEnd: '2026-10-31', daysLeft: 21, cycleLength: 31,
    })
  })
  it('on payday itself, the new cycle has started', () => {
    expect(payCycle('2026-10-01', 1)).toMatchObject({ cycleStart: '2026-10-01', cycleEnd: '2026-10-31', daysLeft: 31 })
  })
  it('payday 15 before the 15th belongs to the previous cycle', () => {
    expect(payCycle('2026-01-10', 15)).toEqual({
      cycleStart: '2025-12-15', nextPayday: '2026-01-15', cycleEnd: '2026-01-14', daysLeft: 5, cycleLength: 31,
    })
  })
  it('payday 31 clamps to Feb 28 in a common year', () => {
    expect(payCycle('2026-02-15', 31)).toEqual({
      cycleStart: '2026-01-31', nextPayday: '2026-02-28', cycleEnd: '2026-02-27', daysLeft: 13, cycleLength: 28,
    })
  })
  it('payday 31 on the clamped Feb 28 starts a cycle ending Mar 30', () => {
    expect(payCycle('2026-02-28', 31)).toEqual({
      cycleStart: '2026-02-28', nextPayday: '2026-03-31', cycleEnd: '2026-03-30', daysLeft: 31, cycleLength: 31,
    })
  })
  it('payday 30 in a leap February', () => {
    expect(payCycle('2024-02-29', 30)).toEqual({
      cycleStart: '2024-02-29', nextPayday: '2024-03-30', cycleEnd: '2024-03-29', daysLeft: 30, cycleLength: 30,
    })
  })
})
```

`apps/web/src/lib/recurrence.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { nextOccurrence, occurrencesInRange } from './recurrence'

describe('recurrence', () => {
  it('weekly adds 7 days', () => {
    expect(nextOccurrence('2026-10-14', 'weekly', 14)).toBe('2026-10-21')
  })
  it('monthly keeps the anchor day after a short month', () => {
    expect(nextOccurrence('2026-01-31', 'monthly', 31)).toBe('2026-02-28')
    expect(nextOccurrence('2026-02-28', 'monthly', 31)).toBe('2026-03-31')
  })
  it('yearly handles Feb 29', () => {
    expect(nextOccurrence('2024-02-29', 'yearly', 29)).toBe('2025-02-28')
    expect(nextOccurrence('2027-02-28', 'yearly', 29)).toBe('2028-02-29')
  })
  it('lists occurrences inside an inclusive range', () => {
    expect(occurrencesInRange('2026-10-14', 'weekly', 14, '2026-10-11', '2026-10-31')).toEqual([
      '2026-10-14', '2026-10-21', '2026-10-28',
    ])
  })
  it('skips occurrences before the range start', () => {
    expect(occurrencesInRange('2026-09-20', 'monthly', 20, '2026-10-11', '2026-10-31')).toEqual(['2026-10-20'])
  })
  it('returns nothing when the first occurrence is after the range', () => {
    expect(occurrencesInRange('2026-11-05', 'monthly', 5, '2026-10-11', '2026-10-31')).toEqual([])
  })
})
```

- [ ] **Step 3: Write failing tests for Safe-to-Spend**

`apps/web/src/lib/safe-to-spend.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { computeSafeToSpend, type SafeToSpendInput } from './safe-to-spend'

const base: SafeToSpendInput = {
  today: '2026-10-11',
  paydayDay: 1,
  fixedCostsEstimate: 600_000, // ₹6,000 / cycle
  receivables: 0,
  checkin: { amount: 5_000_000 }, // ₹50,000
  confirmedIncomeSinceCheckin: 0,
  confirmedExpenseShareSinceCheckin: 124_000, // ₹1,240
  pendingBillDrafts: 0,
  pendingIncomeDrafts: 0,
  recurring: [
    { kind: 'bill', amount: 64_900, cadence: 'monthly', nextDueOn: '2026-10-20', anchorDay: 20, active: true },
    { kind: 'bill', amount: 10_000, cadence: 'weekly', nextDueOn: '2026-10-14', anchorDay: 14, active: true },
    { kind: 'bill', amount: 1_500_000, cadence: 'monthly', nextDueOn: '2026-11-05', anchorDay: 5, active: true },
    { kind: 'bill', amount: 99_900, cadence: 'monthly', nextDueOn: '2026-10-15', anchorDay: 15, active: false },
    { kind: 'income', amount: 500_000, cadence: 'monthly', nextDueOn: '2026-10-25', anchorDay: 25, active: true },
  ],
}

describe('computeSafeToSpend', () => {
  it('computes S = B − R + I − F + G for the current pay cycle', () => {
    const r = computeSafeToSpend(base)
    expect(r.breakdown).toEqual({
      balance: 4_876_000,        // 5,000,000 − 124,000
      committedOut: 94_900,      // 64,900 + 3 × 10,000 (rent is next cycle, inactive excluded)
      committedIn: 500_000,
      fixedRemaining: 406_451,   // floor(600,000 × 21 / 31)
      receivables: 0,
    })
    expect(r).toMatchObject({
      status: 'ok', amount: 4_874_649, dailyPace: 232_126, daysLeft: 21,
      cycleStart: '2026-10-01', cycleEnd: '2026-10-31', nextPayday: '2026-11-01',
    })
  })

  it('counts pending recurring drafts as committed money', () => {
    const r = computeSafeToSpend({ ...base, recurring: [], fixedCostsEstimate: 0, pendingBillDrafts: 50_000, pendingIncomeDrafts: 20_000 })
    expect(r.breakdown.committedOut).toBe(50_000)
    expect(r.breakdown.committedIn).toBe(20_000)
    expect(r.amount).toBe(4_876_000 - 50_000 + 20_000)
  })

  it('is unknown without a balance check-in', () => {
    const r = computeSafeToSpend({ ...base, checkin: null })
    expect(r).toMatchObject({ status: 'unknown', amount: 0, dailyPace: 0, daysLeft: 21 })
  })

  it('allows a negative amount but never a negative daily pace', () => {
    const r = computeSafeToSpend({ ...base, checkin: { amount: 100_000 } })
    expect(r.amount).toBeLessThan(0)
    expect(r.dailyPace).toBe(0)
  })

  it('adds receivables (Part B hook)', () => {
    expect(computeSafeToSpend({ ...base, receivables: 10_000 }).amount).toBe(4_884_649)
  })
})
```

- [ ] **Step 4: Run all lib tests to verify they fail**

Run: `pnpm --filter web test -- src/lib`
Expected: FAIL — modules not found.

- [ ] **Step 5: Implement `money.ts`**

`apps/web/src/lib/money.ts`:
```ts
export const MAX_AMOUNT_PAISE = 1_000_000_000 // ₹1,00,00,000

/** "₹1,250.50" | "1250.5" | "450" → paise. Returns null for anything that is not a non-negative amount with ≤ 2 decimals. */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const [rupees, fraction = ''] = cleaned.split('.')
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(paise) ? paise : null
}

const whole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 })
const exact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatINR(paise: number, opts: { signed?: boolean } = {}): string {
  const abs = Math.abs(paise)
  const body = (abs % 100 === 0 ? whole : exact).format(abs / 100)
  if (paise < 0) return `−${body}` // U+2212, paired with neutral colour in the UI
  if (opts.signed && paise > 0) return `+${body}`
  return body
}

export function paiseToRupeeString(paise: number): string {
  const rupees = Math.trunc(paise / 100)
  const rest = Math.abs(paise % 100)
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, '0')}`
}
```

- [ ] **Step 6: Implement `dates.ts`**

`apps/web/src/lib/dates.ts`:
```ts
export type ISODate = string // YYYY-MM-DD, a calendar day in Asia/Kolkata
export const IST = 'Asia/Kolkata'

const istDay = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' })

export function toISTDate(instant: Date): ISODate {
  return istDay.format(instant) // en-CA formats as YYYY-MM-DD
}

export function istStartOfDay(d: ISODate): Date {
  return new Date(`${d}T00:00:00+05:30`)
}

export function istNoon(d: ISODate): Date {
  return new Date(`${d}T12:00:00+05:30`)
}

function parts(d: ISODate) {
  const [y, m, day] = d.split('-').map(Number)
  return { y, m, day }
}

function fromUTC(date: Date): ISODate {
  return date.toISOString().slice(0, 10)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function clampDayInMonth(year: number, month: number, day: number): ISODate {
  return fromUTC(new Date(Date.UTC(year, month - 1, Math.min(day, daysInMonth(year, month)))))
}

export function addDays(d: ISODate, n: number): ISODate {
  const { y, m, day } = parts(d)
  return fromUTC(new Date(Date.UTC(y, m - 1, day + n)))
}

export function diffDays(a: ISODate, b: ISODate): number {
  const pa = parts(a)
  const pb = parts(b)
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.day) - Date.UTC(pb.y, pb.m - 1, pb.day)) / 86_400_000)
}

export function addMonthsAnchored(d: ISODate, months: number, anchorDay: number): ISODate {
  const { y, m } = parts(d)
  const total = y * 12 + (m - 1) + months
  return clampDayInMonth(Math.floor(total / 12), (total % 12) + 1, anchorDay)
}

export function dayOfMonth(d: ISODate): number {
  return parts(d).day
}
```

- [ ] **Step 7: Implement `cycle.ts` and `recurrence.ts`**

`apps/web/src/lib/cycle.ts`:
```ts
import { addDays, addMonthsAnchored, clampDayInMonth, diffDays, type ISODate } from './dates'

export interface PayCycle {
  cycleStart: ISODate
  cycleEnd: ISODate
  nextPayday: ISODate
  daysLeft: number
  cycleLength: number
}

export function payCycle(today: ISODate, paydayDay: number): PayCycle {
  const [y, m] = today.split('-').map(Number)
  const thisMonthPayday = clampDayInMonth(y, m, paydayDay)
  const cycleStart = thisMonthPayday <= today ? thisMonthPayday : addMonthsAnchored(thisMonthPayday, -1, paydayDay)
  const nextPayday = addMonthsAnchored(cycleStart, 1, paydayDay)
  const cycleEnd = addDays(nextPayday, -1)
  return {
    cycleStart,
    cycleEnd,
    nextPayday,
    daysLeft: diffDays(cycleEnd, today) + 1,
    cycleLength: diffDays(nextPayday, cycleStart),
  }
}
```

`apps/web/src/lib/recurrence.ts`:
```ts
import { addDays, addMonthsAnchored, type ISODate } from './dates'

export type Cadence = 'weekly' | 'monthly' | 'yearly'

export function nextOccurrence(d: ISODate, cadence: Cadence, anchorDay: number): ISODate {
  if (cadence === 'weekly') return addDays(d, 7)
  return addMonthsAnchored(d, cadence === 'monthly' ? 1 : 12, anchorDay)
}

const MAX_OCCURRENCES = 400

export function occurrencesInRange(
  nextDueOn: ISODate, cadence: Cadence, anchorDay: number, from: ISODate, to: ISODate,
): ISODate[] {
  const out: ISODate[] = []
  let d = nextDueOn
  let guard = 0
  while (d < from && guard++ < MAX_OCCURRENCES) d = nextOccurrence(d, cadence, anchorDay)
  while (d <= to && out.length < MAX_OCCURRENCES) {
    out.push(d)
    d = nextOccurrence(d, cadence, anchorDay)
  }
  return out
}
```

- [ ] **Step 8: Implement `safe-to-spend.ts`**

`apps/web/src/lib/safe-to-spend.ts`:
```ts
import { payCycle } from './cycle'
import type { ISODate } from './dates'
import { occurrencesInRange, type Cadence } from './recurrence'

export interface RecurringLike {
  kind: 'bill' | 'income'
  amount: number
  cadence: Cadence
  nextDueOn: ISODate
  anchorDay: number
  active: boolean
}

export interface SafeToSpendInput {
  today: ISODate
  paydayDay: number
  fixedCostsEstimate: number
  receivables: number
  checkin: { amount: number } | null
  confirmedIncomeSinceCheckin: number
  confirmedExpenseShareSinceCheckin: number
  pendingBillDrafts: number
  pendingIncomeDrafts: number
  recurring: RecurringLike[]
}

export interface SafeToSpendResult {
  status: 'ok' | 'unknown'
  amount: number
  dailyPace: number
  daysLeft: number
  cycleStart: ISODate
  cycleEnd: ISODate
  nextPayday: ISODate
  breakdown: { balance: number; committedOut: number; committedIn: number; fixedRemaining: number; receivables: number }
}

function scheduled(input: SafeToSpendInput, kind: RecurringLike['kind'], cycleEnd: ISODate): number {
  return input.recurring
    .filter((r) => r.active && r.kind === kind)
    .reduce((sum, r) => sum + r.amount * occurrencesInRange(r.nextDueOn, r.cadence, r.anchorDay, input.today, cycleEnd).length, 0)
}

export function computeSafeToSpend(input: SafeToSpendInput): SafeToSpendResult {
  const cycle = payCycle(input.today, input.paydayDay)
  const balance = input.checkin
    ? input.checkin.amount + input.confirmedIncomeSinceCheckin - input.confirmedExpenseShareSinceCheckin
    : 0
  const committedOut = scheduled(input, 'bill', cycle.cycleEnd) + input.pendingBillDrafts
  const committedIn = scheduled(input, 'income', cycle.cycleEnd) + input.pendingIncomeDrafts
  const fixedRemaining = Math.floor((input.fixedCostsEstimate * cycle.daysLeft) / cycle.cycleLength)
  const breakdown = { balance, committedOut, committedIn, fixedRemaining, receivables: input.receivables }
  const common = { daysLeft: cycle.daysLeft, cycleStart: cycle.cycleStart, cycleEnd: cycle.cycleEnd, nextPayday: cycle.nextPayday, breakdown }

  if (!input.checkin) return { status: 'unknown', amount: 0, dailyPace: 0, ...common }

  const amount = balance - committedOut + committedIn - fixedRemaining + input.receivables
  return { status: 'ok', amount, dailyPace: Math.floor(Math.max(amount, 0) / cycle.daysLeft), ...common }
}
```

- [ ] **Step 9: Run tests**

Run: `pnpm --filter web test -- src/lib`
Expected: PASS (all 5 files).

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib
git commit -m "feat(lib): paise money, IST dates, pay cycles, recurrence and Safe-to-Spend math

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Users service, lazy user sync and the Clerk webhook

**Files:**
- Create: `apps/web/src/lib/schemas/common.ts`, `apps/web/src/lib/schemas/me.ts`, `apps/web/src/server/services/users.ts`, `apps/web/src/app/api/webhooks/clerk/route.ts`, `apps/web/test/int/clerk-mock.ts`
- Modify: `apps/web/src/server/auth.ts` (add `requireCurrentUser`, `profileFromClerk`)
- Test: `apps/web/src/server/services/users.int.test.ts`, `apps/web/src/app/api/webhooks/clerk/route.int.test.ts`

**Interfaces:**
- Consumes: `getDb`, `users`, `User` (Task 3); `AppError`, `requireUserId` (Task 2).
- Produces:
  - `paise` zod schema (`z.number().int().min(1).max(MAX_AMOUNT_PAISE)`), `paiseOrZero`, `isoDate` (`/^\d{4}-\d{2}-\d{2}$/`) in `lib/schemas/common.ts`.
  - `mePatchSchema` (zod) and `type MePatch` in `lib/schemas/me.ts`.
  - `interface UserProfile { id: string; email: string; name: string; avatarUrl: string | null }`
  - `getUser(id: string): Promise<User | null>`; `upsertUserFromProfile(p: UserProfile): Promise<User>`; `deleteUser(id: string): Promise<void>`; `updateMe(userId: string, patch: MePatch): Promise<User>`.
  - `requireCurrentUser(): Promise<User>` (lazy upsert from Clerk on first request); `profileFromClerk(u: ClerkProfileLike): UserProfile`.
  - Test helper `clerkState` + mock module `clerkModule` in `test/int/clerk-mock.ts`.

- [ ] **Step 1: Install and write shared schemas**

```bash
cd apps/web && pnpm add zod@^4.6.5 svix@^2.8.0 && cd ../..
```

`apps/web/src/lib/schemas/common.ts`:
```ts
import { z } from 'zod'
import { MAX_AMOUNT_PAISE } from '../money'

export const paise = z
  .number({ error: 'Enter an amount.' })
  .int('Amount must be in whole paise.')
  .min(1, 'Amount needs to be more than ₹0.')
  .max(MAX_AMOUNT_PAISE, 'That’s more than ₹1,00,00,000 — please check the amount.')

export const paiseOrZero = z.number().int().min(0).max(MAX_AMOUNT_PAISE)

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-11.')

export const uuid = z.uuid('That id doesn’t look right.')
```

`apps/web/src/lib/schemas/me.ts`:
```ts
import { z } from 'zod'
import { paiseOrZero } from './common'

export const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/

export const mePatchSchema = z
  .object({
    name: z.string().trim().min(1, 'Add your name.').max(60),
    paydayDay: z.number().int().min(1).max(31),
    monthlyIncome: paiseOrZero.nullable(),
    fixedCostsEstimate: paiseOrZero,
    onboardingStep: z.number().int().min(0).max(7),
    onboarded: z.boolean(),
    theme: z.enum(['dark', 'light', 'system']),
    reducedMotion: z.enum(['on', 'off', 'system']),
    upiId: z.string().trim().regex(UPI_ID_PATTERN, 'UPI IDs look like name@bank.').nullable(),
  })
  .partial()
  .strict()

export type MePatch = z.infer<typeof mePatchSchema>
```

- [ ] **Step 2: Write the Clerk test double**

`apps/web/test/int/clerk-mock.ts`:
```ts
export const clerkState = {
  userId: null as string | null,
  email: 'test@example.com',
  firstName: 'Test',
}

export const clerkModule = {
  auth: async () => ({ userId: clerkState.userId }),
  currentUser: async () =>
    clerkState.userId
      ? {
          id: clerkState.userId,
          firstName: clerkState.firstName,
          lastName: null,
          imageUrl: 'https://img.example.com/a.png',
          primaryEmailAddress: { emailAddress: clerkState.email },
          emailAddresses: [{ emailAddress: clerkState.email }],
        }
      : null,
}
```

- [ ] **Step 3: Write the failing service test**

`apps/web/src/server/services/users.int.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeUser, resetDb } from '@test/int/helpers'
import { clerkState } from '@test/int/clerk-mock'

vi.mock('@clerk/nextjs/server', async () => (await import('@test/int/clerk-mock')).clerkModule)

import { requireCurrentUser } from '@/server/auth'
import { getUser, updateMe, upsertUserFromProfile } from './users'

describe('users service', () => {
  beforeEach(async () => {
    await resetDb()
    clerkState.userId = null
  })

  it('creates the user from Clerk on first authenticated request', async () => {
    clerkState.userId = 'user_new'
    clerkState.email = 'new@example.com'
    const user = await requireCurrentUser()
    expect(user).toMatchObject({ id: 'user_new', email: 'new@example.com', name: 'Test', paydayDay: 1, theme: 'dark' })
    expect(await getUser('user_new')).not.toBeNull()
  })

  it('returns the existing row without overwriting edits', async () => {
    await makeUser('user_a', { name: 'Edited Name' })
    clerkState.userId = 'user_a'
    expect((await requireCurrentUser()).name).toBe('Edited Name')
  })

  it('rejects signed-out requests', async () => {
    await expect(requireCurrentUser()).rejects.toMatchObject({ status: 401 })
  })

  it('upsert updates email/name/avatar from Clerk', async () => {
    await makeUser('user_a')
    const u = await upsertUserFromProfile({ id: 'user_a', email: 'changed@example.com', name: 'Asha', avatarUrl: null })
    expect(u).toMatchObject({ email: 'changed@example.com', name: 'Asha' })
  })

  it('updateMe sets onboardedAt when onboarded=true and keeps other fields', async () => {
    await makeUser('user_a')
    const u = await updateMe('user_a', { paydayDay: 31, onboarded: true, upiId: 'asha@okhdfc' })
    expect(u.paydayDay).toBe(31)
    expect(u.upiId).toBe('asha@okhdfc')
    expect(u.onboardedAt).toBeInstanceOf(Date)
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm --filter web test:int -- src/server/services/users.int.test.ts`
Expected: FAIL — `./users` not found / `requireCurrentUser` not exported.

- [ ] **Step 5: Implement the users service and `requireCurrentUser`**

`apps/web/src/server/services/users.ts`:
```ts
import 'server-only'
import { eq } from 'drizzle-orm'
import type { MePatch } from '@/lib/schemas/me'
import { getDb } from '@/server/db/client'
import { users, type User } from '@/server/db/schema'
import { notFound } from '@/server/errors'

export interface UserProfile {
  id: string
  email: string
  name: string
  avatarUrl: string | null
}

export async function getUser(id: string): Promise<User | null> {
  const [row] = await getDb().select().from(users).where(eq(users.id, id))
  return row ?? null
}

export async function upsertUserFromProfile(p: UserProfile): Promise<User> {
  const [row] = await getDb()
    .insert(users)
    .values({ id: p.id, email: p.email, name: p.name, avatarUrl: p.avatarUrl })
    .onConflictDoUpdate({ target: users.id, set: { email: p.email, name: p.name, avatarUrl: p.avatarUrl } })
    .returning()
  return row
}

export async function deleteUser(id: string): Promise<void> {
  await getDb().delete(users).where(eq(users.id, id))
}

export async function updateMe(userId: string, patch: MePatch): Promise<User> {
  const { onboarded, ...fields } = patch
  const [row] = await getDb()
    .update(users)
    .set({ ...fields, ...(onboarded === undefined ? {} : { onboardedAt: onboarded ? new Date() : null }) })
    .where(eq(users.id, userId))
    .returning()
  if (!row) throw notFound('account')
  return row
}
```

Replace `apps/web/src/server/auth.ts` with:
```ts
import 'server-only'
import { auth, currentUser } from '@clerk/nextjs/server'
import type { User } from '@/server/db/schema'
import { AppError } from './errors'
import { getUser, upsertUserFromProfile, type UserProfile } from './services/users'

export interface ClerkProfileLike {
  id: string
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
  primaryEmailAddress?: { emailAddress: string } | null
  emailAddresses: { emailAddress: string }[]
}

const unauthorized = () => new AppError('unauthorized', 'Please sign in to continue.', 401)

export async function requireUserId(): Promise<string> {
  const { userId } = await auth()
  if (!userId) throw unauthorized()
  return userId
}

export function profileFromClerk(u: ClerkProfileLike): UserProfile {
  const email = u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress
  if (!email) throw new AppError('no_email', 'Your account needs an email address.', 400)
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || email.split('@')[0]
  return { id: u.id, email, name, avatarUrl: u.imageUrl }
}

/** Signed-in user's DB row; creates it from Clerk on first use (works without a webhook tunnel). */
export async function requireCurrentUser(): Promise<User> {
  const userId = await requireUserId()
  const existing = await getUser(userId)
  if (existing) return existing
  const clerkUser = await currentUser()
  if (!clerkUser) throw unauthorized()
  return upsertUserFromProfile(profileFromClerk(clerkUser as unknown as ClerkProfileLike))
}
```

- [ ] **Step 6: Run the service test**

Run: `pnpm --filter web test:int -- src/server/services/users.int.test.ts`
Expected: PASS (5 tests). Also re-run `pnpm --filter web test -- src/server/auth.test.ts` → PASS.

- [ ] **Step 7: Write the failing webhook test**

`apps/web/src/app/api/webhooks/clerk/route.int.test.ts`:
```ts
import { Webhook } from 'svix'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeUser, resetDb } from '@test/int/helpers'
import { getUser } from '@/server/services/users'
import { POST } from './route'

const SECRET = 'whsec_' + Buffer.from('coinflow-test-secret-32-bytes!!!').toString('base64')

function signed(body: object, secret = SECRET) {
  const payload = JSON.stringify(body)
  const id = 'msg_' + Math.random().toString(36).slice(2)
  const ts = new Date()
  const signature = new Webhook(secret).sign(id, ts, payload)
  return new Request('http://localhost/api/webhooks/clerk', {
    method: 'POST',
    body: payload,
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': String(Math.floor(ts.getTime() / 1000)),
      'svix-signature': signature,
    },
  })
}

const clerkUser = (id: string, email: string) => ({
  id, first_name: 'Asha', last_name: 'K', image_url: null,
  primary_email_address_id: 'e1', email_addresses: [{ id: 'e1', email_address: email }],
})

describe('POST /api/webhooks/clerk', () => {
  beforeEach(async () => {
    await resetDb()
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = SECRET
  })

  it('creates users on user.created (idempotently)', async () => {
    const evt = { type: 'user.created', data: clerkUser('user_w', 'w@example.com'), object: 'event' }
    expect((await POST(signed(evt))).status).toBe(200)
    expect((await POST(signed(evt))).status).toBe(200)
    expect(await getUser('user_w')).toMatchObject({ email: 'w@example.com', name: 'Asha K' })
  })

  it('deletes users on user.deleted', async () => {
    await makeUser('user_d')
    const res = await POST(signed({ type: 'user.deleted', data: { id: 'user_d', deleted: true }, object: 'event' }))
    expect(res.status).toBe(200)
    expect(await getUser('user_d')).toBeNull()
  })

  it('rejects bad signatures with 400', async () => {
    const other = 'whsec_' + Buffer.from('a-different-secret-of-32-bytes!!').toString('base64')
    const res = await POST(signed({ type: 'user.created', data: clerkUser('x', 'x@example.com'), object: 'event' }, other))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 8: Run it to verify it fails**

Run: `pnpm --filter web test:int -- src/app/api/webhooks/clerk/route.int.test.ts`
Expected: FAIL — `./route` not found.

- [ ] **Step 9: Implement the webhook**

`apps/web/src/app/api/webhooks/clerk/route.ts`:
```ts
import { verifyWebhook } from '@clerk/nextjs/webhooks'
import { deleteUser, upsertUserFromProfile } from '@/server/services/users'

interface ClerkWebhookUser {
  id: string
  first_name: string | null
  last_name: string | null
  image_url: string | null
  primary_email_address_id: string | null
  email_addresses: { id: string; email_address: string }[]
}

export async function POST(req: Request) {
  let evt: { type: string; data: unknown }
  try {
    evt = (await verifyWebhook(req as never)) as { type: string; data: unknown }
  } catch {
    return Response.json({ error: { code: 'bad_signature', message: 'Webhook signature check failed.' } }, { status: 400 })
  }

  if (evt.type === 'user.created' || evt.type === 'user.updated') {
    const u = evt.data as ClerkWebhookUser
    const email =
      u.email_addresses.find((e) => e.id === u.primary_email_address_id)?.email_address ?? u.email_addresses[0]?.email_address
    if (email) {
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || email.split('@')[0]
      await upsertUserFromProfile({ id: u.id, email, name, avatarUrl: u.image_url })
    }
  } else if (evt.type === 'user.deleted') {
    const { id } = evt.data as { id?: string }
    if (id) await deleteUser(id)
  }
  return Response.json({ ok: true })
}
```
Note: `verifyWebhook` reads `CLERK_WEBHOOK_SIGNING_SECRET` from the environment and verifies with svix. If the installed `@clerk/nextjs` version no longer exports `@clerk/nextjs/webhooks`, verify manually instead: `new Webhook(process.env.CLERK_WEBHOOK_SIGNING_SECRET!).verify(await req.text(), Object.fromEntries(req.headers))` from `svix`.

- [ ] **Step 10: Run webhook + all integration tests**

Run: `pnpm --filter web test:int`
Expected: PASS (schema, users, webhook).

- [ ] **Step 11: Commit**

```bash
git add apps/web/src apps/web/test apps/web/package.json pnpm-lock.yaml
git commit -m "feat(users): lazy Clerk user sync, profile updates and verified Clerk webhook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Audit log and Undo

**Files:**
- Create: `apps/web/src/server/services/audit.ts`
- Test: `apps/web/src/server/services/audit.int.test.ts`

**Interfaces:**
- Consumes: `getDb`, `Tx`, `auditLog`, `transactions`, `recurringItems`, `budgets`, `balanceCheckins` (Task 3); `notFound`, `conflict` (Task 2).
- Produces:
  - `type AuditEntity = 'transaction' | 'recurring_item' | 'budget' | 'balance_checkin'`
  - `type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'confirm'`
  - `snapshot<T extends object>(row: T | null | undefined): Record<string, unknown> | null` — JSON-safe copy.
  - `recordAudit(tx: Tx, entry: { userId: string; entity: AuditEntity; entityId: string; action: AuditAction; before: object | null; after: object | null; actor?: 'user' | 'agent' }): Promise<string>` → audit id.
  - `UNDO_WINDOW_MS = 30_000`
  - `undo(userId: string, auditId: string, now?: Date): Promise<{ entity: AuditEntity; entityId: string; auditId: string }>` — `auditId` in the result is the new `restore` entry.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/server/services/audit.int.test.ts`:
```ts
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { getDb } from '@/server/db/client'
import { transactions, type Transaction } from '@/server/db/schema'
import { recordAudit, snapshot, undo } from './audit'

async function insertTxn(userId: string): Promise<Transaction> {
  const food = await builtinCategory('Food & Dining')
  const [row] = await getDb().insert(transactions).values({
    userId, type: 'expense', amount: 45_000, personalShare: 45_000, categoryId: food.id, occurredAt: new Date(),
  }).returning()
  return row
}

async function read(id: string) {
  const [row] = await getDb().select().from(transactions).where(eq(transactions.id, id))
  return row
}

describe('undo', () => {
  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a')
    await makeUser('user_b')
  })

  it('undoing a create soft-deletes the transaction', async () => {
    const t = await insertTxn('user_a')
    const auditId = await getDb().transaction((tx) =>
      recordAudit(tx, { userId: 'user_a', entity: 'transaction', entityId: t.id, action: 'create', before: null, after: snapshot(t) }))
    const result = await undo('user_a', auditId)
    expect(result).toMatchObject({ entity: 'transaction', entityId: t.id })
    expect((await read(t.id)).deletedAt).toBeInstanceOf(Date)
  })

  it('undoing an update restores previous values including dates', async () => {
    const t = await insertTxn('user_a')
    const [updated] = await getDb().update(transactions).set({ amount: 99_000, personalShare: 99_000, note: 'oops' })
      .where(eq(transactions.id, t.id)).returning()
    const auditId = await getDb().transaction((tx) =>
      recordAudit(tx, { userId: 'user_a', entity: 'transaction', entityId: t.id, action: 'update', before: snapshot(t), after: snapshot(updated) }))
    await undo('user_a', auditId)
    const restored = await read(t.id)
    expect(restored.amount).toBe(45_000)
    expect(restored.note).toBeNull()
    expect(restored.occurredAt.toISOString()).toBe(t.occurredAt.toISOString())
  })

  it('undoing a delete brings the row back', async () => {
    const t = await insertTxn('user_a')
    const [deleted] = await getDb().update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, t.id)).returning()
    const auditId = await getDb().transaction((tx) =>
      recordAudit(tx, { userId: 'user_a', entity: 'transaction', entityId: t.id, action: 'delete', before: snapshot(t), after: snapshot(deleted) }))
    await undo('user_a', auditId)
    expect((await read(t.id)).deletedAt).toBeNull()
  })

  it('refuses after the 30 s window', async () => {
    const t = await insertTxn('user_a')
    const auditId = await getDb().transaction((tx) =>
      recordAudit(tx, { userId: 'user_a', entity: 'transaction', entityId: t.id, action: 'create', before: null, after: snapshot(t) }))
    await expect(undo('user_a', auditId, new Date(Date.now() + 31_000))).rejects.toMatchObject({ status: 409, code: 'undo_expired' })
  })

  it('refuses when a newer change exists for the same entity', async () => {
    const t = await insertTxn('user_a')
    const first = await getDb().transaction((tx) =>
      recordAudit(tx, { userId: 'user_a', entity: 'transaction', entityId: t.id, action: 'create', before: null, after: snapshot(t) }))
    await getDb().transaction((tx) =>
      recordAudit(tx, { userId: 'user_a', entity: 'transaction', entityId: t.id, action: 'update', before: snapshot(t), after: snapshot(t) }))
    await expect(undo('user_a', first)).rejects.toMatchObject({ status: 409, code: 'undo_stale' })
  })

  it('hides other users’ audit entries (404)', async () => {
    const t = await insertTxn('user_a')
    const auditId = await getDb().transaction((tx) =>
      recordAudit(tx, { userId: 'user_a', entity: 'transaction', entityId: t.id, action: 'create', before: null, after: snapshot(t) }))
    await expect(undo('user_b', auditId)).rejects.toMatchObject({ status: 404 })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web test:int -- src/server/services/audit.int.test.ts`
Expected: FAIL — `./audit` not found.

- [ ] **Step 3: Implement the audit service**

`apps/web/src/server/services/audit.ts`:
```ts
import 'server-only'
import { and, desc, eq } from 'drizzle-orm'
import { getDb, type Tx } from '@/server/db/client'
import { auditLog, balanceCheckins, budgets, recurringItems, transactions } from '@/server/db/schema'
import { conflict, notFound } from '@/server/errors'

export type AuditEntity = 'transaction' | 'recurring_item' | 'budget' | 'balance_checkin'
export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'confirm'
export const UNDO_WINDOW_MS = 30_000

const TABLES = {
  transaction: transactions,
  recurring_item: recurringItems,
  budget: budgets,
  balance_checkin: balanceCheckins,
} as const

const DATE_KEYS = new Set(['createdAt', 'updatedAt', 'occurredAt', 'deletedAt', 'takenAt'])

export function snapshot<T extends object>(row: T | null | undefined): Record<string, unknown> | null {
  return row ? (JSON.parse(JSON.stringify(row)) as Record<string, unknown>) : null
}

function revive(json: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(json).map(([k, v]) => [k, DATE_KEYS.has(k) && typeof v === 'string' ? new Date(v) : v]),
  )
}

export async function recordAudit(
  tx: Tx,
  entry: {
    userId: string
    entity: AuditEntity
    entityId: string
    action: AuditAction
    before: object | null
    after: object | null
    actor?: 'user' | 'agent'
  },
): Promise<string> {
  const [row] = await tx
    .insert(auditLog)
    .values({
      userId: entry.userId,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      before: snapshot(entry.before),
      after: snapshot(entry.after),
      actor: entry.actor ?? 'user',
    })
    .returning({ id: auditLog.id })
  return row.id
}

export async function undo(
  userId: string,
  auditId: string,
  now: Date = new Date(),
): Promise<{ entity: AuditEntity; entityId: string; auditId: string }> {
  return getDb().transaction(async (tx) => {
    const [entry] = await tx
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.id, auditId), eq(auditLog.userId, userId)))
    if (!entry) throw notFound('change')
    if (now.getTime() - entry.createdAt.getTime() > UNDO_WINDOW_MS) {
      throw conflict('undo_expired', 'It’s too late to undo that change.')
    }
    const [latest] = await tx
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.userId, userId), eq(auditLog.entity, entry.entity), eq(auditLog.entityId, entry.entityId)))
      .orderBy(desc(auditLog.seq))
      .limit(1)
    if (latest.id !== entry.id) throw conflict('undo_stale', 'That item changed again, so this undo no longer applies.')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- one generic restore over four tables
    const table = TABLES[entry.entity] as any
    const [current] = await tx.select().from(table).where(eq(table.id, entry.entityId))
    const before = entry.before as Record<string, unknown> | null

    try {
      if (before === null) {
        if (entry.entity === 'transaction') {
          await tx.update(transactions).set({ deletedAt: now }).where(eq(transactions.id, entry.entityId))
        } else {
          await tx.delete(table).where(eq(table.id, entry.entityId))
        }
      } else {
        const values = revive(before)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, createdAt, ...set } = values
        await tx.insert(table).values(values).onConflictDoUpdate({ target: table.id, set })
      }
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw conflict('undo_conflict', 'Something newer is in the way, so this can’t be undone.')
      }
      throw err
    }

    const [restored] = await tx.select().from(table).where(eq(table.id, entry.entityId))
    const restoreId = await recordAudit(tx, {
      userId,
      entity: entry.entity,
      entityId: entry.entityId,
      action: 'restore',
      before: current ?? null,
      after: restored ?? null,
    })
    return { entity: entry.entity, entityId: entry.entityId, auditId: restoreId }
  })
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter web test:int -- src/server/services/audit.int.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/services/audit.ts apps/web/src/server/services/audit.int.test.ts
git commit -m "feat(undo): audit log snapshots with 30s latest-only undo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Categories and transactions services

**Files:**
- Create: `apps/web/src/lib/schemas/categories.ts`, `apps/web/src/lib/schemas/transactions.ts`, `apps/web/src/server/services/categories.ts`, `apps/web/src/server/services/transactions.ts`
- Test: `apps/web/src/server/services/transactions.int.test.ts`

**Interfaces:**
- Consumes: `recordAudit`, `snapshot` (Task 6); `paise`, `isoDate`, `uuid` (Task 5); `istStartOfDay`, `addDays` (Task 4).
- Produces:
  - `categoryCreateSchema`, `type CategoryCreate`; `transactionCreateSchema`, `type TransactionCreate` (`{ type; amount; categoryId; note?: string | null; method; occurredAt: Date }`), `transactionPatchSchema`, `type TransactionPatch`, `transactionListQuerySchema`, `type TransactionListQuery` (`{ cursor?; type?; categoryId?; method?; from?: ISODate; to?: ISODate; q?; status: 'confirmed' | 'draft'; limit: number }`).
  - `listCategories(userId: string, kind?: 'expense' | 'income'): Promise<Category[]>`; `createCategory(userId: string, input: CategoryCreate): Promise<Category>`; `requireUsableCategory(userId: string, categoryId: string, kind: 'expense' | 'income', executor?: Tx): Promise<Category>` (throws 422 field `categoryId`).
  - `type TransactionWithCategory = Transaction & { category: { id: string; name: string; emoji: string; color: string } }`
  - `createTransaction(userId, input: TransactionCreate, opts?: { source?: Transaction['source']; status?: Transaction['status']; recurringItemId?: string | null; actor?: 'user' | 'agent'; tx?: Tx; audit?: boolean }): Promise<{ data: Transaction; auditId: string | null }>`
  - `updateTransaction(userId, id, patch: TransactionPatch): Promise<{ data: Transaction; auditId: string }>`
  - `deleteTransaction(userId, id): Promise<{ auditId: string }>`
  - `confirmDraft(userId, id): Promise<{ data: Transaction; auditId: string }>`; `skipDraft(userId, id): Promise<{ auditId: string }>`
  - `listTransactions(userId, query: TransactionListQuery): Promise<{ data: TransactionWithCategory[]; nextCursor: string | null }>`

- [ ] **Step 1: Write the schemas**

`apps/web/src/lib/schemas/categories.ts`:
```ts
import { z } from 'zod'

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name the category.').max(40),
  emoji: z.string().trim().min(1).max(8),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour.'),
  kind: z.enum(['expense', 'income']),
}).strict()

export type CategoryCreate = z.infer<typeof categoryCreateSchema>
```

`apps/web/src/lib/schemas/transactions.ts`:
```ts
import { z } from 'zod'
import { isoDate, paise, uuid } from './common'

const DAY_MS = 86_400_000

const occurredAt = z.coerce
  .date({ error: 'Pick a date and time.' })
  .refine((d) => d.getTime() <= Date.now() + DAY_MS, 'That date is in the future.')

const method = z.enum(['upi', 'cash', 'card', 'other'])

const transactionFields = {
  type: z.enum(['expense', 'income']),
  amount: paise,
  categoryId: uuid,
  note: z.string().trim().max(200).nullish(),
  method,
  occurredAt,
}

export const transactionCreateSchema = z.object({
  ...transactionFields,
  method: method.default('upi'),
  occurredAt: occurredAt.default(() => new Date()),
}).strict()

// Built from the default-free fields so a partial edit never injects method/occurredAt defaults.
export const transactionPatchSchema = z.object(transactionFields).partial().strict()

export const transactionListQuerySchema = z.object({
  cursor: z.string().optional(),
  type: z.enum(['expense', 'income']).optional(),
  categoryId: uuid.optional(),
  method: z.enum(['upi', 'cash', 'card', 'other']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(100).optional(),
  status: z.enum(['confirmed', 'draft']).default('confirmed'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type TransactionCreate = z.infer<typeof transactionCreateSchema>
export type TransactionPatch = z.infer<typeof transactionPatchSchema>
export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>
```

- [ ] **Step 2: Write the failing tests**

`apps/web/src/server/services/transactions.int.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { transactionListQuerySchema, transactionPatchSchema } from '@/lib/schemas/transactions'
import { undo } from './audit'
import { createCategory, listCategories } from './categories'
import {
  confirmDraft, createTransaction, deleteTransaction, listTransactions, skipDraft, updateTransaction,
} from './transactions'

const q = (over: object = {}) => transactionListQuerySchema.parse(over)

describe('transactions service', () => {
  let foodId: string
  let salaryId: string

  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a')
    await makeUser('user_b')
    foodId = (await builtinCategory('Food & Dining')).id
    salaryId = (await builtinCategory('Salary', 'income')).id
  })

  const expense = (over: object = {}) => ({
    type: 'expense' as const, amount: 45_000, categoryId: foodId, method: 'upi' as const, occurredAt: new Date(), note: null, ...over,
  })

  it('creates a confirmed manual expense with personalShare = amount and an audit id', async () => {
    const { data, auditId } = await createTransaction('user_a', expense())
    expect(data).toMatchObject({ amount: 45_000, personalShare: 45_000, status: 'confirmed', source: 'manual' })
    expect(auditId).toBeTruthy()
  })

  it('rejects a category of the wrong kind with a field error', async () => {
    await expect(createTransaction('user_a', expense({ categoryId: salaryId }))).rejects.toMatchObject({ status: 422, field: 'categoryId' })
  })

  it('rejects another user’s custom category', async () => {
    const mine = await createCategory('user_b', { name: 'Chai', emoji: '☕', color: '#C8F560', kind: 'expense' })
    await expect(createTransaction('user_a', expense({ categoryId: mine.id }))).rejects.toMatchObject({ status: 422 })
  })

  it('lists built-in plus own categories only', async () => {
    await createCategory('user_b', { name: 'Chai', emoji: '☕', color: '#C8F560', kind: 'expense' })
    const a = await listCategories('user_a', 'expense')
    expect(a.map((c) => c.name)).not.toContain('Chai')
    expect(a).toHaveLength(14)
  })

  it('updates amount and keeps personalShare in sync; undo restores', async () => {
    const { data } = await createTransaction('user_a', expense())
    const upd = await updateTransaction('user_a', data.id, { amount: 60_000 })
    expect(upd.data).toMatchObject({ amount: 60_000, personalShare: 60_000 })
    await undo('user_a', upd.auditId)
    const list = await listTransactions('user_a', q())
    expect(list.data[0].amount).toBe(45_000)
  })

  it('a partial edit leaves method and occurredAt untouched', async () => {
    const when = new Date('2026-10-01T06:00:00Z')
    const { data } = await createTransaction('user_a', expense({ method: 'cash', occurredAt: when }))
    const patch = transactionPatchSchema.parse({ note: 'renamed' })
    expect(patch).toEqual({ note: 'renamed' })
    const upd = await updateTransaction('user_a', data.id, patch)
    expect(upd.data.method).toBe('cash')
    expect(upd.data.occurredAt.toISOString()).toBe(when.toISOString())
  })

  it('soft-deletes and hides from lists; undo brings it back', async () => {
    const { data } = await createTransaction('user_a', expense())
    const { auditId } = await deleteTransaction('user_a', data.id)
    expect((await listTransactions('user_a', q())).data).toHaveLength(0)
    await undo('user_a', auditId)
    expect((await listTransactions('user_a', q())).data).toHaveLength(1)
  })

  it('returns 404 for another user’s transaction id', async () => {
    const { data } = await createTransaction('user_a', expense())
    await expect(updateTransaction('user_b', data.id, { amount: 1 })).rejects.toMatchObject({ status: 404 })
    await expect(deleteTransaction('user_b', data.id)).rejects.toMatchObject({ status: 404 })
  })

  it('confirms and skips drafts', async () => {
    const a = await createTransaction('user_a', expense(), { status: 'draft', source: 'recurring' })
    const b = await createTransaction('user_a', expense(), { status: 'draft', source: 'recurring' })
    expect((await listTransactions('user_a', q({ status: 'draft' }))).data).toHaveLength(2)
    const confirmed = await confirmDraft('user_a', a.data.id)
    expect(confirmed.data.status).toBe('confirmed')
    await skipDraft('user_a', b.data.id)
    expect((await listTransactions('user_a', q({ status: 'draft' }))).data).toHaveLength(0)
    expect((await listTransactions('user_a', q())).data).toHaveLength(1)
  })

  it('paginates newest-first with a stable cursor', async () => {
    for (let i = 0; i < 5; i++) {
      await createTransaction('user_a', expense({ occurredAt: new Date(Date.UTC(2026, 9, 1 + i, 6)) }))
    }
    const page1 = await listTransactions('user_a', q({ limit: 2 }))
    const page2 = await listTransactions('user_a', q({ limit: 2, cursor: page1.nextCursor! }))
    const page3 = await listTransactions('user_a', q({ limit: 2, cursor: page2.nextCursor! }))
    const days = [...page1.data, ...page2.data, ...page3.data].map((t) => t.occurredAt.getUTCDate())
    expect(days).toEqual([5, 4, 3, 2, 1])
    expect(page3.nextCursor).toBeNull()
  })

  it('IST day filter: 00:30 IST on Oct 12 belongs to Oct 12', async () => {
    await createTransaction('user_a', expense({ occurredAt: new Date('2026-10-11T19:00:00Z'), note: 'late chai' }))
    expect((await listTransactions('user_a', q({ from: '2026-10-12', to: '2026-10-12' }))).data).toHaveLength(1)
    expect((await listTransactions('user_a', q({ from: '2026-10-11', to: '2026-10-11' }))).data).toHaveLength(0)
  })

  it('searches notes and category names, escaping LIKE wildcards', async () => {
    await createTransaction('user_a', expense({ note: 'Toit dinner' }))
    await createTransaction('user_a', expense({ note: '100% juice' }))
    expect((await listTransactions('user_a', q({ q: 'toit' }))).data).toHaveLength(1)
    expect((await listTransactions('user_a', q({ q: 'food' }))).data).toHaveLength(2)
    expect((await listTransactions('user_a', q({ q: '%' }))).data).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter web test:int -- src/server/services/transactions.int.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement categories service**

`apps/web/src/server/services/categories.ts`:
```ts
import 'server-only'
import { and, asc, eq, isNull, or } from 'drizzle-orm'
import type { CategoryCreate } from '@/lib/schemas/categories'
import { getDb, type Tx } from '@/server/db/client'
import { categories, type Category } from '@/server/db/schema'
import { conflict, invalid } from '@/server/errors'

const visibleTo = (userId: string) => or(isNull(categories.userId), eq(categories.userId, userId))

export async function listCategories(userId: string, kind?: 'expense' | 'income'): Promise<Category[]> {
  return getDb()
    .select()
    .from(categories)
    .where(kind ? and(visibleTo(userId), eq(categories.kind, kind)) : visibleTo(userId))
    .orderBy(asc(categories.sort), asc(categories.name))
}

export async function createCategory(userId: string, input: CategoryCreate): Promise<Category> {
  try {
    const [row] = await getDb().insert(categories).values({ ...input, userId, sort: 500 }).returning()
    return row
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw conflict('duplicate', 'You already have a category with that name.')
    throw err
  }
}

export async function requireUsableCategory(
  userId: string, categoryId: string, kind: 'expense' | 'income', executor: Tx | ReturnType<typeof getDb> = getDb(),
): Promise<Category> {
  const [cat] = await executor.select().from(categories).where(and(eq(categories.id, categoryId), visibleTo(userId)))
  if (!cat || cat.kind !== kind) {
    throw invalid('categoryId', kind === 'expense' ? 'Pick an expense category.' : 'Pick an income category.')
  }
  return cat
}
```

- [ ] **Step 5: Implement transactions service**

`apps/web/src/server/services/transactions.ts`:
```ts
import 'server-only'
import { and, desc, eq, getTableColumns, gte, ilike, isNull, lt, or, sql } from 'drizzle-orm'
import { addDays, istStartOfDay } from '@/lib/dates'
import type { TransactionCreate, TransactionListQuery, TransactionPatch } from '@/lib/schemas/transactions'
import { getDb, type Tx } from '@/server/db/client'
import { categories, transactions, type Transaction } from '@/server/db/schema'
import { notFound } from '@/server/errors'
import { recordAudit } from './audit'
import { requireUsableCategory } from './categories'

export type TransactionWithCategory = Transaction & {
  category: { id: string; name: string; emoji: string; color: string }
}

async function findOwned(executor: Tx, userId: string, id: string, status?: 'draft' | 'confirmed'): Promise<Transaction> {
  const [row] = await executor
    .select()
    .from(transactions)
    .where(and(
      eq(transactions.id, id), eq(transactions.userId, userId), isNull(transactions.deletedAt),
      status ? eq(transactions.status, status) : undefined,
    ))
    .for('update')
  if (!row) throw notFound('transaction')
  return row
}

export async function createTransaction(
  userId: string,
  input: TransactionCreate,
  opts: {
    source?: Transaction['source']; status?: Transaction['status']; recurringItemId?: string | null
    actor?: 'user' | 'agent'; tx?: Tx; audit?: boolean
  } = {},
): Promise<{ data: Transaction; auditId: string | null }> {
  const run = async (tx: Tx) => {
    await requireUsableCategory(userId, input.categoryId, input.type, tx)
    const [row] = await tx
      .insert(transactions)
      .values({
        userId,
        type: input.type,
        amount: input.amount,
        personalShare: input.amount,
        categoryId: input.categoryId,
        note: input.note ?? null,
        method: input.method,
        occurredAt: input.occurredAt,
        source: opts.source ?? 'manual',
        status: opts.status ?? 'confirmed',
        recurringItemId: opts.recurringItemId ?? null,
      })
      .returning()
    const auditId = opts.audit === false
      ? null
      : await recordAudit(tx, { userId, entity: 'transaction', entityId: row.id, action: 'create', before: null, after: row, actor: opts.actor })
    return { data: row, auditId }
  }
  return opts.tx ? run(opts.tx) : getDb().transaction(run)
}

export async function updateTransaction(userId: string, id: string, patch: TransactionPatch) {
  return getDb().transaction(async (tx) => {
    const before = await findOwned(tx, userId, id)
    const type = patch.type ?? before.type
    if (patch.categoryId !== undefined || patch.type !== undefined) {
      await requireUsableCategory(userId, patch.categoryId ?? before.categoryId, type, tx)
    }
    const amount = patch.amount ?? before.amount
    const [after] = await tx
      .update(transactions)
      .set({ ...patch, note: patch.note === undefined ? before.note : (patch.note ?? null), amount, personalShare: amount })
      .where(eq(transactions.id, id))
      .returning()
    const auditId = await recordAudit(tx, { userId, entity: 'transaction', entityId: id, action: 'update', before, after })
    return { data: after, auditId }
  })
}

async function softDelete(userId: string, id: string, status?: 'draft'): Promise<{ auditId: string }> {
  return getDb().transaction(async (tx) => {
    const before = await findOwned(tx, userId, id, status)
    const [after] = await tx.update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, id)).returning()
    const auditId = await recordAudit(tx, { userId, entity: 'transaction', entityId: id, action: 'delete', before, after })
    return { auditId }
  })
}

export const deleteTransaction = (userId: string, id: string) => softDelete(userId, id)
export const skipDraft = (userId: string, id: string) => softDelete(userId, id, 'draft')

export async function confirmDraft(userId: string, id: string) {
  return getDb().transaction(async (tx) => {
    const before = await findOwned(tx, userId, id, 'draft')
    const [after] = await tx.update(transactions).set({ status: 'confirmed' }).where(eq(transactions.id, id)).returning()
    const auditId = await recordAudit(tx, { userId, entity: 'transaction', entityId: id, action: 'confirm', before, after })
    return { data: after, auditId }
  })
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

function decodeCursor(cursor: string): { at: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
    const at = new Date(iso)
    return Number.isNaN(at.getTime()) || !id ? null : { at, id }
  } catch {
    return null
  }
}

const encodeCursor = (t: Transaction) => Buffer.from(`${t.occurredAt.toISOString()}|${t.id}`).toString('base64url')

export async function listTransactions(
  userId: string, query: TransactionListQuery,
): Promise<{ data: TransactionWithCategory[]; nextCursor: string | null }> {
  const cursor = query.cursor ? decodeCursor(query.cursor) : null
  const like = query.q ? `%${escapeLike(query.q)}%` : null
  const rows = await getDb()
    .select({
      ...getTableColumns(transactions),
      category: { id: categories.id, name: categories.name, emoji: categories.emoji, color: categories.color },
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(
      eq(transactions.userId, userId),
      isNull(transactions.deletedAt),
      eq(transactions.status, query.status),
      query.type ? eq(transactions.type, query.type) : undefined,
      query.categoryId ? eq(transactions.categoryId, query.categoryId) : undefined,
      query.method ? eq(transactions.method, query.method) : undefined,
      query.from ? gte(transactions.occurredAt, istStartOfDay(query.from)) : undefined,
      query.to ? lt(transactions.occurredAt, istStartOfDay(addDays(query.to, 1))) : undefined,
      like ? or(ilike(transactions.note, like), ilike(categories.name, like)) : undefined,
      cursor ? sql`(${transactions.occurredAt}, ${transactions.id}) < (${cursor.at}, ${cursor.id}::uuid)` : undefined,
    ))
    .orderBy(desc(transactions.occurredAt), desc(transactions.id))
    .limit(query.limit + 1)

  const hasMore = rows.length > query.limit
  const data = rows.slice(0, query.limit)
  return { data, nextCursor: hasMore ? encodeCursor(data[data.length - 1]) : null }
}
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter web test:int -- src/server/services/transactions.int.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/schemas apps/web/src/server/services
git commit -m "feat(ledger): categories and transactions with drafts, cursor pagination, IST filters, undo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Recurring items and draft materialization

**Files:**
- Create: `apps/web/src/lib/schemas/recurring.ts`, `apps/web/src/server/services/recurring.ts`
- Test: `apps/web/src/server/services/recurring.int.test.ts`

**Interfaces:**
- Consumes: `createTransaction` (Task 7, with `tx` + `audit: false`), `recordAudit` (Task 6), `nextOccurrence`, `dayOfMonth`, `istNoon` (Task 4).
- Produces:
  - `recurringCreateSchema` / `type RecurringCreate` (`{ kind; name; amount; cadence; nextDueOn: ISODate; categoryId }`), `recurringPatchSchema` / `type RecurringPatch` (adds `active?: boolean`).
  - `listRecurring(userId): Promise<RecurringItem[]>` (ordered by `nextDueOn`)
  - `createRecurring(userId, input): Promise<{ data: RecurringItem; auditId: string }>`
  - `updateRecurring(userId, id, patch): Promise<{ data: RecurringItem; auditId: string }>`
  - `deleteRecurring(userId, id): Promise<{ auditId: string }>`
  - `materializeDueRecurring(userId: string, today: ISODate): Promise<number>` — number of drafts created.

- [ ] **Step 1: Write the schema**

`apps/web/src/lib/schemas/recurring.ts`:
```ts
import { z } from 'zod'
import { isoDate, paise, uuid } from './common'

export const recurringCreateSchema = z.object({
  kind: z.enum(['bill', 'income']),
  name: z.string().trim().min(1, 'Name it, e.g. “Rent”.').max(60),
  amount: paise,
  cadence: z.enum(['weekly', 'monthly', 'yearly']),
  nextDueOn: isoDate,
  categoryId: uuid,
}).strict()

export const recurringPatchSchema = recurringCreateSchema.partial().extend({ active: z.boolean().optional() }).strict()

export type RecurringCreate = z.infer<typeof recurringCreateSchema>
export type RecurringPatch = z.infer<typeof recurringPatchSchema>
```

- [ ] **Step 2: Write the failing tests**

`apps/web/src/server/services/recurring.int.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { transactionListQuerySchema } from '@/lib/schemas/transactions'
import { undo } from './audit'
import { createRecurring, deleteRecurring, listRecurring, materializeDueRecurring, updateRecurring } from './recurring'
import { listTransactions } from './transactions'

const drafts = (userId: string) => listTransactions(userId, transactionListQuerySchema.parse({ status: 'draft' }))

describe('recurring service', () => {
  let rentId: string
  let salaryId: string

  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a')
    rentId = (await builtinCategory('Rent')).id
    salaryId = (await builtinCategory('Salary', 'income')).id
  })

  const rent = (over: object = {}) => ({
    kind: 'bill' as const, name: 'Rent', amount: 1_500_000, cadence: 'monthly' as const, nextDueOn: '2026-10-31', categoryId: rentId, ...over,
  })

  it('stores the anchor day from nextDueOn and validates category kind', async () => {
    const { data } = await createRecurring('user_a', rent())
    expect(data.anchorDay).toBe(31)
    await expect(createRecurring('user_a', rent({ categoryId: salaryId }))).rejects.toMatchObject({ status: 422 })
  })

  it('materializes every missed occurrence as a draft and advances nextDueOn', async () => {
    await createRecurring('user_a', rent({ nextDueOn: '2026-08-31' }))
    const created = await materializeDueRecurring('user_a', '2026-10-11')
    expect(created).toBe(2) // Aug 31, Sep 30
    const list = await drafts('user_a')
    expect(list.data.map((d) => d.source)).toEqual(['recurring', 'recurring'])
    expect((await listRecurring('user_a'))[0].nextDueOn).toBe('2026-10-31')
  })

  it('creates income drafts for income items and skips paused items', async () => {
    await createRecurring('user_a', { kind: 'income', name: 'Salary', amount: 9_000_000, cadence: 'monthly', nextDueOn: '2026-10-01', categoryId: salaryId })
    const { data: paused } = await createRecurring('user_a', rent({ nextDueOn: '2026-10-05' }))
    await updateRecurring('user_a', paused.id, { active: false })
    expect(await materializeDueRecurring('user_a', '2026-10-11')).toBe(1)
    expect((await drafts('user_a')).data[0].type).toBe('income')
  })

  it('concurrent materialization never duplicates drafts', async () => {
    await createRecurring('user_a', rent({ nextDueOn: '2026-10-01' }))
    const counts = await Promise.all([
      materializeDueRecurring('user_a', '2026-10-11'),
      materializeDueRecurring('user_a', '2026-10-11'),
      materializeDueRecurring('user_a', '2026-10-11'),
    ])
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1)
    expect((await drafts('user_a')).data).toHaveLength(1)
  })

  it('updating nextDueOn re-anchors; delete is undoable', async () => {
    const { data } = await createRecurring('user_a', rent())
    const upd = await updateRecurring('user_a', data.id, { nextDueOn: '2026-11-05' })
    expect(upd.data.anchorDay).toBe(5)
    const { auditId } = await deleteRecurring('user_a', data.id)
    expect(await listRecurring('user_a')).toHaveLength(0)
    await undo('user_a', auditId)
    expect(await listRecurring('user_a')).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter web test:int -- src/server/services/recurring.int.test.ts`
Expected: FAIL — `./recurring` not found.

- [ ] **Step 4: Implement the recurring service**

`apps/web/src/server/services/recurring.ts`:
```ts
import 'server-only'
import { and, asc, eq, lte } from 'drizzle-orm'
import { dayOfMonth, istNoon, type ISODate } from '@/lib/dates'
import { nextOccurrence } from '@/lib/recurrence'
import type { RecurringCreate, RecurringPatch } from '@/lib/schemas/recurring'
import { getDb } from '@/server/db/client'
import { recurringItems, type RecurringItem } from '@/server/db/schema'
import { notFound } from '@/server/errors'
import { recordAudit } from './audit'
import { requireUsableCategory } from './categories'
import { createTransaction } from './transactions'

const txnKind = (kind: RecurringItem['kind']) => (kind === 'bill' ? 'expense' : 'income')
const MAX_CATCH_UP = 24 // per item per load; avoids runaway for long-missed weekly items

export async function listRecurring(userId: string): Promise<RecurringItem[]> {
  return getDb().select().from(recurringItems).where(eq(recurringItems.userId, userId)).orderBy(asc(recurringItems.nextDueOn))
}

export async function createRecurring(userId: string, input: RecurringCreate) {
  return getDb().transaction(async (tx) => {
    await requireUsableCategory(userId, input.categoryId, txnKind(input.kind), tx)
    const [row] = await tx.insert(recurringItems).values({ ...input, userId, anchorDay: dayOfMonth(input.nextDueOn) }).returning()
    const auditId = await recordAudit(tx, { userId, entity: 'recurring_item', entityId: row.id, action: 'create', before: null, after: row })
    return { data: row, auditId }
  })
}

export async function updateRecurring(userId: string, id: string, patch: RecurringPatch) {
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(recurringItems)
      .where(and(eq(recurringItems.id, id), eq(recurringItems.userId, userId))).for('update')
    if (!before) throw notFound('recurring item')
    if (patch.categoryId !== undefined || patch.kind !== undefined) {
      await requireUsableCategory(userId, patch.categoryId ?? before.categoryId, txnKind(patch.kind ?? before.kind), tx)
    }
    const [after] = await tx.update(recurringItems)
      .set({ ...patch, ...(patch.nextDueOn ? { anchorDay: dayOfMonth(patch.nextDueOn) } : {}) })
      .where(eq(recurringItems.id, id)).returning()
    const auditId = await recordAudit(tx, { userId, entity: 'recurring_item', entityId: id, action: 'update', before, after })
    return { data: after, auditId }
  })
}

export async function deleteRecurring(userId: string, id: string) {
  return getDb().transaction(async (tx) => {
    const [before] = await tx.delete(recurringItems)
      .where(and(eq(recurringItems.id, id), eq(recurringItems.userId, userId))).returning()
    if (!before) throw notFound('recurring item')
    const auditId = await recordAudit(tx, { userId, entity: 'recurring_item', entityId: id, action: 'delete', before, after: null })
    return { auditId }
  })
}

/** Turns due recurring items into drafts the user confirms (SRS staging principle). Idempotent under concurrency. */
export async function materializeDueRecurring(userId: string, today: ISODate): Promise<number> {
  return getDb().transaction(async (tx) => {
    const due = await tx.select().from(recurringItems)
      .where(and(eq(recurringItems.userId, userId), eq(recurringItems.active, true), lte(recurringItems.nextDueOn, today)))
      .orderBy(asc(recurringItems.id))
      .for('update')
    let created = 0
    for (const item of due) {
      let next = item.nextDueOn
      for (let i = 0; i < MAX_CATCH_UP && next <= today; i++) {
        await createTransaction(
          userId,
          { type: txnKind(item.kind), amount: item.amount, categoryId: item.categoryId, note: item.name, method: 'upi', occurredAt: istNoon(next) },
          { tx, status: 'draft', source: 'recurring', recurringItemId: item.id, audit: false },
        )
        created++
        next = nextOccurrence(next, item.cadence, item.anchorDay)
      }
      while (next <= today) next = nextOccurrence(next, item.cadence, item.anchorDay)
      await tx.update(recurringItems).set({ nextDueOn: next }).where(eq(recurringItems.id, item.id))
    }
    return created
  })
}
```
(The `FOR UPDATE` lock makes concurrent callers wait; after the first commits, the others re-read rows whose `next_due_on` is already in the future, so they create nothing.)

- [ ] **Step 5: Run tests**

Run: `pnpm --filter web test:int -- src/server/services/recurring.int.test.ts`
Expected: PASS (5 tests). If "concurrent materialization" fails with duplicates, confirm the `lte(nextDueOn, today)` filter is in the locked `SELECT … FOR UPDATE` (Postgres re-evaluates it after the lock is released).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/schemas/recurring.ts apps/web/src/server/services/recurring.*
git commit -m "feat(recurring): recurring bills/income with anchored schedules and locked draft materialization

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Balance check-ins and the Safe-to-Spend service

**Files:**
- Create: `apps/web/src/lib/schemas/checkins.ts`, `apps/web/src/server/services/checkins.ts`, `apps/web/src/server/services/safe-to-spend.ts`
- Test: `apps/web/src/server/services/safe-to-spend.int.test.ts`

**Interfaces:**
- Consumes: `computeSafeToSpend` (Task 4), `toISTDate` (Task 4), `createTransaction` (Task 7), `createRecurring` (Task 8), `recordAudit` (Task 6).
- Produces:
  - `checkinCreateSchema` / `type CheckinCreate` (`{ amount: number /* paise, ≥ 0 */ }`).
  - `createCheckin(userId, amount: number, takenAt?: Date): Promise<{ data: BalanceCheckin; auditId: string }>`; `getLatestCheckin(userId): Promise<BalanceCheckin | null>`.
  - `getSafeToSpend(userId: string, now?: Date): Promise<SafeToSpendResult>`.

- [ ] **Step 1: Write the schema**

`apps/web/src/lib/schemas/checkins.ts`:
```ts
import { z } from 'zod'
import { paiseOrZero } from './common'

export const checkinCreateSchema = z.object({ amount: paiseOrZero }).strict()
export type CheckinCreate = z.infer<typeof checkinCreateSchema>
```

- [ ] **Step 2: Write the failing tests**

`apps/web/src/server/services/safe-to-spend.int.test.ts`:
```ts
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { getDb } from '@/server/db/client'
import { users } from '@/server/db/schema'
import { createCheckin } from './checkins'
import { createRecurring } from './recurring'
import { getSafeToSpend } from './safe-to-spend'
import { createTransaction } from './transactions'

const NOW = new Date('2026-10-11T06:30:00Z') // 12:00 IST, Oct 11

describe('getSafeToSpend', () => {
  let foodId: string
  let salaryId: string

  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a')
    await getDb().update(users).set({ paydayDay: 1, fixedCostsEstimate: 0 }).where(eq(users.id, 'user_a'))
    foodId = (await builtinCategory('Food & Dining')).id
    salaryId = (await builtinCategory('Salary', 'income')).id
  })

  it('is unknown before the first check-in', async () => {
    expect(await getSafeToSpend('user_a', NOW)).toMatchObject({ status: 'unknown', daysLeft: 21 })
  })

  it('uses the latest check-in and only confirmed activity after it', async () => {
    await createTransaction('user_a', { type: 'expense', amount: 99_000, categoryId: foodId, method: 'upi', occurredAt: new Date('2026-10-05T06:00:00Z'), note: null })
    await createCheckin('user_a', 5_000_000, new Date('2026-10-10T06:00:00Z'))
    await createTransaction('user_a', { type: 'expense', amount: 124_000, categoryId: foodId, method: 'upi', occurredAt: new Date('2026-10-11T04:00:00Z'), note: null })
    await createTransaction('user_a', { type: 'income', amount: 20_000, categoryId: salaryId, method: 'upi', occurredAt: new Date('2026-10-11T05:00:00Z'), note: null })
    await createTransaction('user_a', { type: 'expense', amount: 1_000, categoryId: foodId, method: 'upi', occurredAt: new Date('2026-10-11T05:00:00Z'), note: null }, { status: 'draft' })

    const r = await getSafeToSpend('user_a', NOW)
    expect(r.breakdown.balance).toBe(5_000_000 - 124_000 + 20_000)
    expect(r.breakdown.committedOut).toBe(1_000) // pending draft after check-in
  })

  it('materializes due recurring items and counts schedule within the cycle', async () => {
    const rentId = (await builtinCategory('Rent')).id
    await createCheckin('user_a', 5_000_000, new Date('2026-10-01T06:00:00Z'))
    await createRecurring('user_a', { kind: 'bill', name: 'Rent', amount: 1_500_000, cadence: 'monthly', nextDueOn: '2026-10-05', categoryId: rentId })
    await createRecurring('user_a', { kind: 'bill', name: 'Netflix', amount: 64_900, cadence: 'monthly', nextDueOn: '2026-10-20', categoryId: rentId })

    const r = await getSafeToSpend('user_a', NOW)
    // Oct 5 rent became a pending draft (after the check-in); Netflix on Oct 20 is still scheduled.
    expect(r.breakdown.committedOut).toBe(1_500_000 + 64_900)
    expect(r.amount).toBe(5_000_000 - 1_564_900)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter web test:int -- src/server/services/safe-to-spend.int.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement check-ins**

`apps/web/src/server/services/checkins.ts`:
```ts
import 'server-only'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '@/server/db/client'
import { balanceCheckins, type BalanceCheckin } from '@/server/db/schema'
import { recordAudit } from './audit'

export async function createCheckin(userId: string, amount: number, takenAt: Date = new Date()) {
  return getDb().transaction(async (tx) => {
    const [row] = await tx.insert(balanceCheckins).values({ userId, amount, takenAt }).returning()
    const auditId = await recordAudit(tx, { userId, entity: 'balance_checkin', entityId: row.id, action: 'create', before: null, after: row })
    return { data: row, auditId }
  })
}

export async function getLatestCheckin(userId: string): Promise<BalanceCheckin | null> {
  const [row] = await getDb().select().from(balanceCheckins)
    .where(eq(balanceCheckins.userId, userId)).orderBy(desc(balanceCheckins.takenAt)).limit(1)
  return row ?? null
}
```

- [ ] **Step 5: Implement the Safe-to-Spend service**

`apps/web/src/server/services/safe-to-spend.ts`:
```ts
import 'server-only'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { toISTDate } from '@/lib/dates'
import { computeSafeToSpend, type SafeToSpendResult } from '@/lib/safe-to-spend'
import { getDb } from '@/server/db/client'
import { transactions } from '@/server/db/schema'
import { notFound } from '@/server/errors'
import { getLatestCheckin } from './checkins'
import { listRecurring, materializeDueRecurring } from './recurring'
import { getUser } from './users'

const sumWhere = (cond: ReturnType<typeof and>, column = transactions.amount) =>
  getDb()
    .select({ total: sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number) })
    .from(transactions)
    .where(cond)
    .then(([r]) => r.total)

export async function getSafeToSpend(userId: string, now: Date = new Date()): Promise<SafeToSpendResult> {
  const today = toISTDate(now)
  await materializeDueRecurring(userId, today)

  const user = await getUser(userId)
  if (!user) throw notFound('account')
  const [checkin, recurring] = await Promise.all([getLatestCheckin(userId), listRecurring(userId)])

  const after = checkin
    ? (type: 'expense' | 'income', status: 'confirmed' | 'draft') =>
        and(
          eq(transactions.userId, userId), isNull(transactions.deletedAt),
          eq(transactions.type, type), eq(transactions.status, status),
          gt(transactions.occurredAt, checkin.takenAt),
        )
    : null

  const [income, expenseShare, billDrafts, incomeDrafts] = after
    ? await Promise.all([
        sumWhere(after('income', 'confirmed')),
        sumWhere(after('expense', 'confirmed'), transactions.personalShare),
        sumWhere(after('expense', 'draft')),
        sumWhere(after('income', 'draft')),
      ])
    : [0, 0, 0, 0]

  return computeSafeToSpend({
    today,
    paydayDay: user.paydayDay,
    fixedCostsEstimate: user.fixedCostsEstimate,
    receivables: 0, // Part B
    checkin: checkin ? { amount: checkin.amount } : null,
    confirmedIncomeSinceCheckin: income,
    confirmedExpenseShareSinceCheckin: expenseShare,
    pendingBillDrafts: billDrafts,
    pendingIncomeDrafts: incomeDrafts,
    recurring: recurring.map((r) => ({
      kind: r.kind, amount: r.amount, cadence: r.cadence, nextDueOn: r.nextDueOn, anchorDay: r.anchorDay, active: r.active,
    })),
  })
}
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter web test:int -- src/server/services/safe-to-spend.int.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/schemas/checkins.ts apps/web/src/server/services/checkins.ts apps/web/src/server/services/safe-to-spend.*
git commit -m "feat(sts): balance check-ins and Safe-to-Spend service over the ledger

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Budgets, insights, CSV export and demo seed

**Files:**
- Create: `apps/web/src/lib/schemas/budgets.ts`, `apps/web/src/server/services/budgets.ts`, `apps/web/src/server/services/insights.ts`, `apps/web/src/server/services/export.ts`, `apps/web/src/server/services/demo-seed.ts`, `apps/web/scripts/seed-demo.ts`
- Test: `apps/web/src/server/services/budgets.int.test.ts`, `insights.int.test.ts`, `export.int.test.ts`, `demo-seed.int.test.ts` (all in `src/server/services/`)

**Interfaces:**
- Consumes: `payCycle`, `toISTDate`, `istStartOfDay`, `addDays`, `diffDays` (Task 4); `requireUsableCategory` (Task 7); `recordAudit` (Task 6); `createTransaction` (Task 7); `createRecurring` (Task 8); `createCheckin` (Task 9); `updateMe` (Task 5); `paiseToRupeeString` (Task 4).
- Produces:
  - `budgetPutSchema` / `type BudgetPut` (`{ monthlyLimit: number }`).
  - `type BudgetWithSpend = { categoryId: string; name: string; emoji: string; color: string; monthlyLimit: number; spent: number; budgetId: string }`
  - `listBudgets(userId, now?: Date): Promise<BudgetWithSpend[]>` (spent = confirmed expense `personalShare` in the current pay cycle)
  - `upsertBudget(userId, categoryId, monthlyLimit): Promise<{ data: Budget; auditId: string }>`; `deleteBudget(userId, categoryId): Promise<{ auditId: string }>`
  - `type Insights = { from: ISODate; to: ISODate; totalExpense: number; totalIncome: number; byDay: { date: ISODate; expense: number }[]; byCategory: { categoryId: string; name: string; emoji: string; color: string; amount: number; previous: number }[] }`
  - `getInsights(userId, from: ISODate, to: ISODate): Promise<Insights>` (previous = same-length window immediately before `from`)
  - `exportTransactionsCsv(userId): Promise<string>`
  - `seedDemoData(userId: string, now?: Date): Promise<{ transactions: number }>`

- [ ] **Step 1: Write the schema**

`apps/web/src/lib/schemas/budgets.ts`:
```ts
import { z } from 'zod'
import { paise } from './common'

export const budgetPutSchema = z.object({ monthlyLimit: paise }).strict()
export type BudgetPut = z.infer<typeof budgetPutSchema>
```

- [ ] **Step 2: Write the failing tests**

`apps/web/src/server/services/budgets.int.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { undo } from './audit'
import { deleteBudget, listBudgets, upsertBudget } from './budgets'
import { createTransaction } from './transactions'

const NOW = new Date('2026-10-11T06:30:00Z')

describe('budgets', () => {
  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a')
  })

  it('reports spend in the current pay cycle against the limit', async () => {
    const food = await builtinCategory('Food & Dining')
    await upsertBudget('user_a', food.id, 500_000)
    await createTransaction('user_a', { type: 'expense', amount: 320_000, categoryId: food.id, method: 'upi', occurredAt: new Date('2026-10-03T06:00:00Z'), note: null })
    await createTransaction('user_a', { type: 'expense', amount: 999_000, categoryId: food.id, method: 'upi', occurredAt: new Date('2026-09-25T06:00:00Z'), note: null }) // previous cycle
    const [b] = await listBudgets('user_a', NOW)
    expect(b).toMatchObject({ name: 'Food & Dining', monthlyLimit: 500_000, spent: 320_000 })
  })

  it('upsert replaces the limit; delete is undoable', async () => {
    const food = await builtinCategory('Food & Dining')
    await upsertBudget('user_a', food.id, 500_000)
    await upsertBudget('user_a', food.id, 700_000)
    expect((await listBudgets('user_a', NOW))[0].monthlyLimit).toBe(700_000)
    const { auditId } = await deleteBudget('user_a', food.id)
    expect(await listBudgets('user_a', NOW)).toHaveLength(0)
    await undo('user_a', auditId)
    expect(await listBudgets('user_a', NOW)).toHaveLength(1)
  })

  it('rejects income categories', async () => {
    const salary = await builtinCategory('Salary', 'income')
    await expect(upsertBudget('user_a', salary.id, 1)).rejects.toMatchObject({ status: 422 })
  })
})
```

`apps/web/src/server/services/insights.int.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { getInsights } from './insights'
import { createTransaction } from './transactions'

describe('getInsights', () => {
  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a')
  })

  it('groups by IST day and compares with the previous window', async () => {
    const food = await builtinCategory('Food & Dining')
    const taxi = await builtinCategory('Transport')
    const add = (amount: number, iso: string, categoryId = food.id) =>
      createTransaction('user_a', { type: 'expense', amount, categoryId, method: 'upi', occurredAt: new Date(iso), note: null })
    await add(10_000, '2026-10-11T19:00:00Z')          // 00:30 IST Oct 12
    await add(20_000, '2026-10-12T06:00:00Z')          // Oct 12
    await add(5_000, '2026-10-13T06:00:00Z', taxi.id)  // Oct 13
    await add(7_000, '2026-10-10T06:00:00Z')           // previous window (Oct 10–11)

    const r = await getInsights('user_a', '2026-10-12', '2026-10-13')
    expect(r.totalExpense).toBe(35_000)
    expect(r.byDay).toEqual([{ date: '2026-10-12', expense: 30_000 }, { date: '2026-10-13', expense: 5_000 }])
    const foodRow = r.byCategory.find((c) => c.name === 'Food & Dining')!
    expect(foodRow).toMatchObject({ amount: 30_000, previous: 7_000 })
  })
})
```

`apps/web/src/server/services/export.int.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { exportTransactionsCsv } from './export'
import { createTransaction } from './transactions'

describe('exportTransactionsCsv', () => {
  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a')
  })

  it('exports rupees with IST dates and neutralizes formula injection', async () => {
    const food = await builtinCategory('Food & Dining')
    await createTransaction('user_a', {
      type: 'expense', amount: 125_050, categoryId: food.id, method: 'card',
      occurredAt: new Date('2026-10-11T19:00:00Z'), note: '=HYPERLINK("http://x","y"), "quoted"',
    })
    const csv = await exportTransactionsCsv('user_a')
    const [header, row] = csv.trim().split('\n')
    expect(header).toBe('date,type,amount_inr,category,note,method,status,source')
    expect(row).toBe(`2026-10-12,expense,1250.50,Food & Dining,"'=HYPERLINK(""http://x"",""y""), ""quoted""",card,confirmed,manual`)
  })
})
```

`apps/web/src/server/services/demo-seed.int.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { makeUser, resetDb } from '@test/int/helpers'
import { seedDemoData } from './demo-seed'
import { getSafeToSpend } from './safe-to-spend'

describe('seedDemoData', () => {
  beforeEach(async () => {
    await resetDb()
    await makeUser('user_demo')
  })

  it('creates a realistic, Safe-to-Spend-ready dataset', async () => {
    const now = new Date('2026-10-11T06:30:00Z')
    const { transactions } = await seedDemoData('user_demo', now)
    expect(transactions).toBeGreaterThan(40)
    expect((await getSafeToSpend('user_demo', now)).status).toBe('ok')
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --filter web test:int -- src/server/services/budgets.int.test.ts src/server/services/insights.int.test.ts src/server/services/export.int.test.ts src/server/services/demo-seed.int.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement budgets**

`apps/web/src/server/services/budgets.ts`:
```ts
import 'server-only'
import { and, asc, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import { payCycle } from '@/lib/cycle'
import { addDays, istStartOfDay, toISTDate } from '@/lib/dates'
import { getDb } from '@/server/db/client'
import { budgets, categories, transactions, type Budget } from '@/server/db/schema'
import { notFound } from '@/server/errors'
import { recordAudit } from './audit'
import { requireUsableCategory } from './categories'
import { getUser } from './users'

export type BudgetWithSpend = {
  budgetId: string; categoryId: string; name: string; emoji: string; color: string; monthlyLimit: number; spent: number
}

export async function listBudgets(userId: string, now: Date = new Date()): Promise<BudgetWithSpend[]> {
  const user = await getUser(userId)
  if (!user) throw notFound('account')
  const cycle = payCycle(toISTDate(now), user.paydayDay)
  const spent = sql<number>`coalesce(sum(${transactions.personalShare}), 0)`.mapWith(Number)
  return getDb()
    .select({
      budgetId: budgets.id, categoryId: budgets.categoryId, name: categories.name, emoji: categories.emoji,
      color: categories.color, monthlyLimit: budgets.monthlyLimit, spent,
    })
    .from(budgets)
    .innerJoin(categories, eq(categories.id, budgets.categoryId))
    .leftJoin(transactions, and(
      eq(transactions.categoryId, budgets.categoryId), eq(transactions.userId, userId),
      eq(transactions.type, 'expense'), eq(transactions.status, 'confirmed'), isNull(transactions.deletedAt),
      gte(transactions.occurredAt, istStartOfDay(cycle.cycleStart)),
      lt(transactions.occurredAt, istStartOfDay(addDays(cycle.cycleEnd, 1))),
    ))
    .where(eq(budgets.userId, userId))
    .groupBy(budgets.id, categories.id)
    .orderBy(asc(categories.sort))
}

export async function upsertBudget(userId: string, categoryId: string, monthlyLimit: number) {
  return getDb().transaction(async (tx) => {
    await requireUsableCategory(userId, categoryId, 'expense', tx)
    const [before] = await tx.select().from(budgets).where(and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId)))
    const [after] = await tx.insert(budgets).values({ userId, categoryId, monthlyLimit })
      .onConflictDoUpdate({ target: [budgets.userId, budgets.categoryId], set: { monthlyLimit } })
      .returning()
    const auditId = await recordAudit(tx, {
      userId, entity: 'budget', entityId: after.id, action: before ? 'update' : 'create', before: before ?? null, after,
    })
    return { data: after as Budget, auditId }
  })
}

export async function deleteBudget(userId: string, categoryId: string) {
  return getDb().transaction(async (tx) => {
    const [before] = await tx.delete(budgets)
      .where(and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId))).returning()
    if (!before) throw notFound('budget')
    const auditId = await recordAudit(tx, { userId, entity: 'budget', entityId: before.id, action: 'delete', before, after: null })
    return { auditId }
  })
}
```

- [ ] **Step 5: Implement insights**

`apps/web/src/server/services/insights.ts`:
```ts
import 'server-only'
import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import { addDays, diffDays, istStartOfDay, type ISODate } from '@/lib/dates'
import { getDb } from '@/server/db/client'
import { categories, transactions } from '@/server/db/schema'

export type Insights = {
  from: ISODate; to: ISODate; totalExpense: number; totalIncome: number
  byDay: { date: ISODate; expense: number }[]
  byCategory: { categoryId: string; name: string; emoji: string; color: string; amount: number; previous: number }[]
}

const istDay = sql<string>`to_char(${transactions.occurredAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`

function window(userId: string, from: ISODate, to: ISODate) {
  return and(
    eq(transactions.userId, userId), eq(transactions.status, 'confirmed'), isNull(transactions.deletedAt),
    gte(transactions.occurredAt, istStartOfDay(from)), lt(transactions.occurredAt, istStartOfDay(addDays(to, 1))),
  )
}

async function byCategory(userId: string, from: ISODate, to: ISODate) {
  return getDb()
    .select({
      categoryId: categories.id, name: categories.name, emoji: categories.emoji, color: categories.color,
      amount: sql<number>`sum(${transactions.personalShare})`.mapWith(Number),
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(window(userId, from, to), eq(transactions.type, 'expense')))
    .groupBy(categories.id)
}

export async function getInsights(userId: string, from: ISODate, to: ISODate): Promise<Insights> {
  const length = diffDays(to, from) + 1
  const prevFrom = addDays(from, -length)
  const prevTo = addDays(from, -1)
  const db = getDb()

  const [totals, days, current, previous] = await Promise.all([
    db.select({
      expense: sql<number>`coalesce(sum(${transactions.personalShare}) filter (where ${transactions.type} = 'expense'), 0)`.mapWith(Number),
      income: sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = 'income'), 0)`.mapWith(Number),
    }).from(transactions).where(window(userId, from, to)),
    db.select({ date: istDay, expense: sql<number>`sum(${transactions.personalShare})`.mapWith(Number) })
      .from(transactions)
      .where(and(window(userId, from, to), eq(transactions.type, 'expense')))
      .groupBy(istDay).orderBy(istDay),
    byCategory(userId, from, to),
    byCategory(userId, prevFrom, prevTo),
  ])

  const prevMap = new Map(previous.map((p) => [p.categoryId, p.amount]))
  return {
    from, to,
    totalExpense: totals[0].expense,
    totalIncome: totals[0].income,
    byDay: days,
    byCategory: current
      .map((c) => ({ ...c, previous: prevMap.get(c.categoryId) ?? 0 }))
      .sort((a, b) => b.amount - a.amount),
  }
}
```

- [ ] **Step 6: Implement CSV export**

`apps/web/src/server/services/export.ts`:
```ts
import 'server-only'
import { asc, eq, and, isNull } from 'drizzle-orm'
import { toISTDate } from '@/lib/dates'
import { paiseToRupeeString } from '@/lib/money'
import { getDb } from '@/server/db/client'
import { categories, transactions } from '@/server/db/schema'

const HEADER = ['date', 'type', 'amount_inr', 'category', 'note', 'method', 'status', 'source']

/** RFC 4180 quoting plus OWASP CSV-injection neutralization. */
export function csvCell(value: string): string {
  let v = value
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export async function exportTransactionsCsv(userId: string): Promise<string> {
  const rows = await getDb()
    .select({
      occurredAt: transactions.occurredAt, type: transactions.type, amount: transactions.amount,
      category: categories.name, note: transactions.note, method: transactions.method,
      status: transactions.status, source: transactions.source,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))
    .orderBy(asc(transactions.occurredAt))

  const lines = rows.map((r) =>
    [toISTDate(r.occurredAt), r.type, paiseToRupeeString(r.amount), r.category, r.note ?? '', r.method, r.status, r.source]
      .map(csvCell)
      .join(','),
  )
  return [HEADER.join(','), ...lines].join('\n') + '\n'
}
```

- [ ] **Step 7: Implement the demo seed and its CLI**

`apps/web/src/server/services/demo-seed.ts`:
```ts
import 'server-only'
import { eq, isNull } from 'drizzle-orm'
import { payCycle } from '@/lib/cycle'
import { addDays, istNoon, toISTDate } from '@/lib/dates'
import { getDb } from '@/server/db/client'
import { categories, users } from '@/server/db/schema'
import { createCheckin } from './checkins'
import { createRecurring } from './recurring'
import { createTransaction } from './transactions'
import { updateMe } from './users'

const SPENDS: [string, string, number][] = [
  ['Food & Dining', 'Toit dinner', 124_000], ['Transport', 'Uber to office', 31_000], ['Groceries', 'Blinkit', 86_500],
  ['Food & Dining', 'Chai & samosa', 6_000], ['Entertainment', 'PVR tickets', 58_000], ['Shopping', 'Myntra', 249_900],
  ['Transport', 'Metro recharge', 50_000], ['Food & Dining', 'Swiggy biryani', 38_900], ['Health', 'Pharmacy', 21_000],
  ['Personal Care', 'Haircut', 35_000], ['Food & Dining', 'Third Wave coffee', 27_000], ['Groceries', 'Zepto', 42_300],
]

/** Deterministic 60-day history for class demos. Never run against production data. */
export async function seedDemoData(userId: string, now: Date = new Date()): Promise<{ transactions: number }> {
  const builtins = await getDb().select().from(categories).where(isNull(categories.userId))
  const cat = (name: string, kind: 'expense' | 'income' = 'expense') =>
    builtins.find((c) => c.name === name && c.kind === kind)!.id
  const today = toISTDate(now)

  await updateMe(userId, { paydayDay: 1, monthlyIncome: 9_000_000, fixedCostsEstimate: 800_000, upiId: 'demo@okaxis' })
  await createCheckin(userId, 6_200_000, new Date(now.getTime() - 20 * 86_400_000))

  let count = 0
  for (let day = 60; day >= 0; day--) {
    const date = addDays(today, -day)
    const picks = [SPENDS[day % SPENDS.length], ...(day % 3 === 0 ? [SPENDS[(day * 7) % SPENDS.length]] : [])]
    for (const [name, note, amount] of picks) {
      await createTransaction(userId, {
        type: 'expense', amount: amount + (day % 5) * 1_000, categoryId: cat(name), note,
        method: day % 4 === 0 ? 'card' : 'upi', occurredAt: istNoon(date),
      })
      count++
    }
  }
  const { nextPayday } = payCycle(today, 1) // first of next month
  await createRecurring(userId, { kind: 'bill', name: 'Rent', amount: 1_800_000, cadence: 'monthly', nextDueOn: addDays(nextPayday, 4), categoryId: cat('Rent') })
  await createRecurring(userId, { kind: 'bill', name: 'Netflix', amount: 64_900, cadence: 'monthly', nextDueOn: addDays(today, 9), categoryId: cat('Subscriptions') })
  await createRecurring(userId, { kind: 'bill', name: 'Jio recharge', amount: 34_900, cadence: 'monthly', nextDueOn: addDays(today, 4), categoryId: cat('Bills & Utilities') })
  await createRecurring(userId, { kind: 'income', name: 'Salary', amount: 9_000_000, cadence: 'monthly', nextDueOn: nextPayday, categoryId: cat('Salary', 'income') })
  return { transactions: count }
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const [u] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, email))
  return u?.id ?? null
}
```

`apps/web/scripts/seed-demo.ts`:
```ts
import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

async function main() {
  const email = process.argv[2]
  if (!email) throw new Error('Usage: pnpm db:seed:demo <email-of-a-user-who-has-signed-in>')
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data in production')
  const { findUserIdByEmail, seedDemoData } = await import('../src/server/services/demo-seed')
  const userId = await findUserIdByEmail(email)
  if (!userId) throw new Error(`No user with email ${email}. Sign in once first.`)
  const result = await seedDemoData(userId)
  console.log(`Seeded ${result.transactions} transactions for ${email}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

Add the script (tsx needs the alias; use `--tsconfig` so `@/` resolves, and stub `server-only` via a conditions flag):
```bash
cd apps/web
pnpm pkg set scripts.db:seed:demo="tsx --conditions=react-server scripts/seed-demo.ts"
cd ../..
```
(`--conditions=react-server` makes `server-only` resolve to its no-op export.)

- [ ] **Step 8: Run tests**

Run: `pnpm --filter web test:int`
Expected: PASS (all integration files so far).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src apps/web/scripts apps/web/package.json
git commit -m "feat(insights): budgets by pay cycle, IST-day insights, safe CSV export, demo seed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: HTTP layer and all `/api/v1` endpoints

**Files:**
- Create: `apps/web/src/server/logger.ts`, `apps/web/src/server/http.ts`, `apps/web/src/server/storage.ts`, and route files:
  - `src/app/api/v1/me/route.ts` (GET, PATCH)
  - `src/app/api/v1/me/upi-qr/route.ts` (POST, DELETE)
  - `src/app/api/v1/files/[...key]/route.ts` (GET)
  - `src/app/api/v1/categories/route.ts` (GET, POST)
  - `src/app/api/v1/transactions/route.ts` (GET, POST)
  - `src/app/api/v1/transactions/[id]/route.ts` (PATCH, DELETE)
  - `src/app/api/v1/transactions/[id]/confirm/route.ts` (POST)
  - `src/app/api/v1/transactions/[id]/skip/route.ts` (POST)
  - `src/app/api/v1/recurring/route.ts` (GET, POST)
  - `src/app/api/v1/recurring/[id]/route.ts` (PATCH, DELETE)
  - `src/app/api/v1/checkins/route.ts` (POST)
  - `src/app/api/v1/checkins/latest/route.ts` (GET)
  - `src/app/api/v1/budgets/route.ts` (GET)
  - `src/app/api/v1/budgets/[categoryId]/route.ts` (PUT, DELETE)
  - `src/app/api/v1/summary/safe-to-spend/route.ts` (GET)
  - `src/app/api/v1/insights/route.ts` (GET)
  - `src/app/api/v1/export.csv/route.ts` (GET)
  - `src/app/api/v1/undo/[auditId]/route.ts` (POST)
- Test: `apps/web/src/server/http.test.ts`, `apps/web/src/app/api/v1/api.int.test.ts`

**Interfaces:**
- Consumes: every service from Tasks 5–10; `requireCurrentUser` (Task 5).
- Produces (used by Plan A2's client):
  - `route<P>(fn: (ctx: { req: Request; user: User; params: P; requestId: string }) => Promise<unknown>, opts?: { status?: number })` → Next route handler.
  - `parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>>`; `parseQuery<S>(req: Request, schema: S): z.infer<S>`; `toErrorResponse(err: unknown, requestId: string): Response`.
  - `interface Storage { put(key: string, data: Uint8Array, contentType: string): Promise<void>; get(key: string): Promise<{ data: Uint8Array; contentType: string } | null>; remove(key: string): Promise<void> }`; `getStorage(): Storage`; `sniffImageType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null`.
  - **Response contract:** GET → `{ data }` (lists add `nextCursor`); mutations → `{ data?, auditId }` with status 201 for creates; errors per Global Constraints.

- [ ] **Step 1: Install pino and write the failing unit test for error mapping**

```bash
cd apps/web && pnpm add pino@^10.4.0 && cd ../..
```

`apps/web/src/server/http.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AppError } from './errors'
import { sniffImageType, toErrorResponse } from './http'

describe('toErrorResponse', () => {
  it('maps AppError to its status and shape', async () => {
    const res = toErrorResponse(new AppError('invalid', 'Pick a category.', 422, 'categoryId'), 'r1')
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: { code: 'invalid', message: 'Pick a category.', field: 'categoryId' }, requestId: 'r1' })
  })

  it('maps ZodError to 422 with the first field path', async () => {
    const parsed = z.object({ amount: z.number().min(1, 'Too small') }).safeParse({ amount: 0 })
    const res = toErrorResponse(parsed.error, 'r2')
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: { code: 'invalid', field: 'amount', message: 'Too small' } })
  })

  it('hides internals for unknown errors', async () => {
    const res = toErrorResponse(new Error('db exploded: password=…'), 'r3')
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.message).not.toContain('password')
    expect(body.requestId).toBe('r3')
  })
})

describe('sniffImageType', () => {
  it('detects png/jpeg/webp by magic bytes', () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffImageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns='))).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web test -- src/server/http.test.ts`
Expected: FAIL — `./http` not found.

- [ ] **Step 3: Implement logger, http and storage**

`apps/web/src/server/logger.ts`:
```ts
import 'server-only'
import pino from 'pino'

export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', base: { app: 'coinflow-web' } })
```

`apps/web/src/server/http.ts`:
```ts
import 'server-only'
import { z } from 'zod'
import type { User } from '@/server/db/schema'
import { requireCurrentUser } from './auth'
import { AppError } from './errors'
import { logger } from './logger'

type Ctx<P> = { req: Request; user: User; params: P; requestId: string }

export function toErrorResponse(err: unknown, requestId: string): Response {
  const headers = { 'x-request-id': requestId }
  if (err instanceof AppError) {
    const error = { code: err.code, message: err.message, ...(err.field ? { field: err.field } : {}) }
    return Response.json({ error, requestId }, { status: err.status, headers })
  }
  if (err instanceof z.ZodError) {
    const issue = err.issues[0]
    const field = issue?.path.join('.') || undefined
    return Response.json(
      { error: { code: 'invalid', message: issue?.message ?? 'Please check your input.', ...(field ? { field } : {}) }, requestId },
      { status: 422, headers },
    )
  }
  logger.error({ err, requestId }, 'unhandled error')
  return Response.json(
    { error: { code: 'internal', message: 'Something went wrong on our side. Please try again.' }, requestId },
    { status: 500, headers },
  )
}

export function route<P extends Record<string, string | string[]> = Record<string, never>>(
  fn: (ctx: Ctx<P>) => Promise<unknown>,
  opts: { status?: number } = {},
) {
  return async (req: Request, segment?: { params: Promise<P> }): Promise<Response> => {
    const requestId = crypto.randomUUID().slice(0, 8)
    try {
      const user = await requireCurrentUser()
      const params = (segment ? await segment.params : {}) as P
      const result = await fn({ req, user, params, requestId })
      if (result instanceof Response) return result
      return Response.json(result ?? { ok: true }, { status: opts.status ?? 200, headers: { 'x-request-id': requestId } })
    } catch (err) {
      return toErrorResponse(err, requestId)
    }
  }
}

export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new AppError('invalid_json', 'We couldn’t read that request.', 400)
  }
  return schema.parse(body)
}

export function parseQuery<S extends z.ZodType>(req: Request, schema: S): z.infer<S> {
  const params = Object.fromEntries(new URL(req.url).searchParams)
  return schema.parse(params)
}

export function sniffImageType(b: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') {
    return 'image/webp'
  }
  return null
}
```

`apps/web/src/server/storage.ts`:
```ts
import 'server-only'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { AppError } from './errors'

export interface Storage {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<{ data: Uint8Array; contentType: string } | null>
  remove(key: string): Promise<void>
}

const SEGMENT = /^[A-Za-z0-9_.-]+$/
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }

function resolveKey(root: string, key: string): string {
  const segments = key.split('/')
  if (segments.some((s) => !SEGMENT.test(s) || s === '.' || s === '..')) throw new AppError('bad_key', 'Invalid file path.', 400)
  return path.join(root, ...segments)
}

export function localStorageDriver(root: string): Storage {
  return {
    async put(key, data) {
      const file = resolveKey(root, key)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, data)
    },
    async get(key) {
      try {
        const data = await readFile(resolveKey(root, key))
        return { data: new Uint8Array(data), contentType: TYPES[key.split('.').pop() ?? ''] ?? 'application/octet-stream' }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw err
      }
    },
    async remove(key) {
      await rm(resolveKey(root, key), { force: true })
    },
  }
}

export function getStorage(): Storage {
  return localStorageDriver(path.resolve(process.env.UPLOADS_DIR ?? './uploads'))
}
```

Run: `pnpm --filter web test -- src/server/http.test.ts` → Expected: PASS.

- [ ] **Step 4: Write the failing API integration test**

`apps/web/src/app/api/v1/api.int.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { builtinCategory, resetDb } from '@test/int/helpers'
import { clerkState } from '@test/int/clerk-mock'

vi.mock('@clerk/nextjs/server', async () => (await import('@test/int/clerk-mock')).clerkModule)

import * as me from './me/route'
import * as upiQr from './me/upi-qr/route'
import * as files from './files/[...key]/route'
import * as txns from './transactions/route'
import * as txn from './transactions/[id]/route'
import * as checkins from './checkins/route'
import * as sts from './summary/safe-to-spend/route'
import * as undoRoute from './undo/[auditId]/route'
import * as exportCsv from './export.csv/route'

const url = (p: string) => `http://localhost/api/v1${p}`
const json = (method: string, body: unknown) =>
  ({ method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const params = <P>(p: P) => ({ params: Promise.resolve(p) })
const as = (userId: string | null) => { clerkState.userId = userId }

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

describe('/api/v1', () => {
  let foodId: string

  beforeEach(async () => {
    await resetDb()
    foodId = (await builtinCategory('Food & Dining')).id
    as('user_a')
  })

  it('401s when signed out, with the standard error shape', async () => {
    as(null)
    const res = await me.GET(new Request(url('/me')))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: { code: 'unauthorized' }, requestId: expect.any(String) })
  })

  it('GET /me lazily creates the user; PATCH validates', async () => {
    const res = await me.GET(new Request(url('/me')))
    expect((await res.json()).data).toMatchObject({ id: 'user_a', paydayDay: 1 })
    const bad = await me.PATCH(new Request(url('/me'), json('PATCH', { paydayDay: 40 })))
    expect(bad.status).toBe(422)
    expect((await bad.json()).error.field).toBe('paydayDay')
  })

  it('create → list → delete → undo round-trip', async () => {
    await me.GET(new Request(url('/me')))
    const created = await txns.POST(new Request(url('/transactions'), json('POST', { type: 'expense', amount: 45000, categoryId: foodId })))
    expect(created.status).toBe(201)
    const { data, auditId } = await created.json()
    expect(auditId).toEqual(expect.any(String))

    const del = await txn.DELETE(new Request(url(`/transactions/${data.id}`), { method: 'DELETE' }), params({ id: data.id }))
    const { auditId: delAudit } = await del.json()
    expect((await (await txns.GET(new Request(url('/transactions')))).json()).data).toHaveLength(0)

    const un = await undoRoute.POST(new Request(url(`/undo/${delAudit}`), { method: 'POST' }), params({ auditId: delAudit }))
    expect(un.status).toBe(200)
    expect((await (await txns.GET(new Request(url('/transactions')))).json()).data).toHaveLength(1)
  })

  it('user B gets 404 for user A’s transaction and audit ids', async () => {
    await me.GET(new Request(url('/me')))
    const { data, auditId } = await (await txns.POST(new Request(url('/transactions'), json('POST', { type: 'expense', amount: 1000, categoryId: foodId })))).json()
    as('user_b')
    await me.GET(new Request(url('/me')))
    const patch = await txn.PATCH(new Request(url(`/transactions/${data.id}`), json('PATCH', { amount: 1 })), params({ id: data.id }))
    expect(patch.status).toBe(404)
    const un = await undoRoute.POST(new Request(url(`/undo/${auditId}`), { method: 'POST' }), params({ auditId }))
    expect(un.status).toBe(404)
  })

  it('safe-to-spend goes from unknown to ok after a check-in', async () => {
    await me.GET(new Request(url('/me')))
    expect((await (await sts.GET(new Request(url('/summary/safe-to-spend')))).json()).data.status).toBe('unknown')
    expect((await checkins.POST(new Request(url('/checkins'), json('POST', { amount: 5_000_000 })))).status).toBe(201)
    expect((await (await sts.GET(new Request(url('/summary/safe-to-spend')))).json()).data.status).toBe('ok')
  })

  it('UPI QR: accepts PNG, rejects non-images, serves only to its owner', async () => {
    await me.GET(new Request(url('/me')))
    const form = new FormData()
    form.set('file', new File([PNG], 'qr.png', { type: 'image/png' }))
    const up = await upiQr.POST(new Request(url('/me/upi-qr'), { method: 'POST', body: form }))
    expect(up.status).toBe(201)
    const { data } = await up.json()
    const key = (data.upiQrUrl as string).replace('/api/v1/files/', '')

    const own = await files.GET(new Request(url(`/files/${key}`)), params({ key: key.split('/') }))
    expect(own.status).toBe(200)
    expect(own.headers.get('content-type')).toBe('image/png')

    const svgForm = new FormData()
    svgForm.set('file', new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'x.png', { type: 'image/png' }))
    expect((await upiQr.POST(new Request(url('/me/upi-qr'), { method: 'POST', body: svgForm }))).status).toBe(422)

    as('user_b')
    await me.GET(new Request(url('/me')))
    expect((await files.GET(new Request(url(`/files/${key}`)), params({ key: key.split('/') }))).status).toBe(404)
  })

  it('export.csv returns a CSV attachment', async () => {
    await me.GET(new Request(url('/me')))
    const res = await exportCsv.GET(new Request(url('/export.csv')))
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('coinflow-transactions.csv')
  })
})
```

- [ ] **Step 5: Run it to verify it fails**

Run: `pnpm --filter web test:int -- src/app/api/v1/api.int.test.ts`
Expected: FAIL — route modules not found.

- [ ] **Step 6: Implement the route files**

`src/app/api/v1/me/route.ts`:
```ts
import { mePatchSchema } from '@/lib/schemas/me'
import { parseJson, route } from '@/server/http'
import { updateMe } from '@/server/services/users'

export const GET = route(async ({ user }) => ({ data: user }))
export const PATCH = route(async ({ req, user }) => ({ data: await updateMe(user.id, await parseJson(req, mePatchSchema)) }))
```

`src/app/api/v1/me/upi-qr/route.ts`:
```ts
import { eq } from 'drizzle-orm'
import { getDb } from '@/server/db/client'
import { users } from '@/server/db/schema'
import { invalid } from '@/server/errors'
import { route, sniffImageType } from '@/server/http'
import { getStorage } from '@/server/storage'

const MAX_BYTES = 2 * 1024 * 1024
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const

export const POST = route(async ({ req, user }) => {
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) throw invalid('file', 'Choose an image of your UPI QR code.')
  if (file.size > MAX_BYTES) throw invalid('file', 'That image is over 2 MB. Try a smaller screenshot.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniffImageType(bytes)
  if (!type) throw invalid('file', 'Please upload a PNG, JPEG or WebP image.')

  const key = `qr/${user.id}/${crypto.randomUUID()}.${EXT[type]}`
  const storage = getStorage()
  await storage.put(key, bytes, type)
  if (user.upiQrUrl) await storage.remove(user.upiQrUrl.replace('/api/v1/files/', ''))
  const [updated] = await getDb().update(users).set({ upiQrUrl: `/api/v1/files/${key}` }).where(eq(users.id, user.id)).returning()
  return { data: updated }
}, { status: 201 })

export const DELETE = route(async ({ user }) => {
  if (user.upiQrUrl) await getStorage().remove(user.upiQrUrl.replace('/api/v1/files/', ''))
  const [updated] = await getDb().update(users).set({ upiQrUrl: null }).where(eq(users.id, user.id)).returning()
  return { data: updated }
})
```

`src/app/api/v1/files/[...key]/route.ts`:
```ts
import { notFound } from '@/server/errors'
import { route } from '@/server/http'
import { getStorage } from '@/server/storage'

export const GET = route<{ key: string[] }>(async ({ user, params }) => {
  const key = params.key.join('/')
  // Part A: a user may only read their own uploads. Part B widens this to group members.
  if (!key.startsWith(`qr/${user.id}/`)) throw notFound('file')
  const file = await getStorage().get(key)
  if (!file) throw notFound('file')
  return new Response(file.data as BodyInit, {
    headers: { 'content-type': file.contentType, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' },
  })
})
```

`src/app/api/v1/categories/route.ts`:
```ts
import { z } from 'zod'
import { categoryCreateSchema } from '@/lib/schemas/categories'
import { parseJson, parseQuery, route } from '@/server/http'
import { createCategory, listCategories } from '@/server/services/categories'

const query = z.object({ kind: z.enum(['expense', 'income']).optional() })

export const GET = route(async ({ req, user }) => ({ data: await listCategories(user.id, parseQuery(req, query).kind) }))
export const POST = route(async ({ req, user }) => ({ data: await createCategory(user.id, await parseJson(req, categoryCreateSchema)) }), { status: 201 })
```

`src/app/api/v1/transactions/route.ts`:
```ts
import { transactionCreateSchema, transactionListQuerySchema } from '@/lib/schemas/transactions'
import { parseJson, parseQuery, route } from '@/server/http'
import { createTransaction, listTransactions } from '@/server/services/transactions'

export const GET = route(async ({ req, user }) => listTransactions(user.id, parseQuery(req, transactionListQuerySchema)))
export const POST = route(async ({ req, user }) => createTransaction(user.id, await parseJson(req, transactionCreateSchema)), { status: 201 })
```

`src/app/api/v1/transactions/[id]/route.ts`:
```ts
import { uuid } from '@/lib/schemas/common'
import { transactionPatchSchema } from '@/lib/schemas/transactions'
import { parseJson, route } from '@/server/http'
import { deleteTransaction, updateTransaction } from '@/server/services/transactions'

export const PATCH = route<{ id: string }>(async ({ req, user, params }) =>
  updateTransaction(user.id, uuid.parse(params.id), await parseJson(req, transactionPatchSchema)))
export const DELETE = route<{ id: string }>(async ({ user, params }) => deleteTransaction(user.id, uuid.parse(params.id)))
```

`src/app/api/v1/transactions/[id]/confirm/route.ts`:
```ts
import { uuid } from '@/lib/schemas/common'
import { route } from '@/server/http'
import { confirmDraft } from '@/server/services/transactions'

export const POST = route<{ id: string }>(async ({ user, params }) => confirmDraft(user.id, uuid.parse(params.id)))
```

`src/app/api/v1/transactions/[id]/skip/route.ts`:
```ts
import { uuid } from '@/lib/schemas/common'
import { route } from '@/server/http'
import { skipDraft } from '@/server/services/transactions'

export const POST = route<{ id: string }>(async ({ user, params }) => skipDraft(user.id, uuid.parse(params.id)))
```

`src/app/api/v1/recurring/route.ts`:
```ts
import { recurringCreateSchema } from '@/lib/schemas/recurring'
import { parseJson, route } from '@/server/http'
import { createRecurring, listRecurring } from '@/server/services/recurring'

export const GET = route(async ({ user }) => ({ data: await listRecurring(user.id) }))
export const POST = route(async ({ req, user }) => createRecurring(user.id, await parseJson(req, recurringCreateSchema)), { status: 201 })
```

`src/app/api/v1/recurring/[id]/route.ts`:
```ts
import { uuid } from '@/lib/schemas/common'
import { recurringPatchSchema } from '@/lib/schemas/recurring'
import { parseJson, route } from '@/server/http'
import { deleteRecurring, updateRecurring } from '@/server/services/recurring'

export const PATCH = route<{ id: string }>(async ({ req, user, params }) =>
  updateRecurring(user.id, uuid.parse(params.id), await parseJson(req, recurringPatchSchema)))
export const DELETE = route<{ id: string }>(async ({ user, params }) => deleteRecurring(user.id, uuid.parse(params.id)))
```

`src/app/api/v1/checkins/route.ts`:
```ts
import { checkinCreateSchema } from '@/lib/schemas/checkins'
import { parseJson, route } from '@/server/http'
import { createCheckin } from '@/server/services/checkins'

export const POST = route(async ({ req, user }) => createCheckin(user.id, (await parseJson(req, checkinCreateSchema)).amount), { status: 201 })
```

`src/app/api/v1/checkins/latest/route.ts`:
```ts
import { route } from '@/server/http'
import { getLatestCheckin } from '@/server/services/checkins'

export const GET = route(async ({ user }) => ({ data: await getLatestCheckin(user.id) }))
```

`src/app/api/v1/budgets/route.ts`:
```ts
import { route } from '@/server/http'
import { listBudgets } from '@/server/services/budgets'

export const GET = route(async ({ user }) => ({ data: await listBudgets(user.id) }))
```

`src/app/api/v1/budgets/[categoryId]/route.ts`:
```ts
import { budgetPutSchema } from '@/lib/schemas/budgets'
import { uuid } from '@/lib/schemas/common'
import { parseJson, route } from '@/server/http'
import { deleteBudget, upsertBudget } from '@/server/services/budgets'

export const PUT = route<{ categoryId: string }>(async ({ req, user, params }) =>
  upsertBudget(user.id, uuid.parse(params.categoryId), (await parseJson(req, budgetPutSchema)).monthlyLimit))
export const DELETE = route<{ categoryId: string }>(async ({ user, params }) => deleteBudget(user.id, uuid.parse(params.categoryId)))
```

`src/app/api/v1/summary/safe-to-spend/route.ts`:
```ts
import { route } from '@/server/http'
import { getSafeToSpend } from '@/server/services/safe-to-spend'

export const GET = route(async ({ user }) => ({ data: await getSafeToSpend(user.id) }))
```

`src/app/api/v1/insights/route.ts`:
```ts
import { z } from 'zod'
import { isoDate } from '@/lib/schemas/common'
import { diffDays } from '@/lib/dates'
import { invalid } from '@/server/errors'
import { parseQuery, route } from '@/server/http'
import { getInsights } from '@/server/services/insights'

const query = z.object({ from: isoDate, to: isoDate })

export const GET = route(async ({ req, user }) => {
  const { from, to } = parseQuery(req, query)
  const span = diffDays(to, from)
  if (span < 0) throw invalid('to', 'The end date is before the start date.')
  if (span > 366) throw invalid('from', 'Pick a range of a year or less.')
  return { data: await getInsights(user.id, from, to) }
})
```

`src/app/api/v1/export.csv/route.ts`:
```ts
import { route } from '@/server/http'
import { exportTransactionsCsv } from '@/server/services/export'

export const GET = route(async ({ user }) =>
  new Response(await exportTransactionsCsv(user.id), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="coinflow-transactions.csv"',
    },
  }))
```

`src/app/api/v1/undo/[auditId]/route.ts`:
```ts
import { uuid } from '@/lib/schemas/common'
import { route } from '@/server/http'
import { undo } from '@/server/services/audit'

export const POST = route<{ auditId: string }>(async ({ user, params }) => ({ data: await undo(user.id, uuid.parse(params.auditId)) }))
```

- [ ] **Step 7: Run all tests, typecheck and lint**

```bash
pnpm --filter web test
pnpm --filter web test:int
pnpm --filter web typecheck
pnpm --filter web lint
```
Expected: all PASS / no errors. Fix any type errors in route generics before continuing (e.g. if Next's generated route types complain, keep `route<…>` param types matching the folder names exactly).

- [ ] **Step 8: Add the `verify` script (backend portion)**

```bash
cd apps/web
pnpm pkg set scripts.verify="pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm build"
cd ../..
pnpm verify   # expect: every stage passes
```
(Plan A2 appends E2E, axe and Lighthouse stages.)

- [ ] **Step 9: Manual smoke test against the dev DB**

```bash
pnpm dev
```
Sign in at `http://localhost:3000/sign-in`, then visit `http://localhost:3000/api/v1/me` → JSON with your user. Visit `/api/v1/summary/safe-to-spend` → `"status":"unknown"`. Stop the server.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src apps/web/package.json pnpm-lock.yaml
git commit -m "feat(api): /api/v1 endpoints with Clerk auth, zod validation, request ids, safe QR uploads

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Plan A1 done when

- `pnpm verify` passes from a clean clone after `pnpm db:up && pnpm install && pnpm db:migrate` and the Clerk checkpoint.
- Every endpoint in spec §6 exists and is covered by at least one test; cross-user access returns 404.
- Plan A2 can start: its tasks consume only the interfaces listed in this plan.
