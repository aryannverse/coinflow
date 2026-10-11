import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from './lib/contrast'
import { FLOW_PATH } from './lib/flow-palette'
import { HERO_DITHER, SHADER_EXTREME, worstCasePixel } from './lib/hero-palette'

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
  // slider: unfilled track and thumb border (foreground) vs card/track, filled primary vs thumb face (card)
  ['track', 'card', 3], ['foreground', 'track', 3], ['card', 'primary', 3],
]

describe.each([[':root', 'light'], ['.dark', 'dark']])('%s tokens (%s)', (selector) => {
  const t = block(selector)
  it.each(PAIRS)('%s on %s ≥ %d:1', (fg, bg, min) => {
    expect(t[fg], `missing --${fg}`).toBeDefined()
    expect(t[bg], `missing --${bg}`).toBeDefined()
    expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(min)
  })
})

describe.each([[':root', 'light'], ['.dark', 'dark']] as const)('hero dither (%s)', (selector, name) => {
  const t = block(selector)
  const hero = HERO_DITHER[name]
  it('uses the theme tokens', () => {
    expect(hero.background.toLowerCase()).toBe(t.background.toLowerCase())
    expect(hero.wave.toLowerCase()).toBe(t.lime.toLowerCase())
  })
  it.each([['foreground'], ['muted-foreground']])('keeps %s text >= 4.5:1 over the worst-case pixel', (fg) => {
    const worst = worstCasePixel(hero.wave, hero.background, hero.opacity)
    expect(contrastRatio(t[fg], worst)).toBeGreaterThanOrEqual(4.5)
  })
  it.each([['foreground'], ['muted-foreground']])('keeps %s text >= 4.5:1 at the shader extreme', (fg) => {
    const worst = worstCasePixel(SHADER_EXTREME, hero.background, hero.opacity)
    expect(contrastRatio(t[fg], worst)).toBeGreaterThanOrEqual(4.5)
  })
})

describe.each([[':root', 'light'], ['.dark', 'dark']] as const)('money-flow beam path (%s)', (selector, name) => {
  const t = block(selector)
  const flow = FLOW_PATH[name]
  it('uses the theme background', () => {
    expect(flow.background.toLowerCase()).toBe(t.background.toLowerCase())
  })
  it('keeps the blended path >= 3:1 against the page (WCAG 1.4.11)', () => {
    const blended = worstCasePixel(flow.path, flow.background, flow.pathOpacity)
    expect(contrastRatio(blended, flow.background)).toBeGreaterThanOrEqual(3)
  })
})
