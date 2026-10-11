import { describe, expect, it } from 'vitest'
import { compactINR, spendSummary } from './chart-format'

describe('compactINR', () => {
  it('uses plain rupees under a thousand', () => {
    expect(compactINR(0)).toBe('₹0')
    expect(compactINR(95_000)).toBe('₹950')
  })
  it('uses k for thousands and L for lakhs, trimming .0', () => {
    expect(compactINR(120_000)).toBe('₹1.2k')
    expect(compactINR(100_000)).toBe('₹1k')
    expect(compactINR(1_500_000)).toBe('₹15k')
    expect(compactINR(15_000_000)).toBe('₹1.5L')
    expect(compactINR(10_000_000)).toBe('₹1L')
    expect(compactINR(1_000_000_000)).toBe('₹1Cr')
  })
  it('never shows fractional paise', () => {
    expect(compactINR(12_345)).toBe('₹123')
  })
})

describe('spendSummary', () => {
  it('names the total, the day count and the top category', () => {
    expect(spendSummary(1_240_000, 11, 'Food & Dining')).toBe('You spent ₹12,400 over 11 days; most on Food & Dining.')
  })
  it('handles one day and no categories', () => {
    expect(spendSummary(50_000, 1, undefined)).toBe('You spent ₹500 over 1 day.')
  })
  it('has a calm sentence for no spending', () => {
    expect(spendSummary(0, 5, undefined)).toBe('No spending logged over these 5 days.')
  })
})
