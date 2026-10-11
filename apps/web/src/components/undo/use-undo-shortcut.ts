'use client'
import { useEffect } from 'react'
import { useUndo } from '@/hooks/queries'
import { undoStore } from '@/lib/undo-store'

const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

/** ⌘Z / Ctrl+Z undoes the latest app change — but never hijacks native text undo inside fields. */
export function useUndoShortcut() {
  const { mutate: undoMutate } = useUndo() // stable identity: the listener binds once
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey || isTextField(e.target)) return
      const entry = undoStore.take() // consumes the entry, so the toast button cannot fire it twice
      if (!entry) return
      e.preventDefault()
      undoMutate(entry.auditId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undoMutate])
}
