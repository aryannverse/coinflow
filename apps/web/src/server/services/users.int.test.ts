import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeUser, resetDb } from '@test/int/helpers'
import { clerkState } from '@test/int/clerk-mock'

vi.mock('@clerk/nextjs/server', async () => (await import('@test/int/clerk-mock')).clerkModule)

import { requireCurrentUser } from '@/server/auth'
import { getUser, updateMe, upsertUserFromProfile } from './users'

describe('users service', () => {
  beforeEach(async () => {
    await resetDb()
    clerkState.userId = null
  })

  it('creates the user from Clerk on first authenticated request', async () => {
    clerkState.userId = 'user_new'
    clerkState.email = 'new@example.com'
    const user = await requireCurrentUser()
    expect(user).toMatchObject({ id: 'user_new', email: 'new@example.com', name: 'Test', paydayDay: 1, theme: 'dark' })
    expect(await getUser('user_new')).not.toBeNull()
  })

  it('returns the existing row without overwriting edits', async () => {
    await makeUser('user_a', { name: 'Edited Name' })
    clerkState.userId = 'user_a'
    expect((await requireCurrentUser()).name).toBe('Edited Name')
  })

  it('rejects signed-out requests', async () => {
    await expect(requireCurrentUser()).rejects.toMatchObject({ status: 401 })
  })

  it('upsert updates email/name/avatar from Clerk', async () => {
    await makeUser('user_a')
    const u = await upsertUserFromProfile({ id: 'user_a', email: 'changed@example.com', name: 'Asha', avatarUrl: null })
    expect(u).toMatchObject({ email: 'changed@example.com', name: 'Asha' })
  })

  it('updateMe sets onboardedAt when onboarded=true and keeps other fields', async () => {
    await makeUser('user_a')
    const u = await updateMe('user_a', { paydayDay: 31, onboarded: true, upiId: 'asha@okhdfc' })
    expect(u.paydayDay).toBe(31)
    expect(u.upiId).toBe('asha@okhdfc')
    expect(u.onboardedAt).toBeInstanceOf(Date)
  })
})
