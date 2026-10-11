import { describe, expect, it } from 'vitest'
import { todaySummary, upcomingBills } from './home-selectors'

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
})
