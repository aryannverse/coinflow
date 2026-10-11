const KEY = 'coinflow:sidebar-collapsed'
const listeners = new Set<() => void>()

/** localStorage-backed boolean read through useSyncExternalStore (no setState-in-effect, no hydration flash of a wrong value). */
export const sidebarStore = {
  subscribe(cb: () => void) {
    listeners.add(cb)
    window.addEventListener('storage', cb)
    return () => {
      listeners.delete(cb)
      window.removeEventListener('storage', cb)
    }
  },
  get(): boolean {
    try {
      return window.localStorage.getItem(KEY) === '1'
    } catch {
      return false
    }
  },
  server: () => false,
  set(collapsed: boolean) {
    try {
      window.localStorage.setItem(KEY, collapsed ? '1' : '0')
    } catch {
      /* storage blocked (private mode): the preference simply does not persist */
    }
    listeners.forEach((l) => l())
  },
}
