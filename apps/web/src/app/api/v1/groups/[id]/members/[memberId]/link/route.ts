import { uuid } from '@/lib/schemas/common'
import { friendUserSchema } from '@/lib/schemas/friends'
import { parseJson, route } from '@/server/http'
import { linkFriend } from '@/server/services/groups/members'

type P = { id: string; memberId: string }
export const POST = route<P>(async ({ req, user, params }) =>
  linkFriend(user.id, uuid.parse(params.id), uuid.parse(params.memberId), await parseJson(req, friendUserSchema)))
