import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, test, type Page } from '@playwright/test'
import { seedSampleLedger, signInFresh, signInOnboarded } from './helpers'

/**
 * WCAG 1.4.10 Reflow: at 320 CSS px (and the 390 px phone baseline) no page may scroll sideways. Phone widths
 * only, so this runs in the mobile project. App routes are checked with data on screen (chart tables, a paused
 * bill), because the empty states hide exactly the content that overflowed before. Both motion settings are
 * checked: the Insights tables overflowed only with reduced motion, where tiles render without their reveal wrapper.
 */
const WIDTHS = [390, 320] as const
const MOTION = ['no-preference', 'reduce'] as const

async function expectNoSidewaysScroll(page: Page, path: string, ready: (page: Page) => Promise<void>) {
  for (const reducedMotion of MOTION) {
    await page.emulateMedia({ reducedMotion })
    for (const width of WIDTHS) {
      const where = `${path} at ${width}px (reduced motion: ${reducedMotion})`
      await page.setViewportSize({ width, height: 844 })
      await page.goto(path)
      await ready(page)
      await page.waitForLoadState('networkidle')
      // Polled: charts resize on the next ResizeObserver tick after load. A phone browser widens the layout
      // viewport to fit overflowing content, so innerWidth is checked as well as scrollWidth.
      await expect
        .poll(() => page.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth)), { message: `${where} must not scroll sideways` })
        .toBeLessThanOrEqual(width)
    }
  }
}

test.beforeEach(({ isMobile }) => {
  test.skip(!isMobile, 'Reflow is a phone-width check (mobile project).')
  // Four full page loads (2 widths × 2 motion settings) after a sign-in: give them a triple budget.
  test.slow()
})

test('landing page reflows at 390 and 320', { tag: '@public' }, async ({ page }) => {
  await setupClerkTestingToken({ page })
  await expectNoSidewaysScroll(page, '/', (p) => expect(p.getByRole('heading', { level: 1 })).toBeVisible())
})

test('onboarding reflows at 390 and 320', async ({ page }) => {
  await signInFresh(page)
  await expectNoSidewaysScroll(page, '/onboarding', (p) => expect(p.getByRole('button', { name: 'Skip setup for now' })).toBeVisible())
})

const READY: Record<string, (page: Page) => Promise<void>> = {
  '/home': (p) => expect(p.getByRole('heading', { name: 'Safe to spend', exact: true })).toBeVisible(),
  '/activity': (p) => expect(p.getByText('Swiggy biryani').first()).toBeVisible(),
  '/insights': (p) => expect(p.getByRole('table', { name: /Daily spending/ })).toBeAttached(),
  '/recurring': (p) => expect(p.getByText('Gym membership')).toBeVisible(),
  '/profile': (p) => expect(p.getByRole('heading', { level: 1 })).toBeVisible(),
}

for (const [path, ready] of Object.entries(READY)) {
  test(`${path} reflows at 390 and 320`, async ({ page }) => {
      await signInOnboarded(page)
    await seedSampleLedger()
    await expectNoSidewaysScroll(page, path, ready)
  })
}
