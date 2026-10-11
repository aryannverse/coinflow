export const UNDO_VISIBLE_MS = 10_000

export interface UndoEntry {
  auditId: string
  label: string
  createdAt: number
}

/** Holds the single latest undoable change. It expires after UNDO_VISIBLE_MS and can be taken once. */
export function createUndoStore(now: () => number = () => Date.now()) {
  let entry: UndoEntry | null = null
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())

  const current = (): UndoEntry | null => {
    if (entry && now() - entry.createdAt > UNDO_VISIBLE_MS) entry = null
    return entry
  }

  return {
    push(e: { auditId: string; label: string }) {
      entry = { ...e, createdAt: now() }
      emit()
    },
    current,
    take(): UndoEntry | null {
      const e = current()
      if (e) {
        entry = null
        emit()
      }
      return e
    },
    clear(auditId?: string) {
      if (entry && (!auditId || entry.auditId === auditId)) {
        entry = null
        emit()
      }
    },
    subscribe(l: () => void) {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
  }
}

export const undoStore = createUndoStore()
