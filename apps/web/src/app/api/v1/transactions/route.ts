import { transactionCreateSchema, transactionListQuerySchema } from '@/lib/schemas/transactions'
import { parseJson, parseQuery, route } from '@/server/http'
import { createTransaction, listTransactions } from '@/server/services/transactions'

export const GET = route(async ({ req, user }) => listTransactions(user.id, parseQuery(req, transactionListQuerySchema)))
export const POST = route(async ({ req, user }) => createTransaction(user.id, await parseJson(req, transactionCreateSchema)), { status: 201 })
