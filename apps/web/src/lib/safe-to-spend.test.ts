import { describe, expect, it } from 'vitest'
import { computeSafeToSpend, type SafeToSpendInput } from './safe-to-spend'

const base: SafeToSpendInput = {
  today: '2026-10-11',
  paydayDay: 1,
  fixedCostsEstimate: 600_000, // ₹6,000 / cycle
  receivables: 0,
  checkin: { amount: 5_000_000 }, // ₹50,000
  confirmedIncomeSinceCheckin: 0,
  confirmedExpenseShareSinceCheckin: 124_000, // ₹1,240
  pendingBillDrafts: 0,
  pendingIncomeDrafts: 0,
  recurring: [
    { kind: 'bill', amount: 64_900, cadence: 'monthly', nextDueOn: '2026-10-20', anchorDay: 20, active: true },
    { kind: 'bill', amount: 10_000, cadence: 'weekly', nextDueOn: '2026-10-14', anchorDay: 14, active: true },
    { kind: 'bill', amount: 1_500_000, cadence: 'monthly', nextDueOn: '2026-11-05', anchorDay: 5, active: true },
    { kind: 'bill', amount: 99_900, cadence: 'monthly', nextDueOn: '2026-10-15', anchorDay: 15, active: false },
    { kind: 'income', amount: 500_000, cadence: 'monthly', nextDueOn: '2026-10-25', anchorDay: 25, active: true },
  ],
}

describe('computeSafeToSpend', () => {
  it('computes S = B − R + I − F + G for the current pay cycle', () => {
    const r = computeSafeToSpend(base)
    expect(r.breakdown).toEqual({
      balance: 4_876_000,        // 5,000,000 − 124,000
      committedOut: 94_900,      // 64,900 + 3 × 10,000 (rent is next cycle, inactive excluded)
      committedIn: 500_000,
      fixedRemaining: 406_451,   // floor(600,000 × 21 / 31)
      receivables: 0,
    })
    expect(r).toMatchObject({
      status: 'ok', amount: 4_874_649, dailyPace: 232_126, daysLeft: 21,
      cycleStart: '2026-10-01', cycleEnd: '2026-10-31', nextPayday: '2026-11-01',
    })
  })

  it('counts pending recurring drafts as committed money', () => {
    const r = computeSafeToSpend({ ...base, recurring: [], fixedCostsEstimate: 0, pendingBillDrafts: 50_000, pendingIncomeDrafts: 20_000 })
    expect(r.breakdown.committedOut).toBe(50_000)
    expect(r.breakdown.committedIn).toBe(20_000)
    expect(r.amount).toBe(4_876_000 - 50_000 + 20_000)
  })

  it('is unknown without a balance check-in', () => {
    const r = computeSafeToSpend({ ...base, checkin: null })
    expect(r).toMatchObject({ status: 'unknown', amount: 0, dailyPace: 0, daysLeft: 21 })
  })

  it('allows a negative amount but never a negative daily pace', () => {
    const r = computeSafeToSpend({ ...base, checkin: { amount: 100_000 } })
    expect(r.amount).toBeLessThan(0)
    expect(r.dailyPace).toBe(0)
  })

  it('adds receivables (Part B hook)', () => {
    expect(computeSafeToSpend({ ...base, receivables: 10_000 }).amount).toBe(4_884_649)
  })
})
