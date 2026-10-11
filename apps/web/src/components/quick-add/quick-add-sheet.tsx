'use client'
import { X } from 'lucide-react'
import { useRef, useState } from 'react'
import { AmountRoll } from '@/components/fx/amount-roll'
import { Spark } from '@/components/fx/spark'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCategories, useCreateTransaction, useUpdateTransaction } from '@/hooks/queries'
import { useMediaQuery } from '@/hooks/use-media-query'
import { ApiError } from '@/lib/api-client'
import { keypadPress, parseAmountText } from '@/lib/keypad'
import { formatINR, MAX_AMOUNT_PAISE, paiseToRupeeString, parseRupeesToPaise } from '@/lib/money'
import { enterOnChoice } from '@/lib/quick-add-keys'
import { buildPatch, isValidWhen } from '@/lib/quick-add-patch'
import { cn } from '@/lib/utils'
import { CategoryChips } from './category-chips'
import { Keypad } from './keypad'
import { useQuickAdd, type QuickAddPrefill } from './quick-add-provider'

const METHODS = [['upi', 'UPI'], ['cash', 'Cash'], ['card', 'Card'], ['other', 'Other']] as const
const LAST_METHOD_KEY = 'coinflow:last-method'
type Kind = 'expense' | 'income'
type FieldError = { field: string; message: string }
const MAX_NOTICE = `Max ${formatINR(MAX_AMOUNT_PAISE)}`
/** Where focus goes for each field error. Fields inside the closed "Note, date & method" block open it first. */
const FOCUS_TARGET: Record<string, string> = {
  amount: '#qa-amount',
  categoryId: '[role="radio"][tabindex="0"]',
  occurredAt: '#qa-when',
  note: '#qa-note',
  method: '#qa-method [role="radio"]',
}
const IN_DETAILS = new Set(['occurredAt', 'note', 'method'])

const TOGGLE = 'min-h-12 flex-1 border bg-surface-2 transition active:scale-[0.97] data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'

const useIsDesktop = () => useMediaQuery('(min-width: 1024px)') ?? false

function lastMethod(): string {
  try {
    return localStorage.getItem(LAST_METHOD_KEY) || 'upi'
  } catch {
    return 'upi'
  }
}

function localDateTimeValue(iso?: string) {
  const d = iso ? new Date(iso) : new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

/** "12." is a valid mid-typing state; read it as 12. Empty or unparseable → null. */
const toPaise = (typed: string) => parseRupeesToPaise(typed.endsWith('.') ? typed.slice(0, -1) : typed)

function QuickAddForm({ prefill, desktop, onDone }: { prefill: QuickAddPrefill; desktop: boolean; onDone: () => void }) {
  const editId = prefill.editId
  const editing = Boolean(editId)
  // Everything starts from the prefill via initialisers: no effect, no setState-on-open.
  const [initial] = useState(() => ({
    type: (prefill.type ?? 'expense') as Kind,
    amount: prefill.amount ?? null,
    categoryId: prefill.categoryId ?? null,
    note: prefill.note ?? null,
    method: prefill.method ?? lastMethod(),
  }))
  const [type, setType] = useState<Kind>(initial.type)
  const [amount, setAmount] = useState(initial.amount ? paiseToRupeeString(initial.amount) : '')
  const [categoryId, setCategoryId] = useState<string | null>(initial.categoryId)
  const [note, setNote] = useState(initial.note ?? '')
  const [method, setMethod] = useState(initial.method)
  const [when, setWhen] = useState(() => localDateTimeValue(prefill.occurredAt))
  const [whenTouched, setWhenTouched] = useState(false)
  const [fieldError, setFieldError] = useState<FieldError | null>(null)
  const [capped, setCapped] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const saving = useRef(false) // set synchronously, so a quick double Enter cannot slip in before `pending` re-renders

  const categories = useCategories(type)
  const create = useCreateTransaction()
  const update = useUpdateTransaction()
  const pending = create.isPending || update.isPending
  const paise = toPaise(amount)
  const errorOn = (f: string) => (fieldError?.field === f ? fieldError.message : null)

  function fail(error: FieldError) {
    setFieldError(error)
    const form = formRef.current
    const known = error.field in FOCUS_TARGET
    if (!form || !known) return // unknown fields fall back to the general message below the form
    if (IN_DETAILS.has(error.field)) form.querySelector('details')?.setAttribute('open', '')
    // Focus what needs fixing so the error is announced in context.
    form.querySelector<HTMLElement>(FOCUS_TARGET[error.field])?.focus()
  }

  /** `chosen`: a category picked by the keystroke that saves (Enter on a chip), before state has caught up. */
  async function save(chosen?: string) {
    if (pending || saving.current) return
    const cat = chosen ?? categoryId
    if (!paise) return fail({ field: 'amount', message: 'Enter an amount more than ₹0.' })
    if (!cat) return fail({ field: 'categoryId', message: 'Pick a category.' })
    if (chosen) setCategoryId(chosen)
    // A cleared or half-typed When would make toISOString() throw; an untouched one is simply omitted.
    if (whenTouched && !isValidWhen(when)) return fail({ field: 'occurredAt', message: 'Pick a date and time.' })
    const cleanNote = note.trim() || null
    saving.current = true
    try {
      if (editId) {
        const patch = buildPatch(initial, { type, amount: paise, categoryId: cat, note: cleanNote, method }, whenTouched, when)
        if (Object.keys(patch).length > 0) await update.mutateAsync({ id: editId, patch })
      } else {
        await create.mutateAsync({ type, amount: paise, categoryId: cat, note: cleanNote, method, ...(whenTouched ? { occurredAt: new Date(when).toISOString() } : {}) })
      }
      try { localStorage.setItem(LAST_METHOD_KEY, method) } catch { /* private mode: the default is only a convenience */ }
      onDone()
    } catch (err) {
      if (err instanceof ApiError) {
        // The mutation hook toasts errors without a field; a 422 pins its message beside the field instead.
        if (err.field) fail({ field: err.field, message: err.message })
      } else {
        fail({ field: 'form', message: 'Couldn’t save that. Please try again.' })
      }
    } finally {
      saving.current = false
    }
  }

  function typeInto(text: string) {
    const { value, capped: over } = parseAmountText(text)
    // Over the cap: reject the whole input (a paste must not lose its middle digits) and say why.
    setCapped(over)
    if (over) return
    setAmount(value)
    setFieldError(null)
  }

  function pressKey(k: string) {
    const { value, capped: over } = keypadPress(amount, k)
    setCapped(over)
    setAmount(value)
    setFieldError(null)
  }

  function changeType(next: Kind) {
    setType(next)
    // Categories are per kind: going back to the original kind restores its category.
    setCategoryId(next === initial.type ? initial.categoryId : null)
    setFieldError(null)
  }

  const title = editing ? 'Edit entry' : type === 'income' ? 'Add income' : 'Add expense'
  const formError = errorOn('form') ?? (fieldError && !(fieldError.field in FOCUS_TARGET) ? fieldError.message : null)

  return (
    <form ref={formRef} className="flex min-h-0 flex-1 flex-col" noValidate
      onSubmit={(e) => { e.preventDefault(); void save() }}
      onKeyDown={(e) => {
        // Keyboard-first logging: 450, Tab to a category, Space, Enter. A choice button's own Enter would only click it.
        const action = enterOnChoice(e.nativeEvent, e.target as HTMLElement)
        if (action === 'ignore') return
        e.preventDefault()
        if (action === 'submit') void save((e.target as HTMLElement).dataset.cat)
      }}
    >
      {/* Only this part scrolls; the close button (outside the form) and the Save row stay put. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4 pt-5 lg:gap-5 lg:px-6 lg:pt-6">
        <div className="flex flex-col gap-1.5 pr-12">
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
          <DialogDescription className="sr-only lg:not-sr-only">Amount first, then a category. Everything else is optional.</DialogDescription>
        </div>

        <ToggleGroup type="single" aria-label="Entry type" value={type} onValueChange={(v) => v && changeType(v as Kind)} className="w-full">
          <ToggleGroupItem value="expense" className={TOGGLE}>Expense</ToggleGroupItem>
          <ToggleGroupItem value="income" className={TOGGLE}>Income</ToggleGroupItem>
        </ToggleGroup>

        <div>
          {/* Live readout of what will be saved; the field below is the accessible source of truth. */}
          <div aria-hidden className={cn('flex min-h-12 items-center overflow-hidden', paise ? 'text-foreground' : 'text-muted-foreground/40')} data-testid="qa-display">
            <AmountRoll paise={paise ?? 0} fontSize={desktop ? 48 : 40} />
          </div>
          <Label htmlFor="qa-amount" className="mt-1 text-muted-foreground">Amount</Label>
          <div className="mt-1 flex items-center gap-2 rounded-chip border bg-surface-2 px-3 focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/40 has-aria-invalid:border-neutral-negative">
            <span aria-hidden className="amount text-xl text-muted-foreground">₹</span>
            <input
              id="qa-amount"
              // Touch: the on-screen pad types, so keep the OS keyboard from covering it. Desktop: real keyboard.
              inputMode={desktop ? 'decimal' : 'none'}
              autoComplete="off"
              value={amount}
              placeholder="0"
              aria-invalid={errorOn('amount') ? true : undefined}
              aria-describedby={errorOn('amount') ? 'qa-amount-error' : 'qa-amount-help'}
              onChange={(e) => typeInto(e.target.value)}
              className="amount min-h-12 w-full bg-transparent text-xl outline-none placeholder:text-muted-foreground/50"
            />
          </div>
          {errorOn('amount') ? (
            <p id="qa-amount-error" role="alert" className="mt-1.5 text-sm text-neutral-negative">{errorOn('amount')}</p>
          ) : (
            <p id="qa-amount-help" className={cn('mt-1.5 text-sm', capped ? 'text-neutral-negative' : 'text-muted-foreground')}>
              {capped ? MAX_NOTICE : paise ? formatINR(paise) : 'e.g. 450 or 1,250.50'}
            </p>
          )}
          {/* Persistent polite live region: announces the cap when a key or paste is refused. */}
          <p role="status" className="sr-only">{capped ? MAX_NOTICE : ''}</p>
        </div>

        <Keypad onKey={pressKey} />

        <div>
          <p className="mb-2 text-sm text-muted-foreground">Category</p>
          {categories.isPending ? (
            <div className="flex flex-wrap gap-2" aria-busy="true" aria-label="Loading categories" role="status">
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 w-28 rounded-chip" />)}
            </div>
          ) : categories.isError ? (
            <p role="alert" className="text-sm text-neutral-negative">
              Couldn’t load categories.{' '}
              <button type="button" onClick={() => void categories.refetch()} className="min-h-12 underline underline-offset-4">Try again</button>
            </p>
          ) : (
            <CategoryChips
              categories={categories.data}
              value={categoryId}
              invalid={Boolean(errorOn('categoryId'))}
              onChange={(id) => { setCategoryId(id); setFieldError(null) }}
            />
          )}
          {errorOn('categoryId') && <p role="alert" className="mt-2 text-sm text-neutral-negative">{errorOn('categoryId')}</p>}
        </div>

        <details className="rounded-chip border bg-surface-2/50 px-3">
          <summary className="flex min-h-12 cursor-pointer items-center rounded-chip text-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/60">Note, date & method</summary>
          <div className="flex flex-col gap-3 pb-3 pt-1">
            <Label htmlFor="qa-note">Note</Label>
            <Input
              id="qa-note" value={note} maxLength={200} className="min-h-12" placeholder="Toit dinner"
              aria-invalid={errorOn('note') ? true : undefined} aria-describedby={errorOn('note') ? 'qa-note-error' : undefined}
              onChange={(e) => { setNote(e.target.value); setFieldError(null) }}
            />
            {errorOn('note') && <p id="qa-note-error" role="alert" className="text-sm text-neutral-negative">{errorOn('note')}</p>}
            <Label htmlFor="qa-when">When</Label>
            <Input
              id="qa-when" type="datetime-local" value={when} className="min-h-12"
              aria-invalid={errorOn('occurredAt') ? true : undefined} aria-describedby={errorOn('occurredAt') ? 'qa-when-error' : undefined}
              onChange={(e) => { setWhen(e.target.value); setWhenTouched(true); setFieldError(null) }}
            />
            {errorOn('occurredAt') && <p id="qa-when-error" role="alert" className="text-sm text-neutral-negative">{errorOn('occurredAt')}</p>}
            <p className="text-sm" id="qa-method-label">Paid with</p>
            <ToggleGroup id="qa-method" type="single" aria-labelledby="qa-method-label" value={method} onValueChange={(v) => v && setMethod(v)} className="w-full">
              {METHODS.map(([v, l]) => <ToggleGroupItem key={v} value={v} className={TOGGLE}>{l}</ToggleGroupItem>)}
            </ToggleGroup>
            {errorOn('method') && <p role="alert" className="text-sm text-neutral-negative">{errorOn('method')}</p>}
          </div>
        </details>
        {formError && <p role="alert" className="text-sm text-neutral-negative">{formError}</p>}
      </div>

      {/* Always visible: never below the fold, clear of the home indicator. */}
      <div className="shrink-0 border-t bg-popover px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:px-6 lg:pb-5">
        <Spark>
          <Button type="submit" aria-disabled={pending || undefined} className="min-h-14 w-full rounded-chip text-base active:scale-[0.97] aria-disabled:opacity-70">
            {pending ? 'Saving…' : editing ? 'Save changes' : `Save${paise ? ` ${formatINR(paise)}` : ''}`}
          </Button>
        </Spark>
      </div>
    </form>
  )
}

/** Quick add: a centred dialog on desktop, a bottom sheet on touch. One form, create or edit (`prefill.editId`). */
export function QuickAddSheet() {
  const { state, close } = useQuickAdd()
  const desktop = useIsDesktop()
  const returnTo = useRef<HTMLElement | null>(null)

  // Radix restores focus only to a Trigger; quick add has none, so remember who opened it.
  const contentProps = {
    onOpenAutoFocus: (e: Event) => {
      returnTo.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
      e.preventDefault()
      const root = e.currentTarget instanceof HTMLElement ? e.currentTarget : document
      root.querySelector<HTMLElement>('#qa-amount')?.focus()
    },
    onCloseAutoFocus: (e: Event) => {
      e.preventDefault()
      const el = returnTo.current
      if (el?.isConnected && el !== document.body) return el.focus()
      // Opened by N or the palette (no opener to return to): the visible Add button, else the main region.
      const add = [...document.querySelectorAll<HTMLElement>('[data-quick-add-return]')].find((b) => b.offsetParent !== null)
      ;(add ?? document.getElementById('main'))?.focus()
    },
  }
  const form = <QuickAddForm key={state.openCount} prefill={state.prefill} desktop={desktop} onDone={close} />
  const closeButton = (
    <DialogClose asChild>
      <Button variant="ghost" className="absolute right-2 top-2 size-12 rounded-chip active:scale-[0.97]">
        <X className="size-5" aria-hidden />
        <span className="sr-only">Close</span>
      </Button>
    </DialogClose>
  )

  return desktop ? (
    <Dialog open={state.open} onOpenChange={(o) => !o && close()}>
      <DialogContent showCloseButton={false} {...contentProps} className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-tile p-0 sm:max-w-md">
        {form}
        {closeButton}
      </DialogContent>
    </Dialog>
  ) : (
    <Sheet open={state.open} onOpenChange={(o) => !o && close()}>
      <SheetContent side="bottom" showCloseButton={false} {...contentProps} className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-tile p-0">
        {form}
        {closeButton}
      </SheetContent>
    </Sheet>
  )
}
