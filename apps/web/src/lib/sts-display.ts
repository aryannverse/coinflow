import { formatINR } from './money'

export type StsView = {
  headline: number | null
  /** Shown beside the headline when the cycle is over-committed ("₹0 free this cycle"). */
  suffix?: string
  line: string
  tone: 'default' | 'neutral-negative'
}

/** Whole rupees, rounded down: the hero never promises more than is there, and paise are noise at this size. */
const floorToRupee = (paise: number) => Math.floor(paise / 100) * 100

/** Copy for the Safe-to-Spend hero. Negative is never alarming: ₹0 free, plus a plain statement of the gap. */
export function stsDisplay(r: { status: 'ok' | 'unknown'; amount: number; dailyPace: number; daysLeft: number }): StsView {
  if (r.status === 'unknown') return { headline: null, line: 'Check in your balance to see this', tone: 'default' }
  if (r.amount < 0) {
    return { headline: 0, suffix: 'free this cycle', line: `${formatINR(-r.amount)} more committed than available`, tone: 'neutral-negative' }
  }
  const days = r.daysLeft === 1 ? '1 day' : `${r.daysLeft} days`
  return { headline: floorToRupee(r.amount), line: `≈ ${formatINR(floorToRupee(r.dailyPace))}/day for ${days}`, tone: 'default' }
}
