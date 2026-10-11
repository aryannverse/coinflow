import { describe, expect, it } from 'vitest'
import { parseQuickCommand } from './quick-command'

const cats = [
  { id: 'food', name: 'Food & Dining', kind: 'expense' as const },
  { id: 'transport', name: 'Transport', kind: 'expense' as const },
  { id: 'groceries', name: 'Groceries', kind: 'expense' as const },
  { id: 'salary', name: 'Salary', kind: 'income' as const },
]

describe('parseQuickCommand', () => {
  it('amount + category word', () => {
    expect(parseQuickCommand('250 food lunch', cats)).toEqual({ type: 'expense', amount: 25_000, categoryId: 'food', note: 'lunch' })
  })
  it('synonyms keep the word in the note', () => {
    expect(parseQuickCommand('1.2k uber to office', cats)).toEqual({ type: 'expense', amount: 120_000, categoryId: 'transport', note: 'uber to office' })
  })
  it('leading + means income and matches income categories', () => {
    expect(parseQuickCommand('+50000 salary', cats)).toEqual({ type: 'income', amount: 5_000_000, categoryId: 'salary', note: null })
  })
  it('₹ and commas are fine; unknown words become the note', () => {
    expect(parseQuickCommand('₹1,250 movie night', cats)).toEqual({ type: 'expense', amount: 125_000, categoryId: null, note: 'movie night' })
  })
  it('returns null without a leading amount', () => {
    expect(parseQuickCommand('food 250', cats)).toBeNull()
    expect(parseQuickCommand('', cats)).toBeNull()
  })
  it('"450 chai" style input resolves through synonyms and keeps the word as the note', () => {
    expect(parseQuickCommand('450 chai', cats)).toEqual({ type: 'expense', amount: 45_000, categoryId: 'food', note: 'chai' })
  })
})
