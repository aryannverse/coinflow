import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AppError } from './errors'
import { sniffImageType, toErrorResponse } from './http'

describe('toErrorResponse', () => {
  it('maps AppError to its status and shape', async () => {
    const res = toErrorResponse(new AppError('invalid', 'Pick a category.', 422, 'categoryId'), 'r1')
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: { code: 'invalid', message: 'Pick a category.', field: 'categoryId' }, requestId: 'r1' })
  })

  it('maps ZodError to 422 with the first field path', async () => {
    const parsed = z.object({ amount: z.number().min(1, 'Too small') }).safeParse({ amount: 0 })
    const res = toErrorResponse(parsed.error, 'r2')
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: { code: 'invalid', field: 'amount', message: 'Too small' } })
  })

  it('hides internals for unknown errors', async () => {
    const res = toErrorResponse(new Error('db exploded: password=…'), 'r3')
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.message).not.toContain('password')
    expect(body.requestId).toBe('r3')
  })
})

describe('sniffImageType', () => {
  it('detects png/jpeg/webp by magic bytes', () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffImageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns='))).toBeNull()
  })
})
