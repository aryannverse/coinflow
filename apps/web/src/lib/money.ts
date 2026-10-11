export const MAX_AMOUNT_PAISE = 1_000_000_000 // ₹1,00,00,000

/** "₹1,250.50" | "1250.5" | "450" → paise. Returns null for anything that is not a non-negative amount with ≤ 2 decimals. */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const [rupees, fraction = ''] = cleaned.split('.')
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(paise) ? paise : null
}

const whole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 })
const exact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatINR(paise: number, opts: { signed?: boolean } = {}): string {
  const abs = Math.abs(paise)
  const body = (abs % 100 === 0 ? whole : exact).format(abs / 100)
  if (paise < 0) return `−${body}` // U+2212, paired with neutral colour in the UI
  if (opts.signed && paise > 0) return `+${body}`
  return body
}

export function paiseToRupeeString(paise: number): string {
  const rupees = Math.trunc(paise / 100)
  const rest = Math.abs(paise % 100)
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, '0')}`
}
