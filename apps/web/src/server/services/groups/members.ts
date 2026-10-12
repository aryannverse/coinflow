import 'server-only'
import { and, eq, isNull, or } from 'drizzle-orm'
import { formatINR } from '@/lib/money'
import type { FriendUserBody } from '@/lib/schemas/friends'
import type { MemberCreate, MemberPatch } from '@/lib/schemas/groups'
import { getDb } from '@/server/db/client'
import { pgErrorCode } from '@/server/db/errors'
import { groupMembers, settlements, type GroupMember } from '@/server/db/schema'
import { AppError, conflict, invalid, notFound } from '@/server/errors'
import { recordAudit } from '../audit'
import { displayNameOf, requireFriend } from '../friends'
import { notify } from '../notifications'
import { recordActivity } from './activity'
import { announceClaim } from './invites'
import { memberNets } from './nets'
import { requireCreator, requireMember } from './permissions'
import { listMemberRows, memberViews } from './rows'
import type { MemberView } from './types'

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const nameTaken = (members: GroupMember[], name: string, except?: string) =>
  members.some((m) => !m.removedAt && m.id !== except && sameName(m.displayName, name))

export async function listMembers(userId: string, groupId: string): Promise<MemberView[]> {
  await requireMember(userId, groupId)
  return memberViews(getDb(), groupId, userId)
}

/** Any member may add a placeholder (spec §3.2); audited, so it can be undone until the person joins. */
export async function addPlaceholder(userId: string, groupId: string, body: MemberCreate): Promise<{ data: MemberView; auditId: string }> {
  return getDb().transaction(async (tx) => {
    const { me } = await requireMember(userId, groupId, tx, { lock: true })
    if (nameTaken(await listMemberRows(tx, groupId), body.displayName)) {
      throw conflict('duplicate_member', `There’s already someone called ${body.displayName} here.`)
    }
    const [row] = await tx.insert(groupMembers).values({ groupId, displayName: body.displayName, upiId: body.upiId ?? null, upiSetBy: body.upiId ? userId : null, addedBy: userId }).returning()
    await recordActivity(tx, { groupId, actorUserId: userId, kind: 'member_added', summary: `${me.displayName} added ${row.displayName}`, payload: { memberId: row.id } })
    const auditId = await recordAudit(tx, { userId, entity: 'group_member', entityId: row.id, action: 'create', before: null, after: row })
    const data = (await memberViews(tx, groupId, userId)).find((m) => m.id === row.id) as MemberView
    return { data, auditId }
  })
}

export async function updateMember(userId: string, groupId: string, memberId: string, patch: MemberPatch): Promise<{ data: MemberView }> {
  return getDb().transaction(async (tx) => {
    const { me } = await requireMember(userId, groupId, tx, { lock: true })
    const members = await listMemberRows(tx, groupId)
    const target = members.find((m) => m.id === memberId && !m.removedAt)
    if (!target) throw notFound('member')
    if (target.userId) {
      if (target.userId !== userId && me.role !== 'creator') throw new AppError('creator_only', 'Only they or the group’s creator can rename them.', 403)
      if (patch.upiId !== undefined) throw invalid('upiId', 'Members set their UPI ID in their own profile.')
    }
    // Settle-ups go to this ID, so it isn't anyone's to change: only whoever added the placeholder, or the creator.
    const upiChanged = patch.upiId !== undefined && (patch.upiId ?? null) !== target.upiId
    if (upiChanged && target.addedBy !== userId && me.role !== 'creator') {
      throw new AppError('creator_only', `Only the person who added ${target.displayName} or the group’s creator can change their UPI ID.`, 403, 'upiId')
    }
    if (patch.displayName && nameTaken(members, patch.displayName, target.id)) {
      throw conflict('duplicate_member', `There’s already someone called ${patch.displayName} here.`)
    }
    await tx.update(groupMembers).set(upiChanged ? { ...patch, upiSetBy: patch.upiId ? userId : null } : patch).where(eq(groupMembers.id, target.id))
    if (upiChanged) {
      const name = patch.displayName ?? target.displayName
      await recordActivity(tx, {
        groupId, actorUserId: userId, kind: 'member_updated',
        summary: patch.upiId ? `${me.displayName} set ${name}’s UPI ID` : `${me.displayName} removed ${name}’s UPI ID`,
        payload: { memberId: target.id, field: 'upiId' },
      })
    }
    return { data: (await memberViews(tx, groupId, userId)).find((m) => m.id === target.id) as MemberView }
  })
}

/** Creator only; never someone who still has money to settle (spec §3.2). */
export async function removeMember(userId: string, groupId: string, memberId: string): Promise<{ data: { id: string } }> {
  return getDb().transaction(async (tx) => {
    const { me } = await requireCreator(userId, groupId, tx, { lock: true })
    const [target] = await tx.select().from(groupMembers)
      .where(and(eq(groupMembers.id, memberId), eq(groupMembers.groupId, groupId), isNull(groupMembers.removedAt)))
    if (!target) throw notFound('member')
    if (target.id === me.id) throw invalid('memberId', 'You can’t remove yourself from a group you created.')
    const net = (await memberNets(tx, [target.id])).get(target.id) ?? 0
    if (net !== 0) {
      throw conflict('member_has_balance', `${target.displayName} still has ${formatINR(Math.abs(net))} to settle, so they can’t be removed yet.`)
    }
    // A pending payment would move their net once it's confirmed, after they'd gone.
    const [waiting] = await tx.select().from(settlements).where(and(
      eq(settlements.groupId, groupId), eq(settlements.status, 'pending'),
      or(eq(settlements.fromMember, target.id), eq(settlements.toMember, target.id)),
    ))
    if (waiting) {
      throw conflict('member_has_balance', `A ${formatINR(waiting.amountPaise)} payment ${waiting.fromMember === target.id ? 'from' : 'to'} ${target.displayName} is still waiting to be confirmed, so they can’t be removed yet.`)
    }
    await tx.update(groupMembers).set({ removedAt: new Date() }).where(eq(groupMembers.id, target.id))
    await recordActivity(tx, { groupId, actorUserId: userId, kind: 'member_removed', summary: `${me.displayName} removed ${target.displayName}` })
    return { data: { id: target.id } }
  })
}

/** Spec §3.8: a friend joins directly as a claimed member, with no link and no claim step. Audited like any member add. */
export async function addFriendMember(userId: string, groupId: string, body: FriendUserBody): Promise<{ data: MemberView; auditId: string }> {
  try {
    return await getDb().transaction(async (tx) => {
      const { group, me } = await requireMember(userId, groupId, tx, { lock: true })
      const friend = await requireFriend(tx, userId, body.userId)
      const members = await listMemberRows(tx, groupId)
      const name = displayNameOf(friend)
      if (members.some((m) => !m.removedAt && m.userId === friend.id)) throw conflict('already_member', `${name} is already in this group.`)
      if (nameTaken(members, name)) {
        throw conflict('duplicate_member', `There’s already someone called ${name} here. If that’s them, use “Link to a friend” on that name.`)
      }
      const [row] = await tx.insert(groupMembers)
        .values({ groupId, userId: friend.id, displayName: name, addedBy: userId, claimedAt: new Date() }).returning()
      await recordActivity(tx, { groupId, actorUserId: userId, kind: 'member_added', summary: `${me.displayName} added ${row.displayName}`, payload: { memberId: row.id } })
      await notify(tx, [{
        userId: friend.id, kind: 'group_added', title: `${me.displayName} added you to ${group.name}`,
        body: 'You can see its expenses and your balance now.', href: `/groups/${groupId}`, payload: { groupId, memberId: row.id },
      }])
      const auditId = await recordAudit(tx, { userId, entity: 'group_member', entityId: row.id, action: 'create', before: null, after: row })
      const data = (await memberViews(tx, groupId, userId)).find((m) => m.id === row.id) as MemberView
      return { data, auditId }
    })
  } catch (err) {
    if (pgErrorCode(err) === '23505') throw conflict('already_member', 'They’re already in this group.')
    throw err
  }
}

/** Spec §3.8 "This is Asha": the same as Asha claiming the placeholder herself (backfill, notify, waiting payments). Final. */
export async function linkFriend(userId: string, groupId: string, memberId: string, body: FriendUserBody): Promise<{ data: MemberView }> {
  try {
    return await getDb().transaction(async (tx) => {
      const { group, me } = await requireMember(userId, groupId, tx, { lock: true })
      const friend = await requireFriend(tx, userId, body.userId)
      const members = await listMemberRows(tx, groupId)
      if (members.some((m) => !m.removedAt && m.userId === friend.id)) {
        throw conflict('already_member', `${displayNameOf(friend)} is already in this group.`)
      }
      const ph = members.find((m) => m.id === memberId && !m.removedAt)
      if (!ph) throw notFound('member')
      const taken = () => conflict('already_claimed', `${ph.displayName} has already joined.`)
      if (ph.userId) throw taken()
      const now = new Date()
      const [member] = await tx.update(groupMembers).set({ userId: friend.id, claimedAt: now })
        .where(and(eq(groupMembers.id, ph.id), isNull(groupMembers.userId))).returning()
      if (!member) throw taken()
      await notify(tx, [{
        userId: friend.id, kind: 'group_added', title: `${me.displayName} added you to ${group.name} as ${member.displayName}`,
        body: 'Expenses already logged for that name now show in your Activity.', href: `/groups/${groupId}`,
        payload: { groupId, memberId: member.id },
      }])
      await announceClaim(tx, group, member, userId, now)
      return { data: (await memberViews(tx, groupId, userId)).find((m) => m.id === member.id) as MemberView }
    })
  } catch (err) {
    if (pgErrorCode(err) === '23505') throw conflict('already_member', 'They’re already in this group.')
    throw err
  }
}
