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
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A real calendar day (no 2026-02-31) within a sane range, so a half-typed year never reaches the API. */
export function isRealDay(v: string): boolean {
  const m = DAY.exec(v)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (y < 2000 || y > 2100) return false
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

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
    from: pick('from', isRealDay),
    to: pick('to', isRealDay),
  }
  // Drop undefined keys so the object (and the query key built from it) is stable.
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined)) as TxnFilters
}

export function serializeFilters(f: TxnFilters): string {
  const p = new URLSearchParams()
  for (const key of FILTER_KEYS) if (f[key]) p.set(key, f[key])
  return p.toString()
}

/** True when both ends are set and the range runs backwards. */
export const isReversedRange = (f: TxnFilters) => Boolean(f.from && f.to && f.from > f.to)

export const hasFilters = (f: TxnFilters) => FILTER_KEYS.some((k) => Boolean(f[k]))
