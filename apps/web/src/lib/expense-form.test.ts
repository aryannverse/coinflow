import { describe, expect, it } from 'vitest'
import type { GroupExpenseDTO } from './api-types'
import { basisPointsToText, buildBody, draftFromExpense, emptyDraft, percentToBasisPoints, previewDraft, type ExpenseDraft } from './expense-form'

const ME = '11111111-1111-4111-8111-111111111111'
const ASHA = '22222222-2222-4222-8222-222222222222'
const RAVI = '33333333-3333-4333-8333-333333333333'
const CAT = '44444444-4444-4444-8444-444444444444'
const ORDER = [ME, ASHA, RAVI]
const base = (over: Partial<ExpenseDraft> = {}): ExpenseDraft => ({ ...emptyDraft(ORDER, ME), description: 'Dinner', amount: '900', categoryId: CAT, ...over })

describe('expense form', () => {
  it('equal ₹900 among three → ₹300 each; a single payer pays it all', () => {
    expect(previewDraft(base(), ORDER).rows.map((r) => r.sharePaise)).toEqual([30_000, 30_000, 30_000])
    const built = buildBody(base(), ORDER)
    expect(built).toEqual({
      ok: true,
      body: {
        description: 'Dinner', amountPaise: 90_000, categoryId: CAT,
        payers: [{ memberId: ME, paidPaise: 90_000 }], split: { mode: 'equal', memberIds: ORDER },
      },
    })
  })

  it('multiple payers: shows what is left and refuses to save until it adds up', () => {
    const d = base({ multiplePayers: true, paid: { [ME]: '500' } })
    expect(previewDraft(d, ORDER).payersLeftPaise).toBe(40_000)
    expect(buildBody(d, ORDER)).toEqual({ ok: false, field: 'payers', message: '₹400 of the bill still needs a payer.' })
    expect(buildBody({ ...d, paid: { [ME]: '500', [RAVI]: '400' } }, ORDER)).toMatchObject({ ok: true })
  })

  it('total changed after exact entries: says what is left instead of rescaling', () => {
    const d = base({ amount: '1000', mode: 'exact', exact: { [ME]: '300', [ASHA]: '300', [RAVI]: '300' } })
    expect(previewDraft(d, ORDER).error).toEqual({ field: 'split.entries', message: '₹100 left to assign.' })
    expect(buildBody(d, ORDER)).toMatchObject({ ok: false, field: 'split.entries' })
  })

  it('reads amounts like people type them', () => {
    const built = buildBody(base({ amount: '1,250.50', multiplePayers: false }), ORDER)
    expect(built.ok && built.body.amountPaise).toBe(125_050)
    expect(buildBody(base({ amount: '12.345' }), ORDER)).toMatchObject({ ok: false, field: 'amountPaise' })
  })

  it('percent text ↔ basis points', () => {
    expect(percentToBasisPoints('33.33')).toBe(3_333)
    expect(percentToBasisPoints('100')).toBe(10_000)
    expect(percentToBasisPoints('')).toBe(0)
    expect(percentToBasisPoints('33.333')).toBeNull()
    expect(percentToBasisPoints('101')).toBeNull()
    expect(basisPointsToText(3_334)).toBe('33.34')
    expect(basisPointsToText(5_000)).toBe('50')
  })

  it('an itemized line nobody took is a field error on that item', () => {
    const d = base({ amount: '150', mode: 'itemized', items: [{ key: 'k1', name: 'Cake', amount: '150', memberIds: [] }] })
    expect(buildBody(d, ORDER)).toEqual({ ok: false, field: 'split.items.0.memberIds', message: 'Assign “Cake” to someone.' })
  })

  it('edit round-trips a percent split from the stored input values', () => {
    const e: GroupExpenseDTO = {
      id: 'e1', groupId: 'g1', description: 'Cab', amountPaise: 99_999, categoryId: CAT,
      category: { name: 'Transport', emoji: '🚕', color: '#F5D76E' }, occurredAt: '2026-10-12T06:30:00.000Z',
      splitMode: 'percent', taxPaise: 0, tipPaise: 0, discountPaise: 0, createdBy: ME, updatedBy: ME,
      createdAt: '2026-10-12T06:30:00.000Z', updatedAt: '2026-10-12T06:30:00.000Z',
      payers: [{ memberId: ME, paidPaise: 99_999 }],
      shares: [
        { memberId: ME, sharePaise: 33_330, inputValue: 3_333 },
        { memberId: ASHA, sharePaise: 33_330, inputValue: 3_333 },
        { memberId: RAVI, sharePaise: 33_339, inputValue: 3_334 },
      ],
      items: [], myPaidPaise: 99_999, mySharePaise: 33_330,
    }
    const d = draftFromExpense(e, ORDER)
    expect(d).toMatchObject({ amount: '999.99', mode: 'percent', multiplePayers: false, payerId: ME, percent: { [ME]: '33.33', [ASHA]: '33.33', [RAVI]: '33.34' } })
    const built = buildBody(d, ORDER)
    expect(built.ok && built.body.split).toEqual({
      mode: 'percent', entries: [{ memberId: ME, basisPoints: 3_333 }, { memberId: ASHA, basisPoints: 3_333 }, { memberId: RAVI, basisPoints: 3_334 }],
    })
  })
})
