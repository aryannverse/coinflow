'use client'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { RefObject } from 'react'

gsap.registerPlugin(ScrollTrigger)

/**
 * Scroll-scrubbed rise of the money-flow nodes. Renders nothing; MoneyFlow loads it with `next/dynamic` only
 * when motion is allowed, so GSAP stays out of the first JS and the diagram is fully visible without it.
 */
export default function FlowScroll({ container }: { container: RefObject<HTMLDivElement | null> }) {
  useGSAP(
    () => {
      gsap.from('.flow-node', {
        y: 40,
        opacity: 0,
        stagger: 0.15,
        ease: 'power3.out',
        scrollTrigger: { trigger: container.current, start: 'top 80%', end: 'top 50%', scrub: true },
      })
    },
    { scope: container },
  )
  return null
}
