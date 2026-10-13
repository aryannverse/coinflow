import { expect, test, type Page } from '@playwright/test'
import { AGENT_OFFLINE, AGENT_ONLINE, signInOnboarded, stubAgent, type AgentHealth } from './helpers'

/**
 * Live smoke 2026-10-13: clicking "Ask Coinflow…" before GET /agent/health answered opened the ⌘K palette (the offline
 * fallback). Only a confirmed offline answer may do that; while health is unknown the pill opens the Ask panel.
 */
async function holdHealth(page: Page, health: AgentHealth) {
  let release!: () => void
  const held = new Promise<void>((r) => { release = r })
  await stubAgent(page, health)
  await page.unroute('**/api/v1/agent/health')
  await page.route('**/api/v1/agent/health', async (r) => {
    await held
    await r.fulfill({ json: { data: health } })
  })
  return release
}

test('a pill click before the health check answers opens Ask, not the palette', async ({ page }) => {
  await signInOnboarded(page)
  const release = await holdHealth(page, AGENT_ONLINE)
  await page.goto('/home')
  await page.getByRole('button', { name: /^Ask Coinflow…/ }).click()
  const panel = page.getByRole('dialog', { name: 'Ask Coinflow' })
  await expect(panel).toBeVisible()
  await expect(page.getByPlaceholder(/250 food lunch/)).toHaveCount(0) // not the ⌘K palette
  await expect(panel.locator('#agent-status')).toHaveText('Connecting…')
  release()
  await expect(panel.locator('#agent-status')).toHaveText('')
  await expect(panel.getByLabel('Message')).toBeEditable()
})

test('a pill click while health is pending, then offline, shows the offline state in the panel', async ({ page }) => {
  await signInOnboarded(page)
  const release = await holdHealth(page, AGENT_OFFLINE)
  await page.goto('/home')
  await page.getByRole('button', { name: /^Ask Coinflow…/ }).click()
  const panel = page.getByRole('dialog', { name: 'Ask Coinflow' })
  await expect(panel).toBeVisible()
  release()
  await expect(panel.locator('#agent-status')).toHaveText('Assistant offline. Everything else still works.')
})
