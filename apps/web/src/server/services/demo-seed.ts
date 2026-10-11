import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { payCycle } from '@/lib/cycle'
import { addDays, istNoon, toISTDate } from '@/lib/dates'
import { getDb } from '@/server/db/client'
import { categories, transactions, users } from '@/server/db/schema'
import { conflict } from '@/server/errors'
import { createCheckin } from './checkins'
import { createRecurring } from './recurring'
import { createTransaction } from './transactions'
import { updateMe } from './users'

const SPENDS: [string, string, number][] = [
  ['Food & Dining', 'Toit dinner', 124_000], ['Transport', 'Uber to office', 31_000], ['Groceries', 'Blinkit', 86_500],
  ['Food & Dining', 'Chai & samosa', 6_000], ['Entertainment', 'PVR tickets', 58_000], ['Shopping', 'Myntra', 249_900],
  ['Transport', 'Metro recharge', 50_000], ['Food & Dining', 'Swiggy biryani', 38_900], ['Health', 'Pharmacy', 21_000],
  ['Personal Care', 'Haircut', 35_000], ['Food & Dining', 'Third Wave coffee', 27_000], ['Groceries', 'Zepto', 42_300],
]

/** Deterministic 60-day history for class demos. Runs once, on an empty account. Never run against production data. */
export async function seedDemoData(userId: string, now: Date = new Date()): Promise<{ transactions: number }> {
  const [existing] = await getDb().select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt))).limit(1)
  if (existing) throw conflict('already_seeded', 'This account already has data — demo seed only runs on an empty account.')

  const builtins = await getDb().select().from(categories).where(isNull(categories.userId))
  const cat = (name: string, kind: 'expense' | 'income' = 'expense') => {
    const found = builtins.find((c) => c.name === name && c.kind === kind)
    if (!found) throw new Error(`Demo seed needs the built-in ${kind} category "${name}", but it does not exist.`)
    return found.id
  }
  const today = toISTDate(now)

  await updateMe(userId, { paydayDay: 1, monthlyIncome: 9_000_000, fixedCostsEstimate: 800_000, upiId: 'demo@okaxis' })
  await createCheckin(userId, 6_200_000, new Date(now.getTime() - 20 * 86_400_000))

  let count = 0
  for (let day = 60; day >= 0; day--) {
    const date = addDays(today, -day)
    const picks = [SPENDS[day % SPENDS.length], ...(day % 3 === 0 ? [SPENDS[(day * 7) % SPENDS.length]] : [])]
    for (const [name, note, amount] of picks) {
      await createTransaction(userId, {
        type: 'expense', amount: amount + (day % 5) * 1_000, categoryId: cat(name), note,
        method: day % 4 === 0 ? 'card' : 'upi', occurredAt: istNoon(date),
      })
      count++
    }
  }
  const { nextPayday } = payCycle(today, 1) // first of next month
  await createRecurring(userId, { kind: 'bill', name: 'Rent', amount: 1_800_000, cadence: 'monthly', nextDueOn: addDays(nextPayday, 4), categoryId: cat('Rent') })
  await createRecurring(userId, { kind: 'bill', name: 'Netflix', amount: 64_900, cadence: 'monthly', nextDueOn: addDays(today, 9), categoryId: cat('Subscriptions') })
  await createRecurring(userId, { kind: 'bill', name: 'Jio recharge', amount: 34_900, cadence: 'monthly', nextDueOn: addDays(today, 4), categoryId: cat('Bills & Utilities') })
  await createRecurring(userId, { kind: 'income', name: 'Salary', amount: 9_000_000, cadence: 'monthly', nextDueOn: nextPayday, categoryId: cat('Salary', 'income') })
  return { transactions: count }
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const [u] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, email))
  return u?.id ?? null
}
