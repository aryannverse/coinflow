import { formatINR } from './money'

/** Soft-plan progress for one category. `pct` is capped at 100 for the bar; going over is information, not an alarm. */
export function budgetBand(spent: number, limit: number): { pct: number; overBy: number; label: string } {
  const overBy = Math.max(0, spent - limit)
  // Integer math and floor: ₹4,980 of ₹5,000 is 99%, never rounded up to a full bar while still under plan.
  const pct = limit > 0 ? Math.min(100, Math.floor((spent * 100) / limit)) : 0
  const label = overBy > 0 ? `${formatINR(overBy)} over plan` : `${formatINR(spent)} of ${formatINR(limit)} · ${pct}%`
  return { pct, overBy, label }
}
