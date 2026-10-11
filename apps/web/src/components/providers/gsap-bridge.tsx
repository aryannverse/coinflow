'use client'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useLenis } from 'lenis/react'
import { useEffect } from 'react'

/** Drives Lenis from GSAP's ticker so ScrollTrigger and Lenis share one clock. */
export default function GsapBridge() {
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
