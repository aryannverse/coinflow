import { beforeEach, describe, expect, it, vi } from 'vitest'

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
