import 'server-only'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { formatINR } from '@/lib/money'
import { groupExpenseInputSchema, type GroupExpenseBody, type GroupExpenseInput } from '@/lib/schemas/groups'
import { checkPayers, computeSplit, SplitMismatchError, type ShareRow } from '@/lib/split'
import { getDb, type Tx } from '@/server/db/client'
import { categories, groupExpenses, type Group, type GroupMember } from '@/server/db/schema'
import { AppError, invalid, notFound } from '@/server/errors'
import { recordAudit } from '../audit'
import { notify } from '../notifications'
import { recordActivity } from './activity'
import { syncExpenseMirrors } from './mirrors'
import { requireMember } from './permissions'
import {
  activeIds, decodeCursor, encodeCursor, expenseViews, listMemberRows, loadSnapshot, writeChildren, type ExpenseSnapshot,
} from './rows'
import type { GroupExpenseView } from './types'

const splitError = (e: SplitMismatchError) => new AppError('split_mismatch', e.message, 422, e.field)

/** Everyone named must be an active member, and nobody twice in one list. */
function checkPeople(input: GroupExpenseInput, active: Set<string>): void {
  const lists: [string, string[]][] = [['payers', input.payers.map((p) => p.memberId)]]
  const s = input.split
  if (s.mode === 'equal') lists.push(['split.memberIds', s.memberIds])
  else if (s.mode === 'itemized') s.items.forEach((it, i) => lists.push([`split.items.${i}.memberIds`, it.memberIds]))
  else lists.push(['split.entries', s.entries.map((e) => e.memberId)])
  for (const [field, ids] of lists) {
    if (new Set(ids).size !== ids.length) throw invalid(field, 'Someone is listed twice.')
    if (ids.some((id) => !active.has(id))) throw invalid(field, 'Someone in this expense isn’t in the group any more.')
  }
}

/** Built-in, non-system expense categories only, so every member's mirror has a category they can see (plan A6). */
async function requireGroupCategory(tx: Tx, categoryId: string): Promise<void> {
  const [cat] = await tx.select().from(categories).where(eq(categories.id, categoryId))
  if (!cat || cat.userId !== null || cat.kind !== 'expense' || cat.system) {
    throw invalid('categoryId', 'Pick one of the standard expense categories.')
  }
}

function computeShares(input: GroupExpenseInput, order: string[]): ShareRow[] {
  try {
    checkPayers(input.amountPaise, input.payers)
    return computeSplit(input.amountPaise, input.split, order)
  } catch (e) {
    if (e instanceof SplitMismatchError) throw splitError(e)
    throw e
  }
}

const columns = (input: GroupExpenseInput) => ({
  description: input.description,
  amountPaise: input.amountPaise,
  categoryId: input.categoryId,
  occurredAt: input.occurredAt,
  splitMode: input.split.mode,
  taxPaise: input.split.mode === 'itemized' ? input.split.taxPaise : 0,
  tipPaise: input.split.mode === 'itemized' ? input.split.tipPaise : 0,
  discountPaise: input.split.mode === 'itemized' ? input.split.discountPaise : 0,
})
const itemsOf = (input: GroupExpenseInput) => (input.split.mode === 'itemized' ? input.split.items.map((it, i) => ({ ...it, sort: i })) : [])

const involved = (snap: ExpenseSnapshot) => new Set([
  ...snap.payers.filter((p) => p.paidPaise > 0).map((p) => p.memberId),
  ...snap.shares.filter((s) => s.sharePaise > 0).map((s) => s.memberId),
])

/** Spec §3.4: expense_added / expense_edited to involved members other than the actor. */
async function tellInvolved(tx: Tx, a: {
  group: Group; actor: GroupMember; members: GroupMember[]; snaps: ExpenseSnapshot[]; kind: 'expense_added' | 'expense_edited'; title: string
}): Promise<void> {
  const ids = new Set(a.snaps.flatMap((s) => [...involved(s)]))
  const latest = a.snaps[a.snaps.length - 1]
  await notify(tx, a.members
    .filter((m) => ids.has(m.id) && m.userId && m.userId !== a.actor.userId && !m.removedAt)
    .map((m) => {
      const share = latest.expense.deletedAt ? 0 : (latest.shares.find((s) => s.memberId === m.id)?.sharePaise ?? 0)
      return {
        userId: m.userId as string, kind: a.kind, title: a.title,
        body: `${a.group.name} · Your share: ${formatINR(share)}`,
        href: `/groups/${a.group.id}?tab=expenses#expense-${latest.expense.id}`,
        payload: { groupId: a.group.id, expenseId: latest.expense.id },
      }
    }))
}

async function view(tx: Tx, snap: ExpenseSnapshot, me: GroupMember): Promise<GroupExpenseView> {
  const [v] = await expenseViews(tx, [snap.expense], me.id)
  return v
}

export async function createGroupExpense(
  userId: string, groupId: string, body: GroupExpenseBody, opts: { actor?: 'user' | 'agent' } = {},
): Promise<{ data: GroupExpenseView; auditId: string }> {
  const input = groupExpenseInputSchema.parse(body)
  return getDb().transaction(async (tx) => {
    const { group, me } = await requireMember(userId, groupId, tx, { lock: true })
    const members = await listMemberRows(tx, groupId)
    checkPeople(input, activeIds(members))
    await requireGroupCategory(tx, input.categoryId)
    const shares = computeShares(input, members.map((m) => m.id))
    const [row] = await tx.insert(groupExpenses).values({ groupId, ...columns(input), createdBy: me.id, updatedBy: me.id }).returning()
    await writeChildren(tx, row.id, { payers: input.payers, shares, items: itemsOf(input) })
    await syncExpenseMirrors(tx, row.id)
    const after = (await loadSnapshot(tx, row.id)) as ExpenseSnapshot
    await recordActivity(tx, {
      groupId, actorUserId: userId, kind: 'expense_added',
      summary: `${me.displayName} added ${input.description} ${formatINR(input.amountPaise)}`, payload: { expenseId: row.id },
    })
    await tellInvolved(tx, { group, actor: me, members, snaps: [after], kind: 'expense_added', title: `${me.displayName} added ${input.description}` })
    const auditId = await recordAudit(tx, { userId, entity: 'group_expense', entityId: row.id, action: 'create', before: null, after, actor: opts.actor })
    return { data: await view(tx, after, me), auditId }
  })
}

/** PATCH takes the whole expense body; the sheet always sends all of it (plan A8). */
export async function updateGroupExpense(
  userId: string, groupId: string, expenseId: string, body: GroupExpenseBody,
): Promise<{ data: GroupExpenseView; auditId: string }> {
  const input = groupExpenseInputSchema.parse(body)
  return getDb().transaction(async (tx) => {
    const { group, me } = await requireMember(userId, groupId, tx, { lock: true })
    const before = await loadSnapshot(tx, expenseId)
    if (!before || before.expense.groupId !== groupId || before.expense.deletedAt) throw notFound('expense')
    const members = await listMemberRows(tx, groupId)
    checkPeople(input, activeIds(members))
    await requireGroupCategory(tx, input.categoryId)
    const shares = computeShares(input, members.map((m) => m.id))
    await tx.update(groupExpenses).set({ ...columns(input), updatedBy: me.id }).where(eq(groupExpenses.id, expenseId))
    await writeChildren(tx, expenseId, { payers: input.payers, shares, items: itemsOf(input) })
    await syncExpenseMirrors(tx, expenseId)
    const after = (await loadSnapshot(tx, expenseId)) as ExpenseSnapshot
    const was = before.expense.amountPaise
    const summary = was !== input.amountPaise
      ? `${me.displayName} changed ${input.description} ${formatINR(was)} → ${formatINR(input.amountPaise)}`
      : `${me.displayName} edited ${input.description}`
    await recordActivity(tx, { groupId, actorUserId: userId, kind: 'expense_edited', summary, payload: { expenseId } })
    await tellInvolved(tx, { group, actor: me, members, snaps: [before, after], kind: 'expense_edited', title: summary })
    const auditId = await recordAudit(tx, { userId, entity: 'group_expense', entityId: expenseId, action: 'update', before, after })
    return { data: await view(tx, after, me), auditId }
  })
}

export async function deleteGroupExpense(userId: string, groupId: string, expenseId: string): Promise<{ auditId: string }> {
  return getDb().transaction(async (tx) => {
    const { group, me } = await requireMember(userId, groupId, tx, { lock: true })
    const before = await loadSnapshot(tx, expenseId)
    if (!before || before.expense.groupId !== groupId || before.expense.deletedAt) throw notFound('expense')
    await tx.update(groupExpenses).set({ deletedAt: new Date(), updatedBy: me.id }).where(eq(groupExpenses.id, expenseId))
    await syncExpenseMirrors(tx, expenseId)
    const after = (await loadSnapshot(tx, expenseId)) as ExpenseSnapshot
    const summary = `${me.displayName} removed ${before.expense.description} ${formatINR(before.expense.amountPaise)}`
    await recordActivity(tx, { groupId, actorUserId: userId, kind: 'expense_deleted', summary, payload: { expenseId } })
    const members = await listMemberRows(tx, groupId)
    await tellInvolved(tx, { group, actor: me, members, snaps: [before, after], kind: 'expense_edited', title: summary })
    const auditId = await recordAudit(tx, { userId, entity: 'group_expense', entityId: expenseId, action: 'delete', before, after })
    return { auditId }
  })
}

export async function listGroupExpenses(userId: string, groupId: string, q: { cursor?: string; limit: number }) {
  const db = getDb()
  const { me } = await requireMember(userId, groupId, db)
  const cursor = decodeCursor(q.cursor)
  const rows = await db.select().from(groupExpenses)
    .where(and(
      eq(groupExpenses.groupId, groupId), isNull(groupExpenses.deletedAt),
      cursor ? sql`(${groupExpenses.occurredAt}, ${groupExpenses.id}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)` : undefined,
    ))
    .orderBy(desc(groupExpenses.occurredAt), desc(groupExpenses.id))
    .limit(q.limit + 1)
  const page = rows.slice(0, q.limit)
  const last = page[page.length - 1]
  return {
    data: await expenseViews(db, page, me.id),
    nextCursor: rows.length > q.limit && last ? encodeCursor(last.occurredAt, last.id) : null,
  }
}

export async function getGroupExpense(userId: string, groupId: string, expenseId: string): Promise<GroupExpenseView> {
  const db = getDb()
  const { me } = await requireMember(userId, groupId, db)
  const snap = await loadSnapshot(db, expenseId)
  if (!snap || snap.expense.groupId !== groupId || snap.expense.deletedAt) throw notFound('expense')
  const [v] = await expenseViews(db, [snap.expense], me.id)
  return v
}
