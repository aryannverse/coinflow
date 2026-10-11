'use client'
import Link from 'next/link'
import { AmountTicker } from '@/components/fx/amount-ticker'
import { Button } from '@/components/ui/button'
import { useSafeToSpend } from '@/hooks/queries'
import type { SafeToSpendDTO } from '@/lib/api-types'
import { cycleDots } from '@/lib/cycle-dots'
import { formatISODate } from '@/lib/dates'
import { stsDisplay } from '@/lib/sts-display'
import { cn } from '@/lib/utils'
import { CheckinDialog } from './checkin-dialog'
import { TileHeading } from './tile-heading'

const ON_LIME = 'bg-[#0F1210] text-[#F1F5F2] hover:bg-[#0F1210]/90'
const RING_ON_LIME = 'focus-visible:ring-[3px] focus-visible:ring-[#0F1210]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#C8F560]'

export function SafeToSpendTile({ initial, today }: { initial: SafeToSpendDTO; today: string }) {
  const { data = initial } = useSafeToSpend(initial)
  const view = stsDisplay(data)
  const dots = cycleDots(data.cycleStart, data.cycleEnd, today)
  const todayIndex = dots.indexOf('today')
  const dayNumber = Math.min(dots.length, todayIndex >= 0 ? todayIndex + 1 : dots.filter((d) => d === 'past').length + 1)
  return (
    <section aria-labelledby="sts-title" className="relative flex h-full flex-col overflow-hidden rounded-tile bg-lime p-6 text-[#0F1210]">
      <TileHeading id="sts-title" className="text-[#0F1210]/75">Safe to spend</TileHeading>
      {view.headline === null ? (
        <div className="mt-3">
          <p className="font-display text-2xl font-bold">{view.line}</p>
          <CheckinDialog trigger={<Button className={cn('mt-4 min-h-12 active:scale-[0.97]', ON_LIME, RING_ON_LIME)}>Check in balance</Button>} />
        </div>
      ) : (
        <>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-3">
            <AmountTicker paise={view.headline} from="value" className="block text-4xl font-bold min-[360px]:text-5xl sm:text-6xl lg:text-7xl" />
            {view.suffix && <span className="font-display text-xl font-medium">{view.suffix}</span>}
          </p>
          <p className={cn('mt-2 text-sm', view.tone === 'neutral-negative' ? 'font-medium' : 'text-[#0F1210]/80')}>{view.line}</p>
          {view.tone === 'neutral-negative' && (
            <Link
              href="/recurring"
              className={cn('mt-1 -ml-2 inline-flex min-h-12 min-w-12 items-center self-start rounded-chip px-2 text-sm font-medium underline underline-offset-4 outline-none active:scale-[0.97]', RING_ON_LIME)}
            >
              See what’s committed
            </Link>
          )}
        </>
      )}
      <div className="mt-auto pt-6">
        <div role="img" aria-label={`Day ${dayNumber} of ${dots.length} in this pay cycle`} className="flex gap-[3px]">
          {dots.map((d, i) => (
            <span
              key={i}
              className={cn(
                'h-6 flex-1 rounded-[5px] bg-[#0F1210]',
                d === 'future' && 'opacity-15',
                d === 'today' && 'ring-2 ring-[#0F1210] ring-offset-2 ring-offset-[#C8F560]',
              )}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3">
          <p className="font-mono text-xs text-[#0F1210]/75">Pay cycle ends {formatISODate(data.cycleEnd)}</p>
          {view.headline !== null && (
            <CheckinDialog
              trigger={
                <Button variant="ghost" className={cn('-mr-3 min-h-12 px-3 text-[#0F1210] underline underline-offset-4 hover:bg-[#0F1210]/10 active:scale-[0.97]', RING_ON_LIME)}>
                  Update balance
                </Button>
              }
            />
          )}
        </div>
      </div>
    </section>
  )
}
