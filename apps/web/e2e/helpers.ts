import { createHmac } from 'node:crypto'
import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, type Locator, type Page } from '@playwright/test'
import postgres from 'postgres'

export const hasE2EUser = () => Boolean(process.env.E2E_CLERK_USER_EMAIL)

/** The E2E user's email. Refuses to run as the demo user, whose data E2E must never touch. */
export function e2eEmail(): string {
  const email = process.env.E2E_CLERK_USER_EMAIL
  if (!email) throw new Error('Set E2E_CLERK_USER_EMAIL in .env.local to a Clerk test user (an email containing +clerk_test).')
  const norm = (v?: string) => v?.trim().toLowerCase()
  if (norm(email) === norm(process.env.DEMO_CLERK_USER_EMAIL)) throw new Error('E2E_CLERK_USER_EMAIL must not be the demo user: E2E wipes its rows.')
  return email
}

export const hasE2E2User = () => Boolean(process.env.E2E2_CLERK_USER_EMAIL)

/** The second test user (claims a placeholder). Never the demo user or the first E2E user. */
export function e2e2Email(): string {
  const email = process.env.E2E2_CLERK_USER_EMAIL
  if (!email) throw new Error('Set E2E2_CLERK_USER_EMAIL in .env.local to the second Clerk test user.')
  const norm = (v?: string) => v?.trim().toLowerCase()
  if (norm(email) === norm(process.env.DEMO_CLERK_USER_EMAIL) || norm(email) === norm(process.env.E2E_CLERK_USER_EMAIL)) {
    throw new Error('E2E2_CLERK_USER_EMAIL must differ from the demo and the first E2E user.')
  }
  return email
}

/** The agent's service token (the same wire format as src/server/internal-token.ts) for /api/internal calls in specs. */
export function serviceToken(): string {
  const key = process.env.AGENT_SHARED_SECRET
  if (!key) throw new Error('AGENT_SHARED_SECRET is not set (Task 4 Step 1)')
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const iat = Math.floor(Date.now() / 1000)
  const body = `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: 'svc:agent', aud: 'coinflow-internal', iat, exp: iat + 600 })}`
  return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`
}

export async function withSql<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
  try {
    return await fn(sql)
  } finally {
    await sql.end()
  }
}

/** Deletes the E2E user's row so the next sign-in is a brand-new user (children cascade). */
/**
 * Deletes one user's row (children cascade). Their own groups go first, as the app's deleteUser does: in one statement
 * the creator's group_members row is updated twice while its group cascades away, and the foreign key fails.
 */
export function deleteUserByEmail(email: string) {
  return withSql(async (sql) => {
    await sql`delete from groups where created_by in (select id from users where email = ${email})`
    await sql`delete from users where email = ${email}`
  })
}

export function resetE2EUser() {
  return deleteUserByEmail(e2eEmail())
}

export async function signIn(page: Page, email = e2eEmail()) {
  // The theme spec saves its choice to the profile, and a fresh browser seeds its theme from the profile on first load.
  // Reset BEFORE the first app page loads so every spec starts from the defaults (no row yet = nothing to reset).
  await withSql((sql) => sql`update users set theme = 'dark', reduced_motion = 'system' where email = ${email}`)
  await setupClerkTestingToken({ page })
  await page.goto('/')
  await clerk.signIn({ page, emailAddress: email })
}

/** A brand-new E2E user who has just signed in and not yet been onboarded. */
export async function signInFresh(page: Page) {
  await resetE2EUser()
  await signIn(page)
}

/** Skips onboarding with a known balance so feature specs start from a predictable state. */
export async function signInOnboarded(page: Page, balanceRupees = 50_000, email = e2eEmail()) {
  await signIn(page, email)
  await page.goto('/onboarding')
  if (page.url().includes('/onboarding')) {
    await page.getByRole('button', { name: 'Skip setup for now' }).click()
    await page.waitForURL('**/home')
  }
  await withSql(async (sql) => {
    const [u] = await sql`select id from users where email = ${email}`
    await sql`delete from groups where created_by = ${u.id}` // cascades members, expenses, settlements and their mirrors
    await sql`delete from friendships where requester_id = ${u.id} or addressee_id = ${u.id}` // spec §3.8
    await sql`delete from transactions where user_id = ${u.id}`
    await sql`delete from recurring_items where user_id = ${u.id}`
    await sql`delete from budgets where user_id = ${u.id}`
    await sql`delete from balance_checkins where user_id = ${u.id}`
  })
  // Through the API so takenAt comes from the app clock (a back-dated check-in would change Safe-to-Spend rules).
  const res = await page.request.post('/api/v1/checkins', { data: { amount: balanceRupees * 100 } })
  expect(res.status()).toBe(201)
  await page.goto('/home')
}

/**
 * Gives the (already onboarded) E2E user a non-empty ledger: a few confirmed expenses in the current cycle, an
 * active bill and a PAUSED one. Pages then render their data states (chart tables, paused rows), not the empty
 * ones, under axe and the reflow checks. Scoped to the E2E user only.
 */
export async function seedSampleLedger() {
  await withSql(async (sql) => {
    const [u] = await sql`select id from users where email = ${e2eEmail()}`
    const cats = await sql`select id, name from categories where user_id is null and kind = 'expense'`
    const cat = (name: string) => {
      const c = cats.find((r) => r.name === name)
      if (!c) throw new Error(`Built-in category ${name} is missing`)
      return c.id as string
    }
    const spends: [string, string, number][] = [
      ['Food & Dining', 'Swiggy biryani', 38_900], ['Transport', 'Metro recharge', 50_000],
      ['Groceries', 'Blinkit', 86_500], ['Entertainment', 'PVR tickets', 58_000],
    ]
    for (const [i, [name, note, amount]] of spends.entries()) {
      // Seconds apart and just before now, so every row sits in the current pay cycle on any calendar day.
      await sql`insert into transactions (user_id, type, amount, personal_share, category_id, note, method, occurred_at)
                values (${u.id}, 'expense', ${amount}, ${amount}, ${cat(name)}, ${note}, 'upi', now() - ${`${(i + 1) * 10} seconds`}::interval)`
    }
    for (const [name, category, amount, active] of [['Netflix', 'Subscriptions', 64_900, true], ['Gym membership', 'Health', 150_000, false]] as const) {
      await sql`insert into recurring_items (user_id, kind, name, amount, cadence, next_due_on, anchor_day, category_id, active)
                values (${u.id}, 'bill', ${name}, ${amount}, 'monthly',
                        (now() at time zone 'Asia/Kolkata')::date + 9,
                        extract(day from (now() at time zone 'Asia/Kolkata') + interval '9 days')::smallint, ${cat(category)}, ${active})`
    }
  })
}

/** A group with one expense, made through the API so every tab has content. Placeholders: 'Asha' and 'Ravi'. Returns ids and the invite path. */
export async function seedGroup(page: Page) {
  const created = await (await page.request.post('/api/v1/groups', { data: { name: 'A11y trip', kind: 'event', placeholders: [{ displayName: 'Asha' }, { displayName: 'Ravi' }] } })).json()
  const g = created.data
  const food = (await (await page.request.get('/api/v1/categories?kind=expense')).json()).data.find((c: { name: string }) => c.name === 'Food & Dining').id
  await page.request.post(`/api/v1/groups/${g.id}/expenses`, { data: {
    description: 'Dinner', amountPaise: 90_000, categoryId: food,
    payers: [{ memberId: g.myMemberId, paidPaise: 90_000 }], split: { mode: 'equal', memberIds: g.members.map((m: { id: string }) => m.id) },
  } })
  const invite = (await (await page.request.get(`/api/v1/groups/${g.id}/invite`)).json()).data.url as string
  return { id: g.id as string, invitePath: new URL(invite).pathname }
}

/** Fixture accounts (never real Clerk users) so every /friends card renders: the E2E user is friends with 'Asha Fixture' and has a pending request from 'Ravi Fixture'. global.setup deletes `user_fixture_%`. */
export async function seedFriends() {
  await withSql(async (sql) => {
    const [u] = await sql`select id from users where email = ${e2eEmail()}`
    await sql`delete from users where id in ('user_fixture_friend', 'user_fixture_asker')`
    await sql`insert into users (id, email, name) values ('user_fixture_friend', 'fixture-friend@example.com', 'Asha Fixture'),
      ('user_fixture_asker', 'fixture-asker@example.com', 'Ravi Fixture')`
    await sql`insert into friendships (requester_id, addressee_id, status, responded_at) values (${u.id}, 'user_fixture_friend', 'accepted', now())`
    await sql`insert into friendships (requester_id, addressee_id) values ('user_fixture_asker', ${u.id})`
  })
}

/** Opens quick add the way the viewport allows: the pill's + on touch, the TopBar Add button on desktop. */
export async function openQuickAdd(page: Page, isMobile: boolean) {
  if (isMobile) await page.locator('[data-testid="ask-add"]').click()
  else await page.locator('header').getByRole('button', { name: /^Add/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

/** Presses Tab until `target` has focus, so a spec proves the control is reachable from the keyboard. */
export async function tabTo(page: Page, target: Locator, maxTabs = 30) {
  for (let i = 0; i <= maxTabs; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error(`Tab never reached ${target} within ${maxTabs} presses`)
}

/**
 * Entrances fade in (Reveal/BlurFade, sheets, toasts): axe and screenshots would read colours mid-fade. Waits for the
 * network and for every finite animation to finish (infinite ones, such as React Flow's dashed edges, are ignored).
 */
export async function settleAnimations(page: Page) {
  await page.waitForLoadState('networkidle')
  await expect.poll(() => page.evaluate(() => document.getAnimations()
    .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity).length)).toBe(0)
}

export type AgentHealth = { online: boolean; capabilities: { chat: boolean; vision: boolean; stt: boolean; tts: boolean } | null }
export const AGENT_ONLINE: AgentHealth = { online: true, capabilities: { chat: true, vision: true, stt: true, tts: true } }
export const AGENT_OFFLINE: AgentHealth = { online: false, capabilities: null }

/** A server-sent-events body, as the agent proxy streams it. */
export const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('')

/**
 * Stubs ONLY the agent routes (health, outcome and, given a body, chat); Approve still goes through the real API. The
 * real LLM is not part of the graded run. Calling it again replaces the earlier stubs.
 */
export async function stubAgent(page: Page, health: AgentHealth, chatBody?: string) {
  for (const route of ['health', 'outcome', 'chat']) await page.unroute(`**/api/v1/agent/${route}`)
  await page.route('**/api/v1/agent/health', (r) => r.fulfill({ json: { data: health } }))
  await page.route('**/api/v1/agent/outcome', (r) => r.fulfill({ json: { data: { logged: true } } }))
  if (chatBody) await page.route('**/api/v1/agent/chat', (r) => r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: chatBody }))
}

/** The microphone permission prompt stays unanswered until denyMic(), so the "Listening…" state can be inspected. */
export async function stubPendingMic(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __denyMic?: () => void }
    navigator.mediaDevices.getUserMedia = () => new Promise((_, reject) => { w.__denyMic = () => reject(new DOMException('denied', 'NotAllowedError')) })
  })
}

export function denyMic(page: Page) {
  return page.evaluate(() => (window as unknown as { __denyMic: () => void }).__denyMic())
}
