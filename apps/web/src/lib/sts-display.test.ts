import { describe, expect, it } from 'vitest'
import { stsDisplay } from './sts-display'

describe('stsDisplay', () => {
  it('positive: amount + daily pace', () => {
    expect(stsDisplay({ status: 'ok', amount: 1_845_000, dailyPace: 92_250, daysLeft: 20 }))
      .toEqual({ headline: 1_845_000, line: '≈ ₹922.50/day for 20 days', tone: 'default' })
  })
  it('negative: ₹0 headline with a "free this cycle" suffix and neutral, non-punitive copy (R26)', () => {
    expect(stsDisplay({ status: 'ok', amount: -40_000, dailyPace: 0, daysLeft: 9 }))
      .toEqual({ headline: 0, suffix: 'free this cycle', line: '₹400 more committed than available', tone: 'neutral-negative' })
  })
  it('negative: the shortfall is computed from the data', () => {
    expect(stsDisplay({ status: 'ok', amount: -123_450, dailyPace: 0, daysLeft: 3 }).line).toBe('₹1,234.50 more committed than available')
  })
  it('unknown: no headline, prompts a check-in', () => {
    expect(stsDisplay({ status: 'unknown', amount: 0, dailyPace: 0, daysLeft: 9 }))
      .toEqual({ headline: null, line: 'Check in your balance to see this', tone: 'default' })
  })
  it('singular day', () => {
    expect(stsDisplay({ status: 'ok', amount: 10_000, dailyPace: 10_000, daysLeft: 1 }).line).toBe('≈ ₹100/day for 1 day')
  })
  it('exactly zero is not negative', () => {
    expect(stsDisplay({ status: 'ok', amount: 0, dailyPace: 0, daysLeft: 5 }))
      .toEqual({ headline: 0, line: '≈ ₹0/day for 5 days', tone: 'default' })
  })
})
