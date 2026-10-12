import { formatINR } from './money'
import type { PayerRow } from './split'

/** Spec §2.6. Pure: the server computes balances with it, and the client renders "why" sentences from its output. */
export interface LedgerExpense {
  id: string
  description: string
  payers: PayerRow[]
  shares: { memberId: string; sharePaise: number }[]
}
/** Confirmed settlements only. Pending ones are shown, but change nothing. */
export interface LedgerSettlement { fromMember: string; toMember: string; amountPaise: number }
export interface Why {
  /** What the payer owes overall in this group (positive). */
  debtorOwesPaise: number
  /** The payer's expenses where they paid less than their share, biggest first. */
  debtorExpenses: { expenseId: string; description: string; netPaise: number }[]
  /** Every payment the payer makes, in order: how their debt is netted across creditors. */
  splitAcross: { memberId: string; amountPaise: number }[]
}
export interface Payment { from: string; to: string; amountPaise: number; why: Why }

/**
 * Net per member = Σ paid − Σ share + Σ settlements paid − Σ settlements received.
 * The settlement sign follows the spec §2.4 worked example (paying back raises your position); see plan Ambiguity A1.
 */
export function computeNets(memberOrder: string[], expenses: LedgerExpense[], settlements: LedgerSettlement[]): Map<string, number> {
  const net = new Map(memberOrder.map((id) => [id, 0]))
  const add = (id: string, v: number) => net.set(id, (net.get(id) ?? 0) + v)
  for (const e of expenses) {
    for (const p of e.payers) add(p.memberId, p.paidPaise)
    for (const s of e.shares) add(s.memberId, -s.sharePaise)
  }
  for (const s of settlements) {
    add(s.fromMember, s.amountPaise)
    add(s.toMember, -s.amountPaise)
  }
  return net
}

export function expenseNets(e: LedgerExpense): Map<string, number> {
  return computeNets([], [e], [])
}

/** Greedy min-cash-flow: the largest debtor pays the largest creditor, repeat. Each step settles at least one person: ≤ N−1 payments. */
export function simplify(memberOrder: string[], nets: Map<string, number>, expenses: LedgerExpense[] = []): Payment[] {
  const rank = new Map(memberOrder.map((id, i) => [id, i]))
  const rankOf = (id: string) => rank.get(id) ?? memberOrder.length
  const creditors = [...nets].filter(([, v]) => v > 0).map(([id, v]) => ({ id, left: v }))
  const debtors = [...nets].filter(([, v]) => v < 0).map(([id, v]) => ({ id, left: -v }))
  const pick = (list: { id: string; left: number }[]) =>
    list.reduce<{ id: string; left: number } | null>((best, c) => {
      if (c.left <= 0) return best
      if (!best || c.left > best.left || (c.left === best.left && rankOf(c.id) < rankOf(best.id))) return c
      return best
    }, null)

  const raw: { from: string; to: string; amountPaise: number }[] = []
  for (;;) {
    const c = pick(creditors)
    const d = pick(debtors)
    if (!c || !d) break
    const amountPaise = Math.min(c.left, d.left)
    raw.push({ from: d.id, to: c.id, amountPaise })
    c.left -= amountPaise
    d.left -= amountPaise
  }

  const perExpense = expenses.map((e) => ({ e, nets: expenseNets(e) }))
  return raw.map((p) => ({
    ...p,
    why: {
      debtorOwesPaise: -(nets.get(p.from) ?? 0),
      debtorExpenses: perExpense
        .map(({ e, nets: n }) => ({ expenseId: e.id, description: e.description, netPaise: n.get(p.from) ?? 0 }))
        .filter((x) => x.netPaise < 0)
        .sort((x, y) => x.netPaise - y.netPaise),
      splitAcross: raw.filter((q) => q.from === p.from).map((q) => ({ memberId: q.to, amountPaise: q.amountPaise })),
    },
  }))
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

function expenseList(names: string[]): string {
  if (names.length <= 3) return joinAnd(names)
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`
}

/**
 * Plain-language "why" (spec §2.6), viewer-relative:
 * "Asha pays you ₹1,200: Asha owes ₹2,000 across Bowling and Dinner; you are owed ₹1,200 and Ravi ₹800."
 * The debtor's name is repeated instead of a pronoun (plan Ambiguity A10).
 */
export function whyText(p: Payment, names: Map<string, string>, viewerId: string | null): string {
  const who = (id: string) => (id === viewerId ? 'you' : (names.get(id) ?? 'Someone'))
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const viewerPays = p.from === viewerId
  const head = `${cap(who(p.from))} ${viewerPays ? 'pay' : 'pays'} ${who(p.to)} ${formatINR(p.amountPaise)}`
  const across = expenseList(p.why.debtorExpenses.map((e) => e.description))
  const owes = `${who(p.from)} ${viewerPays ? 'owe' : 'owes'} ${formatINR(p.why.debtorOwesPaise)}${across ? ` across ${across}` : ''}`
  const chain = p.why.splitAcross.map((s, i) => {
    const n = who(s.memberId)
    return i === 0 ? `${n} ${n === 'you' ? 'are' : 'is'} owed ${formatINR(s.amountPaise)}` : `${n} ${formatINR(s.amountPaise)}`
  })
  return `${head}: ${owes}; ${joinAnd(chain)}.`
}
