import type { TransactionDTO } from './api-types'
import { addDays, formatISODate, toISTDate, type ISODate } from './dates'

export type DayGroup = { date: ISODate; items: TransactionDTO[]; expenseTotal: number }

/**
 * Groups by IST day, newest first. Totals count only the user's share of expenses.
 * Sorted first (stable, so ties keep server order): an optimistic backdated row at the top of the list
 * must join its day's group, not open a second group with the same date.
 */
export function groupByDay(items: TransactionDTO[]): DayGroup[] {
  const groups: DayGroup[] = []
  const sorted = [...items].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
  for (const item of sorted) {
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
  // The year appears only for a different year than today's: "Sat, 10 Oct 2025".
  const year = date.slice(0, 4) !== today.slice(0, 4)
  const text = formatISODate(date, { weekday: 'short', day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) })
  // ICU may drop or add commas ("Sat 10 Oct", "Fri, 10 Oct, 2025"); normalise to "Sat, 10 Oct" / "Fri, 10 Oct 2025".
  return text.replace(/^(\w+),? (\d+) (\w+)(?:,? (\d{4}))?$/, (_, wd, d, m, y) => `${wd}, ${d} ${m}${y ? ` ${y}` : ''}`)
}
