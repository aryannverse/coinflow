import { addDays, diffDays, type ISODate } from './dates'

/** The insights API rejects a span (to − from) over 366 days, and a `to` before `from`. */
export const MAX_SPAN_DAYS = 366

/** Custom dates, made valid: never in the future, `to` never before `from`, and `from` pulled forward if the span is too long. */
export function resolveCustomRange(custom: { from: ISODate; to: ISODate }, today: ISODate) {
  const to = custom.to > today ? today : custom.to
  const swapped = custom.from > to
  const wanted = swapped ? to : custom.from
  const clamped = diffDays(to, wanted) > MAX_SPAN_DAYS
  return { from: clamped ? addDays(to, -MAX_SPAN_DAYS) : wanted, to, clamped, swapped }
}
