import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')
const isClient = (code: string) => /^\s*['"]use client['"]/.test(code)

function serverModules(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return serverModules(path)
    return /\.(tsx?)$/.test(name) && !name.endsWith('.test.ts') && !isClient(readFileSync(path, 'utf8')) ? [path] : []
  })
}

function resolve(spec: string): string | null {
  const base = join(SRC, spec.slice(2))
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) if (existsSync(base + ext)) return base + ext
  return null
}

/**
 * A server component that imports a non-component VALUE from a 'use client' module receives a client reference, not
 * the value, and crashes at request time (it type-checks and builds). Found in E2E: `GROUP_TABS.includes is not a
 * function` on every /groups/[id] load. Components (PascalCase) and type-only imports are fine across the boundary.
 */
describe('server → client boundary', () => {
  it('server modules under src/app import only components and types from client modules', () => {
    const offenders: string[] = []
    for (const file of serverModules(join(SRC, 'app'))) {
      const code = readFileSync(file, 'utf8')
      for (const m of code.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+'(@\/[^']+)'/g)) {
        if (m[1]) continue
        const target = resolve(m[3])
        if (!target || !isClient(readFileSync(target, 'utf8'))) continue
        const values = m[2].split(',').map((s) => s.trim()).filter((s) => s && !s.startsWith('type '))
        for (const name of values) if (!/^[A-Z][a-z0-9]/.test(name)) offenders.push(`${file.slice(SRC.length + 1)}: ${name} from ${m[3]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
