import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { getInsights } from './insights'
import { createTransaction } from './transactions'

describe('getInsights', () => {
  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a')
  })

  it('groups by IST day and compares with the previous window', async () => {
    const food = await builtinCategory('Food & Dining')
    const taxi = await builtinCategory('Transport')
    const add = (amount: number, iso: string, categoryId = food.id) =>
      createTransaction('user_a', { type: 'expense', amount, categoryId, method: 'upi', occurredAt: new Date(iso), note: null })
    await add(10_000, '2026-10-11T19:00:00Z')          // 00:30 IST Oct 12
    await add(20_000, '2026-10-12T06:00:00Z')          // Oct 12
    await add(5_000, '2026-10-13T06:00:00Z', taxi.id)  // Oct 13
    await add(7_000, '2026-10-10T06:00:00Z')           // previous window (Oct 10–11)

    const r = await getInsights('user_a', '2026-10-12', '2026-10-13')
    expect(r.totalExpense).toBe(35_000)
    expect(r.byDay).toEqual([{ date: '2026-10-12', expense: 30_000 }, { date: '2026-10-13', expense: 5_000 }])
    const foodRow = r.byCategory.find((c) => c.name === 'Food & Dining')!
    expect(foodRow).toMatchObject({ amount: 30_000, previous: 7_000 })
  })
})
