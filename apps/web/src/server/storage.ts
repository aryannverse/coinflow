import 'server-only'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { del, get, put } from '@vercel/blob'
import { AppError } from './errors'

export interface Storage {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<{ data: Uint8Array; contentType: string } | null>
  remove(key: string): Promise<void>
}

const SEGMENT = /^[A-Za-z0-9_.-]+$/
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }

function checkKey(key: string): string[] {
  const segments = key.split('/')
  if (segments.some((s) => !SEGMENT.test(s) || s === '.' || s === '..')) throw new AppError('bad_key', 'Invalid file path.', 400)
  return segments
}

function resolveKey(root: string, key: string): string {
  return path.join(root, ...checkKey(key))
}

const typeOf = (key: string) => TYPES[key.split('.').pop() ?? ''] ?? 'application/octet-stream'

export function localStorageDriver(root: string): Storage {
  return {
    async put(key, data) {
      const file = resolveKey(root, key)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, data)
    },
    async get(key) {
      try {
        const data = await readFile(resolveKey(root, key))
        return { data: new Uint8Array(data), contentType: typeOf(key) }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw err
      }
    },
    async remove(key) {
      await rm(resolveKey(root, key), { force: true })
    },
  }
}

/**
 * Spec §10: Vercel Blob in a PRIVATE store, so an object's URL is useless without the store's credentials (OIDC on
 * Vercel, else BLOB_READ_WRITE_TOKEN). Blob URLs never leave the server: reads go through the members-only
 * /api/v1/files route, as with local disk. Keys are already unguessable (qr/<user>/<uuid>.<ext>).
 */
export function vercelBlobStorageDriver(): Storage {
  return {
    async put(key, data, contentType) {
      checkKey(key)
      await put(key, Buffer.from(data), { access: 'private', contentType, addRandomSuffix: false })
    },
    async get(key) {
      checkKey(key)
      const res = await get(key, { access: 'private' })
      if (!res || res.statusCode !== 200 || !res.stream) return null
      const data = new Uint8Array(await new Response(res.stream).arrayBuffer())
      return { data, contentType: res.blob.contentType ?? typeOf(key) }
    },
    async remove(key) {
      checkKey(key)
      await del(key)
    },
  }
}

/** STORAGE_DRIVER: `local` (default; UPLOADS_DIR on disk) or `vercel-blob`. */
export function getStorage(): Storage {
  const driver = process.env.STORAGE_DRIVER?.trim() || 'local'
  if (driver === 'vercel-blob') return vercelBlobStorageDriver()
  if (driver !== 'local') throw new Error(`Unknown STORAGE_DRIVER "${driver}" (use local or vercel-blob)`)
  return localStorageDriver(path.resolve(/*turbopackIgnore: true*/ process.env.UPLOADS_DIR ?? './uploads'))
}
