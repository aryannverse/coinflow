import type { InsightsDTO, RecurringDTO, TransactionDTO } from './api-types'
import { toISTDate, type ISODate } from './dates'
import { occurrencesInRange } from './recurrence'

export function upcomingBills(recurring: RecurringDTO[], today: ISODate, cycleEnd: ISODate, limit = 3) {
  return recurring
    .filter((r) => r.active && r.kind === 'bill')
    .flatMap((r) => occurrencesInRange(r.nextDueOn, r.cadence, r.anchorDay, today, cycleEnd).map((dueOn) => ({ id: r.id, name: r.name, amount: r.amount, dueOn })))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    .slice(0, limit)
}

export function todaySummary(txns: TransactionDTO[], today: ISODate) {
  const mine = txns.filter((t) => t.type === 'expense' && toISTDate(new Date(t.occurredAt)) === today)
  const last = mine.reduce<TransactionDTO | null>((best, t) => (best === null || t.occurredAt > best.occurredAt ? t : best), null)
  return { total: mine.reduce((s, t) => s + t.personalShare, 0), count: mine.length, last }
}

/** Expenses needed before "Top category" is worth showing (spec §4.5): a "top" of one or two items is noise. */
export const TOP_CATEGORY_MIN_EXPENSES = 3

export const hasEnoughExpenses = (txns: TransactionDTO[]) => txns.filter((t) => t.type === 'expense').length >= TOP_CATEGORY_MIN_EXPENSES

/** The leading category of the cycle and its share of spending, or null when the tile should stay hidden. */
export function topCategory(insights: InsightsDTO | undefined, enabled: boolean) {
  const top = insights?.byCategory[0]
  if (!enabled || !insights || !top || insights.totalExpense === 0) return null
  return { top, share: Math.round((top.amount / insights.totalExpense) * 100) }
}
