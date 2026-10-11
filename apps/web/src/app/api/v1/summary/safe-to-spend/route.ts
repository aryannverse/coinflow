import { route } from '@/server/http'
import { getSafeToSpend } from '@/server/services/safe-to-spend'

export const GET = route(async ({ user }) => ({ data: await getSafeToSpend(user.id) }))
