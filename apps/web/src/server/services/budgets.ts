import 'server-only'
import { and, asc, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import { payCycle } from '@/lib/cycle'
import { addDays, istStartOfDay, toISTDate } from '@/lib/dates'
import { getDb } from '@/server/db/client'
import { budgets, categories, transactions, type Budget } from '@/server/db/schema'
import { conflict, notFound } from '@/server/errors'
import { recordAudit } from './audit'
import { requireUsableCategory } from './categories'
import { getUser } from './users'

export type BudgetWithSpend = {
  budgetId: string; categoryId: string; name: string; emoji: string; color: string; monthlyLimit: number; spent: number
}

export async function listBudgets(userId: string, now: Date = new Date()): Promise<BudgetWithSpend[]> {
  const user = await getUser(userId)
  if (!user) throw notFound('account')
  const cycle = payCycle(toISTDate(now), user.paydayDay)
  const spent = sql<number>`coalesce(sum(${transactions.personalShare}), 0)`.mapWith(Number)
  return getDb()
    .select({
      budgetId: budgets.id, categoryId: budgets.categoryId, name: categories.name, emoji: categories.emoji,
      color: categories.color, monthlyLimit: budgets.monthlyLimit, spent,
    })
    .from(budgets)
    .innerJoin(categories, eq(categories.id, budgets.categoryId))
    .leftJoin(transactions, and(
      eq(transactions.categoryId, budgets.categoryId), eq(transactions.userId, userId),
      eq(transactions.type, 'expense'), eq(transactions.status, 'confirmed'), isNull(transactions.deletedAt),
      gte(transactions.occurredAt, istStartOfDay(cycle.cycleStart)),
      lt(transactions.occurredAt, istStartOfDay(addDays(cycle.cycleEnd, 1))),
    ))
    .where(eq(budgets.userId, userId))
    .groupBy(budgets.id, categories.id)
    .orderBy(asc(categories.sort), asc(categories.name))
}

export async function upsertBudget(userId: string, categoryId: string, monthlyLimit: number) {
  return getDb().transaction(async (tx) => {
    await requireUsableCategory(userId, categoryId, 'expense', tx)
    // Insert-first, so concurrent first saves agree on who created the row; the rest lock it and update.
    const [created] = await tx.insert(budgets).values({ userId, categoryId, monthlyLimit })
      .onConflictDoNothing({ target: [budgets.userId, budgets.categoryId] })
      .returning()
    if (created) {
      const auditId = await recordAudit(tx, { userId, entity: 'budget', entityId: created.id, action: 'create', before: null, after: created })
      return { data: created as Budget, auditId }
    }
    const own = and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId))
    const [before] = await tx.select().from(budgets).where(own).for('update')
    if (!before) throw conflict('budget_changed', 'That budget just changed — please try again.') // deleted mid-save
    const [after] = await tx.update(budgets).set({ monthlyLimit, updatedAt: new Date() }).where(own).returning()
    const auditId = await recordAudit(tx, { userId, entity: 'budget', entityId: after.id, action: 'update', before, after })
    return { data: after as Budget, auditId }
  })
}

export async function deleteBudget(userId: string, categoryId: string) {
  return getDb().transaction(async (tx) => {
    const [before] = await tx.delete(budgets)
      .where(and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId))).returning()
    if (!before) throw notFound('budget')
    const auditId = await recordAudit(tx, { userId, entity: 'budget', entityId: before.id, action: 'delete', before, after: null })
    return { auditId }
  })
}
