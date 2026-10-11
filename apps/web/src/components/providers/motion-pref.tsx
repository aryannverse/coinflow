'use client'
import { MotionConfig } from 'motion/react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useMediaQuery } from '@/hooks/use-media-query'
import { isMotionReady, resolveReducedMotion, type MotionPref } from '@/lib/motion-pref'

type Ctx = { pref: MotionPref; reduced: boolean; ready: boolean; setPref: (p: MotionPref) => void }
const MotionCtx = createContext<Ctx | null>(null)

export function MotionPrefProvider({ initial, children }: { initial: MotionPref; children: React.ReactNode }) {
  const [pref, setPref] = useState<MotionPref>(initial)
  const osReduce = useMediaQuery('(prefers-reduced-motion: reduce)')

  const reduced = resolveReducedMotion(pref, osReduce)
  const ready = isMotionReady(osReduce)

  useEffect(() => {
    if (!ready) return
    const root = document.documentElement
    root.dataset.reduceMotion = String(reduced)
    return () => {
      delete root.dataset.reduceMotion
    }
  }, [ready, reduced])

  const value = useMemo(() => ({ pref, reduced, ready, setPref }), [pref, reduced, ready])
  return (
    <MotionCtx.Provider value={value}>
      <MotionConfig reducedMotion={reduced ? 'always' : ready ? 'never' : 'user'}>{children}</MotionConfig>
    </MotionCtx.Provider>
  )
}

/** True when motion must be minimised. Unknown (pre-hydration) and no provider both read as not reduced. */
export function useReducedMotion(): boolean {
  return useContext(MotionCtx)?.reduced ?? false
}

/**
 * True once the OS preference has been read on the client. Heavy effects (Lenis,
 * WebGL/Dither backgrounds) must mount only when `useMotionReady() && !useReducedMotion()`.
 */
export function useMotionReady(): boolean {
  return useContext(MotionCtx)?.ready ?? false
}

export function useMotionPref() {
  const ctx = useContext(MotionCtx)
  if (!ctx) throw new Error('useMotionPref must be used inside MotionPrefProvider')
  return { pref: ctx.pref, setPref: ctx.setPref }
}
