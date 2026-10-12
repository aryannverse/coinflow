import { uuid } from '@/lib/schemas/common'
import { route } from '@/server/http'
import { getInvite, regenerateInvite } from '@/server/services/groups/invites'

export const GET = route<{ id: string }>(async ({ user, params }) => ({ data: await getInvite(user.id, uuid.parse(params.id)) }))
export const POST = route<{ id: string }>(async ({ user, params }) => ({ data: await regenerateInvite(user.id, uuid.parse(params.id)) }), { status: 201 })
