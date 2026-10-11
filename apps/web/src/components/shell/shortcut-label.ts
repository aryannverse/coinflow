import { useSyncExternalStore } from 'react'

const noop = () => () => {}

/**
 * "⌘{key}" on Apple platforms, "Ctrl {key}" elsewhere; empty on the server and during hydration so
 * markup matches.
 */
export function useShortcutLabel(key: string): string {
  return useSyncExternalStore(
    noop,
    () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? `⌘${key}` : `Ctrl ${key}`),
    () => '',
  )
}

/** "⌘K" on Apple platforms, "Ctrl K" elsewhere. */
export const usePaletteShortcutLabel = () => useShortcutLabel('K')
