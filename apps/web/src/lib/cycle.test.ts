import { describe, expect, it } from 'vitest'
import { payCycle } from './cycle'

describe('payCycle', () => {
  it('payday 1, mid-month', () => {
    expect(payCycle('2026-10-11', 1)).toEqual({
      cycleStart: '2026-10-01', nextPayday: '2026-11-01', cycleEnd: '2026-10-31', daysLeft: 21, cycleLength: 31,
    })
  })
  it('on payday itself, the new cycle has started', () => {
    expect(payCycle('2026-10-01', 1)).toMatchObject({ cycleStart: '2026-10-01', cycleEnd: '2026-10-31', daysLeft: 31 })
  })
  it('payday 15 before the 15th belongs to the previous cycle', () => {
    expect(payCycle('2026-01-10', 15)).toEqual({
      cycleStart: '2025-12-15', nextPayday: '2026-01-15', cycleEnd: '2026-01-14', daysLeft: 5, cycleLength: 31,
    })
  })
  it('payday 31 clamps to Feb 28 in a common year', () => {
    expect(payCycle('2026-02-15', 31)).toEqual({
      cycleStart: '2026-01-31', nextPayday: '2026-02-28', cycleEnd: '2026-02-27', daysLeft: 13, cycleLength: 28,
    })
  })
  it('payday 31 on the clamped Feb 28 starts a cycle ending Mar 30', () => {
    expect(payCycle('2026-02-28', 31)).toEqual({
      cycleStart: '2026-02-28', nextPayday: '2026-03-31', cycleEnd: '2026-03-30', daysLeft: 31, cycleLength: 31,
    })
  })
  it('payday 30 in a leap February', () => {
    expect(payCycle('2024-02-29', 30)).toEqual({
      cycleStart: '2024-02-29', nextPayday: '2024-03-30', cycleEnd: '2024-03-29', daysLeft: 30, cycleLength: 30,
    })
  })
})
