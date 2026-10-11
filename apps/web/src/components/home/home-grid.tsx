'use client'
import { Reveal } from '@/components/fx/reveal'
import { useDrafts } from '@/hooks/queries'
import type { InsightsDTO, RecurringDTO, SafeToSpendDTO, TransactionDTO } from '@/lib/api-types'
import { PendingDraftsTile } from './pending-drafts-tile'
import { RecentActivityTile } from './recent-activity-tile'
import { SafeToSpendTile } from './safe-to-spend-tile'
import { TodayTile } from './today-tile'
import { TopCategoryTile, useTopCategory } from './top-category-tile'
import { UpcomingBillsTile } from './upcoming-bills-tile'

type Props = {
  today: string
  sts: SafeToSpendDTO
  recent: TransactionDTO[]
  recurring: RecurringDTO[]
  drafts: TransactionDTO[]
  /** Absent when the server skipped it because Top category was not going to show. */
  insights?: InsightsDTO
}

/**
 * The bento grid. Placement lives on the Reveal wrappers because they are the grid children, and
 * `empty:hidden` collapses the cell of a tile that renders nothing. It is a client component because
 * the spans depend on which optional tiles are showing, and that changes as the user adds expenses.
 */
export function HomeGrid({ today, sts, recent, recurring, drafts, insights }: Props) {
  const topShown = useTopCategory(sts.cycleStart, today, recent, insights) !== null
  const draftsShown = (useDrafts(drafts).data ?? []).length > 0
  // Top (2 cols) and Waiting (2 cols) pair up beside the hero at lg. If exactly one shows, Recent takes the
  // full row beneath so there is no half-empty row; with both or neither, Recent sits in its 2-col slot.
  const recentSpan = topShown !== draftsShown ? 'lg:col-span-4' : 'lg:col-span-2'
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <h1 className="sr-only">Home</h1>
      {/* The hero is the LCP element: a plain cell, so the server HTML paints the real number before any JS runs. */}
      <div className="sm:col-span-2 lg:row-span-2"><SafeToSpendTile initial={sts} today={today} /></div>
      <Reveal delay={0.04}><TodayTile today={today} initial={recent} /></Reveal>
      <Reveal delay={0.08}><UpcomingBillsTile today={today} cycleEnd={sts.cycleEnd} initial={recurring} /></Reveal>
      <Reveal delay={0.12} className="sm:col-span-2 empty:hidden">
        <TopCategoryTile from={sts.cycleStart} to={today} recentInitial={recent} initial={insights} />
      </Reveal>
      <Reveal delay={0.16} className="sm:col-span-2 empty:hidden"><PendingDraftsTile initial={drafts} /></Reveal>
      <Reveal delay={0.2} className={`sm:col-span-2 ${recentSpan} empty:hidden`}><RecentActivityTile initial={recent} /></Reveal>
    </div>
  )
}
