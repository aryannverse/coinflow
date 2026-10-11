import { addDays, addMonthsAnchored, type ISODate } from './dates'

export type Cadence = 'weekly' | 'monthly' | 'yearly'

export function nextOccurrence(d: ISODate, cadence: Cadence, anchorDay: number): ISODate {
  if (cadence === 'weekly') return addDays(d, 7)
  return addMonthsAnchored(d, cadence === 'monthly' ? 1 : 12, anchorDay)
}

const MAX_OCCURRENCES = 400

export function occurrencesInRange(
  nextDueOn: ISODate, cadence: Cadence, anchorDay: number, from: ISODate, to: ISODate,
): ISODate[] {
  const out: ISODate[] = []
  let d = nextDueOn
  let guard = 0
  while (d < from && guard++ < MAX_OCCURRENCES) d = nextOccurrence(d, cadence, anchorDay)
  while (d <= to && out.length < MAX_OCCURRENCES) {
    out.push(d)
    d = nextOccurrence(d, cadence, anchorDay)
  }
  return out
}
