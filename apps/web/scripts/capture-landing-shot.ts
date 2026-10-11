/**
 * Recaptures `public/landing/home-dark.png` (the screenshot inside the landing page's Safari frame) from the
 * real demo user: 1440x900, dark theme, reduced motion.
 *
 * Prereqs: `pnpm dev` running on :3000, `pnpm db:seed:demo <email>` for the demo Clerk user, and
 * `DEMO_CLERK_USER_EMAIL=<that email>` in `.env.local`. Usage: `pnpm shot:landing`.
 * (It deliberately signs in as the demo user, not the E2E user.)
 *
 * After recapturing, set `SHOT_STS` in `src/components/landing/hero.tsx` to the Safe-to-spend value this script prints
 * (it drives both the alt text and the floating badge), and check the rest of `SHOT_ALT` against the image.
 * Prefer capturing against `next start`; the injected style below also hides the dev indicator.
 */
import * as nextEnv from '@next/env'
import { chromium } from '@playwright/test'
import { clerk, clerkSetup } from '@clerk/testing/playwright'

nextEnv.loadEnvConfig(process.cwd(), true)
process.env.CLERK_PUBLISHABLE_KEY ??= process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

const BASE = process.env.APP_URL ?? 'http://localhost:3000'

async function main() {
  const email = process.env.DEMO_CLERK_USER_EMAIL
  if (!email) throw new Error('Set DEMO_CLERK_USER_EMAIL in .env.local to the seeded demo user’s email.')
  await clerkSetup()
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' })
    await page.goto(`${BASE}/`)
    await clerk.signIn({ page, emailAddress: email })
    await page.goto(`${BASE}/home`)
    await page.getByRole('heading', { name: 'Safe to spend', exact: true }).waitFor()
    await page.waitForLoadState('networkidle')
    // Hide the Next dev indicator so it never ends up in the screenshot (a `next start` build has none).
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important }' })
    await page.screenshot({ path: 'public/landing/home-dark.png' })
    const sts = await page.locator('#sts-title').locator('xpath=ancestor::section[1]').locator('[data-amount]').first().getAttribute('data-amount')
    console.log(`Captured public/landing/home-dark.png. Safe to spend shown: ${sts}`)
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
