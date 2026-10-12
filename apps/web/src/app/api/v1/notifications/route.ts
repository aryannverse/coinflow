import { notificationListQuerySchema } from '@/lib/schemas/groups'
import { parseQuery, route } from '@/server/http'
import { listNotifications } from '@/server/services/notifications'

export const GET = route(async ({ req, user }) => listNotifications(user.id, parseQuery(req, notificationListQuerySchema)))
