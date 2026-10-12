import { route } from '@/server/http'
import { listFriends } from '@/server/services/friends'

export const GET = route(async ({ user }) => ({ data: await listFriends(user.id) }))
