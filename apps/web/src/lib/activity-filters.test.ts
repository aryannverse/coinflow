import { describe, expect, it } from 'vitest'
import { hasFilters, isRealDay, isReversedRange, parseFilters, serializeFilters } from './activity-filters'

const parse = (qs: string) => parseFilters(new URLSearchParams(qs))

describe('activity filters', () => {
  it('reads valid params and drops values the API would reject', () => {
    expect(parse('q=chai&type=expense&method=upi&from=2026-10-01&to=2026-10-12')).toEqual({
      q: 'chai', type: 'expense', method: 'upi', from: '2026-10-01', to: '2026-10-12',
    })
    expect(parse('type=bogus&method=crypto&from=yesterday&categoryId=nope&q=')).toEqual({})
  })

  it('round-trips and reports whether any filter is active', () => {
    const f = parse('type=income&q=salary')
    expect(serializeFilters(f)).toBe('q=salary&type=income')
    expect(hasFilters(f)).toBe(true)
    expect(hasFilters({})).toBe(false)
  })

  it('accepts only real calendar days in a sane year range', () => {
    expect(isRealDay('2026-10-12')).toBe(true)
    expect(isRealDay('2024-02-29')).toBe(true)
    for (const bad of ['2026-02-31', '2025-02-29', '0002-10-12', '1999-12-31', '2101-01-01', '2026-13-01', '2026-1-1', '']) expect(isRealDay(bad)).toBe(false)
    expect(parse('from=2026-02-31&to=0002-01-01')).toEqual({})
  })

  it('flags a reversed date range', () => {
    expect(isReversedRange({ from: '2026-10-12', to: '2026-10-01' })).toBe(true)
    expect(isReversedRange({ from: '2026-10-01', to: '2026-10-12' })).toBe(false)
    expect(isReversedRange({ from: '2026-10-01' })).toBe(false)
  })
})
