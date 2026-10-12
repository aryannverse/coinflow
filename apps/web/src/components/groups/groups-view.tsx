'use client'
import { ChevronRight, Plus, UsersRound } from 'lucide-react'
import Link from 'next/link'
import { Reveal } from '@/components/fx/reveal'
import { Tile } from '@/components/fx/tile'
import { Button, buttonVariants } from '@/components/ui/button'
import { useFriends, useGroups } from '@/hooks/group-queries'
import type { GroupSummaryDTO } from '@/lib/api-types'
import { dateRange, positionCopy } from '@/lib/group-display'
import { cn } from '@/lib/utils'
import { useGroupSheets } from './group-sheets'

const TONE = { owed: 'text-primary', owe: 'text-neutral-negative', settled: 'text-muted-foreground' } as const
const RING = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring'

function GroupCard({ g }: { g: GroupSummaryDTO }) {
  const range = dateRange(g.startsOn, g.endsOn)
  const pos = positionCopy(g.myPositionPaise)
  return (
    <Link
      href={`/groups/${g.id}`}
      className={cn(
        'group/card flex min-h-24 items-center gap-4 rounded-tile border bg-card p-4 transition-colors hover:border-primary/50 active:scale-[0.99]',
        RING,
      )}
    >
      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-chip text-2xl" style={{ background: `color-mix(in srgb, ${g.color} 22%, transparent)` }}>
        {g.emoji}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{g.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {g.kind === 'event' ? `Event${range ? ` · ${range}` : ''}` : 'Group'} · {g.memberCount} {g.memberCount === 1 ? 'person' : 'people'}
        </span>
        <span className={cn('text-sm font-medium', TONE[pos.tone])}>{pos.text}</span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-hover/card:translate-x-0.5" />
    </Link>
  )
}

/** Spec §3.5 /groups: one card per group or event with your position in words (the words carry it, not the colour). */
export function GroupsView({ initial }: { initial: GroupSummaryDTO[] }) {
  const { data: groups = initial } = useGroups(initial)
  const sheets = useGroupSheets()
  const requests = useFriends().data?.incoming.length ?? 0
  const newGroup = (
    <Button onClick={() => sheets.openNewGroup()} className="min-h-12 gap-2 rounded-chip px-4 active:scale-[0.97]">
      <Plus className="size-4" aria-hidden /> New group or event
    </Button>
  )
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold">Groups & events</h1>
          <p className="text-sm text-muted-foreground">Split trips, flats and dinners. Your share lands in your own Activity.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/friends"
            aria-label={requests ? `Friends, ${requests} request${requests === 1 ? '' : 's'}` : undefined}
            className={cn(buttonVariants({ variant: 'outline' }), 'min-h-12 gap-2 rounded-chip px-4 active:scale-[0.97]')}
          >
            <UsersRound className="size-4" aria-hidden /> Friends
            {requests > 0 && (
              <span aria-hidden className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 font-mono text-[11px] font-semibold text-primary-foreground">
                {requests > 9 ? '9+' : requests}
              </span>
            )}
          </Link>
          {groups.length > 0 && newGroup}
        </div>
      </div>

      {groups.length === 0 ? (
        <Tile className="flex flex-col items-start gap-3">
          <span aria-hidden className="grid size-14 place-items-center rounded-tile bg-primary/15 text-3xl">🧳</span>
          <h2 className="font-display text-xl font-bold">No groups yet.</h2>
          <p className="text-muted-foreground">Start one for a trip, a flat or a dinner. Add people by name now; they join with a link later.</p>
          {newGroup}
        </Tile>
      ) : (
        <Reveal>
          <ul aria-label="Your groups and events" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <li key={g.id}><GroupCard g={g} /></li>
            ))}
          </ul>
        </Reveal>
      )}
    </div>
  )
}
