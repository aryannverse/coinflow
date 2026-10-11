'use client'
import { ArrowRight, CalendarCheck, Command, LineChart, Undo2, Users } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { Reveal } from '@/components/fx/reveal'
import { useReducedMotion } from '@/components/providers/motion-pref'
import { MagicCard } from '@/components/ui/magic-card'

const CHIP = 'rounded-chip border bg-surface-2 px-3 py-2'

// Illustrative sketches of each feature. Decorative (aria-hidden); the copy beside them carries the meaning.
const V_LOG = (
  <div aria-hidden className="mt-6 flex flex-wrap items-center gap-3 font-mono text-sm">
    <span className={CHIP}>250 food lunch</span>
    <ArrowRight className="size-4 text-muted-foreground" />
    <span className="rounded-chip bg-lime px-3 py-2 font-sans font-semibold text-[#0F1210]">🍜 Food · ₹250</span>
  </div>
)
const V_UNDO = (
  <div aria-hidden className="mt-6 inline-flex items-center gap-3 rounded-full border bg-surface-2 py-2 pl-4 pr-3 text-sm">
    <span>Expense added</span>
    <span className="font-semibold text-primary">Undo</span>
    <span className="grid size-7 place-items-center rounded-full border-2 border-primary font-mono text-xs text-muted-foreground">9</span>
  </div>
)
const V_BILL = (
  <div aria-hidden className="mt-6 flex items-center justify-between gap-3 rounded-chip border bg-surface-2 py-2 pl-3 pr-2 text-sm">
    <span>Netflix · ₹649</span>
    <span className="rounded-chip bg-lime px-3 py-1.5 font-semibold text-[#0F1210]">Confirm</span>
  </div>
)
const V_INSIGHTS = (
  <div aria-hidden className="mt-6 flex max-w-md flex-col gap-3 text-sm">
    {[
      ['Food', 'w-[78%]', 'bg-primary', '12% over plan'],
      ['Groceries', 'w-[52%]', 'bg-chart-2', ''],
      ['Transport', 'w-[30%]', 'bg-chart-3', ''],
    ].map(([name, w, bg, note]) => (
      <div key={name} className="flex items-center gap-3">
        <span className="w-24 shrink-0 text-muted-foreground">{name}</span>
        <span className="h-2 flex-1 rounded-full bg-surface-2">
          <span className={`block h-full rounded-full ${w} ${bg}`} />
        </span>
        <span className="w-24 shrink-0 text-xs text-neutral-negative">{note}</span>
      </div>
    ))}
  </div>
)

const FEATURES: { title: string; body: string; span: string; Icon: ComponentType<{ className?: string }>; soon?: boolean; visual?: ReactNode }[] = [
  { title: 'Three-tap logging', body: 'Amount, category, done. Or type “250 food lunch” anywhere with ⌘K.', span: 'md:col-span-2', Icon: Command, visual: V_LOG },
  { title: 'Undo everything', body: 'Every change has a 10-second undo. Mistakes cost nothing.', span: '', Icon: Undo2, visual: V_UNDO },
  { title: 'Bills you confirm', body: 'Rent and subscriptions show up as drafts — nothing counts until you say so.', span: '', Icon: CalendarCheck, visual: V_BILL },
  { title: 'Calm insights', body: 'Soft plans per category. Going over is information, not a red alarm.', span: 'md:col-span-2', Icon: LineChart, visual: V_INSIGHTS },
  { title: 'Coming next: split with friends', body: 'Trips and dinners, itemised receipts, and the fewest payments to settle — with reasons.', span: 'md:col-span-3', Icon: Users, soon: true },
]

function TileBody({ title, body, Icon, soon, visual }: (typeof FEATURES)[number]) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span aria-hidden className="grid size-11 place-items-center rounded-chip border bg-surface-2 text-primary">
          <Icon className="size-5" />
        </span>
        {soon ? (
          <span className="rounded-chip border bg-surface-2 px-2.5 py-1 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">Soon</span>
        ) : null}
      </div>
      <h3 className="mt-5 font-display text-2xl font-bold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-prose text-pretty text-muted-foreground">{body}</p>
      {visual}
    </>
  )
}

export function FeatureBento() {
  const reduced = useReducedMotion()
  return (
    <section aria-labelledby="features-title" className="mx-auto max-w-6xl px-4 py-24">
      <h2 id="features-title" className="text-balance font-display text-4xl font-bold tracking-tight sm:text-5xl">
        Built for how you actually spend
      </h2>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={0.05 * i} className={f.span}>
            {reduced ? (
              <div className="h-full rounded-tile border bg-card p-6 sm:p-7">
                <TileBody {...f} />
              </div>
            ) : (
              <MagicCard
                // MagicCard paints --color-background inside the rim; point it at the card surface, and the rim at the brand.
                className="h-full rounded-tile p-6 [--background:var(--card)] [--color-background:var(--card)] [--color-border:var(--border)] sm:p-7"
                gradientColor="color-mix(in srgb, var(--primary) 14%, transparent)"
                gradientFrom="var(--primary)"
                gradientTo="var(--chart-2)"
              >
                <TileBody {...f} />
              </MagicCard>
            )}
          </Reveal>
        ))}
      </div>
    </section>
  )
}
