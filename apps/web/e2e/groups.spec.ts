import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, test } from '@playwright/test'
import { e2e2Email, hasE2E2User, signInOnboarded } from './helpers'

test.describe.configure({ mode: 'serial' })

/**
 * Spec §1 success + §6 E2E: an event with placeholders; a multi-payer expense over a subset of people; a second user
 * claims a placeholder via the invite link and sees correct balances; mark paid → confirm via the notification.
 * ₹900 dinner: You paid ₹500, Ravi ₹400; split equally between You, Asha and Ravi (₹300 each); Dev not involved.
 * Nets: You +₹200, Asha −₹300, Ravi +₹100 → "Asha pays you ₹200", "Asha pays Ravi ₹100".
 */
test('event → multi-payer subset expense → claim → balances → mark paid → confirm', async ({ browser, page, isMobile }) => {
  test.skip(isMobile, 'Two-person journey runs once, on desktop; phones are covered by the a11y/reflow spec.')
  test.skip(!hasE2E2User(), 'E2E2_CLERK_USER_EMAIL is not set')
  test.slow()
  const name = `Goa ${Date.now().toString(36)}`

  await signInOnboarded(page)
  await page.goto('/groups')
  await expect(page.getByRole('heading', { level: 1, name: 'Groups & events' })).toBeVisible()
  await page.getByRole('button', { name: 'New group or event' }).first().click()
  const create = page.getByRole('dialog', { name: 'New group or event' })
  await create.getByLabel('Name', { exact: true }).fill(name) // exact: "Person’s name" also contains "name"
  await create.getByRole('radio', { name: 'Event' }).check()
  for (const person of ['Asha', 'Ravi', 'Dev']) {
    await create.getByLabel('Person’s name').fill(person)
    await create.getByRole('button', { name: 'Add person' }).click()
  }
  await create.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(name) })).toBeVisible()

  await page.getByRole('tab', { name: 'Members' }).click()
  await expect(page.getByText('Hasn’t joined yet')).toHaveCount(3)
  await expect(page.getByLabel('Invite link')).toHaveValue(/\/join\//) // it reads "Loading…" until the link arrives
  const invitePath = new URL(await page.getByLabel('Invite link').inputValue()).pathname

  // An empty group shows "Add expense" twice (the header and the empty state); the header one comes first.
  await page.getByRole('button', { name: 'Add expense' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Add expense' })
  await sheet.getByLabel('Amount', { exact: true }).fill('900')
  await sheet.getByLabel('What for?').fill('Dinner')
  await sheet.getByRole('radio', { name: 'Food & Dining' }).click()
  await sheet.getByRole('button', { name: 'Multiple payers' }).click()
  await sheet.getByLabel('Amount paid by You').fill('500')
  await sheet.getByLabel('Amount paid by Ravi').fill('400')
  await expect(sheet.getByText('Payments add up to the total.')).toBeVisible()
  await sheet.getByRole('button', { name: 'Dev', pressed: true }).click() // Dev wasn't at dinner
  await sheet.getByRole('button', { name: 'Save expense' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('Added ₹900 Dinner')).toBeVisible() // undo toast

  await page.getByRole('tab', { name: 'Balances' }).click()
  // exact: a closed "Why?" keeps its sentence ("Asha pays you ₹200: Asha owes …") in the DOM.
  await expect(page.getByText('Asha pays you ₹200', { exact: true })).toBeVisible()
  await expect(page.getByText('Asha pays Ravi ₹100', { exact: true })).toBeVisible()
  await page.getByText('Why?').first().click()
  await expect(page.getByText(/^Asha pays you ₹200: Asha owes ₹300 across Dinner; you are owed ₹200 and Ravi ₹100\.$/)).toBeVisible()

  // Second person: signed out → sign in → back to the invite → "Which one is you?" → Asha.
  const ctx2 = await browser.newContext()
  const page2 = await ctx2.newPage()
  await setupClerkTestingToken({ page: page2 })
  await page2.goto(invitePath)
  await expect(page2).toHaveURL(/\/sign-in/)
  await signInOnboarded(page2, 50_000, e2e2Email())
  await page2.goto(invitePath)
  await expect(page2.getByRole('heading', { level: 1, name: `Join ${name}` })).toBeVisible()
  // A claim is final, so nothing is preselected, and "Join group" without a choice explains itself inline.
  for (const radio of await page2.getByRole('radio').all()) await expect(radio).not.toBeChecked()
  await page2.getByRole('button', { name: 'Join group' }).click()
  await expect(page2.getByRole('alert').filter({ hasText: 'Pick which one is you' })).toBeVisible()
  await expect(page2).toHaveURL(new RegExp(`${invitePath}$`))
  await page2.getByRole('radio', { name: 'Asha' }).check()
  await page2.getByRole('button', { name: 'Join group' }).click()
  // The URL first: the h1 regex alone also matches "Join <name>" on the page being left.
  await expect(page2).toHaveURL(/\/groups\/[0-9a-f-]{36}/, { timeout: 15_000 })
  await expect(page2.getByRole('heading', { level: 1, name: new RegExp(`^${name}`) })).toBeVisible()
  await expect(page2.getByText('You owe ₹300')).toBeVisible()
  await page2.goto('/activity')
  await expect(page2.getByText(name).first()).toBeVisible() // the backfilled mirror, with its group badge

  await page2.goto('/groups')
  await page2.getByRole('link', { name: new RegExp(name) }).click()
  await page2.getByRole('tab', { name: 'Balances' }).click()
  await page2.getByRole('button', { name: /^Settle up ₹200 with / }).click()
  const settle = page2.getByRole('dialog', { name: /^Pay / })
  await settle.getByRole('button', { name: 'I’ve paid' }).click()
  await expect(settle.getByText(/Waiting for .+ to confirm\./)).toBeVisible()

  // Back to the payee, who has moved to Expenses: the notification arrives live (SSE), or within the 30 s polling fallback.
  await page.getByRole('tab', { name: 'Expenses' }).click()
  await expect(page.getByRole('tab', { name: 'Expenses', selected: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Notifications, \d+ unread$/ })).toBeVisible({ timeout: 35_000 })
  await page.getByRole('button', { name: /^Notifications, \d+ unread$/ }).click()
  await page.getByRole('button', { name: 'Confirm' }).first().click()
  await expect(page.getByText('Payment confirmed')).toBeVisible()
  // The notification links to this same group's ?tab=balances: a soft navigation that must switch the tab.
  await page.getByRole('link', { name: /says they paid you ₹200/ }).click()
  await expect(page.getByRole('tab', { name: 'Balances', selected: true })).toBeVisible()
  await expect(page.getByText('Asha pays Ravi ₹100', { exact: true })).toBeVisible()
  await expect(page.getByText('Asha pays you ₹200', { exact: true })).toHaveCount(0)
  await ctx2.close()
})
