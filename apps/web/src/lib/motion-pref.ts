export type MotionPref = 'on' | 'off' | 'system'

/**
 * `osPrefersReduce` is `null` until the OS preference is known (server render and
 * the hydration pass). Unknown counts as "not reduced"; consumers that must not run
 * heavy effects before the answer is known gate on `isMotionReady` as well.
 */
export function resolveReducedMotion(pref: MotionPref, osPrefersReduce: boolean | null): boolean {
  if (pref === 'on') return true
  if (pref === 'off') return false
  return osPrefersReduce === true
}

/** True once the OS `prefers-reduced-motion` value has been read on the client. */
export function isMotionReady(osPrefersReduce: boolean | null): boolean {
  return osPrefersReduce !== null
}
