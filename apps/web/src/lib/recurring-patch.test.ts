import { describe, expect, it } from 'vitest'
import { buildRecurringPatch, type RecurringFields } from './recurring-patch'

const initial: RecurringFields = {
  kind: 'bill', name: 'Rent', amount: 1_500_000, cadence: 'monthly', nextDueOn: '2026-11-01', categoryId: 'cat-rent',
}

describe('buildRecurringPatch', () => {
  it('nothing changed gives {} (so no request is sent)', () => {
    expect(buildRecurringPatch(initial, { ...initial })).toEqual({})
  })
  it('amount only sends amount alone, never nextDueOn', () => {
    const patch = buildRecurringPatch(initial, { ...initial, amount: 1_600_000 })
    expect(patch).toEqual({ amount: 1_600_000 })
    expect(patch).not.toHaveProperty('nextDueOn')
  })
  it('a changed nextDueOn is a real change and is sent', () => {
    expect(buildRecurringPatch(initial, { ...initial, nextDueOn: '2026-11-05' })).toEqual({ nextDueOn: '2026-11-05' })
  })
  it('sends every field that differs and no others', () => {
    expect(buildRecurringPatch(initial, { ...initial, name: 'Flat rent', cadence: 'yearly' })).toEqual({ name: 'Flat rent', cadence: 'yearly' })
  })
  it('a kind change carries its new category', () => {
    expect(buildRecurringPatch(initial, { ...initial, kind: 'income', categoryId: 'cat-salary' })).toEqual({ kind: 'income', categoryId: 'cat-salary' })
  })
  it('toggling kind away and back (category restored) is no change', () => {
    expect(buildRecurringPatch(initial, { ...initial, kind: 'bill', categoryId: 'cat-rent' })).toEqual({})
  })
  it('never includes active (pause and resume are separate actions)', () => {
    expect(buildRecurringPatch(initial, { ...initial, amount: 1 })).not.toHaveProperty('active')
  })
})
