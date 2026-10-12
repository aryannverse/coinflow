import { describe, expect, it } from 'vitest'
import { dateRange, initials, paymentHeadline, positionCopy } from './group-display'

describe('group display', () => {
  it('position copy is neutral in every direction', () => {
    expect(positionCopy(200_000)).toEqual({ text: 'You’re owed ₹2,000', tone: 'owed' })
    expect(positionCopy(-60_000)).toEqual({ text: 'You owe ₹600', tone: 'owe' })
    expect(positionCopy(0)).toEqual({ text: 'Settled', tone: 'settled' })
  })
  it('date ranges stay short', () => {
    expect(dateRange('2026-10-12', '2026-10-15')).toBe('12–15 Oct')
    expect(dateRange('2026-09-28', '2026-10-02')).toBe('28 Sept – 2 Oct')
    expect(dateRange('2026-10-12', null)).toBe('From 12 Oct')
    expect(dateRange(null, null)).toBeNull()
  })
  it('initials', () => {
    expect(initials('Asha Rao')).toBe('AR')
    expect(initials('ravi')).toBe('R')
  })
  it('payment headline is viewer-relative', () => {
    const names = new Map([['a', 'Asha'], ['y', 'Yash']])
    const p = { from: 'a', to: 'y', amountPaise: 20_000, why: { debtorOwesPaise: 0, debtorExpenses: [], splitAcross: [] } }
    expect(paymentHeadline(p, names, 'y')).toBe('Asha pays you ₹200')
    expect(paymentHeadline(p, names, 'a')).toBe('You pay Yash ₹200')
  })
})
