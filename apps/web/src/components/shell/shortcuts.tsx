'use client'
import { useEffect } from 'react'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

/**
 * Shell keyboard: ⌘K / Ctrl+K opens the palette (works while typing, like every command palette);
 * a bare N opens quick add, but never while typing or while another dialog is open.
 * ⌘Z lives with the undo toast (`useUndoShortcut`), mounted by AppProviders.
 */
export function Shortcuts({ onPalette }: { onPalette: () => void }) {
  const { open: openQuickAdd } = useQuickAdd() // stable identity: the listener binds once
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onPalette()
      } else if (
        e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.repeat &&
        !isTyping(e.target) && !document.querySelector('[role="dialog"]')
      ) {
        e.preventDefault()
        openQuickAdd()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPalette, openQuickAdd])
  return null
}
