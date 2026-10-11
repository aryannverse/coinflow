import { MAX_AMOUNT_PAISE, paiseToRupeeString, parseRupeesToPaise } from './money'
import type { MePatch } from './schemas/me'

export type ProfileMe = { name: string; paydayDay: number; monthlyIncome: number | null; fixedCostsEstimate: number; upiId: string | null }
/** What the inputs hold: always strings, as typed. */
export type ProfileValues = { name: string; paydayDay: string; monthlyIncome: string; fixedCostsEstimate: string; upiId: string }
export type ProfileField = keyof ProfileValues
export type ProfileErrors = Partial<Record<ProfileField, string>>

const MONEY_HINT = 'Use numbers only, like 50,000 or 1250.50.'
const TOO_MUCH = 'That’s more than ₹1,00,00,000 — please check the amount.'

/** Input values to show for the saved profile (lazy `useState` initialiser; paise to rupees). */
export function profileValues(me: ProfileMe): ProfileValues {
  return {
    name: me.name,
    paydayDay: String(me.paydayDay),
    monthlyIncome: me.monthlyIncome === null ? '' : paiseToRupeeString(me.monthlyIncome),
    fixedCostsEstimate: paiseToRupeeString(me.fixedCostsEstimate),
    upiId: me.upiId ?? '',
  }
}

function money(raw: string): { paise: number } | { error: string } {
  const paise = parseRupeesToPaise(raw)
  if (paise === null) return { error: MONEY_HINT }
  if (paise > MAX_AMOUNT_PAISE) return { error: TOO_MUCH }
  return { paise }
}

/**
 * Edit-form patch: only the given fields that differ from `me`, parsed for the API.
 * `{}` means there is nothing to send. A field that cannot be sent is reported in `errors` and left out.
 * Only things the server cannot be asked about are checked here (unparseable text, empty name, the amount cap);
 * the payday range and UPI format stay with the server, which answers with a field error.
 */
export function buildMePatch(me: ProfileMe, next: Partial<ProfileValues>): { patch: MePatch; errors: ProfileErrors } {
  const patch: MePatch = {}
  const errors: ProfileErrors = {}

  if (next.name !== undefined) {
    const name = next.name.trim()
    if (!name) errors.name = 'Add your name.'
    else if (name.length > 60) errors.name = 'Keep your name to 60 characters or fewer.'
    else if (name !== me.name) patch.name = name
  }
  if (next.paydayDay !== undefined) {
    const raw = next.paydayDay.trim()
    if (!/^\d{1,3}$/.test(raw)) errors.paydayDay = 'Pick a day of the month, from 1 to 31.'
    else if (Number(raw) !== me.paydayDay) patch.paydayDay = Number(raw)
  }
  if (next.monthlyIncome !== undefined) {
    const raw = next.monthlyIncome.trim()
    if (raw === '') {
      if (me.monthlyIncome !== null) patch.monthlyIncome = null
    } else {
      const m = money(raw)
      if ('error' in m) errors.monthlyIncome = m.error
      else if (m.paise !== me.monthlyIncome) patch.monthlyIncome = m.paise
    }
  }
  if (next.fixedCostsEstimate !== undefined) {
    const raw = next.fixedCostsEstimate.trim()
    const m = raw === '' ? { paise: 0 } : money(raw)
    if ('error' in m) errors.fixedCostsEstimate = m.error
    else if (m.paise !== me.fixedCostsEstimate) patch.fixedCostsEstimate = m.paise
  }
  if (next.upiId !== undefined) {
    const upiId = next.upiId.trim() || null
    if (upiId !== me.upiId) patch.upiId = upiId
  }
  return { patch, errors }
}
