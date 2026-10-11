import { describe, expect, it } from 'vitest'
import { inrPlaceGroups } from './inr-groups'
import { formatINR } from './money'

describe('inrPlaceGroups', () => {
  it.each([0, 999, 1000, 30000, 125000, 1250000, 10000000])('groups %d like formatINR', (rupees) => {
    const groups = inrPlaceGroups(rupees)
    // Rebuild the en-IN string from the group sizes and compare with formatINR's digits.
    const digits = String(rupees)
    let i = 0
    const rebuilt = groups.map((g) => digits.slice(i, (i += g.length))).join(',')
    expect(formatINR(rupees * 100)).toBe(`₹${rebuilt}`)
  })

  it('returns place values left to right', () => {
    expect(inrPlaceGroups(0)).toEqual([[1]])
    expect(inrPlaceGroups(999)).toEqual([[100, 10, 1]])
    expect(inrPlaceGroups(1000)).toEqual([[1000], [100, 10, 1]])
    expect(inrPlaceGroups(30000)).toEqual([[10000, 1000], [100, 10, 1]])
    expect(inrPlaceGroups(125000)).toEqual([[100000], [10000, 1000], [100, 10, 1]])
    expect(inrPlaceGroups(1250000)).toEqual([[1000000, 100000], [10000, 1000], [100, 10, 1]])
    expect(inrPlaceGroups(10000000)).toEqual([[10000000], [1000000, 100000], [10000, 1000], [100, 10, 1]])
  })
})
