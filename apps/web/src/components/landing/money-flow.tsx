'use client'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowDown, ArrowRight } from 'lucide-react'
import { forwardRef, useRef } from 'react'
import { AmountTicker } from '@/components/fx/amount-ticker'
import { useMotionReady, useReducedMotion } from '@/components/providers/motion-pref'
import { AnimatedBeam } from '@/components/ui/animated-beam'
import { cn } from '@/lib/utils'

gsap.registerPlugin(ScrollTrigger)

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

  useGSAP(
    () => {
      // Wait for the OS preference so reduced-motion users never get the hidden start state.
      if (reduced || !ready) return
      gsap.from('.flow-node', {
        y: 40,
        opacity: 0,
        stagger: 0.15,
        ease: 'power3.out',
        scrollTrigger: { trigger: container.current, start: 'top 80%', end: 'top 50%', scrub: true },
      })
    },
    { scope: container, dependencies: [reduced, ready], revertOnUpdate: true },
  )

  return (
    <section id="how" aria-labelledby="flow-title" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-24 sm:py-32">
      <h2 id="flow-title" className="text-balance text-center font-display text-4xl font-bold tracking-tight sm:text-5xl">
        Your money, in one honest number
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-pretty text-center text-lg text-muted-foreground">
        Income comes in. Bills and basics are set aside first. What’s left is safe to spend — every day until payday.
      </p>
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
        {!reduced && (
          <>
            <AnimatedBeam containerRef={container} fromRef={income} toRef={bills} gradientStartColor="#C8F560" gradientStopColor="#7FD8C4" pathColor="#C8F560" pathOpacity={0.35} className="hidden md:block" />
            <AnimatedBeam containerRef={container} fromRef={income} toRef={basics} gradientStartColor="#C8F560" gradientStopColor="#7FD8C4" delay={0.4} pathColor="#C8F560" pathOpacity={0.35} className="hidden md:block" />
            <AnimatedBeam containerRef={container} fromRef={income} toRef={safe} gradientStartColor="#C8F560" gradientStopColor="#C8F560" delay={0.8} pathColor="#C8F560" pathOpacity={0.35} className="hidden md:block" />
          </>
        )}
      </div>
      <p className="mt-8 text-center text-sm text-muted-foreground">Illustrative numbers. Yours update as you log.</p>
    </section>
  )
}
