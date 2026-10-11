'use client'
import { AmountTicker } from '@/components/fx/amount-ticker'
import { Tile } from '@/components/fx/tile'
import { useTransactions } from '@/hooks/queries'
import type { TransactionDTO } from '@/lib/api-types'
import { todaySummary } from '@/lib/home-selectors'
import { TileHeading } from './tile-heading'

export function TodayTile({ today, initial }: { today: string; initial: TransactionDTO[] }) {
  const { data } = useTransactions({ from: today, to: today })
  const items = data?.pages.flatMap((p) => p.data) ?? initial
  const s = todaySummary(items, today)
  const lastName = s.last ? (s.last.note ?? s.last.category.name) : null
  return (
    <Tile aria-labelledby="today-title" className="h-full">
      <TileHeading id="today-title">Today</TileHeading>
      <AmountTicker paise={s.total} className="mt-2 block text-3xl font-bold" />
      <p className="mt-1 truncate text-sm text-muted-foreground">
        {s.count === 0 ? 'Nothing spent yet today' : `${s.count} spend${s.count > 1 ? 's' : ''} · last: ${lastName}`}
      </p>
    </Tile>
  )
}
