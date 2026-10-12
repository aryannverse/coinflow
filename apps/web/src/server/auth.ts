import 'server-only'
import { auth, currentUser } from '@clerk/nextjs/server'
import type { User } from '@/server/db/schema'
import { AppError } from './errors'
import { AUD_USER, bearer, verifyInternalToken } from './internal-token'
import { getUser, upsertUserFromProfile, type UserProfile } from './services/users'

export interface ClerkProfileLike {
  id: string
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
  primaryEmailAddress?: { emailAddress: string } | null
  emailAddresses: { emailAddress: string }[]
}

const unauthorized = () => new AppError('unauthorized', 'Please sign in to continue.', 401)

/** A verified internal token's user (spec §4.2). Server-only; null when absent, invalid, or the secret is unset. */
function internalUserId(req?: Request): string | null {
  const token = req ? bearer(req) : null
  return token ? verifyInternalToken(token, AUD_USER) : null
}

export async function requireUserId(req?: Request): Promise<string> {
  const internal = internalUserId(req)
  if (internal) return internal
  const { userId } = await auth()
  if (!userId) throw unauthorized()
  return userId
}

export function profileFromClerk(u: ClerkProfileLike): UserProfile {
  const email = u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress
  if (!email) throw new AppError('no_email', 'Your account needs an email address.', 400)
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || email.split('@')[0]
  return { id: u.id, email, name, avatarUrl: u.imageUrl }
}

/** Signed-in user's DB row: a Clerk session, or (agent calls) a valid internal token for a user who already exists. */
export async function requireCurrentUser(req?: Request): Promise<User> {
  const internal = internalUserId(req)
  if (internal) {
    const user = await getUser(internal)
    if (!user) throw unauthorized() // the agent only acts for people who already use Coinflow
    return user
  }
  const userId = await requireUserId()
  const existing = await getUser(userId)
  if (existing) return existing
  const clerkUser = await currentUser()
  if (!clerkUser) throw unauthorized()
  return upsertUserFromProfile(profileFromClerk(clerkUser as unknown as ClerkProfileLike))
}
