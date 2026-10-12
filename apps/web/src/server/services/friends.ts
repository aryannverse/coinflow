import 'server-only'
import { and, desc, eq, or, sql } from 'drizzle-orm'
import { pgErrorCode } from '@/server/db/errors'
import { getDb, type Tx } from '@/server/db/client'
import { friendships, notifications, users, type Friendship, type User } from '@/server/db/schema'
import { AppError, conflict, invalid, notFound } from '@/server/errors'
import type { Exec } from './groups/rows'
import { notify, wake } from './notifications'

export type FriendUser = { userId: string; name: string; email: string; avatarUrl: string | null }
export type FriendRelation = 'self' | 'none' | 'friends' | 'outgoing' | 'incoming'
export type FriendSearchResult = FriendUser & { relation: FriendRelation; requestId: string | null }
export type FriendRequestView = FriendUser & { requestId: string; createdAt: Date }
export type FriendView = FriendUser & { since: Date }
export type FriendsOverview = { friends: FriendView[]; incoming: FriendRequestView[]; outgoing: FriendRequestView[] }

/** The name Coinflow shows for an account: its profile name, else the part of the email before the @. */
export const displayNameOf = (u: Pick<User, 'name' | 'email'>) => u.name.trim() || u.email.split('@')[0]
export const notFriends = (field = 'userId') =>
  new AppError('not_friends', 'You can only add friends directly. Share the invite link with anyone else.', 422, field)

const view = (u: User): FriendUser => ({ userId: u.id, name: displayNameOf(u), email: u.email, avatarUrl: u.avatarUrl })
const byEmail = (email: string) => sql`lower(${users.email}) = ${email.trim().toLowerCase()}`
const pair = (a: string, b: string) => or(
  and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
  and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
)
const requestNote = (requestId: string) =>
  and(eq(notifications.kind, 'friend_request'), sql`${notifications.payload}->>'requestId' = ${requestId}`)

export async function areFriends(exec: Exec, a: string, b: string): Promise<boolean> {
  const [row] = await exec.select({ id: friendships.id }).from(friendships).where(and(pair(a, b), eq(friendships.status, 'accepted')))
  return Boolean(row)
}

/** Loads a user the caller is friends with, or refuses with not_friends (422). */
export async function requireFriend(tx: Tx, userId: string, friendId: string, field = 'userId'): Promise<User> {
  if (friendId === userId || !(await areFriends(tx, userId, friendId))) throw notFriends(field)
  const [u] = await tx.select().from(users).where(eq(users.id, friendId))
  if (!u) throw notFriends(field)
  return u
}

/** Exact, case-insensitive email match only (spec §3.8): no partial matches, so accounts can't be enumerated. */
export async function searchByEmail(userId: string, email: string): Promise<FriendSearchResult | null> {
  const db = getDb()
  const [u] = await db.select().from(users).where(byEmail(email))
  if (!u) return null
  if (u.id === userId) return { ...view(u), relation: 'self', requestId: null }
  const [f] = await db.select().from(friendships).where(pair(userId, u.id))
  const relation: FriendRelation = !f ? 'none' : f.status === 'accepted' ? 'friends' : f.requesterId === userId ? 'outgoing' : 'incoming'
  return { ...view(u), relation, requestId: f?.id ?? null }
}

async function accept(tx: Tx, f: Friendship, accepter: User): Promise<void> {
  await tx.update(friendships).set({ status: 'accepted', respondedAt: new Date() }).where(eq(friendships.id, f.id))
  // Hide Accept / Decline on the addressee's notification. (A Date inside sql`` breaks postgres.js, hence now().)
  const acted = await tx.update(notifications).set({ actedAt: new Date(), readAt: sql`coalesce(${notifications.readAt}, now())` })
    .where(requestNote(f.id)).returning({ userId: notifications.userId })
  await wake(tx, acted.map((r) => r.userId))
  await notify(tx, [{
    userId: f.requesterId, kind: 'friend_accepted', title: `${displayNameOf(accepter)} accepted your friend request`,
    body: 'You can now add each other to groups directly.', href: '/friends', payload: { userId: accepter.id },
  }])
}

export async function sendFriendRequest(
  userId: string, email: string,
): Promise<{ data: { requestId: string; status: 'pending' | 'accepted'; user: FriendUser } }> {
  try {
    return await getDb().transaction(async (tx) => {
      const [target] = await tx.select().from(users).where(byEmail(email))
      if (!target) throw invalid('email', 'No Coinflow account uses that email. Invite them with a group link instead.')
      if (target.id === userId) throw invalid('email', 'That’s you.')
      const [me] = await tx.select().from(users).where(eq(users.id, userId))
      if (!me) throw notFound('account')
      const [existing] = await tx.select().from(friendships).where(pair(userId, target.id)).for('update')
      const name = displayNameOf(target)
      if (existing?.status === 'accepted') throw conflict('already_friends', `You and ${name} are already friends.`)
      if (existing?.requesterId === userId) throw conflict('friend_request_exists', `You’ve already asked ${name}. They haven’t answered yet.`)
      if (existing) { // they asked first, so asking back is a yes (spec §3.8)
        await accept(tx, existing, me)
        return { data: { requestId: existing.id, status: 'accepted' as const, user: view(target) } }
      }
      const [row] = await tx.insert(friendships).values({ requesterId: userId, addresseeId: target.id }).returning()
      await notify(tx, [{
        userId: target.id, kind: 'friend_request', title: `${displayNameOf(me)} wants to be friends`,
        body: 'Friends can add each other to groups without an invite link.', href: '/friends',
        payload: { requestId: row.id, fromUserId: userId, fromName: displayNameOf(me) },
      }])
      return { data: { requestId: row.id, status: 'pending' as const, user: view(target) } }
    })
  } catch (err) {
    // Two crossed requests at the same instant: the pair index lets one in; the other is told plainly.
    if (pgErrorCode(err) === '23505') throw conflict('friend_request_exists', 'There’s already a request between you two.')
    throw err
  }
}

export async function acceptFriendRequest(userId: string, requestId: string): Promise<{ data: FriendView }> {
  return getDb().transaction(async (tx) => {
    const [f] = await tx.select().from(friendships)
      .where(and(eq(friendships.id, requestId), eq(friendships.addresseeId, userId), eq(friendships.status, 'pending'))).for('update')
    if (!f) throw notFound('friend request')
    const [me] = await tx.select().from(users).where(eq(users.id, userId))
    const [them] = await tx.select().from(users).where(eq(users.id, f.requesterId))
    if (!me || !them) throw notFound('friend request')
    await accept(tx, f, me)
    return { data: { ...view(them), since: new Date() } }
  })
}

/** Decline (addressee) or cancel (requester). Silent: the row and the actionable notification both go. */
export async function dropFriendRequest(userId: string, requestId: string): Promise<{ data: { id: string } }> {
  return getDb().transaction(async (tx) => {
    const [f] = await tx.delete(friendships).where(and(
      eq(friendships.id, requestId), eq(friendships.status, 'pending'),
      or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)),
    )).returning()
    if (!f) throw notFound('friend request')
    const gone = await tx.delete(notifications).where(requestNote(f.id)).returning({ userId: notifications.userId })
    await wake(tx, gone.map((r) => r.userId))
    return { data: { id: f.id } }
  })
}

/** Either side may unfriend. Groups, expenses and balances they share are untouched (spec §3.8). */
export async function unfriend(userId: string, friendUserId: string): Promise<{ data: { userId: string } }> {
  const rows = await getDb().delete(friendships)
    .where(and(pair(userId, friendUserId), eq(friendships.status, 'accepted'))).returning({ id: friendships.id })
  if (rows.length === 0) throw notFound('friend')
  return { data: { userId: friendUserId } }
}

export async function listFriends(userId: string): Promise<FriendsOverview> {
  const rows = await getDb().select({ f: friendships, u: users }).from(friendships)
    .innerJoin(users, sql`${users.id} = case when ${friendships.requesterId} = ${userId} then ${friendships.addresseeId} else ${friendships.requesterId} end`)
    .where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)))
    .orderBy(desc(friendships.createdAt))
  const request = (r: (typeof rows)[number]): FriendRequestView => ({ ...view(r.u), requestId: r.f.id, createdAt: r.f.createdAt })
  const pending = rows.filter((r) => r.f.status === 'pending')
  return {
    friends: rows.filter((r) => r.f.status === 'accepted')
      .map((r) => ({ ...view(r.u), since: r.f.respondedAt ?? r.f.createdAt }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en-IN')),
    incoming: pending.filter((r) => r.f.addresseeId === userId).map(request),
    outgoing: pending.filter((r) => r.f.requesterId === userId).map(request),
  }
}
