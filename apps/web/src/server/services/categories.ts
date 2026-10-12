import 'server-only'
import { and, asc, eq, isNull, or } from 'drizzle-orm'
import type { CategoryCreate } from '@/lib/schemas/categories'
import { getDb, type Db, type Tx } from '@/server/db/client'
import { pgErrorCode } from '@/server/db/errors'
import { categories, type Category } from '@/server/db/schema'
import { conflict, invalid } from '@/server/errors'

const visibleTo = (userId: string) => or(isNull(categories.userId), eq(categories.userId, userId))

export async function listCategories(userId: string, kind?: 'expense' | 'income'): Promise<Category[]> {
  return getDb()
    .select()
    .from(categories)
    .where(and(visibleTo(userId), eq(categories.system, false), kind ? eq(categories.kind, kind) : undefined))
    .orderBy(asc(categories.sort), asc(categories.name))
}

export async function createCategory(userId: string, input: CategoryCreate): Promise<Category> {
  try {
    const [row] = await getDb().insert(categories).values({ ...input, userId, sort: 500 }).returning()
    return row
  } catch (err) {
    if (pgErrorCode(err) === '23505') throw conflict('duplicate', 'You already have a category with that name.')
    throw err
  }
}

export async function requireUsableCategory(
  userId: string, categoryId: string, kind: 'expense' | 'income', executor: Db | Tx = getDb(),
): Promise<Category> {
  const [cat] = await executor.select().from(categories).where(and(eq(categories.id, categoryId), visibleTo(userId)))
  if (!cat || cat.kind !== kind || cat.system) {
    throw invalid('categoryId', kind === 'expense' ? 'Pick an expense category.' : 'Pick an income category.')
  }
  return cat
}
