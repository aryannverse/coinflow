import { uuid } from '@/lib/schemas/common'
import { groupExpenseInputSchema } from '@/lib/schemas/groups'
import { parseJson, route } from '@/server/http'
import { deleteGroupExpense, getGroupExpense, updateGroupExpense } from '@/server/services/groups/expenses'

type P = { id: string; expenseId: string }
export const GET = route<P>(async ({ user, params }) => ({ data: await getGroupExpense(user.id, uuid.parse(params.id), uuid.parse(params.expenseId)) }))
export const PATCH = route<P>(async ({ req, user, params }) =>
  updateGroupExpense(user.id, uuid.parse(params.id), uuid.parse(params.expenseId), await parseJson(req, groupExpenseInputSchema)))
export const DELETE = route<P>(async ({ user, params }) => deleteGroupExpense(user.id, uuid.parse(params.id), uuid.parse(params.expenseId)))
