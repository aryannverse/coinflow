import { uuid } from '@/lib/schemas/common'
import { memberPatchSchema } from '@/lib/schemas/groups'
import { parseJson, route } from '@/server/http'
import { removeMember, updateMember } from '@/server/services/groups/members'

type P = { id: string; memberId: string }
export const PATCH = route<P>(async ({ req, user, params }) =>
  updateMember(user.id, uuid.parse(params.id), uuid.parse(params.memberId), await parseJson(req, memberPatchSchema)))
export const DELETE = route<P>(async ({ user, params }) => removeMember(user.id, uuid.parse(params.id), uuid.parse(params.memberId)))
