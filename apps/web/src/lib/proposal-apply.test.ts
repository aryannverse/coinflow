import { describe, expect, it } from 'vitest'
import { quickAddPrefill, receiptNotice, receiptToDraft } from './proposal-apply'

const CAT = '55555555-5555-4555-8555-555555555555'

describe('proposal → form prefills', () => {
  it('an expense proposal opens quick add with its source', () => {
    expect(quickAddPrefill({
      id: 'p', kind: 'expense', summary: 's',
      payload: { type: 'expense', amount: 25_000, categoryId: CAT, note: 'lunch', method: 'cash', occurredAt: '2026-10-11T12:00:00+05:30', source: 'voice' },
    })).toEqual({ type: 'expense', amount: 25_000, categoryId: CAT, note: 'lunch', method: 'cash', occurredAt: '2026-10-11T06:30:00.000Z', source: 'voice' })
  })

  it('a receipt fills the itemized canvas: lines, tax/tip/discount, nobody assigned yet', () => {
    const d = receiptToDraft({
      merchant: 'Toit', date: '2026-10-11', items: [{ name: 'Pizza', amountPaise: 12_000 }, { name: 'Beer', amountPaise: 8_050 }],
      taxPaise: 1_003, tipPaise: 0, discountPaise: 1_000, totalPaise: 20_053, confidence: 0.9, mismatch: false, mismatchPaise: 0,
    })
    expect(d).toMatchObject({
      description: 'Toit', amount: '200.53', mode: 'itemized', tax: '10.03', tip: '', discount: '10', occurredAt: '2026-10-11T06:30:00.000Z',
      items: [{ name: 'Pizza', amount: '120', memberIds: [] }, { name: 'Beer', amount: '80.50', memberIds: [] }],
    })
  })

  it('says plainly when the receipt doesn’t add up, or the reading is unsure', () => {
    const base = { merchant: null, date: null, items: [], taxPaise: 0, tipPaise: 0, discountPaise: 0, totalPaise: 21_000, confidence: 0.9, mismatch: true, mismatchPaise: 947 }
    expect(receiptNotice(base)).toBe('The receipt’s total, ₹210, is ₹9.47 more than its lines. Check the items before saving.')
    expect(receiptNotice({ ...base, mismatch: false, confidence: 0.4 })).toBe('Some numbers may be misread. Please check them before saving.')
    expect(receiptNotice({ ...base, mismatch: false })).toBeUndefined()
  })
})
