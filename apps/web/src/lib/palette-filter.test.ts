import { describe, expect, it } from 'vitest'
import { paletteFilter } from './palette-filter'

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
