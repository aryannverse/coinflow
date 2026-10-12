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

const READ_METHODS = new Set(['GET', 'HEAD'])

/**
 * A verified internal token's user (spec §4.2). Server-only; null when absent, invalid, or the secret is unset.
 * Spec §4.4 "the AI never writes": the agent's token may only read. A write carrying a valid one is refused with
 * 403 `read_only` (the usual {error:{code,message}} shape) instead of falling back to Clerk; approvals are saved by
 * the person's own browser session.
 */
function internalUserId(req?: Request): string | null {
  const token = req ? bearer(req) : null
  const userId = token ? verifyInternalToken(token, AUD_USER) : null
  if (userId && !READ_METHODS.has(req!.method.toUpperCase())) {
    throw new AppError('read_only', 'The assistant can only read. Approve its draft in Coinflow to save it.', 403)
  }
  return userId
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
