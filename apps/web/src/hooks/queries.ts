'use client'
import {
  useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient, type QueryKey,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api-client'
import type {
  BudgetDTO, CategoryDTO, CheckinDTO, InsightsDTO, MeDTO, Mutation, RecurringDTO, SafeToSpendDTO, TransactionDTO,
} from '@/lib/api-types'
import { formatINR } from '@/lib/money'
import { buildOptimisticTransaction, isOptimisticId, prependToFirstPage, removeFromPages } from '@/lib/optimistic'
import type { MePatch } from '@/lib/schemas/me'
import type { RecurringCreate, RecurringPatch } from '@/lib/schemas/recurring'
import { undoStore } from '@/lib/undo-store'

export type TxnFilters = { type?: string; categoryId?: string; method?: string; from?: string; to?: string; q?: string }
export type TxnInput = { type: 'expense' | 'income'; amount: number; categoryId: string; note?: string | null; method?: string; occurredAt?: string }
export type TxnPage = { data: TransactionDTO[]; nextCursor: string | null }

export const qk = {
  me: ['me'] as const,
  categories: (kind?: string) => ['categories', kind ?? 'all'] as const,
  sts: ['safe-to-spend'] as const,
  transactions: (f: TxnFilters) => ['transactions', 'confirmed', f] as const,
  drafts: ['transactions', 'draft'] as const,
  recurring: ['recurring'] as const,
  budgets: ['budgets'] as const,
  insights: (from: string, to: string) => ['insights', from, to] as const,
}

const TXN_ROOT: QueryKey = ['transactions']
const LEDGER_KEYS: QueryKey[] = [TXN_ROOT, qk.sts, qk.budgets, ['insights']]

function qs(f: Record<string, string | undefined>) {
  const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][])
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** A 401 means the session ended: the provider redirects to sign-in, so no toast or Retry. */
const isSignedOut = (err: unknown) => err instanceof ApiError && err.status === 401

/** A temp row is still being created; its id means nothing to the server yet. */
function assertSaved(id: string) {
  if (isOptimisticId(id)) throw new ApiError('still_saving', 'Still saving — try again in a moment.', 0)
}

type Snapshot = [QueryKey, unknown][]

/** Applies a cache edit immediately; returns what is needed to roll it back. */
type Optimistic<TVars> = (qc: QueryClient, vars: TVars) => void

async function snapshotTransactions(qc: QueryClient): Promise<Snapshot> {
  await qc.cancelQueries({ queryKey: TXN_ROOT }) // an in-flight refetch must not overwrite the optimistic edit
  return qc.getQueriesData({ queryKey: TXN_ROOT })
}

function useLedgerMutation<TVars, TRes extends Mutation>(
  fn: (v: TVars) => Promise<TRes>,
  label: (v: TVars, r: TRes) => string,
  extraKeys: QueryKey[] = [],
  optimistic?: Optimistic<TVars>,
) {
  const qc = useQueryClient()
  const invalidate = () => {
    for (const key of [...LEDGER_KEYS, ...extraKeys]) void qc.invalidateQueries({ queryKey: key })
  }
  const mutation = useMutation<TRes, Error, TVars, Snapshot | undefined>({
    mutationFn: fn,
    onMutate: async (vars) => {
      if (!optimistic) return undefined
      const snapshot = await snapshotTransactions(qc)
      optimistic(qc, vars)
      return snapshot
    },
    onSuccess: (res, vars) => {
      if (res.auditId) undoStore.push({ auditId: res.auditId, label: label(vars, res) })
      if (!optimistic) invalidate()
    },
    onError: (err, vars, snapshot) => {
      for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data)
      if (isSignedOut(err)) return
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong.', {
        description: err instanceof ApiError && err.requestId ? `Ref ${err.requestId}` : undefined,
        // A still-saving temp id can never succeed on retry, so that message stands alone.
        action: err instanceof ApiError && err.code === 'still_saving' ? undefined : { label: 'Retry', onClick: () => mutation.mutate(vars) },
      })
    },
    // Optimistic edits are always reconciled with the server, success or not.
    onSettled: () => {
      if (optimistic) invalidate()
    },
  })
  return mutation
}

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: () => api<{ data: MeDTO }>('/me').then((r) => r.data) })
export const useCategories = (kind?: 'expense' | 'income') =>
  useQuery({ queryKey: qk.categories(kind), queryFn: () => api<{ data: CategoryDTO[] }>(`/categories${qs({ kind })}`).then((r) => r.data), staleTime: 300_000 })
export const useSafeToSpend = (initial?: SafeToSpendDTO) =>
  useQuery({ queryKey: qk.sts, queryFn: () => api<{ data: SafeToSpendDTO }>('/summary/safe-to-spend').then((r) => r.data), initialData: initial })
export const useTransactions = (filters: TxnFilters) =>
  useInfiniteQuery({
    queryKey: qk.transactions(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api<TxnPage>(`/transactions${qs({ ...filters, cursor: pageParam })}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
export const useDrafts = () =>
  useQuery({ queryKey: qk.drafts, queryFn: () => api<{ data: TransactionDTO[] }>('/transactions?status=draft').then((r) => r.data) })
export const useRecurring = () => useQuery({ queryKey: qk.recurring, queryFn: () => api<{ data: RecurringDTO[] }>('/recurring').then((r) => r.data) })
export const useBudgets = () => useQuery({ queryKey: qk.budgets, queryFn: () => api<{ data: BudgetDTO[] }>('/budgets').then((r) => r.data) })
export const useInsights = (from: string, to: string) =>
  useQuery({ queryKey: qk.insights(from, to), queryFn: () => api<{ data: InsightsDTO }>(`/insights${qs({ from, to })}`).then((r) => r.data) })

const verb = (t: { type: string }) => (t.type === 'income' ? 'income' : 'expense')

function cachedCategory(qc: QueryClient, id: string): CategoryDTO | undefined {
  for (const [, list] of qc.getQueriesData<CategoryDTO[]>({ queryKey: ['categories'] })) {
    const hit = list?.find((c) => c.id === id)
    if (hit) return hit
  }
  return undefined
}

/** Quick add: the new row appears at the top of the unfiltered list straight away. */
const addTempRow: Optimistic<TxnInput> = (qc, v) => {
  const row = buildOptimisticTransaction(v, cachedCategory(qc, v.categoryId), new Date())
  qc.setQueryData<InfiniteData<TxnPage>>(qk.transactions({}), (old) => prependToFirstPage(old, row))
}

/** Delete: the row leaves every cached transaction list (infinite pages and the draft list). */
const dropRow: Optimistic<{ id: string; amount: number }> = (qc, v) => {
  qc.setQueriesData<InfiniteData<TxnPage> | TransactionDTO[]>({ queryKey: TXN_ROOT }, (old) => removeFromPages(old, v.id))
}

export const useCreateTransaction = () =>
  useLedgerMutation(
    (v: TxnInput) => api<Mutation<TransactionDTO>>('/transactions', { method: 'POST', json: v }),
    (v) => `Added ${formatINR(v.amount)} ${verb(v)}`,
    [],
    addTempRow,
  )
export const useUpdateTransaction = () =>
  useLedgerMutation(
    ({ id, patch }: { id: string; patch: Partial<TxnInput> }) => {
      assertSaved(id)
      return api<Mutation<TransactionDTO>>(`/transactions/${id}`, { method: 'PATCH', json: patch })
    },
    () => 'Saved changes',
  )
export const useDeleteTransaction = () =>
  useLedgerMutation(
    (t: { id: string; amount: number }) => {
      assertSaved(t.id)
      return api<Mutation>(`/transactions/${t.id}`, { method: 'DELETE' })
    },
    (t) => `Deleted ${formatINR(t.amount)}`,
    [],
    dropRow,
  )
export const useConfirmDraft = () =>
  useLedgerMutation((t: { id: string; name: string }) => api<Mutation>(`/transactions/${t.id}/confirm`, { method: 'POST' }), (t) => `Confirmed ${t.name}`)
export const useSkipDraft = () =>
  useLedgerMutation((t: { id: string; name: string }) => api<Mutation>(`/transactions/${t.id}/skip`, { method: 'POST' }), (t) => `Skipped ${t.name}`)
export const useCreateRecurring = () =>
  useLedgerMutation((v: RecurringCreate) => api<Mutation<RecurringDTO>>('/recurring', { method: 'POST', json: v }), (v) => `Scheduled ${v.name}`, [qk.recurring])
export const useUpdateRecurring = () =>
  useLedgerMutation(
    ({ id, patch }: { id: string; name: string; patch: RecurringPatch }) => api<Mutation<RecurringDTO>>(`/recurring/${id}`, { method: 'PATCH', json: patch }),
    (v) => `Updated ${v.name}`, [qk.recurring],
  )
export const useDeleteRecurring = () =>
  useLedgerMutation((v: { id: string; name: string }) => api<Mutation>(`/recurring/${v.id}`, { method: 'DELETE' }), (v) => `Removed ${v.name}`, [qk.recurring])
export const useUpsertBudget = () =>
  useLedgerMutation(
    (v: { categoryId: string; monthlyLimit: number; name: string }) => api<Mutation>(`/budgets/${v.categoryId}`, { method: 'PUT', json: { monthlyLimit: v.monthlyLimit } }),
    (v) => `${v.name} plan set to ${formatINR(v.monthlyLimit)}`,
  )
export const useDeleteBudget = () =>
  useLedgerMutation((v: { categoryId: string; name: string }) => api<Mutation>(`/budgets/${v.categoryId}`, { method: 'DELETE' }), (v) => `Removed ${v.name} plan`)
export const useCheckin = () =>
  useLedgerMutation((v: { amount: number }) => api<Mutation<CheckinDTO>>('/checkins', { method: 'POST', json: v }), (v) => `Balance set to ${formatINR(v.amount)}`)

export const useUpdateMe = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: MePatch) => api<{ data: MeDTO }>('/me', { method: 'PATCH', json: patch }).then((r) => r.data),
    onSuccess: (me) => {
      qc.setQueryData(qk.me, me)
      void qc.invalidateQueries({ queryKey: qk.sts })
    },
    onError: (err) => {
      if (!isSignedOut(err)) toast.error(err instanceof ApiError ? err.message : 'Couldn’t save that.')
    },
  })
}

export const useUndo = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (auditId: string) => api<{ data: unknown }>(`/undo/${auditId}`, { method: 'POST' }),
    onSuccess: () => {
      for (const key of [...LEDGER_KEYS, qk.recurring]) void qc.invalidateQueries({ queryKey: key })
      toast.success('Undone')
    },
    onError: (err) => {
      if (!isSignedOut(err)) toast.error(err instanceof ApiError ? err.message : 'Couldn’t undo that.')
    },
  })
}
