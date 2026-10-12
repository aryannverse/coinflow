import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { getDb } from '@/server/db/client'
import { groupMembers, groups, type Group, type GroupMember } from '@/server/db/schema'
import { AppError } from '@/server/errors'
import type { Exec } from './rows'

/** Spec §3.2/§5: a non-member learns nothing, not even that the group exists. */
export const notMember = () => new AppError('not_member', 'We couldn’t find that group.', 404)

export const groupArchived = () => new AppError('group_archived', 'This group is archived, so nothing in it can change. You can still look back through it.', 409)

/**
 * The caller's live, claimed membership. `lock` takes FOR UPDATE on the group row, which serialises
 * writes inside one group (claims, edits) without blocking other groups. `write` (default: same as `lock`)
 * refuses an archived group: it stays readable, but nothing in it changes.
 */
export async function requireMember(
  userId: string, groupId: string, exec: Exec = getDb(), opts: { lock?: boolean; write?: boolean } = {},
): Promise<{ group: Group; me: GroupMember }> {
  const query = exec
    .select({ group: groups, me: groupMembers })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId), isNull(groupMembers.removedAt)))
  const [row] = opts.lock ? await query.for('update', { of: groups }) : await query
  if (!row) throw notMember()
  if ((opts.write ?? opts.lock) && row.group.archivedAt) throw groupArchived()
  return row
}

export async function requireCreator(userId: string, groupId: string, exec: Exec = getDb(), opts: { lock?: boolean; write?: boolean } = {}) {
  const r = await requireMember(userId, groupId, exec, opts)
  if (r.me.role !== 'creator') throw new AppError('creator_only', 'Only the person who made this group can do that.', 403)
  return r
}

/** True when both users are live, claimed members of at least one common group (or are the same user). */
export async function sharesGroupWith(viewerId: string, ownerId: string): Promise<boolean> {
  if (viewerId === ownerId) return true
  const a = alias(groupMembers, 'a')
  const b = alias(groupMembers, 'b')
  const [row] = await getDb()
    .select({ id: a.id })
    .from(a)
    .innerJoin(b, eq(a.groupId, b.groupId))
    .where(and(eq(a.userId, viewerId), eq(b.userId, ownerId), isNull(a.removedAt), isNull(b.removedAt)))
    .limit(1)
  return Boolean(row)
}
