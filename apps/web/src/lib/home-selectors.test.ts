import { describe, expect, it } from 'vitest'
import { hasEnoughExpenses, todaySummary, topCategory, upcomingBills } from './home-selectors'

const r = (over: object) => ({ id: 'x', kind: 'bill', name: 'Netflix', amount: 64_900, cadence: 'monthly', nextDueOn: '2026-10-20', anchorDay: 20, active: true, ...over }) as never

describe('upcomingBills', () => {
  it('lists active bill occurrences in the cycle, soonest first, limited', () => {
    const list = upcomingBills([
      r({ id: 'a', nextDueOn: '2026-10-20' }),
      r({ id: 'b', name: 'Gym', cadence: 'weekly', nextDueOn: '2026-10-14', anchorDay: 14 }),
      r({ id: 'c', kind: 'income', name: 'Salary' }),
      r({ id: 'd', active: false }),
      r({ id: 'e', nextDueOn: '2026-11-05' }),
    ], '2026-10-11', '2026-10-31', 3)
    expect(list.map((b) => `${b.name}@${b.dueOn}`)).toEqual(['Gym@2026-10-14', 'Netflix@2026-10-20', 'Gym@2026-10-21'])
  })
  it('includes a bill due today and nothing else when the limit is 1', () => {
    const list = upcomingBills([r({ id: 'a', nextDueOn: '2026-10-11' })], '2026-10-11', '2026-10-31', 1)
    expect(list).toEqual([{ id: 'a', name: 'Netflix', amount: 64_900, dueOn: '2026-10-11' }])
  })
})

describe('todaySummary', () => {
  const t = (occurredAt: string, amount: number, type = 'expense') => ({ occurredAt, amount, personalShare: amount, type }) as never
  it('sums today’s confirmed expenses by IST day', () => {
    const s = todaySummary([t('2026-10-11T19:00:00Z', 5_000), t('2026-10-12T06:00:00Z', 10_000), t('2026-10-12T07:00:00Z', 99, 'income'), t('2026-10-11T10:00:00Z', 7_000)], '2026-10-12')
    expect(s.total).toBe(15_000)
    expect(s.count).toBe(2)
  })
  it('empty day', () => {
    expect(todaySummary([], '2026-10-12')).toEqual({ total: 0, count: 0, last: null })
  })
  it('last is the newest by occurredAt whatever the input order', () => {
    const a = { ...(t('2026-10-12T04:00:00Z', 1_000) as object), id: 'a' }
    const b = { ...(t('2026-10-12T09:00:00Z', 2_000) as object), id: 'b' }
    const c = { ...(t('2026-10-12T06:00:00Z', 3_000) as object), id: 'c' }
    expect(todaySummary([a, c, b] as never, '2026-10-12').last).toMatchObject({ id: 'b' })
    expect(todaySummary([b, a, c] as never, '2026-10-12').last).toMatchObject({ id: 'b' })
  })
})

describe('hasEnoughExpenses', () => {
  const e = (type: string) => ({ type }) as never
  it('needs three expenses; income does not count', () => {
    expect(hasEnoughExpenses([e('expense'), e('expense'), e('income')])).toBe(false)
    expect(hasEnoughExpenses([e('expense'), e('expense'), e('expense')])).toBe(true)
  })
})

describe('topCategory', () => {
  const insights = { totalExpense: 200, byCategory: [{ name: 'Food', amount: 150 }, { name: 'Taxi', amount: 50 }] } as never
  it('returns the leader and its rounded share', () => {
    expect(topCategory(insights, true)).toMatchObject({ top: { name: 'Food' }, share: 75 })
  })
  it('is null when disabled, missing, empty or without spending', () => {
    expect(topCategory(insights, false)).toBeNull()
    expect(topCategory(undefined, true)).toBeNull()
    expect(topCategory({ totalExpense: 0, byCategory: [] } as never, true)).toBeNull()
  })
})
