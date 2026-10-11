import { addDays, addMonthsAnchored, diffDays, type ISODate } from './dates'

export type Cadence = 'weekly' | 'monthly' | 'yearly'

export function nextOccurrence(d: ISODate, cadence: Cadence, anchorDay: number): ISODate {
  if (cadence === 'weekly') return addDays(d, 7)
  return addMonthsAnchored(d, cadence === 'monthly' ? 1 : 12, anchorDay)
}

const MAX_OCCURRENCES = 400
const MAX_SKIP_STEPS = 10_000

export function occurrencesInRange(
  nextDueOn: ISODate, cadence: Cadence, anchorDay: number, from: ISODate, to: ISODate,
): ISODate[] {
  const out: ISODate[] = []
  let d = nextDueOn
  if (d < from && cadence === 'weekly') d = addDays(d, 7 * Math.ceil(diffDays(from, d) / 7))
  let guard = 0
  while (d < from && guard++ < MAX_SKIP_STEPS) d = nextOccurrence(d, cadence, anchorDay)
  if (d < from) return []
  while (d <= to && out.length < MAX_OCCURRENCES) {
    out.push(d)
    d = nextOccurrence(d, cadence, anchorDay)
  }
  return out
}
