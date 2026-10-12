import { describe, expect, it } from 'vitest'
import { dateRange, groupTab, initials, markedPayment, paymentHeadline, positionCopy, timeAgo, waitingForPayee } from './group-display'

describe('group display', () => {
  it('?tab= resolves to a known tab, else the fallback', () => {
    expect(groupTab('balances')).toBe('balances')
    expect(groupTab('members', 'balances')).toBe('members')
    expect(groupTab(undefined)).toBe('expenses')
    expect(groupTab('nope', 'activity')).toBe('activity')
  })
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
  it('time ago is short, then a date (bell and activity share it)', () => {
    const now = Date.parse('2026-10-12T12:00:00.000Z')
    expect(timeAgo('2026-10-12T11:59:40.000Z', now)).toBe('just now')
    expect(timeAgo('2026-10-12T11:55:00.000Z', now)).toBe('5 min ago')
    expect(timeAgo('2026-10-12T09:00:00.000Z', now)).toBe('3 h ago')
    expect(timeAgo('2026-10-10T09:00:00.000Z', now)).toBe('10 Oct')
  })

  describe('a payment already marked', () => {
    const asha = { displayName: 'Asha', claimed: true }
    const ravi = { displayName: 'Ravi', claimed: false }
    const pending = [
      { fromMember: 'me', toMember: 'asha', amountPaise: 20_000 },
      { fromMember: 'me', toMember: 'asha', amountPaise: 5_000 },
      { fromMember: 'dev', toMember: 'asha', amountPaise: 9_900 }, // someone else's
      { fromMember: 'me', toMember: 'ravi', amountPaise: 10_000 },
    ]

    it('sums only MY pending marks to that payee, so the row can say so instead of offering Settle up again', () => {
      expect(markedPayment(pending, 'me', 'asha', asha)).toBe('Marked ₹250 · waiting for Asha')
      expect(markedPayment(pending, 'me', 'dev', { displayName: 'Dev', claimed: false })).toBeNull()
      expect(markedPayment(pending, 'dev', 'asha', asha)).toBe('Marked ₹99 · waiting for Asha')
    })

    it('a payee who hasn’t joined yet can’t confirm: the copy says they will be asked when they do (plan A7)', () => {
      expect(waitingForPayee(asha)).toBe('Waiting for Asha to confirm.')
      expect(waitingForPayee(ravi)).toBe('Ravi hasn’t joined Coinflow yet — they’ll be asked to confirm when they do.')
      expect(markedPayment(pending, 'me', 'ravi', ravi)).toBe('Marked ₹100 · Ravi hasn’t joined Coinflow yet — they’ll be asked to confirm when they do.')
    })
  })
})
