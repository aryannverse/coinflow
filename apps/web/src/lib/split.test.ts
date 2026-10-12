import { describe, expect, it } from 'vitest'
import { allocate, checkPayers, computeSplit, SplitMismatchError, splitMemberIds } from './split'

const ORDER = ['a', 'b', 'c', 'd']

function lcg(seed: number) {
  let s = seed >>> 0
  return () => (s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0) / 2 ** 32
}

function mismatch(fn: () => unknown): SplitMismatchError {
  try {
    fn()
  } catch (e) {
    if (e instanceof SplitMismatchError) return e
    throw e
  }
  throw new Error('expected a SplitMismatchError')
}

describe('allocate (largest remainder)', () => {
  it('gives the leftover paisa to the earliest member on a tie', () => {
    expect(allocate(10_000, [1, 1, 1])).toEqual([3_334, 3_333, 3_333])
  })
  it('gives leftovers to the largest remainder first, not the first member', () => {
    // 1001×2/3 = 667 r 1/3; 1001×1/3 = 333 r 2/3 → the leftover goes to the second member.
    expect(allocate(1_001, [2, 1])).toEqual([667, 334])
  })
  it('never gives a zero weight a paisa', () => {
    expect(allocate(5, [0, 1, 1])).toEqual([0, 3, 2])
  })
  it('allocates zero to everyone', () => {
    expect(allocate(0, [1, 2])).toEqual([0, 0])
  })
  it('refuses all-zero weights', () => {
    expect(() => allocate(100, [0, 0])).toThrow(RangeError)
  })
})

describe('computeSplit', () => {
  it('equal: ties go by member order, not by input order', () => {
    expect(computeSplit(10_000, { mode: 'equal', memberIds: ['c', 'a', 'b'] }, ORDER)).toEqual([
      { memberId: 'a', sharePaise: 3_334, inputValue: null },
      { memberId: 'b', sharePaise: 3_333, inputValue: null },
      { memberId: 'c', sharePaise: 3_333, inputValue: null },
    ])
  })

  it('shares: 2:1 of ₹10.01', () => {
    expect(computeSplit(1_001, { mode: 'shares', entries: [{ memberId: 'a', shares: 2 }, { memberId: 'b', shares: 1 }] }, ORDER)).toEqual([
      { memberId: 'a', sharePaise: 667, inputValue: 2 },
      { memberId: 'b', sharePaise: 334, inputValue: 1 },
    ])
  })

  it('percent: 33.33 / 33.33 / 33.34 of ₹999.99', () => {
    const rows = computeSplit(99_999, {
      mode: 'percent',
      entries: [{ memberId: 'a', basisPoints: 3_333 }, { memberId: 'b', basisPoints: 3_333 }, { memberId: 'c', basisPoints: 3_334 }],
    }, ORDER)
    // a,b: 33,329 r 6,667 · c: 33,339 r 6,666 → two leftover paise go to a then b.
    expect(rows.map((r) => r.sharePaise)).toEqual([33_330, 33_330, 33_339])
    expect(rows.map((r) => r.inputValue)).toEqual([3_333, 3_333, 3_334])
  })

  it('percent that does not reach 100% names what is left', () => {
    const e = mismatch(() => computeSplit(99_999, {
      mode: 'percent',
      entries: [{ memberId: 'a', basisPoints: 3_333 }, { memberId: 'b', basisPoints: 3_333 }, { memberId: 'c', basisPoints: 3_333 }],
    }, ORDER))
    expect(e).toMatchObject({ field: 'split.entries', remaining: 1, unit: 'basisPoints' })
    expect(e.message).toBe('Percentages add up to 99.99%, 0.01% left to assign.')
  })

  it('exact must add up to the total (stale exact entries)', () => {
    const e = mismatch(() => computeSplit(10_000, { mode: 'exact', entries: [{ memberId: 'a', paise: 6_000 }, { memberId: 'b', paise: 3_000 }] }, ORDER))
    expect(e).toMatchObject({ field: 'split.entries', remaining: 1_000, unit: 'paise' })
    expect(e.message).toBe('₹10 left to assign.')
    const over = mismatch(() => computeSplit(9_000, { mode: 'exact', entries: [{ memberId: 'a', paise: 6_000 }, { memberId: 'b', paise: 3_500 }] }, ORDER))
    expect(over.message).toBe('₹5 more than the total.')
  })

  it('exact keeps every entry, including a zero', () => {
    expect(computeSplit(10_000, { mode: 'exact', entries: [{ memberId: 'b', paise: 10_000 }, { memberId: 'a', paise: 0 }] }, ORDER)).toEqual([
      { memberId: 'a', sharePaise: 0, inputValue: 0 },
      { memberId: 'b', sharePaise: 10_000, inputValue: 10_000 },
    ])
  })

  it('itemized: tax, tip and discount follow each member’s item subtotal', () => {
    // Pizza ₹600 (a,b) · Beer ₹300 (b,c) · Salad ₹100 (c) → subtotals a 30,000 · b 45,000 · c 25,000
    // tax 5,000 / tip 10,000 / discount 5,000 split 30:45:25 exactly; total = 100,000 + 5,000 + 10,000 − 5,000
    const rows = computeSplit(110_000, {
      mode: 'itemized',
      items: [
        { name: 'Pizza', amountPaise: 60_000, memberIds: ['a', 'b'] },
        { name: 'Beer', amountPaise: 30_000, memberIds: ['b', 'c'] },
        { name: 'Salad', amountPaise: 10_000, memberIds: ['c'] },
      ],
      taxPaise: 5_000, tipPaise: 10_000, discountPaise: 5_000,
    }, ORDER)
    expect(rows).toEqual([
      { memberId: 'a', sharePaise: 33_000, inputValue: null },
      { memberId: 'b', sharePaise: 49_500, inputValue: null },
      { memberId: 'c', sharePaise: 27_500, inputValue: null },
    ])
  })

  it('itemized: rounding of a shared item and of tax both use largest remainder', () => {
    // Dosa ₹100 three ways → 3,334/3,333/3,333; tax ₹10 on those weights → 334/333/333.
    const rows = computeSplit(11_000, {
      mode: 'itemized', items: [{ name: 'Dosa', amountPaise: 10_000, memberIds: ['a', 'b', 'c'] }], taxPaise: 1_000, tipPaise: 0, discountPaise: 0,
    }, ORDER)
    expect(rows.map((r) => r.sharePaise)).toEqual([3_668, 3_666, 3_666])
  })

  it('itemized: an unassigned item is a field error on that item', () => {
    const e = mismatch(() => computeSplit(15_000, {
      mode: 'itemized',
      items: [{ name: 'Tea', amountPaise: 5_000, memberIds: ['a'] }, { name: 'Cake', amountPaise: 10_000, memberIds: [] }],
      taxPaise: 0, tipPaise: 0, discountPaise: 0,
    }, ORDER))
    expect(e).toMatchObject({ field: 'split.items.1.memberIds', remaining: 10_000 })
    expect(e.message).toBe('Assign “Cake” to someone.')
  })

  it('itemized: receipt that does not reach the total', () => {
    const e = mismatch(() => computeSplit(110_001, {
      mode: 'itemized', items: [{ name: 'Thali', amountPaise: 110_000, memberIds: ['a'] }], taxPaise: 0, tipPaise: 0, discountPaise: 0,
    }, ORDER))
    expect(e).toMatchObject({ field: 'split.items', remaining: 1 })
    expect(e.message).toBe('The receipt comes to ₹1,100, ₹0.01 less than the total.')
  })

  it('indivisible totals always add up exactly, within a paisa of the exact share (500 cases)', () => {
    const rnd = lcg(42)
    for (let n = 0; n < 500; n++) {
      const total = 1 + Math.floor(rnd() * 1_000_000_000)
      const k = 1 + Math.floor(rnd() * 12)
      const ids = Array.from({ length: k }, (_, i) => `m${i}`)
      const weights = ids.map(() => Math.floor(rnd() * 20))
      if (!weights.some((w) => w > 0)) weights[0] = 1
      const W = weights.reduce((x, y) => x + y, 0)
      const rows = computeSplit(total, { mode: 'shares', entries: ids.map((memberId, i) => ({ memberId, shares: weights[i] })) }, ids)
      expect(rows.reduce((s, r) => s + r.sharePaise, 0)).toBe(total)
      rows.forEach((r, i) => expect(Math.abs(r.sharePaise - (total * weights[i]) / W)).toBeLessThan(1))
      const eq = computeSplit(total, { mode: 'equal', memberIds: ids }, ids)
      expect(eq.reduce((s, r) => s + r.sharePaise, 0)).toBe(total)
    }
  })
})

describe('checkPayers', () => {
  it('accepts payers that add up to the total', () => {
    expect(() => checkPayers(100_000, [{ memberId: 'a', paidPaise: 60_000 }, { memberId: 'b', paidPaise: 40_000 }])).not.toThrow()
  })
  it('names what still needs a payer', () => {
    const e = mismatch(() => checkPayers(100_000, [{ memberId: 'a', paidPaise: 60_000 }]))
    expect(e).toMatchObject({ field: 'payers', remaining: 40_000 })
    expect(e.message).toBe('₹400 of the bill still needs a payer.')
  })
  it('refuses nobody paying', () => {
    expect(mismatch(() => checkPayers(100, [{ memberId: 'a', paidPaise: 0 }])).message).toBe('Pick who paid.')
  })
})

it('splitMemberIds lists everyone a split names', () => {
  expect(splitMemberIds({ mode: 'itemized', items: [{ name: 'x', amountPaise: 1, memberIds: ['a', 'b'] }, { name: 'y', amountPaise: 1, memberIds: ['b', 'c'] }], taxPaise: 0, tipPaise: 0, discountPaise: 0 }))
    .toEqual(['a', 'b', 'c'])
})
