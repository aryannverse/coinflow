import { uuid } from '@/lib/schemas/common'
import { route } from '@/server/http'
import { dropFriendRequest } from '@/server/services/friends'

export const DELETE = route<{ id: string }>(async ({ user, params }) => dropFriendRequest(user.id, uuid.parse(params.id)))
