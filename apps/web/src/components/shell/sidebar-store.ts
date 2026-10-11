const KEY = 'coinflow:sidebar-collapsed'
const listeners = new Set<() => void>()
let mem: boolean | null = null // session fallback when localStorage is blocked
let interacted = false // width transitions only run after the user toggles, never on the hydration correction

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
      return mem ?? window.localStorage.getItem(KEY) === '1'
    } catch {
      return mem ?? false
    }
  },
  server: () => false,
  /** True once the user has toggled in this session; gates the width transition. */
  animated: () => interacted,
  animatedServer: () => false,
  set(collapsed: boolean) {
    mem = collapsed
    interacted = true
    try {
      window.localStorage.setItem(KEY, collapsed ? '1' : '0')
    } catch {
      /* storage blocked (private mode): the choice lasts for this session only */
    }
    listeners.forEach((l) => l())
  },
}
