'use client'
import { Camera } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useAgentHealth } from '@/components/agent/use-agent-health'
import { AmountRoll } from '@/components/fx/amount-roll'
import { Spark } from '@/components/fx/spark'
import { CategoryChips } from '@/components/quick-add/category-chips'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCategories } from '@/hooks/queries'
import { useCreateGroupExpense, useGroup, useGroupExpense, useUpdateGroupExpense } from '@/hooks/group-queries'
import { api, ApiError } from '@/lib/api-client'
import type { GroupDetailDTO, GroupExpenseDTO, ReceiptDTO } from '@/lib/api-types'
import { buildBody, draftFromExpense, emptyDraft, previewDraft, type ExpenseDraft } from '@/lib/expense-form'
import { parseRupeesToPaise } from '@/lib/money'
import { receiptNotice, receiptToDraft } from '@/lib/proposal-apply'
import type { SplitMode } from '@/lib/split'
import { cn } from '@/lib/utils'
import { FIELD } from './field'
import { MemberAvatar } from './member-avatar'
import { CHOICE, PayersEditor } from './payers-editor'
import { ReceiptCanvas } from './receipt-canvas'
import { SheetFrame } from './sheet-frame'
import { SplitEditor } from './split-editor'

const MODES: { value: SplitMode; label: string }[] = [
  { value: 'equal', label: 'Equal' },
  { value: 'exact', label: 'Exact amounts' },
  { value: 'shares', label: 'Shares' },
  { value: 'percent', label: 'Percent' },
  { value: 'itemized', label: 'Itemized' },
]
/** Field → what to focus (first match wins) so the error is announced in context. */
const FOCUS: [string, string[]][] = [
  ['amountPaise', ['#ge-amount']], ['description', ['#ge-desc']], ['categoryId', ['[role="radio"][tabindex="0"]']],
  ['payers', ['#ge-payers [aria-invalid="true"]', '#ge-payers [role="radio"][tabindex="0"]']],
  ['split', ['#ge-split [aria-invalid="true"]', '#ge-split [data-invalid]', '#ge-split']],
]
type FieldError = { field: string; message: string }
type Scan = { reading: boolean; error: string | null; notice: string | null }
const RECEIPT_MAX_BYTES = 5 * 1024 * 1024 // spec §4.5

function ExpenseForm({ group, expense, prefill, notice, onDone }: {
  group: GroupDetailDTO; expense?: GroupExpenseDTO; prefill?: Partial<ExpenseDraft>; notice?: string; onDone: () => void
}) {
  const active = group.members.filter((m) => !m.removedAt)
  const order = useMemo(() => group.members.map((m) => m.id), [group.members])
  // Initialised once per opening (the sheet keys this form by its open count): no effect, no setState-on-open.
  const [draft, setDraft] = useState<ExpenseDraft>(() => ({
    ...(expense ? draftFromExpense(expense, active.map((m) => m.id)) : emptyDraft(active.map((m) => m.id), group.myMemberId)),
    ...prefill,
  }))
  const [fieldError, setFieldError] = useState<FieldError | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const saving = useRef(false)
  const categories = useCategories('expense')
  const builtIns = (categories.data ?? []).filter((c) => c.userId === null) // group expenses use shared categories (plan A6)
  const create = useCreateGroupExpense()
  const update = useUpdateGroupExpense()
  const pending = create.isPending || update.isPending
  const preview = useMemo(() => previewDraft(draft, order), [draft, order])
  const amountPaise = parseRupeesToPaise(draft.amount.trim() || '0') ?? 0
  // Spec §3.5/§4.5: "Scan receipt" fills the itemized canvas. Shown only when the assistant can read images.
  const vision = useAgentHealth().data?.capabilities?.vision === true
  const [scan, setScan] = useState<Scan>({ reading: false, error: null, notice: null })
  const fileRef = useRef<HTMLInputElement>(null)
  async function scanReceipt(file: File) {
    if (file.size > RECEIPT_MAX_BYTES) return setScan({ reading: false, error: 'That photo is over 5 MB. Try a closer, smaller shot.', notice: null })
    setScan({ reading: true, error: null, notice: null })
    const form = new FormData()
    form.append('file', file)
    try {
      const { data } = await api<{ data: ReceiptDTO }>('/agent/receipt', { method: 'POST', body: form })
      patch(receiptToDraft(data))
      setScan({ reading: false, error: null, notice: receiptNotice(data) ?? null })
    } catch (err) {
      setScan({ reading: false, error: err instanceof ApiError ? err.message : 'Couldn’t read that receipt. Try a sharper photo.', notice: null })
    }
  }
  const errorFor = (prefix: string) => (fieldError && fieldError.field.startsWith(prefix) ? fieldError.message : null)

  const patch = (p: Partial<ExpenseDraft>) => {
    setDraft((d) => ({ ...d, ...p }))
    setFieldError(null)
  }
  const toggleParticipant = (id: string) =>
    patch({ participants: draft.participants.includes(id) ? draft.participants.filter((x) => x !== id) : order.filter((x) => x === id || draft.participants.includes(x)) })

  function fail(e: FieldError) {
    setFieldError(e)
    const targets = FOCUS.find(([prefix]) => e.field.startsWith(prefix))?.[1] ?? []
    // After the error renders, so the invalid field (and what describes it) is what gets focus.
    requestAnimationFrame(() => {
      const form = formRef.current
      const el = targets.map((t) => form?.querySelector<HTMLElement>(t)).find(Boolean)
      el?.focus()
    })
  }

  async function save() {
    if (pending || saving.current) return
    const built = buildBody(draft, order)
    if (!built.ok) return fail(built)
    saving.current = true
    try {
      if (expense) await update.mutateAsync({ groupId: group.id, expenseId: expense.id, body: built.body })
      else await create.mutateAsync({ groupId: group.id, body: built.body })
      onDone()
    } catch (err) {
      if (err instanceof ApiError && err.field) fail({ field: err.field, message: err.message })
      else if (!(err instanceof ApiError)) fail({ field: 'form', message: 'Couldn’t save that. Please try again.' })
    } finally {
      saving.current = false
    }
  }

  return (
    <form ref={formRef} noValidate className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); void save() }}>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-4 pt-5 lg:px-6 lg:pt-6">
        <div className="flex flex-col gap-1 pr-12">
          <DialogTitle className="font-display text-xl">{expense ? 'Edit expense' : 'Add expense'}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{group.emoji} {group.name}</DialogDescription>
        </div>
        {notice && <p role="status" className="rounded-chip border bg-surface-2 p-3 text-sm">{notice}</p>}
        {scan.notice && <p role="status" className="rounded-chip border bg-surface-2 p-3 text-sm">{scan.notice}</p>}

        <div>
          <div aria-hidden className={cn('flex min-h-12 items-center overflow-hidden', amountPaise ? 'text-foreground' : 'text-muted-foreground')}>
            <AmountRoll paise={amountPaise} fontSize={40} />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <Label htmlFor="ge-amount" className="text-muted-foreground">Amount</Label>
            {vision && (
              <>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" tabIndex={-1} aria-hidden className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) void scanReceipt(f)
                  }} />
                <Button type="button" variant="outline" aria-label="Scan receipt" aria-disabled={scan.reading || undefined}
                  aria-describedby={scan.error ? 'ge-scan-error' : undefined}
                  onClick={() => { if (!scan.reading) fileRef.current?.click() }}
                  className="min-h-12 rounded-chip active:scale-[0.97]">
                  <Camera className="size-4" aria-hidden /> Scan receipt
                </Button>
              </>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 rounded-chip border bg-surface-2 px-3 focus-within:border-primary focus-within:ring-3 focus-within:ring-ring has-aria-invalid:border-neutral-negative">
            <span aria-hidden className="amount text-xl text-muted-foreground">₹</span>
            <input id="ge-amount" inputMode="decimal" autoComplete="off" placeholder="0" value={draft.amount}
              aria-invalid={errorFor('amountPaise') ? true : undefined} aria-describedby={errorFor('amountPaise') ? 'ge-amount-error' : undefined}
              onChange={(e) => patch({ amount: e.target.value.replace(/[^\d.,]/g, '') })}
              className="amount min-h-12 w-full bg-transparent text-xl outline-none placeholder:text-muted-foreground/50" />
          </div>
          {errorFor('amountPaise') && <p id="ge-amount-error" role="alert" className="mt-1.5 text-sm text-neutral-negative">{errorFor('amountPaise')}</p>}
          {/* Always mounted while scanning is offered, so the live region exists before its text changes. */}
          {vision && <p role="status" className="mt-1.5 text-sm text-muted-foreground empty:mt-0">{scan.reading ? 'Reading the receipt…' : ''}</p>}
          {scan.error && <p id="ge-scan-error" role="alert" className="mt-1.5 text-sm text-neutral-negative">{scan.error}</p>}
        </div>

        <div>
          <Label htmlFor="ge-desc">What for?</Label>
          <Input id="ge-desc" value={draft.description} maxLength={80} placeholder="Bowling" className={cn(FIELD, 'mt-1')}
            aria-invalid={errorFor('description') ? true : undefined} aria-describedby={errorFor('description') ? 'ge-desc-error' : undefined}
            onChange={(e) => patch({ description: e.target.value })} />
          {errorFor('description') && <p id="ge-desc-error" role="alert" className="mt-1.5 text-sm text-neutral-negative">{errorFor('description')}</p>}
        </div>

        <div>
          <p className="mb-2 text-sm text-muted-foreground">Category</p>
          {categories.isPending ? (
            <div className="flex flex-wrap gap-2" role="status" aria-label="Loading categories">
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 w-28 rounded-chip" />)}
            </div>
          ) : (
            <CategoryChips categories={builtIns} value={draft.categoryId} invalid={Boolean(errorFor('categoryId'))} onChange={(id) => patch({ categoryId: id })} />
          )}
          {errorFor('categoryId') && <p role="alert" className="mt-2 text-sm text-neutral-negative">{errorFor('categoryId')}</p>}
        </div>

        <PayersEditor members={active} draft={draft} leftPaise={preview.payersLeftPaise} error={errorFor('payers')} onChange={patch} />

        {draft.mode !== 'itemized' && (
          <div role="group" aria-labelledby="ge-people-label">
            <p id="ge-people-label" className="mb-2 text-sm text-muted-foreground">Split between</p>
            <div className="flex flex-wrap gap-2">
              {active.map((m) => {
                const on = draft.participants.includes(m.id)
                return (
                  <button key={m.id} type="button" aria-pressed={on} onClick={() => toggleParticipant(m.id)}
                    className={cn('flex min-h-12 items-center gap-2 rounded-chip border px-3 text-sm active:scale-[0.97]',
                      on ? 'border-primary bg-primary/15 text-foreground' : 'bg-surface-2 text-muted-foreground line-through decoration-1')}>
                    <MemberAvatar name={m.displayName} claimed={m.claimed} size={28} />
                    {m.isMe ? 'You' : m.displayName}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <p id="ge-mode-label" className="mb-2 text-sm text-muted-foreground">Split mode</p>
          <ToggleGroup type="single" aria-labelledby="ge-mode-label" value={draft.mode} onValueChange={(v) => v && patch({ mode: v as SplitMode })}
            className="flex w-full flex-wrap justify-start gap-1.5">
            {MODES.map((m) => <ToggleGroupItem key={m.value} value={m.value} className={CHOICE}>{m.label}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>

        {/* Named so that when a failed save lands focus here, it is announced with the error. */}
        <div id="ge-split" tabIndex={-1} role="group" aria-label="Split details" aria-describedby={errorFor('split') ? 'ge-split-error' : undefined} className="outline-none">
          {draft.mode === 'itemized'
            ? <ReceiptCanvas members={active} draft={draft} preview={preview} error={errorFor('split')} errorField={fieldError?.field} onChange={patch} />
            : <SplitEditor members={active} draft={draft} preview={preview} error={errorFor('split')} onChange={patch} />}
        </div>
        {errorFor('form') && <p role="alert" className="text-sm text-neutral-negative">{errorFor('form')}</p>}
      </div>

      <div className="shrink-0 border-t bg-popover px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:px-6 lg:pb-5">
        <Spark>
          <Button type="submit" aria-disabled={pending || undefined} className="min-h-14 w-full rounded-chip text-base active:scale-[0.97] aria-disabled:opacity-70">
            {pending ? 'Saving…' : 'Save expense'}
          </Button>
        </Spark>
      </div>
    </form>
  )
}

/** Add / edit a group expense (spec §3.5). A centred dialog on desktop, a bottom sheet below 1024 px — like quick add. */
export function ExpenseSheet({ open, openCount, groupId, expenseId, prefill, notice, onClose }: {
  open: boolean; openCount: number; groupId: string; expenseId?: string; prefill?: Partial<ExpenseDraft>; notice?: string; onClose: () => void
}) {
  const group = useGroup(groupId)
  const existing = useGroupExpense(groupId, expenseId)
  const ready = group.data && (!expenseId || existing.data)
  return (
    <SheetFrame open={open} onClose={onClose} initialFocus="#ge-amount" size="lg">
      {ready ? (
        <ExpenseForm key={openCount} group={group.data as GroupDetailDTO} expense={existing.data} prefill={prefill} notice={notice} onDone={onClose} />
      ) : group.isError || existing.isError ? (
        <div className="flex flex-col gap-3 p-6 pr-14" role="alert">
          <DialogTitle className="font-display text-xl">{expenseId ? 'Edit expense' : 'Add expense'}</DialogTitle>
          <DialogDescription>Couldn’t load this group. Check your connection and try again.</DialogDescription>
          <Button variant="outline" className="min-h-12 self-start rounded-chip" onClick={() => { void group.refetch(); if (expenseId) void existing.refetch() }}>Try again</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-6" role="status" aria-label="Loading">
          <DialogTitle className="sr-only">{expenseId ? 'Edit expense' : 'Add expense'}</DialogTitle>
          <DialogDescription className="sr-only">Loading the group</DialogDescription>
          <Skeleton className="h-12 w-40" /><Skeleton className="h-12 w-full" /><Skeleton className="h-32 w-full" />
        </div>
      )}
    </SheetFrame>
  )
}
