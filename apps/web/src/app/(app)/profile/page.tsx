import { redirect } from 'next/navigation'
import { ProfileView } from '@/components/profile/profile-view'
import type { MeDTO } from '@/lib/api-types'
import { requireCurrentUser } from '@/server/auth'
import { AppError } from '@/server/errors'

export const metadata = { title: 'Profile' }
/** Server values to client props: Dates become ISO strings, the same shape the API sends (`Serialized<T>`). */
const json = <T,>(v: unknown) => JSON.parse(JSON.stringify(v)) as T

export default async function ProfilePage() {
  const user = await requireCurrentUser().catch((err) => {
    if (err instanceof AppError && err.status === 401) redirect('/sign-in')
    throw err
  })
  // Same shape and cache key (`qk.me`) as GET /me, so the client starts with this and refetches on its own schedule.
  return <ProfileView initial={json<MeDTO>(user)} />
}
