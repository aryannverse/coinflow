import { describe, expect, it } from 'vitest'
import { friendEmailSchema, friendUserSchema } from './friends'

describe('friend schemas', () => {
  it('normalises the email and refuses partial ones', () => {
    expect(friendEmailSchema.parse({ email: '  Asha@Example.COM ' })).toEqual({ email: 'asha@example.com' })
    expect(friendEmailSchema.safeParse({ email: 'asha' }).success).toBe(false)
    expect(friendEmailSchema.safeParse({ email: 'asha@' }).success).toBe(false)
    expect(friendEmailSchema.safeParse({ email: 'a@b.co', extra: 1 }).success).toBe(false)
  })
  it('takes a user id', () => {
    expect(friendUserSchema.parse({ userId: ' user_123 ' })).toEqual({ userId: 'user_123' })
    expect(friendUserSchema.safeParse({ userId: '' }).success).toBe(false)
  })
})
