import { expect, test } from '@playwright/test'
import { signInFresh, signInOnboarded, tabTo } from './helpers'

// Desktop only (the mobile project ignores this file): a real keyboard is the input.

test('quick add is completable from the keyboard: N, amount, Tab to a category, Space, Enter', async ({ page }) => {
  await signInOnboarded(page)
  await page.keyboard.press('n')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByLabel('Amount')).toBeFocused() // quick add focuses the amount field itself
  await page.keyboard.type('450')
  await page.keyboard.press('Tab')
  const first = page.getByRole('radio').first()
  await expect(first).toBeFocused()
  await page.keyboard.press('Space')
  await expect(first).toBeChecked()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /^Undo/ })).toBeVisible() // the undo toast means it saved
})

test('onboarding can be finished with Tab and Enter only', async ({ page }) => {
  await signInFresh(page)
  await page.goto('/onboarding')

  const type = async (label: string, value: string) => {
    await page.getByLabel(label).focus()
    await page.keyboard.press('ControlOrMeta+a') // replace any prefilled value
    await page.keyboard.type(value)
  }
  const next = async (name: 'Continue' | 'Go to Coinflow') => {
    await tabTo(page, page.getByRole('button', { name }))
    await page.keyboard.press('Enter')
  }

  await type('Name', 'Asha')
  await next('Continue')
  await expect(page.getByLabel('Payday (day of month)')).toBeVisible()
  await type('Payday (day of month)', '1')
  await next('Continue')
  await expect(page.getByLabel('Balance in rupees')).toBeVisible()
  await type('Balance in rupees', '50000')
  await next('Continue')
  await next('Continue') // bills
  await next('Continue') // basics
  await next('Continue') // upi
  await expect(page.getByText('You can safely spend')).toBeVisible()
  await next('Go to Coinflow')
  await page.waitForURL('**/home')
})
