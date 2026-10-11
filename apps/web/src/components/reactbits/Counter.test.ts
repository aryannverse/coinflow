import { describe, expect, it } from 'vitest'
import { wrapDelta } from './Counter'

describe('wrapDelta', () => {
  it('takes the short way round the 0-9 wheel (|travel| <= 5)', () => {
    expect(wrapDelta(0, 1)).toBe(1)
    expect(wrapDelta(9, 0)).toBe(1)
    expect(wrapDelta(0, 9)).toBe(-1)
    expect(wrapDelta(4, 5)).toBe(1)
  })
  it('works from the absolute, drifting spring value', () => {
    // wheel at 453 shows digit 3; the new digit is 4
    expect(453 + wrapDelta(453, 4)).toBe(454)
    expect(-1 + wrapDelta(-1, 0)).toBe(0)
  })
  it('handles a fractional in-flight value', () => {
    const next = 3.4 + wrapDelta(3.4, 7)
    expect(next).toBeCloseTo(7)
  })
  it('never travels more than 5', () => {
    for (let cur = 0; cur < 10; cur++) for (let t = 0; t < 10; t++) expect(Math.abs(wrapDelta(cur, t))).toBeLessThanOrEqual(5)
  })
})
