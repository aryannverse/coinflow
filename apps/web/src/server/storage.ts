import 'server-only'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { AppError } from './errors'

export interface Storage {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<{ data: Uint8Array; contentType: string } | null>
  remove(key: string): Promise<void>
}

const SEGMENT = /^[A-Za-z0-9_.-]+$/
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }

function resolveKey(root: string, key: string): string {
  const segments = key.split('/')
  if (segments.some((s) => !SEGMENT.test(s) || s === '.' || s === '..')) throw new AppError('bad_key', 'Invalid file path.', 400)
  return path.join(root, ...segments)
}

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
        return { data: new Uint8Array(data), contentType: TYPES[key.split('.').pop() ?? ''] ?? 'application/octet-stream' }
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

export function getStorage(): Storage {
  return localStorageDriver(path.resolve(/*turbopackIgnore: true*/ process.env.UPLOADS_DIR ?? './uploads'))
}
