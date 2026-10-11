import { redirect } from 'next/navigation'
import { RecurringView } from '@/components/recurring/recurring-view'
import type { RecurringDTO } from '@/lib/api-types'
import { toISTDate } from '@/lib/dates'
import { requireCurrentUser } from '@/server/auth'
import { AppError } from '@/server/errors'
import { logger } from '@/server/logger'
import { listRecurring, materializeDueRecurring } from '@/server/services/recurring'

export const metadata = { title: 'Recurring' }
/** Server values to client props: Dates become ISO strings, the same shape the API sends (`Serialized<T>`). */
const json = <T,>(v: unknown) => JSON.parse(JSON.stringify(v)) as T

export default async function RecurringPage() {
  const user = await requireCurrentUser().catch((err) => {
    if (err instanceof AppError && err.status === 401) redirect('/sign-in')
    throw err
  })
  const today = toISTDate(new Date())
  // Materialize first (idempotent, row-locked) so next-due dates are current before they are read.
  try {
    await materializeDueRecurring(user.id, today)
  } catch (err) {
    logger.error({ err, userId: user.id }, 'materializeDueRecurring failed in recurring page')
  }
  const recurring = await listRecurring(user.id)
  return <RecurringView initial={json<RecurringDTO[]>(recurring)} today={today} />
}
