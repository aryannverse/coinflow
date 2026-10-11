import { expect, test } from '@playwright/test'
import { signInOnboarded } from './helpers'

test('theme toggle persists across reloads', async ({ page }) => {
  await signInOnboarded(page)
  const html = page.locator('html')
  const wasDark = (await html.getAttribute('class'))?.includes('dark')
  await page.getByRole('button', { name: 'Switch colour theme' }).first().click()
  await expect(html).toHaveClass(wasDark ? /^(?!.*\bdark\b)/ : /\bdark\b/)
  await page.reload()
  await expect(html).toHaveClass(wasDark ? /^(?!.*\bdark\b)/ : /\bdark\b/)
})

test('each project renders its own theme: desktop dark, mobile light', async ({ page, isMobile }) => {
  await signInOnboarded(page)
  const html = page.locator('html')
  if (isMobile) await expect(html).not.toHaveClass(/\bdark\b/)
  else await expect(html).toHaveClass(/\bdark\b/)
})
