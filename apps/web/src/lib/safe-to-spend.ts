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
  receivables: number
  checkin: { amount: number } | null
  confirmedIncomeSinceCheckin: number
  confirmedExpenseShareSinceCheckin: number
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
    ? input.checkin.amount + input.confirmedIncomeSinceCheckin - input.confirmedExpenseShareSinceCheckin
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
