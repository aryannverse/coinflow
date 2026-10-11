import 'server-only'
import { and, desc, eq } from 'drizzle-orm'
import { getDb, type Tx } from '@/server/db/client'
import { pgErrorCode } from '@/server/db/errors'
import { auditLog, balanceCheckins, budgets, recurringItems, transactions } from '@/server/db/schema'
import { conflict, notFound } from '@/server/errors'

export type AuditEntity = 'transaction' | 'recurring_item' | 'budget' | 'balance_checkin'
export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'confirm'
export const UNDO_WINDOW_MS = 30_000

const TABLES = {
  transaction: transactions,
  recurring_item: recurringItems,
  budget: budgets,
  balance_checkin: balanceCheckins,
} as const

const DATE_KEYS = new Set(['createdAt', 'updatedAt', 'occurredAt', 'deletedAt', 'takenAt'])

export function snapshot<T extends object>(row: T | null | undefined): Record<string, unknown> | null {
  return row ? (JSON.parse(JSON.stringify(row)) as Record<string, unknown>) : null
}

function revive(json: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(json).map(([k, v]) => [k, DATE_KEYS.has(k) && typeof v === 'string' ? new Date(v) : v]),
  )
}

export async function recordAudit(
  tx: Tx,
  entry: {
    userId: string
    entity: AuditEntity
    entityId: string
    action: AuditAction
    before: object | null
    after: object | null
    actor?: 'user' | 'agent'
  },
): Promise<string> {
  const [row] = await tx
    .insert(auditLog)
    .values({
      userId: entry.userId,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      before: snapshot(entry.before),
      after: snapshot(entry.after),
      actor: entry.actor ?? 'user',
    })
    .returning({ id: auditLog.id })
  return row.id
}

export async function undo(
  userId: string,
  auditId: string,
  now: Date = new Date(),
): Promise<{ entity: AuditEntity; entityId: string; auditId: string }> {
  return getDb().transaction(async (tx) => {
    const [entry] = await tx
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.id, auditId), eq(auditLog.userId, userId)))
    if (!entry) throw notFound('change')
    if (now.getTime() - entry.createdAt.getTime() > UNDO_WINDOW_MS) {
      throw conflict('undo_expired', 'It’s too late to undo that change.')
    }
    const [latest] = await tx
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.userId, userId), eq(auditLog.entity, entry.entity), eq(auditLog.entityId, entry.entityId)))
      .orderBy(desc(auditLog.seq))
      .limit(1)
    if (latest.id !== entry.id) throw conflict('undo_stale', 'That item changed again, so this undo no longer applies.')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- one generic restore over four tables
    const table = TABLES[entry.entity] as any
    const ownRow = and(eq(table.id, entry.entityId), eq(table.userId, userId))
    const [current] = await tx.select().from(table).where(ownRow)
    const before = entry.before as Record<string, unknown> | null
    const blocked = () => conflict('undo_conflict', 'Something newer is in the way, so this can’t be undone.')

    try {
      if (before === null) {
        if (!current) throw blocked()
        if (entry.entity === 'transaction') {
          await tx.update(transactions).set({ deletedAt: now }).where(and(eq(transactions.id, entry.entityId), eq(transactions.userId, userId)))
        } else {
          await tx.delete(table).where(ownRow)
        }
      } else {
        const values: Record<string, unknown> = { ...revive(before), userId }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, createdAt, ...set } = values
        const written = await tx
          .insert(table)
          .values(values)
          .onConflictDoUpdate({ target: table.id, set, setWhere: eq(table.userId, userId) })
          .returning({ id: table.id })
        if (written.length === 0) throw blocked() // id belongs to another user: never overwrite it
      }
    } catch (err) {
      const code = pgErrorCode(err)
      if (code === '23505' || code === '23503') throw blocked() // unique key taken / referenced row gone
      throw err
    }

    const [restored] = await tx.select().from(table).where(ownRow)
    const restoreId = await recordAudit(tx, {
      userId,
      entity: entry.entity,
      entityId: entry.entityId,
      action: 'restore',
      before: current ?? null,
      after: restored ?? null,
    })
    return { entity: entry.entity, entityId: entry.entityId, auditId: restoreId }
  })
}
