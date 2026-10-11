import { describe, expect, it } from 'vitest'
import { sliderKeyStep } from './slider-keys'

const o = { min: 0, max: 1_000_000, step: 50_000, page: 200_000 }

describe('sliderKeyStep', () => {
  it('steps with arrows and clamps', () => {
    expect(sliderKeyStep('ArrowRight', 100_000, o)).toBe(150_000)
    expect(sliderKeyStep('ArrowDown', 0, o)).toBe(0)
    expect(sliderKeyStep('ArrowUp', 990_000, o)).toBe(1_000_000)
  })
  it('pages and jumps', () => {
    expect(sliderKeyStep('PageUp', 100_000, o)).toBe(300_000)
    expect(sliderKeyStep('Home', 500_000, o)).toBe(0)
    expect(sliderKeyStep('End', 0, o)).toBe(1_000_000)
  })
  it('ignores other keys', () => {
    expect(sliderKeyStep('a', 1, o)).toBeNull()
  })
})
