import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { AGENT_ONLINE, e2e2Email, hasE2E2User, seedFriends, seedGroup, settleAnimations, signInOnboarded, stubAgent } from './helpers'

async function serious(page: Page) {
  // Never read colours mid-fade (Part A's rule for the toast): wait for animations, never exclude the element.
  await settleAnimations(page)
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
}

async function noSidewaysScroll(page: Page, path: string, ready: (p: Page) => Promise<void>) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion })
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto(path)
      await ready(page)
      await expect.poll(() => page.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth)),
        { message: `${path} at ${width}px (${reducedMotion})` }).toBeLessThanOrEqual(width)
    }
  }
}

const TABS = ['expenses', 'balances', 'activity', 'members'] as const

test('no serious axe violations on /groups (empty and with a group) and on every group tab', async ({ page }) => {
  test.slow() // six settled axe passes on the dev server
  await signInOnboarded(page)
  await page.goto('/groups')
  await page.waitForLoadState('networkidle')
  expect(await serious(page)).toEqual([])
  const g = await seedGroup(page)
  await page.goto('/groups')
  expect(await serious(page)).toEqual([])
  for (const tab of TABS) {
    await page.goto(`/groups/${g.id}?tab=${tab}`)
    await page.waitForLoadState('networkidle')
    expect(await serious(page), tab).toEqual([])
  }
})

test('no serious axe violations with the expense sheet (itemized), the settle sheet and the agent panel open', async ({ page }) => {
  test.slow()
  await signInOnboarded(page)
  const g = await seedGroup(page)
  await page.goto(`/groups/${g.id}`)
  // In <main>: on phones the Ask pill's "+" (Part A quick add, a personal expense) is also named "Add expense".
  await page.getByRole('main').getByRole('button', { name: 'Add expense' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add expense' })
  await sheet.getByRole('radio', { name: 'Itemized' }).click()
  await sheet.getByRole('button', { name: 'Add item' }).click()
  expect(await serious(page)).toEqual([])
  await page.keyboard.press('Escape')
  // The settle sheet needs a payment of YOURS. Seeded dinner: you +₹600, Asha −₹300, Ravi −₹300. Asha pays ₹1,800 for
  // the two of you: you −₹300, Asha +₹600, Ravi −₹300 → "You pay Asha ₹300" and "Ravi pays Asha ₹300".
  const detail = (await (await page.request.get(`/api/v1/groups/${g.id}`)).json()).data
  const asha = detail.members.find((m: { displayName: string }) => m.displayName === 'Asha').id
  const food = (await (await page.request.get('/api/v1/categories?kind=expense')).json()).data.find((c: { name: string }) => c.name === 'Food & Dining').id
  expect((await page.request.post(`/api/v1/groups/${g.id}/expenses`, { data: {
    description: 'Lunch', amountPaise: 180_000, categoryId: food,
    payers: [{ memberId: asha, paidPaise: 180_000 }], split: { mode: 'equal', memberIds: [detail.myMemberId, asha] },
  } })).status()).toBe(201)
  await page.goto(`/groups/${g.id}?tab=balances`)
  await page.getByRole('button', { name: /^Settle up ₹300 with Asha$/ }).click()
  await expect(page.getByRole('dialog', { name: 'Pay Asha' })).toBeVisible()
  expect(await serious(page)).toEqual([])
  await page.keyboard.press('Escape')
  // Friend surfaces inside a group: the "Add from friends" list and the link dialog. seedFriends() makes the E2E user
  // friends with 'Asha Fixture', so the Add-from-friends list renders; seedGroup created placeholders 'Asha' and 'Ravi'.
  await seedFriends()
  await page.goto(`/groups/${g.id}?tab=members`)
  await expect(page.getByRole('list', { name: 'Add from friends' })).toBeVisible()
  expect(await serious(page)).toEqual([])
  await page.getByRole('button', { name: 'Link Asha to a friend' }).click()
  await expect(page.getByRole('dialog', { name: 'Who is Asha?' })).toBeVisible()
  expect(await serious(page)).toEqual([])
  await page.keyboard.press('Escape')
  await page.goto(`/groups/${g.id}`)
  await stubAgent(page, AGENT_ONLINE)
  await page.reload()
  await page.getByRole('button', { name: /^Ask Coinflow…/ }).click()
  await expect(page.getByRole('dialog', { name: 'Ask Coinflow' })).toBeVisible()
  expect(await serious(page)).toEqual([])
})

test('the join page passes axe for the second person', async ({ page, browser }) => {
  test.skip(!hasE2E2User(), 'E2E2_CLERK_USER_EMAIL is not set')
  await signInOnboarded(page)
  const g = await seedGroup(page)
  // The project's viewport and colour scheme, so /join is checked in desktop dark and mobile light.
  const ctx2 = await browser.newContext({ ...test.info().project.use })
  const page2 = await ctx2.newPage()
  await signInOnboarded(page2, 50_000, e2e2Email())
  await page2.goto(g.invitePath)
  await expect(page2.getByRole('heading', { level: 1, name: 'Join A11y trip' })).toBeVisible()
  expect(await serious(page2)).toEqual([])
  await ctx2.close()
})

test('/friends passes axe with a request, a friend and a search result', async ({ page }) => {
  await signInOnboarded(page)
  await seedFriends()
  await page.goto('/friends')
  await expect(page.getByRole('list', { name: 'Your friends' })).toBeVisible()
  await page.getByLabel('Their email').fill('fixture-friend@example.com')
  // The result row reads "✓ Friends" (the check is an aria-hidden icon).
  await expect(page.getByRole('region', { name: 'Find a friend' }).getByText('Friends', { exact: true })).toBeVisible()
  expect(await serious(page)).toEqual([])
})

test('new routes reflow at 390 and 320 in both motion settings', async ({ page, isMobile, browser }) => {
  test.skip(!isMobile, 'Reflow is a phone-width check (mobile project).')
  test.slow()
  await signInOnboarded(page)
  const g = await seedGroup(page)
  await noSidewaysScroll(page, '/groups', (p) => expect(p.getByRole('heading', { level: 1, name: 'Groups & events' })).toBeVisible())
  await seedFriends()
  await noSidewaysScroll(page, '/friends', (p) => expect(p.getByRole('heading', { level: 1, name: 'Friends' })).toBeVisible())
  for (const tab of TABS) {
    await noSidewaysScroll(page, `/groups/${g.id}?tab=${tab}`, (p) => expect(p.getByRole('tab', { name: new RegExp(tab, 'i'), selected: true })).toBeVisible())
  }
  if (hasE2E2User()) {
    const ctx2 = await browser.newContext({ ...test.info().project.use })
    const page2 = await ctx2.newPage()
    await signInOnboarded(page2, 50_000, e2e2Email())
    await noSidewaysScroll(page2, g.invitePath, (p) => expect(p.getByRole('heading', { level: 1, name: 'Join A11y trip' })).toBeVisible())
    await ctx2.close()
  }
})
