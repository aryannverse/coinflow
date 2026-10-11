'use client'
import { Tile } from '@/components/fx/tile'
import { useInsights } from '@/hooks/queries'
import type { InsightsDTO } from '@/lib/api-types'
import { formatINR } from '@/lib/money'
import { TileHeading } from './tile-heading'

/** Hidden until the user has 3+ expenses (spec §4.5): a "top" of one or two items is noise. */
export function TopCategoryTile({ from, to, enabled, initial }: { from: string; to: string; enabled: boolean; initial?: InsightsDTO }) {
  const { data } = useInsights(from, to, initial)
  const top = data?.byCategory[0]
  if (!enabled || !data || !top || data.totalExpense === 0) return null
  const share = Math.round((top.amount / data.totalExpense) * 100)
  return (
    <Tile aria-labelledby="top-title" className="h-full">
      <TileHeading id="top-title">Top category · this cycle</TileHeading>
      <p className="mt-2 text-lg"><span aria-hidden>{top.emoji}</span> {top.name}</p>
      <p className="amount text-2xl font-bold">{formatINR(top.amount)}</p>
      <div className="mt-3 h-2 rounded-full bg-surface-2" role="img" aria-label={`${share}% of this cycle’s spending`}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{share}% of spending</p>
    </Tile>
  )
}
