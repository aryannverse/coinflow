import { isNull } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { getDb } from './client'
import { categories, transactions } from './schema'

describe('schema', () => {
  beforeEach(resetDb)

  it('ships 21 built-in categories, two of them system-only', async () => {
    const rows = await getDb().select().from(categories).where(isNull(categories.userId))
    expect(rows).toHaveLength(21)
    expect(rows.filter((r) => r.system).map((r) => `${r.name}/${r.kind}`).sort()).toEqual(['Settle up received/income', 'Settle up/expense'])
  })

  it('allows a zero-cash expense only for a group mirror', async () => {
    const user = await makeUser()
    const food = await builtinCategory('Food & Dining')
    await expect(
      getDb().insert(transactions).values({
        userId: user.id, type: 'expense', amount: 0, personalShare: 30_000, source: 'group',
        categoryId: food.id, occurredAt: new Date(),
      }),
    ).resolves.toBeDefined()
  })

  it('rejects non-positive amounts', async () => {
    const user = await makeUser()
    const food = await builtinCategory('Food & Dining')
    await expect(
      getDb().insert(transactions).values({
        userId: user.id, type: 'expense', amount: 0, personalShare: 0,
        categoryId: food.id, occurredAt: new Date(),
      }),
    ).rejects.toMatchObject({ cause: { constraint_name: 'transactions_amount_positive' } })
  })

  it('treats built-in category names as unique even with NULL owner', async () => {
    await expect(
      getDb().insert(categories).values({ userId: null, name: 'Rent', emoji: '🏠', color: '#000', kind: 'expense' }),
    ).rejects.toMatchObject({ cause: { constraint_name: 'categories_owner_name_kind' } })
  })
})
