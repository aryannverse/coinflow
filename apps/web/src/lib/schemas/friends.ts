import { z } from 'zod'

/** Exact email only (spec §3.8): trimmed and lower-cased, so "  Asha@Example.com " finds asha@example.com. */
export const friendEmailSchema = z.object({
  email: z.string().trim().toLowerCase().max(254, 'That email is too long.').pipe(z.email('Enter their full email address.')),
}).strict()
export type FriendEmailBody = z.infer<typeof friendEmailSchema>

/** A Clerk user id ("user_…"); only ever compared against rows we already hold. */
export const friendUserId = z.string().trim().min(1).max(64)
export const friendUserSchema = z.object({ userId: friendUserId }).strict()
export type FriendUserBody = z.infer<typeof friendUserSchema>
