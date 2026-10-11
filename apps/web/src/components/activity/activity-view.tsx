'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef } from 'react'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'
import { Button } from '@/components/ui/button'
import { ProgressiveBlur } from '@/components/ui/progressive-blur'
import { Skeleton } from '@/components/ui/skeleton'
import { useDeleteTransaction, useTransactions, type TxnFilters } from '@/hooks/queries'
import { hasFilters, parseFilters, serializeFilters } from '@/lib/activity-filters'
import type { TransactionDTO } from '@/lib/api-types'
import { toISTDate } from '@/lib/dates'
import { dayLabel, groupByDay } from '@/lib/group-by-day'
import { formatINR } from '@/lib/money'
import { FiltersBar } from './filters-bar'
import { TransactionRow } from './transaction-row'

const RING = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60'

export function ActivityView() {
  const params = useSearchParams()
  const router = useRouter()
  const path = usePathname()
  const quick = useQuickAdd()
  const del = useDeleteTransaction()

  // The URL is the only copy of the filters: no mirrored state, so nothing to sync back.
  const search = params.toString()
  const filters = useMemo(() => parseFilters(new URLSearchParams(search)), [search])
  const latest = useRef(filters)
  useEffect(() => { latest.current = filters }, [filters])

  const write = (next: TxnFilters) => {
    const qs = serializeFilters(next)
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false })
  }
  // Patches apply to the newest filters, not the ones captured when a debounced search was typed.
  const update = (patch: Partial<TxnFilters>) => {
    latest.current = { ...latest.current, ...patch }
    write(latest.current)
  }
  const clear = () => {
    latest.current = {}
    write({})
  }

  const q = useTransactions(filters)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data])
  const groups = useMemo(() => groupByDay(items), [items])
  const today = toISTDate(new Date())
  const filtered = hasFilters(filters)

  // Infinite scroll. "Load more" below is the keyboard fallback for the same fetch.
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage || isFetchingNextPage) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) void fetchNextPage() }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // After a delete, focus must not fall to <body>: it goes to the next row, else the previous one, else the heading.
  const heading = useRef<HTMLHeadingElement>(null)
  const afterDelete = useRef<{ removed: string; next?: string } | null>(null)
  useEffect(() => {
    const pending = afterDelete.current
    if (!pending || items.some((i) => i.id === pending.removed)) return
    afterDelete.current = null
    const target = pending.next ? document.querySelector<HTMLElement>(`[data-row-id="${pending.next}"] [data-row-main]`) : null
    ;(target ?? heading.current)?.focus()
  }, [items])

  const onDelete = (t: TransactionDTO) => {
    const i = items.findIndex((x) => x.id === t.id)
    afterDelete.current = { removed: t.id, next: (items[i + 1] ?? items[i - 1])?.id }
    // The hook removes the row at once and raises the undo toast; a refused delete just clears the pending focus.
    del.mutate({ id: t.id, amount: t.amount }, { onSettled: () => { afterDelete.current = null } })
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 ref={heading} tabIndex={-1} className="font-display text-3xl font-bold outline-none">Activity</h1>
      <FiltersBar value={filters} onChange={update} onClear={clear} />

      {q.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <p role="status" className="sr-only">Loading activity</p>
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14 rounded-chip" />)}
        </div>
      ) : q.isError ? (
        <div className="rounded-tile border bg-card p-8 text-center" role="alert">
          <p className="text-muted-foreground">Couldn’t load your transactions.</p>
          <Button onClick={() => void q.refetch()} className="mt-3 min-h-12 active:scale-[0.97]">Try again</Button>
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-tile border bg-card p-8 text-center">
          {filtered ? (
            <>
              <p className="text-muted-foreground">No transactions match these filters.</p>
              <Button variant="outline" onClick={clear} className="mt-3 min-h-12 active:scale-[0.97]">Clear filters</Button>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">Nothing logged yet. It takes three taps.</p>
              <Button onClick={() => quick.open()} className="mt-3 min-h-12 active:scale-[0.97]">Log your first expense</Button>
            </>
          )}
        </div>
      ) : (
        <div className="relative">
          {groups.map((g) => (
            <div key={g.date} className="mb-4">
              <h2 id={`d-${g.date}`} className="sticky top-16 z-10 flex justify-between bg-background/90 py-2 text-sm backdrop-blur">
                <span className="font-medium">{dayLabel(g.date, today)}</span>
                {g.expenseTotal > 0 && (
                  <span className="amount text-muted-foreground">
                    −{formatINR(g.expenseTotal)}<span className="sr-only"> spent</span>
                  </span>
                )}
              </h2>
              <ul aria-labelledby={`d-${g.date}`} className="flex flex-col gap-1">
                {g.items.map((t) => <TransactionRow key={t.id} t={t} onDelete={onDelete} />)}
              </ul>
            </div>
          ))}
          {hasNextPage && <div ref={sentinel} className="h-px" aria-hidden />}
          <div className="flex justify-center py-2">
            {hasNextPage && (
              <Button variant="outline" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage} className={`min-h-12 min-w-12 px-4 active:scale-[0.97] ${RING}`}>
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            )}
          </div>
          <p role="status" className="sr-only">{isFetchingNextPage ? 'Loading more transactions' : ''}</p>
          <ProgressiveBlur position="bottom" height="15%" className="pointer-events-none fixed inset-x-0 bottom-0 lg:hidden" />
        </div>
      )}
    </div>
  )
}
