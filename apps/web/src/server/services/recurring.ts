import 'server-only'
import { and, asc, eq, lte } from 'drizzle-orm'
import { dayOfMonth, istNoon, toISTDate, type ISODate } from '@/lib/dates'
import { nextOccurrence, type Cadence } from '@/lib/recurrence'
import type { RecurringCreate, RecurringPatch } from '@/lib/schemas/recurring'
import { getDb } from '@/server/db/client'
import { recurringItems, type RecurringItem } from '@/server/db/schema'
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
 * Schedule columns a patch implies beyond what it sets directly. An explicit nextDueOn re-anchors on its own.
 * A cadence change re-anchors to the current schedule day (anchorDay may be stale after weekly stepping);
 * resuming a paused, overdue item skips the occurrences missed while paused.
 */
function impliedSchedule(
  before: RecurringItem, patch: RecurringPatch, today: ISODate,
): { nextDueOn?: ISODate; anchorDay?: number } {
  if (patch.nextDueOn) return { anchorDay: dayOfMonth(patch.nextDueOn) }
  const cadenceChanged = patch.cadence !== undefined && patch.cadence !== before.cadence
  const resuming = patch.active === true && !before.active && before.nextDueOn < today
  if (!cadenceChanged && !resuming) return {}
  const cadence = patch.cadence ?? before.cadence
  const stepAnchor = cadenceChanged ? dayOfMonth(before.nextDueOn) : before.anchorDay
  const nextDueOn = resuming ? fastForward(before.nextDueOn, cadence, stepAnchor, today) : before.nextDueOn
  return {
    ...(resuming ? { nextDueOn } : {}),
    ...(cadenceChanged ? { anchorDay: dayOfMonth(nextDueOn) } : {}),
  }
}

export async function updateRecurring(
  userId: string, id: string, patch: RecurringPatch,
): Promise<{ data: RecurringItem; auditId: string | null }> {
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(recurringItems)
      .where(and(eq(recurringItems.id, id), eq(recurringItems.userId, userId))).for('update')
    if (!before) throw notFound('recurring item')
    if (Object.values(patch).every((v) => v === undefined)) return { data: before, auditId: null }
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
      let next = item.nextDueOn
      for (let i = 0; i < MAX_CATCH_UP && next <= today; i++) {
        await createTransaction(
          userId,
          { type: txnKind(item.kind), amount: item.amount, categoryId: item.categoryId, note: item.name, method: 'upi', occurredAt: istNoon(next) },
          { tx, status: 'draft', source: 'recurring', recurringItemId: item.id, audit: false },
        )
        created++
        next = nextOccurrence(next, item.cadence, item.anchorDay)
      }
      while (next <= today) next = nextOccurrence(next, item.cadence, item.anchorDay)
      await tx.update(recurringItems).set({ nextDueOn: next })
        .where(and(eq(recurringItems.id, item.id), eq(recurringItems.userId, userId)))
    }
    return created
  })
}
