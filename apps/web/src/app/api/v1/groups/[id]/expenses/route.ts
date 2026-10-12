import { uuid } from '@/lib/schemas/common'
import { groupExpenseInputSchema, pageQuerySchema } from '@/lib/schemas/groups'
import { parseJson, parseQuery, route } from '@/server/http'
import { createGroupExpense, listGroupExpenses } from '@/server/services/groups/expenses'

export const GET = route<{ id: string }>(async ({ req, user, params }) =>
  listGroupExpenses(user.id, uuid.parse(params.id), parseQuery(req, pageQuerySchema)))
export const POST = route<{ id: string }>(async ({ req, user, params }) =>
  createGroupExpense(user.id, uuid.parse(params.id), await parseJson(req, groupExpenseInputSchema)), { status: 201 })
