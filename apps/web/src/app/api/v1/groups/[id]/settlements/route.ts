import { uuid } from '@/lib/schemas/common'
import { settlementCreateSchema } from '@/lib/schemas/groups'
import { parseJson, route } from '@/server/http'
import { listSettlements, markSettlement } from '@/server/services/groups/settlements'

export const GET = route<{ id: string }>(async ({ user, params }) => ({ data: await listSettlements(user.id, uuid.parse(params.id)) }))
export const POST = route<{ id: string }>(async ({ req, user, params }) =>
  markSettlement(user.id, uuid.parse(params.id), await parseJson(req, settlementCreateSchema)), { status: 201 })
