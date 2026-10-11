import { useSyncExternalStore } from 'react'

const noop = () => () => {}

/** "⌘K" on Apple platforms, "Ctrl K" elsewhere; empty on the server and during hydration so markup matches. */
export function usePaletteShortcutLabel(): string {
  return useSyncExternalStore(
    noop,
    () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K'),
    () => '',
  )
}
