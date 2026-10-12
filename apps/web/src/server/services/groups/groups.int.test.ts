import { and, eq, isNull } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { getDb } from '@/server/db/client'
import { notifications, transactions } from '@/server/db/schema'
import { undo } from '../audit'
import { createCheckin } from '../checkins'
import { getSafeToSpend } from '../safe-to-spend'
import { getGroupBalances } from './balances'
import { createGroupExpense, deleteGroupExpense, updateGroupExpense } from './expenses'
import { createGroup, getGroup, listGroups } from './groups'
import { claimInvite, getInvite, previewInvite, regenerateInvite } from './invites'
import { addPlaceholder, removeMember } from './members'

const tokenOf = (url: string) => url.split('/join/')[1]
const liveMirrors = (userId: string) =>
  getDb().select().from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.source, 'group'), isNull(transactions.deletedAt)))

describe('groups, invites and expense mirrors', () => {
  let food: string

  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a', { name: 'Yash' })
    await makeUser('user_b', { name: 'Asha B' })
    await makeUser('user_c', { name: 'Ravi C' })
    food = (await builtinCategory('Food & Dining')).id
  })

  async function goaTrip() {
    const { data } = await createGroup('user_a', {
      name: 'Goa', kind: 'event', placeholders: [{ displayName: 'Asha' }, { displayName: 'Ravi' }, { displayName: 'Dev' }],
    })
    const id = (name: string) => data.members.find((m) => m.displayName === name)!.id
    const token = tokenOf((await getInvite('user_a', data.id)).url)
    return { groupId: data.id, me: data.myMemberId, asha: id('Asha'), ravi: id('Ravi'), dev: id('Dev'), token }
  }
  type Trip = Awaited<ReturnType<typeof goaTrip>>
  // ₹900: I paid ₹500 and Ravi ₹400; split equally between me, Asha and Ravi (₹300 each). Dev is not involved.
  const dinner = (t: Trip, over: object = {}) => ({
    description: 'Dinner', amountPaise: 90_000, categoryId: food,
    payers: [{ memberId: t.me, paidPaise: 50_000 }, { memberId: t.ravi, paidPaise: 40_000 }],
    split: { mode: 'equal' as const, memberIds: [t.me, t.asha, t.ravi] },
    ...over,
  })

  it('creates an event with the creator first, placeholders in order, and a re-showable invite', async () => {
    const t = await goaTrip()
    const g = await getGroup('user_a', t.groupId)
    expect(g.members.map((m) => [m.displayName, m.role, m.claimed])).toEqual([
      ['Yash', 'creator', true], ['Asha', 'member', false], ['Ravi', 'member', false], ['Dev', 'member', false],
    ])
    expect(t.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(tokenOf((await getInvite('user_a', t.groupId)).url)).toBe(t.token)
    const fresh = tokenOf((await regenerateInvite('user_a', t.groupId)).url)
    expect(fresh).not.toBe(t.token)
    await expect(previewInvite('user_b', t.token)).rejects.toMatchObject({ code: 'invite_invalid', status: 404 })
    expect((await previewInvite('user_b', fresh)).placeholders.map((p) => p.displayName)).toEqual(['Asha', 'Ravi', 'Dev'])
  })

  it('non-members get 404 not_member, never 403, and do not see the group listed', async () => {
    const t = await goaTrip()
    for (const call of [
      () => getGroup('user_b', t.groupId),
      () => getGroupBalances('user_b', t.groupId),
      () => createGroupExpense('user_b', t.groupId, dinner(t)),
      () => getInvite('user_b', t.groupId),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: 'not_member', status: 404 })
    }
    expect(await listGroups('user_b')).toEqual([])
  })

  it('claim backfills the placeholder’s mirrors and tells the group', async () => {
    const t = await goaTrip()
    await createGroupExpense('user_a', t.groupId, dinner(t))
    expect(await liveMirrors('user_b')).toHaveLength(0)
    expect(await claimInvite('user_b', t.token, { memberId: t.asha })).toEqual({ groupId: t.groupId, memberId: t.asha })
    expect((await liveMirrors('user_b')).map((m) => [m.amount, m.personalShare])).toEqual([[0, 30_000]])
    expect((await liveMirrors('user_a')).map((m) => [m.amount, m.personalShare])).toEqual([[50_000, 30_000]])
    const told = await getDb().select().from(notifications).where(eq(notifications.userId, 'user_a'))
    expect(told.map((n) => n.kind)).toContain('member_claimed')
    expect((await getGroup('user_b', t.groupId)).myPositionPaise).toBe(-30_000)
  })

  it('concurrent claims of one placeholder: exactly one wins, the other is told who took it', async () => {
    const t = await goaTrip()
    const results = await Promise.allSettled([
      claimInvite('user_b', t.token, { memberId: t.asha }),
      claimInvite('user_c', t.token, { memberId: t.asha }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(lost.reason).toMatchObject({ code: 'already_claimed', status: 409 })
    expect(String(lost.reason.message)).toContain('Asha')
  })

  it('already a member: a second claim is already_member and the preview points at the membership', async () => {
    const t = await goaTrip()
    await claimInvite('user_b', t.token, { memberId: t.asha })
    await expect(claimInvite('user_b', t.token, { newName: 'Asha again' })).rejects.toMatchObject({ code: 'already_member', status: 409 })
    expect((await previewInvite('user_b', t.token)).myMemberId).toBe(t.asha)
    expect((await claimInvite('user_c', t.token, { newName: 'Kiran' })).memberId).toEqual(expect.any(String)) // "I'm not listed"
  })

  it('editing out a member removes their mirror and restores their S', async () => {
    const t = await goaTrip()
    await claimInvite('user_b', t.token, { memberId: t.asha })
    await createCheckin('user_b', 1_000_000, new Date(Date.now() - 60_000))
    const s0 = (await getSafeToSpend('user_b')).amount
    const { data } = await createGroupExpense('user_a', t.groupId, dinner(t))
    expect((await getSafeToSpend('user_b')).amount).toBe(s0 - 30_000) // G −₹300; Asha moved no cash
    await updateGroupExpense('user_a', t.groupId, data.id, dinner(t, { split: { mode: 'equal', memberIds: [t.me, t.ravi] } }))
    expect(await liveMirrors('user_b')).toHaveLength(0)
    expect((await getSafeToSpend('user_b')).amount).toBe(s0)
  })

  it('delete removes every mirror; undo brings them and the balances back', async () => {
    const t = await goaTrip()
    const { data } = await createGroupExpense('user_a', t.groupId, dinner(t))
    const { auditId } = await deleteGroupExpense('user_a', t.groupId, data.id)
    expect(await liveMirrors('user_a')).toHaveLength(0)
    expect((await getGroupBalances('user_a', t.groupId)).payments).toEqual([])
    await undo('user_a', auditId)
    expect((await liveMirrors('user_a')).map((m) => m.amount)).toEqual([50_000])
    expect((await getGroupBalances('user_a', t.groupId)).payments).toHaveLength(2)
  })

  it('undoing a create soft-deletes the expense and its mirrors', async () => {
    const t = await goaTrip()
    const { auditId } = await createGroupExpense('user_a', t.groupId, dinner(t))
    await undo('user_a', auditId)
    expect(await liveMirrors('user_a')).toHaveLength(0)
  })

  it('undo is stale after another member edits, and their edit stands', async () => {
    const t = await goaTrip()
    await claimInvite('user_b', t.token, { memberId: t.asha })
    const { data, auditId } = await createGroupExpense('user_a', t.groupId, dinner(t))
    await updateGroupExpense('user_b', t.groupId, data.id, dinner(t, {
      amountPaise: 120_000, payers: [{ memberId: t.me, paidPaise: 80_000 }, { memberId: t.ravi, paidPaise: 40_000 }],
    }))
    await expect(undo('user_a', auditId)).rejects.toMatchObject({ code: 'undo_stale', status: 409 })
    expect((await liveMirrors('user_b')).map((m) => m.personalShare)).toEqual([40_000])
  })

  it('split_mismatch names the remaining amount; categories must be standard expense ones', async () => {
    const t = await goaTrip()
    await expect(createGroupExpense('user_a', t.groupId, dinner(t, { payers: [{ memberId: t.me, paidPaise: 80_000 }] })))
      .rejects.toMatchObject({ code: 'split_mismatch', status: 422, field: 'payers', message: '₹100 of the bill still needs a payer.' })
    const salary = (await builtinCategory('Salary', 'income')).id
    const settleUp = (await builtinCategory('Settle up')).id
    for (const categoryId of [salary, settleUp]) {
      await expect(createGroupExpense('user_a', t.groupId, dinner(t, { categoryId }))).rejects.toMatchObject({ status: 422, field: 'categoryId' })
    }
  })

  it('balances: multi-payer subset expense → nets and two payments, matching the SQL position', async () => {
    const t = await goaTrip()
    await createGroupExpense('user_a', t.groupId, dinner(t))
    const b = await getGroupBalances('user_a', t.groupId)
    expect(Object.fromEntries(b.nets.map((n) => [n.memberId, n.netPaise])))
      .toEqual({ [t.me]: 20_000, [t.asha]: -30_000, [t.ravi]: 10_000, [t.dev]: 0 })
    expect(b.payments.map(({ from, to, amountPaise }) => ({ from, to, amountPaise }))).toEqual([
      { from: t.asha, to: t.me, amountPaise: 20_000 },
      { from: t.asha, to: t.ravi, amountPaise: 10_000 },
    ])
    expect((await listGroups('user_a'))[0].myPositionPaise).toBe(20_000)
  })

  it('only the creator removes members, and never someone with a balance', async () => {
    const t = await goaTrip()
    await claimInvite('user_b', t.token, { memberId: t.asha })
    await createGroupExpense('user_a', t.groupId, dinner(t))
    await expect(removeMember('user_b', t.groupId, t.dev)).rejects.toMatchObject({ code: 'creator_only', status: 403 })
    await expect(removeMember('user_a', t.groupId, t.asha)).rejects.toMatchObject({ code: 'member_has_balance', status: 409 })
    await expect(removeMember('user_a', t.groupId, t.dev)).resolves.toEqual({ data: { id: t.dev } })
  })

  it('adding a person can be undone until they join; names are unique per group', async () => {
    const t = await goaTrip()
    await expect(addPlaceholder('user_a', t.groupId, { displayName: 'asha' })).rejects.toMatchObject({ code: 'duplicate_member', status: 409 })
    const kiran = await addPlaceholder('user_a', t.groupId, { displayName: 'Kiran' })
    await undo('user_a', kiran.auditId)
    expect((await getGroup('user_a', t.groupId)).members.map((m) => m.displayName)).not.toContain('Kiran')
    const neha = await addPlaceholder('user_a', t.groupId, { displayName: 'Neha' })
    await claimInvite('user_c', t.token, { memberId: neha.data.id })
    await expect(undo('user_a', neha.auditId)).rejects.toMatchObject({ code: 'undo_conflict', status: 409 })
  })
})
