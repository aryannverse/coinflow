import { Reveal } from '@/components/fx/reveal'
import { PendingDraftsTile } from '@/components/home/pending-drafts-tile'
import { RecentActivityTile } from '@/components/home/recent-activity-tile'
import { SafeToSpendTile } from '@/components/home/safe-to-spend-tile'
import { TodayTile } from '@/components/home/today-tile'
import { TopCategoryTile } from '@/components/home/top-category-tile'
import { UpcomingBillsTile } from '@/components/home/upcoming-bills-tile'
import type { RecurringDTO, SafeToSpendDTO, TransactionDTO } from '@/lib/api-types'
import { toISTDate } from '@/lib/dates'
import { transactionListQuerySchema } from '@/lib/schemas/transactions'
import { requireCurrentUser } from '@/server/auth'
import { getInsights } from '@/server/services/insights'
import { listRecurring } from '@/server/services/recurring'
import { getSafeToSpend } from '@/server/services/safe-to-spend'
import { listTransactions } from '@/server/services/transactions'

export const metadata = { title: 'Home' }
/** Server values to client props: Dates become ISO strings, the same shape the API sends (`Serialized<T>`). */
const json = <T,>(v: unknown) => JSON.parse(JSON.stringify(v)) as T

export default async function HomePage() {
  const user = await requireCurrentUser()
  const today = toISTDate(new Date())
  // The (app) layout has already materialized due recurring drafts, so the draft list is current.
  const [sts, recurring, recent, drafts] = await Promise.all([
    getSafeToSpend(user.id),
    listRecurring(user.id),
    listTransactions(user.id, transactionListQuerySchema.parse({ limit: 20 })),
    listTransactions(user.id, transactionListQuerySchema.parse({ status: 'draft', limit: 50 })),
  ])
  const insights = await getInsights(user.id, sts.cycleStart, today)
  const expenseCount = recent.data.filter((t) => t.type === 'expense').length
  const recentDto = json<TransactionDTO[]>(recent.data)
  // [tile, grid placement]: placement lives on the Reveal wrapper because that is the grid child.
  // `empty:hidden` collapses the cell of a tile that renders nothing (no drafts, too few expenses).
  const tiles: [React.ReactNode, string][] = [
    [<TodayTile key="today" today={today} initial={recentDto} />, ''],
    [<UpcomingBillsTile key="bills" today={today} cycleEnd={sts.cycleEnd} initial={json<RecurringDTO[]>(recurring)} />, ''],
    [<TopCategoryTile key="top" from={sts.cycleStart} to={today} enabled={expenseCount >= 3} initial={insights} />, 'sm:col-span-2'],
    [<PendingDraftsTile key="drafts" initial={json<TransactionDTO[]>(drafts.data)} />, 'sm:col-span-2'],
    [<RecentActivityTile key="recent" initial={recentDto} />, 'sm:col-span-2'],
  ]
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <h1 className="sr-only">Home</h1>
      <Reveal className="sm:col-span-2 lg:row-span-2"><SafeToSpendTile initial={json<SafeToSpendDTO>(sts)} today={today} /></Reveal>
      {tiles.map(([tile, placement], i) => (
        <Reveal key={i} delay={0.04 * (i + 1)} className={`${placement} empty:hidden`.trim()}>{tile}</Reveal>
      ))}
    </div>
  )
}
