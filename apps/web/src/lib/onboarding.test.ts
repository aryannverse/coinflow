import { describe, expect, it } from 'vitest'
import { fieldTarget, planStep, resumeStep, type OnboardingBase, type OnboardingValues } from './onboarding'

const base: OnboardingBase = { name: 'Asha', paydayDay: 1, monthlyIncome: null, fixedCostsEstimate: 0, upiId: null, onboardingStep: 1 }
const values: OnboardingValues = { name: 'Asha', income: '', payday: '1', balance: '', fixed: '', upiId: '' }
const plan = (step: number, v: Partial<OnboardingValues> = {}, b: Partial<OnboardingBase> = {}, last: number | null = null) =>
  planStep(step, { ...values, ...v }, { ...base, ...b }, last)

describe('resumeStep', () => {
  it('clamps the saved step into 1..7 and treats 0 as the first step', () => {
    expect(resumeStep(0)).toBe(1)
    expect(resumeStep(4)).toBe(4)
    expect(resumeStep(9)).toBe(7)
    expect(resumeStep(-2)).toBe(1)
  })
})

describe('planStep: only what changed', () => {
  it('welcome with an unchanged name sends just the progress marker', () => {
    expect(plan(1)).toEqual({ ok: true, patch: { onboardingStep: 2 }, checkin: null })
  })
  it('welcome with a new name trims it and sends it with progress', () => {
    expect(plan(1, { name: '  Meera ' })).toEqual({ ok: true, patch: { name: 'Meera', onboardingStep: 2 }, checkin: null })
  })
  it('an empty name is an inline issue on name', () => {
    expect(plan(1, { name: '   ' })).toMatchObject({ ok: false, issue: { field: 'name' } })
  })
  it('never lowers the saved progress (back then Continue again)', () => {
    expect(plan(1, {}, { onboardingStep: 5 })).toEqual({ ok: true, patch: {}, checkin: null })
    expect(plan(2, { payday: '25' }, { onboardingStep: 5 })).toEqual({ ok: true, patch: { paydayDay: 25 }, checkin: null })
  })
  it('income step sends payday and income only when they changed', () => {
    expect(plan(2, { income: '90,000', payday: '25' })).toEqual({
      ok: true, patch: { paydayDay: 25, monthlyIncome: 9_000_000, onboardingStep: 3 }, checkin: null,
    })
    expect(plan(2, { income: '90000', payday: '1' }, { monthlyIncome: 9_000_000 })).toEqual({
      ok: true, patch: { onboardingStep: 3 }, checkin: null,
    })
  })
  it('clearing a saved income sends null', () => {
    expect(plan(2, { income: '' }, { monthlyIncome: 9_000_000 })).toMatchObject({ ok: true, patch: { monthlyIncome: null } })
  })
  it('payday must be a whole day from 1 to 31', () => {
    for (const bad of ['', '0', '32', '1.5', 'abc', '-3']) {
      expect(plan(2, { payday: bad })).toMatchObject({ ok: false, issue: { field: 'paydayDay' } })
    }
    expect(plan(2, { payday: '31' })).toMatchObject({ ok: true, patch: { paydayDay: 31 } })
  })
  it('a bad or oversized income is an inline issue on monthlyIncome', () => {
    expect(plan(2, { income: '9x' })).toMatchObject({ ok: false, issue: { field: 'monthlyIncome' } })
    expect(plan(2, { income: '2,00,00,000' })).toMatchObject({ ok: false, issue: { field: 'monthlyIncome', message: expect.stringContaining('Max') } })
  })
})

describe('planStep: balance check-in', () => {
  it('blank balance is a skip: no check-in, just progress', () => {
    expect(plan(3)).toEqual({ ok: true, patch: { onboardingStep: 4 }, checkin: null })
  })
  it('a typed balance becomes one check-in in paise', () => {
    expect(plan(3, { balance: '₹50,000' })).toEqual({ ok: true, patch: { onboardingStep: 4 }, checkin: 5_000_000 })
  })
  it('the same balance is not posted twice (back then Continue)', () => {
    expect(plan(3, { balance: '50000' }, {}, 5_000_000)).toEqual({ ok: true, patch: { onboardingStep: 4 }, checkin: null })
  })
  it('a different balance is posted again', () => {
    expect(plan(3, { balance: '60000' }, {}, 5_000_000)).toMatchObject({ checkin: 6_000_000 })
  })
  it('garbage or too large is an inline issue on amount', () => {
    expect(plan(3, { balance: 'lots' })).toMatchObject({ ok: false, issue: { field: 'amount' } })
    expect(plan(3, { balance: '9,99,99,99,999' })).toMatchObject({ ok: false, issue: { field: 'amount' } })
  })
  it('accepts a trailing dot while typing', () => {
    expect(plan(3, { balance: '120.' })).toMatchObject({ ok: true, checkin: 12_000 })
  })
})

describe('planStep: bills, basics and UPI', () => {
  it('bills only records progress (the form saves items itself)', () => {
    expect(plan(4)).toEqual({ ok: true, patch: { onboardingStep: 5 }, checkin: null })
  })
  it('basics sends fixedCostsEstimate only when changed; blank is 0', () => {
    expect(plan(5, { fixed: '8,000' })).toMatchObject({ patch: { fixedCostsEstimate: 800_000, onboardingStep: 6 } })
    expect(plan(5, { fixed: '' })).toEqual({ ok: true, patch: { onboardingStep: 6 }, checkin: null })
    expect(plan(5, { fixed: '' }, { fixedCostsEstimate: 800_000 })).toMatchObject({ patch: { fixedCostsEstimate: 0 } })
    expect(plan(5, { fixed: '8000' }, { fixedCostsEstimate: 800_000 })).toEqual({ ok: true, patch: { onboardingStep: 6 }, checkin: null })
  })
  it('a bad basics amount is an inline issue on fixedCostsEstimate', () => {
    expect(plan(5, { fixed: 'x' })).toMatchObject({ ok: false, issue: { field: 'fixedCostsEstimate' } })
    expect(plan(5, { fixed: '2,00,00,000' })).toMatchObject({ ok: false, issue: { field: 'fixedCostsEstimate' } })
  })
  it('upi: blank unchanged is just progress, typed is trimmed, cleared is null; the server validates the format', () => {
    expect(plan(6)).toEqual({ ok: true, patch: { onboardingStep: 7 }, checkin: null })
    expect(plan(6, { upiId: ' asha@okaxis ' })).toMatchObject({ patch: { upiId: 'asha@okaxis', onboardingStep: 7 } })
    expect(plan(6, { upiId: '' }, { upiId: 'asha@okaxis' })).toMatchObject({ patch: { upiId: null } })
    expect(plan(6, { upiId: 'asha@okaxis' }, { upiId: 'asha@okaxis' })).toEqual({ ok: true, patch: { onboardingStep: 7 }, checkin: null })
  })
})

describe('fieldTarget', () => {
  it('maps server fields to the input that owns them', () => {
    expect(fieldTarget('upiId')).toBe('ob-upi')
    expect(fieldTarget('paydayDay')).toBe('ob-payday')
    expect(fieldTarget('amount')).toBe('ob-balance')
    expect(fieldTarget('name')).toBe('ob-name')
    expect(fieldTarget('monthlyIncome')).toBe('ob-income')
    expect(fieldTarget('fixedCostsEstimate')).toBe('ob-fixed')
    expect(fieldTarget('somethingElse')).toBeNull()
  })
})
