'use client'
import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'
import { useMotionReady, useReducedMotion } from '@/components/providers/motion-pref'
import { HERO_DITHER } from '@/lib/hero-palette'

const Dither = dynamic(() => import('@/components/reactbits/Dither'), { ssr: false })

/**
 * WebGL dither backdrop, theme-aware and dimmed so body text stays >= 4.5:1 over its brightest pixel
 * (palette + proof in `lib/hero-palette.ts`). Mounts only once the motion preference and theme are known
 * and motion is allowed; otherwise a token-driven static gradient.
 */
export function HeroBackground() {
  const reduced = useReducedMotion()
  const ready = useMotionReady()
  const { resolvedTheme } = useTheme()
  const palette = resolvedTheme === 'light' ? HERO_DITHER.light : resolvedTheme === 'dark' ? HERO_DITHER.dark : null
  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
      {ready && !reduced && palette ? (
        <div className="h-full w-full" style={{ opacity: palette.opacity }}>
          <Dither
            waveColor={palette.wave}
            backgroundColor={palette.background}
            colorNum={4}
            pixelSize={2}
            enableMouseInteraction
          />
        </div>
      ) : (
        <div className="h-full w-full bg-[radial-gradient(60%_60%_at_50%_30%,color-mix(in_srgb,var(--lime)_18%,transparent),transparent)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background" />
    </div>
  )
}
