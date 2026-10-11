import 'server-only'
import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import { addDays, diffDays, istStartOfDay, type ISODate } from '@/lib/dates'
import { getDb } from '@/server/db/client'
import { categories, transactions } from '@/server/db/schema'

export type Insights = {
  from: ISODate; to: ISODate; totalExpense: number; totalIncome: number
  byDay: { date: ISODate; expense: number }[]
  byCategory: { categoryId: string; name: string; emoji: string; color: string; amount: number; previous: number }[]
}

const istDay = sql<string>`to_char(${transactions.occurredAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`

function window(userId: string, from: ISODate, to: ISODate) {
  return and(
    eq(transactions.userId, userId), eq(transactions.status, 'confirmed'), isNull(transactions.deletedAt),
    gte(transactions.occurredAt, istStartOfDay(from)), lt(transactions.occurredAt, istStartOfDay(addDays(to, 1))),
  )
}

async function byCategory(userId: string, from: ISODate, to: ISODate) {
  return getDb()
    .select({
      categoryId: categories.id, name: categories.name, emoji: categories.emoji, color: categories.color,
      amount: sql<number>`sum(${transactions.personalShare})`.mapWith(Number),
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(window(userId, from, to), eq(transactions.type, 'expense')))
    .groupBy(categories.id)
}

export async function getInsights(userId: string, from: ISODate, to: ISODate): Promise<Insights> {
  const length = diffDays(to, from) + 1
  const prevFrom = addDays(from, -length)
  const prevTo = addDays(from, -1)
  const db = getDb()

  const [totals, days, current, previous] = await Promise.all([
    db.select({
      expense: sql<number>`coalesce(sum(${transactions.personalShare}) filter (where ${transactions.type} = 'expense'), 0)`.mapWith(Number),
      income: sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = 'income'), 0)`.mapWith(Number),
    }).from(transactions).where(window(userId, from, to)),
    db.select({ date: istDay, expense: sql<number>`sum(${transactions.personalShare})`.mapWith(Number) })
      .from(transactions)
      .where(and(window(userId, from, to), eq(transactions.type, 'expense')))
      .groupBy(istDay).orderBy(istDay),
    byCategory(userId, from, to),
    byCategory(userId, prevFrom, prevTo),
  ])

  // Union of both windows: a category that had spend only last time still shows, with amount 0.
  const rows = new Map(current.map((c) => [c.categoryId, { ...c, previous: 0 }]))
  for (const p of previous) {
    const row = rows.get(p.categoryId)
    if (row) row.previous = p.amount
    else rows.set(p.categoryId, { ...p, amount: 0, previous: p.amount })
  }
  return {
    from, to,
    totalExpense: totals[0].expense,
    totalIncome: totals[0].income,
    byDay: days,
    byCategory: [...rows.values()].sort((a, b) => b.amount - a.amount || b.previous - a.previous || a.name.localeCompare(b.name)),
  }
}
