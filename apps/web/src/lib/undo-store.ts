export const UNDO_VISIBLE_MS = 10_000

export interface UndoEntry {
  auditId: string
  label: string
  createdAt: number
}

/**
 * Which audit id a visible toast's Undo button should fire. The toast can outlive the store's
 * wall-clock window (sonner pauses on hover or when the tab is hidden), so it uses its OWN entry;
 * the server is the authority on expiry. Fires at most once per toast, and never for an id the
 * store already handed out (Cmd+Z, then a click during the toast's exit animation).
 */
export function resolveUndoTarget(
  storeCurrent: UndoEntry | null,
  toastEntry: { auditId: string },
  state: { fired: boolean; consumed: boolean },
): { auditId: string | null; clearStore: boolean } {
  if (state.fired || state.consumed) return { auditId: null, clearStore: false }
  return { auditId: toastEntry.auditId, clearStore: storeCurrent?.auditId === toastEntry.auditId }
}

const CONSUMED_LIMIT = 20

/** Holds the single latest undoable change. It expires after UNDO_VISIBLE_MS and can be taken once. */
export function createUndoStore(now: () => number = () => Date.now()) {
  let entry: UndoEntry | null = null
  const consumed = new Set<string>() // audit ids already undone from here; bounded, oldest dropped first
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())

  const current = (): UndoEntry | null => {
    if (entry && now() - entry.createdAt > UNDO_VISIBLE_MS) entry = null
    return entry
  }

  const markConsumed = (auditId: string) => {
    consumed.add(auditId)
    if (consumed.size > CONSUMED_LIMIT) consumed.delete(consumed.values().next().value as string)
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
        markConsumed(e.auditId)
        emit()
      }
      return e
    },
    markConsumed,
    isConsumed: (auditId: string) => consumed.has(auditId),
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
