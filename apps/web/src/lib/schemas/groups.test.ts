import { describe, expect, it } from 'vitest'
import { claimSchema, expenseMemberIds, groupCreateSchema, groupExpenseInputSchema, settlementCreateSchema } from './groups'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const CAT = '33333333-3333-4333-8333-333333333333'

describe('group schemas', () => {
  it('creates an event with placeholders and refuses an end before the start', () => {
    expect(groupCreateSchema.parse({ name: 'Goa', kind: 'event', startsOn: '2026-11-01', endsOn: '2026-11-04', placeholders: [{ displayName: 'Asha' }] }))
      .toMatchObject({ emoji: '👥', kind: 'event', placeholders: [{ displayName: 'Asha' }] })
    const bad = groupCreateSchema.safeParse({ name: 'Goa', startsOn: '2026-11-04', endsOn: '2026-11-01' })
    expect(bad.success).toBe(false)
    expect(bad.error?.issues[0].path).toEqual(['endsOn'])
  })

  it('accepts each split mode and refuses an unknown one', () => {
    const base = { description: 'Dinner', amountPaise: 90_000, categoryId: CAT, payers: [{ memberId: A, paidPaise: 90_000 }] }
    for (const split of [
      { mode: 'equal', memberIds: [A, B] },
      { mode: 'exact', entries: [{ memberId: A, paise: 45_000 }, { memberId: B, paise: 45_000 }] },
      { mode: 'shares', entries: [{ memberId: A, shares: 2 }, { memberId: B, shares: 1 }] },
      { mode: 'percent', entries: [{ memberId: A, basisPoints: 5_000 }, { memberId: B, basisPoints: 5_000 }] },
      { mode: 'itemized', items: [{ name: 'Thali', amountPaise: 90_000, memberIds: [A, B] }] },
    ]) {
      expect(groupExpenseInputSchema.safeParse({ ...base, split }).success).toBe(true)
    }
    expect(groupExpenseInputSchema.safeParse({ ...base, split: { mode: 'vibes' } }).success).toBe(false)
  })

  it('defaults itemized adjustments to zero', () => {
    const r = groupExpenseInputSchema.parse({
      description: 'Lunch', amountPaise: 100, categoryId: CAT, payers: [{ memberId: A, paidPaise: 100 }],
      split: { mode: 'itemized', items: [{ name: 'Tea', amountPaise: 100, memberIds: [A] }] },
    })
    expect(r.split).toMatchObject({ taxPaise: 0, tipPaise: 0, discountPaise: 0 })
  })

  it('claim is a member id or a new name, never both', () => {
    expect(claimSchema.safeParse({ memberId: A }).success).toBe(true)
    expect(claimSchema.safeParse({ newName: 'Asha' }).success).toBe(true)
    expect(claimSchema.safeParse({ memberId: A, newName: 'Asha' }).success).toBe(false)
  })

  it('settlement needs a positive amount', () => {
    expect(settlementCreateSchema.safeParse({ fromMemberId: A, toMemberId: B, amountPaise: 0 }).success).toBe(false)
  })

  it('expenseMemberIds unions payers and split people', () => {
    expect(expenseMemberIds({ payers: [{ memberId: A }], split: { mode: 'equal', memberIds: [B] } }).sort()).toEqual([A, B].sort())
  })
})
