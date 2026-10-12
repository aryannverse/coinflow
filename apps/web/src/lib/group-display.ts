import { formatISODate, type ISODate } from './dates'
import { formatINR } from './money'
import type { Payment } from './settle'

/**
 * The group page's tabs, kept in `?tab=`. They live here, not in the client GroupView: a server page that imports a
 * value from a 'use client' module gets a client reference, not the array (`GROUP_TABS.includes is not a function`).
 */
export const GROUP_TABS = ['expenses', 'balances', 'activity', 'members'] as const
export type GroupTab = (typeof GROUP_TABS)[number]

/** `?tab=` → a known tab, else `fallback` (Expenses). */
export function groupTab(value: string | null | undefined, fallback: GroupTab = 'expenses'): GroupTab {
  return GROUP_TABS.find((t) => t === value) ?? fallback
}

export function positionCopy(paise: number): { text: string; tone: 'owed' | 'owe' | 'settled' } {
  if (paise > 0) return { text: `You’re owed ${formatINR(paise)}`, tone: 'owed' }
  if (paise < 0) return { text: `You owe ${formatINR(-paise)}`, tone: 'owe' }
  return { text: 'Settled', tone: 'settled' }
}

export function dateRange(startsOn: ISODate | null, endsOn: ISODate | null): string | null {
  if (!startsOn && !endsOn) return null
  if (startsOn && !endsOn) return `From ${formatISODate(startsOn)}`
  if (!startsOn && endsOn) return `Until ${formatISODate(endsOn)}`
  const [a, b] = [startsOn as string, endsOn as string]
  if (a === b) return formatISODate(a)
  if (a.slice(0, 7) === b.slice(0, 7)) return `${Number(a.slice(8))}–${formatISODate(b)}`
  return `${formatISODate(a)} – ${formatISODate(b)}`
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}

/** "Asha pays you ₹200" / "You pay Yash ₹200" / "Asha pays Ravi ₹100". */
export function paymentHeadline(p: Pick<Payment, 'from' | 'to' | 'amountPaise'>, names: Map<string, string>, viewerId: string | null): string {
  const who = (id: string) => (id === viewerId ? 'you' : (names.get(id) ?? 'Someone'))
  const subject = p.from === viewerId ? 'You pay' : `${who(p.from)} pays`
  return `${subject} ${who(p.to)} ${formatINR(p.amountPaise)}`
}

/** "just now", "5 min ago", "3 h ago", else "12 Oct" (IST). Shared by the bell and the group Activity tab. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const mins = Math.round((now - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  return hrs < 24 ? `${hrs} h ago` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
}

type Payee = { displayName: string; claimed: boolean }

/** After "I’ve paid": a claimed payee confirms; a placeholder can’t until they join (plan A7), so say that instead. */
export function waitingForPayee(payee: Payee): string {
  return payee.claimed
    ? `Waiting for ${payee.displayName} to confirm.`
    : `${payee.displayName} hasn’t joined Coinflow yet — they’ll be asked to confirm when they do.`
}

/** The sum of `fromId`'s pending marks to `toId`. */
export const markedPaise = (pending: { fromMember: string; toMember: string; amountPaise: number }[], fromId: string, toId: string) =>
  pending.filter((s) => s.fromMember === fromId && s.toMember === toId).reduce((sum, s) => sum + s.amountPaise, 0)

/**
 * "Marked ₹200 · waiting for Asha" when `fromId` has pending marks to `toId` (summed), else null. Balances shows it in
 * place of a second "Settle up" for a payment already marked, since pending marks don't change the suggested payments.
 */
export function markedPayment(
  pending: { fromMember: string; toMember: string; amountPaise: number }[], fromId: string, toId: string, payee: Payee,
): string | null {
  const marked = markedPaise(pending, fromId, toId)
  if (marked === 0) return null
  return `Marked ${formatINR(marked)} · ${payee.claimed ? `waiting for ${payee.displayName}` : waitingForPayee(payee)}`
}
