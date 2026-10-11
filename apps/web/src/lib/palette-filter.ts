/**
 * Command-palette matcher. cmdk trims item values but not the search string, so its default scorer
 * returns 0 for "250 " (trailing space) and every row vanishes at each word boundary. We trim the
 * query and require every whitespace-separated token to appear in the item's value or keywords.
 */
export function paletteFilter(value: string, search: string, keywords: string[] = []): number {
  const tokens = search.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return 1
  const haystack = `${value} ${keywords.join(' ')}`.toLowerCase()
  return tokens.every((t) => haystack.includes(t)) ? 1 : 0
}
