import { internalRoute } from '@/server/internal-http'
import { buildCoachDigest } from '@/server/services/coach'

export const dynamic = 'force-dynamic'
export const GET = internalRoute(async () => ({ data: await buildCoachDigest() }))
