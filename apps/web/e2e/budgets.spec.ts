import { expect, test } from '@playwright/test'
import { signInOnboarded } from './helpers'

test('budget slider is keyboard-operable and over-plan copy is neutral', async ({ page }) => {
  await signInOnboarded(page)
  await page.goto('/insights')
  await page.getByRole('combobox', { name: 'Add a plan for a category' }).click()
  await page.getByRole('option', { name: /Food & Dining/ }).click()
  const slider = page.getByRole('slider', { name: 'Food & Dining monthly plan' })
  await slider.focus()
  // Keys commit once, after a debounce: wait for that PUT so the assertions see the saved plan.
  const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && /\/api\/v1\/budgets\//.test(r.url()) && r.ok())
  await page.keyboard.press('ArrowRight')
  await expect(slider).toHaveAttribute('aria-valuetext', '₹5,500')
  await saved
  const label = page.getByText(/of ₹5,500|over plan/)
  await expect(label).toBeVisible()
  const color = await label.evaluate((el) => getComputedStyle(el).color)
  expect(color).not.toMatch(/rgb\(2[0-5]\d, [0-9]{1,2}, [0-9]{1,2}\)/) // not a saturated red
})
