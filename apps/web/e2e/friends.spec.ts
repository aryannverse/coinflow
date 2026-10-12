import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, test } from '@playwright/test'
import { e2e2Email, hasE2E2User, seedFriends, signInOnboarded } from './helpers'

test.describe.configure({ mode: 'serial' })

/**
 * Spec §3.8: find someone by exact email → request → they accept from the bell → add them straight into a group from the
 * Members tab (no invite link, no claim) → they see the group and their share at once.
 */
test('friend by email → accept from the bell → add to a group directly → they see it', async ({ browser, page, isMobile }) => {
  test.skip(isMobile, 'Two-person journey runs once, on desktop.')
  test.skip(!hasE2E2User(), 'E2E2_CLERK_USER_EMAIL is not set')
  test.slow()
  const friendEmail = e2e2Email()
  const name = `Flat ${Date.now().toString(36)}`

  // The second person must have an account before they can be found.
  const ctx2 = await browser.newContext()
  const page2 = await ctx2.newPage()
  await setupClerkTestingToken({ page: page2 })
  await signInOnboarded(page2, 50_000, friendEmail)

  await signInOnboarded(page)
  await page.goto('/friends')
  await expect(page.getByRole('heading', { level: 1, name: 'Friends' })).toBeVisible()
  await page.getByLabel('Their email').fill(friendEmail.toUpperCase())
  await page.getByRole('button', { name: 'Add friend' }).click()
  await expect(page.getByText(/^Request sent to /)).toBeVisible()

  // They accept from the bell (live over SSE, or within the 30 s polling fallback).
  await page2.goto('/home')
  await expect(page2.getByRole('button', { name: /^Notifications, \d+ unread$/ })).toBeVisible({ timeout: 35_000 })
  await page2.getByRole('button', { name: /^Notifications, \d+ unread$/ }).click()
  await page2.getByRole('button', { name: 'Accept' }).first().click()
  await expect(page2.getByText(/ are now friends$/)).toBeVisible()
  // The Accept/Decline buttons leave; focus stays on that notification instead of dropping to <body>.
  await expect(page2.getByRole('link', { name: /wants to be friends/ })).toBeFocused()

  // Back to the first person: a group, then add the friend from the Members tab.
  await page.goto('/groups')
  await page.getByRole('button', { name: 'New group or event' }).first().click()
  const create = page.getByRole('dialog', { name: 'New group or event' })
  await create.getByLabel('Name', { exact: true }).fill(name) // exact: "Person’s name" also contains "name"
  await create.getByLabel('Person’s name').fill('Dev')
  await create.getByRole('button', { name: 'Add person' }).click()
  await create.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(name) })).toBeVisible()
  await page.getByRole('tab', { name: 'Members' }).click()
  const fromFriends = page.getByRole('list', { name: 'Add from friends' })
  await fromFriends.getByRole('button', { name: new RegExp(`^Add .+ to ${name}$`) }).click()
  await expect(page.getByText(/^Added /)).toBeVisible() // undo toast
  await expect(fromFriends).toHaveCount(0) // the only friend is in now

  // ₹600 cab split equally between the three of us: the friend owes ₹200 with no invite and no claim.
  await page.getByRole('button', { name: 'Add expense' }).first().click() // header; an empty group repeats it below
  const sheet = page.getByRole('dialog', { name: 'Add expense' })
  await sheet.getByLabel('Amount', { exact: true }).fill('600')
  await sheet.getByLabel('What for?').fill('Cab')
  await sheet.getByRole('radio', { name: 'Travel' }).click()
  await sheet.getByRole('button', { name: 'Save expense' }).click()
  await expect(sheet).toBeHidden()

  await page2.goto('/groups')
  await page2.getByRole('link', { name: new RegExp(name) }).click()
  await expect(page2.getByText('You owe ₹200')).toBeVisible()
  await ctx2.close()
})

test('answering the last request on /friends keeps focus on the page, not <body>', async ({ page }) => {
  await signInOnboarded(page)
  await seedFriends() // one friend (Asha Fixture) and one incoming request (Ravi Fixture)
  await page.goto('/friends')
  await page.getByRole('button', { name: 'Accept Ravi Fixture' }).click()
  await expect(page.getByRole('list', { name: 'Your friends' }).getByText('Ravi Fixture')).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Your friends/ })).toBeFocused()
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
})
