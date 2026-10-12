import type { Group, GroupActivity, Settlement } from '@/server/db/schema'
import type { Payment } from '@/lib/settle'
import type { SplitMode } from '@/lib/split'

export type MemberView = {
  id: string
  userId: string | null // null = placeholder; lets the Members tab hide friends who are already in (spec §3.8)
  displayName: string
  claimed: boolean
  role: 'creator' | 'member'
  claimedAt: Date | null
  removedAt: Date | null
  createdAt: Date
  avatarUrl: string | null
  upiId: string | null // claimed: their profile UPI ID; placeholder: typed by a member
  upiQrUrl: string | null // claimed members only (their uploaded QR, readable by co-members)
  isMe: boolean
}
type GroupFields = Pick<Group, 'id' | 'name' | 'emoji' | 'color' | 'kind' | 'startsOn' | 'endsOn' | 'archivedAt' | 'createdAt'>
export type GroupSummary = GroupFields & { memberCount: number; myMemberId: string; myPositionPaise: number }
export type GroupDetail = GroupSummary & { isCreator: boolean; members: MemberView[] }
export type GroupExpenseView = {
  id: string
  groupId: string
  description: string
  amountPaise: number
  categoryId: string
  category: { name: string; emoji: string; color: string }
  occurredAt: Date
  splitMode: SplitMode
  taxPaise: number
  tipPaise: number
  discountPaise: number
  createdBy: string
  updatedBy: string
  createdAt: Date
  updatedAt: Date
  payers: { memberId: string; paidPaise: number }[]
  shares: { memberId: string; sharePaise: number; inputValue: number | null }[]
  items: { id: string; name: string; amountPaise: number; memberIds: string[] }[]
  myPaidPaise: number
  mySharePaise: number
}
export type Balances = { nets: { memberId: string; netPaise: number }[]; payments: Payment[]; pending: Settlement[] }
export type InvitePreview = {
  group: Pick<Group, 'id' | 'name' | 'emoji' | 'color' | 'kind' | 'startsOn' | 'endsOn'>
  placeholders: { id: string; displayName: string }[]
  myMemberId: string | null
}
export type InviteLink = { url: string; createdAt: Date }
export type { GroupActivity, Settlement }
