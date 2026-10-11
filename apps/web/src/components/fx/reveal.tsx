'use client'
import { BlurFade } from '@/components/ui/blur-fade'
import { useReducedMotion } from '@/components/providers/motion-pref'

/** Blur-fade entrance on scroll into view; a plain div when motion is reduced. */
export function Reveal({ delay = 0, className, children }: { delay?: number; className?: string; children: React.ReactNode }) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <BlurFade delay={delay} inView className={className}>
      {children}
    </BlurFade>
  )
}
