import 'server-only'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import type { Tx } from '@/server/db/client'
import {
  categories, groupExpensePayers, groupExpenseShares, groupExpenses, groupMembers, groups, settlements, transactions,
} from '@/server/db/schema'

type Want = {
  type: 'expense' | 'income'; amount: number; personalShare: number; categoryId: string
  note: string; method: 'upi' | 'other'; occurredAt: Date
}

/**
 * Makes a source row's live mirrors equal `desired` (one per user): update the ones that stay, insert the missing,
 * soft-delete the rest. Idempotent, so create, edit, delete, undo and claim all call the same function.
 * Always runs inside the transaction that changed the source (spec §2.2 "same DB transaction").
 */
async function reconcile(
  tx: Tx, link: { groupExpenseId: string } | { settlementId: string }, desired: Map<string, Want>, now: Date,
): Promise<void> {
  const linkCond = 'groupExpenseId' in link
    ? eq(transactions.groupExpenseId, link.groupExpenseId)
    : eq(transactions.settlementId, link.settlementId)
  const live = await tx.select().from(transactions).where(and(linkCond, isNull(transactions.deletedAt))).for('update')
  const left = new Map(desired)
  for (const row of live) {
    const want = left.get(row.userId)
    if (!want) {
      await tx.update(transactions).set({ deletedAt: now }).where(eq(transactions.id, row.id))
      continue
    }
    left.delete(row.userId)
    await tx.update(transactions).set({ ...want, updatedAt: now }).where(eq(transactions.id, row.id))
  }
  for (const [userId, want] of left) {
    await tx.insert(transactions).values({
      userId, ...want, status: 'confirmed',
      source: 'groupExpenseId' in link ? 'group' : 'settlement',
      ...('groupExpenseId' in link ? { groupExpenseId: link.groupExpenseId } : { settlementId: link.settlementId }),
    })
  }
}

/** Expense mirror per claimed member involved: amount = cash they paid (may be 0), personalShare = their share. */
export async function syncExpenseMirrors(tx: Tx, expenseId: string, now: Date = new Date()): Promise<void> {
  const [expense] = await tx.select().from(groupExpenses).where(eq(groupExpenses.id, expenseId))
  if (!expense) return
  const desired = new Map<string, Want>()
  if (!expense.deletedAt) {
    const members = await tx.select({ id: groupMembers.id, userId: groupMembers.userId })
      .from(groupMembers).where(eq(groupMembers.groupId, expense.groupId))
    const userOf = new Map(members.filter((m) => m.userId).map((m) => [m.id, m.userId as string]))
    const bump = (memberId: string, field: 'amount' | 'personalShare', v: number) => {
      const userId = userOf.get(memberId)
      if (!userId || v === 0) return // placeholders are not users (spec §2.4)
      const row = desired.get(userId) ?? {
        type: 'expense' as const, amount: 0, personalShare: 0, categoryId: expense.categoryId,
        note: expense.description, method: 'other' as const, occurredAt: expense.occurredAt,
      }
      row[field] += v
      desired.set(userId, row)
    }
    for (const p of await tx.select().from(groupExpensePayers).where(eq(groupExpensePayers.expenseId, expenseId))) bump(p.memberId, 'amount', p.paidPaise)
    for (const s of await tx.select().from(groupExpenseShares).where(eq(groupExpenseShares.expenseId, expenseId))) bump(s.memberId, 'personalShare', s.sharePaise)
  }
  await reconcile(tx, { groupExpenseId: expenseId }, desired, now)
}

async function settleCategoryIds(tx: Tx): Promise<{ expense: string; income: string }> {
  const rows = await tx.select({ id: categories.id, kind: categories.kind }).from(categories)
    .where(and(isNull(categories.userId), eq(categories.system, true)))
  const expense = rows.find((r) => r.kind === 'expense')?.id
  const income = rows.find((r) => r.kind === 'income')?.id
  if (!expense || !income) throw new Error('The “Settle up” categories are missing — run pnpm db:migrate')
  return { expense, income }
}

/** Confirmed settlement: the payer gets an expense (amount X, share 0), the payee an income X. Otherwise, no mirrors. */
export async function syncSettlementMirrors(tx: Tx, settlementId: string, now: Date = new Date()): Promise<void> {
  const [s] = await tx.select().from(settlements).where(eq(settlements.id, settlementId))
  if (!s) return
  const desired = new Map<string, Want>()
  if (s.status === 'confirmed') {
    const [g] = await tx.select({ name: groups.name }).from(groups).where(eq(groups.id, s.groupId))
    const people = await tx.select().from(groupMembers).where(inArray(groupMembers.id, [s.fromMember, s.toMember]))
    const from = people.find((m) => m.id === s.fromMember)
    const to = people.find((m) => m.id === s.toMember)
    const cats = await settleCategoryIds(tx)
    const when = s.resolvedAt ?? now
    if (from?.userId) {
      desired.set(from.userId, {
        type: 'expense', amount: s.amountPaise, personalShare: 0, categoryId: cats.expense,
        note: `Paid ${to?.displayName ?? 'someone'} · ${g?.name ?? 'group'}`, method: 'upi', occurredAt: when,
      })
    }
    if (to?.userId) {
      desired.set(to.userId, {
        type: 'income', amount: s.amountPaise, personalShare: s.amountPaise, categoryId: cats.income,
        note: `From ${from?.displayName ?? 'someone'} · ${g?.name ?? 'group'}`, method: 'upi', occurredAt: when,
      })
    }
  }
  await reconcile(tx, { settlementId }, desired, now)
}

/** After a claim: give the new user mirrors for everything their placeholder already took part in (spec §2.2). */
export async function backfillMemberMirrors(tx: Tx, memberId: string, now: Date = new Date()): Promise<void> {
  const paid = await tx.select({ id: groupExpensePayers.expenseId }).from(groupExpensePayers).where(eq(groupExpensePayers.memberId, memberId))
  const shared = await tx.select({ id: groupExpenseShares.expenseId }).from(groupExpenseShares).where(eq(groupExpenseShares.memberId, memberId))
  for (const id of new Set([...paid, ...shared].map((r) => r.id))) await syncExpenseMirrors(tx, id, now)
  const settled = await tx.select({ id: settlements.id }).from(settlements)
    .where(and(eq(settlements.status, 'confirmed'), or(eq(settlements.fromMember, memberId), eq(settlements.toMember, memberId))))
  for (const { id } of settled) await syncSettlementMirrors(tx, id, now)
}
