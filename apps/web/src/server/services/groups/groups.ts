import 'server-only'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { groupCreateSchema, type GroupCreateBody, type GroupPatch } from '@/lib/schemas/groups'
import { getDb } from '@/server/db/client'
import { groupMembers, groups, type Group, type User } from '@/server/db/schema'
import { invalid, notFound } from '@/server/errors'
import { displayNameOf, requireFriend } from '../friends'
import { notify } from '../notifications'
import { getUser } from '../users'
import { recordActivity } from './activity'
import { createInviteRow } from './invites'
import { memberNets } from './nets'
import { requireCreator, requireMember } from './permissions'
import { memberViews } from './rows'
import type { GroupDetail, GroupSummary } from './types'

const pick = (g: Group) => ({
  id: g.id, name: g.name, emoji: g.emoji, color: g.color, kind: g.kind,
  startsOn: g.startsOn, endsOn: g.endsOn, archivedAt: g.archivedAt, createdAt: g.createdAt,
})

export async function createGroup(userId: string, body: GroupCreateBody): Promise<{ data: GroupDetail; auditId: null }> {
  const input = groupCreateSchema.parse(body)
  const user = await getUser(userId)
  if (!user) throw notFound('account')
  const groupId = await getDb().transaction(async (tx) => {
    // Spec §3.8: friends join as claimed members at once; anyone else must be a placeholder.
    const friends: User[] = []
    for (const id of new Set(input.friendIds)) friends.push(await requireFriend(tx, userId, id, 'friendIds'))
    const names = [displayNameOf(user), ...friends.map(displayNameOf), ...input.placeholders.map((p) => p.displayName)].map((n) => n.trim().toLowerCase())
    if (new Set(names).size !== names.length) throw invalid('placeholders', 'Two people have the same name — add an initial to one.')
    const [g] = await tx.insert(groups).values({
      createdBy: userId, name: input.name, emoji: input.emoji, color: input.color, kind: input.kind,
      startsOn: input.startsOn ?? null, endsOn: input.endsOn ?? null,
    }).returning()
    // now() is fixed for the whole transaction, so stamp join order explicitly: it is the split tie-break order.
    const t0 = Date.now()
    const at = (i: number) => new Date(t0 + i)
    await tx.insert(groupMembers).values([
      { groupId: g.id, userId, displayName: displayNameOf(user), role: 'creator', addedBy: userId, claimedAt: at(0), createdAt: at(0) },
      ...friends.map((f, i) => ({ groupId: g.id, userId: f.id, displayName: displayNameOf(f), addedBy: userId, claimedAt: at(0), createdAt: at(i + 1) })),
      ...input.placeholders.map((p, i) => ({ groupId: g.id, displayName: p.displayName, upiId: p.upiId ?? null, addedBy: userId, createdAt: at(friends.length + i + 1) })),
    ])
    await createInviteRow(tx, g.id, userId)
    await recordActivity(tx, { groupId: g.id, actorUserId: userId, kind: 'group_created', summary: `${displayNameOf(user)} created ${g.name}` })
    await notify(tx, friends.map((f) => ({
      userId: f.id, kind: 'group_added' as const, title: `${displayNameOf(user)} added you to ${g.name}`,
      body: 'You can see its expenses and your balance now.', href: `/groups/${g.id}`, payload: { groupId: g.id },
    })))
    return g.id
  })
  return { data: await getGroup(userId, groupId), auditId: null }
}

export async function listGroups(userId: string, opts: { archived?: boolean } = {}): Promise<GroupSummary[]> {
  const db = getDb()
  const rows = await db.select({ g: groups, me: groupMembers }).from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.userId, userId), isNull(groupMembers.removedAt), opts.archived ? undefined : isNull(groups.archivedAt)))
    .orderBy(desc(groups.createdAt))
  if (rows.length === 0) return []
  const counts = await db.select({ groupId: groupMembers.groupId, n: sql<number>`count(*)`.mapWith(Number) })
    .from(groupMembers)
    .where(and(inArray(groupMembers.groupId, rows.map((r) => r.g.id)), isNull(groupMembers.removedAt)))
    .groupBy(groupMembers.groupId)
  const nets = await memberNets(db, rows.map((r) => r.me.id))
  return rows.map(({ g, me }) => ({
    ...pick(g),
    memberCount: counts.find((c) => c.groupId === g.id)?.n ?? 1,
    myMemberId: me.id,
    myPositionPaise: nets.get(me.id) ?? 0,
  }))
}

export async function getGroup(userId: string, groupId: string): Promise<GroupDetail> {
  const db = getDb()
  const { group, me } = await requireMember(userId, groupId, db)
  const members = await memberViews(db, groupId, userId)
  const nets = await memberNets(db, [me.id])
  return {
    ...pick(group),
    memberCount: members.filter((m) => !m.removedAt).length,
    myMemberId: me.id,
    myPositionPaise: nets.get(me.id) ?? 0,
    isCreator: me.role === 'creator',
    members,
  }
}

export async function updateGroup(userId: string, groupId: string, patch: GroupPatch): Promise<{ data: GroupDetail }> {
  await getDb().transaction(async (tx) => {
    const { group, me } = await requireCreator(userId, groupId, tx, { lock: true })
    const startsOn = patch.startsOn === undefined ? group.startsOn : patch.startsOn
    const endsOn = patch.endsOn === undefined ? group.endsOn : patch.endsOn
    if (startsOn && endsOn && endsOn < startsOn) throw invalid('endsOn', 'The end date is before the start date.')
    await tx.update(groups).set({ ...patch, startsOn: startsOn ?? null, endsOn: endsOn ?? null }).where(eq(groups.id, groupId))
    await recordActivity(tx, { groupId, actorUserId: userId, kind: 'group_updated', summary: `${me.displayName} updated the group details` })
  })
  return { data: await getGroup(userId, groupId) }
}

export async function archiveGroup(userId: string, groupId: string): Promise<{ data: { id: string } }> {
  await getDb().transaction(async (tx) => {
    await requireCreator(userId, groupId, tx, { lock: true })
    await tx.update(groups).set({ archivedAt: new Date() }).where(eq(groups.id, groupId))
  })
  return { data: { id: groupId } }
}
