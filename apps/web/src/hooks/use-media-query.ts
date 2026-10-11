'use client'
import { useCallback, useSyncExternalStore } from 'react'

/**
 * Subscribes to a CSS media query. Returns `null` on the server and during the
 * hydration pass (so markup never mismatches), then the live boolean.
 */
export function useMediaQuery(query: string): boolean | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    [query],
  )
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  return useSyncExternalStore<boolean | null>(subscribe, getSnapshot, () => null)
}
