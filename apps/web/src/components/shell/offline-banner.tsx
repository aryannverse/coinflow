'use client'
import { useSyncExternalStore } from 'react'

function subscribe(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

/** Lives below the TopBar. The live region is always mounted; only its text comes and goes, so it is announced. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
  return (
    <div role="status" className="sticky top-16 z-20">
      {!online && (
        <p className="bg-surface-2 px-4 py-2 text-center text-sm">You’re offline — changes will sync when you’re back.</p>
      )}
    </div>
  )
}
