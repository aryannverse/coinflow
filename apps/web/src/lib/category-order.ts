/**
 * Recent-first category order for quick add (spec §4.6). `txns` is newest first (as the API returns it);
 * categories the user logged most recently, for this kind, come first in order of their newest use, and
 * the rest follow in server order. Ids in `txns` that the list does not contain are ignored.
 */
export function orderByRecency<C extends { id: string }>(
  categories: readonly C[],
  txns: readonly { categoryId: string; type: string }[] | undefined,
  type: string,
): C[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const recent: C[] = []
  const seen = new Set<string>()
  for (const t of txns ?? []) {
    if (t.type !== type || seen.has(t.categoryId)) continue
    const c = byId.get(t.categoryId)
    if (!c) continue
    seen.add(t.categoryId)
    recent.push(c)
  }
  return [...recent, ...categories.filter((c) => !seen.has(c.id))]
}
