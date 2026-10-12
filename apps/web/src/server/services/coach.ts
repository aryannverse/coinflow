import 'server-only'
import { and, desc, eq, gte, inArray, isNotNull, isNull, like, lte, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { payCycle } from '@/lib/cycle'
import { addDays, istStartOfDay, toISTDate } from '@/lib/dates'
import { occurrencesInRange } from '@/lib/recurrence'
import { getDb } from '@/server/db/client'
import { categories, groupMembers, groups, notifications, recurringItems, settlements, transactions, users, type QuietHours } from '@/server/db/schema'
import { conflict, notFound } from '@/server/errors'
import { listBudgets } from './budgets'
import { notify } from './notifications'

const DAY_MS = 86_400_000
export const COACH_DAILY_CAP = 2 // spec §4.6

/** The facts the Python rules read (apps/agent/src/coinflow_agent/coach/rules.py docstring has the same shape). */
export type CoachFacts = {
  userId: string; name: string; quietHours: QuietHours | null; coachSentToday: number; sentKeys: string[]
  billsDueTomorrow: { recurringId: string; name: string; amountPaise: number; dueOn: string }[]
  budgets: { categoryId: string; name: string; spentPaise: number; limitPaise: number; cycleStart: string; daysLeft: number }[]
  settlementsAwaiting: { settlementId: string; groupId: string; groupName: string; fromName: string; amountPaise: number; markedAt: string }[]
  unclaimedPlaceholders: { memberId: string; groupId: string; groupName: string; displayName: string; createdAt: string }[]
  weekly: { spentPaise: number; transactionCount: number; topCategory: string | null } | null
}

const sentTodayFor = async (userId: string, now: Date) => {
  const [r] = await getDb().select({ n: sql<number>`count(*)`.mapWith(Number) }).from(notifications)
    .where(and(eq(notifications.userId, userId), like(notifications.kind, 'coach_%'), gte(notifications.createdAt, istStartOfDay(toISTDate(now)))))
  return r.n
}

export async function buildCoachDigest(now: Date = new Date()): Promise<CoachFacts[]> {
  const db = getDb()
  const today = toISTDate(now)
  const tomorrow = addDays(today, 1)
  const out: CoachFacts[] = []
  for (const u of await db.select().from(users).where(eq(users.coachEnabled, true))) {
    const keys = await db.select({ k: notifications.dedupeKey }).from(notifications)
      .where(and(eq(notifications.userId, u.id), isNotNull(notifications.dedupeKey), gte(notifications.createdAt, new Date(now.getTime() - 14 * DAY_MS))))
    const bills = (await db.select().from(recurringItems)
      .where(and(eq(recurringItems.userId, u.id), eq(recurringItems.active, true), eq(recurringItems.kind, 'bill'))))
      .filter((r) => occurrencesInRange(r.nextDueOn, r.cadence, r.anchorDay, tomorrow, tomorrow).length > 0)
      .map((r) => ({ recurringId: r.id, name: r.name, amountPaise: r.amount, dueOn: tomorrow }))
    const cycle = payCycle(today, u.paydayDay)
    const budgets = (await listBudgets(u.id, now)).map((b) => ({
      categoryId: b.categoryId, name: b.name, spentPaise: b.spent, limitPaise: b.monthlyLimit, cycleStart: cycle.cycleStart, daysLeft: cycle.daysLeft,
    }))
    const mine = (await db.select({ id: groupMembers.id }).from(groupMembers)
      .where(and(eq(groupMembers.userId, u.id), isNull(groupMembers.removedAt)))).map((m) => m.id)
    const awaiting = mine.length === 0 ? [] : await db
      .select({ s: settlements, groupName: groups.name, fromName: groupMembers.displayName })
      .from(settlements)
      .innerJoin(groups, eq(groups.id, settlements.groupId))
      .innerJoin(groupMembers, eq(groupMembers.id, settlements.fromMember))
      .where(and(inArray(settlements.toMember, mine), eq(settlements.status, 'pending'), lte(settlements.markedAt, new Date(now.getTime() - DAY_MS))))
    const unclaimed = await db.select({ m: groupMembers, groupName: groups.name }).from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(and(eq(groupMembers.addedBy, u.id), isNull(groupMembers.userId), isNull(groupMembers.removedAt), isNull(groups.archivedAt),
        lte(groupMembers.createdAt, new Date(now.getTime() - 3 * DAY_MS))))
    const spend = and(
      eq(transactions.userId, u.id), eq(transactions.type, 'expense'), eq(transactions.status, 'confirmed'), isNull(transactions.deletedAt),
      ne(transactions.source, 'settlement'), gte(transactions.occurredAt, istStartOfDay(addDays(today, -6))),
    )
    const [week] = await db.select({
      spent: sql<number>`coalesce(sum(${transactions.personalShare}), 0)`.mapWith(Number),
      n: sql<number>`count(*) filter (where ${transactions.personalShare} > 0)`.mapWith(Number),
    }).from(transactions).where(spend)
    const [top] = await db.select({ name: categories.name }).from(transactions)
      .innerJoin(categories, eq(categories.id, transactions.categoryId)).where(spend)
      .groupBy(categories.name).orderBy(desc(sql`sum(${transactions.personalShare})`)).limit(1)
    out.push({
      userId: u.id, name: u.name, quietHours: u.quietHours ?? null,
      coachSentToday: await sentTodayFor(u.id, now),
      sentKeys: keys.map((k) => k.k as string),
      billsDueTomorrow: bills,
      budgets,
      settlementsAwaiting: awaiting.map(({ s, groupName, fromName }) => ({
        settlementId: s.id, groupId: s.groupId, groupName, fromName, amountPaise: s.amountPaise, markedAt: s.markedAt.toISOString(),
      })),
      unclaimedPlaceholders: unclaimed.map(({ m, groupName }) => ({
        memberId: m.id, groupId: m.groupId, groupName, displayName: m.displayName, createdAt: m.createdAt.toISOString(),
      })),
      weekly: week.n > 0 ? { spentPaise: week.spent, transactionCount: week.n, topCategory: top?.name ?? null } : null,
    })
  }
  return out
}

export const coachNotificationSchema = z.object({
  userId: z.string().min(1).max(64),
  kind: z.string().regex(/^coach_[a-z_]{1,40}$/),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(300),
  href: z.string().regex(/^\/[A-Za-z0-9/_?=&#.%-]*$/).max(200),
  dedupeKey: z.string().min(1).max(120),
}).strict()
export type CoachNotification = z.infer<typeof coachNotificationSchema>

/** Server-side guard rails for the coach (spec §4.6): only to users who want it, ≤ 2 per IST day, one per dedupe key. */
export async function createCoachNotification(input: CoachNotification, now: Date = new Date()): Promise<{ data: { sent: true } }> {
  return getDb().transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, input.userId)).for('update') // serialises the daily cap
    if (!u) throw notFound('account')
    if (!u.coachEnabled) throw conflict('coach_off', 'Coach notifications are off for this person.')
    const [sent] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(notifications)
      .where(and(eq(notifications.userId, u.id), like(notifications.kind, 'coach_%'), gte(notifications.createdAt, istStartOfDay(toISTDate(now)))))
    if (sent.n >= COACH_DAILY_CAP) throw conflict('coach_cap', 'Two nudges already went out today.')
    const inserted = await notify(tx, [{
      userId: u.id, kind: input.kind as `coach_${string}`, title: input.title, body: input.body, href: input.href,
      dedupeKey: input.dedupeKey, payload: { coach: true },
    }])
    if (inserted === 0) throw conflict('duplicate', 'That nudge was already sent.')
    return { data: { sent: true } }
  })
}
