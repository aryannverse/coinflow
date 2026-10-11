import { describe, expect, it } from 'vitest'
import { resolveCustomRange } from './custom-range'

const today = '2026-10-12'
describe('resolveCustomRange', () => {
  it('passes a valid range through', () => {
    expect(resolveCustomRange({ from: '2026-10-01', to: '2026-10-10' }, today)).toEqual({ from: '2026-10-01', to: '2026-10-10', clamped: false, swapped: false })
  })
  it('allows exactly 366 days between from and to', () => {
    expect(resolveCustomRange({ from: '2025-10-11', to: '2026-10-12' }, today).clamped).toBe(false)
  })
  it('clamps from when the span is over 366 days', () => {
    expect(resolveCustomRange({ from: '2020-01-01', to: '2026-10-12' }, today)).toEqual({ from: '2025-10-11', to: '2026-10-12', clamped: true, swapped: false })
  })
  it('never lets to precede from', () => {
    expect(resolveCustomRange({ from: '2026-10-10', to: '2026-10-05' }, today)).toEqual({ from: '2026-10-05', to: '2026-10-05', clamped: false, swapped: true })
  })
  it('does not look into the future', () => {
    expect(resolveCustomRange({ from: '2026-10-01', to: '2026-12-31' }, today).to).toBe(today)
  })
})
