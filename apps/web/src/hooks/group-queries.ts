'use client'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api-client'
import type {
  ActivityDTO, BalancesDTO, FriendSearchDTO, FriendsDTO, GroupDetailDTO, GroupExpenseDTO, GroupMemberDTO, GroupSummaryDTO, InviteDTO, Mutation,
  NotificationDTO, Page, SettlementDTO,
} from '@/lib/api-types'
import { formatINR } from '@/lib/money'
import type { GroupCreateBody, GroupExpenseBody, GroupPatch, MemberCreate, MemberPatch, SettlementCreate } from '@/lib/schemas/groups'
import { qk, useLedgerMutation } from './queries'

export const gk = {
  all: ['groups'] as const,
  list: ['groups', 'list'] as const,
  detail: (id: string) => ['groups', id] as const,
  expenses: (id: string) => ['groups', id, 'expenses'] as const,
  expense: (id: string, expenseId: string) => ['groups', id, 'expense', expenseId] as const,
  balances: (id: string) => ['groups', id, 'balances'] as const,
  activity: (id: string) => ['groups', id, 'activity'] as const,
  invite: (id: string) => ['groups', id, 'invite'] as const,
  notifications: ['notifications'] as const,
}
/** Group changes also move mirrors, so the personal ledger keys refresh too (via useLedgerMutation's own list). */
const GROUP_KEYS: QueryKey[] = [gk.all, gk.notifications]
const LEDGER: QueryKey[] = [['transactions'], qk.sts, qk.budgets, ['insights']]
type NotificationsPage = { data: NotificationDTO[]; unreadCount: number; nextCursor: number | null }

export const useGroups = (initial?: GroupSummaryDTO[]) =>
  useQuery({ queryKey: gk.list, queryFn: () => api<{ data: GroupSummaryDTO[] }>('/groups').then((r) => r.data), initialData: initial })
export const useGroup = (id: string, initial?: GroupDetailDTO) =>
  useQuery({ queryKey: gk.detail(id), queryFn: () => api<{ data: GroupDetailDTO }>(`/groups/${id}`).then((r) => r.data), initialData: initial })
export const useGroupExpense = (groupId: string, expenseId?: string) =>
  useQuery({
    queryKey: gk.expense(groupId, expenseId ?? 'none'),
    queryFn: () => api<{ data: GroupExpenseDTO }>(`/groups/${groupId}/expenses/${expenseId}`).then((r) => r.data),
    enabled: Boolean(expenseId),
  })
/** `initial`: the server-rendered first page, so `#expense-<id>` links from notifications can scroll on arrival. */
export const useGroupExpenses = (id: string, initial?: Page<GroupExpenseDTO>) =>
  useInfiniteQuery({
    queryKey: gk.expenses(id),
    initialPageParam: undefined as string | undefined,
    initialData: initial ? { pages: [initial], pageParams: [undefined] } : undefined,
    queryFn: ({ pageParam }) => api<Page<GroupExpenseDTO>>(`/groups/${id}/expenses${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
export const useBalances = (id: string) =>
  useQuery({ queryKey: gk.balances(id), queryFn: () => api<{ data: BalancesDTO }>(`/groups/${id}/balances`).then((r) => r.data) })
export const useGroupActivity = (id: string) =>
  useInfiniteQuery({
    queryKey: gk.activity(id),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api<Page<ActivityDTO>>(`/groups/${id}/activity${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
export const useInvite = (id: string, enabled = true) =>
  useQuery({ queryKey: gk.invite(id), queryFn: () => api<{ data: InviteDTO }>(`/groups/${id}/invite`).then((r) => r.data), enabled })
/** `pollMs`: 30 000 while the SSE stream is down (spec §3.4), false while it is live. */
export const useNotifications = (pollMs: number | false) =>
  useQuery({ queryKey: gk.notifications, queryFn: () => api<NotificationsPage>('/notifications'), refetchInterval: pollMs })

// ── Ledger mutations: undo toast (spec §3.6) ──────────────────────────────────────────────────────
export const useCreateGroupExpense = () =>
  useLedgerMutation(
    (v: { groupId: string; body: GroupExpenseBody }) => api<Mutation<GroupExpenseDTO>>(`/groups/${v.groupId}/expenses`, { method: 'POST', json: v.body }),
    (v) => `Added ${formatINR(v.body.amountPaise)} ${v.body.description}`,
    GROUP_KEYS,
  )
export const useUpdateGroupExpense = () =>
  useLedgerMutation(
    (v: { groupId: string; expenseId: string; body: GroupExpenseBody }) =>
      api<Mutation<GroupExpenseDTO>>(`/groups/${v.groupId}/expenses/${v.expenseId}`, { method: 'PATCH', json: v.body }),
    (v) => `Saved ${v.body.description}`,
    GROUP_KEYS,
  )
export const useDeleteGroupExpense = () =>
  useLedgerMutation(
    (v: { groupId: string; expenseId: string; description: string; amountPaise: number }) =>
      api<Mutation>(`/groups/${v.groupId}/expenses/${v.expenseId}`, { method: 'DELETE' }),
    (v) => `Removed ${v.description} ${formatINR(v.amountPaise)}`,
    GROUP_KEYS,
  )
export const useMarkSettlement = () =>
  useLedgerMutation(
    (v: { groupId: string; body: SettlementCreate; label: string }) =>
      api<Mutation<SettlementDTO>>(`/groups/${v.groupId}/settlements`, { method: 'POST', json: v.body }),
    (v) => v.label,
    GROUP_KEYS,
  )
export const useAddPlaceholder = () =>
  useLedgerMutation(
    (v: { groupId: string; body: MemberCreate }) => api<Mutation<GroupMemberDTO>>(`/groups/${v.groupId}/members`, { method: 'POST', json: v.body }),
    (v) => `Added ${v.body.displayName}`,
    GROUP_KEYS,
  )

// ── Plain mutations (final or non-ledger: no undo by spec) ─────────────────────────────────────────
function useGroupMutation<V, R>(fn: (v: V) => Promise<R>, opts: { success?: (v: V) => string; inlineFieldErrors?: boolean } = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (_r, v) => {
      for (const key of [...GROUP_KEYS, ...LEDGER]) void qc.invalidateQueries({ queryKey: key })
      if (opts.success) toast.success(opts.success(v))
    },
    onError: (err) => {
      if (err instanceof ApiError && (err.status === 401 || (opts.inlineFieldErrors && err.field))) return
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    },
  })
}

export const useCreateGroup = () =>
  useGroupMutation((body: GroupCreateBody) => api<{ data: GroupDetailDTO }>('/groups', { method: 'POST', json: body }).then((r) => r.data), { inlineFieldErrors: true })
export const useUpdateGroup = () =>
  useGroupMutation((v: { groupId: string; patch: GroupPatch }) => api<{ data: GroupDetailDTO }>(`/groups/${v.groupId}`, { method: 'PATCH', json: v.patch }), { inlineFieldErrors: true, success: () => 'Saved' })
export const useArchiveGroup = () =>
  useGroupMutation((groupId: string) => api(`/groups/${groupId}`, { method: 'DELETE' }), { success: () => 'Archived' })
export const useUpdateMember = () =>
  useGroupMutation((v: { groupId: string; memberId: string; patch: MemberPatch }) => api(`/groups/${v.groupId}/members/${v.memberId}`, { method: 'PATCH', json: v.patch }), { inlineFieldErrors: true, success: () => 'Saved' })
export const useRemoveMember = () =>
  useGroupMutation((v: { groupId: string; memberId: string; name: string }) => api(`/groups/${v.groupId}/members/${v.memberId}`, { method: 'DELETE' }), { success: (v) => `Removed ${v.name}` })
export const useRegenerateInvite = () =>
  useGroupMutation((groupId: string) => api<{ data: InviteDTO }>(`/groups/${groupId}/invite`, { method: 'POST' }).then((r) => r.data), { success: () => 'New link ready. The old one no longer works.' })
export const useResolveSettlement = () =>
  useGroupMutation(
    (v: { settlementId: string; decision: 'confirm' | 'reject' }) => api<{ data: SettlementDTO }>(`/settlements/${v.settlementId}/${v.decision}`, { method: 'POST' }),
    { success: (v) => (v.decision === 'confirm' ? 'Payment confirmed' : 'Marked as not received') },
  )
export const useMarkRead = () => useGroupMutation((id: string) => api(`/notifications/${id}/read`, { method: 'POST' }))
export const useMarkAllRead = () => useGroupMutation(() => api('/notifications/read-all', { method: 'POST' }))

// ── Friends (spec §3.8) ───────────────────────────────────────────────────────────────────────────
export const fk = {
  all: ['friends'] as const,
  search: (email: string) => ['friends', 'search', email] as const,
}
const FRIEND_KEYS: QueryKey[] = [fk.all, gk.notifications]

export const useFriends = (initial?: FriendsDTO) =>
  useQuery({ queryKey: fk.all, queryFn: () => api<{ data: FriendsDTO }>('/friends').then((r) => r.data), initialData: initial })
/** `email` is searched only once it looks complete; the server matches it exactly (spec §3.8). */
export const useFriendSearch = (email: string) =>
  useQuery({
    queryKey: fk.search(email),
    queryFn: () => api<{ data: FriendSearchDTO }>(`/friends/search?email=${encodeURIComponent(email)}`).then((r) => r.data),
    enabled: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    staleTime: 10_000,
  })

function useFriendMutation<V, R>(fn: (v: V) => Promise<R>, opts: { success?: (v: V, r: R) => string; inlineFieldErrors?: boolean } = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      for (const key of [...FRIEND_KEYS, gk.all]) void qc.invalidateQueries({ queryKey: key })
      if (opts.success) toast.success(opts.success(v, r))
    },
    onError: (err) => {
      if (err instanceof ApiError && (err.status === 401 || (opts.inlineFieldErrors && err.field))) return
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    },
  })
}

type SentRequest = { data: { requestId: string; status: 'pending' | 'accepted'; user: { name: string } } }
export const useSendFriendRequest = () =>
  useFriendMutation((email: string) => api<SentRequest>('/friends/requests', { method: 'POST', json: { email } }), {
    inlineFieldErrors: true,
    success: (_v, r) => (r.data.status === 'accepted' ? `You and ${r.data.user.name} are now friends` : `Request sent to ${r.data.user.name}`),
  })
export const useAcceptFriend = () =>
  useFriendMutation((v: { requestId: string; name: string }) => api(`/friends/requests/${v.requestId}/accept`, { method: 'POST' }),
    { success: (v) => `You and ${v.name} are now friends` })
export const useDropFriendRequest = () =>
  useFriendMutation((v: { requestId: string; label: string }) => api(`/friends/requests/${v.requestId}`, { method: 'DELETE' }),
    { success: (v) => v.label })
export const useUnfriend = () =>
  useFriendMutation((v: { userId: string; name: string }) => api(`/friends/${encodeURIComponent(v.userId)}`, { method: 'DELETE' }),
    { success: (v) => `Removed ${v.name} from friends` })
/** Undo toast (spec §3.6 member add). */
export const useAddFriendMember = () =>
  useLedgerMutation(
    (v: { groupId: string; userId: string; name: string }) =>
      api<Mutation<GroupMemberDTO>>(`/groups/${v.groupId}/members/friends`, { method: 'POST', json: { userId: v.userId } }),
    (v) => `Added ${v.name}`,
    GROUP_KEYS,
  )
/** Final, like a claim: no undo. The UI confirms first. */
export const useLinkFriend = () =>
  useGroupMutation(
    (v: { groupId: string; memberId: string; userId: string; name: string; placeholder: string }) =>
      api(`/groups/${v.groupId}/members/${v.memberId}/link`, { method: 'POST', json: { userId: v.userId } }),
    { success: (v) => `${v.placeholder} is now ${v.name}` },
  )
