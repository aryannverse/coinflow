import 'server-only'
import { auth, currentUser } from '@clerk/nextjs/server'
import type { User } from '@/server/db/schema'
import { AppError } from './errors'
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

export async function requireUserId(): Promise<string> {
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

/** Signed-in user's DB row; creates it from Clerk on first use (works without a webhook tunnel). */
export async function requireCurrentUser(): Promise<User> {
  const userId = await requireUserId()
  const existing = await getUser(userId)
  if (existing) return existing
  const clerkUser = await currentUser()
  if (!clerkUser) throw unauthorized()
  return upsertUserFromProfile(profileFromClerk(clerkUser as unknown as ClerkProfileLike))
}
