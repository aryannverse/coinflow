'use client'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ReactLenis, useLenis } from 'lenis/react'
import { useEffect } from 'react'
import { useMotionReady, useReducedMotion } from './motion-pref'

const LENIS_OPTIONS = { autoRaf: false, lerp: 0.12, smoothWheel: true } as const

/** Drives Lenis from GSAP's ticker so ScrollTrigger and Lenis share one clock. */
function GsapBridge() {
  const lenis = useLenis()
  useEffect(() => {
    if (!lenis) return
    gsap.registerPlugin(ScrollTrigger)
    const update = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(update)
    gsap.ticker.lagSmoothing(0)
    lenis.on('scroll', ScrollTrigger.update)
    return () => {
      gsap.ticker.remove(update)
      gsap.ticker.lagSmoothing(500, 33)
      lenis.off('scroll', ScrollTrigger.update)
    }
  }, [lenis])
  return null
}

/**
 * Smooth scrolling, mounted only when the OS preference is known AND motion is not reduced
 * (no Lenis during SSR/hydration, none under reduced motion). Lenis is a sibling of the
 * children, never a wrapper, so children keep a stable position in the tree and are not
 * remounted when the engine switches on or off. Descendants reach the instance through
 * `useLenis()` (root store).
 */
export function LenisProvider({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion()
  const ready = useMotionReady()
  return (
    <>
      {ready && !reduced ? (
        <>
          <ReactLenis root options={LENIS_OPTIONS} />
          <GsapBridge />
        </>
      ) : null}
      {children}
    </>
  )
}
