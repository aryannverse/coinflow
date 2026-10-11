import { route } from '@/server/http'
import { listBudgets } from '@/server/services/budgets'

export const GET = route(async ({ user }) => ({ data: await listBudgets(user.id) }))
