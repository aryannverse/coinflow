import { describe, expect, it } from 'vitest'
import { nextOccurrence, occurrencesInRange } from './recurrence'

describe('recurrence', () => {
  it('weekly adds 7 days', () => {
    expect(nextOccurrence('2026-10-14', 'weekly', 14)).toBe('2026-10-21')
  })
  it('monthly keeps the anchor day after a short month', () => {
    expect(nextOccurrence('2026-01-31', 'monthly', 31)).toBe('2026-02-28')
    expect(nextOccurrence('2026-02-28', 'monthly', 31)).toBe('2026-03-31')
  })
  it('yearly handles Feb 29', () => {
    expect(nextOccurrence('2024-02-29', 'yearly', 29)).toBe('2025-02-28')
    expect(nextOccurrence('2027-02-28', 'yearly', 29)).toBe('2028-02-29')
  })
  it('lists occurrences inside an inclusive range', () => {
    expect(occurrencesInRange('2026-10-14', 'weekly', 14, '2026-10-11', '2026-10-31')).toEqual([
      '2026-10-14', '2026-10-21', '2026-10-28',
    ])
  })
  it('skips occurrences before the range start', () => {
    expect(occurrencesInRange('2026-09-20', 'monthly', 20, '2026-10-11', '2026-10-31')).toEqual(['2026-10-20'])
  })
  it('returns nothing when the first occurrence is after the range', () => {
    expect(occurrencesInRange('2026-11-05', 'monthly', 5, '2026-10-11', '2026-10-31')).toEqual([])
  })
  it('never returns a date before the range when the schedule is very stale', () => {
    expect(occurrencesInRange('2018-01-01', 'weekly', 1, '2026-10-11', '2026-10-31')).toEqual([])
  })
})
