import { formatINR } from './money'

/**
 * Split engine (spec §2.5). Pure and shared by the server (authoritative) and the expense sheet (live preview).
 * Every mode returns integer paise shares that add up to the total exactly: largest remainder, with ties broken
 * by member order (the group's join order) and never by the order the input happened to list people in.
 */
export type SplitMode = 'equal' | 'exact' | 'shares' | 'percent' | 'itemized'
export type SplitItem = { name: string; amountPaise: number; memberIds: string[] }
export type SplitSpec =
  | { mode: 'equal'; memberIds: string[] }
  | { mode: 'exact'; entries: { memberId: string; paise: number }[] }
  | { mode: 'shares'; entries: { memberId: string; shares: number }[] }
  | { mode: 'percent'; entries: { memberId: string; basisPoints: number }[] }
  | { mode: 'itemized'; items: SplitItem[]; taxPaise: number; tipPaise: number; discountPaise: number }

export interface ShareRow { memberId: string; sharePaise: number; inputValue: number | null }
export interface PayerRow { memberId: string; paidPaise: number }

export class SplitMismatchError extends Error {
  constructor(
    public readonly field: string,
    public readonly remaining: number,
    public readonly unit: 'paise' | 'basisPoints',
    message: string,
  ) {
    super(message)
    this.name = 'SplitMismatchError'
  }
}

export const FULL_PERCENT_BP = 10_000 // 100.00 %

/** Splits `total` paise by integer `weights`; the result always sums to `total`. BigInt keeps total×weight exact. */
export function allocate(total: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError('allocate: total must be a non-negative integer')
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) throw new RangeError('allocate: weights must be non-negative integers')
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum === 0) throw new RangeError('allocate: weights must not all be zero')
  const T = BigInt(total)
  const W = BigInt(sum)
  const base = weights.map((w) => Number((T * BigInt(w)) / W))
  const rem = weights.map((w) => (T * BigInt(w)) % W)
  let left = total - base.reduce((a, b) => a + b, 0) // always < the number of non-zero remainders
  const order = weights.map((_, i) => i).sort((i, j) => (rem[i] === rem[j] ? i - j : rem[j] > rem[i] ? 1 : -1))
  for (const i of order) {
    if (left === 0) break
    base[i] += 1
    left -= 1
  }
  return base
}

function ranker(memberOrder: string[]) {
  const rank = new Map(memberOrder.map((id, i) => [id, i]))
  return (id: string) => rank.get(id) ?? memberOrder.length
}

function sortByOrder<T>(rows: T[], idOf: (r: T) => string, rankOf: (id: string) => number): T[] {
  const seen = new Set<string>()
  for (const r of rows) {
    if (seen.has(idOf(r))) throw new Error(`Member ${idOf(r)} is listed twice in one split`)
    seen.add(idOf(r))
  }
  return [...rows].sort((x, y) => rankOf(idOf(x)) - rankOf(idOf(y)))
}

const leftMessage = (remaining: number) =>
  remaining > 0 ? `${formatINR(remaining)} left to assign.` : `${formatINR(-remaining)} more than the total.`
const pct = (bp: number) => `${(bp / 100).toFixed(2).replace(/\.?0+$/, '')}%`

function itemized(total: number, spec: Extract<SplitSpec, { mode: 'itemized' }>, rankOf: (id: string) => number): ShareRow[] {
  const subtotal = new Map<string, number>()
  spec.items.forEach((item, i) => {
    if (item.memberIds.length === 0) {
      throw new SplitMismatchError(`split.items.${i}.memberIds`, item.amountPaise, 'paise', `Assign “${item.name}” to someone.`)
    }
    const ids = sortByOrder(item.memberIds, (id) => id, rankOf) // an item shared by k members splits k ways
    allocate(item.amountPaise, ids.map(() => 1)).forEach((p, k) => subtotal.set(ids[k], (subtotal.get(ids[k]) ?? 0) + p))
  })
  const itemsTotal = spec.items.reduce((s, it) => s + it.amountPaise, 0)
  const computed = itemsTotal + spec.taxPaise + spec.tipPaise - spec.discountPaise
  if (computed !== total) {
    const gap = total - computed
    throw new SplitMismatchError('split.items', gap, 'paise', gap > 0
      ? `The receipt comes to ${formatINR(computed)}, ${formatINR(gap)} less than the total.`
      : `The receipt comes to ${formatINR(computed)}, ${formatINR(-gap)} more than the total.`)
  }
  const ids = [...subtotal.keys()].sort((x, y) => rankOf(x) - rankOf(y))
  const weights = ids.map((id) => subtotal.get(id) ?? 0)
  const tax = allocate(spec.taxPaise, weights)
  const tip = allocate(spec.tipPaise, weights)
  const off = allocate(spec.discountPaise, weights)
  const rows = ids.map((memberId, k) => ({ memberId, sharePaise: weights[k] + tax[k] + tip[k] - off[k], inputValue: null }))
  if (rows.some((r) => r.sharePaise < 0)) {
    throw new SplitMismatchError('split.discountPaise', 0, 'paise', 'The discount is bigger than what someone ordered. Lower it or move items.')
  }
  return rows
}

export function computeSplit(total: number, spec: SplitSpec, memberOrder: string[]): ShareRow[] {
  const rankOf = ranker(memberOrder)
  switch (spec.mode) {
    case 'equal': {
      const ids = sortByOrder(spec.memberIds, (id) => id, rankOf)
      if (ids.length === 0) throw new SplitMismatchError('split.memberIds', total, 'paise', 'Pick at least one person to split with.')
      const parts = allocate(total, ids.map(() => 1))
      return ids.map((memberId, i) => ({ memberId, sharePaise: parts[i], inputValue: null }))
    }
    case 'exact': {
      const rows = sortByOrder(spec.entries, (e) => e.memberId, rankOf)
      const remaining = total - rows.reduce((s, e) => s + e.paise, 0)
      if (remaining !== 0) throw new SplitMismatchError('split.entries', remaining, 'paise', leftMessage(remaining))
      return rows.map((e) => ({ memberId: e.memberId, sharePaise: e.paise, inputValue: e.paise }))
    }
    case 'shares': {
      const rows = sortByOrder(spec.entries, (e) => e.memberId, rankOf)
      if (rows.every((e) => e.shares === 0)) throw new SplitMismatchError('split.entries', total, 'paise', 'Give at least one person a share.')
      const parts = allocate(total, rows.map((e) => e.shares))
      return rows.map((e, i) => ({ memberId: e.memberId, sharePaise: parts[i], inputValue: e.shares }))
    }
    case 'percent': {
      const rows = sortByOrder(spec.entries, (e) => e.memberId, rankOf)
      const sum = rows.reduce((s, e) => s + e.basisPoints, 0)
      if (sum !== FULL_PERCENT_BP) {
        const left = FULL_PERCENT_BP - sum
        throw new SplitMismatchError('split.entries', left, 'basisPoints', left > 0
          ? `Percentages add up to ${pct(sum)}, ${pct(left)} left to assign.`
          : `Percentages add up to ${pct(sum)}, ${pct(-left)} too much.`)
      }
      const parts = allocate(total, rows.map((e) => e.basisPoints))
      return rows.map((e, i) => ({ memberId: e.memberId, sharePaise: parts[i], inputValue: e.basisPoints }))
    }
    case 'itemized':
      return itemized(total, spec, rankOf)
  }
}

export function checkPayers(total: number, payers: PayerRow[]): void {
  if (payers.length === 0 || payers.every((p) => p.paidPaise === 0)) throw new SplitMismatchError('payers', total, 'paise', 'Pick who paid.')
  const remaining = total - payers.reduce((s, p) => s + p.paidPaise, 0)
  if (remaining !== 0) {
    throw new SplitMismatchError('payers', remaining, 'paise', remaining > 0
      ? `${formatINR(remaining)} of the bill still needs a payer.`
      : `Payers add up to ${formatINR(-remaining)} more than the total.`)
  }
}

export function splitMemberIds(spec: SplitSpec): string[] {
  switch (spec.mode) {
    case 'equal':
      return spec.memberIds
    case 'itemized':
      return [...new Set(spec.items.flatMap((i) => i.memberIds))]
    default:
      return spec.entries.map((e) => e.memberId)
  }
}
