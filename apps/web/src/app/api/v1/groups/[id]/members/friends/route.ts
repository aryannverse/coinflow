import { uuid } from '@/lib/schemas/common'
import { friendUserSchema } from '@/lib/schemas/friends'
import { parseJson, route } from '@/server/http'
import { addFriendMember } from '@/server/services/groups/members'

export const POST = route<{ id: string }>(async ({ req, user, params }) =>
  addFriendMember(user.id, uuid.parse(params.id), await parseJson(req, friendUserSchema)), { status: 201 })
