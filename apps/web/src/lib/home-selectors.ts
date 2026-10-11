import type { RecurringDTO, TransactionDTO } from './api-types'
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
