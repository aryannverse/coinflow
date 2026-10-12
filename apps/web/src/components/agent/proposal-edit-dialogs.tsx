'use client'
import { useState } from 'react'
import { SheetFrame } from '@/components/groups/sheet-frame'
import { MoneyInput } from '@/components/groups/money-input'
import { RecurringForm } from '@/components/recurring/recurring-form'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useCategories, useUpsertBudget } from '@/hooks/queries'
import { ApiError } from '@/lib/api-client'
import { MAX_AMOUNT_PAISE, paiseToRupeeString, parseRupeesToPaise } from '@/lib/money'
import type { ProposalInput } from '@/lib/schemas/proposals'
import { useAgent } from './agent-provider'

export type RecurringPayloadInput = Extract<ProposalInput, { kind: 'recurring' }>['payload']
export type BudgetPayloadInput = Extract<ProposalInput, { kind: 'budget' }>['payload']

const BODY = 'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 lg:px-6 lg:pb-6 lg:pt-6'

/** Spec §4.4 Edit for proposals with no sheet of their own: the recurring form, or a one-field monthly plan. */
export function ProposalEditDialogs() {
  const { editing, setEditing } = useAgent()
  const { data: categories = [] } = useCategories()
  const close = () => setEditing(null)
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'this category'

  if (editing?.kind === 'recurring') {
    const p = editing.payload
    return (
      <SheetFrame open onClose={close} initialFocus="#rf-name">
        <div className={BODY}>
          <div className="flex flex-col gap-1.5 pr-12">
            <DialogTitle className="font-display text-xl">Edit recurring</DialogTitle>
            <DialogDescription>Coinflow drafted this from your chat. Change anything, then save.</DialogDescription>
          </div>
          <RecurringForm
            kindDefault={p.kind}
            prefill={{ name: p.name, category: catName(p.categoryId), amount: p.amount, cadence: p.cadence, nextDueOn: p.nextDueOn, categoryId: p.categoryId }}
            onDone={close}
          />
        </div>
      </SheetFrame>
    )
  }
  if (editing?.kind === 'budget') {
    return (
      <SheetFrame open onClose={close} initialFocus="#budget-plan" size="sm">
        <BudgetBody payload={editing.payload} name={catName(editing.payload.categoryId)} onDone={close} />
      </SheetFrame>
    )
  }
  return null
}

function BudgetBody({ payload, name, onDone }: { payload: BudgetPayloadInput; name: string; onDone: () => void }) {
  const upsert = useUpsertBudget()
  const [value, setValue] = useState(() => paiseToRupeeString(payload.monthlyLimit))
  const [error, setError] = useState<string | null>(null)

  function save(e: React.FormEvent) {
    e.preventDefault()
    if (upsert.isPending) return
    const paise = parseRupeesToPaise(value.endsWith('.') ? value.slice(0, -1) : value)
    if (!paise || paise > MAX_AMOUNT_PAISE) return setError('Enter a monthly plan more than ₹0.')
    setError(null)
    upsert.mutate(
      { categoryId: payload.categoryId, monthlyLimit: paise, name },
      {
        onSuccess: onDone,
        // A 422 belongs beside the field; anything else already raised a toast.
        onError: (err) => setError(err instanceof ApiError && err.field ? err.message : null),
      },
    )
  }

  return (
    <form onSubmit={save} className={BODY} noValidate>
      <div className="flex flex-col gap-1.5 pr-12">
        <DialogTitle className="font-display text-xl">Plan for {name}</DialogTitle>
        <DialogDescription>How much you’d like to spend on {name} each month.</DialogDescription>
      </div>
      <MoneyInput
        id="budget-plan" label="Monthly plan" hideLabel={false} value={value}
        onChange={(v) => { setValue(v); setError(null) }}
        invalid={Boolean(error)} describedBy={error ? 'budget-plan-error' : undefined}
      />
      {error && <p id="budget-plan-error" role="alert" className="-mt-2 text-sm text-neutral-negative">{error}</p>}
      <Button type="submit" aria-disabled={upsert.isPending || undefined} className="min-h-12 rounded-chip active:scale-[0.97]">
        {upsert.isPending ? 'Saving…' : 'Save plan'}
      </Button>
    </form>
  )
}
