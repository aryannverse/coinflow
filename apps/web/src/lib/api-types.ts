import type { BalanceCheckin, Category, RecurringItem, User } from '@/server/db/schema'
import type { BudgetWithSpend } from '@/server/services/budgets'
import type { Insights } from '@/server/services/insights'
import type { TransactionWithCategory } from '@/server/services/transactions'
import type { SafeToSpendResult } from './safe-to-spend'

/** JSON-over-the-wire shape of a server type: every Date becomes an ISO string. */
export type Serialized<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] extends object ? Serialized<T[K]> : T[K]
}

export type MeDTO = Serialized<User>
export type CategoryDTO = Serialized<Category>
export type TransactionDTO = Serialized<TransactionWithCategory>
export type RecurringDTO = Serialized<RecurringItem>
export type CheckinDTO = Serialized<BalanceCheckin>
export type BudgetDTO = BudgetWithSpend
export type InsightsDTO = Insights
export type SafeToSpendDTO = SafeToSpendResult
/** Mutation envelope. `auditId` is null for a no-op edit (no undo toast). */
export type Mutation<T = unknown> = { data?: T; auditId: string | null }
