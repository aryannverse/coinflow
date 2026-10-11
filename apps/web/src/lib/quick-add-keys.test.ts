import { describe, expect, it } from 'vitest'
import { enterOnChoice, type KeyLike, type TargetLike } from './quick-add-keys'

const key = (over: Partial<KeyLike> = {}): KeyLike => ({
  key: 'Enter', isComposing: false, repeat: false, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...over,
})
const el = (tagName: string, role: string | null = null, attrs: Record<string, string> = {}): TargetLike => ({
  tagName,
  getAttribute: (n) => (n === 'role' ? role : (attrs[n] ?? null)),
})
/** A category chip: `role="radio"` plus `data-cat`. */
const chip = (tagName = 'BUTTON') => el(tagName, 'radio', { 'data-cat': 'cat-food' })

describe('enterOnChoice', () => {
  it('submits on Enter over a category chip', () => {
    expect(enterOnChoice(key(), chip())).toBe('submit')
  })
  it('leaves the Expense/Income toggle to its native Enter (selects, does not save the old value)', () => {
    expect(enterOnChoice(key(), el('BUTTON', 'radio', { 'data-type': 'income' }))).toBe('ignore')
  })
  it('leaves the "Paid with" toggle to its native Enter', () => {
    expect(enterOnChoice(key(), el('BUTTON', 'radio', { value: 'upi' }))).toBe('ignore')
  })
  it('ignores other keys (Space selects, arrows move)', () => {
    for (const k of [' ', 'ArrowRight', 'ArrowDown', 'Tab']) expect(enterOnChoice(key({ key: k }), chip())).toBe('ignore')
  })
  it('leaves keypad buttons, Save, the summary and fields to their native Enter', () => {
    expect(enterOnChoice(key(), el('BUTTON'))).toBe('ignore')
    expect(enterOnChoice(key(), el('SUMMARY'))).toBe('ignore')
    expect(enterOnChoice(key(), el('INPUT'))).toBe('ignore')
  })
  it('never touches a textarea', () => {
    expect(enterOnChoice(key(), chip('TEXTAREA'))).toBe('ignore')
    expect(enterOnChoice(key(), el('TEXTAREA'))).toBe('ignore')
  })
  it('lets an IME composition finish', () => {
    expect(enterOnChoice(key({ isComposing: true }), chip())).toBe('ignore')
  })
  it('swallows a held Enter instead of repeating', () => {
    expect(enterOnChoice(key({ repeat: true }), chip())).toBe('swallow')
  })
  it('ignores Enter with a modifier', () => {
    for (const m of ['shiftKey', 'ctrlKey', 'metaKey', 'altKey'] as const) expect(enterOnChoice(key({ [m]: true }), chip())).toBe('ignore')
  })
})
