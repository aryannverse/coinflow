import { describe, expect, it, vi } from 'vitest'
import { createUndoStore, resolveUndoTarget, UNDO_VISIBLE_MS } from './undo-store'

describe('undo store', () => {
  it('keeps only the latest entry and notifies subscribers', () => {
    const t = 0
    const s = createUndoStore(() => t)
    const l = vi.fn()
    s.subscribe(l)
    s.push({ auditId: 'a', label: 'Added ₹450' })
    s.push({ auditId: 'b', label: 'Deleted ₹99' })
    expect(s.current()?.auditId).toBe('b')
    expect(l).toHaveBeenCalledTimes(2)
  })

  it('is visible for exactly 10 s then expires', () => {
    expect(UNDO_VISIBLE_MS).toBe(10_000)
    let t = 0
    const s = createUndoStore(() => t)
    s.push({ auditId: 'a', label: 'x' })
    t = UNDO_VISIBLE_MS
    expect(s.current()?.auditId).toBe('a')
    t = UNDO_VISIBLE_MS + 1
    expect(s.current()).toBeNull()
    expect(s.take()).toBeNull()
  })

  it('take() consumes the entry exactly once', () => {
    const s = createUndoStore(() => 0)
    s.push({ auditId: 'a', label: 'x' })
    expect(s.take()?.auditId).toBe('a')
    expect(s.take()).toBeNull()
  })

  it('clear(id) ignores stale ids', () => {
    const s = createUndoStore(() => 0)
    s.push({ auditId: 'b', label: 'x' })
    s.clear('a')
    expect(s.current()?.auditId).toBe('b')
    s.clear('b')
    expect(s.current()).toBeNull()
  })

  it('unsubscribed listeners are not notified', () => {
    const s = createUndoStore(() => 0)
    const l = vi.fn()
    const off = s.subscribe(l)
    off()
    s.push({ auditId: 'a', label: 'x' })
    expect(l).not.toHaveBeenCalled()
  })
})

describe('resolveUndoTarget', () => {
  const entry = { auditId: 'a', label: 'x', createdAt: 0 }
  const fresh = { fired: false, consumed: false }

  it('undoes the toast own entry even when the store has already expired', () => {
    expect(resolveUndoTarget(null, { auditId: 'a' }, fresh)).toEqual({ auditId: 'a', clearStore: false })
  })

  it('clears the store when it still holds the same entry, so Cmd+Z cannot repeat it', () => {
    expect(resolveUndoTarget(entry, { auditId: 'a' }, fresh)).toEqual({ auditId: 'a', clearStore: true })
  })

  it('does not clear a newer entry in the store', () => {
    expect(resolveUndoTarget({ ...entry, auditId: 'b' }, { auditId: 'a' }, fresh)).toEqual({ auditId: 'a', clearStore: false })
  })

  it('does nothing on a second click', () => {
    expect(resolveUndoTarget(entry, { auditId: 'a' }, { ...fresh, fired: true })).toEqual({ auditId: null, clearStore: false })
  })

  it('does nothing for an id the store already handed out via take() (Cmd+Z then click)', () => {
    const s = createUndoStore(() => 0)
    s.push({ auditId: 'a', label: 'x' })
    s.take()
    const target = resolveUndoTarget(s.current(), { auditId: 'a' }, { fired: false, consumed: s.isConsumed('a') })
    expect(target).toEqual({ auditId: null, clearStore: false })
  })
})

describe('consumed ids', () => {
  it('are remembered after take() and markConsumed, and the set stays bounded', () => {
    const s = createUndoStore(() => 0)
    s.push({ auditId: 'a', label: 'x' })
    s.take()
    expect(s.isConsumed('a')).toBe(true)
    expect(s.isConsumed('b')).toBe(false)
    for (let i = 0; i < 25; i++) s.markConsumed(`id${i}`)
    expect(s.isConsumed('a')).toBe(false)
    expect(s.isConsumed('id24')).toBe(true)
  })
})
