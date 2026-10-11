import type { TxnInput } from '@/hooks/queries'

export type EntryFields = { type: 'expense' | 'income'; amount: number | null; categoryId: string | null; note: string | null; method: string }

/** A datetime-local value the Date constructor can read (empty or garbage would make toISOString throw). */
export const isValidWhen = (when: string) => when !== '' && !Number.isNaN(new Date(when).getTime())

/**
 * Edit-mode patch: only fields that differ from the prefill; `occurredAt` only when the user touched When.
 * An empty object means there is nothing to send. `when` must already be valid when `whenTouched`.
 */
export function buildPatch(initial: EntryFields, next: EntryFields, whenTouched: boolean, when: string): Partial<TxnInput> {
  const patch: Partial<TxnInput> = {}
  if (next.type !== initial.type) patch.type = next.type
  if (next.amount !== initial.amount && next.amount !== null) patch.amount = next.amount
  if (next.categoryId !== initial.categoryId && next.categoryId !== null) patch.categoryId = next.categoryId
  if (next.note !== initial.note) patch.note = next.note
  if (next.method !== initial.method) patch.method = next.method
  if (whenTouched) patch.occurredAt = new Date(when).toISOString()
  return patch
}
