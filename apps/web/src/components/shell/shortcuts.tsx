'use client'
import { useEffect } from 'react'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

const dialogOpen = () => document.querySelector('[role="dialog"]') !== null
const popupOpen = () => document.querySelector('[role="dialog"], [role="listbox"], [role="menu"]') !== null

/**
 * Shell keyboard: ⌘K / Ctrl+K opens the palette (works while typing, like every command palette, but not
 * over another dialog); a bare N opens quick add, but never while typing or while a dialog, listbox or menu is open.
 * ⌘Z lives with the undo toast (`useUndoShortcut`), mounted by AppProviders.
 */
export function Shortcuts({ paletteOpen, onPalette }: { paletteOpen: boolean; onPalette: () => void }) {
  const { open: openQuickAdd } = useQuickAdd() // stable identity
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key?.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && !e.altKey && key === 'k') {
        e.preventDefault()
        if (!paletteOpen && !dialogOpen()) onPalette()
      } else if (
        key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.repeat &&
        !isTyping(e.target) && !popupOpen()
      ) {
        e.preventDefault()
        openQuickAdd()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, onPalette, openQuickAdd])
  return null
}
