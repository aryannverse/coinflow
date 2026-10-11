import { describe, expect, it } from 'vitest'
import { hasFilters, parseFilters, serializeFilters } from './activity-filters'

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
})
