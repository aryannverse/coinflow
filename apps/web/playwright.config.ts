import { loadEnvConfig } from '@next/env'
import { defineConfig, devices } from '@playwright/test'

// dev = true so `.env.development*` / `.env.local` load and `.env.production` never does.
loadEnvConfig(process.cwd(), true)
// @clerk/testing reads the un-prefixed name
process.env.CLERK_PUBLISHABLE_KEY ??= process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

const BASE_URL = 'http://localhost:3000'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  // Screens for the HCI docs run only on request (CAPTURE=1), against a production build.
  grepInvert: process.env.CAPTURE ? undefined : /@capture/,
  reporter: [['list'], ['html', { open: 'never' }]],
  // Runs once in the main process so CLERK_TESTING_TOKEN reaches every worker.
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: BASE_URL, trace: 'retain-on-failure' },
  // Playwright owns this server's lifecycle (it reuses one that is already on :3000).
  webServer: { command: 'pnpm dev', url: BASE_URL, reuseExistingServer: true, timeout: 120_000 },
  projects: [
    // Resets ONLY the E2E user's rows. Skips itself when E2E_CLERK_USER_EMAIL is unset (public-only runs).
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    {
      name: 'desktop',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'dark' },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      testIgnore: /keyboard\.spec\.ts/, // desktop-only keyboard flows
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        colorScheme: 'light',
        // next-themes keeps the choice in localStorage('theme'); without this the app would render its dark default.
        storageState: { cookies: [], origins: [{ origin: BASE_URL, localStorage: [{ name: 'theme', value: 'light' }] }] },
      },
    },
  ],
})
