import { budgetPutSchema } from '@/lib/schemas/budgets'
import { uuid } from '@/lib/schemas/common'
import { parseJson, route } from '@/server/http'
import { deleteBudget, upsertBudget } from '@/server/services/budgets'

export const PUT = route<{ categoryId: string }>(async ({ req, user, params }) =>
  upsertBudget(user.id, uuid.parse(params.categoryId), (await parseJson(req, budgetPutSchema)).monthlyLimit))
export const DELETE = route<{ categoryId: string }>(async ({ user, params }) => deleteBudget(user.id, uuid.parse(params.categoryId)))
