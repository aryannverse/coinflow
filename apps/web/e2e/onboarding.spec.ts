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
  // Done is the last step: nothing left to skip.
  await expect(page.getByRole('button', { name: 'Skip setup for now' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Go to Coinflow' }).click()
  await page.waitForURL('**/home')
  await expect(page.getByRole('heading', { name: 'Safe to spend' })).toBeVisible()
})

test('Continue with a half-entered bill stops on the Bills step instead of dropping it', async ({ page }) => {
  await signInFresh(page)
  await page.goto('/onboarding')
  await page.getByLabel('Name').fill('Asha')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Payday (day of month)').fill('1')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Balance in rupees').fill('50000')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: '+ Something else' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Add this bill or choose Never mind first.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add to schedule' })).toBeFocused()
  // Never mind closes the form, clears the message and lets the user move on.
  await page.getByRole('button', { name: 'Never mind' }).click()
  await expect(page.getByText('Add this bill or choose Never mind first.')).toHaveCount(0)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByLabel('Monthly basics (₹)')).toBeVisible()
})
