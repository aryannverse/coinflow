'use client'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCategories, useCreateRecurring, useUpdateRecurring } from '@/hooks/queries'
import { ApiError } from '@/lib/api-client'
import type { RecurringDTO } from '@/lib/api-types'
import { addDays, toISTDate } from '@/lib/dates'
import { formatINR, MAX_AMOUNT_PAISE, paiseToRupeeString, parseRupeesToPaise } from '@/lib/money'
import { buildRecurringPatch, type RecurringFields } from '@/lib/recurring-patch'
import { cn } from '@/lib/utils'

export const BILL_SUGGESTIONS: { name: string; category: string; amount: number }[] = [
  { name: 'Rent', category: 'Rent', amount: 1_500_000 },
  { name: 'Electricity', category: 'Bills & Utilities', amount: 150_000 },
  { name: 'Mobile recharge', category: 'Bills & Utilities', amount: 34_900 },
  { name: 'Wi-Fi', category: 'Bills & Utilities', amount: 70_000 },
  { name: 'Netflix', category: 'Subscriptions', amount: 64_900 },
  { name: 'Spotify', category: 'Subscriptions', amount: 11_900 },
  { name: 'Gym', category: 'Health', amount: 150_000 },
  { name: 'EMI', category: 'Bills & Utilities', amount: 500_000 },
]

type Kind = 'bill' | 'income'
type Cadence = RecurringFields['cadence']
type FieldError = { field: string; message: string }

/** Where focus goes for each field error. */
const FOCUS_TARGET: Record<string, string> = {
  kind: '#rf-kind [role="radio"]',
  name: '#rf-name',
  amount: '#rf-amount',
  cadence: '#rf-cadence',
  nextDueOn: '#rf-due',
  categoryId: '#rf-cat',
}
const MAX_NOTICE = `Max ${formatINR(MAX_AMOUNT_PAISE)}`
const FIELD = 'min-h-12 aria-invalid:border-neutral-negative aria-invalid:ring-neutral-negative/30'
const TOGGLE = 'min-h-12 flex-1 border bg-surface-2 transition active:scale-[0.97] data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'
const trigger = (invalid: boolean) => cn('min-h-12 w-full data-[size=default]:h-12', FIELD, invalid && 'border-neutral-negative')

/** "12." is a valid mid-typing state; read it as 12. Empty or unparseable gives null. */
const toPaise = (typed: string) => parseRupeesToPaise(typed.endsWith('.') ? typed.slice(0, -1) : typed)

export function RecurringForm({ initial, onDone, kindDefault = 'bill', prefill, submitId, submitDescribedBy }: {
  initial?: RecurringDTO
  onDone: () => void
  kindDefault?: Kind
  prefill?: { name: string; category: string; amount: number }
  /** Lets a host (onboarding) move focus to, and describe, the submit button. */
  submitId?: string
  submitDescribedBy?: string
}) {
  const startKind: Kind = initial?.kind ?? kindDefault
  const [kind, setKind] = useState<Kind>(startKind)
  const [name, setName] = useState(initial?.name ?? prefill?.name ?? '')
  const [amount, setAmount] = useState(initial ? paiseToRupeeString(initial.amount) : prefill ? paiseToRupeeString(prefill.amount) : '')
  const [cadence, setCadence] = useState<Cadence>(initial?.cadence ?? 'monthly')
  const [nextDueOn, setNextDueOn] = useState(() => initial?.nextDueOn ?? addDays(toISTDate(new Date()), 1))
  const [categoryId, setCategoryId] = useState<string | undefined>(initial?.categoryId)
  const [fieldError, setFieldError] = useState<FieldError | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Bills are expenses and income is income: the list follows the kind, and the server rejects a mismatch.
  const categories = useCategories(kind === 'bill' ? 'expense' : 'income')
  const list = categories.data
  const suggested = prefill && list ? list.find((c) => c.name === prefill.category)?.id : undefined
  const chosen = categoryId && list?.some((c) => c.id === categoryId) ? categoryId : undefined
  const cat = chosen ?? suggested

  const create = useCreateRecurring()
  const update = useUpdateRecurring()
  const pending = create.isPending || update.isPending
  const paise = toPaise(amount)
  const errorOn = (f: string) => (fieldError?.field === f ? fieldError.message : null)
  const touch = () => setFieldError(null)

  function fail(error: FieldError) {
    setFieldError(error)
    // Focus what needs fixing so the message is announced in context. Unknown fields use the form-level message.
    const target = FOCUS_TARGET[error.field]
    if (target) formRef.current?.querySelector<HTMLElement>(target)?.focus()
  }

  function changeKind(next: Kind) {
    setKind(next)
    // Categories are per kind: coming back to the original kind restores its category.
    setCategoryId(next === startKind ? initial?.categoryId : undefined)
    touch()
  }

  async function submit() {
    if (pending) return
    const cleanName = name.trim()
    if (!cleanName) return fail({ field: 'name', message: 'Name it, e.g. “Rent”.' })
    if (!paise) return fail({ field: 'amount', message: 'Enter an amount more than ₹0.' })
    if (paise > MAX_AMOUNT_PAISE) return fail({ field: 'amount', message: MAX_NOTICE })
    if (!nextDueOn) return fail({ field: 'nextDueOn', message: 'Pick the next due date.' })
    if (!cat) return fail({ field: 'categoryId', message: 'Pick a category.' })
    const next: RecurringFields = { kind, name: cleanName, amount: paise, cadence, nextDueOn, categoryId: cat }
    try {
      if (initial) {
        const patch = buildRecurringPatch(
          { kind: initial.kind, name: initial.name, amount: initial.amount, cadence: initial.cadence, nextDueOn: initial.nextDueOn, categoryId: initial.categoryId },
          next,
        )
        // Nothing changed: no request, no toast, just close.
        if (Object.keys(patch).length > 0) await update.mutateAsync({ id: initial.id, name: cleanName, patch })
      } else {
        await create.mutateAsync(next)
      }
      onDone()
    } catch (err) {
      if (err instanceof ApiError) {
        // The mutation hook toasts errors without a field; a 422 pins its message beside the field instead.
        if (err.field) fail({ field: err.field, message: err.message })
      } else {
        fail({ field: 'form', message: 'Couldn’t save that. Please try again.' })
      }
    }
  }

  const formError = errorOn('form') ?? (fieldError && !(fieldError.field in FOCUS_TARGET) ? fieldError.message : null)

  return (
    <form ref={formRef} noValidate onSubmit={(e) => { e.preventDefault(); void submit() }} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p id="rf-kind-label" className="text-sm font-medium">Type</p>
        <ToggleGroup
          id="rf-kind" type="single" role="radiogroup" aria-labelledby="rf-kind-label" value={kind}
          onValueChange={(v) => v && changeKind(v as Kind)} className="w-full"
        >
          <ToggleGroupItem value="bill" className={TOGGLE}>Bill</ToggleGroupItem>
          <ToggleGroupItem value="income" className={TOGGLE}>Income</ToggleGroupItem>
        </ToggleGroup>
        {errorOn('kind') && <p role="alert" className="text-sm text-neutral-negative">{errorOn('kind')}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="rf-name">Name</Label>
        <Input
          id="rf-name" value={name} maxLength={60} autoComplete="off" placeholder={kind === 'bill' ? 'Rent' : 'Salary'} className={FIELD}
          aria-invalid={errorOn('name') ? true : undefined} aria-describedby={errorOn('name') ? 'rf-name-error' : undefined}
          onChange={(e) => { setName(e.target.value); touch() }}
        />
        {errorOn('name') && <p id="rf-name-error" role="alert" className="text-sm text-neutral-negative">{errorOn('name')}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="rf-amount">Amount (₹)</Label>
        <Input
          id="rf-amount" inputMode="decimal" autoComplete="off" value={amount} placeholder="15,000" className={cn('amount', FIELD)}
          aria-invalid={errorOn('amount') ? true : undefined} aria-describedby={errorOn('amount') ? 'rf-amount-error' : 'rf-amount-help'}
          onChange={(e) => { setAmount(e.target.value); touch() }}
        />
        {errorOn('amount') ? (
          <p id="rf-amount-error" role="alert" className="text-sm text-neutral-negative">{errorOn('amount')}</p>
        ) : (
          <p id="rf-amount-help" className="text-sm text-muted-foreground">
            {paise && paise <= MAX_AMOUNT_PAISE ? formatINR(paise) : 'e.g. 450 or 1,250.50'}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="rf-cadence">Repeats</Label>
          <Select value={cadence} onValueChange={(v) => { setCadence(v as Cadence); touch() }}>
            <SelectTrigger id="rf-cadence" className={trigger(Boolean(errorOn('cadence')))} aria-invalid={errorOn('cadence') ? true : undefined} aria-describedby={errorOn('cadence') ? 'rf-cadence-error' : undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
          {errorOn('cadence') && <p id="rf-cadence-error" role="alert" className="text-sm text-neutral-negative">{errorOn('cadence')}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rf-due">Next due</Label>
          <Input
            id="rf-due" type="date" value={nextDueOn} className={FIELD}
            aria-invalid={errorOn('nextDueOn') ? true : undefined} aria-describedby={errorOn('nextDueOn') ? 'rf-due-error' : undefined}
            onChange={(e) => { setNextDueOn(e.target.value); touch() }}
          />
          {errorOn('nextDueOn') && <p id="rf-due-error" role="alert" className="text-sm text-neutral-negative">{errorOn('nextDueOn')}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="rf-cat">Category</Label>
        {categories.isPending ? (
          <Skeleton className="h-12 rounded-md" role="status" aria-label="Loading categories" />
        ) : categories.isError || !list ? (
          <p role="alert" className="text-sm text-neutral-negative">
            Couldn’t load categories.{' '}
            <button type="button" onClick={() => void categories.refetch()} className="min-h-12 underline underline-offset-4">Try again</button>
          </p>
        ) : (
          <Select value={cat ?? ''} onValueChange={(v) => { setCategoryId(v); touch() }}>
            <SelectTrigger id="rf-cat" className={trigger(Boolean(errorOn('categoryId')))} aria-invalid={errorOn('categoryId') ? true : undefined} aria-describedby={errorOn('categoryId') ? 'rf-cat-error' : undefined}>
              <SelectValue placeholder="Pick a category" />
            </SelectTrigger>
            <SelectContent>
              {list.map((c) => <SelectItem key={c.id} value={c.id}><span aria-hidden>{c.emoji}</span> {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {errorOn('categoryId') && <p id="rf-cat-error" role="alert" className="text-sm text-neutral-negative">{errorOn('categoryId')}</p>}
      </div>

      {formError && <p role="alert" className="text-sm text-neutral-negative">{formError}</p>}
      <Button type="submit" id={submitId} aria-describedby={submitDescribedBy} aria-disabled={pending || undefined} className="min-h-12 w-full rounded-chip text-base active:scale-[0.97] aria-disabled:opacity-70">
        {pending ? 'Saving…' : initial ? 'Save changes' : 'Add to schedule'}
      </Button>
    </form>
  )
}
