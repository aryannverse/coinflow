import { expect, test } from '@playwright/test'
import { e2eEmail, signInOnboarded, withSql } from './helpers'

test('a due bill appears as a draft and can be confirmed', async ({ page }) => {
  await signInOnboarded(page)
  await withSql(async (sql) => {
    const [u] = await sql`select id from users where email = ${e2eEmail()}`
    const [cat] = await sql`select id from categories where user_id is null and name = 'Subscriptions'`
    // "Today" is the IST day, which is what the app compares against.
    await sql`insert into recurring_items (user_id, kind, name, amount, cadence, next_due_on, anchor_day, category_id)
              values (${u.id}, 'bill', 'Netflix', 64900, 'monthly',
                      (now() at time zone 'Asia/Kolkata')::date,
                      extract(day from (now() at time zone 'Asia/Kolkata'))::smallint, ${cat.id})`
  })
  await page.goto('/home')
  const drafts = page.getByRole('region', { name: /Waiting for you/ })
  // Several nodes carry the name (visible text plus sr-only button labels): assert on the row, not the text.
  await expect(drafts.getByRole('listitem').filter({ hasText: 'Netflix' })).toBeVisible()
  await drafts.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('status').getByText('Confirmed Netflix')).toBeVisible()
  await expect(drafts).toHaveCount(0)
  // The last draft is gone, so focus lands on the Recent heading instead of falling to <body>.
  await expect(page.locator('#recent-title')).toBeFocused()
})
