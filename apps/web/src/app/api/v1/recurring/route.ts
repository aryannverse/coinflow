import { recurringCreateSchema } from '@/lib/schemas/recurring'
import { parseJson, route } from '@/server/http'
import { createRecurring, listRecurring } from '@/server/services/recurring'

export const GET = route(async ({ user }) => ({ data: await listRecurring(user.id) }))
export const POST = route(async ({ req, user }) => createRecurring(user.id, await parseJson(req, recurringCreateSchema)), { status: 201 })
