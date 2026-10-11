import { redirect } from 'next/navigation'
import { HomeGrid } from '@/components/home/home-grid'
import type { InsightsDTO, RecurringDTO, SafeToSpendDTO, TransactionDTO } from '@/lib/api-types'
import { toISTDate } from '@/lib/dates'
import { hasEnoughExpenses } from '@/lib/home-selectors'
import { transactionListQuerySchema } from '@/lib/schemas/transactions'
import { requireCurrentUser } from '@/server/auth'
import { AppError } from '@/server/errors'
import { logger } from '@/server/logger'
import { getInsights } from '@/server/services/insights'
import { listRecurring, materializeDueRecurring } from '@/server/services/recurring'
import { getSafeToSpend } from '@/server/services/safe-to-spend'
import { listTransactions } from '@/server/services/transactions'

export const metadata = { title: 'Home' }
/** Server values to client props: Dates become ISO strings, the same shape the API sends (`Serialized<T>`). */
const json = <T,>(v: unknown) => JSON.parse(JSON.stringify(v)) as T

export default async function HomePage() {
  const user = await requireCurrentUser().catch((err) => {
    if (err instanceof AppError && err.status === 401) redirect('/sign-in')
    throw err
  })
  const today = toISTDate(new Date())
  // The layout and this page render concurrently, so the layout's materialize call does not order before these
  // reads. Do it here first (idempotent and row-locked) so a first visit of the day never pins stale drafts or
  // Safe to spend as fresh initial data.
  try {
    await materializeDueRecurring(user.id, today)
  } catch (err) {
    logger.error({ err, userId: user.id }, 'materializeDueRecurring failed in home page')
  }
  const [sts, recurring, recent, drafts] = await Promise.all([
    getSafeToSpend(user.id),
    listRecurring(user.id),
    listTransactions(user.id, transactionListQuerySchema.parse({ limit: 20 })),
    listTransactions(user.id, transactionListQuerySchema.parse({ status: 'draft', limit: 50 })),
  ])
  const recentDto = json<TransactionDTO[]>(recent.data)
  // Top category only shows from the third expense, so skip its query until then; the client fetches it once it qualifies.
  const insights = hasEnoughExpenses(recentDto) ? await getInsights(user.id, sts.cycleStart, today) : undefined
  return (
    <HomeGrid
      today={today}
      sts={json<SafeToSpendDTO>(sts)}
      recent={recentDto}
      recurring={json<RecurringDTO[]>(recurring)}
      drafts={json<TransactionDTO[]>(drafts.data)}
      insights={insights as InsightsDTO | undefined}
    />
  )
}
