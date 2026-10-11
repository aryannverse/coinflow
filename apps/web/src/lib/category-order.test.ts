import { describe, expect, it } from 'vitest'
import { orderByRecency } from './category-order'

const cat = (id: string) => ({ id, name: id })
const txn = (categoryId: string, type: 'expense' | 'income' = 'expense') => ({ categoryId, type })
const ids = (cs: { id: string }[]) => cs.map((c) => c.id)

describe('orderByRecency', () => {
  const server = [cat('food'), cat('transport'), cat('shopping'), cat('bills'), cat('other')]

  it('keeps server order when there is no history', () => {
    expect(ids(orderByRecency(server, [], 'expense'))).toEqual(['food', 'transport', 'shopping', 'bills', 'other'])
    expect(ids(orderByRecency(server, undefined, 'expense'))).toEqual(['food', 'transport', 'shopping', 'bills', 'other'])
  })

  it('puts categories first in order of their newest use, then the rest in server order', () => {
    const txns = [txn('bills'), txn('shopping'), txn('bills'), txn('food')]
    expect(ids(orderByRecency(server, txns, 'expense'))).toEqual(['bills', 'shopping', 'food', 'transport', 'other'])
  })

  it('counts only transactions of the same kind', () => {
    const txns = [txn('salary', 'income'), txn('other', 'income'), txn('transport')]
    expect(ids(orderByRecency(server, txns, 'expense'))).toEqual(['transport', 'food', 'shopping', 'bills', 'other'])
  })

  it('ignores categories the list does not contain (deleted or the other kind)', () => {
    expect(ids(orderByRecency(server, [txn('gone'), txn('other')], 'expense'))).toEqual(['other', 'food', 'transport', 'shopping', 'bills'])
  })

  it('returns every category exactly once and does not mutate its inputs', () => {
    const input = [...server]
    const out = orderByRecency(input, [txn('other'), txn('other'), txn('food')], 'expense')
    expect(out).toHaveLength(server.length)
    expect(new Set(ids(out)).size).toBe(server.length)
    expect(ids(input)).toEqual(ids(server))
  })
})
