import 'server-only'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { getDb } from '@/server/db/client'
import { groupExpensePayers, groupExpenseShares, groupExpenses, groupMembers, settlements } from '@/server/db/schema'
import type { Exec } from './rows'

const total = (col: AnyPgColumn) => sql<number>`coalesce(sum(${col}), 0)`.mapWith(Number)

/** SQL twin of `computeNets` (src/lib/settle.ts): paid − share + settlements paid − settlements received (confirmed). */
export async function memberNets(exec: Exec, memberIds: string[]): Promise<Map<string, number>> {
  const nets = new Map(memberIds.map((id) => [id, 0]))
  if (memberIds.length === 0) return nets
  const bump = (rows: { memberId: string; total: number }[], sign: 1 | -1) => {
    for (const r of rows) nets.set(r.memberId, (nets.get(r.memberId) ?? 0) + sign * r.total)
  }
  const live = isNull(groupExpenses.deletedAt)
  bump(await exec.select({ memberId: groupExpensePayers.memberId, total: total(groupExpensePayers.paidPaise) })
    .from(groupExpensePayers)
    .innerJoin(groupExpenses, and(eq(groupExpenses.id, groupExpensePayers.expenseId), live))
    .where(inArray(groupExpensePayers.memberId, memberIds))
    .groupBy(groupExpensePayers.memberId), 1)
  bump(await exec.select({ memberId: groupExpenseShares.memberId, total: total(groupExpenseShares.sharePaise) })
    .from(groupExpenseShares)
    .innerJoin(groupExpenses, and(eq(groupExpenses.id, groupExpenseShares.expenseId), live))
    .where(inArray(groupExpenseShares.memberId, memberIds))
    .groupBy(groupExpenseShares.memberId), -1)
  const confirmed = eq(settlements.status, 'confirmed')
  bump(await exec.select({ memberId: settlements.fromMember, total: total(settlements.amountPaise) })
    .from(settlements).where(and(confirmed, inArray(settlements.fromMember, memberIds))).groupBy(settlements.fromMember), 1)
  bump(await exec.select({ memberId: settlements.toMember, total: total(settlements.amountPaise) })
    .from(settlements).where(and(confirmed, inArray(settlements.toMember, memberIds))).groupBy(settlements.toMember), -1)
  return nets
}

/** One position per membership the user holds (spec §2.4 G). */
export async function groupPositionsForUser(userId: string, exec: Exec = getDb()): Promise<number[]> {
  const mine = await exec.select({ id: groupMembers.id }).from(groupMembers).where(eq(groupMembers.userId, userId))
  return [...(await memberNets(exec, mine.map((m) => m.id))).values()]
}
