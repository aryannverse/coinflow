import { route } from '@/server/http'
import { exportTransactionsCsv } from '@/server/services/export'

export const GET = route(async ({ user }) =>
  new Response(await exportTransactionsCsv(user.id), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'cache-control': 'no-store',
      'content-disposition': 'attachment; filename="coinflow-transactions.csv"',
    },
  }))
