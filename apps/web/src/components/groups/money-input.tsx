'use client'
import { cn } from '@/lib/utils'

/** Compact ₹ field for rows (payers, exact, items). The label is always present; visually hidden when `hideLabel`. */
export function MoneyInput({ id, label, value, onChange, invalid, describedBy, hideLabel = true, className }: {
  id: string; label: string; value: string; onChange: (v: string) => void; invalid?: boolean
  /** Id of the inline error (or hint) this field is described by. */
  describedBy?: string; hideLabel?: boolean; className?: string
}) {
  return (
    <div className={cn('flex flex-col', className)}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-1 text-sm text-muted-foreground'}>{label}</label>
      <div className="flex min-h-12 items-center gap-1 rounded-chip border bg-surface-2 px-2 focus-within:border-primary focus-within:ring-3 focus-within:ring-ring has-aria-invalid:border-neutral-negative">
        <span aria-hidden className="amount text-muted-foreground">₹</span>
        <input
          id={id} inputMode="decimal" autoComplete="off" value={value} placeholder="0"
          aria-invalid={invalid || undefined} aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
          className="amount min-h-12 w-20 min-w-0 flex-1 bg-transparent text-right outline-none placeholder:text-muted-foreground/50"
        />
      </div>
    </div>
  )
}
