import { claimSchema } from '@/lib/schemas/groups'
import { parseJson, route } from '@/server/http'
import { claimInvite, previewInvite } from '@/server/services/groups/invites'

export const GET = route<{ token: string }>(async ({ user, params }) => ({ data: await previewInvite(user.id, params.token) }))
export const POST = route<{ token: string }>(async ({ req, user, params }) =>
  ({ data: await claimInvite(user.id, params.token, await parseJson(req, claimSchema)) }), { status: 201 })
