'use client'
import { useEffect, useRef } from 'react'
// ui/confetti exports components only (no `confetti` function), so the underlying library is imported here and nowhere else.
import confetti from 'canvas-confetti'
import { useMotionReady, useReducedMotion } from '@/components/providers/motion-pref'

function burst() {
  void confetti({
    particleCount: 90,
    spread: 70,
    origin: { y: 0.7 },
    colors: ['#C8F560', '#F1F5F2', '#7FD8C4'],
    disableForReducedMotion: true,
  })
}

/** Imperative burst for event handlers. No-op until motion preference is known, and when it is reduced. */
export function celebrate() {
  if (document.documentElement.dataset.reduceMotion !== 'false') return
  burst()
}

/** Fires one burst after mount, only once the motion preference is known and not reduced. */
export function CelebrateOnMount() {
  const reduced = useReducedMotion()
  const ready = useMotionReady()
  const fired = useRef(false)
  useEffect(() => {
    if (!ready || reduced || fired.current) return
    fired.current = true
    burst()
  }, [ready, reduced])
  return null
}
