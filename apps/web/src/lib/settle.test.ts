import { describe, expect, it } from 'vitest'
import { computeNets, simplify, whyText, type LedgerExpense } from './settle'

function lcg(seed: number) {
  let s = seed >>> 0
  return () => (s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0) / 2 ** 32
}

const dinner: LedgerExpense = {
  id: 'e1', description: 'Dinner',
  payers: [{ memberId: 'A', paidPaise: 300_000 }],
  shares: [{ memberId: 'A', sharePaise: 100_000 }, { memberId: 'B', sharePaise: 100_000 }, { memberId: 'C', sharePaise: 100_000 }],
}

describe('computeNets', () => {
  it('is paid − share per member', () => {
    expect(Object.fromEntries(computeNets(['A', 'B', 'C'], [dinner], []))).toEqual({ A: 200_000, B: -100_000, C: -100_000 })
  })
  it('counts confirmed settlements: paying raises your net, receiving lowers it (spec §2.4 example)', () => {
    const nets = computeNets(['A', 'B', 'C'], [dinner], [{ fromMember: 'B', toMember: 'A', amountPaise: 100_000 }])
    expect(Object.fromEntries(nets)).toEqual({ A: 100_000, B: 0, C: -100_000 })
  })
})

describe('simplify', () => {
  it('largest debtor pays largest creditor; ties by member order', () => {
    const pays = simplify(['A', 'B', 'C'], computeNets(['A', 'B', 'C'], [dinner], []), [dinner])
    expect(pays.map(({ from, to, amountPaise }) => ({ from, to, amountPaise }))).toEqual([
      { from: 'B', to: 'A', amountPaise: 100_000 },
      { from: 'C', to: 'A', amountPaise: 100_000 },
    ])
  })

  it('explains each payment with the debtor’s expenses and how their debt is split (spec §2.6 example)', () => {
    const order = ['Y', 'A', 'R']
    const bowling: LedgerExpense = {
      id: 'bw', description: 'Bowling', payers: [{ memberId: 'Y', paidPaise: 240_000 }],
      shares: [{ memberId: 'Y', sharePaise: 120_000 }, { memberId: 'A', sharePaise: 120_000 }],
    }
    const supper: LedgerExpense = {
      id: 'dn', description: 'Dinner', payers: [{ memberId: 'R', paidPaise: 160_000 }],
      shares: [{ memberId: 'R', sharePaise: 80_000 }, { memberId: 'A', sharePaise: 80_000 }],
    }
    const nets = computeNets(order, [bowling, supper], [])
    const pays = simplify(order, nets, [bowling, supper])
    expect(pays.map(({ from, to, amountPaise }) => ({ from, to, amountPaise }))).toEqual([
      { from: 'A', to: 'Y', amountPaise: 120_000 },
      { from: 'A', to: 'R', amountPaise: 80_000 },
    ])
    expect(pays[0].why).toEqual({
      debtorOwesPaise: 200_000,
      debtorExpenses: [
        { expenseId: 'bw', description: 'Bowling', netPaise: -120_000 },
        { expenseId: 'dn', description: 'Dinner', netPaise: -80_000 },
      ],
      splitAcross: [{ memberId: 'Y', amountPaise: 120_000 }, { memberId: 'R', amountPaise: 80_000 }],
    })
    const names = new Map([['Y', 'Yash'], ['A', 'Asha'], ['R', 'Ravi']])
    expect(whyText(pays[0], names, 'Y')).toBe('Asha pays you ₹1,200: Asha owes ₹2,000 across Bowling and Dinner; you are owed ₹1,200 and Ravi ₹800.')
    expect(whyText(pays[1], names, 'A')).toBe('You pay Ravi ₹800: you owe ₹2,000 across Bowling and Dinner; Yash is owed ₹1,200 and Ravi ₹800.')
    expect(whyText(pays[1], names, null)).toBe('Asha pays Ravi ₹800: Asha owes ₹2,000 across Bowling and Dinner; Yash is owed ₹1,200 and Ravi ₹800.')
  })

  it('lists at most two expenses by name, then a count', () => {
    const order = ['A', 'B']
    const exps: LedgerExpense[] = ['Tea', 'Taxi', 'Tickets', 'Thali'].map((d, i) => ({
      id: `e${i}`, description: d, payers: [{ memberId: 'A', paidPaise: 1_000 * (i + 1) }], shares: [{ memberId: 'B', sharePaise: 1_000 * (i + 1) }],
    }))
    const [p] = simplify(order, computeNets(order, exps, []), exps)
    expect(whyText(p, new Map([['A', 'Ann'], ['B', 'Bo']]), 'A')).toBe('Bo pays you ₹100: Bo owes ₹100 across Thali, Tickets and 2 more; you are owed ₹100.')
  })

  it('returns nothing when everyone is square', () => {
    expect(simplify(['A', 'B'], new Map([['A', 0], ['B', 0]]))).toEqual([])
  })

  it('50 members: ≤ N−1 payments, < 50 ms, and paying them settles everyone', () => {
    const rnd = lcg(7)
    const ids = Array.from({ length: 50 }, (_, i) => `m${i}`)
    const nets = new Map<string, number>()
    let sum = 0
    for (const id of ids.slice(0, 49)) {
      const v = Math.floor(rnd() * 2_000_000) - 1_000_000
      nets.set(id, v)
      sum += v
    }
    nets.set(ids[49], -sum)
    const t0 = performance.now()
    const pays = simplify(ids, nets)
    expect(performance.now() - t0).toBeLessThan(50)
    expect(pays.length).toBeLessThanOrEqual(49)
    const left = new Map(nets)
    for (const p of pays) {
      expect(p.amountPaise).toBeGreaterThan(0)
      left.set(p.from, (left.get(p.from) ?? 0) + p.amountPaise)
      left.set(p.to, (left.get(p.to) ?? 0) - p.amountPaise)
    }
    expect([...left.values()].every((v) => v === 0)).toBe(true)
  })
})
