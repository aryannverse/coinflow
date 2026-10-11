import { route } from '@/server/http'
import { getLatestCheckin } from '@/server/services/checkins'

export const GET = route(async ({ user }) => ({ data: await getLatestCheckin(user.id) }))
