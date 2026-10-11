import { describe, expect, it } from 'vitest'
import { addDays, addMonthsAnchored, clampDayInMonth, diffDays, istStartOfDay, toISTDate } from './dates'

describe('dates', () => {
  it('converts instants to the IST calendar day', () => {
    // 18:30 UTC on Oct 11 is 00:00 IST on Oct 12
    expect(toISTDate(new Date('2026-10-11T18:29:59Z'))).toBe('2026-10-11')
    expect(toISTDate(new Date('2026-10-11T18:30:00Z'))).toBe('2026-10-12')
  })
  it('gives the UTC instant of IST midnight', () => {
    expect(istStartOfDay('2026-10-12').toISOString()).toBe('2026-10-11T18:30:00.000Z')
  })
  it('adds and diffs days across month/year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
    expect(diffDays('2026-11-01', '2026-10-01')).toBe(31)
  })
  it('clamps day to month length', () => {
    expect(clampDayInMonth(2026, 2, 31)).toBe('2026-02-28')
    expect(clampDayInMonth(2024, 2, 30)).toBe('2024-02-29')
  })
  it('adds months snapping back to the anchor day', () => {
    expect(addMonthsAnchored('2026-01-31', 1, 31)).toBe('2026-02-28')
    expect(addMonthsAnchored('2026-02-28', 1, 31)).toBe('2026-03-31')
    expect(addMonthsAnchored('2024-02-29', 12, 29)).toBe('2025-02-28')
  })
})
