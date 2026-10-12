import { expect, test } from '@playwright/test'
import { AGENT_OFFLINE, denyMic, e2eEmail, serviceToken, signInOnboarded, sse, stubAgent, stubPendingMic, withSql } from './helpers'

/**
 * Part C with a STUBBED agent: the real LLM is not part of the graded run (none is configured locally). stubAgent
 * replaces only the agent routes (/api/v1/agent/health, /chat, /outcome); Approve still goes through the real API.
 */

test('a proposal is staged, then Approve saves it through the normal API with undo', async ({ page }) => {
  await signInOnboarded(page)
  const cats = await (await page.request.get('/api/v1/categories?kind=expense')).json()
  const food = cats.data.find((c: { name: string }) => c.name === 'Food & Dining').id
  const proposal = {
    id: crypto.randomUUID(), kind: 'expense', summary: 'Expense ₹250 · Food & Dining · “E2E lunch”',
    payload: { type: 'expense', amount: 25_000, categoryId: food, note: 'E2E lunch', method: 'upi', source: 'chat' },
  }
  await stubAgent(page, { online: true, capabilities: { chat: true, vision: false, stt: false, tts: false } },
    sse([['status', { state: 'thinking' }], ['token', { text: 'I’ve drafted ₹250 for lunch.' }], ['proposal', proposal], ['done', { threadId: 'main' }]]))
  await page.goto('/home')
  await page.getByRole('button', { name: /^Ask Coinflow…/ }).click()
  const panel = page.getByRole('dialog', { name: 'Ask Coinflow' })
  await panel.getByLabel('Message').fill('250 lunch')
  await panel.getByRole('button', { name: 'Send' }).click()
  const chip = panel.getByRole('article', { name: /^Expense proposal:/ })
  await expect(chip).toBeVisible()
  expect(await (await page.request.get('/api/v1/transactions')).json()).toMatchObject({ data: [] }) // nothing saved yet
  await chip.getByRole('button', { name: 'Approve' }).click()
  await expect(chip.getByText('Saved. You can undo from the toast.')).toBeVisible()
  await expect(page.getByText('Added ₹250 expense')).toBeVisible()
  const list = await (await page.request.get('/api/v1/transactions')).json()
  expect(list.data[0]).toMatchObject({ note: 'E2E lunch', amount: 25_000, source: 'chat' })
})

test('a failed Approve is retried from the chip only: no toast Retry that could save it a second time', async ({ page }) => {
  await signInOnboarded(page)
  const cats = await (await page.request.get('/api/v1/categories?kind=expense')).json()
  const food = cats.data.find((c: { name: string }) => c.name === 'Food & Dining').id
  const proposal = {
    id: crypto.randomUUID(), kind: 'expense', summary: 'Expense ₹180 · Food & Dining · “E2E retry”',
    payload: { type: 'expense', amount: 18_000, categoryId: food, note: 'E2E retry', method: 'upi', source: 'chat' },
  }
  await stubAgent(page, { online: true, capabilities: { chat: true, vision: false, stt: false, tts: false } },
    sse([['proposal', proposal], ['done', { threadId: 'main' }]]))
  let failNext = true
  await page.route('**/api/v1/transactions', (route) => {
    if (route.request().method() !== 'POST' || !failNext) return route.fallback()
    failNext = false
    return route.fulfill({ status: 500, json: { error: { code: 'server_error', message: 'Couldn’t reach the server.' }, requestId: 'e2e' } })
  })
  await page.goto('/home')
  await page.getByRole('button', { name: /^Ask Coinflow…/ }).click()
  const panel = page.getByRole('dialog', { name: 'Ask Coinflow' })
  await panel.getByLabel('Message').fill('180 lunch')
  await panel.getByRole('button', { name: 'Send' }).click()
  const chip = panel.getByRole('article', { name: /^Expense proposal:/ })
  await chip.getByRole('button', { name: 'Approve' }).click()
  await expect(chip.getByRole('alert')).toHaveText('Couldn’t reach the server.')
  await page.waitForTimeout(500) // a toast would have been raised in the same tick as the chip's failure
  // CSS, not roles: the open panel is modal, so a toast behind it is aria-hidden (yet clickable once it closes).
  // A one-shot count, not toHaveCount(0): that retries, and would pass once the toast timed out by itself.
  expect(await page.locator('[data-sonner-toast]').filter({ hasText: 'Couldn’t reach the server.' }).count()).toBe(0)
  expect(await page.locator('[data-sonner-toast] button').filter({ hasText: 'Retry' }).count()).toBe(0)
  await chip.getByRole('button', { name: 'Approve' }).click() // the one retry path
  await expect(chip.getByText('Saved. You can undo from the toast.')).toBeVisible()
  const list = await (await page.request.get('/api/v1/transactions')).json()
  expect(list.data.filter((t: { note: string | null }) => t.note === 'E2E retry')).toHaveLength(1)
})

test('assistant offline: the pill says so, and quick add still works', async ({ page }) => {
  await signInOnboarded(page)
  await stubAgent(page, AGENT_OFFLINE)
  await page.goto('/home')
  const pill = page.getByRole('button', { name: /Assistant offline/ })
  await expect(pill).toBeVisible()
  await pill.click()
  await expect(page.getByPlaceholder(/250 food lunch/)).toBeVisible() // the ⌘K palette, not the agent
})

test('a coach nudge written through the internal endpoint shows in the bell', async ({ page }) => {
  await signInOnboarded(page)
  const [user] = await withSql(async (sql) => {
    const rows = await sql`select id from users where email = ${e2eEmail()}`
    // The other project's run already used one of today's two coach slots (server cap): start from an empty bell.
    await sql`delete from notifications where user_id = ${rows[0].id}`
    return rows
  })
  const res = await page.request.post('/api/internal/notifications', {
    headers: { authorization: `Bearer ${serviceToken()}` },
    data: { userId: user.id, kind: 'coach_bill', title: 'Wi-Fi is due tomorrow', body: '₹700 is already set aside in Safe to spend.', href: '/recurring', dedupeKey: `e2e:${Date.now()}` },
  })
  expect(res.status()).toBe(201)
  await page.goto('/home')
  await page.getByRole('button', { name: /^Notifications, \d+ unread$/ }).click()
  await expect(page.getByText('Wi-Fi is due tomorrow')).toBeVisible()
})

test('hold to talk shows "Listening…" as unobscured text at once; a blocked mic explains itself', async ({ page }) => {
  await signInOnboarded(page)
  await stubAgent(page, { online: true, capabilities: { chat: true, vision: false, stt: true, tts: false } })
  await stubPendingMic(page)
  await page.goto('/home')
  await page.getByRole('button', { name: /^Ask Coinflow…/ }).click()
  const panel = page.getByRole('dialog', { name: 'Ask Coinflow' })
  await panel.getByRole('button', { name: 'Hold to talk' }).focus()
  await page.keyboard.down('Space')
  const status = page.locator('#agent-status')
  await expect(status).toHaveText('Listening…')
  // The level meter must not cover the status text (it once sat centred over the mic, on top of "Listening…").
  const meter = panel.locator('[data-mic-meter]')
  await expect(meter).toBeVisible()
  const overlap = await page.evaluate(() => {
    const p = document.getElementById('agent-status')!
    const range = document.createRange()
    range.selectNodeContents(p)
    const t = range.getBoundingClientRect()
    const m = document.querySelector('[data-mic-meter]')!.getBoundingClientRect()
    return t.left < m.right && m.left < t.right && t.top < m.bottom && m.top < t.bottom
  })
  expect(overlap).toBe(false)
  await denyMic(page)
  await page.keyboard.up('Space')
  await expect(panel.getByRole('alert').filter({ hasText: 'The microphone is blocked' })).toBeVisible()
  await expect(status).toHaveText('')
})
