import { friendEmailSchema } from '@/lib/schemas/friends'
import { parseQuery, route } from '@/server/http'
import { searchByEmail } from '@/server/services/friends'

export const GET = route(async ({ req, user }) => ({ data: await searchByEmail(user.id, parseQuery(req, friendEmailSchema).email) }))
