import { and, eq, isNull } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { getDb } from '@/server/db/client'
import { friendships, notifications, transactions } from '@/server/db/schema'
import { undo } from './audit'
import { acceptFriendRequest, dropFriendRequest, listFriends, searchByEmail, sendFriendRequest, unfriend } from './friends'
import { createGroupExpense } from './groups/expenses'
import { createGroup, getGroup, listGroups } from './groups/groups'
import { addFriendMember, linkFriend } from './groups/members'

const kinds = async (userId: string) =>
  (await getDb().select().from(notifications).where(eq(notifications.userId, userId))).map((n) => n.kind).sort()
const liveTxns = (userId: string) =>
  getDb().select().from(transactions).where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))

async function befriend(a: string, b: string) {
  const { data } = await sendFriendRequest(a, `${b}@example.com`)
  await acceptFriendRequest(b, data.requestId)
}

describe('friends (spec §3.8)', () => {
  let food: string
  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a', { name: 'Yash' })
    await makeUser('user_b', { name: 'Asha' })
    await makeUser('user_c', { name: 'Ravi' })
    food = (await builtinCategory('Food & Dining')).id
  })

  it('search is exact and case-insensitive, and says how you are related', async () => {
    expect(await searchByEmail('user_a', '  USER_B@Example.com ')).toMatchObject({ userId: 'user_b', name: 'Asha', relation: 'none' })
    expect(await searchByEmail('user_a', 'user_b@example')).toBeNull()
    expect(await searchByEmail('user_a', 'user_')).toBeNull()
    expect(await searchByEmail('user_a', 'user_a@example.com')).toMatchObject({ relation: 'self' })
    await sendFriendRequest('user_a', 'user_b@example.com')
    expect(await searchByEmail('user_a', 'user_b@example.com')).toMatchObject({ relation: 'outgoing' })
    expect(await searchByEmail('user_b', 'user_a@example.com')).toMatchObject({ relation: 'incoming' })
  })

  it('request → notification → accept → both are friends, and the requester hears back', async () => {
    const { data } = await sendFriendRequest('user_a', 'user_b@example.com')
    expect(data.status).toBe('pending')
    expect(await kinds('user_b')).toEqual(['friend_request'])
    expect((await listFriends('user_b')).incoming.map((r) => r.userId)).toEqual(['user_a'])
    expect((await listFriends('user_a')).outgoing.map((r) => r.userId)).toEqual(['user_b'])
    const accepted = await acceptFriendRequest('user_b', data.requestId)
    expect(accepted.data).toMatchObject({ userId: 'user_a', name: 'Yash' })
    expect(await kinds('user_a')).toEqual(['friend_accepted'])
    const [request] = await getDb().select().from(notifications).where(eq(notifications.userId, 'user_b'))
    expect(request.actedAt).not.toBeNull()
    expect((await listFriends('user_a')).friends.map((f) => f.userId)).toEqual(['user_b'])
    expect((await listFriends('user_b')).friends.map((f) => f.userId)).toEqual(['user_a'])
  })

  it('refuses yourself, unknown emails and a repeat request; asking back accepts', async () => {
    await expect(sendFriendRequest('user_a', 'user_a@example.com')).rejects.toMatchObject({ status: 422, field: 'email' })
    await expect(sendFriendRequest('user_a', 'nobody@example.com')).rejects.toMatchObject({ status: 422, field: 'email' })
    await sendFriendRequest('user_a', 'user_b@example.com')
    await expect(sendFriendRequest('user_a', 'user_b@example.com')).rejects.toMatchObject({ code: 'friend_request_exists', status: 409 })
    const back = await sendFriendRequest('user_b', 'user_a@example.com')
    expect(back.data.status).toBe('accepted')
    await expect(sendFriendRequest('user_a', 'user_b@example.com')).rejects.toMatchObject({ code: 'already_friends', status: 409 })
  })

  it('crossed requests sent at the same moment leave exactly one row', async () => {
    const results = await Promise.allSettled([
      sendFriendRequest('user_a', 'user_b@example.com'),
      sendFriendRequest('user_b', 'user_a@example.com'),
    ])
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true)
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toMatchObject({ code: 'friend_request_exists' })
    expect(await getDb().select().from(friendships)).toHaveLength(1)
  })

  it('decline is silent, cancel works, only the addressee accepts, and unfriending leaves groups alone', async () => {
    const r1 = await sendFriendRequest('user_a', 'user_b@example.com')
    await expect(acceptFriendRequest('user_a', r1.data.requestId)).rejects.toMatchObject({ status: 404 })
    await dropFriendRequest('user_b', r1.data.requestId)
    expect(await kinds('user_a')).toEqual([])
    expect(await kinds('user_b')).toEqual([])
    const r2 = await sendFriendRequest('user_a', 'user_b@example.com')
    await expect(dropFriendRequest('user_c', r2.data.requestId)).rejects.toMatchObject({ status: 404 })
    await dropFriendRequest('user_a', r2.data.requestId)
    expect((await listFriends('user_b')).incoming).toEqual([])

    await befriend('user_a', 'user_b')
    const { data: g } = await createGroup('user_a', { name: 'Flat', friendIds: ['user_b'] })
    await unfriend('user_b', 'user_a')
    expect((await listFriends('user_a')).friends).toEqual([])
    expect((await getGroup('user_b', g.id)).members.map((m) => m.displayName)).toEqual(['Yash', 'Asha'])
    await expect(unfriend('user_a', 'user_b')).rejects.toMatchObject({ status: 404 })
  })

  it('a friend is added straight in: claimed, notified, sees the group, and gets mirrors at once', async () => {
    const { data: g } = await createGroup('user_a', { name: 'Goa', kind: 'event', placeholders: [{ displayName: 'Dev' }] })
    await expect(addFriendMember('user_a', g.id, { userId: 'user_b' })).rejects.toMatchObject({ code: 'not_friends', status: 422, field: 'userId' })
    await befriend('user_a', 'user_b')
    await expect(addFriendMember('user_c', g.id, { userId: 'user_b' })).rejects.toMatchObject({ code: 'not_member', status: 404 })
    const { data: m, auditId } = await addFriendMember('user_a', g.id, { userId: 'user_b' })
    expect(m).toMatchObject({ displayName: 'Asha', claimed: true })
    expect(auditId).toEqual(expect.any(String))
    expect(await kinds('user_b')).toContain('group_added')
    expect((await listGroups('user_b')).map((x) => x.id)).toEqual([g.id])
    await expect(addFriendMember('user_a', g.id, { userId: 'user_b' })).rejects.toMatchObject({ code: 'already_member', status: 409 })
    // ₹900 split equally between Yash and Asha lands on Asha's personal ledger at once: no cash, ₹450 share.
    await createGroupExpense('user_a', g.id, {
      description: 'Dinner', amountPaise: 90_000, categoryId: food,
      payers: [{ memberId: g.myMemberId, paidPaise: 90_000 }], split: { mode: 'equal', memberIds: [g.myMemberId, m.id] },
    })
    expect(await liveTxns('user_b')).toMatchObject([{ source: 'group', amount: 0, personalShare: 45_000 }])
  })

  it('a friend whose name is already taken is pointed at “Link to a friend”', async () => {
    await befriend('user_a', 'user_b')
    const { data: g } = await createGroup('user_a', { name: 'Goa', placeholders: [{ displayName: 'asha' }] })
    await expect(addFriendMember('user_a', g.id, { userId: 'user_b' })).rejects.toMatchObject({ code: 'duplicate_member', status: 409 })
  })

  it('undo removes a just-added friend and their notification, but not once they are in an expense', async () => {
    await befriend('user_a', 'user_b')
    await befriend('user_a', 'user_c')
    const { data: g } = await createGroup('user_a', { name: 'Flat' })
    const b = await addFriendMember('user_a', g.id, { userId: 'user_b' })
    await undo('user_a', b.auditId)
    expect(await listGroups('user_b')).toEqual([])
    expect(await kinds('user_b')).not.toContain('group_added')
    const c = await addFriendMember('user_a', g.id, { userId: 'user_c' })
    await createGroupExpense('user_a', g.id, {
      description: 'Milk', amountPaise: 6_000, categoryId: food,
      payers: [{ memberId: g.myMemberId, paidPaise: 6_000 }], split: { mode: 'equal', memberIds: [g.myMemberId, c.data.id] },
    })
    await expect(undo('user_a', c.auditId)).rejects.toMatchObject({ status: 409 })
    expect((await listGroups('user_c')).map((x) => x.id)).toEqual([g.id])
  })

  it('linking a placeholder to a friend backfills their mirrors and is refused for strangers or taken names', async () => {
    await befriend('user_a', 'user_b')
    const { data: g } = await createGroup('user_a', { name: 'Goa', placeholders: [{ displayName: 'Asha P' }, { displayName: 'Dev' }] })
    const ph = g.members.find((m) => m.displayName === 'Asha P')!
    const dev = g.members.find((m) => m.displayName === 'Dev')!
    await createGroupExpense('user_a', g.id, {
      description: 'Cab', amountPaise: 60_000, categoryId: food,
      payers: [{ memberId: g.myMemberId, paidPaise: 60_000 }], split: { mode: 'equal', memberIds: [g.myMemberId, ph.id] },
    })
    await expect(linkFriend('user_a', g.id, ph.id, { userId: 'user_c' })).rejects.toMatchObject({ code: 'not_friends' })
    const { data } = await linkFriend('user_a', g.id, ph.id, { userId: 'user_b' })
    expect(data).toMatchObject({ displayName: 'Asha P', claimed: true })
    expect(await liveTxns('user_b')).toMatchObject([{ source: 'group', amount: 0, personalShare: 30_000 }])
    expect(await kinds('user_b')).toContain('group_added')
    await expect(linkFriend('user_a', g.id, dev.id, { userId: 'user_b' })).rejects.toMatchObject({ code: 'already_member' })
  })

  it('a new group can include friends; strangers are refused', async () => {
    await befriend('user_a', 'user_b')
    await expect(createGroup('user_a', { name: 'X', friendIds: ['user_c'] })).rejects.toMatchObject({ code: 'not_friends', field: 'friendIds' })
    const { data } = await createGroup('user_a', { name: 'Flat', friendIds: ['user_b'], placeholders: [{ displayName: 'Dev' }] })
    expect(data.members.map((m) => [m.displayName, m.claimed])).toEqual([['Yash', true], ['Asha', true], ['Dev', false]])
    expect(await kinds('user_b')).toContain('group_added')
  })
})
