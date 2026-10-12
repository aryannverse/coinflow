import { uuid } from '@/lib/schemas/common'
import { memberCreateSchema } from '@/lib/schemas/groups'
import { parseJson, route } from '@/server/http'
import { addPlaceholder, listMembers } from '@/server/services/groups/members'

export const GET = route<{ id: string }>(async ({ user, params }) => ({ data: await listMembers(user.id, uuid.parse(params.id)) }))
export const POST = route<{ id: string }>(async ({ req, user, params }) =>
  addPlaceholder(user.id, uuid.parse(params.id), await parseJson(req, memberCreateSchema)), { status: 201 })
