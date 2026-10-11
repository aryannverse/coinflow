import { formatINR } from './money'

const trim = (n: number) => String(Math.round(n * 10) / 10)

/** Axis labels in rupees, en-IN style: ₹950, ₹1.2k, ₹1.5L, ₹1.2Cr. Takes paise; never shows fractional paise. */
export function compactINR(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100)
  const sign = paise < 0 ? '−' : ''
  if (rupees >= 10_000_000) return `${sign}₹${trim(rupees / 10_000_000)}Cr`
  if (rupees >= 100_000) return `${sign}₹${trim(rupees / 100_000)}L`
  if (rupees >= 1_000) return `${sign}₹${trim(rupees / 1_000)}k`
  return `${sign}₹${rupees}`
}

/** One calm sentence describing the daily spend chart (also its accessible name). */
export function spendSummary(totalExpense: number, days: number, topCategory: string | undefined): string {
  const span = `${days} ${days === 1 ? 'day' : 'days'}`
  if (totalExpense <= 0) return `No spending logged over ${days === 1 ? 'this day' : `these ${span}`}.`
  return `You spent ${formatINR(totalExpense)} over ${span}${topCategory ? `; most on ${topCategory}` : ''}.`
}
