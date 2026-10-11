import { describe, expect, it } from 'vitest'
import { enterOnChoice, type KeyLike, type TargetLike } from './quick-add-keys'

const key = (over: Partial<KeyLike> = {}): KeyLike => ({
  key: 'Enter', isComposing: false, repeat: false, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...over,
})
const el = (tagName: string, role: string | null = null): TargetLike => ({ tagName, getAttribute: (n) => (n === 'role' ? role : null) })

describe('enterOnChoice', () => {
  it('submits on Enter over a radio chip or toggle', () => {
    expect(enterOnChoice(key(), el('BUTTON', 'radio'))).toBe('submit')
  })
  it('ignores other keys (Space selects, arrows move)', () => {
    for (const k of [' ', 'ArrowRight', 'ArrowDown', 'Tab']) expect(enterOnChoice(key({ key: k }), el('BUTTON', 'radio'))).toBe('ignore')
  })
  it('leaves keypad buttons, Save, the summary and fields to their native Enter', () => {
    expect(enterOnChoice(key(), el('BUTTON'))).toBe('ignore')
    expect(enterOnChoice(key(), el('SUMMARY'))).toBe('ignore')
    expect(enterOnChoice(key(), el('INPUT'))).toBe('ignore')
  })
  it('never touches a textarea', () => {
    expect(enterOnChoice(key(), el('TEXTAREA', 'radio'))).toBe('ignore')
    expect(enterOnChoice(key(), el('TEXTAREA'))).toBe('ignore')
  })
  it('lets an IME composition finish', () => {
    expect(enterOnChoice(key({ isComposing: true }), el('BUTTON', 'radio'))).toBe('ignore')
  })
  it('swallows a held Enter instead of repeating', () => {
    expect(enterOnChoice(key({ repeat: true }), el('BUTTON', 'radio'))).toBe('swallow')
  })
  it('ignores Enter with a modifier', () => {
    for (const m of ['shiftKey', 'ctrlKey', 'metaKey', 'altKey'] as const) expect(enterOnChoice(key({ [m]: true }), el('BUTTON', 'radio'))).toBe('ignore')
  })
})
