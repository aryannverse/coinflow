import { checkinCreateSchema } from '@/lib/schemas/checkins'
import { parseJson, route } from '@/server/http'
import { createCheckin } from '@/server/services/checkins'

export const POST = route(async ({ req, user }) => createCheckin(user.id, (await parseJson(req, checkinCreateSchema)).amount), { status: 201 })
