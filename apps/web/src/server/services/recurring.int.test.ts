import { count, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { addDays, addMonthsAnchored, clampDayInMonth, dayOfMonth, toISTDate } from '@/lib/dates'
import { nextOccurrence } from '@/lib/recurrence'
import { transactionListQuerySchema } from '@/lib/schemas/transactions'
import { getDb } from '@/server/db/client'
import { auditLog, recurringItems } from '@/server/db/schema'
import { undo } from './audit'
import { createRecurring, deleteRecurring, listRecurring, materializeDueRecurring, updateRecurring } from './recurring'
import { listTransactions } from './transactions'

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
      expect(data.anchorDay).toBe(dayOfMonth(data.nextDueOn))
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
