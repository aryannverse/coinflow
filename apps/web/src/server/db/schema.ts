import { sql } from 'drizzle-orm'
import {
  bigint, bigserial, boolean, check, date, index, jsonb, pgTable, smallint, text, timestamp, unique, uuid,
} from 'drizzle-orm/pg-core'

const money = (name: string) => bigint(name, { mode: 'number' })
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(), // Clerk user id
    name: text('name').notNull().default(''),
    email: text('email').notNull().unique(),
    avatarUrl: text('avatar_url'),
    upiId: text('upi_id'),
    upiQrUrl: text('upi_qr_url'),
    paydayDay: smallint('payday_day').notNull().default(1),
    monthlyIncome: money('monthly_income'),
    fixedCostsEstimate: money('fixed_costs_estimate').notNull().default(0),
    onboardingStep: smallint('onboarding_step').notNull().default(0),
    onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
    theme: text('theme', { enum: ['dark', 'light', 'system'] }).notNull().default('dark'),
    reducedMotion: text('reduced_motion', { enum: ['on', 'off', 'system'] }).notNull().default('system'),
    ...timestamps,
  },
  (t) => [check('users_payday_day_range', sql`${t.paydayDay} between 1 and 31`)],
)

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }), // null = built-in
    name: text('name').notNull(),
    emoji: text('emoji').notNull(),
    color: text('color').notNull(),
    kind: text('kind', { enum: ['expense', 'income'] }).notNull(),
    sort: smallint('sort').notNull().default(100),
    ...timestamps,
  },
  (t) => [unique('categories_owner_name_kind').on(t.userId, t.name, t.kind).nullsNotDistinct()],
)

export const balanceCheckins = pgTable(
  'balance_checkins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    amount: money('amount').notNull(),
    takenAt: timestamp('taken_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index('balance_checkins_user_time').on(t.userId, t.takenAt.desc())],
)

export const recurringItems = pgTable(
  'recurring_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['bill', 'income'] }).notNull(),
    name: text('name').notNull(),
    amount: money('amount').notNull(),
    cadence: text('cadence', { enum: ['weekly', 'monthly', 'yearly'] }).notNull(),
    nextDueOn: date('next_due_on', { mode: 'string' }).notNull(),
    anchorDay: smallint('anchor_day').notNull(), // day-of-month the schedule snaps back to (prevents 31→28→28 drift)
    categoryId: uuid('category_id').notNull().references(() => categories.id),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    check('recurring_amount_positive', sql`${t.amount} > 0`),
    check('recurring_anchor_range', sql`${t.anchorDay} between 1 and 31`),
  ],
)

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['expense', 'income'] }).notNull(),
    amount: money('amount').notNull(),
    personalShare: money('personal_share').notNull(),
    categoryId: uuid('category_id').notNull().references(() => categories.id),
    note: text('note'),
    method: text('method', { enum: ['upi', 'cash', 'card', 'other'] }).notNull().default('upi'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    source: text('source', { enum: ['manual', 'recurring', 'voice', 'scan', 'chat'] }).notNull().default('manual'),
    status: text('status', { enum: ['draft', 'confirmed'] }).notNull().default('confirmed'),
    recurringItemId: uuid('recurring_item_id').references(() => recurringItems.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('transactions_amount_positive', sql`${t.amount} > 0`),
    check('transactions_share_range', sql`${t.personalShare} >= 0 and ${t.personalShare} <= ${t.amount}`),
    index('transactions_user_time').on(t.userId, t.occurredAt.desc()).where(sql`${t.deletedAt} is null`),
  ],
)

export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
    monthlyLimit: money('monthly_limit').notNull(),
    ...timestamps,
  },
  (t) => [
    unique('budgets_user_category').on(t.userId, t.categoryId),
    check('budgets_limit_positive', sql`${t.monthlyLimit} > 0`),
  ],
)

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seq: bigserial('seq', { mode: 'number' }).notNull(), // strict ordering; createdAt can tie
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    entity: text('entity', { enum: ['transaction', 'recurring_item', 'budget', 'balance_checkin'] }).notNull(),
    entityId: uuid('entity_id').notNull(),
    action: text('action', { enum: ['create', 'update', 'delete', 'restore', 'confirm'] }).notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    actor: text('actor', { enum: ['user', 'agent'] }).notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_entity').on(t.userId, t.entity, t.entityId, t.seq.desc())],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Category = typeof categories.$inferSelect
export type BalanceCheckin = typeof balanceCheckins.$inferSelect
export type RecurringItem = typeof recurringItems.$inferSelect
export type Transaction = typeof transactions.$inferSelect
export type Budget = typeof budgets.$inferSelect
export type AuditRow = typeof auditLog.$inferSelect
