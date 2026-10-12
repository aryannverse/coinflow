import { payCycle } from './cycle'
import type { ISODate } from './dates'
import { occurrencesInRange, type Cadence } from './recurrence'

export interface RecurringLike {
  kind: 'bill' | 'income'
  amount: number
  cadence: Cadence
  nextDueOn: ISODate
  anchorDay: number
  active: boolean
}

export interface SafeToSpendInput {
  today: ISODate
  paydayDay: number
  fixedCostsEstimate: number
  /** G from `groupPositionTerm` (spec §2.4): Σ group positions, owing always, owed only when counted. */
  receivables: number
  checkin: { amount: number } | null
  confirmedIncomeSinceCheckin: number
  /** Cash that left the account (`transactions.amount`), not the personal share (spec §2.4: B subtracts cash). */
  confirmedExpenseCashSinceCheckin: number
  pendingBillDrafts: number
  pendingIncomeDrafts: number
  recurring: RecurringLike[]
}

export interface SafeToSpendResult {
  status: 'ok' | 'unknown'
  amount: number
  dailyPace: number
  daysLeft: number
  cycleStart: ISODate
  cycleEnd: ISODate
  nextPayday: ISODate
  breakdown: { balance: number; committedOut: number; committedIn: number; fixedRemaining: number; receivables: number }
}

function scheduled(input: SafeToSpendInput, kind: RecurringLike['kind'], cycleEnd: ISODate): number {
  return input.recurring
    .filter((r) => r.active && r.kind === kind)
    .reduce((sum, r) => sum + r.amount * occurrencesInRange(r.nextDueOn, r.cadence, r.anchorDay, input.today, cycleEnd).length, 0)
}

export function computeSafeToSpend(input: SafeToSpendInput): SafeToSpendResult {
  const cycle = payCycle(input.today, input.paydayDay)
  const balance = input.checkin
    ? input.checkin.amount + input.confirmedIncomeSinceCheckin - input.confirmedExpenseCashSinceCheckin
    : 0
  const committedOut = scheduled(input, 'bill', cycle.cycleEnd) + input.pendingBillDrafts
  const committedIn = scheduled(input, 'income', cycle.cycleEnd) + input.pendingIncomeDrafts
  const fixedRemaining = Math.floor((input.fixedCostsEstimate * cycle.daysLeft) / cycle.cycleLength)
  const breakdown = { balance, committedOut, committedIn, fixedRemaining, receivables: input.receivables }
  const common = { daysLeft: cycle.daysLeft, cycleStart: cycle.cycleStart, cycleEnd: cycle.cycleEnd, nextPayday: cycle.nextPayday, breakdown }

  if (!input.checkin) return { status: 'unknown', amount: 0, dailyPace: 0, ...common }

  const amount = balance - committedOut + committedIn - fixedRemaining + input.receivables
  return { status: 'ok', amount, dailyPace: Math.floor(Math.max(amount, 0) / cycle.daysLeft), ...common }
}

/**
 * G, the group position term (spec §2.4): Σ over groups of my net. Owing always counts; being owed counts only
 * when the user allows it (`countReceivables`). Applied per group, so a receivable never hides a debt elsewhere.
 */
export function groupPositionTerm(positions: number[], countReceivables: boolean): number {
  return positions.reduce((s, p) => s + (p > 0 ? (countReceivables ? p : 0) : p), 0)
}
