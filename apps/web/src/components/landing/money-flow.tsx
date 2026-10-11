'use client'
import { ArrowDown, ArrowRight } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'
import { forwardRef, useRef } from 'react'
import { AmountTicker } from '@/components/fx/amount-ticker'
import { useMotionReady, useReducedMotion } from '@/components/providers/motion-pref'
import { AnimatedBeam } from '@/components/ui/animated-beam'
import { FLOW_PATH } from '@/lib/flow-palette'
import { cn } from '@/lib/utils'

// GSAP + ScrollTrigger load lazily and only when motion is allowed (see FlowScroll).
const FlowScroll = dynamic(() => import('./flow-scroll'), { ssr: false })

const Node = forwardRef<HTMLDivElement, { label: string; paise: number; hint?: string; lime?: boolean }>(
  ({ label, paise, hint, lime }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flow-node z-10 rounded-tile border p-5 shadow-sm',
        lime ? 'border-transparent bg-lime text-[#0F1210] shadow-[0_0_60px_-10px_rgba(200,245,96,0.55)]' : 'bg-card',
      )}
    >
      <p className={cn('font-mono text-xs uppercase tracking-[0.12em]', lime ? 'text-[#0F1210]' : 'text-muted-foreground')}>{label}</p>
      <AmountTicker paise={paise} className="mt-1 block text-3xl font-bold" />
      {hint ? <p className={cn('mt-1 text-sm', lime ? 'text-[#2A3320]' : 'text-muted-foreground')}>{hint}</p> : null}
    </div>
  ),
)
Node.displayName = 'Node'

/** Static connector between columns: shown on mobile (stacked, pointing down) and when beams are off (reduced motion). */
function Connector({ showAtMd }: { showAtMd: boolean }) {
  return (
    <div aria-hidden className={cn('flex items-center justify-center text-primary', showAtMd ? '' : 'md:invisible')}>
      <ArrowDown className="size-6 md:hidden" />
      <ArrowRight className="hidden size-6 md:block" />
    </div>
  )
}

export function MoneyFlow() {
  const container = useRef<HTMLDivElement>(null)
  const income = useRef<HTMLDivElement>(null)
  const bills = useRef<HTMLDivElement>(null)
  const basics = useRef<HTMLDivElement>(null)
  const safe = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const ready = useMotionReady()

  const { resolvedTheme } = useTheme()
  const beam = resolvedTheme === 'light' ? FLOW_PATH.light : FLOW_PATH.dark

  return (
    <section id="how" aria-labelledby="flow-title" className="mx-auto max-w-6xl px-4 py-24 sm:py-32">
      <h2 id="flow-title" className="text-balance text-center font-display text-4xl font-bold tracking-tight sm:text-5xl">
        Your money, in one honest number
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-pretty text-center text-lg text-muted-foreground">
        Income comes in. Bills and basics are set aside first. What’s left is safe to spend — every day until payday.
      </p>
      {/* Illustrative figures, labelled as such so they are not read as the product shot's Safe-to-spend. */}
      <p className="mt-3 text-center font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">e.g. a ₹90,000 month</p>
      <div
        ref={container}
        className="relative mt-16 grid grid-cols-1 items-center gap-6 md:grid-cols-[1fr_5rem_1fr_5rem_1fr] md:gap-0"
      >
        <Node ref={income} label="Income" paise={9_000_000} hint="Lands on payday" />
        <Connector showAtMd={reduced} />
        <div className="flex flex-col gap-10">
          <Node ref={bills} label="Bills set aside" paise={2_350_000} hint="Rent, Netflix, Jio…" />
          <Node ref={basics} label="Basics" paise={800_000} hint="Groceries, transport" />
        </div>
        <Connector showAtMd={reduced} />
        <Node ref={safe} label="Safe to spend" paise={5_850_000} hint="Yours to enjoy" lime />
        {!reduced && ready && <FlowScroll container={container} />}
        {/* Client-only (after the motion preference and theme are known) so the theme-dependent colours never mismatch SSR. */}
        {!reduced && ready && (
          <>
            {[
              { to: bills, delay: 0, key: 'bills' },
              { to: basics, delay: 0.4, key: 'basics' },
              { to: safe, delay: 0.8, key: 'safe' },
            ].map(({ to, delay, key }) => (
              <AnimatedBeam
                key={key}
                containerRef={container}
                fromRef={income}
                toRef={to}
                delay={delay}
                pathColor={beam.path}
                pathOpacity={beam.pathOpacity}
                gradientStartColor={beam.start}
                gradientStopColor={beam.stop}
                className="hidden md:block"
              />
            ))}
          </>
        )}
      </div>
      <p className="mt-8 text-center text-sm text-muted-foreground">Illustrative numbers. Yours update as you log.</p>
    </section>
  )
}
