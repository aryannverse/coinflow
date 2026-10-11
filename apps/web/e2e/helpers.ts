import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, type Locator, type Page } from '@playwright/test'
import postgres from 'postgres'

export const hasE2EUser = () => Boolean(process.env.E2E_CLERK_USER_EMAIL)

/** The E2E user's email. Refuses to run as the demo user, whose data E2E must never touch. */
export function e2eEmail(): string {
  const email = process.env.E2E_CLERK_USER_EMAIL
  if (!email) throw new Error('Set E2E_CLERK_USER_EMAIL in .env.local to a Clerk test user (an email containing +clerk_test).')
  if (email === process.env.DEMO_CLERK_USER_EMAIL) throw new Error('E2E_CLERK_USER_EMAIL must not be the demo user: E2E wipes its rows.')
  return email
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
export function resetE2EUser() {
  return withSql((sql) => sql`delete from users where email = ${e2eEmail()}`)
}

export async function signIn(page: Page) {
  await setupClerkTestingToken({ page })
  await page.goto('/')
  await clerk.signIn({ page, emailAddress: e2eEmail() })
}

/** A brand-new E2E user who has just signed in and not yet been onboarded. */
export async function signInFresh(page: Page) {
  await resetE2EUser()
  await signIn(page)
}

/** Skips onboarding with a known balance so feature specs start from a predictable state. */
export async function signInOnboarded(page: Page, balanceRupees = 50_000) {
  await signIn(page)
  await page.goto('/onboarding')
  if (page.url().includes('/onboarding')) {
    await page.getByRole('button', { name: 'Skip setup for now' }).click()
    await page.waitForURL('**/home')
  }
  await withSql(async (sql) => {
    const [u] = await sql`select id from users where email = ${e2eEmail()}`
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
