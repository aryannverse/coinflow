import { uuid } from '@/lib/schemas/common'
import { route } from '@/server/http'
import { confirmDraft } from '@/server/services/transactions'

export const POST = route<{ id: string }>(async ({ user, params }) => confirmDraft(user.id, uuid.parse(params.id)))
