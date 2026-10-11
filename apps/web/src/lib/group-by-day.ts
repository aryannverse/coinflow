import type { TransactionDTO } from './api-types'
import { addDays, formatISODate, toISTDate, type ISODate } from './dates'

export type DayGroup = { date: ISODate; items: TransactionDTO[]; expenseTotal: number }

/** Groups a newest-first list by IST day. Totals count only the user's share of expenses. */
export function groupByDay(items: TransactionDTO[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const item of items) {
    const date = toISTDate(new Date(item.occurredAt))
    let g = groups[groups.length - 1]
    if (!g || g.date !== date) groups.push((g = { date, items: [], expenseTotal: 0 }))
    g.items.push(item)
    if (item.type === 'expense') g.expenseTotal += item.personalShare
  }
  return groups
}

export function dayLabel(date: ISODate, today: ISODate): string {
  if (date === today) return 'Today'
  if (date === addDays(today, -1)) return 'Yesterday'
  // ICU may omit the comma ("Sat 10 Oct"); normalise to "Sat, 10 Oct".
  return formatISODate(date, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/^(\w+),? (\d+) (\w+)$/, '$1, $2 $3')
}
