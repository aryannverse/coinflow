import { describe, expect, it } from 'vitest'
import { paletteFilter, paletteSections } from './palette-filter'

describe('paletteFilter', () => {
  it('shows everything for an empty or blank query', () => {
    expect(paletteFilter('go Home', '')).toBe(1)
    expect(paletteFilter('go Home', '   ')).toBe(1)
  })
  it('ignores trailing and repeated spaces (the "250 " bug)', () => {
    expect(paletteFilter('add 250 food', '250 ')).toBe(1)
    expect(paletteFilter('go Home', 'home ')).toBe(1)
    expect(paletteFilter('go Home', ' go   home  ')).toBe(1)
  })
  it('hides rows that do not contain every token, case-insensitively', () => {
    expect(paletteFilter('go Home', '250 ')).toBe(0)
    expect(paletteFilter('go Home', 'HOME')).toBe(1)
    expect(paletteFilter('go Home', 'home insights')).toBe(0)
  })
  it('matches keywords too', () => {
    expect(paletteFilter('toggle theme', 'dark', ['dark', 'light'])).toBe(1)
  })
  it('the Ask item always shows', () => {
    expect(paletteFilter('ask plan a goa trip', 'zzz unrelated')).toBe(1)
    expect(paletteFilter('ask ', '250 lunch')).toBe(1)
  })
})

describe('paletteSections (what cmdk selects first)', () => {
  it('an amount-led command keeps Part A’s instant quick add first, even while the assistant is online', () => {
    expect(paletteSections({ text: '250 lunch', parsed: true, online: true })).toEqual(['quick', 'ask', 'go', 'prefs'])
  })
  it('free text defaults to Ask while online, and to Search when offline', () => {
    expect(paletteSections({ text: 'plan goa', parsed: false, online: true })).toEqual(['ask', 'search', 'go', 'prefs'])
    expect(paletteSections({ text: 'plan goa', parsed: false, online: false })).toEqual(['search', 'go', 'prefs'])
    expect(paletteSections({ text: '  ', parsed: false, online: true })).toEqual(['ask', 'go', 'prefs'])
  })
})
