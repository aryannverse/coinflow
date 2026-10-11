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

  it('upsert updates email/avatar from Clerk but keeps the in-app name', async () => {
    await makeUser('user_a', { name: 'Edited Name' })
    const u = await upsertUserFromProfile({ id: 'user_a', email: 'changed@example.com', name: 'Asha', avatarUrl: 'https://img.example/a.png' })
    expect(u).toMatchObject({ email: 'changed@example.com', name: 'Edited Name', avatarUrl: 'https://img.example/a.png' })
  })

  it('upsert sets the Clerk name on first insert', async () => {
    const u = await upsertUserFromProfile({ id: 'user_new', email: 'n@example.com', name: 'Asha', avatarUrl: null })
    expect(u.name).toBe('Asha')
  })

  it('updateMe sets onboardedAt when onboarded=true and keeps other fields', async () => {
    await makeUser('user_a')
    const u = await updateMe('user_a', { paydayDay: 31, onboarded: true, upiId: 'asha@okhdfc' })
    expect(u.paydayDay).toBe(31)
    expect(u.upiId).toBe('asha@okhdfc')
    expect(u.onboardedAt).toBeInstanceOf(Date)
  })

  it('upsert refreshes updatedAt', async () => {
    const before = await makeUser('user_a')
    const u = await upsertUserFromProfile({ id: 'user_a', email: before.email, name: 'Asha', avatarUrl: null })
    expect(u.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime())
  })

  it('reports an email already linked to another account as a 409 without touching the old row', async () => {
    await makeUser('user_old', { email: 'dup@example.com' })
    clerkState.userId = 'user_new'
    clerkState.email = 'dup@example.com'
    await expect(requireCurrentUser()).rejects.toMatchObject({ status: 409, code: 'email_in_use' })
    expect(await getUser('user_old')).toMatchObject({ email: 'dup@example.com' })
    expect(await getUser('user_new')).toBeNull()
  })

  it('updateMe with an empty patch returns the unchanged row', async () => {
    const before = await makeUser('user_a')
    expect(await updateMe('user_a', {})).toEqual(before)
  })

  it('updateMe rejects with 404 when the user does not exist', async () => {
    await expect(updateMe('ghost', {})).rejects.toMatchObject({ status: 404 })
    await expect(updateMe('ghost', { paydayDay: 5 })).rejects.toMatchObject({ status: 404 })
  })

  it('updateMe keeps the first onboardedAt when onboarded=true is sent again', async () => {
    await makeUser('user_a')
    const first = await updateMe('user_a', { onboarded: true })
    await new Promise((r) => setTimeout(r, 20))
    const second = await updateMe('user_a', { onboarded: true })
    expect(second.onboardedAt).toEqual(first.onboardedAt)
  })

  it('updateMe clears onboardedAt when onboarded=false', async () => {
    await makeUser('user_a')
    await updateMe('user_a', { onboarded: true })
    expect((await updateMe('user_a', { onboarded: false })).onboardedAt).toBeNull()
  })

  it('updateMe validates the patch itself', async () => {
    await makeUser('user_a')
    await expect(updateMe('user_a', { paydayDay: 99 })).rejects.toThrow()
    await expect(updateMe('user_a', { email: 'x@y.z' } as never)).rejects.toThrow()
  })
})
