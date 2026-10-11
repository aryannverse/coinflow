import { uuid } from '@/lib/schemas/common'
import { route } from '@/server/http'
import { undo } from '@/server/services/audit'

export const POST = route<{ auditId: string }>(async ({ user, params }) => ({ data: await undo(user.id, uuid.parse(params.auditId)) }))
