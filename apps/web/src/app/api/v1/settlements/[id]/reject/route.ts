import { uuid } from '@/lib/schemas/common'
import { route } from '@/server/http'
import { resolveSettlement } from '@/server/services/groups/settlements'

export const POST = route<{ id: string }>(async ({ user, params }) => resolveSettlement(user.id, uuid.parse(params.id), 'rejected'))
