import 'server-only'
import { and, eq, gt, gte, isNull, or, sql } from 'drizzle-orm'
import { istStartOfDay, toISTDate } from '@/lib/dates'
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

  /**
   * What the check-in balance does not yet reflect (spec §4.11).
   * Confirmed rows: stamped after the check-in, or logged after it with a time the client rounded down to the
   * minute (or a slightly slow clock). A back-dated row from before that minute is already in the balance.
   * Drafts: due on or after the check-in's IST day, so a bill due today still counts after a later check-in.
   * Confirmed recurring rows follow the draft rule: confirming a due-today draft must not change the amount, so
   * the confirmed row keeps counting from the check-in's IST day (its occurredAt is the 12:00 IST due stamp).
   */
  const since = checkin
    ? (type: 'expense' | 'income', status: 'confirmed' | 'draft') => {
        const { takenAt } = checkin
        const takenMinute = new Date(Math.floor(takenAt.getTime() / 60_000) * 60_000) // date_trunc('minute'); IST is minute-aligned
        const checkinDayStart = istStartOfDay(toISTDate(takenAt))
        const boundary = status === 'draft'
          ? gte(transactions.occurredAt, checkinDayStart)
          : or(
              gt(transactions.occurredAt, takenAt),
              and(gt(transactions.createdAt, takenAt), gte(transactions.occurredAt, takenMinute)),
              and(eq(transactions.source, 'recurring'), gte(transactions.occurredAt, checkinDayStart)),
            )
        return and(
          eq(transactions.userId, userId), isNull(transactions.deletedAt),
          eq(transactions.type, type), eq(transactions.status, status), boundary,
        )
      }
    : null

  const [income, expenseShare, billDrafts, incomeDrafts] = since
    ? await Promise.all([
        sumWhere(since('income', 'confirmed')),
        sumWhere(since('expense', 'confirmed'), transactions.personalShare),
        sumWhere(since('expense', 'draft')),
        sumWhere(since('income', 'draft')),
      ])
    : [0, 0, 0, 0]

  return computeSafeToSpend({
    today,
    paydayDay: user.paydayDay,
    fixedCostsEstimate: user.fixedCostsEstimate,
    receivables: 0, // Part B
    checkin: checkin ? { amount: checkin.amount } : null,
    confirmedIncomeSinceCheckin: income,
    confirmedExpenseCashSinceCheckin: expenseShare,
    pendingBillDrafts: billDrafts,
    pendingIncomeDrafts: incomeDrafts,
    recurring: recurring.map((r) => ({
      kind: r.kind, amount: r.amount, cadence: r.cadence, nextDueOn: r.nextDueOn, anchorDay: r.anchorDay, active: r.active,
    })),
  })
}
