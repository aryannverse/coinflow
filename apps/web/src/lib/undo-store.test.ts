import { describe, expect, it, vi } from 'vitest'
import { createUndoStore, UNDO_VISIBLE_MS } from './undo-store'

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
