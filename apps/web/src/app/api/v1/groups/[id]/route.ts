import { uuid } from '@/lib/schemas/common'
import { groupPatchSchema } from '@/lib/schemas/groups'
import { parseJson, route } from '@/server/http'
import { archiveGroup, getGroup, updateGroup } from '@/server/services/groups/groups'

export const GET = route<{ id: string }>(async ({ user, params }) => ({ data: await getGroup(user.id, uuid.parse(params.id)) }))
export const PATCH = route<{ id: string }>(async ({ req, user, params }) =>
  updateGroup(user.id, uuid.parse(params.id), await parseJson(req, groupPatchSchema)))
export const DELETE = route<{ id: string }>(async ({ user, params }) => archiveGroup(user.id, uuid.parse(params.id)))
