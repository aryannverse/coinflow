import { describe, expect, it } from 'vitest'
import { mePatchSchema } from './me'

describe('mePatchSchema', () => {
  it('rejects fields the client must not set', () => {
    expect(mePatchSchema.safeParse({ email: 'x@y.z' }).success).toBe(false)
    expect(mePatchSchema.safeParse({ onboardedAt: new Date().toISOString() }).success).toBe(false)
  })

  it('validates UPI ids', () => {
    expect(mePatchSchema.safeParse({ upiId: 'asha@okhdfc' }).success).toBe(true)
    expect(mePatchSchema.safeParse({ upiId: 'asha' }).success).toBe(false)
  })

  it('keeps payday between 1 and 31', () => {
    expect(mePatchSchema.safeParse({ paydayDay: 1 }).success).toBe(true)
    expect(mePatchSchema.safeParse({ paydayDay: 31 }).success).toBe(true)
    expect(mePatchSchema.safeParse({ paydayDay: 0 }).success).toBe(false)
    expect(mePatchSchema.safeParse({ paydayDay: 32 }).success).toBe(false)
  })

  it('validates coach quiet hours and the Part B toggles', () => {
    expect(mePatchSchema.safeParse({ quietHours: { start: '22:00', end: '07:00' }, coachEnabled: false, countReceivables: false }).success).toBe(true)
    expect(mePatchSchema.safeParse({ quietHours: { start: '25:00', end: '07:00' } }).success).toBe(false)
    expect(mePatchSchema.safeParse({ quietHours: null }).success).toBe(true)
  })
})
