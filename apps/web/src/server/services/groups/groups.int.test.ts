import { and, eq, isNull } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { getDb } from '@/server/db/client'
import { groupActivity, groupExpenses, groups, notifications, settlements, transactions } from '@/server/db/schema'
import { recordAudit, undo } from '../audit'
import { createCheckin } from '../checkins'
import { getSafeToSpend } from '../safe-to-spend'
import { getGroupBalances } from './balances'
import { createGroupExpense, deleteGroupExpense, updateGroupExpense } from './expenses'
import { archiveGroup, createGroup, getGroup, listGroups } from './groups'
import { claimInvite, getInvite, inviteToken, previewInvite, regenerateInvite } from './invites'
import { addPlaceholder, removeMember, updateMember } from './members'
import { memberNets } from './nets'
import { loadSnapshot } from './rows'
import { markSettlement, resolveSettlement } from './settlements'

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

  // ── Final-review fixes ──────────────────────────────────────────────────────────────────────────

  it('undo waits for the group lock, so a co-member edit committed meanwhile makes it stale (Review Focus #3)', async () => {
    const t = await goaTrip()
    await claimInvite('user_b', t.token, { memberId: t.asha })
    const { data, auditId } = await createGroupExpense('user_a', t.groupId, dinner(t))
    let pending!: Promise<unknown>
    // Asha's edit is in flight: it holds the group lock (as every group write does) when the undo arrives.
    await getDb().transaction(async (tx) => {
      await tx.select({ id: groups.id }).from(groups).where(eq(groups.id, t.groupId)).for('update')
      pending = undo('user_a', auditId).then(() => 'undone', (err: unknown) => err)
      await new Promise((r) => setTimeout(r, 300)) // the undo has run its checks by now, or is waiting for the lock
      const before = await loadSnapshot(tx, data.id)
      await tx.update(groupExpenses).set({ description: 'Dinner at Thalassa' }).where(eq(groupExpenses.id, data.id))
      await recordAudit(tx, { userId: 'user_b', entity: 'group_expense', entityId: data.id, action: 'update', before, after: await loadSnapshot(tx, data.id) })
    })
    expect(await pending).toMatchObject({ code: 'undo_stale', status: 409 })
    const [row] = await getDb().select().from(groupExpenses).where(eq(groupExpenses.id, data.id))
    expect(row).toMatchObject({ description: 'Dinner at Thalassa', deletedAt: null }) // her edit stands
  })

  it('undoing a member add that an expense now uses is a plain undo_conflict, not a server error', async () => {
    const t = await goaTrip()
    const kiran = await addPlaceholder('user_a', t.groupId, { displayName: 'Kiran' })
    await createGroupExpense('user_a', t.groupId, dinner(t, { split: { mode: 'equal', memberIds: [t.me, kiran.data.id, t.ravi] } }))
    await expect(undo('user_a', kiran.auditId)).rejects.toMatchObject({ code: 'undo_conflict', status: 409, message: expect.stringContaining('Kiran') })
  })

  it('nobody with a payment still waiting to be confirmed can be removed, either side of it', async () => {
    const t = await goaTrip()
    await claimInvite('user_b', t.token, { memberId: t.asha })
    await markSettlement('user_b', t.groupId, { fromMemberId: t.asha, toMemberId: t.me, amountPaise: 10_000 }) // Asha's net is 0
    await markSettlement('user_a', t.groupId, { fromMemberId: t.me, toMemberId: t.dev, amountPaise: 5_000 }) // to a placeholder
    await expect(removeMember('user_a', t.groupId, t.asha))
      .rejects.toMatchObject({ code: 'member_has_balance', status: 409, message: expect.stringContaining('₹100') })
    await expect(removeMember('user_a', t.groupId, t.dev))
      .rejects.toMatchObject({ code: 'member_has_balance', status: 409, message: expect.stringContaining('₹50') })
  })

  it('undoing an edit can’t bring back someone who has been removed since', async () => {
    const t = await goaTrip()
    const { data } = await createGroupExpense('user_a', t.groupId, dinner(t, {
      amountPaise: 120_000, payers: [{ memberId: t.me, paidPaise: 80_000 }, { memberId: t.ravi, paidPaise: 40_000 }],
      split: { mode: 'equal', memberIds: [t.me, t.asha, t.ravi, t.dev] },
    }))
    const { auditId } = await updateGroupExpense('user_a', t.groupId, data.id, dinner(t)) // Dev edited out: net 0
    await removeMember('user_a', t.groupId, t.dev)
    await expect(undo('user_a', auditId)).rejects.toMatchObject({ code: 'undo_conflict', status: 409, message: expect.stringContaining('Dev') })
    expect((await memberNets(getDb(), [t.dev])).get(t.dev)).toBe(0)
  })

  it('“I’m not listed” under a name that is already here is refused with a pointer to that name', async () => {
    const t = await goaTrip()
    await expect(claimInvite('user_b', t.token, { newName: ' ravi ' })).rejects.toMatchObject({
      code: 'duplicate_member', status: 409, field: 'newName', message: 'There’s already a Ravi here — is that you? Pick the name above.',
    })
    expect((await getGroup('user_a', t.groupId)).members.filter((m) => m.displayName.toLowerCase() === 'ravi')).toHaveLength(1)
  })

  it('only the creator or whoever added a placeholder sets its UPI ID; changes are in the feed and the payer sees who set it', async () => {
    const t = await goaTrip()
    await claimInvite('user_b', t.token, { memberId: t.asha })
    await expect(updateMember('user_b', t.groupId, t.dev, { upiId: 'mine@okaxis' })).rejects.toMatchObject({ code: 'creator_only', status: 403 })
    await updateMember('user_b', t.groupId, t.dev, { displayName: 'Dev K' }) // renaming is still anyone's
    const kiran = await addPlaceholder('user_b', t.groupId, { displayName: 'Kiran' })
    await updateMember('user_b', t.groupId, kiran.data.id, { upiId: 'kiran@okhdfc' })
    await updateMember('user_a', t.groupId, t.dev, { upiId: 'dev@oksbi' })
    const members = (await getGroup('user_a', t.groupId)).members
    expect(members.find((m) => m.id === kiran.data.id)).toMatchObject({ upiId: 'kiran@okhdfc', upiSetByName: 'Asha' })
    expect(members.find((m) => m.id === t.dev)).toMatchObject({ upiId: 'dev@oksbi', upiSetByName: 'Yash' })
    const feed = await getDb().select().from(groupActivity).where(and(eq(groupActivity.groupId, t.groupId), eq(groupActivity.kind, 'member_updated')))
    expect(feed.map((a) => a.summary).sort()).toEqual(['Asha set Kiran’s UPI ID', 'Yash set Dev K’s UPI ID'])
  })

  it('a group with money still open can’t be archived; an archived one is read-only and listed only as archived', async () => {
    const t = await goaTrip()
    await claimInvite('user_b', t.token, { memberId: t.asha })
    await createGroupExpense('user_a', t.groupId, {
      description: 'Chai', amountPaise: 20_000, categoryId: food,
      payers: [{ memberId: t.me, paidPaise: 20_000 }], split: { mode: 'equal', memberIds: [t.me, t.asha] },
    })
    await expect(archiveGroup('user_a', t.groupId)).rejects.toMatchObject({ code: 'group_unsettled', status: 409, message: expect.stringContaining('Asha') })
    const { data: s } = await markSettlement('user_b', t.groupId, { fromMemberId: t.asha, toMemberId: t.me, amountPaise: 10_000 })
    await expect(archiveGroup('user_a', t.groupId)).rejects.toMatchObject({ code: 'group_unsettled', status: 409, message: expect.stringContaining('waiting') })
    await resolveSettlement('user_a', s.id, 'confirmed')
    await archiveGroup('user_a', t.groupId)

    expect(await listGroups('user_a')).toEqual([])
    const { data: other } = await createGroup('user_a', { name: 'Flat', placeholders: [] })
    expect((await listGroups('user_a', { archived: true })).map((g) => g.id)).toEqual([t.groupId])
    expect((await listGroups('user_a')).map((g) => g.id)).toEqual([other.id])
    expect((await getGroup('user_b', t.groupId)).archivedAt).not.toBeNull() // reads still work
    for (const write of [
      () => createGroupExpense('user_b', t.groupId, dinner(t)),
      () => addPlaceholder('user_a', t.groupId, { displayName: 'Kiran' }),
      () => markSettlement('user_b', t.groupId, { fromMemberId: t.asha, toMemberId: t.me, amountPaise: 100 }),
      () => regenerateInvite('user_a', t.groupId),
      () => archiveGroup('user_a', t.groupId),
    ]) {
      await expect(write()).rejects.toMatchObject({ code: 'group_archived', status: 409 })
    }
    expect(await getDb().select().from(settlements).where(eq(settlements.groupId, t.groupId))).toHaveLength(1)
  })

  it('an INVITE_SECRET shorter than 32 characters is refused, as .env.example says', () => {
    const saved = process.env.INVITE_SECRET
    try {
      process.env.INVITE_SECRET = 'x'.repeat(31)
      expect(() => inviteToken('00000000-0000-4000-8000-000000000000')).toThrow(expect.objectContaining({ code: 'invite_unconfigured' }))
      process.env.INVITE_SECRET = 'x'.repeat(32)
      expect(inviteToken('00000000-0000-4000-8000-000000000000')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    } finally {
      process.env.INVITE_SECRET = saved
    }
  })
})
