import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { mePatchSchema, type MePatch } from '@/lib/schemas/me'
import { getDb } from '@/server/db/client'
import { pgConstraint, pgErrorCode } from '@/server/db/errors'
import { users, type User } from '@/server/db/schema'
import { conflict, notFound } from '@/server/errors'

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

const EMAIL_UNIQUE_CONSTRAINT = 'users_email_unique'

export async function upsertUserFromProfile(p: UserProfile): Promise<User> {
  try {
    const [row] = await getDb()
      .insert(users)
      .values({ id: p.id, email: p.email, name: p.name, avatarUrl: p.avatarUrl })
      .onConflictDoUpdate({
        target: users.id,
        // name is set on first insert only: the in-app name wins over later Clerk syncs (ruling R20).
        set: { email: p.email, avatarUrl: p.avatarUrl, updatedAt: new Date() },
      })
      .returning()
    return row
  } catch (err) {
    if (pgErrorCode(err) === '23505' && pgConstraint(err) === EMAIL_UNIQUE_CONSTRAINT) {
      // A first page load fires several requests at once and each inserts the same new user. Postgres can report the
      // loser's clash on the email index before the id arbiter. It is that race only if this id now has a row with THIS
      // email; an existing user moving onto an email another account holds must still be refused.
      const winner = await getUser(p.id)
      if (winner && winner.email === p.email) return winner
      throw conflict('email_in_use', 'This email is already linked to another Coinflow account.')
    }
    throw err
  }
}

export async function deleteUser(id: string): Promise<void> {
  await getDb().delete(users).where(eq(users.id, id))
}

export async function updateMe(userId: string, rawPatch: MePatch): Promise<User> {
  const { onboarded, ...fields } = mePatchSchema.parse(rawPatch)
  const changes = {
    ...fields,
    ...(onboarded === undefined
      ? {}
      : { onboardedAt: onboarded ? sql`coalesce(${users.onboardedAt}, now())` : null }),
  }
  if (Object.values(changes).every((v) => v === undefined)) {
    const current = await getUser(userId)
    if (!current) throw notFound('account')
    return current
  }
  const [row] = await getDb().update(users).set(changes).where(eq(users.id, userId)).returning()
  if (!row) throw notFound('account')
  return row
}
