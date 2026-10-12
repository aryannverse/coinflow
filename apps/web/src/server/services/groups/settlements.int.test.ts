import { and, eq, isNull } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { builtinCategory, makeUser, resetDb } from '@test/int/helpers'
import { getDb } from '@/server/db/client'
import { notifications, settlements, transactions } from '@/server/db/schema'
import { undo } from '../audit'
import { getGroupBalances } from './balances'
import { createGroupExpense } from './expenses'
import { createGroup } from './groups'
import { claimInvite, getInvite } from './invites'
import { markSettlement, resolveSettlement } from './settlements'

const tokenOf = (url: string) => url.split('/join/')[1]
const settleMirrors = (userId: string) =>
  getDb().select().from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.source, 'settlement'), isNull(transactions.deletedAt)))
const kinds = async (userId: string) => (await getDb().select().from(notifications).where(eq(notifications.userId, userId))).map((n) => n.kind)
const pay = <T extends { from: string; to: string; amountPaise: number }>(ps: T[]) => ps.map(({ from, to, amountPaise }) => ({ from, to, amountPaise }))

describe('settlements', () => {
  let food: string
  beforeEach(async () => {
    await resetDb()
    await makeUser('user_a', { name: 'Yash' })
    await makeUser('user_b', { name: 'Asha B' })
    food = (await builtinCategory('Food & Dining')).id
  })

  /** Asha (user_b) owes me ₹200 and Ravi ₹100 after a ₹900 dinner (I paid ₹500, Ravi ₹400; me/Asha/Ravi ₹300 each). */
  async function setup() {
    const { data } = await createGroup('user_a', { name: 'Goa', placeholders: [{ displayName: 'Asha' }, { displayName: 'Ravi' }, { displayName: 'Dev' }] })
    const id = (n: string) => data.members.find((m) => m.displayName === n)!.id
    const t = { groupId: data.id, me: data.myMemberId, asha: id('Asha'), ravi: id('Ravi'), dev: id('Dev') }
    await claimInvite('user_b', tokenOf((await getInvite('user_a', t.groupId)).url), { memberId: t.asha })
    await createGroupExpense('user_a', t.groupId, {
      description: 'Dinner', amountPaise: 90_000, categoryId: food,
      payers: [{ memberId: t.me, paidPaise: 50_000 }, { memberId: t.ravi, paidPaise: 40_000 }],
      split: { mode: 'equal', memberIds: [t.me, t.asha, t.ravi] },
    })
    return t
  }

  it('mark → payee notified → confirm → mirrors, balances, and the payer is told', async () => {
    const t = await setup()
    const { data: s, auditId } = await markSettlement('user_b', t.groupId, { fromMemberId: t.asha, toMemberId: t.me, amountPaise: 20_000 })
    expect(s.status).toBe('pending')
    expect(auditId).toEqual(expect.any(String))
    const [request] = await getDb().select().from(notifications)
      .where(and(eq(notifications.userId, 'user_a'), eq(notifications.kind, 'settlement_marked')))
    expect(request.payload).toMatchObject({ settlementId: s.id, amountPaise: 20_000 })

    let b = await getGroupBalances('user_a', t.groupId)
    expect(b.pending.map((p) => p.id)).toEqual([s.id])
    expect(b.nets.find((n) => n.memberId === t.asha)?.netPaise).toBe(-30_000) // pending changes nothing

    await resolveSettlement('user_a', s.id, 'confirmed')
    expect((await settleMirrors('user_b')).map((m) => [m.type, m.amount, m.personalShare])).toEqual([['expense', 20_000, 0]])
    expect((await settleMirrors('user_a')).map((m) => [m.type, m.amount, m.personalShare])).toEqual([['income', 20_000, 20_000]])
    b = await getGroupBalances('user_a', t.groupId)
    expect(b.nets.find((n) => n.memberId === t.asha)?.netPaise).toBe(-10_000)
    expect(pay(b.payments)).toEqual([{ from: t.asha, to: t.ravi, amountPaise: 10_000 }])
    expect(await kinds('user_b')).toContain('settlement_confirmed')
    const [acted] = await getDb().select().from(notifications).where(eq(notifications.id, request.id))
    expect(acted.actedAt).not.toBeNull()
  })

  it('only the payee answers, and only once', async () => {
    const t = await setup()
    const { data: s } = await markSettlement('user_b', t.groupId, { fromMemberId: t.asha, toMemberId: t.me, amountPaise: 20_000 })
    await expect(resolveSettlement('user_b', s.id, 'confirmed')).rejects.toMatchObject({ code: 'not_payee', status: 403 })
    await resolveSettlement('user_a', s.id, 'confirmed')
    await expect(resolveSettlement('user_a', s.id, 'rejected')).rejects.toMatchObject({ code: 'settlement_state', status: 409 })
  })

  it('reject tells the payer and moves no money', async () => {
    const t = await setup()
    const { data: s } = await markSettlement('user_b', t.groupId, { fromMemberId: t.asha, toMemberId: t.me, amountPaise: 20_000 })
    await resolveSettlement('user_a', s.id, 'rejected')
    expect(await kinds('user_b')).toContain('settlement_rejected')
    expect(await settleMirrors('user_b')).toHaveLength(0)
  })

  it('undoing a pending mark removes it and the payee’s request', async () => {
    const t = await setup()
    const { data: s, auditId } = await markSettlement('user_b', t.groupId, { fromMemberId: t.asha, toMemberId: t.me, amountPaise: 20_000 })
    await undo('user_b', auditId as string)
    expect(await getDb().select().from(settlements).where(eq(settlements.id, s.id))).toEqual([])
    expect(await kinds('user_a')).not.toContain('settlement_marked')
  })

  it('undoing a mark the payee already confirmed is refused', async () => {
    const t = await setup()
    const { data: s, auditId } = await markSettlement('user_b', t.groupId, { fromMemberId: t.asha, toMemberId: t.me, amountPaise: 20_000 })
    await resolveSettlement('user_a', s.id, 'confirmed')
    await expect(undo('user_b', auditId as string)).rejects.toMatchObject({ code: 'settlement_state', status: 409 })
    expect(await settleMirrors('user_b')).toHaveLength(1)
  })

  it('the payee can record cash from someone who has not joined: confirmed at once, no undo', async () => {
    const t = await setup()
    await createGroupExpense('user_a', t.groupId, {
      description: 'Chai', amountPaise: 20_000, categoryId: food,
      payers: [{ memberId: t.me, paidPaise: 20_000 }], split: { mode: 'equal', memberIds: [t.me, t.dev] },
    })
    const r = await markSettlement('user_a', t.groupId, { fromMemberId: t.dev, toMemberId: t.me, amountPaise: 10_000 })
    expect(r).toMatchObject({ data: { status: 'confirmed' }, auditId: null })
    expect((await settleMirrors('user_a')).map((m) => [m.type, m.amount])).toEqual([['income', 10_000]])
  })

  it('a member can only mark their own payments', async () => {
    const t = await setup()
    await expect(markSettlement('user_b', t.groupId, { fromMemberId: t.ravi, toMemberId: t.me, amountPaise: 10_000 }))
      .rejects.toMatchObject({ status: 422, field: 'fromMemberId' })
  })
})
