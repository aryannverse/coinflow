import { describe, expect, it } from 'vitest'
import { formatINR, parseRupeesToPaise, paiseToRupeeString } from './money'

describe('parseRupeesToPaise', () => {
  it.each([
    ['450', 45000],
    ['450.5', 45050],
    ['1,250.50', 125050],
    ['₹ 1,25,000', 12500000],
    [' 99 ', 9900],
    ['0.01', 1],
  ])('parses %j → %d paise', (input, expected) => {
    expect(parseRupeesToPaise(input)).toBe(expected)
  })

  it.each(['', 'abc', '-50', '1.234', '1e5', '12.'])('rejects %j', (input) => {
    expect(parseRupeesToPaise(input)).toBeNull()
  })
})

describe('formatINR', () => {
  it('uses Indian grouping and hides zero paise', () => {
    expect(formatINR(12500000)).toBe('₹1,25,000')
    expect(formatINR(0)).toBe('₹0')
  })
  it('shows paise when present', () => {
    expect(formatINR(45050)).toBe('₹450.50')
  })
  it('uses a true minus sign for negatives and optional plus', () => {
    expect(formatINR(-31000)).toBe('−₹310')
    expect(formatINR(31000, { signed: true })).toBe('+₹310')
  })
})

describe('paiseToRupeeString', () => {
  it('produces plain decimal strings for inputs and CSV', () => {
    expect(paiseToRupeeString(125050)).toBe('1250.50')
    expect(paiseToRupeeString(45000)).toBe('450')
  })
})
