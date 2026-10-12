import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { transactionListQuerySchema } from '@/lib/schemas/transactions'
import { getDb } from '@/server/db/client'
import { transactions, users } from '@/server/db/schema'
import { createCheckin } from './checkins'
import { createGroup } from './groups/groups'
import { claimInvite, getInvite } from './groups/invites'
import { createGroupExpense } from './groups/expenses'
import { markSettlement, resolveSettlement } from './groups/settlements'
import { createRecurring, materializeDueRecurring } from './recurring'
import { getSafeToSpend } from './safe-to-spend'
import { confirmDraft, createTransaction, deleteTransaction, listTransactions } from './transactions'

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

  describe('check-in boundary (I-3)', () => {
    const CHECKIN = new Date('2026-10-11T04:45:30Z') // 10:15:30 IST
    const LATER = new Date('2026-10-11T12:00:00Z') // 17:30 IST
    const expense = (amount: number, occurredAt: Date, status: 'confirmed' | 'draft' = 'confirmed') =>
      createTransaction('user_a', { type: 'expense', amount, categoryId: foodId, method: 'upi', occurredAt, note: null }, { status })

    it('P5: counts an expense logged after the check-in but stamped with the check-in minute', async () => {
      await createCheckin('user_a', 5_000_000, CHECKIN)
      await expense(12_000, new Date('2026-10-11T04:45:00Z')) // 10:15:00 IST, minute-rounded by the client
      expect((await getSafeToSpend('user_a', LATER)).breakdown.balance).toBe(5_000_000 - 12_000)
    })

    it('ignores a back-dated expense from the previous IST day even when logged after the check-in', async () => {
      await createCheckin('user_a', 5_000_000, CHECKIN)
      await expense(30_000, new Date('2026-10-10T14:00:00Z')) // 19:30 IST Oct 10
      expect((await getSafeToSpend('user_a', LATER)).breakdown.balance).toBe(5_000_000)
    })

    it('ignores an expense in the check-in minute that was logged before the check-in', async () => {
      const early = await expense(40_000, new Date('2026-10-11T04:45:10Z'))
      await getDb().update(transactions).set({ createdAt: new Date('2026-10-11T04:45:10Z') }).where(eq(transactions.id, early.data.id))
      await createCheckin('user_a', 5_000_000, CHECKIN)
      expect((await getSafeToSpend('user_a', LATER)).breakdown.balance).toBe(5_000_000)
    })

    it('counts a bill draft due today (12:00 IST) after a 15:00 IST check-in', async () => {
      await createCheckin('user_a', 5_000_000, new Date('2026-10-11T09:30:00Z')) // 15:00 IST
      await expense(64_900, new Date('2026-10-11T06:30:00Z'), 'draft') // 12:00 IST, the materialized due-day stamp
      await expense(10_000, new Date('2026-10-10T06:30:00Z'), 'draft') // due yesterday: before the check-in day
      const r = await getSafeToSpend('user_a', LATER)
      expect(r.breakdown.committedOut).toBe(64_900)
      expect(r.breakdown.balance).toBe(5_000_000)
    })

    it('confirming a due-today recurring draft after a same-day check-in leaves Safe-to-Spend unchanged', async () => {
      const rentId = (await builtinCategory('Rent')).id
      await createRecurring('user_a', { kind: 'bill', name: 'Netflix', amount: 64_900, cadence: 'monthly', nextDueOn: '2026-10-11', categoryId: rentId })
      await materializeDueRecurring('user_a', '2026-10-11') // draft stamped 12:00 IST
      await createCheckin('user_a', 5_000_000, new Date('2026-10-11T09:30:00Z')) // 15:00 IST
      const before = await getSafeToSpend('user_a', LATER)
      expect(before.breakdown.committedOut).toBe(64_900)

      const [draft] = (await listTransactions('user_a', transactionListQuerySchema.parse({ status: 'draft' }))).data
      await confirmDraft('user_a', draft.id)

      const after = await getSafeToSpend('user_a', LATER)
      expect(after.breakdown.committedOut).toBe(before.breakdown.committedOut - 64_900)
      expect(after.breakdown.balance).toBe(before.breakdown.balance - 64_900)
      expect(after.amount).toBe(before.amount)
    })

    it('does not count a confirmed recurring row dated the previous IST day', async () => {
      await createCheckin('user_a', 5_000_000, new Date('2026-10-11T09:30:00Z')) // 15:00 IST
      await createTransaction(
        'user_a',
        { type: 'expense', amount: 64_900, categoryId: foodId, method: 'upi', occurredAt: new Date('2026-10-10T06:30:00Z'), note: null },
        { source: 'recurring' },
      )
      const r = await getSafeToSpend('user_a', LATER)
      expect(r.breakdown.balance).toBe(5_000_000)
      expect(r.breakdown.committedOut).toBe(0)
    })

    it('still ignores a manual confirmed expense dated earlier today but logged before the check-in', async () => {
      const early = await expense(64_900, new Date('2026-10-11T06:30:00Z')) // 12:00 IST
      await getDb().update(transactions).set({ createdAt: new Date('2026-10-11T07:00:00Z') }).where(eq(transactions.id, early.data.id))
      await createCheckin('user_a', 5_000_000, new Date('2026-10-11T09:30:00Z')) // 15:00 IST
      expect((await getSafeToSpend('user_a', LATER)).breakdown.balance).toBe(5_000_000)
    })
  })
})

describe('Safe-to-Spend with groups (spec §2.4 worked example)', () => {
  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a', { name: 'Me' })
    await makeUser('user_b', { name: 'Friend' })
  })

  it('S moves by my share only; settling never changes S; owed money can be left out', async () => {
    const food = (await builtinCategory('Food & Dining')).id
    const before = new Date(Date.now() - 60_000)
    await createCheckin('user_a', 5_000_000, before)
    await createCheckin('user_b', 5_000_000, before)
    const { data: g } = await createGroup('user_a', { name: 'Dinner club', placeholders: [{ displayName: 'Friend' }, { displayName: 'Other' }] })
    const friend = g.members.find((m) => m.displayName === 'Friend')!.id
    const other = g.members.find((m) => m.displayName === 'Other')!.id
    await claimInvite('user_b', (await getInvite('user_a', g.id)).url.split('/join/')[1], { memberId: friend })
    const a0 = (await getSafeToSpend('user_a')).amount
    const b0 = (await getSafeToSpend('user_b')).amount

    // I pay ₹3,000 dinner for three.
    await createGroupExpense('user_a', g.id, {
      description: 'Dinner', amountPaise: 300_000, categoryId: food,
      payers: [{ memberId: g.myMemberId, paidPaise: 300_000 }], split: { mode: 'equal', memberIds: [g.myMemberId, friend, other] },
    })
    const a1 = await getSafeToSpend('user_a')
    const b1 = await getSafeToSpend('user_b')
    expect(a1.breakdown.balance).toBe(5_000_000 - 300_000) // B −3,000 (cash)
    expect(a1.breakdown.receivables).toBe(200_000) // G +2,000
    expect(a1.amount).toBe(a0 - 100_000) // S −1,000
    expect(b1.amount).toBe(b0 - 100_000) // friend: G −1,000

    const { data: s } = await markSettlement('user_b', g.id, { fromMemberId: friend, toMemberId: g.myMemberId, amountPaise: 100_000 })
    await resolveSettlement('user_a', s.id, 'confirmed')
    expect((await getSafeToSpend('user_a')).amount).toBe(a1.amount)
    expect((await getSafeToSpend('user_b')).amount).toBe(b1.amount)

    await getDb().update(users).set({ countReceivables: false }).where(eq(users.id, 'user_a'))
    expect((await getSafeToSpend('user_a')).breakdown.receivables).toBe(0)
  })
})
