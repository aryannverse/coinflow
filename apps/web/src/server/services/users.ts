import 'server-only'
import { eq } from 'drizzle-orm'
import type { MePatch } from '@/lib/schemas/me'
import { getDb } from '@/server/db/client'
import { users, type User } from '@/server/db/schema'
import { notFound } from '@/server/errors'

export interface UserProfile {
  id: string
  email: string
  name: string
  avatarUrl: string | null
}

export async function getUser(id: string): Promise<User | null> {
  const [row] = await getDb().select().from(users).where(eq(users.id, id))
  return row ?? null
}

export async function upsertUserFromProfile(p: UserProfile): Promise<User> {
  const [row] = await getDb()
    .insert(users)
    .values({ id: p.id, email: p.email, name: p.name, avatarUrl: p.avatarUrl })
    .onConflictDoUpdate({ target: users.id, set: { email: p.email, name: p.name, avatarUrl: p.avatarUrl } })
    .returning()
  return row
}

export async function deleteUser(id: string): Promise<void> {
  await getDb().delete(users).where(eq(users.id, id))
}

export async function updateMe(userId: string, patch: MePatch): Promise<User> {
  const { onboarded, ...fields } = patch
  const [row] = await getDb()
    .update(users)
    .set({ ...fields, ...(onboarded === undefined ? {} : { onboardedAt: onboarded ? new Date() : null }) })
    .where(eq(users.id, userId))
    .returning()
  if (!row) throw notFound('account')
  return row
}
