import type { RecurringPatch } from '@/lib/schemas/recurring'

export type RecurringFields = {
  kind: 'bill' | 'income'
  name: string
  amount: number
  cadence: 'weekly' | 'monthly' | 'yearly'
  nextDueOn: string
  categoryId: string
}

const KEYS = ['kind', 'name', 'amount', 'cadence', 'nextDueOn', 'categoryId'] as const

/**
 * Edit-mode patch: only fields that differ from what the item had. `{}` means there is nothing to send.
 * A changed `nextDueOn` is a real change; an unchanged one must not be re-sent, because the server
 * re-anchors the schedule day whenever it receives a date. `active` is never part of an edit.
 */
export function buildRecurringPatch(initial: RecurringFields, next: RecurringFields): RecurringPatch {
  const patch: Record<string, unknown> = {}
  for (const k of KEYS) if (next[k] !== initial[k]) patch[k] = next[k]
  return patch as RecurringPatch
}
