import { formatINR } from './money'

/** Spec §3.5: a polite message the user sends themselves. Coinflow never sends anything. */
export function reminderText(a: { toName: string; amountPaise: number; groupName: string; myUpiId: string | null }): string {
  const first = a.toName.trim().split(/\s+/)[0] || a.toName
  const upi = a.myUpiId ? ` My UPI: ${a.myUpiId}` : ''
  return `Hi ${first}, a gentle nudge for ${formatINR(a.amountPaise)} from ${a.groupName}.${upi}`
}

export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`
