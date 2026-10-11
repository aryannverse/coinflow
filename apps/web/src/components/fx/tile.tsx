'use client'
import type { CSSProperties } from 'react'
import SpotlightCard from '@/components/reactbits/SpotlightCard'
import { useReducedMotion } from '@/components/providers/motion-pref'
import { cn } from '@/lib/utils'

// SpotlightCard paints its own surface, rim and shadow from these variables; point them at the design tokens.
const TOKEN_SURFACE = {
  '--spotlight-card-surface': 'var(--card)',
  '--spotlight-card-border': 'var(--border)',
  '--spotlight-card-shadow': 'none',
} as CSSProperties

/** Card surface (`bg-card rounded-tile border`) with a pointer spotlight when motion is allowed. */
export function Tile({
  className,
  spotlight = true,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement> & { spotlight?: boolean }) {
  const reduced = useReducedMotion()
  if (!spotlight || reduced) {
    return (
      <section className={cn('rounded-tile border bg-card p-5 text-card-foreground', className)} {...rest}>
        {children}
      </section>
    )
  }
  return (
    <SpotlightCard
      // `!` beats SpotlightCard's built-in rounded-3xl / p-8 regardless of stylesheet order; its own rim replaces `border`.
      className={cn('rounded-tile! p-5! text-card-foreground', className)}
      style={TOKEN_SURFACE}
      spotlightColor="var(--primary)"
      intensity={0.14}
    >
      <section {...rest}>{children}</section>
    </SpotlightCard>
  )
}
