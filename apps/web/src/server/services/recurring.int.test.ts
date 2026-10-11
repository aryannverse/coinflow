import { and, count, eq, isNull } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { addDays, addMonthsAnchored, clampDayInMonth, dayOfMonth, istNoon, istStartOfDay, toISTDate } from '@/lib/dates'
import { nextOccurrence } from '@/lib/recurrence'
import { transactionListQuerySchema } from '@/lib/schemas/transactions'
import { getDb } from '@/server/db/client'
import { auditLog, recurringItems, transactions } from '@/server/db/schema'
import { undo } from './audit'
import { createCheckin } from './checkins'
import { createRecurring, deleteRecurring, listRecurring, materializeDueRecurring, updateRecurring } from './recurring'
import { getSafeToSpend } from './safe-to-spend'
import { confirmDraft, createTransaction, listTransactions } from './transactions'

const drafts = (userId: string) => listTransactions(userId, transactionListQuerySchema.parse({ status: 'draft' }))
const auditCount = async () => (await getDb().select({ n: count() }).from(auditLog))[0].n

describe('recurring service', () => {
  let rentId: string
  let salaryId: string

  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a')
    await makeUser('user_b')
    rentId = (await builtinCategory('Rent')).id
    salaryId = (await builtinCategory('Salary', 'income')).id
  })

  const rent = (over: object = {}) => ({
    kind: 'bill' as const, name: 'Rent', amount: 1_500_000, cadence: 'monthly' as const, nextDueOn: '2026-10-31', categoryId: rentId, ...over,
  })

  it('stores the anchor day from nextDueOn and validates category kind', async () => {
    const { data } = await createRecurring('user_a', rent())
    expect(data.anchorDay).toBe(31)
    await expect(createRecurring('user_a', rent({ categoryId: salaryId }))).rejects.toMatchObject({ status: 422 })
  })

  it('materializes every missed occurrence as a draft and advances nextDueOn', async () => {
    await createRecurring('user_a', rent({ nextDueOn: '2026-08-31' }))
    const created = await materializeDueRecurring('user_a', '2026-10-11')
    expect(created).toBe(2) // Aug 31, Sep 30
    const list = await drafts('user_a')
    expect(list.data.map((d) => d.source)).toEqual(['recurring', 'recurring'])
    expect((await listRecurring('user_a'))[0].nextDueOn).toBe('2026-10-31')
  })

  it('creates income drafts for income items and skips paused items', async () => {
    await createRecurring('user_a', { kind: 'income', name: 'Salary', amount: 9_000_000, cadence: 'monthly', nextDueOn: '2026-10-01', categoryId: salaryId })
    const { data: paused } = await createRecurring('user_a', rent({ nextDueOn: '2026-10-05' }))
    await updateRecurring('user_a', paused.id, { active: false })
    expect(await materializeDueRecurring('user_a', '2026-10-11')).toBe(1)
    expect((await drafts('user_a')).data[0].type).toBe('income')
  })

  it('concurrent materialization never duplicates drafts', async () => {
    await createRecurring('user_a', rent({ nextDueOn: '2026-10-01' }))
    const counts = await Promise.all([
      materializeDueRecurring('user_a', '2026-10-11'),
      materializeDueRecurring('user_a', '2026-10-11'),
      materializeDueRecurring('user_a', '2026-10-11'),
    ])
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1)
    expect((await drafts('user_a')).data).toHaveLength(1)
  })

  it('updating nextDueOn re-anchors; delete is undoable', async () => {
    const { data } = await createRecurring('user_a', rent())
    const upd = await updateRecurring('user_a', data.id, { nextDueOn: '2026-11-05' })
    expect(upd.data.anchorDay).toBe(5)
    const { auditId } = await deleteRecurring('user_a', data.id)
    expect(await listRecurring('user_a')).toHaveLength(0)
    await undo('user_a', auditId)
    expect(await listRecurring('user_a')).toHaveLength(1)
  })

  describe('empty patch', () => {
    it('is a no-op: row unchanged, auditId null, no audit row', async () => {
      const { data } = await createRecurring('user_a', rent())
      const before = await auditCount()
      const res = await updateRecurring('user_a', data.id, {})
      expect(res.auditId).toBeNull()
      expect(res.data).toEqual(data)
      expect(await auditCount()).toBe(before)
      expect(await listRecurring('user_a')).toEqual([data])
    })

    it('treats all-undefined values as empty and still 404s for foreign or missing ids', async () => {
      const { data } = await createRecurring('user_a', rent())
      expect((await updateRecurring('user_a', data.id, { name: undefined })).auditId).toBeNull()
      await expect(updateRecurring('user_b', data.id, {})).rejects.toMatchObject({ status: 404 })
      await expect(updateRecurring('user_a', '00000000-0000-4000-8000-000000000000', {})).rejects.toMatchObject({ status: 404 })
    })
  })

  describe('owner scoping', () => {
    it('another user cannot update or delete the item', async () => {
      const { data } = await createRecurring('user_a', rent())
      await expect(updateRecurring('user_b', data.id, { name: 'Hacked' })).rejects.toMatchObject({ status: 404 })
      await expect(deleteRecurring('user_b', data.id)).rejects.toMatchObject({ status: 404 })
      const [row] = await getDb().select().from(recurringItems).where(eq(recurringItems.id, data.id))
      expect(row.name).toBe('Rent')
    })

    it('materialization only touches the given user', async () => {
      await createRecurring('user_a', rent({ nextDueOn: '2026-10-01' }))
      expect(await materializeDueRecurring('user_b', '2026-10-11')).toBe(0)
      expect((await listRecurring('user_a'))[0].nextDueOn).toBe('2026-10-01')
    })
  })

  describe('resume fast-forward', () => {
    const today = () => toISTDate(new Date())

    it('jumps a long-paused item to its first occurrence on or after today, keeping the anchor', async () => {
      const t = today()
      const longAgo = addMonthsAnchored(t, -3, dayOfMonth(t))
      const { data } = await createRecurring('user_a', rent({ nextDueOn: longAgo }))
      await updateRecurring('user_a', data.id, { active: false })
      const { data: resumed } = await updateRecurring('user_a', data.id, { active: true })
      expect(resumed.nextDueOn >= t).toBe(true)
      expect(resumed.anchorDay).toBe(dayOfMonth(longAgo))
      const [y, m] = resumed.nextDueOn.split('-').map(Number)
      expect(resumed.nextDueOn).toBe(clampDayInMonth(y, m, dayOfMonth(longAgo))) // original day-of-month, clamped
      expect(addMonthsAnchored(resumed.nextDueOn, -1, resumed.anchorDay) < t).toBe(true) // first occurrence >= today
      const created = await materializeDueRecurring('user_a', t)
      expect(created).toBe(resumed.nextDueOn === t ? 1 : 0)
    })

    it('does not fast-forward when the patch sets nextDueOn explicitly', async () => {
      const t = today()
      const { data } = await createRecurring('user_a', rent({ nextDueOn: '2020-01-15' }))
      await updateRecurring('user_a', data.id, { active: false })
      const { data: resumed } = await updateRecurring('user_a', data.id, { active: true, nextDueOn: '2020-02-15' })
      expect(resumed.nextDueOn).toBe('2020-02-15')
      expect(resumed.nextDueOn < t).toBe(true)
    })

    it('does not fast-forward an item that was already active', async () => {
      const { data } = await createRecurring('user_a', rent({ nextDueOn: '2020-01-15' }))
      const { data: same } = await updateRecurring('user_a', data.id, { active: true })
      expect(same.nextDueOn).toBe('2020-01-15')
    })

    it('uses the patched cadence when it changes alongside resume', async () => {
      const t = today()
      const { data } = await createRecurring('user_a', rent({ nextDueOn: '2026-01-05' }))
      await updateRecurring('user_a', data.id, { active: false })
      const { data: resumed } = await updateRecurring('user_a', data.id, { active: true, cadence: 'weekly' })
      expect(resumed.nextDueOn >= t).toBe(true)
      expect(resumed.cadence).toBe('weekly')
      expect(resumed.nextDueOn < addDays(t, 7)).toBe(true) // first occurrence on/after today, not a later one
      // weekly steps from 2026-01-05 (a Monday): result lands on the same weekday
      expect(new Date(`${resumed.nextDueOn}T00:00:00Z`).getUTCDay()).toBe(new Date('2026-01-05T00:00:00Z').getUTCDay())
    })
  })

  describe('cadence change', () => {
    // Weekly materialization moves nextDueOn off the original day while anchorDay stays put.
    const staleAnchorWeekly = async () => {
      const { data } = await createRecurring('user_a', rent({ cadence: 'weekly', nextDueOn: '2026-01-05' }))
      await materializeDueRecurring('user_a', '2026-01-11') // draft for Jan 5; nextDueOn -> Jan 12, anchorDay still 5
      const [item] = await listRecurring('user_a')
      expect(item).toMatchObject({ id: data.id, nextDueOn: '2026-01-12', anchorDay: 5 })
      return item
    }

    it('re-anchors to the current schedule day when the cadence changes', async () => {
      const item = await staleAnchorWeekly()
      const { data } = await updateRecurring('user_a', item.id, { cadence: 'monthly' })
      expect(data.anchorDay).toBe(12)
      expect(nextOccurrence(data.nextDueOn, 'monthly', data.anchorDay)).toBe('2026-02-12')
    })

    it('keeps the anchor when the cadence is unchanged', async () => {
      const item = await staleAnchorWeekly()
      const { data } = await updateRecurring('user_a', item.id, { cadence: 'weekly', name: 'Rent 2' })
      expect(data.anchorDay).toBe(5)
    })

    it('resume with a cadence change fast-forwards from the current schedule day, then re-anchors', async () => {
      const t = toISTDate(new Date())
      const item = await staleAnchorWeekly()
      await updateRecurring('user_a', item.id, { active: false })
      const { data } = await updateRecurring('user_a', item.id, { active: true, cadence: 'monthly' })
      expect(data.nextDueOn >= t).toBe(true)
      const [y, m] = data.nextDueOn.split('-').map(Number)
      expect(data.nextDueOn).toBe(clampDayInMonth(y, m, 12))
      expect(data.anchorDay).toBe(12) // the schedule day before the change, not the fast-forward result
    })

    describe('with a clamped fast-forward (M-3)', () => {
      afterEach(() => { vi.useRealTimers() })

      it('stores the user’s schedule day, not the clamped day the fast-forward landed on', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-11-15T06:30:00Z')) // 12:00 IST, Nov 15
        const { data } = await createRecurring('user_a', rent({ cadence: 'weekly', nextDueOn: '2026-10-31' }))
        await updateRecurring('user_a', data.id, { active: false })
        const { data: resumed } = await updateRecurring('user_a', data.id, { active: true, cadence: 'monthly' })
        expect(resumed.nextDueOn).toBe('2026-11-30') // first monthly occurrence on/after Nov 15, clamped from 31
        expect(resumed.anchorDay).toBe(31)
        expect(nextOccurrence(resumed.nextDueOn, 'monthly', resumed.anchorDay)).toBe('2026-12-31')
      })
    })
  })

  describe('unchanged fields in a full-body save (I-2)', () => {
    const body = (item: Awaited<ReturnType<typeof listRecurring>>[number]) => ({
      kind: item.kind, name: item.name, amount: item.amount, cadence: item.cadence,
      nextDueOn: item.nextDueOn, categoryId: item.categoryId, active: item.active,
    })

    it('P3: an amount-only edit that re-sends a clamped nextDueOn keeps anchor 31', async () => {
      await createRecurring('user_a', rent({ nextDueOn: '2026-10-31' }))
      await materializeDueRecurring('user_a', '2026-10-31') // draft for Oct 31; nextDueOn -> Nov 30 (clamped)
      const [item] = await listRecurring('user_a')
      expect(item).toMatchObject({ nextDueOn: '2026-11-30', anchorDay: 31 })
      const { data, auditId } = await updateRecurring('user_a', item.id, { ...body(item), amount: 1_600_000 })
      expect(auditId).toEqual(expect.any(String))
      expect(data).toMatchObject({ amount: 1_600_000, nextDueOn: '2026-11-30', anchorDay: 31 })
      expect(nextOccurrence(data.nextDueOn, 'monthly', data.anchorDay)).toBe('2026-12-31')
    })

    it('a full-body save with no changes is a no-op with auditId null', async () => {
      await createRecurring('user_a', rent())
      const [item] = await listRecurring('user_a')
      const before = await auditCount()
      const res = await updateRecurring('user_a', item.id, body(item))
      expect(res.auditId).toBeNull()
      expect(res.data).toEqual(item)
      expect(await auditCount()).toBe(before)
    })
  })

  describe('undo cleans materialized drafts (I-1)', () => {
    const t = () => toISTDate(new Date())
    const liveDrafts = (itemId?: string) => getDb().select().from(transactions).where(and(
      eq(transactions.userId, 'user_a'), eq(transactions.status, 'draft'), isNull(transactions.deletedAt),
      itemId ? eq(transactions.recurringItemId, itemId) : undefined,
    ))

    it('P1: undo resume, resume again, read again leaves one draft for today', async () => {
      const today = t()
      const { data } = await createRecurring('user_a', rent({ cadence: 'weekly', nextDueOn: addDays(today, -14) }))
      await updateRecurring('user_a', data.id, { active: false })
      const resume = await updateRecurring('user_a', data.id, { active: true })
      expect(resume.data.nextDueOn).toBe(today)
      await getSafeToSpend('user_a')
      await undo('user_a', resume.auditId!)
      await updateRecurring('user_a', data.id, { active: true })
      await getSafeToSpend('user_a')
      const forToday = (await drafts('user_a')).data.filter((d) => toISTDate(d.occurredAt) === today)
      expect(forToday).toHaveLength(1)
    })

    it('P2: undoing a create removes the item and soft-deletes its drafts, so R no longer counts them', async () => {
      const today = t()
      await createCheckin('user_a', 50_000_000, istStartOfDay(addDays(today, -60)))
      const { data, auditId } = await createRecurring('user_a', rent({ cadence: 'weekly', nextDueOn: addDays(today, -28) }))
      const before = await getSafeToSpend('user_a')
      expect(await liveDrafts(data.id)).toHaveLength(5)
      expect(before.breakdown.committedOut).toBeGreaterThanOrEqual(5 * 1_500_000)
      await undo('user_a', auditId)
      expect(await listRecurring('user_a')).toHaveLength(0)
      expect(await liveDrafts()).toHaveLength(0)
      expect((await getSafeToSpend('user_a')).breakdown.committedOut).toBe(0)
    })

    it('never touches confirmed rows or drafts that existed before the undone change', async () => {
      const today = t()
      const { data } = await createRecurring('user_a', rent({ cadence: 'weekly', nextDueOn: addDays(today, -7) }))
      await materializeDueRecurring('user_a', today) // drafts for today-7 and today
      const [older] = await liveDrafts(data.id)
      await confirmDraft('user_a', older.id)
      const rename = await updateRecurring('user_a', data.id, { name: 'Rent (flat 4B)' })
      await undo('user_a', rename.auditId!)
      expect(await liveDrafts(data.id)).toHaveLength(1)
      const [confirmed] = await getDb().select().from(transactions).where(eq(transactions.id, older.id))
      expect(confirmed).toMatchObject({ status: 'confirmed', deletedAt: null })
    })
  })

  describe('duplicate-draft backstop', () => {
    it('the database rejects a second live draft for the same item and day', async () => {
      const { data } = await createRecurring('user_a', rent({ nextDueOn: '2026-10-05' }))
      const draft = { type: 'expense' as const, amount: 1_500_000, categoryId: rentId, method: 'upi' as const, occurredAt: istNoon('2026-10-05') }
      const opts = { status: 'draft' as const, source: 'recurring' as const, recurringItemId: data.id }
      await createTransaction('user_a', draft, opts)
      await expect(createTransaction('user_a', draft, opts)).rejects.toMatchObject({
        cause: { constraint_name: 'transactions_recurring_draft_unique' },
      })
    })

    it('materialize skips an occurrence that already has a live draft', async () => {
      const { data } = await createRecurring('user_a', rent({ nextDueOn: '2026-09-30' }))
      await createTransaction('user_a',
        { type: 'expense', amount: 1_500_000, categoryId: rentId, method: 'upi', occurredAt: istNoon('2026-09-30') },
        { status: 'draft', source: 'recurring', recurringItemId: data.id })
      expect(await materializeDueRecurring('user_a', '2026-10-11')).toBe(0)
      expect((await drafts('user_a')).data).toHaveLength(1)
      expect((await listRecurring('user_a'))[0].nextDueOn).toBe('2026-10-30') // anchor 30
    })
  })

  describe('catch-up cap', () => {
    it('creates at most 24 drafts per item per load and leaves nextDueOn in the future', async () => {
      const today = '2026-10-11'
      await createRecurring('user_a', rent({ cadence: 'weekly', nextDueOn: addDays(today, -280) }))
      expect(await materializeDueRecurring('user_a', today)).toBe(24)
      expect((await listRecurring('user_a'))[0].nextDueOn > today).toBe(true)
      expect(await materializeDueRecurring('user_a', today)).toBe(0)
      expect((await drafts('user_a')).data).toHaveLength(24)
    })
  })
})
