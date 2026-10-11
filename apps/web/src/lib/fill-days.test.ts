import { describe, expect, it } from 'vitest'
import { cumulativeTotals, fillDays } from './fill-days'

describe('fillDays', () => {
  it('fills every day from..to inclusive, with zero for omitted days', () => {
    expect(fillDays([{ date: '2026-10-02', expense: 500 }, { date: '2026-10-04', expense: 250 }], '2026-10-01', '2026-10-05')).toEqual([
      { date: '2026-10-01', expense: 0 },
      { date: '2026-10-02', expense: 500 },
      { date: '2026-10-03', expense: 0 },
      { date: '2026-10-04', expense: 250 },
      { date: '2026-10-05', expense: 0 },
    ])
  })
  it('returns all zeros for an empty byDay', () => {
    expect(fillDays([], '2026-10-01', '2026-10-03').map((d) => d.expense)).toEqual([0, 0, 0])
  })
  it('handles a single day and crosses month and year ends', () => {
    expect(fillDays([], '2026-10-01', '2026-10-01')).toHaveLength(1)
    expect(fillDays([], '2026-12-30', '2027-01-02').map((d) => d.date)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
  })
  it('ignores API days outside the range and returns [] when to is before from', () => {
    expect(fillDays([{ date: '2026-09-30', expense: 9 }], '2026-10-01', '2026-10-01')).toEqual([{ date: '2026-10-01', expense: 0 }])
    expect(fillDays([], '2026-10-05', '2026-10-01')).toEqual([])
  })
})

describe('cumulativeTotals', () => {
  it('adds a running total', () => {
    expect(cumulativeTotals([{ date: 'a', expense: 100 }, { date: 'b', expense: 0 }, { date: 'c', expense: 50 }])).toEqual([
      { date: 'a', expense: 100, total: 100 },
      { date: 'b', expense: 0, total: 100 },
      { date: 'c', expense: 50, total: 150 },
    ])
  })
})
