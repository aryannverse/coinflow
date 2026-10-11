import { MAX_AMOUNT_PAISE, parseRupeesToPaise } from './money'

/** One keypress on the amount pad: digits, '.', 'back' or 'clear'. Anything else leaves the input untouched. */
export function keypadInput(current: string, key: string): string {
  if (key === 'clear') return ''
  if (key === 'back') return current.slice(0, -1)
  if (key === '.') return current.includes('.') ? current : (current || '0') + '.'
  if (!/^\d$/.test(key)) return current
  const [, decimals] = current.split('.')
  if (decimals !== undefined && decimals.length >= 2) return current
  const next = current === '0' ? key : current + key
  const paise = parseRupeesToPaise(next.endsWith('.') ? next.slice(0, -1) : next)
  return paise !== null && paise > MAX_AMOUNT_PAISE ? current : next
}
