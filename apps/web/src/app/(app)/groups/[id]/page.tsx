import { notFound, redirect } from 'next/navigation'
import { GroupView, GROUP_TABS, type GroupTab } from '@/components/groups/group-view'
import type { GroupDetailDTO, GroupExpenseDTO, Page } from '@/lib/api-types'
import { uuid } from '@/lib/schemas/common'
import { requireCurrentUser } from '@/server/auth'
import { AppError } from '@/server/errors'
import { listGroupExpenses } from '@/server/services/groups/expenses'
import { getGroup } from '@/server/services/groups/groups'

export const metadata = { title: 'Group' }
const json = <T,>(v: unknown) => JSON.parse(JSON.stringify(v)) as T

export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params
  const { tab } = await searchParams
  if (!uuid.safeParse(id).success) notFound()
  const user = await requireCurrentUser().catch((err) => {
    if (err instanceof AppError && err.status === 401) redirect('/sign-in')
    throw err
  })
  // Non-members get the same 404 as a group that doesn't exist (spec §3.2).
  const detail = await getGroup(user.id, id).catch((err) => {
    if (err instanceof AppError && err.status === 404) notFound()
    throw err
  })
  const expenses = await listGroupExpenses(user.id, id, { limit: 50 })
  const initialTab: GroupTab = GROUP_TABS.includes(tab as GroupTab) ? (tab as GroupTab) : 'expenses'
  return <GroupView initial={json<GroupDetailDTO>(detail)} initialExpenses={json<Page<GroupExpenseDTO>>(expenses)} initialTab={initialTab} />
}
