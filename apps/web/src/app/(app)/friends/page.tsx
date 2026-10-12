import { redirect } from 'next/navigation'
import { FriendsView } from '@/components/friends/friends-view'
import type { FriendsDTO } from '@/lib/api-types'
import { requireCurrentUser } from '@/server/auth'
import { AppError } from '@/server/errors'
import { listFriends } from '@/server/services/friends'

export const metadata = { title: 'Friends' }
const json = <T,>(v: unknown) => JSON.parse(JSON.stringify(v)) as T

export default async function FriendsPage() {
  const user = await requireCurrentUser().catch((err) => {
    if (err instanceof AppError && err.status === 401) redirect('/sign-in')
    throw err
  })
  return <FriendsView initial={json<FriendsDTO>(await listFriends(user.id))} />
}
