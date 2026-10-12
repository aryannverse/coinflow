import type { GroupExpenseDTO } from './api-types'
import { paiseToRupeeString, parseRupeesToPaise } from './money'
import type { GroupExpenseBody } from './schemas/groups'
import { checkPayers, computeSplit, FULL_PERCENT_BP, SplitMismatchError, type SplitMode, type SplitSpec } from './split'

/** Form state for the group expense sheet: what people typed, kept as text until save. */
export type ItemDraft = { key: string; name: string; amount: string; memberIds: string[] }
export type ExpenseDraft = {
  description: string
  amount: string
  categoryId: string | null
  occurredAt: string | null // ISO; null = now
  multiplePayers: boolean
  payerId: string
  paid: Record<string, string> // memberId → rupees typed (multiple payers)
  participants: string[]
  mode: SplitMode
  exact: Record<string, string>
  shares: Record<string, number>
  percent: Record<string, string>
  items: ItemDraft[]
  tax: string
  tip: string
  discount: string
}
export type Preview = {
  rows: { memberId: string; sharePaise: number }[]
  error: { field: string; message: string } | null
  payersLeftPaise: number
}

class DraftError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message)
  }
}

/** '' → 0; '12.' → 1200; unreadable → throws a field error. */
function money(text: string, field: string, label = 'that amount'): number {
  const t = text.trim()
  if (t === '') return 0
  const p = parseRupeesToPaise(t.endsWith('.') ? t.slice(0, -1) : t)
  if (p === null) throw new DraftError(field, `Check ${label}: use digits like 1250.50.`)
  return p
}

export function percentToBasisPoints(text: string): number | null {
  const t = text.trim().replace(/%$/, '')
  if (t === '') return 0
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null
  const [whole, frac = ''] = t.split('.')
  const bp = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  return bp <= FULL_PERCENT_BP ? bp : null
}
export const basisPointsToText = (bp: number) => (bp / 100).toFixed(2).replace(/\.?0+$/, '')

export function emptyDraft(memberIds: string[], meId: string): ExpenseDraft {
  return {
    description: '', amount: '', categoryId: null, occurredAt: null,
    multiplePayers: false, payerId: meId, paid: {},
    participants: [...memberIds], mode: 'equal',
    exact: {}, shares: Object.fromEntries(memberIds.map((id) => [id, 1])), percent: {},
    items: [], tax: '', tip: '', discount: '',
  }
}

const rupees = (p: number) => paiseToRupeeString(p)

/** Edit round-trip: inputValue restores what the person typed (exact/shares/percent), spec §3.1 group_expense_shares. */
export function draftFromExpense(e: GroupExpenseDTO, activeIds: string[]): ExpenseDraft {
  const real = e.payers.filter((p) => p.paidPaise > 0)
  const single = real.length === 1 && real[0].paidPaise === e.amountPaise
  return {
    description: e.description,
    amount: rupees(e.amountPaise),
    categoryId: e.categoryId,
    occurredAt: e.occurredAt,
    multiplePayers: !single,
    payerId: real[0]?.memberId ?? activeIds[0],
    paid: Object.fromEntries(real.map((p) => [p.memberId, rupees(p.paidPaise)])),
    participants: e.splitMode === 'itemized' ? [...new Set(e.items.flatMap((i) => i.memberIds))] : e.shares.map((s) => s.memberId),
    mode: e.splitMode,
    exact: e.splitMode === 'exact' ? Object.fromEntries(e.shares.map((s) => [s.memberId, rupees(s.inputValue ?? s.sharePaise)])) : {},
    shares: e.splitMode === 'shares'
      ? Object.fromEntries(e.shares.map((s) => [s.memberId, s.inputValue ?? 1]))
      : Object.fromEntries(activeIds.map((id) => [id, 1])),
    percent: e.splitMode === 'percent' ? Object.fromEntries(e.shares.map((s) => [s.memberId, basisPointsToText(s.inputValue ?? 0)])) : {},
    items: e.items.map((it) => ({ key: it.id, name: it.name, amount: rupees(it.amountPaise), memberIds: it.memberIds })),
    tax: e.taxPaise ? rupees(e.taxPaise) : '',
    tip: e.tipPaise ? rupees(e.tipPaise) : '',
    discount: e.discountPaise ? rupees(e.discountPaise) : '',
  }
}

/** A proposal or receipt body → the same form (Task 4's Edit and camera). */
export function draftFromBody(body: GroupExpenseBody, activeIds: string[]): ExpenseDraft {
  const s = body.split
  const single = body.payers.length === 1 && body.payers[0].paidPaise === body.amountPaise
  const base = emptyDraft(activeIds, body.payers[0]?.memberId ?? activeIds[0])
  return {
    ...base,
    description: body.description,
    amount: rupees(body.amountPaise),
    categoryId: body.categoryId,
    occurredAt: body.occurredAt ? new Date(body.occurredAt as string | Date).toISOString() : null,
    multiplePayers: !single,
    paid: Object.fromEntries(body.payers.map((p) => [p.memberId, rupees(p.paidPaise)])),
    mode: s.mode,
    participants: s.mode === 'equal' ? s.memberIds : s.mode === 'itemized' ? [...new Set(s.items.flatMap((i) => i.memberIds))] : s.entries.map((e) => e.memberId),
    exact: s.mode === 'exact' ? Object.fromEntries(s.entries.map((e) => [e.memberId, rupees(e.paise)])) : {},
    shares: s.mode === 'shares' ? Object.fromEntries(s.entries.map((e) => [e.memberId, e.shares])) : base.shares,
    percent: s.mode === 'percent' ? Object.fromEntries(s.entries.map((e) => [e.memberId, basisPointsToText(e.basisPoints)])) : {},
    items: s.mode === 'itemized' ? s.items.map((it, i) => ({ key: `item-${i}`, name: it.name, amount: rupees(it.amountPaise), memberIds: it.memberIds })) : [],
    tax: s.mode === 'itemized' && s.taxPaise ? rupees(s.taxPaise) : '',
    tip: s.mode === 'itemized' && s.tipPaise ? rupees(s.tipPaise) : '',
    discount: s.mode === 'itemized' && s.discountPaise ? rupees(s.discountPaise) : '',
  }
}

function specOf(d: ExpenseDraft): SplitSpec {
  const people = d.participants
  switch (d.mode) {
    case 'equal':
      return { mode: 'equal', memberIds: people }
    case 'exact':
      return { mode: 'exact', entries: people.map((memberId) => ({ memberId, paise: money(d.exact[memberId] ?? '', 'split.entries') })) }
    case 'shares':
      return { mode: 'shares', entries: people.map((memberId) => ({ memberId, shares: d.shares[memberId] ?? 0 })) }
    case 'percent':
      return {
        mode: 'percent',
        entries: people.map((memberId) => {
          const bp = percentToBasisPoints(d.percent[memberId] ?? '')
          if (bp === null) throw new DraftError('split.entries', 'Use percentages like 33.33.')
          return { memberId, basisPoints: bp }
        }),
      }
    case 'itemized':
      return {
        mode: 'itemized',
        items: d.items.map((it, i) => {
          const name = it.name.trim() || `Item ${i + 1}`
          const amountPaise = money(it.amount, `split.items.${i}.amountPaise`, `the price of ${name}`)
          if (amountPaise === 0) throw new DraftError(`split.items.${i}.amountPaise`, `Add a price for ${name}.`)
          return { name, amountPaise, memberIds: it.memberIds }
        }),
        taxPaise: money(d.tax, 'split.taxPaise', 'the tax'),
        tipPaise: money(d.tip, 'split.tipPaise', 'the tip'),
        discountPaise: money(d.discount, 'split.discountPaise', 'the discount'),
      }
  }
}

function payersOf(d: ExpenseDraft, amountPaise: number) {
  return d.multiplePayers
    ? Object.entries(d.paid).map(([memberId, t]) => ({ memberId, paidPaise: money(t, 'payers') })).filter((p) => p.paidPaise > 0)
    : [{ memberId: d.payerId, paidPaise: amountPaise }]
}

const fieldOf = (e: unknown) => (e instanceof SplitMismatchError || e instanceof DraftError ? { field: e.field, message: e.message } : null)

/** Live preview for the sheet: per-person shares, or the reason there are none yet. Never throws. */
export function previewDraft(d: ExpenseDraft, memberOrder: string[]): Preview {
  let amountPaise = 0
  let payersLeftPaise = 0
  try {
    amountPaise = money(d.amount, 'amountPaise')
    payersLeftPaise = d.multiplePayers ? amountPaise - payersOf(d, amountPaise).reduce((s, p) => s + p.paidPaise, 0) : 0
  } catch (e) {
    return { rows: [], error: fieldOf(e), payersLeftPaise: 0 }
  }
  if (!amountPaise) return { rows: [], error: null, payersLeftPaise }
  try {
    return { rows: computeSplit(amountPaise, specOf(d), memberOrder), error: null, payersLeftPaise }
  } catch (e) {
    const f = fieldOf(e)
    if (!f) throw e
    return { rows: [], error: f, payersLeftPaise }
  }
}

/** The API body, or the first field to fix. The same engine as the server, so a valid preview never 422s. */
export function buildBody(d: ExpenseDraft, memberOrder: string[]):
  | { ok: true; body: GroupExpenseBody }
  | { ok: false; field: string; message: string } {
  try {
    const amountPaise = money(d.amount, 'amountPaise', 'the amount')
    if (!amountPaise) throw new DraftError('amountPaise', 'Enter an amount more than ₹0.')
    if (!d.description.trim()) throw new DraftError('description', 'What was it for?')
    if (!d.categoryId) throw new DraftError('categoryId', 'Pick a category.')
    const payers = payersOf(d, amountPaise)
    const split = specOf(d)
    checkPayers(amountPaise, payers)
    computeSplit(amountPaise, split, memberOrder)
    return {
      ok: true,
      body: {
        description: d.description.trim(), amountPaise, categoryId: d.categoryId,
        ...(d.occurredAt ? { occurredAt: d.occurredAt } : {}),
        payers, split,
      },
    }
  } catch (e) {
    const f = fieldOf(e)
    if (!f) throw e
    return { ok: false, ...f }
  }
}
