import { describe, expect, it } from 'vitest'
import { isoDate } from './common'

describe('isoDate', () => {
  it('accepts real calendar days, including a leap day', () => {
    expect(isoDate.safeParse('2026-10-11').success).toBe(true)
    expect(isoDate.safeParse('2024-02-29').success).toBe(true)
  })

  it('rejects days that do not exist', () => {
    expect(isoDate.safeParse('2026-02-31').success).toBe(false)
    expect(isoDate.safeParse('2026-13-01').success).toBe(false)
    expect(isoDate.safeParse('2025-02-29').success).toBe(false)
    expect(isoDate.safeParse('2026-00-10').success).toBe(false)
    expect(isoDate.safeParse('2026-10-00').success).toBe(false)
  })

  it('still rejects the wrong shape', () => {
    expect(isoDate.safeParse('11-10-2026').success).toBe(false)
    expect(isoDate.safeParse('2026-1-5').success).toBe(false)
  })
})
