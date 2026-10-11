import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

test('landing offers "Open Coinflow" to a signed-in visitor', async ({ page }) => {
  await signIn(page)
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Open Coinflow' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /start free/i })).toHaveCount(0)
})
