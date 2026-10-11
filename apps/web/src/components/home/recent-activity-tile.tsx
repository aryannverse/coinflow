'use client'
import Link from 'next/link'
import { useMotionReady, useReducedMotion } from '@/components/providers/motion-pref'
import { Tile } from '@/components/fx/tile'
import { AnimatedList } from '@/components/ui/animated-list'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'
import { Button } from '@/components/ui/button'
import { useTransactions } from '@/hooks/queries'
import type { TransactionDTO } from '@/lib/api-types'
import { formatINR } from '@/lib/money'
import { TileHeading } from './tile-heading'

const ROW = 'flex min-h-12 w-full items-center gap-3 rounded-chip px-2 hover:bg-surface-2'

function Row({ t }: { t: TransactionDTO }) {
  const expense = t.type === 'expense'
  return (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-chip bg-surface-2" aria-hidden>{t.category.emoji}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{t.note ?? t.category.name}</span>
      <span className={`amount shrink-0 text-sm ${expense ? '' : 'text-primary'}`}>
        {expense ? `−${formatINR(t.amount)}` : `+${formatINR(t.amount)}`}
      </span>
    </>
  )
}

export function RecentActivityTile({ initial }: { initial: TransactionDTO[] }) {
  const { data } = useTransactions({})
  const items = (data?.pages.flatMap((p) => p.data) ?? initial).slice(0, 5)
  const quick = useQuickAdd()
  const reduced = useReducedMotion()
  // Server render and first client render are the plain list (ready is false), so there is no hydration mismatch.
  const animate = useMotionReady() && !reduced
  return (
    <Tile aria-labelledby="recent-title" className="h-full">
      <div className="flex items-center justify-between">
        <TileHeading id="recent-title">Recent</TileHeading>
        <Link
          href="/activity"
          className="-mr-2 flex min-h-12 min-w-12 items-center justify-center rounded-chip px-2 text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/60 active:scale-[0.97]"
        >
          See all
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-muted-foreground">Add your first expense. It takes three taps.</p>
          <Button onClick={() => quick.open()} className="mt-3 min-h-12 active:scale-[0.97]">Log your first expense</Button>
        </div>
      ) : animate ? (
        // AnimatedList reveals its children in order and stacks each new one on top, so it gets oldest-first (R21).
        <AnimatedList delay={60} className="gap-1" role="list">
          {[...items].reverse().map((t) => (
            <div key={t.id} role="listitem" className={ROW}><Row t={t} /></div>
          ))}
        </AnimatedList>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((t) => (
            <li key={t.id} className={ROW}><Row t={t} /></li>
          ))}
        </ul>
      )}
    </Tile>
  )
}
