'use client'
import { ChevronLeft, Link2, Plus } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useGroup } from '@/hooks/group-queries'
import type { GroupDetailDTO, GroupExpenseDTO, Page } from '@/lib/api-types'
import { dateRange, positionCopy } from '@/lib/group-display'
import { cn } from '@/lib/utils'
import { ActivityTab } from './activity-tab'
import { BalancesTab } from './balances-tab'
import { ExpensesTab } from './expenses-tab'
import { useGroupSheets } from './group-sheets'
import { MemberAvatar } from './member-avatar'
import { MembersTab } from './members-tab'

export const GROUP_TABS = ['expenses', 'balances', 'activity', 'members'] as const
export type GroupTab = (typeof GROUP_TABS)[number]
const LABEL: Record<GroupTab, string> = { expenses: 'Expenses', balances: 'Balances', activity: 'Activity', members: 'Members' }
const TONE = { owed: 'text-primary', owe: 'text-neutral-negative', settled: 'text-muted-foreground' } as const
const STACK = 5

/** Spec §3.5 /groups/[id]: header (avatars, your position, Invite, Add expense) and four tabs kept in the URL. */
export function GroupView({ initial, initialExpenses, initialTab }: { initial: GroupDetailDTO; initialExpenses: Page<GroupExpenseDTO>; initialTab: GroupTab }) {
  const { data: group = initial } = useGroup(initial.id, initial)
  const sheets = useGroupSheets()
  // The URL is the only copy of the tab: a same-group navigation to another ?tab= (a bell link to Balances, or
  // `?tab=expenses#expense-…`) switches it, and so does Back. `initialTab` covers the server render.
  const params = useSearchParams()
  const tab: GroupTab = GROUP_TABS.find((t) => t === params.get('tab')) ?? initialTab
  const active = group.members.filter((m) => !m.removedAt)
  const waiting = active.filter((m) => !m.claimed).length
  const range = dateRange(group.startsOn, group.endsOn)
  const pos = positionCopy(group.myPositionPaise)

  function changeTab(v: string) {
    const next = GROUP_TABS.find((t) => t === v)
    if (!next) return
    // The URL holds the tab (shareable, survives reload, `tab` above derives from it) with no server round-trip: Next
    // syncs a native history.replaceState into useSearchParams, whereas router.replace would re-render the whole server
    // page per tab. State must be null: Next skips the sync for its own (`__NA`) history entries.
    window.history.replaceState(null, '', `?tab=${next}`)
  }

  function invite() {
    changeTab('members')
    // The tab follows the URL, which the router applies in a transition: wait (a few frames at most) for the field.
    const focusLink = (tries: number) => {
      const el = document.getElementById('invite-link')
      if (el) el.focus()
      else if (tries > 0) requestAnimationFrame(() => focusLink(tries - 1))
    }
    requestAnimationFrame(() => focusLink(30))
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href="/groups" className="-ml-2 inline-flex min-h-12 w-fit items-center gap-1 rounded-chip px-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring">
        <ChevronLeft className="size-4" aria-hidden /> Groups
      </Link>

      <header className="flex flex-col gap-4 rounded-tile border bg-card p-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-3xl font-bold break-words"><span aria-hidden>{group.emoji}</span> {group.name}</h1>
          {(range || group.archivedAt) && (
            <p className="text-sm text-muted-foreground">
              {group.kind === 'event' && range ? `Event · ${range}` : range}
              {group.archivedAt && <span className="ml-2 rounded-full border px-2 py-0.5 text-xs">Archived</span>}
            </p>
          )}
          <div className="flex items-center gap-3">
            <div aria-hidden className="flex -space-x-2">
              {active.slice(0, STACK).map((m) => (
                <MemberAvatar key={m.id} name={m.displayName} claimed={m.claimed} size={36} className={cn('ring-2 ring-card', m.claimed ? '' : 'bg-card')} />
              ))}
              {active.length > STACK && (
                <span className="grid size-9 place-items-center rounded-full bg-surface-2 font-mono text-xs ring-2 ring-card">+{active.length - STACK}</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {active.length} {active.length === 1 ? 'member' : 'members'}
              {waiting > 0 && <>, {waiting} {waiting === 1 ? 'hasn’t' : 'haven’t'} joined yet</>}
            </p>
          </div>
          <p className={cn('font-display text-2xl font-semibold', TONE[pos.tone])}>{pos.text}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => sheets.openExpense({ groupId: group.id })} className="min-h-12 flex-1 gap-2 rounded-chip px-5 active:scale-[0.97] lg:flex-none">
            <Plus className="size-4" aria-hidden /> Add expense
          </Button>
          <Button variant="outline" onClick={invite} className="min-h-12 flex-1 gap-2 rounded-chip px-5 active:scale-[0.97] lg:flex-none">
            <Link2 className="size-4" aria-hidden /> Invite
          </Button>
        </div>
      </header>

      <Tabs value={tab} onValueChange={changeTab} className="gap-4">
        {/* At 320 px the tab row scrolls inside itself; the page never scrolls sideways. */}
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList aria-label="Group sections" className="h-auto! w-max min-w-full justify-start gap-1 rounded-chip bg-surface-2 p-1">
            {GROUP_TABS.map((t) => (
              <TabsTrigger key={t} value={t} className="min-h-12 flex-1 rounded-[10px] px-3 text-sm data-active:shadow-sm sm:px-4">
                {LABEL[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="expenses"><ExpensesTab group={group} initial={initialExpenses} /></TabsContent>
        <TabsContent value="balances"><BalancesTab group={group} /></TabsContent>
        <TabsContent value="activity"><ActivityTab group={group} /></TabsContent>
        <TabsContent value="members"><MembersTab group={group} /></TabsContent>
      </Tabs>
    </div>
  )
}
