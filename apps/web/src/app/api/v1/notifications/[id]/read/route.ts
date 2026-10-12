import { uuid } from '@/lib/schemas/common'
import { route } from '@/server/http'
import { markRead } from '@/server/services/notifications'

export const POST = route<{ id: string }>(async ({ user, params }) => ({ data: await markRead(user.id, uuid.parse(params.id)) }))
