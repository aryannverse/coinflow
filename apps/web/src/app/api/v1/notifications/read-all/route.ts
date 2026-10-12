import { route } from '@/server/http'
import { markAllRead } from '@/server/services/notifications'

export const POST = route(async ({ user }) => ({ data: await markAllRead(user.id) }))
