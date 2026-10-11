import { uuid } from '@/lib/schemas/common'
import { recurringPatchSchema } from '@/lib/schemas/recurring'
import { parseJson, route } from '@/server/http'
import { deleteRecurring, updateRecurring } from '@/server/services/recurring'

export const PATCH = route<{ id: string }>(async ({ req, user, params }) =>
  updateRecurring(user.id, uuid.parse(params.id), await parseJson(req, recurringPatchSchema)))
export const DELETE = route<{ id: string }>(async ({ user, params }) => deleteRecurring(user.id, uuid.parse(params.id)))
