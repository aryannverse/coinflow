'use client'
import { useEffect, useRef, useState } from 'react'
import { BudgetSlider } from '@/components/fx/budget-slider'
import { Tile } from '@/components/fx/tile'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useBudgets, useCategories, useDeleteBudget, useUpsertBudget } from '@/hooks/queries'
import { ApiError } from '@/lib/api-client'
import type { BudgetDTO } from '@/lib/api-types'
import { budgetBand } from '@/lib/budget-band'
import { MAX_AMOUNT_PAISE } from '@/lib/money'

const COMMIT_DELAY_MS = 600
const DEFAULT_PLAN = 500_000 // ₹5,000

/** A field-level server rejection (422) is shown next to the control; anything else already raised a toast. */
const fieldMessage = (err: unknown) => (err instanceof ApiError && err.field ? err.message : null)

function BudgetRow({ b }: { b: BudgetDTO }) {
  const [draft, setDraft] = useState(b.monthlyLimit)
  // When the server's value changes (after a save, an undo or a refetch) the draft follows it. This is
  // state adjusted during render, not an effect, and keeping the row mounted keeps the slider focused.
  const [serverLimit, setServerLimit] = useState(b.monthlyLimit)
  if (serverLimit !== b.monthlyLimit) {
    setServerLimit(b.monthlyLimit)
    setDraft(b.monthlyLimit)
  }
  const upsert = useUpsertBudget()
  const del = useDeleteBudget()
  const rowRef = useRef<HTMLLIElement>(null)
  const pending = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const { mutate } = upsert

  const flush = () => {
    clearTimeout(timer.current)
    const next = pending.current
    pending.current = null
    // A plan of ₹0 is not a plan: Remove is how you drop one.
    if (next === null || next <= 0 || next === b.monthlyLimit) return
    mutate(
      { categoryId: b.categoryId, monthlyLimit: next, name: b.name },
      { onError: (err) => { if (fieldMessage(err)) rowRef.current?.querySelector<HTMLElement>('[role="slider"]')?.focus() } },
    )
  }
  const onSlide = (v: number) => {
    setDraft(v)
    pending.current = v
    upsert.reset()
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, COMMIT_DELAY_MS)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  const band = budgetBand(b.spent, draft)
  const error = fieldMessage(upsert.error)
  return (
    <li ref={rowRef} className="flex flex-col gap-2 border-b py-3 last:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span><span aria-hidden>{b.emoji}</span> {b.name}</span>
        <span className={band.overBy ? 'text-neutral-negative' : 'text-muted-foreground'}>{band.label}</span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${b.name}: ${band.label}`}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${band.pct}%` }} />
        {band.overBy > 0 && (
          <div className="absolute inset-y-0 right-0 w-6 bg-[repeating-linear-gradient(135deg,var(--neutral-negative)_0_3px,transparent_3px_6px)]" />
        )}
      </div>
      <div className="flex items-center gap-2" onPointerUp={flush} onKeyUp={flush} onBlur={flush}>
        <BudgetSlider value={draft} onValueChange={onSlide} max={Math.min(MAX_AMOUNT_PAISE, Math.max(2_000_000, b.monthlyLimit * 2))} label={`${b.name} monthly plan`} />
        <Button variant="ghost" className="min-h-12 min-w-12 shrink-0" aria-label={`Remove ${b.name} plan`} disabled={del.isPending} onClick={() => del.mutate({ categoryId: b.categoryId, name: b.name })}>
          Remove
        </Button>
      </div>
      {draft === 0 && <p className="text-xs text-muted-foreground">A plan needs more than ₹0. Use Remove to drop this one.</p>}
      {upsert.isPending && <p className="text-xs text-muted-foreground" role="status">Saving…</p>}
      {error && <p role="alert" className="text-sm text-neutral-negative">{error}</p>}
    </li>
  )
}

function AddPlan({ options }: { options: { id: string; name: string; emoji: string }[] }) {
  const upsert = useUpsertBudget()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const error = fieldMessage(upsert.error)
  return (
    <div className="mt-3 flex flex-col gap-2">
      <Select
        value=""
        onValueChange={(id) => {
          const c = options.find((o) => o.id === id)
          if (!c || upsert.isPending) return
          upsert.mutate(
            { categoryId: c.id, monthlyLimit: DEFAULT_PLAN, name: c.name },
            { onError: (err) => { if (fieldMessage(err)) triggerRef.current?.focus() } },
          )
        }}
      >
        <SelectTrigger ref={triggerRef} className="min-h-12 w-full aria-invalid:border-neutral-negative aria-invalid:ring-neutral-negative/30 sm:w-80" aria-label="Add a plan for a category" aria-invalid={error ? true : undefined}>
          <SelectValue placeholder="+ Add a plan for…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((c) => <SelectItem key={c.id} value={c.id} className="min-h-12">{c.emoji} {c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {upsert.isPending && <p className="text-xs text-muted-foreground" role="status">Adding plan…</p>}
      {error && <p role="alert" className="text-sm text-neutral-negative">{error}</p>}
    </div>
  )
}

export function BudgetsPanel() {
  const budgets = useBudgets()
  const categories = useCategories('expense')
  const list = budgets.data ?? []
  const free = (categories.data ?? []).filter((c) => !list.some((b) => b.categoryId === c.id))
  return (
    <Tile aria-labelledby="budgets-title">
      <h2 id="budgets-title" className="font-display text-xl font-bold">Soft plans</h2>
      <p className="text-sm text-muted-foreground">Optional monthly guides per category, measured over your pay cycle. Going over is just information, no alarms.</p>
      {budgets.isPending ? (
        <div className="mt-3 flex flex-col gap-3" aria-busy="true"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : budgets.isError ? (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 p-4 text-sm">
          <span>{budgets.error instanceof ApiError ? budgets.error.message : 'Couldn’t load your plans.'}</span>
          <Button variant="outline" className="min-h-12" onClick={() => void budgets.refetch()}>Try again</Button>
        </div>
      ) : list.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-surface-2 p-4 text-sm text-muted-foreground">No plans yet. Pick a category below if you’d like a gentle monthly guide.</p>
      ) : (
        <ul className="mt-2">{list.map((b) => <BudgetRow key={b.budgetId} b={b} />)}</ul>
      )}
      {!budgets.isPending && !budgets.isError && free.length > 0 && <AddPlan options={free} />}
    </Tile>
  )
}
