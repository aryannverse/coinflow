import { describe, expect, it } from 'vitest'
import { MAX_AMOUNT_PAISE } from './money'
import { buildMePatch, profileValues } from './profile-patch'

const me = { name: 'Aryan', paydayDay: 5, monthlyIncome: 6000000 as number | null, fixedCostsEstimate: 2500050, upiId: 'aryan@okaxis' as string | null }
const all = profileValues(me)

describe('profileValues', () => {
  it('prefills rupee strings from paise', () => {
    expect(all).toEqual({ name: 'Aryan', paydayDay: '5', monthlyIncome: '60000', fixedCostsEstimate: '25000.50', upiId: 'aryan@okaxis' })
  })
  it('null income and null UPI prefill as empty; zero income is 0', () => {
    expect(profileValues({ ...me, monthlyIncome: null, upiId: null })).toMatchObject({ monthlyIncome: '', upiId: '' })
    expect(profileValues({ ...me, monthlyIncome: 0 }).monthlyIncome).toBe('0')
  })
})

describe('buildMePatch', () => {
  it('nothing changed gives an empty patch and no errors', () => {
    expect(buildMePatch(me, all)).toEqual({ patch: {}, errors: {} })
  })
  it('sends only the fields that differ', () => {
    expect(buildMePatch(me, { ...all, name: '  Aryan V  ' }).patch).toEqual({ name: 'Aryan V' })
    expect(buildMePatch(me, { ...all, paydayDay: '10', fixedCostsEstimate: '26,000' }).patch).toEqual({ paydayDay: 10, fixedCostsEstimate: 2600000 })
  })
  it('only looks at the fields it is given (UPI blur sends just upiId)', () => {
    expect(buildMePatch(me, { upiId: 'new@okicici' }).patch).toEqual({ upiId: 'new@okicici' })
    expect(buildMePatch(me, { upiId: 'aryan@okaxis' }).patch).toEqual({})
  })
  it('whitespace around an unchanged value is not a change', () => {
    expect(buildMePatch(me, { name: ' Aryan ', upiId: ' aryan@okaxis ' }).patch).toEqual({})
  })
  it('a cleared UPI ID or income is sent as null; a blank basics value is 0', () => {
    expect(buildMePatch(me, { upiId: '  ' }).patch).toEqual({ upiId: null })
    expect(buildMePatch(me, { monthlyIncome: '' }).patch).toEqual({ monthlyIncome: null })
    expect(buildMePatch(me, { fixedCostsEstimate: '' }).patch).toEqual({ fixedCostsEstimate: 0 })
  })
  it('clearing an already-empty value is no change', () => {
    const empty = { ...me, monthlyIncome: null, upiId: null }
    expect(buildMePatch(empty, { monthlyIncome: '', upiId: '' }).patch).toEqual({})
  })
  it('flags what cannot be sent, per field, and leaves it out of the patch', () => {
    const r = buildMePatch(me, { name: '   ', paydayDay: 'x', monthlyIncome: '12abc', fixedCostsEstimate: String(MAX_AMOUNT_PAISE / 100 + 1) })
    expect(r.patch).toEqual({})
    expect(Object.keys(r.errors).sort()).toEqual(['fixedCostsEstimate', 'monthlyIncome', 'name', 'paydayDay'])
    expect(r.errors.name).toBe('Add your name.')
  })
  it('range and UPI format are left to the server (it answers with a field error)', () => {
    expect(buildMePatch(me, { paydayDay: '45', upiId: 'nope' })).toEqual({ patch: { paydayDay: 45, upiId: 'nope' }, errors: {} })
  })
  it('a valid field still goes through when another field is invalid', () => {
    const r = buildMePatch(me, { name: '', paydayDay: '9' })
    expect(r.patch).toEqual({ paydayDay: 9 })
    expect(r.errors).toHaveProperty('name')
  })
})
