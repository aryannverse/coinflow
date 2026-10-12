import { describe, expect, it } from 'vitest'
import { AUDIO_MAX_BYTES, fitWithin, RECEIPT_MAX_BYTES, RECEIPT_TOO_LARGE, RECEIPT_MAX_SIDE } from './upload-limits'

describe('upload limits under Vercel’s 4.5 MB request body cap (spec §10)', () => {
  it('caps receipts and audio at 4 MB', () => {
    expect(RECEIPT_MAX_BYTES).toBe(4 * 1024 * 1024)
    expect(AUDIO_MAX_BYTES).toBe(4 * 1024 * 1024)
    expect(RECEIPT_TOO_LARGE).toBe('That photo is over 4 MB. Try a closer, smaller shot.')
  })

  it('fits the longest side within 2,000 px, keeping the aspect ratio', () => {
    expect(RECEIPT_MAX_SIDE).toBe(2000)
    expect(fitWithin(4032, 3024)).toEqual({ width: 2000, height: 1500 })
    expect(fitWithin(3024, 4032)).toEqual({ width: 1500, height: 2000 })
    expect(fitWithin(1200, 900)).toEqual({ width: 1200, height: 900 }) // never upscaled
    expect(fitWithin(5000, 7)).toEqual({ width: 2000, height: 3 })
    expect(fitWithin(1, 9000)).toEqual({ width: 1, height: 2000 }) // never 0 px
  })
})
