'use client'
import dynamic from 'next/dynamic'
import { useMotionReady, useReducedMotion } from '@/components/providers/motion-pref'

const Dither = dynamic(() => import('@/components/reactbits/Dither'), { ssr: false })

/** WebGL dither backdrop. Mounts only once the motion preference is known and not reduced; otherwise a static gradient. */
export function HeroBackground() {
  const reduced = useReducedMotion()
  const ready = useMotionReady()
  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
      {ready && !reduced ? (
        <Dither
          waveColor="#C8F560"
          backgroundColor="#0E100F"
          colorNum={4}
          pixelSize={2}
          enableMouseInteraction
        />
      ) : (
        <div className="h-full w-full bg-[radial-gradient(60%_60%_at_50%_30%,rgba(200,245,96,0.18),transparent)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />
    </div>
  )
}
