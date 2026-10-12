import 'server-only'
import { asc, eq, inArray } from 'drizzle-orm'
import { uuid as uuidSchema } from '@/lib/schemas/common'
import type { Db, Tx } from '@/server/db/client'
import {
  categories, groupExpenseItems, groupExpensePayers, groupExpenseShares, groupExpenses, groupMembers, users,
  type GroupExpense, type GroupExpenseItem, type GroupExpensePayer, type GroupExpenseShare, type GroupMember,
} from '@/server/db/schema'
import { invalid } from '@/server/errors'
import type { GroupExpenseView, MemberView } from './types'

export type Exec = Db | Tx

/** Everything an expense is, as one JSON-able value: the audit snapshot and the undo source (spec §3.6). */
export type ExpenseSnapshot = {
  expense: GroupExpense
  payers: GroupExpensePayer[]
  shares: GroupExpenseShare[]
  items: GroupExpenseItem[]
}

export async function loadSnapshot(exec: Exec, expenseId: string): Promise<ExpenseSnapshot | null> {
  const [expense] = await exec.select().from(groupExpenses).where(eq(groupExpenses.id, expenseId))
  if (!expense) return null
  const payers = await exec.select().from(groupExpensePayers).where(eq(groupExpensePayers.expenseId, expenseId))
  const shares = await exec.select().from(groupExpenseShares).where(eq(groupExpenseShares.expenseId, expenseId))
  const items = await exec.select().from(groupExpenseItems)
    .where(eq(groupExpenseItems.expenseId, expenseId)).orderBy(asc(groupExpenseItems.sort))
  return { expense, payers, shares, items }
}

/** Replaces an expense's payers, shares and items. Zero-paid payer rows carry no meaning and are dropped. */
export async function writeChildren(tx: Tx, expenseId: string, rows: {
  payers: { memberId: string; paidPaise: number }[]
  shares: { memberId: string; sharePaise: number; inputValue: number | null }[]
  items: { id?: string; name: string; amountPaise: number; memberIds: string[]; sort?: number }[]
}): Promise<void> {
  await tx.delete(groupExpensePayers).where(eq(groupExpensePayers.expenseId, expenseId))
  await tx.delete(groupExpenseShares).where(eq(groupExpenseShares.expenseId, expenseId))
  await tx.delete(groupExpenseItems).where(eq(groupExpenseItems.expenseId, expenseId))
  const payers = rows.payers.filter((p) => p.paidPaise > 0)
  if (payers.length) {
    await tx.insert(groupExpensePayers).values(payers.map((p) => ({ expenseId, memberId: p.memberId, paidPaise: p.paidPaise })))
  }
  if (rows.shares.length) {
    await tx.insert(groupExpenseShares).values(rows.shares.map((s) => ({ expenseId, memberId: s.memberId, sharePaise: s.sharePaise, inputValue: s.inputValue })))
  }
  if (rows.items.length) {
    await tx.insert(groupExpenseItems).values(rows.items.map((it, i) => ({
      ...(it.id ? { id: it.id } : {}), expenseId, name: it.name, amountPaise: it.amountPaise, memberIds: it.memberIds, sort: it.sort ?? i,
    })))
  }
}

/** Members in join order (the split tie-break order), removed ones included for history. */
export async function listMemberRows(exec: Exec, groupId: string): Promise<GroupMember[]> {
  return exec.select().from(groupMembers)
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(asc(groupMembers.createdAt), asc(groupMembers.id))
}

export async function memberViews(exec: Exec, groupId: string, viewerId: string): Promise<MemberView[]> {
  const rows = await exec
    .select({ m: groupMembers, avatarUrl: users.avatarUrl, userUpi: users.upiId, userQr: users.upiQrUrl })
    .from(groupMembers)
    .leftJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(asc(groupMembers.createdAt), asc(groupMembers.id))
  return rows.map(({ m, avatarUrl, userUpi, userQr }) => ({
    id: m.id,
    userId: m.userId,
    displayName: m.displayName,
    claimed: m.userId !== null,
    role: m.role,
    claimedAt: m.claimedAt,
    removedAt: m.removedAt,
    createdAt: m.createdAt,
    avatarUrl: avatarUrl ?? null,
    upiId: m.userId ? (userUpi ?? null) : m.upiId,
    upiQrUrl: m.userId ? (userQr ?? null) : null,
    isMe: m.userId === viewerId,
  }))
}

export async function expenseViews(exec: Exec, expenses: GroupExpense[], myMemberId: string): Promise<GroupExpenseView[]> {
  if (expenses.length === 0) return []
  const ids = expenses.map((e) => e.id)
  const payers = await exec.select().from(groupExpensePayers).where(inArray(groupExpensePayers.expenseId, ids))
  const shares = await exec.select().from(groupExpenseShares).where(inArray(groupExpenseShares.expenseId, ids))
  const items = await exec.select().from(groupExpenseItems).where(inArray(groupExpenseItems.expenseId, ids)).orderBy(asc(groupExpenseItems.sort))
  const cats = await exec.select({ id: categories.id, name: categories.name, emoji: categories.emoji, color: categories.color })
    .from(categories).where(inArray(categories.id, [...new Set(expenses.map((e) => e.categoryId))]))
  return expenses.map((e) => {
    const p = payers.filter((x) => x.expenseId === e.id)
    const s = shares.filter((x) => x.expenseId === e.id)
    const cat = cats.find((c) => c.id === e.categoryId)
    return {
      id: e.id, groupId: e.groupId, description: e.description, amountPaise: e.amountPaise, categoryId: e.categoryId,
      category: { name: cat?.name ?? '', emoji: cat?.emoji ?? '•', color: cat?.color ?? '#9BA59F' },
      occurredAt: e.occurredAt, splitMode: e.splitMode, taxPaise: e.taxPaise, tipPaise: e.tipPaise, discountPaise: e.discountPaise,
      createdBy: e.createdBy, updatedBy: e.updatedBy, createdAt: e.createdAt, updatedAt: e.updatedAt,
      payers: p.map(({ memberId, paidPaise }) => ({ memberId, paidPaise })),
      shares: s.map(({ memberId, sharePaise, inputValue }) => ({ memberId, sharePaise, inputValue })),
      items: items.filter((x) => x.expenseId === e.id).map(({ id, name, amountPaise, memberIds }) => ({ id, name, amountPaise, memberIds })),
      myPaidPaise: p.find((x) => x.memberId === myMemberId)?.paidPaise ?? 0,
      mySharePaise: s.find((x) => x.memberId === myMemberId)?.sharePaise ?? 0,
    }
  })
}

export const encodeCursor = (at: Date, id: string) => Buffer.from(`${at.toISOString()}|${id}`).toString('base64url')

export function decodeCursor(cursor: string | undefined): { at: Date; id: string } | null {
  if (!cursor) return null
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
    const at = new Date(iso)
    if (!Number.isNaN(at.getTime()) && uuidSchema.safeParse(id).success) return { at, id }
  } catch {
    // fall through
  }
  throw invalid('cursor', 'That page link has expired — refresh the list.')
}

/** Inactive members can still appear in history; only active ones may be put on a new or edited expense. */
export const activeIds = (members: GroupMember[]) => new Set(members.filter((m) => !m.removedAt).map((m) => m.id))
export const byMemberId = (members: GroupMember[]) => new Map(members.map((m) => [m.id, m]))
