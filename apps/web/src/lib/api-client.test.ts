import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api-client'

afterEach(() => vi.unstubAllGlobals())

describe('api', () => {
  it('prefixes /api/v1 and sends JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: 1 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(api('/me', { method: 'PATCH', json: { name: 'A' } })).resolves.toEqual({ data: 1 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/me')
    expect(init.body).toBe('{"name":"A"}')
    expect(init.headers['content-type']).toBe('application/json')
  })

  it('throws ApiError with server code, field and requestId', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'invalid', message: 'Pick a category.', field: 'categoryId' }, requestId: 'r9' }), { status: 422 })))
    const err = await api('/transactions').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ code: 'invalid', status: 422, field: 'categoryId', requestId: 'r9', message: 'Pick a category.' })
  })

  it('maps network failures to an offline ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(api('/me')).rejects.toMatchObject({ code: 'offline', status: 0 })
  })

  it('falls back to a generic ApiError when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 })))
    await expect(api('/me')).rejects.toMatchObject({ code: 'http_error', status: 502 })
  })

  it('does not set a content-type header when there is no JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: 1 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await api('/me')
    expect(fetchMock.mock.calls[0][1].headers['content-type']).toBeUndefined()
  })
})
