import { parseJson } from '@/server/http'
import { internalRoute } from '@/server/internal-http'
import { coachNotificationSchema, createCoachNotification } from '@/server/services/coach'

export const POST = internalRoute(async ({ req }) => createCoachNotification(await parseJson(req, coachNotificationSchema)), { status: 201 })
