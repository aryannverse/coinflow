import 'server-only'
import { and, desc, eq, sql } from 'drizzle-orm'
import { getDb, type Tx } from '@/server/db/client'
import { groupActivity } from '@/server/db/schema'
import { requireMember } from './permissions'
import { decodeCursor, encodeCursor } from './rows'

export type ActivityKind =
  | 'group_created' | 'group_updated' | 'member_added' | 'member_claimed' | 'member_updated' | 'member_removed' | 'invite_regenerated'
  | 'expense_added' | 'expense_edited' | 'expense_deleted'
  | 'settlement_marked' | 'settlement_recorded' | 'settlement_confirmed' | 'settlement_rejected' | 'undo'

export async function recordActivity(tx: Tx, e: {
  groupId: string; actorUserId: string | null; kind: ActivityKind; summary: string; payload?: Record<string, unknown>
}): Promise<void> {
  await tx.insert(groupActivity).values({ ...e, payload: e.payload ?? {} })
}

export async function listActivity(userId: string, groupId: string, q: { cursor?: string; limit: number }) {
  await requireMember(userId, groupId)
  const cursor = decodeCursor(q.cursor)
  const rows = await getDb().select().from(groupActivity)
    .where(and(
      eq(groupActivity.groupId, groupId),
      cursor ? sql`(${groupActivity.createdAt}, ${groupActivity.id}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)` : undefined,
    ))
    .orderBy(desc(groupActivity.createdAt), desc(groupActivity.id))
    .limit(q.limit + 1)
  const data = rows.slice(0, q.limit)
  const last = data[data.length - 1]
  return { data, nextCursor: rows.length > q.limit && last ? encodeCursor(last.createdAt, last.id) : null }
}
