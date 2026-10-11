import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { undo } from './audit'
import { deleteBudget, listBudgets, upsertBudget } from './budgets'
import { createTransaction } from './transactions'

const NOW = new Date('2026-10-11T06:30:00Z')

describe('budgets', () => {
  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a')
  })

  it('reports spend in the current pay cycle against the limit', async () => {
    const food = await builtinCategory('Food & Dining')
    await upsertBudget('user_a', food.id, 500_000)
    await createTransaction('user_a', { type: 'expense', amount: 320_000, categoryId: food.id, method: 'upi', occurredAt: new Date('2026-10-03T06:00:00Z'), note: null })
    await createTransaction('user_a', { type: 'expense', amount: 999_000, categoryId: food.id, method: 'upi', occurredAt: new Date('2026-09-25T06:00:00Z'), note: null }) // previous cycle
    const [b] = await listBudgets('user_a', NOW)
    expect(b).toMatchObject({ name: 'Food & Dining', monthlyLimit: 500_000, spent: 320_000 })
  })

  it('upsert replaces the limit; delete is undoable', async () => {
    const food = await builtinCategory('Food & Dining')
    await upsertBudget('user_a', food.id, 500_000)
    await upsertBudget('user_a', food.id, 700_000)
    expect((await listBudgets('user_a', NOW))[0].monthlyLimit).toBe(700_000)
    const { auditId } = await deleteBudget('user_a', food.id)
    expect(await listBudgets('user_a', NOW)).toHaveLength(0)
    await undo('user_a', auditId)
    expect(await listBudgets('user_a', NOW)).toHaveLength(1)
  })

  it('rejects income categories', async () => {
    const salary = await builtinCategory('Salary', 'income')
    await expect(upsertBudget('user_a', salary.id, 1)).rejects.toMatchObject({ status: 422 })
  })
})
