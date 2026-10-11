import { describe, expect, it } from 'vitest'
import { keypadInput } from './keypad'

const type = (keys: string[]) => keys.reduce(keypadInput, '')

describe('keypadInput', () => {
  it('builds amounts digit by digit', () => {
    expect(type(['4', '5', '0'])).toBe('450')
  })
  it('collapses leading zeros and starts decimals with 0.', () => {
    expect(type(['0', '0', '7'])).toBe('7')
    expect(type(['.', '5'])).toBe('0.5')
  })
  it('allows one decimal point and two decimal places', () => {
    expect(type(['1', '.', '2', '.', '3', '4'])).toBe('1.23')
  })
  it('refuses keys that would exceed ₹1,00,00,000 without losing input', () => {
    expect(keypadInput('10000000', '0')).toBe('10000000')
  })
  it('back and clear', () => {
    expect(keypadInput('12.5', 'back')).toBe('12.')
    expect(keypadInput('12.5', 'clear')).toBe('')
  })
  it('ignores unknown keys', () => {
    expect(keypadInput('12', 'x')).toBe('12')
  })
  it('sanitises typed or pasted text character by character', () => {
    expect('1,250.50'.split('').reduce(keypadInput, '')).toBe('1250.50')
    expect('1250.505'.split('').reduce(keypadInput, '')).toBe('1250.50')
  })
})
