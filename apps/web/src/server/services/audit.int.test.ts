import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { getDb } from '@/server/db/client'
import { auditLog, budgets, transactions, type Transaction } from '@/server/db/schema'
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
})
