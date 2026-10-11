import { uuid } from '@/lib/schemas/common'
import { transactionPatchSchema } from '@/lib/schemas/transactions'
import { parseJson, route } from '@/server/http'
import { deleteTransaction, updateTransaction } from '@/server/services/transactions'

export const PATCH = route<{ id: string }>(async ({ req, user, params }) =>
  updateTransaction(user.id, uuid.parse(params.id), await parseJson(req, transactionPatchSchema)))
export const DELETE = route<{ id: string }>(async ({ user, params }) => deleteTransaction(user.id, uuid.parse(params.id)))
