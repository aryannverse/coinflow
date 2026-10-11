import 'server-only'
import { auth } from '@clerk/nextjs/server'
import { AppError } from './errors'

export async function requireUserId(): Promise<string> {
  const { userId } = await auth()
  if (!userId) throw new AppError('unauthorized', 'Please sign in to continue.', 401)
  return userId
}
