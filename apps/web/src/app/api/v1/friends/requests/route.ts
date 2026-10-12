import { friendEmailSchema } from '@/lib/schemas/friends'
import { parseJson, route } from '@/server/http'
import { sendFriendRequest } from '@/server/services/friends'

export const POST = route(async ({ req, user }) => sendFriendRequest(user.id, (await parseJson(req, friendEmailSchema)).email), { status: 201 })
