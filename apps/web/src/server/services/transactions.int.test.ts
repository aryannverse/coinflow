import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { transactionListQuerySchema, transactionPatchSchema } from '@/lib/schemas/transactions'
import { getDb } from '@/server/db/client'
import { auditLog } from '@/server/db/schema'
import { undo } from './audit'
import { createCategory, listCategories } from './categories'
import {
  confirmDraft, createTransaction, deleteTransaction, listTransactions, skipDraft, updateTransaction,
} from './transactions'

const q = (over: object = {}) => transactionListQuerySchema.parse(over)

describe('transactions service', () => {
  let foodId: string
  let salaryId: string

  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a')
    await makeUser('user_b')
    foodId = (await builtinCategory('Food & Dining')).id
    salaryId = (await builtinCategory('Salary', 'income')).id
  })

  const expense = (over: object = {}) => ({
    type: 'expense' as const, amount: 45_000, categoryId: foodId, method: 'upi' as const, occurredAt: new Date(), note: null, ...over,
  })

  it('creates a confirmed manual expense with personalShare = amount and an audit id', async () => {
    const { data, auditId } = await createTransaction('user_a', expense())
    expect(data).toMatchObject({ amount: 45_000, personalShare: 45_000, status: 'confirmed', source: 'manual' })
    expect(auditId).toBeTruthy()
  })

  it('rejects a category of the wrong kind with a field error', async () => {
    await expect(createTransaction('user_a', expense({ categoryId: salaryId }))).rejects.toMatchObject({ status: 422, field: 'categoryId' })
  })

  it('rejects another user’s custom category', async () => {
    const mine = await createCategory('user_b', { name: 'Chai', emoji: '☕', color: '#C8F560', kind: 'expense' })
    await expect(createTransaction('user_a', expense({ categoryId: mine.id }))).rejects.toMatchObject({ status: 422 })
  })

  it('rejects a duplicate category name for the same user with 409 duplicate', async () => {
    const input = { name: 'Chai', emoji: '☕', color: '#C8F560', kind: 'expense' as const }
    await createCategory('user_a', input)
    await expect(createCategory('user_a', input)).rejects.toMatchObject({ status: 409, code: 'duplicate' })
  })

  it('lists built-in plus own categories only', async () => {
    await createCategory('user_b', { name: 'Chai', emoji: '☕', color: '#C8F560', kind: 'expense' })
    const a = await listCategories('user_a', 'expense')
    expect(a.map((c) => c.name)).not.toContain('Chai')
    expect(a).toHaveLength(14)
  })

  it('updates amount and keeps personalShare in sync; undo restores', async () => {
    const { data } = await createTransaction('user_a', expense())
    const upd = await updateTransaction('user_a', data.id, { amount: 60_000 })
    expect(upd.data).toMatchObject({ amount: 60_000, personalShare: 60_000 })
    await undo('user_a', upd.auditId!)
    const list = await listTransactions('user_a', q())
    expect(list.data[0].amount).toBe(45_000)
  })

  it('a partial edit leaves method and occurredAt untouched', async () => {
    const when = new Date('2026-10-01T06:00:00Z')
    const { data } = await createTransaction('user_a', expense({ method: 'cash', occurredAt: when }))
    const patch = transactionPatchSchema.parse({ note: 'renamed' })
    expect(patch).toEqual({ note: 'renamed' })
    const upd = await updateTransaction('user_a', data.id, patch)
    expect(upd.data.method).toBe('cash')
    expect(upd.data.occurredAt.toISOString()).toBe(when.toISOString())
  })

  it('soft-deletes and hides from lists; undo brings it back', async () => {
    const { data } = await createTransaction('user_a', expense())
    const { auditId } = await deleteTransaction('user_a', data.id)
    expect((await listTransactions('user_a', q())).data).toHaveLength(0)
    await undo('user_a', auditId)
    expect((await listTransactions('user_a', q())).data).toHaveLength(1)
  })

  it('returns 404 for another user’s transaction id', async () => {
    const { data } = await createTransaction('user_a', expense())
    await expect(updateTransaction('user_b', data.id, { amount: 1 })).rejects.toMatchObject({ status: 404 })
    await expect(deleteTransaction('user_b', data.id)).rejects.toMatchObject({ status: 404 })
  })

  it('confirms and skips drafts', async () => {
    const a = await createTransaction('user_a', expense(), { status: 'draft', source: 'recurring' })
    const b = await createTransaction('user_a', expense(), { status: 'draft', source: 'recurring' })
    expect((await listTransactions('user_a', q({ status: 'draft' }))).data).toHaveLength(2)
    const confirmed = await confirmDraft('user_a', a.data.id)
    expect(confirmed.data.status).toBe('confirmed')
    await skipDraft('user_a', b.data.id)
    expect((await listTransactions('user_a', q({ status: 'draft' }))).data).toHaveLength(0)
    expect((await listTransactions('user_a', q())).data).toHaveLength(1)
  })

  it('paginates newest-first with a stable cursor', async () => {
    for (let i = 0; i < 5; i++) {
      await createTransaction('user_a', expense({ occurredAt: new Date(Date.UTC(2026, 9, 1 + i, 6)) }))
    }
    const page1 = await listTransactions('user_a', q({ limit: 2 }))
    const page2 = await listTransactions('user_a', q({ limit: 2, cursor: page1.nextCursor! }))
    const page3 = await listTransactions('user_a', q({ limit: 2, cursor: page2.nextCursor! }))
    const days = [...page1.data, ...page2.data, ...page3.data].map((t) => t.occurredAt.getUTCDate())
    expect(days).toEqual([5, 4, 3, 2, 1])
    expect(page3.nextCursor).toBeNull()
  })

  it('IST day filter: 00:30 IST on Oct 12 belongs to Oct 12', async () => {
    await createTransaction('user_a', expense({ occurredAt: new Date('2026-10-11T19:00:00Z'), note: 'late chai' }))
    expect((await listTransactions('user_a', q({ from: '2026-10-12', to: '2026-10-12' }))).data).toHaveLength(1)
    expect((await listTransactions('user_a', q({ from: '2026-10-11', to: '2026-10-11' }))).data).toHaveLength(0)
  })

  it('searches notes and category names, escaping LIKE wildcards', async () => {
    await createTransaction('user_a', expense({ note: 'Toit dinner' }))
    await createTransaction('user_a', expense({ note: '100% juice' }))
    expect((await listTransactions('user_a', q({ q: 'toit' }))).data).toHaveLength(1)
    expect((await listTransactions('user_a', q({ q: 'food' }))).data).toHaveLength(2)
    expect((await listTransactions('user_a', q({ q: '%' }))).data).toHaveLength(1)
  })

  it('rejects a garbage cursor with a 422 on the cursor field instead of restarting at page 1', async () => {
    await createTransaction('user_a', expense())
    await expect(listTransactions('user_a', q({ cursor: 'not-a-cursor' }))).rejects.toMatchObject({ status: 422, field: 'cursor' })
  })

  it('rejects a cursor whose id is not a uuid with a 422, not a database error', async () => {
    const cursor = Buffer.from('2026-01-01T00:00:00.000Z|x').toString('base64url')
    await expect(listTransactions('user_a', q({ cursor }))).rejects.toMatchObject({ status: 422, field: 'cursor' })
  })

  it('an empty patch is a no-op: row unchanged, no audit entry, null audit id', async () => {
    const { data } = await createTransaction('user_a', expense())
    const before = await getDb().select().from(auditLog).where(eq(auditLog.entityId, data.id))
    const res = await updateTransaction('user_a', data.id, {})
    expect(res.auditId).toBeNull()
    expect(res.data).toEqual(data)
    const after = await getDb().select().from(auditLog).where(eq(auditLog.entityId, data.id))
    expect(after).toHaveLength(before.length)
  })

  it('pages rows sharing the same occurredAt without loss or duplication', async () => {
    const same = new Date(Date.UTC(2026, 9, 3, 6))
    const ids: string[] = []
    for (const at of [new Date(Date.UTC(2026, 9, 5, 6)), same, same, new Date(Date.UTC(2026, 9, 2, 6)), new Date(Date.UTC(2026, 9, 1, 6))]) {
      ids.push((await createTransaction('user_a', expense({ occurredAt: at }))).data.id)
    }
    const seen: { id: string; at: number }[] = []
    let cursor: string | undefined
    do {
      const page = await listTransactions('user_a', q({ limit: 2, cursor }))
      seen.push(...page.data.map((t) => ({ id: t.id, at: t.occurredAt.getTime() })))
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    expect(seen.map((r) => r.id).sort()).toEqual([...ids].sort())
    const expected = [...seen].sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1))
    expect(seen).toEqual(expected)
    expect(seen.map((r) => r.at)[1]).toBe(same.getTime())
    expect(seen.map((r) => r.at)[2]).toBe(same.getTime())
  })

  it('confirmDraft and skipDraft on a confirmed transaction return 404', async () => {
    const { data } = await createTransaction('user_a', expense())
    await expect(confirmDraft('user_a', data.id)).rejects.toMatchObject({ status: 404 })
    await expect(skipDraft('user_a', data.id)).rejects.toMatchObject({ status: 404 })
  })
})
