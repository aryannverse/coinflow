'use client'
import { useRef, useState } from 'react'
import { BILL_SUGGESTIONS, RecurringForm } from '@/components/recurring/recurring-form'
import { Button } from '@/components/ui/button'
import { useRecurring } from '@/hooks/queries'
import { formatINR } from '@/lib/money'
import { StepHeading } from './step-heading'

type Suggestion = (typeof BILL_SUGGESTIONS)[number]
const CHIP = 'min-h-12 rounded-chip border bg-surface-2 px-3 text-sm transition active:scale-[0.97]'

/**
 * Optional: bills are set aside before Safe-to-Spend. Each one is saved by the form itself, so Continue has
 * nothing extra to save. `onOpenChange` tells the flow when a form is open, so Continue can stop instead of
 * silently dropping a half-entered bill; `error` is the flow's message for that case.
 */
export function BillsStep({ onOpenChange, error }: { onOpenChange?: (open: boolean) => void; error?: string }) {
  const { data = [] } = useRecurring()
  // null: no form open. `{}`: a blank form. `{ prefill }`: a suggestion.
  const [open, setOpenState] = useState<{ prefill?: Suggestion } | null>(null)
  const setOpen = (next: { prefill?: Suggestion } | null) => {
    setOpenState(next)
    onOpenChange?.(next !== null)
  }
  const [note, setNote] = useState('')
  const status = useRef<HTMLParagraphElement>(null)
  const remaining = BILL_SUGGESTIONS.filter((s) => !data.some((d) => d.name === s.name))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <StepHeading>Any regular bills?</StepHeading>
        <p className="text-muted-foreground">Tap to add. These are set aside before we tell you what’s safe to spend. Optional: you can add more later.</p>
      </div>
      <div role="group" aria-labelledby="ob-bill-suggestions" className="flex flex-col gap-2">
        <p id="ob-bill-suggestions" className="text-sm font-medium">Common bills</p>
        <div className="flex flex-wrap gap-2">
          {remaining.map((s) => (
            <button key={s.name} type="button" className={CHIP} onClick={() => { setNote(''); setOpen({ prefill: s }) }}>
              + {s.name}
            </button>
          ))}
          <button type="button" className={CHIP} onClick={() => { setNote(''); setOpen({}) }}>
            + Something else
          </button>
        </div>
      </div>
      {open && (
        <div className="rounded-tile border bg-surface-2 p-4">
          <RecurringForm
            key={open.prefill?.name ?? 'custom'}
            prefill={open.prefill}
            kindDefault="bill"
            submitId="ob-bill-submit"
            submitDescribedBy={error ? 'ob-bills-error' : undefined}
            onDone={() => {
              setNote(`Added ${open.prefill?.name ?? 'your bill'}.`)
              setOpen(null)
              // The form and its chip are gone; keep keyboard focus in this step.
              queueMicrotask(() => status.current?.focus())
            }}
          />
          {error && (
            <p id="ob-bills-error" role="alert" className="mt-3 text-sm text-neutral-negative">
              {error}
            </p>
          )}
          <Button type="button" variant="ghost" className="mt-2 min-h-12 w-full rounded-chip active:scale-[0.97]" onClick={() => setOpen(null)}>
            Never mind
          </Button>
        </div>
      )}
      <p ref={status} role="status" tabIndex={-1} className="text-sm text-muted-foreground outline-none">
        {note}
      </p>
      {data.length > 0 && (
        <ul className="divide-y rounded-tile border text-sm" aria-label="Scheduled so far">
          {data.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0 truncate">{d.name}</span>
              <span className="amount shrink-0">{formatINR(d.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
