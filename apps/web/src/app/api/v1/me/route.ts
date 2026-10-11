import { mePatchSchema } from '@/lib/schemas/me'
import { parseJson, route } from '@/server/http'
import { updateMe } from '@/server/services/users'

export const GET = route(async ({ user }) => ({ data: user }))
export const PATCH = route(async ({ req, user }) => ({ data: await updateMe(user.id, await parseJson(req, mePatchSchema)) }))
