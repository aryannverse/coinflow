import 'server-only'
import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import { getDb, type Tx } from '@/server/db/client'
import { pgErrorCode } from '@/server/db/errors'
import { auditLog, balanceCheckins, budgets, groups, recurringItems, transactions, type AuditRow } from '@/server/db/schema'
import { conflict, notFound } from '@/server/errors'
import { undoGroupChange } from './groups/undo'

export type AuditEntity =
  | 'transaction' | 'recurring_item' | 'budget' | 'balance_checkin'
  | 'group_expense' | 'settlement' | 'group_member'
type PersonalEntity = 'transaction' | 'recurring_item' | 'budget' | 'balance_checkin'
export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'confirm'
export const UNDO_WINDOW_MS = 30_000

const GROUP_ENTITIES = new Set<AuditEntity>(['group_expense', 'settlement', 'group_member'])
const TABLES: Record<PersonalEntity, typeof transactions | typeof recurringItems | typeof budgets | typeof balanceCheckins> = {
  transaction: transactions,
  recurring_item: recurringItems,
  budget: budgets,
  balance_checkin: balanceCheckins,
}

/** The group a group-entity audit row belongs to: an expense snapshot nests it, settlement and member rows carry it. */
function groupIdOf(entry: AuditRow): string | null {
  for (const side of [entry.after, entry.before] as (Record<string, unknown> | null)[]) {
    const expense = side?.expense as { groupId?: unknown } | undefined
    const id = expense?.groupId ?? side?.groupId
    if (typeof id === 'string') return id
  }
  return null
}

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
    const groupEntity = GROUP_ENTITIES.has(entry.entity)
    // Group writes serialise on the group row. Take it BEFORE the staleness check, so a co-member's edit that is
    // in flight either lands first (and this undo is stale) or waits for it (Review Focus #3).
    const groupId = groupEntity ? groupIdOf(entry) : null
    if (groupId) await tx.select({ id: groups.id }).from(groups).where(eq(groups.id, groupId)).for('update')
    const [latest] = await tx
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(
        groupEntity ? undefined : eq(auditLog.userId, userId), // a co-member's later edit also makes this stale
        eq(auditLog.entity, entry.entity), eq(auditLog.entityId, entry.entityId),
      ))
      .orderBy(desc(auditLog.seq))
      .limit(1)
    if (latest.id !== entry.id) throw conflict('undo_stale', 'That item changed again, so this undo no longer applies.')

    if (groupEntity) {
      let change: Awaited<ReturnType<typeof undoGroupChange>>
      try {
        change = await undoGroupChange(tx, entry, userId, now)
      } catch (err) {
        // A row it needs was taken or is still referenced (e.g. a member someone has since put on an expense).
        if (pgErrorCode(err) === '23503' || pgErrorCode(err) === '23505') throw conflict('undo_conflict', 'Something newer is in the way, so this can’t be undone.')
        throw err
      }
      const { before, after } = change
      const restoreId = await recordAudit(tx, { userId, entity: entry.entity, entityId: entry.entityId, action: 'restore', before, after })
      return { entity: entry.entity, entityId: entry.entityId, auditId: restoreId }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- one generic restore over four tables
    const table = TABLES[entry.entity as PersonalEntity] as any
    const ownRow = and(eq(table.id, entry.entityId), eq(table.userId, userId))
    const [current] = await tx.select().from(table).where(ownRow)
    const before = entry.before as Record<string, unknown> | null
    const blocked = () => conflict('undo_conflict', 'Something newer is in the way, so this can’t be undone.')

    if (entry.entity === 'recurring_item') {
      // Materialize writes no audit, so drafts made since this change would survive the restore: as orphans
      // (create undone) or as duplicates once nextDueOn is rewound. Runs before any hard delete, whose FK
      // `set null` would sever the link. Confirmed rows are the user's record and are never touched.
      await tx.update(transactions).set({ deletedAt: now }).where(and(
        eq(transactions.recurringItemId, entry.entityId), eq(transactions.userId, userId),
        eq(transactions.status, 'draft'), isNull(transactions.deletedAt), gte(transactions.createdAt, entry.createdAt),
      ))
    }

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
