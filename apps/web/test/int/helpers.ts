import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { getDb } from '@/server/db/client'
import { categories, users, type Category, type NewUser, type User } from '@/server/db/schema'

export async function resetDb(): Promise<void> {
  const db = getDb()
  await db.execute(sql`delete from audit_log`)
  await db.execute(sql`delete from budgets`)
  await db.execute(sql`delete from transactions`)
  await db.execute(sql`delete from recurring_items`)
  await db.execute(sql`delete from balance_checkins`)
  await db.delete(categories).where(isNotNull(categories.userId))
  await db.execute(sql`delete from users`)
}

export async function makeUser(id = 'user_a', overrides: Partial<NewUser> = {}): Promise<User> {
  const [user] = await getDb()
    .insert(users)
    .values({ id, email: `${id}@example.com`, name: id, ...overrides })
    .returning()
  return user
}

export async function builtinCategory(name: string, kind: 'expense' | 'income' = 'expense'): Promise<Category> {
  const [cat] = await getDb()
    .select()
    .from(categories)
    .where(and(isNull(categories.userId), eq(categories.name, name), eq(categories.kind, kind)))
  if (!cat) throw new Error(`No built-in category ${name}/${kind}`)
  return cat
}
