import { uuid } from '@/lib/schemas/common'
import { route } from '@/server/http'
import { getGroupBalances } from '@/server/services/groups/balances'

export const GET = route<{ id: string }>(async ({ user, params }) => ({ data: await getGroupBalances(user.id, uuid.parse(params.id)) }))
