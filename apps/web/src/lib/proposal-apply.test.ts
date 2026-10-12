import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { applyPlanBundle, approvedText, planBudgetLines, quickAddPrefill, receiptNotice, receiptToDraft } from './proposal-apply'

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

const plan = {
  id: 'p', kind: 'plan_bundle' as const, summary: 'Goa plan',
  payload: {
    event: { name: 'Goa', kind: 'event' as const },
    budgets: [{ categoryId: CAT, monthlyLimit: 2_000_000 }, { categoryId: 'c2', monthlyLimit: 500_000 }],
    checklist: [],
  },
}

describe('approving what has no undo says so plainly', () => {
  it('per-kind done text never promises an undo that doesn’t exist', () => {
    expect(approvedText({ id: 'p', kind: 'expense', summary: 's', payload: { type: 'expense', amount: 1, categoryId: CAT, source: 'chat' } })).toBe('Saved. You can undo from the toast.')
    expect(approvedText({ id: 'p', kind: 'group_event', summary: 's', payload: { name: 'Goa' } })).toBe('Group created.')
    expect(approvedText(plan)).toBe('Plan saved: group created and 2 budgets set.')
    expect(approvedText({ ...plan, payload: { ...plan.payload, budgets: [plan.payload.budgets[0]] } })).toBe('Plan saved: group created and 1 budget set.')
    expect(approvedText({ ...plan, payload: { ...plan.payload, budgets: [] } })).toBe('Plan saved: group created.')
  })
  it('a plan chip lists the budgets it will set before Approve', () => {
    expect(planBudgetLines(plan, (id) => (id === CAT ? 'Travel' : 'Food & Dining'))).toEqual([
      'Sets Travel plan to ₹20,000/month', 'Sets Food & Dining plan to ₹5,000/month',
    ])
  })
})

describe('applyPlanBundle: a retry never creates a second group', () => {
  it('remembers the group and the budgets already set, and retries only the rest', async () => {
    const createGroup = vi.fn(async () => ({ id: 'g1' }))
    let fail = true
    const upsertBudget = vi.fn(async (b: { categoryId: string }) => {
      if (b.categoryId === 'c2' && fail) throw new Error('budget failed')
    })
    const seen: unknown[] = []
    const onProgress = (pr: unknown) => void seen.push(pr)
    await expect(applyPlanBundle(plan, {}, { createGroup, upsertBudget, onProgress })).rejects.toThrow('budget failed')
    expect(seen.at(-1)).toEqual({ groupId: 'g1', budgetsDone: 1 })
    fail = false
    await expect(applyPlanBundle(plan, { groupId: 'g1', budgetsDone: 1 }, { createGroup, upsertBudget, onProgress })).resolves.toBe('g1')
    expect(createGroup).toHaveBeenCalledTimes(1)
    expect(upsertBudget.mock.calls.map(([b]) => b.categoryId)).toEqual([CAT, 'c2', 'c2'])
    expect(seen.at(-1)).toEqual({ groupId: 'g1', budgetsDone: 2 })
  })
})
