import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { uid } from './uid'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('uid', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('makes v4-shaped ids that do not repeat', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => uid()))
    expect(ids.size).toBe(2000)
    for (const id of ids) expect(id).toMatch(V4)
  })

  it('works where crypto.randomUUID is missing (plain http on a LAN address is not a secure context)', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
    expect(globalThis.crypto.randomUUID).toBeUndefined()
    expect(uid()).toMatch(V4)
  })

  it('still works with no Web Crypto at all', () => {
    vi.stubGlobal('crypto', undefined)
    const a = uid()
    expect(a).toMatch(V4)
    expect(uid()).not.toBe(a)
  })
})

/** Client code runs on whatever origin the phone opened; randomUUID throws a TypeError off localhost/https. */
describe('client code never calls crypto.randomUUID', () => {
  const SRC = join(__dirname, '..')
  const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })

  it('components, hooks and lib use uid() instead', () => {
    const offenders = ['components', 'hooks', 'lib'].flatMap((d) => files(join(SRC, d)))
      .filter((f) => /\brandomUUID\b/.test(readFileSync(f, 'utf8')) && !f.endsWith(join('lib', 'uid.ts')))
      .map((f) => f.slice(SRC.length + 1))
    expect(offenders).toEqual([])
  })
})
