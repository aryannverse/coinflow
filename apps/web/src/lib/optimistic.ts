import type { InfiniteData } from '@tanstack/react-query'
import type { CategoryDTO, TransactionDTO } from './api-types'

type Page<T> = { data: T[]; nextCursor: string | null }

/** Prepends `row` to page 0 of a cached infinite list. Returns the input unchanged if nothing is cached. */
export function prependToFirstPage<T, P extends Page<T>>(
  data: InfiniteData<P> | undefined,
  row: T,
): InfiniteData<P> | undefined {
  if (!data || data.pages.length === 0) return data
  const [first, ...rest] = data.pages
  return { ...data, pages: [{ ...first, data: [row, ...first.data] }, ...rest] }
}

type WithId = { id: string }

/** Removes the row with `id` from a cached infinite list or a plain list (pure; never mutates). */
export function removeFromPages<T extends WithId, P extends Page<T>>(data: InfiniteData<P>, id: string): InfiniteData<P>
export function removeFromPages<T extends WithId>(data: T[], id: string): T[]
export function removeFromPages(data: undefined, id: string): undefined
export function removeFromPages<T extends WithId, P extends Page<T>>(
  data: InfiniteData<P> | T[] | undefined,
  id: string,
): InfiniteData<P> | T[] | undefined
export function removeFromPages<T extends WithId, P extends Page<T>>(
  data: InfiniteData<P> | T[] | undefined,
  id: string,
): InfiniteData<P> | T[] | undefined {
  if (!data) return data
  if (Array.isArray(data)) return data.filter((r) => r.id !== id)
  return { ...data, pages: data.pages.map((p) => ({ ...p, data: p.data.filter((r) => r.id !== id) })) }
}

export type OptimisticTxnInput = {
  type: 'expense' | 'income'
  amount: number
  categoryId: string
  note?: string | null
  method?: string
  occurredAt?: string
}

/** A temporary confirmed row shown until the server answers; the refetch replaces it. */
export function buildOptimisticTransaction(
  input: OptimisticTxnInput,
  category: Pick<CategoryDTO, 'id' | 'name' | 'emoji' | 'color'> | undefined,
  now: Date,
): TransactionDTO {
  const stamp = now.toISOString()
  return {
    id: `optimistic-${now.getTime()}`,
    userId: '',
    type: input.type,
    amount: input.amount,
    personalShare: input.amount,
    categoryId: input.categoryId,
    note: input.note ?? null,
    method: (input.method ?? 'upi') as TransactionDTO['method'],
    occurredAt: input.occurredAt ?? stamp,
    source: 'manual',
    status: 'confirmed',
    recurringItemId: null,
    deletedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
    category: category ?? { id: input.categoryId, name: '', emoji: '', color: '' },
  }
}
