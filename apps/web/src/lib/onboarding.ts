import { formatINR, MAX_AMOUNT_PAISE, parseRupeesToPaise } from './money'
import type { MePatch } from './schemas/me'

/** What each onboarding input currently holds, as typed. */
export type OnboardingValues = { name: string; income: string; payday: string; balance: string; fixed: string; upiId: string }
/** The saved profile fields onboarding compares against, so it only ever sends what changed. */
export type OnboardingBase = {
  name: string
  paydayDay: number
  monthlyIncome: number | null
  fixedCostsEstimate: number
  upiId: string | null
  onboardingStep: number
}
export type FieldIssue = { field: string; message: string }
export type StepPlan = { ok: true; patch: MePatch; checkin: number | null } | { ok: false; issue: FieldIssue }

export const LAST_STEP = 7
const MAX_NOTICE = `Max ${formatINR(MAX_AMOUNT_PAISE)}`

/** A saved step of 0 (never started) or out of range resumes inside 1..7. */
export const resumeStep = (saved: number) => Math.min(LAST_STEP, Math.max(1, saved || 1))

/** The input id that owns each server/validation field, so errors can move focus to it. */
const TARGETS: Record<string, string> = {
  name: 'ob-name',
  paydayDay: 'ob-payday',
  monthlyIncome: 'ob-income',
  amount: 'ob-balance',
  fixedCostsEstimate: 'ob-fixed',
  upiId: 'ob-upi',
  // Bills: an open, unsaved bill form blocks Continue; focus goes to that form's "Add to schedule".
  bills: 'ob-bill-submit',
}
export const fieldTarget = (field: string): string | null => TARGETS[field] ?? null

type Money = { ok: true; paise: number | null } | { ok: false; message: string }

/** Blank is "nothing entered". "12." is a valid mid-typing state. Anything else must be a bounded rupee amount. */
function money(typed: string, hint: string): Money {
  const text = typed.trim()
  if (text === '') return { ok: true, paise: null }
  const paise = parseRupeesToPaise(text.endsWith('.') ? text.slice(0, -1) : text)
  if (paise === null) return { ok: false, message: hint }
  if (paise > MAX_AMOUNT_PAISE) return { ok: false, message: MAX_NOTICE }
  return { ok: true, paise }
}

const fail = (field: string, message: string): StepPlan => ({ ok: false, issue: { field, message } })

/**
 * What to save when leaving `step`. Validates this step's inputs, then builds a patch with only the
 * fields that differ from `base`, plus the progress marker (never lowered), and at most one check-in.
 * An empty patch and no check-in means there is nothing to send.
 */
export function planStep(step: number, v: OnboardingValues, base: OnboardingBase, lastCheckin: number | null): StepPlan {
  const patch: MePatch = {}
  let checkin: number | null = null

  if (step === 1) {
    const name = v.name.trim()
    if (!name) return fail('name', 'Add your name so we can greet you.')
    if (name !== base.name) patch.name = name
  } else if (step === 2) {
    const text = v.payday.trim()
    const day = /^\d{1,2}$/.test(text) ? Number(text) : NaN
    if (!(day >= 1 && day <= 31)) return fail('paydayDay', 'Pick a day from 1 to 31.')
    const income = money(v.income, 'Enter an amount like 90,000, or leave it blank.')
    if (!income.ok) return fail('monthlyIncome', income.message)
    if (day !== base.paydayDay) patch.paydayDay = day
    if (income.paise !== base.monthlyIncome) patch.monthlyIncome = income.paise
  } else if (step === 3) {
    const balance = money(v.balance, 'Enter an amount like 50,000, or skip for now.')
    if (!balance.ok) return fail('amount', balance.message)
    if (balance.paise !== null && balance.paise !== lastCheckin) checkin = balance.paise
  } else if (step === 5) {
    const fixed = money(v.fixed, 'Enter an amount like 8,000, or leave it blank.')
    if (!fixed.ok) return fail('fixedCostsEstimate', fixed.message)
    const paise = fixed.paise ?? 0
    if (paise !== base.fixedCostsEstimate) patch.fixedCostsEstimate = paise
  } else if (step === 6) {
    // The server owns the name@bank format; its 422 comes back as an inline error on this field.
    const upi = v.upiId.trim() || null
    if (upi !== base.upiId) patch.upiId = upi
  }

  const next = Math.min(LAST_STEP, step + 1)
  if (next > base.onboardingStep) patch.onboardingStep = next
  return { ok: true, patch, checkin }
}
