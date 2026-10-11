import { MAX_AMOUNT_PAISE, parseRupeesToPaise } from './money'

/** One keypress, reporting whether a digit was refused because it would pass ₹1,00,00,000. */
export function keypadPress(current: string, key: string): { value: string; capped: boolean } {
  if (key === 'clear') return { value: '', capped: false }
  if (key === 'back') return { value: current.slice(0, -1), capped: false }
  if (key === '.') return { value: current.includes('.') ? current : (current || '0') + '.', capped: false }
  if (!/^\d$/.test(key)) return { value: current, capped: false }
  const [, decimals] = current.split('.')
  if (decimals !== undefined && decimals.length >= 2) return { value: current, capped: false }
  const next = current === '0' ? key : current + key
  const paise = parseRupeesToPaise(next.endsWith('.') ? next.slice(0, -1) : next)
  return paise !== null && paise > MAX_AMOUNT_PAISE ? { value: current, capped: true } : { value: next, capped: false }
}

/** One keypress on the amount pad: digits, '.', 'back' or 'clear'. Anything else leaves the input untouched. */
export function keypadInput(current: string, key: string): string {
  return keypadPress(current, key).value
}

/**
 * Sanitises whole typed or pasted text (commas, ₹ and spaces dropped). `capped` means some digit would
 * have passed the cap; callers should then reject the text whole rather than keep a mangled number.
 */
export function parseAmountText(text: string): { value: string; capped: boolean } {
  let value = ''
  let capped = false
  for (const ch of text) {
    const step = keypadPress(value, ch)
    value = step.value
    capped ||= step.capped
  }
  return { value, capped }
}
