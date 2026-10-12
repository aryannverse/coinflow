import { uuid } from '@/lib/schemas/common'
import { route } from '@/server/http'
import { acceptFriendRequest } from '@/server/services/friends'

export const POST = route<{ id: string }>(async ({ user, params }) => acceptFriendRequest(user.id, uuid.parse(params.id)))
