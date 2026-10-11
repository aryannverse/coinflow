import { expect, test } from '@playwright/test'
import { openQuickAdd, signInOnboarded } from './helpers'

test('quick add in ≤ 3 interactions, then undo restores Safe-to-Spend', async ({ page, isMobile }) => {
  await signInOnboarded(page, 50_000)
  const sts = page.getByRole('region', { name: 'Safe to spend' }).locator('[data-amount]').first()
  const before = await sts.getAttribute('data-amount')

  await openQuickAdd(page, isMobile)
  await page.getByLabel('Amount').fill('450')
  await page.getByRole('radio', { name: /Food & Dining/ }).click()
  await page.getByRole('button', { name: /Save ₹450/ }).click()

  await expect(page.getByRole('status').getByText('Added ₹450 expense')).toBeVisible()
  await expect(sts).not.toHaveAttribute('data-amount', before!)

  // ⌘Z inside a text field must NOT trigger app undo
  await page.keyboard.press('ControlOrMeta+k')
  await page.keyboard.type('x')
  await page.keyboard.press('ControlOrMeta+z')
  await page.keyboard.press('Escape')
  await expect(page.getByText('Undone')).toHaveCount(0)

  await page.getByRole('button', { name: /^Undo/ }).click()
  await expect(page.getByText('Undone')).toBeVisible()
  await expect(sts).toHaveAttribute('data-amount', before!)
})
