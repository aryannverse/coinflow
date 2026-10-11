import { describe, expect, it } from 'vitest'
import { dayLabel, groupByDay } from './group-by-day'

const t = (id: string, occurredAt: string, amount = 1000, type = 'expense') => ({ id, occurredAt, amount, personalShare: amount, type }) as never

describe('groupByDay', () => {
  it('groups by IST day in input order and totals expenses only', () => {
    const groups = groupByDay([
      t('a', '2026-10-11T19:00:00Z', 5000),          // 00:30 IST Oct 12
      t('b', '2026-10-11T18:00:00Z', 2000),          // 23:30 IST Oct 11
      t('c', '2026-10-11T10:00:00Z', 9000, 'income'),
    ])
    expect(groups.map((g) => [g.date, g.items.map((i) => i.id), g.expenseTotal])).toEqual([
      ['2026-10-12', ['a'], 5000],
      ['2026-10-11', ['b', 'c'], 2000],
    ])
  })
})

describe('dayLabel', () => {
  it('uses relative words for today and yesterday', () => {
    expect(dayLabel('2026-10-12', '2026-10-12')).toBe('Today')
    expect(dayLabel('2026-10-11', '2026-10-12')).toBe('Yesterday')
    expect(dayLabel('2026-10-10', '2026-10-12')).toBe('Sat, 10 Oct')
  })
})
