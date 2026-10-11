'use client'
import { Pause, Pencil, Play, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Reveal } from '@/components/fx/reveal'
import { Tile } from '@/components/fx/tile'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useDeleteRecurring, useRecurring, useUpdateRecurring } from '@/hooks/queries'
import { useMediaQuery } from '@/hooks/use-media-query'
import type { RecurringDTO } from '@/lib/api-types'
import { formatISODate, toISTDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { BILL_SUGGESTIONS, RecurringForm } from './recurring-form'

type Suggestion = (typeof BILL_SUGGESTIONS)[number]
type Target = { kind: 'new' } | { kind: 'edit'; item: RecurringDTO } | { kind: 'suggestion'; suggestion: Suggestion }

const SECTIONS = [
  ['bill', 'Bills', 'No bills yet. Tap a suggestion above, or use Add.'],
  ['income', 'Income', 'No recurring income yet. Add a salary or allowance and it shows up here.'],
] as const
const CADENCE = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' } as const
const RING = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring'
const ACTION = `inline-flex min-h-12 min-w-12 items-center justify-center gap-1.5 rounded-chip px-3 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-[0.97] aria-disabled:opacity-50 ${RING}`

const useIsDesktop = () => useMediaQuery('(min-width: 1024px)') ?? false

function dueLabel(r: RecurringDTO, thisYear: string) {
  // The year only matters when the date is not in this year (a yearly bill, say).
  return formatISODate(r.nextDueOn, { day: 'numeric', month: 'short', ...(r.nextDueOn.slice(0, 4) === thisYear ? {} : { year: 'numeric' }) })
}

function RecurringRow({ r, thisYear, busy, deleting, onEdit, onToggle, onDelete }: {
  r: RecurringDTO; thisYear: string; busy: boolean; deleting: boolean
  onEdit: (r: RecurringDTO) => void; onToggle: (r: RecurringDTO) => void; onDelete: (r: RecurringDTO) => void
}) {
  return (
    <li data-row-id={r.id} className="flex flex-col gap-1 border-b py-3 last:border-0 sm:flex-row sm:items-center sm:gap-2">
      {/* No dimming for paused rows: the "Paused" badge and copy carry the state, and opacity broke text contrast. */}
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-2 font-medium">
            <span className="break-words">{r.name}</span>
            {!r.active && <span className="rounded-chip border bg-surface-2 px-2 py-0.5 text-xs font-normal">Paused</span>}
          </span>
          <span className="text-sm text-muted-foreground">
            {CADENCE[r.cadence]}
            {r.active ? ` · Next due ${dueLabel(r, thisYear)}` : ' · No new entries while paused'}
          </span>
        </div>
        <span className="amount shrink-0">{formatINR(r.amount)}</span>
      </div>
      <div className="-ml-3 flex items-center sm:ml-0">
        <button type="button" aria-label={`Edit ${r.name}`} onClick={() => onEdit(r)} className={ACTION}>
          <Pencil className="size-4" aria-hidden /> Edit
        </button>
        <button
          type="button" aria-label={r.active ? `Pause ${r.name}` : `Resume ${r.name}`} aria-disabled={busy || undefined}
          onClick={() => { if (!busy) onToggle(r) }} className={ACTION}
        >
          {r.active ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />} {r.active ? 'Pause' : 'Resume'}
        </button>
        <button
          type="button" aria-label={`Delete ${r.name}`} aria-disabled={deleting || undefined}
          onClick={() => { if (!deleting) onDelete(r) }} className={ACTION}
        >
          <Trash2 className="size-4" aria-hidden /> Delete
        </button>
      </div>
    </li>
  )
}

export function RecurringView({ initial, today: todayProp }: { initial?: RecurringDTO[]; today?: string }) {
  const q = useRecurring(initial)
  const update = useUpdateRecurring()
  const del = useDeleteRecurring()
  const desktop = useIsDesktop()
  const today = todayProp ?? toISTDate(new Date())
  const thisYear = today.slice(0, 4)
  const [dialog, setDialog] = useState<{ open: boolean; target: Target; n: number }>({ open: false, target: { kind: 'new' }, n: 0 })
  const heading = useRef<HTMLHeadingElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)

  const data = useMemo(() => q.data ?? [], [q.data])
  const suggestions = BILL_SUGGESTIONS.filter((s) => !data.some((d) => d.name.toLowerCase() === s.name.toLowerCase()))

  const openDialog = (target: Target) => setDialog((d) => ({ open: true, target, n: d.n + 1 }))
  const closeDialog = () => setDialog((d) => ({ ...d, open: false }))

  // After a delete, focus must not fall to <body>: it goes to the next row's Edit button, else the previous one, else the heading.
  const afterDelete = useRef<{ removed: string; next?: string } | null>(null)
  useEffect(() => {
    const pending = afterDelete.current
    if (!pending || data.some((i) => i.id === pending.removed)) return
    afterDelete.current = null
    const target = pending.next ? document.querySelector<HTMLElement>(`[data-row-id="${pending.next}"] button`) : null
    ;(target ?? heading.current)?.focus()
  }, [data])

  function onDelete(r: RecurringDTO) {
    const i = data.findIndex((x) => x.id === r.id)
    afterDelete.current = { removed: r.id, next: (data[i + 1] ?? data[i - 1])?.id }
    // The hook raises the undo toast and the row leaves once the list refetches; a refused delete clears the pending focus.
    del.mutate({ id: r.id, name: r.name }, { onError: () => { afterDelete.current = null } })
  }

  const t = dialog.target
  const editing = t.kind === 'edit'
  const title = editing ? `Edit ${t.item.name}` : t.kind === 'suggestion' ? `Schedule ${t.suggestion.name}` : 'New schedule'

  // Radix restores focus only to a Trigger; this dialog has none, so remember who opened it.
  const contentProps = {
    onOpenAutoFocus: (e: Event) => {
      returnTo.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
      e.preventDefault()
      const root = e.currentTarget instanceof HTMLElement ? e.currentTarget : document
      root.querySelector<HTMLElement>(t.kind === 'suggestion' ? '#rf-amount' : '#rf-name')?.focus()
    },
    onCloseAutoFocus: (e: Event) => {
      e.preventDefault()
      const el = returnTo.current
      // A suggestion chip disappears once it is scheduled, so fall back to the page heading.
      ;(el?.isConnected ? el : heading.current)?.focus()
    },
  }
  const body = (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 lg:px-6 lg:pb-6 lg:pt-6">
      <div className="flex flex-col gap-1.5 pr-12">
        <DialogTitle className="font-display text-xl">{title}</DialogTitle>
        <DialogDescription>
          {editing ? 'Change what you need; anything you leave alone stays as it is.' : 'Bills and income that repeat. Coinflow adds them as drafts when they fall due.'}
        </DialogDescription>
      </div>
      <RecurringForm
        key={dialog.n}
        initial={t.kind === 'edit' ? t.item : undefined}
        prefill={t.kind === 'suggestion' ? t.suggestion : undefined}
        onDone={closeDialog}
      />
    </div>
  )
  const closeButton = (
    <DialogClose asChild>
      <Button variant="ghost" className="absolute right-2 top-2 size-12 rounded-chip active:scale-[0.97]">
        <X className="size-5" aria-hidden />
        <span className="sr-only">Close</span>
      </Button>
    </DialogClose>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3">
        <h1 ref={heading} tabIndex={-1} className="font-display text-3xl font-bold outline-none">Recurring</h1>
        <Button onClick={() => openDialog({ kind: 'new' })} className="min-h-12 min-w-12 rounded-chip px-5 active:scale-[0.97]">Add</Button>
      </div>

      {suggestions.length > 0 && (
        <div role="group" aria-labelledby="rec-suggest" className="flex flex-col gap-2">
          <p id="rec-suggest" className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">Quick add a bill</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.name} type="button" onClick={() => openDialog({ kind: 'suggestion', suggestion: s })}
                className={`min-h-12 rounded-chip border bg-surface-2 px-4 text-sm transition hover:border-primary/60 active:scale-[0.97] ${RING}`}
              >
                + {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {q.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <p role="status" className="sr-only">Loading recurring items</p>
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 rounded-chip" />)}
        </div>
      ) : q.isError && !q.data ? (
        <div className="rounded-tile border bg-card p-8 text-center" role="alert">
          <p className="text-muted-foreground">Couldn’t load your recurring items.</p>
          <Button onClick={() => void q.refetch()} className="mt-3 min-h-12 active:scale-[0.97]">Try again</Button>
        </div>
      ) : (
        SECTIONS.map(([kind, title, empty], i) => {
          // Active items first; the server already orders by next due date.
          const items = data.filter((d) => d.kind === kind).sort((a, b) => Number(b.active) - Number(a.active))
          return (
            <Reveal key={kind} delay={i * 0.05}>
              <Tile aria-labelledby={`rec-${kind}`}>
                <h2 id={`rec-${kind}`} className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">{title}</h2>
                {items.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
                ) : (
                  <ul className="mt-2 flex flex-col">
                    {items.map((r) => (
                      <RecurringRow
                        key={r.id} r={r} thisYear={thisYear}
                        busy={update.isPending && update.variables?.id === r.id}
                        deleting={del.isPending && del.variables?.id === r.id}
                        onEdit={(x) => openDialog({ kind: 'edit', item: x })}
                        onToggle={(x) => update.mutate({ id: x.id, name: x.name, label: `${x.active ? 'Paused' : 'Resumed'} ${x.name}`, patch: { active: !x.active } })}
                        onDelete={onDelete}
                      />
                    ))}
                  </ul>
                )}
              </Tile>
            </Reveal>
          )
        })
      )}

      {desktop ? (
        <Dialog open={dialog.open} onOpenChange={(o) => !o && closeDialog()}>
          <DialogContent showCloseButton={false} {...contentProps} className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-tile p-0 sm:max-w-md">
            {body}
            {closeButton}
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open={dialog.open} onOpenChange={(o) => !o && closeDialog()}>
          <SheetContent side="bottom" showCloseButton={false} {...contentProps} className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-tile p-0">
            {body}
            {closeButton}
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
