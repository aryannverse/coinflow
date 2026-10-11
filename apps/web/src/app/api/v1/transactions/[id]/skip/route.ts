import { uuid } from '@/lib/schemas/common'
import { route } from '@/server/http'
import { skipDraft } from '@/server/services/transactions'

export const POST = route<{ id: string }>(async ({ user, params }) => skipDraft(user.id, uuid.parse(params.id)))
