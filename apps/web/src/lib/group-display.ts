import { formatISODate, type ISODate } from './dates'
import { formatINR } from './money'
import type { Payment } from './settle'

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
