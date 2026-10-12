import { uuid } from '@/lib/schemas/common'
import { pageQuerySchema } from '@/lib/schemas/groups'
import { parseQuery, route } from '@/server/http'
import { listActivity } from '@/server/services/groups/activity'

export const GET = route<{ id: string }>(async ({ req, user, params }) =>
  listActivity(user.id, uuid.parse(params.id), parseQuery(req, pageQuerySchema)))
