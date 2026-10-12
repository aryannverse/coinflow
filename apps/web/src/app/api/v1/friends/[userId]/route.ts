import { friendUserId } from '@/lib/schemas/friends'
import { route } from '@/server/http'
import { unfriend } from '@/server/services/friends'

export const DELETE = route<{ userId: string }>(async ({ user, params }) => unfriend(user.id, friendUserId.parse(params.userId)))
