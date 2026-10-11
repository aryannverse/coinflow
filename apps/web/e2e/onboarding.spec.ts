import { expect, test } from '@playwright/test'
import { signInFresh } from './helpers'

test('new user completes onboarding and sees Safe-to-Spend', async ({ page }) => {
  await signInFresh(page)
  await page.goto('/home')
  await page.waitForURL('**/onboarding')
  await page.getByLabel('Name').fill('Asha')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Payday (day of month)').fill('1')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Balance in rupees').fill('50000')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click() // bills
  await page.getByRole('button', { name: 'Continue' }).click() // basics
  await page.getByRole('button', { name: 'Continue' }).click() // upi
  await expect(page.getByText('You can safely spend')).toBeVisible()
  await page.getByRole('button', { name: 'Go to Coinflow' }).click()
  await page.waitForURL('**/home')
  await expect(page.getByRole('heading', { name: 'Safe to spend' })).toBeVisible()
})
