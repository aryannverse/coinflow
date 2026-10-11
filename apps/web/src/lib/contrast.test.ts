import { describe, expect, it } from 'vitest'
import { contrastRatio } from './contrast'

describe('contrastRatio', () => {
  it('matches WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
  })
})
