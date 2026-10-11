import { addDays, diffDays, type ISODate } from './dates'

export type DayAmount = { date: ISODate; expense: number }

/** The insights API omits days with no spending. This returns one row for every day in [from, to], zero where omitted. */
export function fillDays(byDay: DayAmount[], from: ISODate, to: ISODate): DayAmount[] {
  const span = diffDays(to, from)
  if (span < 0) return []
  const spent = new Map(byDay.map((d) => [d.date, d.expense]))
  return Array.from({ length: span + 1 }, (_, i) => {
    const date = addDays(from, i)
    return { date, expense: spent.get(date) ?? 0 }
  })
}

/** Adds a running total, for the cumulative line. */
export function cumulativeTotals(days: DayAmount[]): (DayAmount & { total: number })[] {
  let total = 0
  return days.map((d) => ({ ...d, total: (total += d.expense) }))
}
