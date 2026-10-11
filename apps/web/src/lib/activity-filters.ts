import type { TxnFilters } from '@/hooks/queries'

export const FILTER_KEYS = ['q', 'type', 'categoryId', 'method', 'from', 'to'] as const
export const METHODS = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
] as const

const TYPES = new Set(['expense', 'income'])
const METHOD_VALUES = new Set<string>(METHODS.map((m) => m.value))
const DAY = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Reads filters from the URL. Values the API would reject are dropped, so a hand-edited link never shows an error. */
export function parseFilters(params: { get(name: string): string | null }): TxnFilters {
  const pick = (key: string, ok: (v: string) => boolean) => {
    const v = params.get(key)?.trim()
    return v && ok(v) ? v : undefined
  }
  const filters: TxnFilters = {
    q: pick('q', (v) => v.length <= 100),
    type: pick('type', (v) => TYPES.has(v)),
    categoryId: pick('categoryId', (v) => UUID.test(v)),
    method: pick('method', (v) => METHOD_VALUES.has(v)),
    from: pick('from', (v) => DAY.test(v)),
    to: pick('to', (v) => DAY.test(v)),
  }
  // Drop undefined keys so the object (and the query key built from it) is stable.
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined)) as TxnFilters
}

export function serializeFilters(f: TxnFilters): string {
  const p = new URLSearchParams()
  for (const key of FILTER_KEYS) if (f[key]) p.set(key, f[key])
  return p.toString()
}

export const hasFilters = (f: TxnFilters) => FILTER_KEYS.some((k) => Boolean(f[k]))
