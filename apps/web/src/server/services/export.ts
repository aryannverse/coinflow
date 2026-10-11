import 'server-only'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { toISTDate } from '@/lib/dates'
import { paiseToRupeeString } from '@/lib/money'
import { getDb } from '@/server/db/client'
import { categories, transactions } from '@/server/db/schema'

const HEADER = ['date', 'type', 'amount_inr', 'category', 'note', 'method', 'status', 'source']

/** RFC 4180 quoting plus OWASP CSV-injection neutralization. */
export function csvCell(value: string): string {
  let v = value
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export async function exportTransactionsCsv(userId: string): Promise<string> {
  const rows = await getDb()
    .select({
      occurredAt: transactions.occurredAt, type: transactions.type, amount: transactions.amount,
      category: categories.name, note: transactions.note, method: transactions.method,
      status: transactions.status, source: transactions.source,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))
    .orderBy(asc(transactions.occurredAt))

  const lines = rows.map((r) =>
    [toISTDate(r.occurredAt), r.type, paiseToRupeeString(r.amount), r.category, r.note ?? '', r.method, r.status, r.source]
      .map(csvCell)
      .join(','),
  )
  return [HEADER.join(','), ...lines].join('\n') + '\n'
}
