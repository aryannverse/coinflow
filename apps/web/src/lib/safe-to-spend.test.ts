import { describe, expect, it } from 'vitest'
import { computeSafeToSpend, groupPositionTerm, type SafeToSpendInput } from './safe-to-spend'

const base: SafeToSpendInput = {
  today: '2026-10-11',
  paydayDay: 1,
  fixedCostsEstimate: 600_000, // ₹6,000 / cycle
  receivables: 0,
  checkin: { amount: 5_000_000 }, // ₹50,000
  confirmedIncomeSinceCheckin: 0,
  confirmedExpenseCashSinceCheckin: 124_000, // ₹1,240
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

describe('groupPositionTerm (G, spec §2.4)', () => {
  it('counts what you owe always, and what you are owed only when allowed — per group', () => {
    expect(groupPositionTerm([200_000, -60_000], true)).toBe(140_000)
    expect(groupPositionTerm([200_000, -60_000], false)).toBe(-60_000)
    expect(groupPositionTerm([], true)).toBe(0)
  })

  it('worked example: settling never changes S', () => {
    // I pay ₹3,000 dinner for three (after my check-in). B −3,000, G +2,000.
    const me = { ...base, recurring: [], fixedCostsEstimate: 0, confirmedExpenseCashSinceCheckin: 300_000 }
    const meBefore = computeSafeToSpend({ ...me, receivables: groupPositionTerm([200_000], true) })
    // A friend's ₹1,000 confirmed settlement reaches me: income +1,000 in B, G falls to +1,000.
    const meAfter = computeSafeToSpend({ ...me, confirmedIncomeSinceCheckin: 100_000, receivables: groupPositionTerm([100_000], true) })
    expect(meAfter.amount).toBe(meBefore.amount)
    expect(meBefore.amount).toBe(5_000_000 - 300_000 + 200_000) // S moved by −₹1,000, my share

    // The friend: G −1,000; after paying, B −1,000 (cash) and G 0.
    const friend = { ...base, recurring: [], fixedCostsEstimate: 0, confirmedExpenseCashSinceCheckin: 0 }
    const fBefore = computeSafeToSpend({ ...friend, receivables: groupPositionTerm([-100_000], true) })
    const fAfter = computeSafeToSpend({ ...friend, confirmedExpenseCashSinceCheckin: 100_000, receivables: groupPositionTerm([0], true) })
    expect(fAfter.amount).toBe(fBefore.amount)
    expect(fBefore.amount).toBe(5_000_000 - 100_000)
  })
})
