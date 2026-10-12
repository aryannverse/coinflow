import { expect, test, type Page } from '@playwright/test'
import { e2eEmail, serviceToken, signInOnboarded, withSql } from './helpers'

/**
 * Part C with a STUBBED agent: the real LLM is not part of the graded run (none is configured locally). The stubs
 * replace only the agent routes (/api/v1/agent/health, /chat, /outcome); Approve still goes through the real API.
 */
const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('')
type Health = { online: boolean; capabilities: { chat: boolean; vision: boolean; stt: boolean; tts: boolean } | null }

async function stubAgent(page: Page, health: Health, chatBody?: string) {
  await page.route('**/api/v1/agent/health', (r) => r.fulfill({ json: { data: health } }))
  await page.route('**/api/v1/agent/outcome', (r) => r.fulfill({ json: { data: { logged: true } } }))
  if (chatBody) await page.route('**/api/v1/agent/chat', (r) => r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: chatBody }))
}

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

test('assistant offline: the pill says so, and quick add still works', async ({ page }) => {
  await signInOnboarded(page)
  await stubAgent(page, { online: false, capabilities: null })
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
  // The permission prompt stays unanswered until the test denies it, so the "Listening…" state can be inspected.
  await page.addInitScript(() => {
    const w = window as unknown as { __denyMic?: () => void }
    navigator.mediaDevices.getUserMedia = () => new Promise((_, reject) => { w.__denyMic = () => reject(new DOMException('denied', 'NotAllowedError')) })
  })
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
  await page.evaluate(() => (window as unknown as { __denyMic: () => void }).__denyMic())
  await page.keyboard.up('Space')
  await expect(panel.getByRole('alert').filter({ hasText: 'The microphone is blocked' })).toBeVisible()
  await expect(status).toHaveText('')
})
