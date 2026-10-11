import { describe, expect, it } from 'vitest'
import { isMotionReady, resolveReducedMotion } from './motion-pref'

describe('resolveReducedMotion', () => {
  it('follows the OS on "system"', () => {
    expect(resolveReducedMotion('system', true)).toBe(true)
    expect(resolveReducedMotion('system', false)).toBe(false)
  })
  it('explicit settings override the OS', () => {
    expect(resolveReducedMotion('on', false)).toBe(true)
    expect(resolveReducedMotion('off', true)).toBe(false)
  })
  it('treats an unknown OS value (null, pre-hydration) as not reduced', () => {
    expect(resolveReducedMotion('system', null)).toBe(false)
    expect(resolveReducedMotion('on', null)).toBe(true)
    expect(resolveReducedMotion('off', null)).toBe(false)
  })
})

describe('isMotionReady', () => {
  it('is ready only once the OS preference is known', () => {
    expect(isMotionReady(null)).toBe(false)
    expect(isMotionReady(false)).toBe(true)
    expect(isMotionReady(true)).toBe(true)
  })
})
