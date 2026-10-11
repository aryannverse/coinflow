import { setupClerkTestingToken } from '@clerk/testing/playwright'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { openQuickAdd, signInFresh, signInOnboarded } from './helpers'

async function seriousViolations(page: Page, exclude: string[] = []) {
  const axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
  for (const selector of exclude) axe.exclude(selector)
  const { violations } = await axe.analyze()
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.html.slice(0, 120)} ${n.any[0]?.message ?? ''}`).join(' | ')}`)
}

// Public pages: no sign-in needed.
for (const path of ['/', '/sign-in', '/sign-up']) {
  test(`no serious axe violations on ${path}`, { tag: '@public' }, async ({ page }) => {
    await setupClerkTestingToken({ page })
    await page.goto(path)
    // Clerk's widgets keep a connection busy, so `networkidle` never settles there: wait for the form instead.
    if (path === '/') await page.waitForLoadState('networkidle')
    else await expect(page.getByRole('textbox').first()).toBeVisible()
    // Clerk's own "Secured by Clerk" footer (orange dev-instance badge on a dev key) is third-party markup we cannot restyle.
    expect(await seriousViolations(page, path === '/' ? [] : ['.cl-footer'])).toEqual([])
  })
}

test('no serious axe violations on /onboarding (fresh user, before Skip)', async ({ page }) => {
  await signInFresh(page)
  await page.goto('/onboarding')
  await expect(page.getByRole('button', { name: 'Skip setup for now' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(await seriousViolations(page)).toEqual([])
})

for (const path of ['/home', '/activity', '/insights', '/recurring', '/profile']) {
  test(`no serious axe violations on ${path}`, async ({ page }) => {
    await signInOnboarded(page)
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    expect(await seriousViolations(page)).toEqual([])
  })
}

test('no serious axe violations on quick add or with the undo toast showing', async ({ page, isMobile }) => {
  await signInOnboarded(page)
  await openQuickAdd(page, isMobile)
  await page.getByLabel('Amount').fill('450')
  await page.getByRole('radio', { name: /Food & Dining/ }).click()
  await page.waitForLoadState('networkidle')
  expect(await seriousViolations(page)).toEqual([])

  await page.getByRole('button', { name: /Save ₹450/ }).click()
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeVisible()
  // The toast fades in; axe would read the Undo button's colour mid-fade. Wait for it to settle, never exclude it.
  await expect(page.locator('[data-sonner-toast]').first()).toHaveCSS('opacity', '1')
  expect(await seriousViolations(page)).toEqual([])
})
