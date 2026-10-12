import { groupCreateSchema, groupListQuerySchema } from '@/lib/schemas/groups'
import { parseJson, parseQuery, route } from '@/server/http'
import { createGroup, listGroups } from '@/server/services/groups/groups'

export const GET = route(async ({ req, user }) => ({
  data: await listGroups(user.id, { archived: parseQuery(req, groupListQuerySchema).archived === 'true' }),
}))
export const POST = route(async ({ req, user }) => createGroup(user.id, await parseJson(req, groupCreateSchema)), { status: 201 })
