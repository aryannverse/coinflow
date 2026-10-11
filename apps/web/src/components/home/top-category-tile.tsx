'use client'
import { Tile } from '@/components/fx/tile'
import { useInsights, useTransactions } from '@/hooks/queries'
import type { InsightsDTO, TransactionDTO } from '@/lib/api-types'
import { hasEnoughExpenses, topCategory } from '@/lib/home-selectors'
import { formatINR } from '@/lib/money'
import { TileHeading } from './tile-heading'

/**
 * Shared by the tile and the grid (which needs to know whether the tile is showing). Both read the same cache.
 * "Enabled" comes from client data (the recent-transactions cache), so the tile appears after the third
 * expense without a reload; it stays hidden until then because a "top" of one or two items is noise.
 */
export function useTopCategory(from: string, to: string, recentInitial: TransactionDTO[], insightsInitial?: InsightsDTO) {
  const { data: recent } = useTransactions({})
  const enabled = hasEnoughExpenses(recent?.pages.flatMap((p) => p.data) ?? recentInitial)
  const { data } = useInsights(from, to, insightsInitial, enabled)
  return topCategory(data, enabled)
}

export function TopCategoryTile({ from, to, recentInitial, initial }: { from: string; to: string; recentInitial: TransactionDTO[]; initial?: InsightsDTO }) {
  const view = useTopCategory(from, to, recentInitial, initial)
  if (!view) return null
  const { top, share } = view
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
