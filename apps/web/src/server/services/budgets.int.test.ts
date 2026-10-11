import { and, eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { getDb } from '@/server/db/client'
import { auditLog } from '@/server/db/schema'
import { undo } from './audit'
import { createCategory } from './categories'
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

  it('orders by category sort, then name', async () => {
    const names = ['Echo', 'Delta', 'Charlie', 'Bravo', 'Alpha']
    for (const [i, name] of names.entries()) {
      const cat = await createCategory('user_a', { name, emoji: '🏷️', color: `#00000${i}`, kind: 'expense' })
      expect(cat.sort).toBe(500) // custom categories share one sort, so only the name can order them
      await upsertBudget('user_a', cat.id, 100_000)
    }
    expect((await listBudgets('user_a', NOW)).map((b) => b.name)).toEqual([...names].reverse())
  })

  it('concurrent first upserts record exactly one create; the rest are updates with a before', async () => {
    const food = await builtinCategory('Food & Dining')
    // Open pool connections first so the three upserts genuinely overlap.
    await Promise.all([1, 2, 3].map(() => getDb().execute(sql`select pg_sleep(0.05)`)))
    const results = await Promise.all([300_000, 400_000, 500_000].map((n) => upsertBudget('user_a', food.id, n)))
    expect(new Set(results.map((r) => r.data.id)).size).toBe(1)
    const rows = await getDb().select().from(auditLog)
      .where(and(eq(auditLog.userId, 'user_a'), eq(auditLog.entity, 'budget'))).orderBy(auditLog.seq)
    expect(rows.map((r) => r.action)).toEqual(['create', 'update', 'update'])
    expect(rows[0].before).toBeNull()
    expect(rows.slice(1).every((r) => r.before !== null)).toBe(true)
  })
})
