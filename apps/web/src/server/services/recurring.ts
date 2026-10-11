import 'server-only'
import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm'
import { dayOfMonth, istNoon, toISTDate, type ISODate } from '@/lib/dates'
import { nextOccurrence, type Cadence } from '@/lib/recurrence'
import type { RecurringCreate, RecurringPatch } from '@/lib/schemas/recurring'
import { getDb } from '@/server/db/client'
import { recurringItems, transactions, type RecurringItem } from '@/server/db/schema'
import { notFound } from '@/server/errors'
import { recordAudit } from './audit'
import { requireUsableCategory } from './categories'
import { createTransaction } from './transactions'

const txnKind = (kind: RecurringItem['kind']) => (kind === 'bill' ? 'expense' : 'income')
const MAX_CATCH_UP = 24 // per item per load; avoids runaway for long-missed weekly items

export async function listRecurring(userId: string): Promise<RecurringItem[]> {
  return getDb().select().from(recurringItems).where(eq(recurringItems.userId, userId)).orderBy(asc(recurringItems.nextDueOn))
}

export async function createRecurring(userId: string, input: RecurringCreate) {
  return getDb().transaction(async (tx) => {
    await requireUsableCategory(userId, input.categoryId, txnKind(input.kind), tx)
    const [row] = await tx.insert(recurringItems).values({ ...input, userId, anchorDay: dayOfMonth(input.nextDueOn) }).returning()
    const auditId = await recordAudit(tx, { userId, entity: 'recurring_item', entityId: row.id, action: 'create', before: null, after: row })
    return { data: row, auditId }
  })
}

/** First occurrence on or after `today`; each step advances at least 7 days, so this terminates. */
function fastForward(from: ISODate, cadence: Cadence, anchorDay: number, today: ISODate): ISODate {
  let d = from
  while (d < today) d = nextOccurrence(d, cadence, anchorDay)
  return d
}

/**
 * Schedule columns a patch implies beyond what it sets directly. `patch` holds only changed fields.
 * An explicit nextDueOn re-anchors on its own. A cadence change re-anchors to the current schedule day
 * (anchorDay may be stale after weekly stepping); resuming a paused, overdue item skips the occurrences
 * missed while paused. The stored anchor is the user's schedule day, never a clamped fast-forward result.
 */
function impliedSchedule(
  before: RecurringItem, patch: RecurringPatch, today: ISODate,
): { nextDueOn?: ISODate; anchorDay?: number } {
  if (patch.nextDueOn) return { anchorDay: dayOfMonth(patch.nextDueOn) }
  const cadenceChanged = patch.cadence !== undefined
  const resuming = patch.active === true && !before.active && before.nextDueOn < today
  if (!cadenceChanged && !resuming) return {}
  const cadence = patch.cadence ?? before.cadence
  const anchorDay = cadenceChanged ? dayOfMonth(before.nextDueOn) : before.anchorDay
  return {
    ...(resuming ? { nextDueOn: fastForward(before.nextDueOn, cadence, anchorDay, today) } : {}),
    ...(cadenceChanged ? { anchorDay } : {}),
  }
}

/** Keeps only the fields that differ from the stored row; the edit form re-sends the whole body. */
function changedFields(before: RecurringItem, patch: RecurringPatch): RecurringPatch {
  return Object.fromEntries(
    Object.entries(patch).filter(([k, v]) => v !== undefined && v !== before[k as keyof RecurringItem]),
  ) as RecurringPatch
}

export async function updateRecurring(
  userId: string, id: string, input: RecurringPatch,
): Promise<{ data: RecurringItem; auditId: string | null }> {
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(recurringItems)
      .where(and(eq(recurringItems.id, id), eq(recurringItems.userId, userId))).for('update')
    if (!before) throw notFound('recurring item')
    const patch = changedFields(before, input)
    if (Object.keys(patch).length === 0) return { data: before, auditId: null }
    if (patch.categoryId !== undefined || patch.kind !== undefined) {
      await requireUsableCategory(userId, patch.categoryId ?? before.categoryId, txnKind(patch.kind ?? before.kind), tx)
    }
    const [after] = await tx.update(recurringItems)
      .set({ ...patch, ...impliedSchedule(before, patch, toISTDate(new Date())) })
      .where(and(eq(recurringItems.id, id), eq(recurringItems.userId, userId))).returning()
    const auditId = await recordAudit(tx, { userId, entity: 'recurring_item', entityId: id, action: 'update', before, after })
    return { data: after, auditId }
  })
}

export async function deleteRecurring(userId: string, id: string) {
  return getDb().transaction(async (tx) => {
    const [before] = await tx.delete(recurringItems)
      .where(and(eq(recurringItems.id, id), eq(recurringItems.userId, userId))).returning()
    if (!before) throw notFound('recurring item')
    const auditId = await recordAudit(tx, { userId, entity: 'recurring_item', entityId: id, action: 'delete', before, after: null })
    return { auditId }
  })
}

/** Turns due recurring items into drafts the user confirms (SRS staging principle). Idempotent under concurrency. */
export async function materializeDueRecurring(userId: string, today: ISODate): Promise<number> {
  return getDb().transaction(async (tx) => {
    const due = await tx.select().from(recurringItems)
      .where(and(eq(recurringItems.userId, userId), eq(recurringItems.active, true), lte(recurringItems.nextDueOn, today)))
      .orderBy(asc(recurringItems.id))
      .for('update')
    let created = 0
    for (const item of due) {
      // nextDueOn can be rewound (undo, explicit edit) onto days that already have a live draft: skip those.
      // The item row lock serialises materializers, so this check cannot race; a unique index backs it up.
      const existing = await tx.select({ at: transactions.occurredAt }).from(transactions).where(and(
        eq(transactions.userId, userId), eq(transactions.recurringItemId, item.id), eq(transactions.status, 'draft'),
        isNull(transactions.deletedAt), gte(transactions.occurredAt, istNoon(item.nextDueOn)), lte(transactions.occurredAt, istNoon(today)),
      ))
      const taken = new Set(existing.map((r) => r.at.getTime()))
      let next = item.nextDueOn
      for (let i = 0; i < MAX_CATCH_UP && next <= today; i++) {
        const occurredAt = istNoon(next)
        if (!taken.has(occurredAt.getTime())) {
          await createTransaction(
            userId,
            { type: txnKind(item.kind), amount: item.amount, categoryId: item.categoryId, note: item.name, method: 'upi', occurredAt },
            { tx, status: 'draft', source: 'recurring', recurringItemId: item.id, audit: false },
          )
          created++
        }
        next = nextOccurrence(next, item.cadence, item.anchorDay)
      }
      while (next <= today) next = nextOccurrence(next, item.cadence, item.anchorDay)
      await tx.update(recurringItems).set({ nextDueOn: next })
        .where(and(eq(recurringItems.id, item.id), eq(recurringItems.userId, userId)))
    }
    return created
  })
}
