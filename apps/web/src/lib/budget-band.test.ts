import { describe, expect, it } from 'vitest'
import { budgetBand } from './budget-band'

describe('budgetBand', () => {
  it('under plan', () => {
    expect(budgetBand(320_000, 500_000)).toEqual({ pct: 64, overBy: 0, label: '₹3,200 of ₹5,000 · 64%' })
  })
  it('over plan stays neutral and caps the bar', () => {
    expect(budgetBand(540_000, 500_000)).toEqual({ pct: 100, overBy: 40_000, label: '₹400 over plan' })
  })
  it('zero spend', () => {
    expect(budgetBand(0, 500_000).label).toBe('₹0 of ₹5,000 · 0%')
  })
  it('exactly at the plan is not over', () => {
    expect(budgetBand(500_000, 500_000)).toEqual({ pct: 100, overBy: 0, label: '₹5,000 of ₹5,000 · 100%' })
  })
  it('a zero plan never divides by zero', () => {
    expect(budgetBand(0, 0)).toEqual({ pct: 0, overBy: 0, label: '₹0 of ₹0 · 0%' })
    expect(budgetBand(1_000, 0).overBy).toBe(1_000)
  })
  it('rounds the percentage down, so nearly-there is never shown as 100%', () => {
    expect(budgetBand(498_000, 500_000).pct).toBe(99)
    expect(budgetBand(499_999, 500_000).label).toBe('₹4,999.99 of ₹5,000 · 99%')
    expect(budgetBand(57, 100).pct).toBe(57) // 0.57 * 100 is 56.99999999999999 in floating point
  })
})
