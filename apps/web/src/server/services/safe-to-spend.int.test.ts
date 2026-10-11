import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { getDb } from '@/server/db/client'
import { users } from '@/server/db/schema'
import { createCheckin } from './checkins'
import { createRecurring } from './recurring'
import { getSafeToSpend } from './safe-to-spend'
import { createTransaction, deleteTransaction } from './transactions'

const NOW = new Date('2026-10-11T06:30:00Z') // 12:00 IST, Oct 11

describe('getSafeToSpend', () => {
  let foodId: string
  let salaryId: string

  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a')
    await getDb().update(users).set({ paydayDay: 1, fixedCostsEstimate: 0 }).where(eq(users.id, 'user_a'))
    foodId = (await builtinCategory('Food & Dining')).id
    salaryId = (await builtinCategory('Salary', 'income')).id
  })

  it('is unknown before the first check-in', async () => {
    expect(await getSafeToSpend('user_a', NOW)).toMatchObject({ status: 'unknown', daysLeft: 21 })
  })

  it('uses the latest check-in and only confirmed activity after it', async () => {
    await createTransaction('user_a', { type: 'expense', amount: 99_000, categoryId: foodId, method: 'upi', occurredAt: new Date('2026-10-05T06:00:00Z'), note: null })
    await createCheckin('user_a', 5_000_000, new Date('2026-10-10T06:00:00Z'))
    await createTransaction('user_a', { type: 'expense', amount: 124_000, categoryId: foodId, method: 'upi', occurredAt: new Date('2026-10-11T04:00:00Z'), note: null })
    await createTransaction('user_a', { type: 'income', amount: 20_000, categoryId: salaryId, method: 'upi', occurredAt: new Date('2026-10-11T05:00:00Z'), note: null })
    await createTransaction('user_a', { type: 'expense', amount: 1_000, categoryId: foodId, method: 'upi', occurredAt: new Date('2026-10-11T05:00:00Z'), note: null }, { status: 'draft' })

    const r = await getSafeToSpend('user_a', NOW)
    expect(r.breakdown.balance).toBe(5_000_000 - 124_000 + 20_000)
    expect(r.breakdown.committedOut).toBe(1_000) // pending draft after check-in
  })

  it('materializes due recurring items and counts schedule within the cycle', async () => {
    const rentId = (await builtinCategory('Rent')).id
    await createCheckin('user_a', 5_000_000, new Date('2026-10-01T06:00:00Z'))
    await createRecurring('user_a', { kind: 'bill', name: 'Rent', amount: 1_500_000, cadence: 'monthly', nextDueOn: '2026-10-05', categoryId: rentId })
    await createRecurring('user_a', { kind: 'bill', name: 'Netflix', amount: 64_900, cadence: 'monthly', nextDueOn: '2026-10-20', categoryId: rentId })

    const r = await getSafeToSpend('user_a', NOW)
    // Oct 5 rent became a pending draft (after the check-in); Netflix on Oct 20 is still scheduled.
    expect(r.breakdown.committedOut).toBe(1_500_000 + 64_900)
    expect(r.amount).toBe(5_000_000 - 1_564_900)
  })

  it("ignores other users' data and soft-deleted transactions", async () => {
    await makeUser('user_b')
    await createCheckin('user_b', 9_000_000, new Date('2026-10-09T06:00:00Z'))
    await createTransaction('user_b', { type: 'expense', amount: 700_000, categoryId: foodId, method: 'upi', occurredAt: new Date('2026-10-10T06:00:00Z'), note: null })
    await createTransaction('user_b', { type: 'expense', amount: 300_000, categoryId: foodId, method: 'upi', occurredAt: new Date('2026-10-11T04:00:00Z'), note: null })

    await createCheckin('user_a', 5_000_000, new Date('2026-10-10T06:00:00Z'))
    await createTransaction('user_a', { type: 'expense', amount: 50_000, categoryId: foodId, method: 'upi', occurredAt: new Date('2026-10-10T08:00:00Z'), note: null })
    const doomed = await createTransaction('user_a', { type: 'expense', amount: 80_000, categoryId: foodId, method: 'upi', occurredAt: new Date('2026-10-11T04:00:00Z'), note: null })
    await deleteTransaction('user_a', doomed.data.id)

    const r = await getSafeToSpend('user_a', NOW)
    expect(r.breakdown.balance).toBe(5_000_000 - 50_000)
    expect(r.breakdown.committedOut).toBe(0)
  })
})
