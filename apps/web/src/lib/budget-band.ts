import { formatINR } from './money'

/** Soft-plan progress for one category. `pct` is capped at 100 for the bar; going over is information, not an alarm. */
export function budgetBand(spent: number, limit: number): { pct: number; overBy: number; label: string } {
  const ratio = limit > 0 ? spent / limit : 0
  const overBy = Math.max(0, spent - limit)
  const pct = Math.min(100, Math.round(ratio * 100))
  const label = overBy > 0 ? `${formatINR(overBy)} over plan` : `${formatINR(spent)} of ${formatINR(limit)} · ${pct}%`
  return { pct, overBy, label }
}
