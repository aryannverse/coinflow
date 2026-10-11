import { describe, expect, it } from 'vitest'
import { pgConstraint, pgErrorCode } from './errors'

describe('pg error helpers', () => {
  it('reads code and constraint from a plain pg error', () => {
    const err = { code: '23505', constraint_name: 'users_email_unique' }
    expect(pgErrorCode(err)).toBe('23505')
    expect(pgConstraint(err)).toBe('users_email_unique')
  })

  it('reads them from the cause of a wrapped Drizzle error', () => {
    const err = { cause: { code: '23505', constraint_name: 'users_email_unique' } }
    expect(pgErrorCode(err)).toBe('23505')
    expect(pgConstraint(err)).toBe('users_email_unique')
  })

  it('returns undefined for non-objects and errors without the fields', () => {
    for (const value of [null, undefined, 'boom', 42, {}, new Error('x')]) {
      expect(pgErrorCode(value)).toBeUndefined()
      expect(pgConstraint(value)).toBeUndefined()
    }
  })
})
