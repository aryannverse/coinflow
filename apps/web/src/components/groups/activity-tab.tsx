'use client'
import { HandCoins, Info, Receipt, Undo2, UserPlus } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useGroupActivity } from '@/hooks/group-queries'
import type { GroupDetailDTO } from '@/lib/api-types'

function KindIcon({ kind, className }: { kind: string; className?: string }) {
  if (kind.startsWith('expense_')) return <Receipt className={className} aria-hidden />
  if (kind.startsWith('settlement_')) return <HandCoins className={className} aria-hidden />
  if (kind.startsWith('member_')) return <UserPlus className={className} aria-hidden />
  if (kind === 'undo') return <Undo2 className={className} aria-hidden />
  return <Info className={className} aria-hidden />
}

/** Same wording as the bell: "5 min ago", "3 h ago", else "12 Oct". */
export function ago(iso: string, now = Date.now()): string {
  const mins = Math.round((now - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  return hrs < 24 ? `${hrs} h ago` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
}

/** Spec §3.5 Activity tab: the group feed, newest first. */
export function ActivityTab({ group }: { group: GroupDetailDTO }) {
  const q = useGroupActivity(group.id)
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data])

  if (q.isPending) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <p role="status" className="sr-only">Loading activity</p>
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 rounded-chip" />)}
      </div>
    )
  }
  if (q.isError && !q.data) {
    return (
      <div role="alert" className="rounded-tile border bg-card p-5">
        <p className="text-muted-foreground">Couldn’t load activity.</p>
        <Button variant="outline" className="mt-3 min-h-12 rounded-chip" onClick={() => void q.refetch()}>Try again</Button>
      </div>
    )
  }

  return (
    <section aria-labelledby="activity-h" className="flex flex-col gap-3">
      <h2 id="activity-h" className="sr-only">Group activity</h2>
      {items.length === 0 ? (
        <p className="rounded-tile border bg-card p-5 text-muted-foreground">Nothing here yet.</p>
      ) : (
        <ol aria-label="Group activity" className="relative flex flex-col rounded-tile border bg-card p-2">
          {items.map((a) => (
            <li key={a.id} className="flex min-h-14 items-start gap-3 border-b px-2 py-3 last:border-b-0">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-primary">
                <KindIcon kind={a.kind} className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm">{a.summary}</span>
                <time dateTime={a.createdAt} className="text-xs text-muted-foreground">{ago(a.createdAt)}</time>
              </span>
            </li>
          ))}
        </ol>
      )}
      {q.hasNextPage && (
        <Button variant="outline" aria-disabled={q.isFetchingNextPage || undefined}
          onClick={() => { if (!q.isFetchingNextPage) void q.fetchNextPage() }}
          className="min-h-12 self-center rounded-chip px-4 active:scale-[0.97] aria-disabled:opacity-50">
          {q.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </section>
  )
}
