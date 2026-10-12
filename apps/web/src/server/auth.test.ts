import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock(), currentUser: vi.fn() }))

import { AppError } from './errors'
import { requireUserId } from './auth'

describe('requireUserId', () => {
  beforeEach(() => authMock.mockReset())

  it('returns the Clerk user id when signed in', async () => {
    authMock.mockResolvedValue({ userId: 'user_123' })
    await expect(requireUserId()).resolves.toBe('user_123')
  })

  it('throws a 401 AppError when signed out', async () => {
    authMock.mockResolvedValue({ userId: null })
    const err = await requireUserId().catch((e) => e)
    expect(err).toBeInstanceOf(AppError)
    expect(err).toMatchObject({ code: 'unauthorized', status: 401 })
  })
})

describe('requireUserId with an internal token', () => {
  beforeEach(() => {
    authMock.mockReset()
    process.env.AGENT_SHARED_SECRET = 'coinflow-test-secret-0123456789abcdef'
  })
  afterEach(() => {
    delete process.env.AGENT_SHARED_SECRET
  })

  it('accepts the agent’s token without asking Clerk', async () => {
    const { signInternalToken } = await import('./internal-token')
    const req = new Request('http://x', { headers: { authorization: `Bearer ${signInternalToken('user_9')}` } })
    await expect(requireUserId(req)).resolves.toBe('user_9')
    expect(authMock).not.toHaveBeenCalled()
  })

  it('falls back to Clerk for anything else', async () => {
    authMock.mockResolvedValue({ userId: null })
    const req = new Request('http://x', { headers: { authorization: 'Bearer forged.token.here' } })
    await expect(requireUserId(req)).rejects.toMatchObject({ status: 401 })
  })

  it('the agent only reads: an internal token on a write is refused (403 read_only), never handed to Clerk', async () => {
    const { signInternalToken } = await import('./internal-token')
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const req = new Request('http://x', { method, headers: { authorization: `Bearer ${signInternalToken('user_9')}` } })
      await expect(requireUserId(req)).rejects.toMatchObject({ status: 403, code: 'read_only' })
    }
    const head = new Request('http://x', { method: 'HEAD', headers: { authorization: `Bearer ${signInternalToken('user_9')}` } })
    await expect(requireUserId(head)).resolves.toBe('user_9')
    expect(authMock).not.toHaveBeenCalled()
  })
})
