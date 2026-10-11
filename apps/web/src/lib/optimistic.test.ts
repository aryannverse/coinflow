import { describe, expect, it } from 'vitest'
import { buildOptimisticTransaction, prependToFirstPage, removeFromPages } from './optimistic'

type Row = { id: string; n: number }
const page = (ids: string[], nextCursor: string | null = null) => ({ data: ids.map((id, n) => ({ id, n })), nextCursor })

describe('prependToFirstPage', () => {
  it('puts the row first on page 0 only, without mutating the input', () => {
    const input = { pages: [page(['a', 'b'], 'c1'), page(['c'])], pageParams: [undefined, 'c1'] }
    const out = prependToFirstPage(input, { id: 'tmp', n: 9 })
    expect(out?.pages[0].data.map((r: Row) => r.id)).toEqual(['tmp', 'a', 'b'])
    expect(out?.pages[1].data.map((r: Row) => r.id)).toEqual(['c'])
    expect(out?.pages[0].nextCursor).toBe('c1')
    expect(input.pages[0].data).toHaveLength(2)
  })

  it('leaves an uncached query untouched', () => {
    expect(prependToFirstPage(undefined, { id: 'tmp', n: 1 })).toBeUndefined()
  })

  it('leaves an empty-pages cache untouched', () => {
    const empty = { pages: [], pageParams: [] }
    expect(prependToFirstPage(empty, { id: 'tmp', n: 1 })).toBe(empty)
  })
})

describe('removeFromPages', () => {
  it('removes the row from every page of an infinite cache', () => {
    const input = { pages: [page(['a', 'b'], 'c1'), page(['c', 'b'])], pageParams: [undefined, 'c1'] }
    const out = removeFromPages(input, 'b')
    expect(out?.pages.map((p) => p.data.map((r: Row) => r.id))).toEqual([['a'], ['c']])
    expect(input.pages[0].data).toHaveLength(2)
  })

  it('removes the row from a plain list cache (drafts)', () => {
    expect(removeFromPages([{ id: 'a' }, { id: 'b' }], 'a')).toEqual([{ id: 'b' }])
  })

  it('passes undefined through', () => {
    expect(removeFromPages(undefined, 'a')).toBeUndefined()
  })
})

describe('buildOptimisticTransaction', () => {
  const now = new Date('2026-10-11T08:00:00.000Z')
  const food = { id: 'cat1', name: 'Food', emoji: '🍜', color: '#fff' }

  it('builds a confirmed manual row with a temp id and the cached category', () => {
    const row = buildOptimisticTransaction({ type: 'expense', amount: 45_000, categoryId: 'cat1', note: 'lunch' }, food, now)
    expect(row).toMatchObject({
      type: 'expense', amount: 45_000, personalShare: 45_000, categoryId: 'cat1', note: 'lunch', method: 'upi',
      status: 'confirmed', source: 'manual', occurredAt: now.toISOString(), category: food,
    })
    expect(row.id.startsWith('optimistic-')).toBe(true)
  })

  it('honours an explicit occurredAt and method, and tolerates an unknown category', () => {
    const row = buildOptimisticTransaction(
      { type: 'income', amount: 100, categoryId: 'zzz', method: 'cash', occurredAt: '2026-10-10T00:00:00.000Z' }, undefined, now)
    expect(row).toMatchObject({ method: 'cash', occurredAt: '2026-10-10T00:00:00.000Z', note: null })
    expect(row.category.id).toBe('zzz')
  })
})
