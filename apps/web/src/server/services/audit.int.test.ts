import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { getDb } from '@/server/db/client'
import { auditLog, budgets, recurringItems, transactions, type Transaction } from '@/server/db/schema'
import { recordAudit, snapshot, undo } from './audit'

async function insertTxn(userId: string): Promise<Transaction> {
  const food = await builtinCategory('Food & Dining')
  const [row] = await getDb().insert(transactions).values({
    userId, type: 'expense', amount: 45_000, personalShare: 45_000, categoryId: food.id, occurredAt: new Date(),
  }).returning()
  return row
}

async function read(id: string) {
  const [row] = await getDb().select().from(transactions).where(eq(transactions.id, id))
  return row
}

describe('undo', () => {
  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a')
    await makeUser('user_b')
  })

  it('undoing a create soft-deletes the transaction', async () => {
    const t = await insertTxn('user_a')
    const auditId = await getDb().transaction((tx) =>
      recordAudit(tx, { userId: 'user_a', entity: 'transaction', entityId: t.id, action: 'create', before: null, after: snapshot(t) }))
    const result = await undo('user_a', auditId)
    expect(result).toMatchObject({ entity: 'transaction', entityId: t.id })
    expect((await read(t.id)).deletedAt).toBeInstanceOf(Date)
  })

  it('undoing an update restores previous values including dates', async () => {
    const t = await insertTxn('user_a')
    const [updated] = await getDb().update(transactions).set({ amount: 99_000, personalShare: 99_000, note: 'oops' })
      .where(eq(transactions.id, t.id)).returning()
    const auditId = await getDb().transaction((tx) =>
      recordAudit(tx, { userId: 'user_a', entity: 'transaction', entityId: t.id, action: 'update', before: snapshot(t), after: snapshot(updated) }))
    await undo('user_a', auditId)
    const restored = await read(t.id)
    expect(restored.amount).toBe(45_000)
    expect(restored.note).toBeNull()
    expect(restored.occurredAt.toISOString()).toBe(t.occurredAt.toISOString())
  })

  it('undoing a delete brings the row back', async () => {
    const t = await insertTxn('user_a')
    const [deleted] = await getDb().update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, t.id)).returning()
    const auditId = await getDb().transaction((tx) =>
      recordAudit(tx, { userId: 'user_a', entity: 'transaction', entityId: t.id, action: 'delete', before: snapshot(t), after: snapshot(deleted) }))
    await undo('user_a', auditId)
    expect((await read(t.id)).deletedAt).toBeNull()
  })

  it('refuses after the 30 s window', async () => {
    const t = await insertTxn('user_a')
    const auditId = await getDb().transaction((tx) =>
      recordAudit(tx, { userId: 'user_a', entity: 'transaction', entityId: t.id, action: 'create', before: null, after: snapshot(t) }))
    await expect(undo('user_a', auditId, new Date(Date.now() + 31_000))).rejects.toMatchObject({ status: 409, code: 'undo_expired' })
  })

  it('refuses when a newer change exists for the same entity', async () => {
    const t = await insertTxn('user_a')
    const first = await getDb().transaction((tx) =>
      recordAudit(tx, { userId: 'user_a', entity: 'transaction', entityId: t.id, action: 'create', before: null, after: snapshot(t) }))
    await getDb().transaction((tx) =>
      recordAudit(tx, { userId: 'user_a', entity: 'transaction', entityId: t.id, action: 'update', before: snapshot(t), after: snapshot(t) }))
    await expect(undo('user_a', first)).rejects.toMatchObject({ status: 409, code: 'undo_stale' })
  })

  it('hides other users’ audit entries (404)', async () => {
    const t = await insertTxn('user_a')
    const auditId = await getDb().transaction((tx) =>
      recordAudit(tx, { userId: 'user_a', entity: 'transaction', entityId: t.id, action: 'create', before: null, after: snapshot(t) }))
    await expect(undo('user_b', auditId)).rejects.toMatchObject({ status: 404 })
  })

  it('reports undo_conflict when a newer row holds the same unique key', async () => {
    const food = await builtinCategory('Food & Dining')
    const [original] = await getDb().insert(budgets)
      .values({ userId: 'user_a', categoryId: food.id, monthlyLimit: 500_000 }).returning()
    const auditId = await getDb().transaction(async (tx) => {
      const id = await recordAudit(tx, {
        userId: 'user_a', entity: 'budget', entityId: original.id, action: 'delete', before: snapshot(original), after: null,
      })
      await tx.delete(budgets).where(eq(budgets.id, original.id))
      return id
    })
    const [replacement] = await getDb().insert(budgets)
      .values({ userId: 'user_a', categoryId: food.id, monthlyLimit: 700_000 }).returning()

    await expect(undo('user_a', auditId)).rejects.toMatchObject({ status: 409, code: 'undo_conflict' })

    const [stillThere] = await getDb().select().from(budgets).where(eq(budgets.id, replacement.id))
    expect(stillThere).toEqual(replacement)
    const [gone] = await getDb().select().from(budgets).where(eq(budgets.id, original.id))
    expect(gone).toBeUndefined()
    const restores = await getDb().select().from(auditLog)
      .where(and(eq(auditLog.userId, 'user_a'), eq(auditLog.action, 'restore')))
    expect(restores).toHaveLength(0)
  })

  it('never touches another user’s row, even if an audit entry points at it', async () => {
    const theirs = await insertTxn('user_b')
    const forged = await getDb().transaction((tx) =>
      recordAudit(tx, { userId: 'user_a', entity: 'transaction', entityId: theirs.id, action: 'update', before: snapshot(theirs), after: snapshot(theirs) }))
    // make the victim row differ from the snapshot so a stray write would be visible
    await getDb().update(transactions).set({ note: 'untouched' }).where(eq(transactions.id, theirs.id))
    const victim = await read(theirs.id)

    await expect(undo('user_a', forged)).rejects.toMatchObject({ status: 409, code: 'undo_conflict' })

    expect(await read(theirs.id)).toEqual(victim)
    const restores = await getDb().select().from(auditLog).where(eq(auditLog.action, 'restore'))
    expect(restores).toHaveLength(0)
  })

  it('does not delete or soft-delete another user’s row when undoing a forged create', async () => {
    const theirs = await insertTxn('user_b')
    const forged = await getDb().transaction((tx) =>
      recordAudit(tx, { userId: 'user_a', entity: 'transaction', entityId: theirs.id, action: 'create', before: null, after: snapshot(theirs) }))

    await expect(undo('user_a', forged)).rejects.toMatchObject({ status: 409, code: 'undo_conflict' })

    expect((await read(theirs.id)).deletedAt).toBeNull()
  })

  it('restores a recurring item’s date-only and boolean fields exactly', async () => {
    const bills = await builtinCategory('Bills & Utilities')
    const [item] = await getDb().insert(recurringItems).values({
      userId: 'user_a', kind: 'bill', name: 'Rent', amount: 1_500_000, cadence: 'monthly',
      nextDueOn: '2026-11-05', anchorDay: 5, categoryId: bills.id, active: true,
    }).returning()
    const [changed] = await getDb().update(recurringItems).set({ nextDueOn: '2026-12-05', active: false })
      .where(eq(recurringItems.id, item.id)).returning()
    const auditId = await getDb().transaction((tx) =>
      recordAudit(tx, { userId: 'user_a', entity: 'recurring_item', entityId: item.id, action: 'update', before: snapshot(item), after: snapshot(changed) }))

    const result = await undo('user_a', auditId)

    const [restored] = await getDb().select().from(recurringItems).where(eq(recurringItems.id, item.id))
    expect(restored.nextDueOn).toBe('2026-11-05')
    expect(restored.active).toBe(true)
    const [restoreRow] = await getDb().select().from(auditLog).where(eq(auditLog.id, result.auditId))
    expect(restoreRow).toMatchObject({ entity: 'recurring_item', entityId: item.id, action: 'restore', userId: 'user_a' })
  })
})
