'use client'
import { ReactLenis } from 'lenis/react'
import dynamic from 'next/dynamic'
import { useMotionReady, useReducedMotion } from './motion-pref'

// GSAP is only needed to share Lenis's clock with ScrollTrigger, so it loads after hydration, not in the first JS.
const GsapBridge = dynamic(() => import('./gsap-bridge'), { ssr: false })

// allowNestedScroll: wheel events inside a scrollable descendant (palette list, sheets) scroll that
// element natively instead of being swallowed by the root smooth scroll.
const LENIS_OPTIONS = { autoRaf: false, lerp: 0.12, smoothWheel: true, allowNestedScroll: true } as const

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
