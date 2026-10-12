import { describe, expect, it } from 'vitest'
import { proposalSchema } from './proposals'

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CAT = '55555555-5555-4555-8555-555555555555'
const G = '44444444-4444-4444-8444-444444444444'
const ME = '11111111-1111-4111-8111-111111111111'

describe('proposalSchema: the API’s own schemas, applied to what the agent drafted', () => {
  it('accepts an expense exactly as the Python agent sends it', () => {
    expect(proposalSchema.safeParse({
      id: ID, kind: 'expense', summary: 'Expense ₹250 · Food & Dining',
      payload: { type: 'expense', amount: 25_000, categoryId: CAT, note: 'lunch', method: 'upi', occurredAt: '2026-10-11T12:00:00+05:30', source: 'chat' },
    }).success).toBe(true)
  })
  it('refuses a kind/type mismatch, a missing source and unknown fields', () => {
    const base = { id: ID, kind: 'income', summary: 'x', payload: { type: 'expense', amount: 1, categoryId: CAT, source: 'chat' } }
    expect(proposalSchema.safeParse(base).success).toBe(false)
    expect(proposalSchema.safeParse({ ...base, kind: 'expense', payload: { ...base.payload, source: undefined } }).success).toBe(false)
    expect(proposalSchema.safeParse({ ...base, kind: 'expense', payload: { ...base.payload, sneaky: 1 } }).success).toBe(false)
  })
  it('a group expense needs its groupId and a valid body', () => {
    const payload = { description: 'Cab', amountPaise: 30_000, categoryId: CAT, payers: [{ memberId: ME, paidPaise: 30_000 }], split: { mode: 'equal', memberIds: [ME] } }
    expect(proposalSchema.safeParse({ id: ID, kind: 'group_expense', summary: 'Cab', payload }).success).toBe(false)
    expect(proposalSchema.safeParse({ id: ID, kind: 'group_expense', summary: 'Cab', groupId: G, payload }).success).toBe(true)
  })
  it('accepts a plan bundle and refuses an unknown kind', () => {
    expect(proposalSchema.safeParse({
      id: ID, kind: 'plan_bundle', summary: 'Plan',
      payload: { event: { name: 'Goa', kind: 'event', placeholders: [{ displayName: 'Asha' }] }, budgets: [{ categoryId: CAT, monthlyLimit: 2_000_000 }], checklist: ['Book train'] },
    }).success).toBe(true)
    expect(proposalSchema.safeParse({ id: ID, kind: 'transfer', summary: 'x', payload: {} }).success).toBe(false)
  })
})
