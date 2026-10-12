/**
 * Command-palette matcher. cmdk trims item values but not the search string, so its default scorer
 * returns 0 for "250 " (trailing space) and every row vanishes at each word boundary. We trim the
 * query and require every whitespace-separated token to appear in the item's value or keywords.
 */
export function paletteFilter(value: string, search: string, keywords: string[] = []): number {
  if (value === 'ask' || value.startsWith('ask ')) return 1 // the "Ask Coinflow" row carries whatever was typed, so it never filters out
  const tokens = search.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return 1
  const haystack = `${value} ${keywords.join(' ')}`.toLowerCase()
  return tokens.every((t) => haystack.includes(t)) ? 1 : 0
}

export type PaletteSection = 'quick' | 'ask' | 'search' | 'go' | 'prefs'

/**
 * Group order, which is also what cmdk selects first (Enter). An amount-led command ("250 lunch") stays Part A's
 * instant quick add; any other text defaults to asking the assistant while it is online, else to searching.
 */
export function paletteSections({ text, parsed, online }: { text: string; parsed: boolean; online: boolean }): PaletteSection[] {
  const typed = text.trim().length > 0
  return [
    ...(parsed ? (['quick'] as const) : []),
    ...(online ? (['ask'] as const) : []),
    ...(typed && !parsed ? (['search'] as const) : []),
    'go',
    'prefs',
  ]
}
