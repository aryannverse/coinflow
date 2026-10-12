import { resolve } from 'node:path'
import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, test, type Page } from '@playwright/test'
import { e2e2Email, e2eEmail, hasE2E2User, seedFriends, signInOnboarded, withSql } from './helpers'

/**
 * Screens for docs/hci/part-b-c-rationale.md. Runs only with CAPTURE=1, against a production build (`pnpm build && pnpm
 * start -p 3000`), with reduced motion: `-1440` from the desktop project (dark) and `-390` from the mobile one (light),
 * as Part A's screens. E2E accounts only; the agent is stubbed as in agent.spec.ts (no LLM is part of the graded run).
 */
const SCREENS = resolve(__dirname, '../../../docs/hci/screens')
const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('')
const ONLINE = { online: true, capabilities: { chat: true, vision: true, stt: true, tts: true } }

async function settle(page: Page) {
  await page.waitForLoadState('networkidle')
  await expect.poll(() => page.evaluate(() => document.getAnimations()
    .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity).length)).toBe(0)
}

async function shot(page: Page, name: string, isMobile: boolean) {
  await settle(page)
  await page.screenshot({ path: `${SCREENS}/${name}-${isMobile ? 390 : 1440}.png` })
}

test('@capture Parts B and C screens', async ({ browser, isMobile }) => {
  test.skip(!hasE2E2User(), 'E2E2_CLERK_USER_EMAIL is not set')
  test.setTimeout(300_000)
  // Part A's -390 screens are 780×1688 (2×): the Pixel 7 profile alone would give 2.625×.
  const contextOptions = { ...test.info().project.use, reducedMotion: 'reduce' as const, deviceScaleFactor: isMobile ? 2 : 1 }
  const ctx = await browser.newContext(contextOptions)
  const page = await ctx.newPage()
  await setupClerkTestingToken({ page })
  // The pill as it reads with the assistant running (stubbed); c-offline shows the other state.
  await page.route('**/api/v1/agent/health', (r) => r.fulfill({ json: { data: ONLINE } }))
  await signInOnboarded(page)
  // The other project's run left its notifications (its group is gone, the bell rows are not): start from an empty bell.
  await withSql((sql) => sql`delete from notifications where user_id in (select id from users where email in (${e2eEmail()}, ${e2e2Email()}))`)
  const main = page.getByRole('main')

  // The event: Goa with Asha, Ravi and Dev (not on Coinflow yet), and the ₹900 multi-payer dinner from groups.spec.ts.
  const created = await (await page.request.post('/api/v1/groups', { data: {
    name: 'Goa trip', kind: 'event', emoji: '🏖️', startsOn: '2026-10-16', endsOn: '2026-10-19',
    placeholders: [{ displayName: 'Asha' }, { displayName: 'Ravi' }, { displayName: 'Dev' }],
  } })).json()
  const g = created.data
  const id = (n: string) => g.members.find((m: { displayName: string }) => m.displayName === n).id as string
  const cats = (await (await page.request.get('/api/v1/categories?kind=expense')).json()).data as { id: string; name: string }[]
  const food = cats.find((c) => c.name === 'Food & Dining')!.id
  expect((await page.request.post(`/api/v1/groups/${g.id}/expenses`, { data: {
    description: 'Dinner', amountPaise: 90_000, categoryId: food,
    payers: [{ memberId: g.myMemberId, paidPaise: 50_000 }, { memberId: id('Ravi'), paidPaise: 40_000 }],
    split: { mode: 'equal', memberIds: [g.myMemberId, id('Asha'), id('Ravi')] },
  } })).status()).toBe(201)

  // b-groups: the list with one event.
  await page.goto('/groups')
  await expect(page.getByRole('link', { name: /Goa trip/ })).toBeVisible()
  await shot(page, 'b-groups', isMobile)

  // b-expense-modes: ₹1,200 villa deposit split by percent, with the live per-person preview.
  await page.goto(`/groups/${g.id}`)
  await main.getByRole('button', { name: 'Add expense' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Add expense' })
  await sheet.getByLabel('Amount', { exact: true }).fill('1200')
  await sheet.getByLabel('What for?').fill('Villa deposit')
  await sheet.getByRole('radio', { name: 'Travel' }).click()
  await sheet.getByRole('radio', { name: 'Percent' }).click()
  for (const [who, pct] of [['You', '40'], ['Asha', '20'], ['Ravi', '20'], ['Dev', '20']]) await sheet.getByLabel(`Percent for ${who}`).fill(pct)
  await expect(sheet.getByText('₹480')).toBeVisible()
  await sheet.getByLabel('Percent for You').scrollIntoViewIfNeeded()
  await shot(page, 'b-expense-modes', isMobile)

  // b-receipt-canvas: itemized, three lines, one unassigned, with tax and tip.
  await sheet.getByLabel('Amount', { exact: true }).fill('847.50')
  await sheet.getByLabel('What for?').fill('Thalassa lunch')
  await sheet.getByRole('radio', { name: 'Itemized' }).click()
  const lines: [string, string, string[]][] = [['Prawn curry', '320', ['You', 'Asha']], ['Kingfish fry', '250', ['Ravi']], ['Fresh lime soda', '180', []]]
  for (const [i, [name, price, who]] of lines.entries()) {
    await sheet.getByRole('button', { name: 'Add item' }).click()
    await sheet.getByLabel(`Item ${i + 1} name`).fill(name)
    await sheet.getByLabel(`Price of ${name}`).fill(price)
    for (const person of who) await sheet.getByRole('group', { name: `Who had ${name}` }).getByRole('button', { name: person }).click()
  }
  await sheet.getByLabel('Tax', { exact: true }).fill('37.50')
  await sheet.getByLabel('Tip', { exact: true }).fill('60')
  const unassigned = sheet.getByRole('status').filter({ hasText: 'Unassigned ₹180' })
  await expect(unassigned).toBeVisible()
  await unassigned.scrollIntoViewIfNeeded()
  await shot(page, 'b-receipt-canvas', isMobile)
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  // b-balances-why: one "Why?" open, plus the graph.
  await page.goto(`/groups/${g.id}?tab=balances`)
  await expect(page.getByText('Asha pays you ₹200', { exact: true })).toBeVisible()
  await page.getByText('Why?').first().click()
  await expect(page.getByText(/^Asha pays you ₹200: Asha owes ₹300/)).toBeVisible()
  await shot(page, 'b-balances-why', isMobile)

  // The second person (same viewport, theme and motion), on the invite link.
  const invite = (await (await page.request.get(`/api/v1/groups/${g.id}/invite`)).json()).data.url as string
  const ctx2 = await browser.newContext(contextOptions)
  const page2 = await ctx2.newPage()
  await setupClerkTestingToken({ page: page2 })
  await page2.route('**/api/v1/agent/health', (r) => r.fulfill({ json: { data: ONLINE } }))
  await signInOnboarded(page2, 50_000, e2e2Email())
  await page2.goto(new URL(invite).pathname)
  await expect(page2.getByRole('heading', { level: 1, name: 'Join Goa trip' })).toBeVisible()
  await shot(page2, 'b-join', isMobile)
  await page2.getByRole('radio', { name: 'Asha' }).check()
  await page2.getByRole('button', { name: 'Join group' }).click()
  await expect(page2).toHaveURL(/\/groups\/[0-9a-f-]{36}/, { timeout: 15_000 })

  // b-settle: Asha pays you ₹200 — the settle sheet (no UPI QR yet on the E2E account).
  await page2.goto(`/groups/${g.id}?tab=balances`)
  await page2.getByRole('button', { name: /^Settle up ₹200 with / }).click()
  const pay = page2.getByRole('dialog', { name: /^Pay / })
  await expect(pay.getByText('No QR yet')).toBeVisible()
  await shot(page2, 'b-settle', isMobile)
  await pay.getByRole('button', { name: 'I’ve paid' }).click()
  await expect(pay.getByText(/Waiting for .+ to confirm\./)).toBeVisible()
  await ctx2.close()

  // b-notification-confirm: the payee's bell with Confirm / Not received, from Home (the bell is on every page).
  await page.goto('/home')
  await page.getByRole('button', { name: /^Notifications, \d+ unread$/ }).click()
  await expect(page.getByRole('button', { name: 'Not received' })).toBeVisible()
  await shot(page, 'b-notification-confirm', isMobile)
  await page.keyboard.press('Escape')

  // b-friends: one incoming request, one friend, and a search result.
  await seedFriends()
  await page.goto('/friends')
  await page.getByLabel('Their email').fill('fixture-friend@example.com')
  await expect(page.getByRole('region', { name: 'Find a friend' }).getByText('Friends', { exact: true })).toBeVisible()
  await shot(page, 'b-friends', isMobile)

  // c-panel-proposal: a pending expense chip from the (stubbed) agent.
  const proposal = {
    id: crypto.randomUUID(), kind: 'expense', summary: 'Expense ₹250 · Food & Dining · “Lunch”',
    payload: { type: 'expense', amount: 25_000, categoryId: food, note: 'Lunch', method: 'upi', source: 'chat' },
  }
  await page.route('**/api/v1/agent/outcome', (r) => r.fulfill({ json: { data: { logged: true } } }))
  await page.route('**/api/v1/agent/chat', (r) => r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: sse([
    ['status', { state: 'thinking' }], ['token', { text: 'I’ve drafted ₹250 for lunch under Food & Dining. Nothing is saved until you approve it.' }],
    ['proposal', proposal], ['done', { threadId: 'main' }],
  ]) }))
  // The microphone prompt never answers until the spec says so: "Listening…" shows while it is pending (spec §4.7).
  await page.addInitScript(() => {
    const w = window as unknown as { __denyMic?: () => void }
    navigator.mediaDevices.getUserMedia = () => new Promise((_, reject) => { w.__denyMic = () => reject(new DOMException('denied', 'NotAllowedError')) })
  })
  await page.goto('/home')
  await page.getByRole('button', { name: /^Ask Coinflow…/ }).click()
  const panel = page.getByRole('dialog', { name: 'Ask Coinflow' })
  await panel.getByLabel('Message').fill('250 lunch')
  await panel.getByRole('button', { name: 'Send' }).click()
  await expect(panel.getByRole('article', { name: /^Expense proposal:/ })).toBeVisible()
  await expect(page.locator('#agent-status')).toHaveText('')
  await shot(page, 'c-panel-proposal', isMobile)

  // c-voice-status: hold to talk (Space) → "Listening…" as text, captured before the denial note.
  await panel.getByRole('button', { name: 'Hold to talk' }).focus()
  await page.keyboard.down('Space')
  await expect(page.locator('#agent-status')).toHaveText('Listening…')
  await shot(page, 'c-voice-status', isMobile)
  await page.evaluate(() => (window as unknown as { __denyMic: () => void }).__denyMic())
  await page.keyboard.up('Space')
  await expect(panel.getByRole('alert').filter({ hasText: 'The microphone is blocked' })).toBeVisible()

  // c-offline: the pill reads "Assistant offline" and the rest of the app works.
  await page.unroute('**/api/v1/agent/health')
  await page.route('**/api/v1/agent/health', (r) => r.fulfill({ json: { data: { online: false, capabilities: null } } }))
  await page.goto('/home')
  await expect(page.getByRole('button', { name: /Assistant offline/ })).toBeVisible()
  await shot(page, 'c-offline', isMobile)
  await ctx.close()
})
