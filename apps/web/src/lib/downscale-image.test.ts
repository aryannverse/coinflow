import { describe, expect, it, vi } from 'vitest'
import { downscaleForUpload, type ImageCodec } from './downscale-image'

const file = (bytes: number, type = 'image/jpeg') => new File([new Uint8Array(bytes)], 'receipt.jpg', { type })

function codec(width: number, height: number, outBytes: number): ImageCodec & { encode: ReturnType<typeof vi.fn> } {
  return {
    decode: vi.fn(async () => ({ width, height, source: 'bitmap' as unknown as CanvasImageSource, close: vi.fn() })),
    encode: vi.fn(async () => new Blob([new Uint8Array(outBytes)], { type: 'image/jpeg' })),
  }
}

describe('receipt photo downscale before upload (spec §10)', () => {
  it('redraws the photo with its longest side at 2,000 px as JPEG 0.85', async () => {
    const c = codec(4032, 3024, 900_000)
    const out = await downscaleForUpload(file(6_000_000), c)
    expect(c.encode).toHaveBeenCalledWith('bitmap', { width: 2000, height: 1500 }, 'image/jpeg', 0.85)
    expect(out.type).toBe('image/jpeg')
    expect(out.size).toBe(900_000)
    expect(out.name).toBe('receipt.jpg')
  })

  it('keeps small photos at their size but still re-encodes them', async () => {
    const c = codec(1200, 900, 200_000)
    await downscaleForUpload(file(300_000, 'image/png'), c)
    expect(c.encode).toHaveBeenCalledWith('bitmap', { width: 1200, height: 900 }, 'image/jpeg', 0.85)
  })

  it('sends the original when the browser can’t decode or encode it', async () => {
    const original = file(1_000)
    const broken: ImageCodec = { decode: async () => { throw new Error('HEIC') }, encode: async () => new Blob() }
    expect(await downscaleForUpload(original, broken)).toBe(original)
    const noEncode: ImageCodec = { decode: async () => ({ width: 10, height: 10, source: 'b' as unknown as CanvasImageSource }), encode: async () => null }
    expect(await downscaleForUpload(original, noEncode)).toBe(original)
  })

  it('keeps the original if re-encoding made it bigger', async () => {
    const original = file(50_000)
    expect(await downscaleForUpload(original, codec(800, 600, 80_000))).toBe(original)
  })
})
