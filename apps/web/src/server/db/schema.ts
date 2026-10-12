import { sql } from 'drizzle-orm'
import {
  bigint, bigserial, boolean, check, date, index, jsonb, pgTable, primaryKey, smallint, text, timestamp, unique, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core'

const money = (name: string) => bigint(name, { mode: 'number' })
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}

/** Coach quiet hours in IST, 'HH:MM' 24h. A window may wrap midnight (22:00 → 07:00). */
export type QuietHours = { start: string; end: string }

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
    countReceivables: boolean('count_receivables').notNull().default(true), // spec §2.3
    coachEnabled: boolean('coach_enabled').notNull().default(true),
    quietHours: jsonb('quiet_hours').$type<QuietHours | null>(),
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
    /** Built-in rows only the app uses ("Settle up"): hidden from pickers, refused for manual entries. */
    system: boolean('system').notNull().default(false),
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

// ── Part B: groups & events ───────────────────────────────────────────────────────────────────────

export const groups = pgTable(
  'groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    emoji: text('emoji').notNull().default('👥'),
    color: text('color').notNull().default('#C8F560'),
    kind: text('kind', { enum: ['group', 'event'] }).notNull().default('group'),
    startsOn: date('starts_on', { mode: 'string' }),
    endsOn: date('ends_on', { mode: 'string' }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [check('groups_dates_order', sql`${t.startsOn} is null or ${t.endsOn} is null or ${t.endsOn} >= ${t.startsOn}`)],
)

export const groupMembers = pgTable(
  'group_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }), // null = placeholder
    displayName: text('display_name').notNull(),
    upiId: text('upi_id'), // manual, placeholders only; claimed members use users.upi_id
    role: text('role', { enum: ['creator', 'member'] }).notNull().default('member'),
    addedBy: text('added_by').references(() => users.id, { onDelete: 'set null' }), // the "inviter" for the coach
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // One live membership per user per group (spec §3.3 step 5); a removed row may stay for history.
    uniqueIndex('group_members_user_unique').on(t.groupId, t.userId).where(sql`${t.userId} is not null and ${t.removedAt} is null`),
    index('group_members_user').on(t.userId),
  ],
)

export const groupInvites = pgTable(
  'group_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(), // sha256(token); the token itself is never stored
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('group_invites_one_active').on(t.groupId).where(sql`${t.revokedAt} is null`)],
)

export const groupExpenses = pgTable(
  'group_expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    amountPaise: money('amount_paise').notNull(),
    categoryId: uuid('category_id').notNull().references(() => categories.id),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    splitMode: text('split_mode', { enum: ['equal', 'exact', 'shares', 'percent', 'itemized'] }).notNull(),
    taxPaise: money('tax_paise').notNull().default(0),
    tipPaise: money('tip_paise').notNull().default(0),
    discountPaise: money('discount_paise').notNull().default(0),
    createdBy: uuid('created_by').notNull().references(() => groupMembers.id),
    updatedBy: uuid('updated_by').notNull().references(() => groupMembers.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('group_expenses_amount_positive', sql`${t.amountPaise} > 0`),
    check('group_expenses_adjustments', sql`${t.taxPaise} >= 0 and ${t.tipPaise} >= 0 and ${t.discountPaise} >= 0`),
    index('group_expenses_group_time').on(t.groupId, t.occurredAt.desc()).where(sql`${t.deletedAt} is null`),
  ],
)

export const groupExpensePayers = pgTable(
  'group_expense_payers',
  {
    expenseId: uuid('expense_id').notNull().references(() => groupExpenses.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').notNull().references(() => groupMembers.id),
    paidPaise: money('paid_paise').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.expenseId, t.memberId] }),
    check('group_expense_payers_nonneg', sql`${t.paidPaise} >= 0`),
    index('group_expense_payers_member').on(t.memberId),
  ],
)

export const groupExpenseShares = pgTable(
  'group_expense_shares',
  {
    expenseId: uuid('expense_id').notNull().references(() => groupExpenses.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').notNull().references(() => groupMembers.id),
    sharePaise: money('share_paise').notNull(),
    inputValue: money('input_value'), // exact → paise, shares → count, percent → basis points; null for equal/itemized
  },
  (t) => [
    primaryKey({ columns: [t.expenseId, t.memberId] }),
    check('group_expense_shares_nonneg', sql`${t.sharePaise} >= 0`),
    index('group_expense_shares_member').on(t.memberId),
  ],
)

export const groupExpenseItems = pgTable(
  'group_expense_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    expenseId: uuid('expense_id').notNull().references(() => groupExpenses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    amountPaise: money('amount_paise').notNull(),
    memberIds: uuid('member_ids').array().notNull(),
    sort: smallint('sort').notNull().default(0),
  },
  (t) => [index('group_expense_items_expense').on(t.expenseId)],
)

export const settlements = pgTable(
  'settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    fromMember: uuid('from_member').notNull().references(() => groupMembers.id),
    toMember: uuid('to_member').notNull().references(() => groupMembers.id),
    amountPaise: money('amount_paise').notNull(),
    status: text('status', { enum: ['pending', 'confirmed', 'rejected'] }).notNull().default('pending'),
    note: text('note'),
    markedAt: timestamp('marked_at', { withTimezone: true }).notNull().defaultNow(),
    markedBy: text('marked_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: text('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    check('settlements_amount_positive', sql`${t.amountPaise} > 0`),
    check('settlements_distinct_members', sql`${t.fromMember} <> ${t.toMember}`),
    index('settlements_group').on(t.groupId, t.markedAt.desc()),
  ],
)

export const groupActivity = pgTable(
  'group_activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    summary: text('summary').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('group_activity_group_time').on(t.groupId, t.createdAt.desc())],
)

/** Spec §3.8. One row per pair of people, whoever asked first; decline / cancel / unfriend delete it. */
export const friendships = pgTable(
  'friendships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requesterId: text('requester_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    addresseeId: text('addressee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'accepted'] }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (t) => [
    check('friendships_distinct', sql`${t.requesterId} <> ${t.addresseeId}`),
    uniqueIndex('friendships_pair').on(sql`least(${t.requesterId}, ${t.addresseeId})`, sql`greatest(${t.requesterId}, ${t.addresseeId})`),
    index('friendships_addressee').on(t.addresseeId),
  ],
)

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seq: bigserial('seq', { mode: 'number' }).notNull(), // SSE event id / resume cursor
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    href: text('href'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    dedupeKey: text('dedupe_key'), // coach: one nudge per key
    readAt: timestamp('read_at', { withTimezone: true }),
    actedAt: timestamp('acted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_seq').on(t.userId, t.seq.desc()),
    uniqueIndex('notifications_dedupe').on(t.userId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
  ],
)

// ── Ledger ───────────────────────────────────────────────────────────────────────────────────────

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['expense', 'income'] }).notNull(),
    amount: money('amount').notNull(), // cash that left/entered the account
    personalShare: money('personal_share').notNull(), // what counts as the user's spending
    categoryId: uuid('category_id').notNull().references(() => categories.id),
    note: text('note'),
    method: text('method', { enum: ['upi', 'cash', 'card', 'other'] }).notNull().default('upi'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    source: text('source', { enum: ['manual', 'recurring', 'voice', 'scan', 'chat', 'group', 'settlement'] }).notNull().default('manual'),
    status: text('status', { enum: ['draft', 'confirmed'] }).notNull().default('confirmed'),
    recurringItemId: uuid('recurring_item_id').references(() => recurringItems.id, { onDelete: 'set null' }),
    groupExpenseId: uuid('group_expense_id').references(() => groupExpenses.id, { onDelete: 'cascade' }),
    settlementId: uuid('settlement_id').references(() => settlements.id, { onDelete: 'cascade' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // A group mirror may move no cash (you were a participant but didn't pay): amount 0 only for source 'group'.
    check('transactions_amount_positive', sql`${t.amount} > 0 or (${t.source} = 'group' and ${t.amount} = 0)`),
    // Spec §2.3: personal_share >= 0 and (source = 'group' or personal_share <= amount).
    check('transactions_share_range', sql`${t.personalShare} >= 0 and (${t.source} = 'group' or ${t.personalShare} <= ${t.amount})`),
    check('transactions_mirror_source', sql`(${t.groupExpenseId} is null or ${t.source} = 'group') and (${t.settlementId} is null or ${t.source} = 'settlement')`),
    index('transactions_user_time').on(t.userId, t.occurredAt.desc()).where(sql`${t.deletedAt} is null`),
    // Backstop: at most one live draft per recurring item per due instant (materialize also pre-checks).
    uniqueIndex('transactions_recurring_draft_unique').on(t.recurringItemId, t.occurredAt)
      .where(sql`${t.status} = 'draft' and ${t.deletedAt} is null and ${t.recurringItemId} is not null`),
    // One live mirror per user per group expense / settlement.
    uniqueIndex('transactions_group_mirror_unique').on(t.userId, t.groupExpenseId)
      .where(sql`${t.groupExpenseId} is not null and ${t.deletedAt} is null`),
    uniqueIndex('transactions_settlement_mirror_unique').on(t.userId, t.settlementId)
      .where(sql`${t.settlementId} is not null and ${t.deletedAt} is null`),
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
    entity: text('entity', {
      enum: ['transaction', 'recurring_item', 'budget', 'balance_checkin', 'group_expense', 'settlement', 'group_member'],
    }).notNull(),
    entityId: uuid('entity_id').notNull(),
    action: text('action', { enum: ['create', 'update', 'delete', 'restore', 'confirm'] }).notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    actor: text('actor', { enum: ['user', 'agent'] }).notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_entity').on(t.userId, t.entity, t.entityId, t.seq.desc()),
    // Group entities: "latest change" is checked across all members, not only the caller.
    index('audit_log_entity_any_user').on(t.entity, t.entityId, t.seq.desc()),
  ],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Category = typeof categories.$inferSelect
export type BalanceCheckin = typeof balanceCheckins.$inferSelect
export type RecurringItem = typeof recurringItems.$inferSelect
export type Transaction = typeof transactions.$inferSelect
export type Budget = typeof budgets.$inferSelect
export type AuditRow = typeof auditLog.$inferSelect
export type Group = typeof groups.$inferSelect
export type GroupMember = typeof groupMembers.$inferSelect
export type GroupInvite = typeof groupInvites.$inferSelect
export type GroupExpense = typeof groupExpenses.$inferSelect
export type GroupExpensePayer = typeof groupExpensePayers.$inferSelect
export type GroupExpenseShare = typeof groupExpenseShares.$inferSelect
export type GroupExpenseItem = typeof groupExpenseItems.$inferSelect
export type Settlement = typeof settlements.$inferSelect
export type GroupActivity = typeof groupActivity.$inferSelect
export type Friendship = typeof friendships.$inferSelect
export type Notification = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert
