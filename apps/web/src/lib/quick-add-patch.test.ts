import { describe, expect, it } from 'vitest'
import { buildPatch, isValidWhen } from './quick-add-patch'

const initial = { type: 'expense' as const, amount: 45000, categoryId: 'cat-food', note: 'Lunch', method: 'cash' }

describe('buildPatch', () => {
  it('omits unchanged fields; nothing changed gives {}', () => {
    expect(buildPatch(initial, { ...initial }, false, '2026-10-10T10:00')).toEqual({})
  })
  it('includes only fields that differ', () => {
    expect(buildPatch(initial, { ...initial, note: 'Dinner', amount: 50000 }, false, '')).toEqual({ note: 'Dinner', amount: 50000 })
  })
  it('a cleared note is sent as null', () => {
    expect(buildPatch(initial, { ...initial, note: null }, false, '')).toEqual({ note: null })
  })
  it('occurredAt only when the When field was touched', () => {
    expect(buildPatch(initial, { ...initial }, false, '2026-10-10T10:00')).not.toHaveProperty('occurredAt')
    const patch = buildPatch(initial, { ...initial }, true, '2026-10-10T10:00')
    expect(patch).toEqual({ occurredAt: new Date('2026-10-10T10:00').toISOString() })
  })
  it('toggling type away and back leaves the category out', () => {
    // the sheet restores the original category when the type returns to the original
    expect(buildPatch(initial, { ...initial, type: 'expense', categoryId: 'cat-food' }, false, '')).toEqual({})
    expect(buildPatch(initial, { ...initial, type: 'income', categoryId: 'cat-salary' }, false, '')).toEqual({ type: 'income', categoryId: 'cat-salary' })
  })
})

describe('isValidWhen', () => {
  it('rejects empty and unparseable values', () => {
    expect(isValidWhen('')).toBe(false)
    expect(isValidWhen('nonsense')).toBe(false)
    expect(isValidWhen('2026-10-10T10:00')).toBe(true)
  })
})
