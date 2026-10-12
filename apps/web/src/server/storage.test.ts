import { beforeEach, describe, expect, it, vi } from 'vitest'

const blob = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }))
vi.mock('@vercel/blob', () => blob)

import { getStorage, localStorageDriver, vercelBlobStorageDriver } from './storage'

const KEY = 'qr/user_1/0b6c3e3a-1d7e-4a51-9a7e-5d1f0c2b9e11.png'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

describe('Vercel Blob storage driver (spec §10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.STORAGE_DRIVER
  })

  it('puts private objects at exactly the key, never with a public URL', async () => {
    blob.put.mockResolvedValue({ url: 'https://store.private.blob.vercel-storage.com/x', pathname: KEY })
    await expect(vercelBlobStorageDriver().put(KEY, PNG, 'image/png')).resolves.toBeUndefined()
    expect(blob.put).toHaveBeenCalledWith(KEY, expect.any(Buffer), { access: 'private', contentType: 'image/png', addRandomSuffix: false })
    expect(Buffer.from(blob.put.mock.calls[0][1] as Buffer)).toEqual(Buffer.from(PNG))
  })

  it('reads a private object back as bytes with its type', async () => {
    blob.get.mockResolvedValue({ statusCode: 200, stream: new Blob([PNG]).stream(), blob: { contentType: 'image/png' } })
    const file = await vercelBlobStorageDriver().get(KEY)
    expect(blob.get).toHaveBeenCalledWith(KEY, { access: 'private' })
    expect(file).toEqual({ data: PNG, contentType: 'image/png' })
  })

  it('falls back to the extension’s type and reports a missing object as null', async () => {
    blob.get.mockResolvedValueOnce({ statusCode: 200, stream: new Blob([PNG]).stream(), blob: { contentType: null } })
    expect((await vercelBlobStorageDriver().get(KEY))?.contentType).toBe('image/png')
    blob.get.mockResolvedValueOnce(null)
    expect(await vercelBlobStorageDriver().get(KEY)).toBeNull()
  })

  it('deletes by key', async () => {
    blob.del.mockResolvedValue(undefined)
    await vercelBlobStorageDriver().remove(KEY)
    expect(blob.del).toHaveBeenCalledWith(KEY)
  })

  it('refuses keys that could escape their folder, before calling Blob', async () => {
    const driver = vercelBlobStorageDriver()
    for (const bad of ['qr/../secrets.png', 'qr/a b.png', '/qr/x.png', 'qr//x.png', 'https://evil.test/x.png']) {
      await expect(driver.get(bad)).rejects.toMatchObject({ code: 'bad_key', status: 400 })
      await expect(driver.put(bad, PNG, 'image/png')).rejects.toMatchObject({ code: 'bad_key' })
      await expect(driver.remove(bad)).rejects.toMatchObject({ code: 'bad_key' })
    }
    expect(blob.put).not.toHaveBeenCalled()
    expect(blob.get).not.toHaveBeenCalled()
    expect(blob.del).not.toHaveBeenCalled()
  })

  it('is chosen by STORAGE_DRIVER=vercel-blob; local disk stays the default', async () => {
    blob.del.mockResolvedValue(undefined)
    process.env.STORAGE_DRIVER = 'vercel-blob'
    await getStorage().remove(KEY)
    expect(blob.del).toHaveBeenCalledWith(KEY)
    delete process.env.STORAGE_DRIVER
    vi.clearAllMocks()
    await getStorage().remove('qr/user_1/never-written.png') // local driver: rm -f, no Blob call
    expect(blob.del).not.toHaveBeenCalled()
    process.env.STORAGE_DRIVER = 'ftp'
    expect(() => getStorage()).toThrow(/STORAGE_DRIVER/)
  })

  it('keeps the local driver’s own key checks', async () => {
    await expect(localStorageDriver('/tmp/coinflow-test').get('qr/../x.png')).rejects.toMatchObject({ code: 'bad_key' })
  })
})
