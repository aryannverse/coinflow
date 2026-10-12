import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { formatINR } from '@/lib/money'
import type { Tx } from '@/server/db/client'
import { pgErrorCode } from '@/server/db/errors'
import { groupExpenses, groupMembers, notifications, settlements, type AuditRow, type GroupExpense } from '@/server/db/schema'
import { conflict, notFound } from '@/server/errors'
import { dropSettlementRequest, wake } from '../notifications'
import { recordActivity } from './activity'
import { syncExpenseMirrors } from './mirrors'
import { requireMember } from './permissions'
import { loadSnapshot, writeChildren, type ExpenseSnapshot } from './rows'

const DATE_KEYS = ['occurredAt', 'createdAt', 'updatedAt', 'deletedAt'] as const
function reviveExpense(json: Record<string, unknown>): GroupExpense {
  const out: Record<string, unknown> = { ...json }
  for (const k of DATE_KEYS) if (typeof out[k] === 'string') out[k] = new Date(out[k] as string)
  return out as GroupExpense
}

const blocked = (message = 'Something newer is in the way, so this can’t be undone.') => conflict('undo_conflict', message)

/**
 * Spec §3.6. The caller (audit.undo) has already checked: same user, ≤ 30 s, and that this is the latest audit row
 * for the entity across ALL members. Returns the before/after for the 'restore' audit row.
 */
export async function undoGroupChange(tx: Tx, entry: AuditRow, userId: string, now: Date): Promise<{ before: object | null; after: object | null }> {
  switch (entry.entity) {
    case 'group_expense': {
      const current = await loadSnapshot(tx, entry.entityId)
      if (!current) throw notFound('change')
      const { me } = await requireMember(userId, current.expense.groupId, tx, { lock: true }) // left the group since → 404
      const before = entry.before as unknown as ExpenseSnapshot | null
      if (!before) {
        await tx.update(groupExpenses).set({ deletedAt: now }).where(eq(groupExpenses.id, entry.entityId))
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- id and createdAt never change
        const { id: _id, createdAt: _createdAt, ...restore } = reviveExpense(before.expense as unknown as Record<string, unknown>)
        await tx.update(groupExpenses).set({ ...restore, updatedAt: now }).where(eq(groupExpenses.id, entry.entityId))
        try {
          await writeChildren(tx, entry.entityId, {
            payers: before.payers,
            shares: before.shares.map(({ memberId, sharePaise, inputValue }) => ({ memberId, sharePaise, inputValue })),
            items: before.items.map(({ id, name, amountPaise, memberIds, sort }) => ({ id, name, amountPaise, memberIds, sort })),
          })
        } catch (err) {
          if (pgErrorCode(err) === '23503' || pgErrorCode(err) === '23505') throw blocked()
          throw err
        }
      }
      await syncExpenseMirrors(tx, entry.entityId, now)
      await recordActivity(tx, {
        groupId: current.expense.groupId, actorUserId: userId, kind: 'undo',
        summary: `${me.displayName} undid a change to ${current.expense.description}`, payload: { expenseId: entry.entityId },
      })
      return { before: current, after: await loadSnapshot(tx, entry.entityId) }
    }
    case 'settlement': {
      if (entry.action !== 'create') throw blocked()
      const [s] = await tx.select().from(settlements).where(eq(settlements.id, entry.entityId)).for('update')
      if (!s) throw notFound('change')
      const { me } = await requireMember(userId, s.groupId, tx)
      if (s.status !== 'pending') throw conflict('settlement_state', 'They’ve already answered this payment, so it can’t be undone.')
      await dropSettlementRequest(tx, s.id)
      await tx.delete(settlements).where(eq(settlements.id, s.id))
      await recordActivity(tx, { groupId: s.groupId, actorUserId: userId, kind: 'undo', summary: `${me.displayName} took back a ${formatINR(s.amountPaise)} payment mark` })
      return { before: s, after: null }
    }
    case 'group_member': {
      if (entry.action !== 'create') throw blocked()
      const [m] = await tx.select().from(groupMembers).where(eq(groupMembers.id, entry.entityId)).for('update')
      if (!m) throw notFound('change')
      await requireMember(userId, m.groupId, tx)
      // A placeholder that someone has since claimed is final. A friend added directly (spec §3.8) was claimed in this
      // very audit row, so it can still be undone until they are part of an expense or settlement (the FK says so).
      const addedClaimed = Boolean((entry.after as { claimedAt?: string | null } | null)?.claimedAt)
      if (m.userId && !addedClaimed) throw blocked(`${m.displayName} has already joined, so this can’t be undone.`)
      try {
        await tx.delete(groupMembers).where(eq(groupMembers.id, m.id))
      } catch (err) {
        if (pgErrorCode(err) === '23503') throw blocked(`${m.displayName} is already part of an expense, so this can’t be undone.`)
        throw err
      }
      if (m.userId) { // take back "X added you to …" so it doesn't lead to a group they're no longer in
        const gone = await tx.delete(notifications)
          .where(and(eq(notifications.kind, 'group_added'), sql`${notifications.payload}->>'memberId' = ${m.id}`))
          .returning({ userId: notifications.userId })
        await wake(tx, gone.map((r) => r.userId))
      }
      return { before: m, after: null }
    }
    default:
      throw blocked()
  }
}
