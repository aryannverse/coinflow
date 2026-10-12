import { redirect } from 'next/navigation'
import { GroupsView } from '@/components/groups/groups-view'
import type { GroupSummaryDTO } from '@/lib/api-types'
import { requireCurrentUser } from '@/server/auth'
import { AppError } from '@/server/errors'
import { listGroups } from '@/server/services/groups/groups'

export const metadata = { title: 'Groups' }
const json = <T,>(v: unknown) => JSON.parse(JSON.stringify(v)) as T

export default async function GroupsPage() {
  const user = await requireCurrentUser().catch((err) => {
    if (err instanceof AppError && err.status === 401) redirect('/sign-in')
    throw err
  })
  return <GroupsView initial={json<GroupSummaryDTO[]>(await listGroups(user.id))} />
}
