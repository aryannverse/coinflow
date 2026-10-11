import { expect, test } from '@playwright/test'
import { signInOnboarded } from './helpers'

test.use({ reducedMotion: 'reduce' })

test('landing has no WebGL canvas and no Lenis when motion is reduced', { tag: '@public' }, async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('canvas')).toHaveCount(0)
  await expect(page.locator('html')).not.toHaveClass(/\blenis\b/)
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true')
})

test('app pages honour reduced motion', async ({ page }) => {
  await signInOnboarded(page)
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true')
  await expect(page.locator('canvas')).toHaveCount(0)
})
