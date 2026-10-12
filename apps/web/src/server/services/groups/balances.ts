import 'server-only'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { computeNets, simplify, type LedgerExpense } from '@/lib/settle'
import { getDb } from '@/server/db/client'
import { groupExpensePayers, groupExpenseShares, groupExpenses, settlements } from '@/server/db/schema'
import { requireMember } from './permissions'
import { listMemberRows } from './rows'
import type { Balances } from './types'

/** Spec §2.6 + §3.7 balances: nets, simplified payments with why-chains, and pending settlements (shown, not counted). */
export async function getGroupBalances(userId: string, groupId: string): Promise<Balances> {
  const db = getDb()
  await requireMember(userId, groupId, db)
  const order = (await listMemberRows(db, groupId)).map((m) => m.id)
  const live = await db.select({ id: groupExpenses.id, description: groupExpenses.description }).from(groupExpenses)
    .where(and(eq(groupExpenses.groupId, groupId), isNull(groupExpenses.deletedAt)))
  const ids = live.map((e) => e.id)
  const payers = ids.length ? await db.select().from(groupExpensePayers).where(inArray(groupExpensePayers.expenseId, ids)) : []
  const shares = ids.length ? await db.select().from(groupExpenseShares).where(inArray(groupExpenseShares.expenseId, ids)) : []
  const ledger: LedgerExpense[] = live.map((e) => ({
    id: e.id,
    description: e.description,
    payers: payers.filter((p) => p.expenseId === e.id).map(({ memberId, paidPaise }) => ({ memberId, paidPaise })),
    shares: shares.filter((s) => s.expenseId === e.id).map(({ memberId, sharePaise }) => ({ memberId, sharePaise })),
  }))
  const all = await db.select().from(settlements).where(eq(settlements.groupId, groupId)).orderBy(desc(settlements.markedAt))
  const confirmed = all.filter((s) => s.status === 'confirmed')
    .map((s) => ({ fromMember: s.fromMember, toMember: s.toMember, amountPaise: s.amountPaise }))
  const nets = computeNets(order, ledger, confirmed)
  return {
    nets: order.map((memberId) => ({ memberId, netPaise: nets.get(memberId) ?? 0 })),
    payments: simplify(order, nets, ledger),
    pending: all.filter((s) => s.status === 'pending'),
  }
}
