'use client'
import Link from 'next/link'
import { Tile } from '@/components/fx/tile'
import { useRecurring } from '@/hooks/queries'
import type { RecurringDTO } from '@/lib/api-types'
import { formatISODate } from '@/lib/dates'
import { upcomingBills } from '@/lib/home-selectors'
import { formatINR } from '@/lib/money'
import { TileHeading } from './tile-heading'

export function UpcomingBillsTile({ today, cycleEnd, initial }: { today: string; cycleEnd: string; initial: RecurringDTO[] }) {
  const { data = initial } = useRecurring()
  const bills = upcomingBills(data, today, cycleEnd)
  return (
    <Tile aria-labelledby="bills-title" className="h-full">
      <div className="flex items-center justify-between">
        <TileHeading id="bills-title">Upcoming bills</TileHeading>
        {/* The main route to Recurring on mobile, so it is always here, not only when empty. */}
        <Link
          href="/recurring"
          className="-mr-2 flex min-h-12 min-w-12 items-center justify-center rounded-chip px-2 text-sm text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring active:scale-[0.97]"
        >
          Manage
        </Link>
      </div>
      {bills.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bills due before this cycle ends. Add rent, subscriptions or EMIs and Safe to spend will plan around them.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bills.map((b) => (
            <li key={`${b.id}-${b.dueOn}`} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                {b.name} <span className="text-muted-foreground">· {formatISODate(b.dueOn)}</span>
              </span>
              <span className="amount shrink-0">{formatINR(b.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  )
}
