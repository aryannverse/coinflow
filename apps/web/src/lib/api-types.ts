import type { BalanceCheckin, Category, GroupActivity, Notification, RecurringItem, Settlement, User } from '@/server/db/schema'
import type { BudgetWithSpend } from '@/server/services/budgets'
import type { Balances, GroupDetail, GroupExpenseView, GroupSummary, InviteLink, InvitePreview, MemberView } from '@/server/services/groups/types'
import type { Insights } from '@/server/services/insights'
import type { TransactionWithCategory } from '@/server/services/transactions'
import type { Payment } from './settle'
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

export type GroupSummaryDTO = Serialized<GroupSummary>
export type GroupMemberDTO = Serialized<MemberView>
export type GroupDetailDTO = Serialized<GroupDetail>
export type GroupExpenseDTO = Serialized<GroupExpenseView>
export type PaymentDTO = Payment
export type SettlementDTO = Serialized<Settlement>
export type BalancesDTO = { nets: Balances['nets']; payments: PaymentDTO[]; pending: SettlementDTO[] }
export type ActivityDTO = Serialized<GroupActivity>
export type NotificationDTO = Serialized<Notification>
export type InviteDTO = Serialized<InviteLink>
export type InvitePreviewDTO = InvitePreview
export type Page<T> = { data: T[]; nextCursor: string | null }

export type FriendUserDTO = { userId: string; name: string; email: string; avatarUrl: string | null }
export type FriendRelation = 'self' | 'none' | 'friends' | 'outgoing' | 'incoming'
export type FriendSearchDTO = (FriendUserDTO & { relation: FriendRelation; requestId: string | null }) | null
export type FriendRequestDTO = FriendUserDTO & { requestId: string; createdAt: string }
export type FriendDTO = FriendUserDTO & { since: string }
export type FriendsDTO = { friends: FriendDTO[]; incoming: FriendRequestDTO[]; outgoing: FriendRequestDTO[] }

/** Spec §4.5: what the agent read off a receipt photo (the photo itself is never stored). */
export type ReceiptDTO = {
  merchant: string | null; date: string | null; items: { name: string; amountPaise: number }[]
  taxPaise: number; tipPaise: number; discountPaise: number; totalPaise: number; confidence: number; mismatch: boolean; mismatchPaise: number
}
