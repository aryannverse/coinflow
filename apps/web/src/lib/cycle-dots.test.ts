import { describe, expect, it } from 'vitest'
import { cycleDots } from './cycle-dots'

describe('cycleDots', () => {
  it('marks past, today and future days of the cycle', () => {
    const dots = cycleDots('2026-10-01', '2026-10-05', '2026-10-03')
    expect(dots).toEqual(['past', 'past', 'today', 'future', 'future'])
  })
  it('first and last day of the cycle', () => {
    expect(cycleDots('2026-10-01', '2026-10-03', '2026-10-01')).toEqual(['today', 'future', 'future'])
    expect(cycleDots('2026-10-01', '2026-10-03', '2026-10-03')).toEqual(['past', 'past', 'today'])
  })
  it('crosses a month boundary', () => {
    expect(cycleDots('2026-10-30', '2026-11-02', '2026-11-01')).toEqual(['past', 'past', 'today', 'future'])
  })
})
