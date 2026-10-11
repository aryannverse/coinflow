import { toISTDate } from '@/lib/dates'
import { transactionCreateSchema, transactionListQuerySchema } from '@/lib/schemas/transactions'
import { parseJson, parseQuery, route } from '@/server/http'
import { materializeDueRecurring } from '@/server/services/recurring'
import { createTransaction, listTransactions } from '@/server/services/transactions'

export const GET = route(async ({ req, user }) => {
  const query = parseQuery(req, transactionListQuerySchema)
  // The draft inbox must show bills due today even before anything has read Safe-to-Spend.
  if (query.status === 'draft') await materializeDueRecurring(user.id, toISTDate(new Date()))
  return listTransactions(user.id, query)
})
export const POST = route(async ({ req, user }) => createTransaction(user.id, await parseJson(req, transactionCreateSchema)), { status: 201 })
