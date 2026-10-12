import 'server-only'
import { and, asc, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import { getDb, type Tx } from '@/server/db/client'
import { notifications, type NewNotification, type Notification } from '@/server/db/schema'
import { notFound } from '@/server/errors'
import { NOTIFY_CHANNEL } from '@/server/notify-bus'

export { NOTIFY_CHANNEL }
export type NotificationKind =
  | 'settlement_marked' | 'settlement_confirmed' | 'settlement_rejected'
  | 'expense_added' | 'expense_edited' | 'member_claimed'
  | 'friend_request' | 'friend_accepted' | 'group_added' // spec §3.8
  | `coach_${string}`
export type NotificationInput = Omit<NewNotification, 'kind'> & { kind: NotificationKind }

/** pg_notify is transactional: listeners hear it only after COMMIT, so a stream never shows a row that rolled back. */
export async function wake(tx: Tx, userIds: string[]): Promise<void> {
  for (const userId of new Set(userIds)) await tx.execute(sql`select pg_notify(${NOTIFY_CHANNEL}, ${userId})`)
}

/** Inserts in-app notifications (a coach duplicate by dedupeKey is skipped) and wakes each recipient's streams. */
export async function notify(tx: Tx, rows: NotificationInput[]): Promise<number> {
  if (rows.length === 0) return 0
  const inserted = await tx.insert(notifications).values(rows).onConflictDoNothing().returning({ id: notifications.id })
  await wake(tx, rows.map((r) => r.userId))
  return inserted.length
}

export async function unreadCount(userId: string): Promise<number> {
  const [r] = await getDb().select({ n: sql<number>`count(*)`.mapWith(Number) }).from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
  return r.n
}

export async function latestSeq(userId: string): Promise<number> {
  const [r] = await getDb().select({ seq: sql<number>`coalesce(max(${notifications.seq}), 0)`.mapWith(Number) })
    .from(notifications).where(eq(notifications.userId, userId))
  return r.seq
}

export async function listSince(userId: string, afterSeq: number): Promise<Notification[]> {
  return getDb().select().from(notifications)
    .where(and(eq(notifications.userId, userId), gt(notifications.seq, afterSeq)))
    .orderBy(asc(notifications.seq)).limit(50)
}

export async function listNotifications(userId: string, q: { before?: number; limit: number }) {
  const rows = await getDb().select().from(notifications)
    .where(and(eq(notifications.userId, userId), q.before ? lt(notifications.seq, q.before) : undefined))
    .orderBy(desc(notifications.seq)).limit(q.limit + 1)
  const data = rows.slice(0, q.limit)
  return { data, unreadCount: await unreadCount(userId), nextCursor: rows.length > q.limit ? data[data.length - 1].seq : null }
}

export async function markRead(userId: string, id: string): Promise<Notification> {
  const [row] = await getDb().update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId))).returning()
  if (!row) throw notFound('notification')
  return row
}

export async function markAllRead(userId: string): Promise<{ updated: number }> {
  const rows = await getDb().update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))).returning({ id: notifications.id })
  return { updated: rows.length }
}

const requestFor = (settlementId: string) =>
  and(eq(notifications.kind, 'settlement_marked'), sql`${notifications.payload}->>'settlementId' = ${settlementId}`)

/** The payee answered: hide Confirm / Not received on their notification. */
export async function markSettlementActed(tx: Tx, settlementId: string, now: Date): Promise<void> {
  const rows = await tx.update(notifications).set({ actedAt: now, readAt: sql`coalesce(${notifications.readAt}, now())` }) // a Date inside sql`` breaks postgres.js
    .where(and(requestFor(settlementId), isNull(notifications.actedAt))).returning({ userId: notifications.userId })
  await wake(tx, rows.map((r) => r.userId))
}

/** The payer undid the mark: the payee's request disappears instead of offering a dead Confirm button. */
export async function dropSettlementRequest(tx: Tx, settlementId: string): Promise<void> {
  const rows = await tx.delete(notifications).where(requestFor(settlementId)).returning({ userId: notifications.userId })
  await wake(tx, rows.map((r) => r.userId))
}
