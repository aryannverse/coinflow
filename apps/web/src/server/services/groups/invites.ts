import 'server-only'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import { pgErrorCode } from '@/server/db/errors'
import { getDb, type Tx } from '@/server/db/client'
import { groupInvites, groupMembers, groups, settlements, type Group, type GroupMember } from '@/server/db/schema'
import { AppError, conflict, invalid } from '@/server/errors'
import { formatINR } from '@/lib/money'
import type { ClaimBody } from '@/lib/schemas/groups'
import { notify } from '../notifications'
import { recordActivity } from './activity'
import { backfillMemberMirrors } from './mirrors'
import { requireMember } from './permissions'
import type { Exec } from './rows'
import type { InviteLink, InvitePreview } from './types'

export const inviteInvalid = () => new AppError('invite_invalid', 'This invite link has expired or was replaced. Ask for a new one.', 404)

function inviteSecret(): string {
  const s = process.env.INVITE_SECRET
  if (!s || s.length < 16) throw new AppError('invite_unconfigured', 'Invites aren’t set up on this server yet (INVITE_SECRET).', 500)
  return s
}

/**
 * The link token: 32 bytes = HMAC-SHA256(INVITE_SECRET, random invite id), base64url (43 chars). Only sha256(token)
 * is stored (spec §3.3), so a DB leak alone yields no working link, yet members can be shown the link again.
 */
export const inviteToken = (inviteId: string) => createHmac('sha256', inviteSecret()).update(`coinflow-invite:${inviteId}`).digest('base64url')
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const inviteUrl = (token: string) => `${process.env.APP_URL ?? 'http://localhost:3000'}/join/${token}`

export async function createInviteRow(tx: Tx, groupId: string, userId: string): Promise<InviteLink> {
  const id = randomUUID()
  const token = inviteToken(id)
  const [row] = await tx.insert(groupInvites).values({ id, groupId, tokenHash: hashToken(token), createdBy: userId }).returning()
  return { url: inviteUrl(token), createdAt: row.createdAt }
}

export async function getInvite(userId: string, groupId: string): Promise<InviteLink> {
  return getDb().transaction(async (tx) => {
    await requireMember(userId, groupId, tx, { lock: true })
    const [active] = await tx.select().from(groupInvites).where(and(eq(groupInvites.groupId, groupId), isNull(groupInvites.revokedAt)))
    return active ? { url: inviteUrl(inviteToken(active.id)), createdAt: active.createdAt } : createInviteRow(tx, groupId, userId)
  })
}

/** Regenerate = revoke + create (spec §3.1): the old link stops working at once. Any member may do it. */
export async function regenerateInvite(userId: string, groupId: string): Promise<InviteLink> {
  return getDb().transaction(async (tx) => {
    const { me } = await requireMember(userId, groupId, tx, { lock: true })
    await tx.update(groupInvites).set({ revokedAt: new Date() }).where(and(eq(groupInvites.groupId, groupId), isNull(groupInvites.revokedAt)))
    const link = await createInviteRow(tx, groupId, userId)
    await recordActivity(tx, { groupId, actorUserId: userId, kind: 'invite_regenerated', summary: `${me.displayName} made a new invite link` })
    return link
  })
}

async function findInvite(exec: Exec, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw inviteInvalid()
  const [row] = await exec.select({ invite: groupInvites, group: groups }).from(groupInvites)
    .innerJoin(groups, eq(groups.id, groupInvites.groupId))
    .where(and(eq(groupInvites.tokenHash, hashToken(token)), isNull(groupInvites.revokedAt), isNull(groups.archivedAt)))
  if (!row) throw inviteInvalid()
  return row
}

export async function previewInvite(userId: string, token: string): Promise<InvitePreview> {
  const db = getDb()
  const { group } = await findInvite(db, token)
  const members = await db.select().from(groupMembers)
    .where(and(eq(groupMembers.groupId, group.id), isNull(groupMembers.removedAt)))
    .orderBy(asc(groupMembers.createdAt), asc(groupMembers.id))
  return {
    group: { id: group.id, name: group.name, emoji: group.emoji, color: group.color, kind: group.kind, startsOn: group.startsOn, endsOn: group.endsOn },
    placeholders: members.filter((m) => m.userId === null).map((m) => ({ id: m.id, displayName: m.displayName })),
    myMemberId: members.find((m) => m.userId === userId)?.id ?? null,
  }
}

/** Spec §3.3 step 4: set userId + claimedAt, backfill mirrors, notify the group, add an activity entry. */
export async function claimInvite(userId: string, token: string, body: ClaimBody): Promise<{ groupId: string; memberId: string }> {
  try {
    return await getDb().transaction(async (tx) => {
      const { group } = await findInvite(tx, token)
      await tx.select({ id: groups.id }).from(groups).where(eq(groups.id, group.id)).for('update') // one claim at a time per group
      const [existing] = await tx.select({ id: groupMembers.id }).from(groupMembers)
        .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, userId), isNull(groupMembers.removedAt)))
      if (existing) throw conflict('already_member', 'You’re already in this group.')
      const now = new Date()

      let member
      if ('memberId' in body) {
        const [ph] = await tx.select().from(groupMembers)
          .where(and(eq(groupMembers.id, body.memberId), eq(groupMembers.groupId, group.id), isNull(groupMembers.removedAt)))
        if (!ph) throw invalid('memberId', 'That name isn’t in this group any more.')
        const taken = () => conflict('already_claimed', `Someone already joined as ${ph.displayName}. Pick another name or choose “I’m not listed”.`)
        if (ph.userId) throw taken()
        ;[member] = await tx.update(groupMembers).set({ userId, claimedAt: now })
          .where(and(eq(groupMembers.id, ph.id), isNull(groupMembers.userId))).returning()
        if (!member) throw taken()
      } else {
        ;[member] = await tx.insert(groupMembers)
          .values({ groupId: group.id, userId, displayName: body.newName, role: 'member', addedBy: userId, claimedAt: now }).returning()
      }

      await announceClaim(tx, group, member, userId, now)
      return { groupId: group.id, memberId: member.id }
    })
  } catch (err) {
    if (pgErrorCode(err) === '23505') throw conflict('already_member', 'You’re already in this group.')
    throw err
  }
}

/**
 * After a member gets an account, whether by claiming it themselves or through a friend's "Link to a friend" (spec §3.3 step 4, §3.8):
 * backfill their mirrors, add a feed entry, tell the rest of the group, and hand over payments that were waiting for them.
 */
export async function announceClaim(tx: Tx, group: Group, member: GroupMember, actorUserId: string, now: Date): Promise<void> {
  await backfillMemberMirrors(tx, member.id, now)
  await recordActivity(tx, { groupId: group.id, actorUserId, kind: 'member_claimed', summary: `${member.displayName} joined`, payload: { memberId: member.id } })
  const others = await tx.select().from(groupMembers)
    .where(and(eq(groupMembers.groupId, group.id), isNull(groupMembers.removedAt), ne(groupMembers.id, member.id)))
  const joinedMsg = `${member.displayName} joined ${group.name}`
  await notify(tx, others.filter((m) => m.userId && m.userId !== actorUserId).map((m) => ({
    userId: m.userId as string, kind: 'member_claimed' as const, title: joinedMsg,
    body: 'They can now see their balance.', href: `/groups/${group.id}`, payload: { groupId: group.id, memberId: member.id },
  })))
  // Payments someone marked to this placeholder were waiting for a payee who could confirm (plan A7).
  const waiting = await tx.select().from(settlements).where(and(eq(settlements.toMember, member.id), eq(settlements.status, 'pending')))
  const names = new Map(others.map((m) => [m.id, m.displayName]))
  await notify(tx, waiting.map((s) => ({
    userId: member.userId as string, kind: 'settlement_marked' as const,
    title: `${names.get(s.fromMember) ?? 'Someone'} says they paid you ${formatINR(s.amountPaise)}`,
    body: `${group.name} · Did it arrive?`, href: `/groups/${group.id}?tab=balances`,
    payload: { settlementId: s.id, groupId: group.id, amountPaise: s.amountPaise },
  })))
}
