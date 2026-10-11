import 'server-only'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { toISTDate } from '@/lib/dates'
import { computeSafeToSpend, type SafeToSpendResult } from '@/lib/safe-to-spend'
import { getDb } from '@/server/db/client'
import { transactions } from '@/server/db/schema'
import { notFound } from '@/server/errors'
import { getLatestCheckin } from './checkins'
import { listRecurring, materializeDueRecurring } from './recurring'
import { getUser } from './users'

const sumWhere = (cond: ReturnType<typeof and>, column = transactions.amount) =>
  getDb()
    .select({ total: sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number) })
    .from(transactions)
    .where(cond)
    .then(([r]) => r.total)

export async function getSafeToSpend(userId: string, now: Date = new Date()): Promise<SafeToSpendResult> {
  const today = toISTDate(now)
  await materializeDueRecurring(userId, today)

  const user = await getUser(userId)
  if (!user) throw notFound('account')
  const [checkin, recurring] = await Promise.all([getLatestCheckin(userId), listRecurring(userId)])

  const after = checkin
    ? (type: 'expense' | 'income', status: 'confirmed' | 'draft') =>
        and(
          eq(transactions.userId, userId), isNull(transactions.deletedAt),
          eq(transactions.type, type), eq(transactions.status, status),
          gt(transactions.occurredAt, checkin.takenAt),
        )
    : null

  const [income, expenseShare, billDrafts, incomeDrafts] = after
    ? await Promise.all([
        sumWhere(after('income', 'confirmed')),
        sumWhere(after('expense', 'confirmed'), transactions.personalShare),
        sumWhere(after('expense', 'draft')),
        sumWhere(after('income', 'draft')),
      ])
    : [0, 0, 0, 0]

  return computeSafeToSpend({
    today,
    paydayDay: user.paydayDay,
    fixedCostsEstimate: user.fixedCostsEstimate,
    receivables: 0, // Part B
    checkin: checkin ? { amount: checkin.amount } : null,
    confirmedIncomeSinceCheckin: income,
    confirmedExpenseShareSinceCheckin: expenseShare,
    pendingBillDrafts: billDrafts,
    pendingIncomeDrafts: incomeDrafts,
    recurring: recurring.map((r) => ({
      kind: r.kind, amount: r.amount, cadence: r.cadence, nextDueOn: r.nextDueOn, anchorDay: r.anchorDay, active: r.active,
    })),
  })
}
