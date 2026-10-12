import { afterEach, describe, expect, it } from 'vitest'
import { AUD_SERVICE, AUD_USER, SERVICE_SUB, bearer, signInternalToken, verifyInternalToken } from './internal-token'

const KEY = 'coinflow-test-secret-0123456789abcdef'
const IAT = 1_791_734_400
// Shared with apps/agent/tests/test_auth.py (PyJWT): both sides must produce exactly this.
const VECTOR =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEiLCJhdWQiOiJhZ2VudCIsImlhdCI6MTc5MTczNDQwMCwiZXhwIjoxNzkxNzM1MDAwfQ.PQtUZHqe-9eQEHngGpNX44j_pdg5OXPX9d9isYNp9sg'

describe('internal token (spec §4.2)', () => {
  afterEach(() => {
    delete process.env.AGENT_SHARED_SECRET
  })

  it('signs the same bytes as the Python agent', () => {
    expect(signInternalToken('user_1', { key: KEY, nowSec: IAT })).toBe(VECTOR)
  })

  it('is valid for ten minutes, then never', () => {
    expect(verifyInternalToken(VECTOR, AUD_USER, { key: KEY, nowSec: IAT + 599 })).toBe('user_1')
    expect(verifyInternalToken(VECTOR, AUD_USER, { key: KEY, nowSec: IAT + 600 })).toBeNull()
  })

  it('rejects a tampered token, another audience, and a service token used as a user', () => {
    const tampered = VECTOR.replace('eyJzdWIiOiJ1c2VyXzEi', 'eyJzdWIiOiJ1c2VyXzIi')
    expect(verifyInternalToken(tampered, AUD_USER, { key: KEY, nowSec: IAT })).toBeNull()
    expect(verifyInternalToken(VECTOR, AUD_SERVICE, { key: KEY, nowSec: IAT })).toBeNull()
    const service = signInternalToken(SERVICE_SUB, { aud: AUD_SERVICE, key: KEY, nowSec: IAT })
    expect(verifyInternalToken(service, AUD_USER, { key: KEY, nowSec: IAT })).toBeNull()
    expect(verifyInternalToken(service, AUD_SERVICE, { key: KEY, nowSec: IAT })).toBe(SERVICE_SUB)
    expect(verifyInternalToken('not.a.jwt', AUD_USER, { key: KEY })).toBeNull()
  })

  it('rejects alg none, a header that is not HS256 even when correctly signed, and a token with no exp', async () => {
    const { createHmac } = await import('node:crypto')
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const signWith = (header: object, claims: object) => {
      const body = `${enc(header)}.${enc(claims)}`
      return `${body}.${createHmac('sha256', KEY).update(body).digest('base64url')}`
    }
    const claims = { sub: 'user_1', aud: AUD_USER, iat: IAT, exp: IAT + 600 }
    expect(verifyInternalToken(`${enc({ alg: 'none', typ: 'JWT' })}.${enc(claims)}.`, AUD_USER, { key: KEY, nowSec: IAT })).toBeNull()
    expect(verifyInternalToken(signWith({ alg: 'HS512', typ: 'JWT' }, claims), AUD_USER, { key: KEY, nowSec: IAT })).toBeNull()
    expect(verifyInternalToken(signWith({ alg: 'HS256', typ: 'JWT' }, { sub: 'user_1', aud: AUD_USER, iat: IAT }), AUD_USER, { key: KEY, nowSec: IAT })).toBeNull()
    expect(verifyInternalToken(signWith({ alg: 'HS256', typ: 'JWT' }, { ...claims, aud: [AUD_USER] }), AUD_USER, { key: KEY, nowSec: IAT })).toBeNull()
    expect(verifyInternalToken(signWith({ alg: 'HS256', typ: 'JWT' }, claims), AUD_USER, { key: KEY, nowSec: IAT })).toBe('user_1')
    expect(verifyInternalToken(`${VECTOR}${'A'.repeat(5000)}`, AUD_USER, { key: KEY, nowSec: IAT })).toBeNull()
  })

  it('a missing secret disables the path', () => {
    expect(verifyInternalToken(VECTOR, AUD_USER, { nowSec: IAT })).toBeNull()
    expect(() => signInternalToken('user_1')).toThrow(/AGENT_SHARED_SECRET/)
  })

  it('reads only a Bearer header', () => {
    expect(bearer(new Request('http://x', { headers: { authorization: 'Bearer abc' } }))).toBe('abc')
    expect(bearer(new Request('http://x', { headers: { authorization: 'Basic abc' } }))).toBeNull()
  })
})
