import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from './lib/contrast'

const css = readFileSync(new URL('./app/globals.css', import.meta.url), 'utf8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  const body = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]))
}

const PAIRS: [string, string, number][] = [
  ['foreground', 'background', 4.5], ['foreground', 'card', 4.5],
  ['muted-foreground', 'background', 4.5], ['muted-foreground', 'card', 4.5], ['muted-foreground', 'muted', 4.5],
  ['primary-foreground', 'primary', 4.5], ['neutral-negative', 'card', 4.5], ['neutral-negative', 'background', 4.5],
  ['primary', 'background', 3], ['destructive', 'card', 3],
]

describe.each([[':root', 'light'], ['.dark', 'dark']])('%s tokens (%s)', (selector) => {
  const t = block(selector)
  it.each(PAIRS)('%s on %s ≥ %d:1', (fg, bg, min) => {
    expect(t[fg], `missing --${fg}`).toBeDefined()
    expect(t[bg], `missing --${bg}`).toBeDefined()
    expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(min)
  })
})
