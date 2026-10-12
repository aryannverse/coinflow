'use client'
import { MoneyInput } from './money-input'
import { MemberAvatar } from './member-avatar'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { GroupMemberDTO } from '@/lib/api-types'
import type { ExpenseDraft } from '@/lib/expense-form'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'

const nameOf = (m: GroupMemberDTO) => (m.isMe ? 'You' : m.displayName)
export const CHOICE = 'min-h-12 gap-2 rounded-chip border bg-surface-2 px-3 active:scale-[0.97] data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'

/** "Paid by" defaults to me; "Multiple payers" opens rows with a remaining-to-assign counter (spec §3.5). */
export function PayersEditor({ members, draft, leftPaise, error, onChange }: {
  members: GroupMemberDTO[]; draft: ExpenseDraft; leftPaise: number; error: string | null; onChange: (patch: Partial<ExpenseDraft>) => void
}) {
  const multi = draft.multiplePayers
  return (
    <fieldset id="ge-payers" className="flex flex-col gap-2">
      <legend className="mb-2 text-sm text-muted-foreground">Paid by</legend>
      {multi ? (
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li key={m.id} className="flex min-h-12 items-center gap-3">
              <MemberAvatar name={m.displayName} claimed={m.claimed} size={32} />
              <span className="min-w-0 flex-1 truncate text-sm">{nameOf(m)}</span>
              <MoneyInput
                id={`ge-paid-${m.id}`} label={`Amount paid by ${nameOf(m)}`} value={draft.paid[m.id] ?? ''}
                invalid={Boolean(error)} describedBy={error ? 'ge-payers-error' : undefined}
                onChange={(v) => onChange({ paid: { ...draft.paid, [m.id]: v } })}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ToggleGroup type="single" aria-label="Paid by" aria-describedby={error ? 'ge-payers-error' : undefined} value={draft.payerId} onValueChange={(v) => v && onChange({ payerId: v })} className="flex w-full flex-wrap justify-start gap-2">
          {members.map((m) => (
            <ToggleGroupItem key={m.id} value={m.id} className={CHOICE}>
              <MemberAvatar name={m.displayName} claimed={m.claimed} size={28} />
              {nameOf(m)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      <button
        type="button" aria-pressed={multi}
        onClick={() => onChange(multi ? { multiplePayers: false } : { multiplePayers: true, paid: { [draft.payerId]: draft.amount } })}
        className="min-h-12 self-start rounded-chip px-1 text-sm text-primary underline underline-offset-4 active:scale-[0.97]"
      >
        Multiple payers
      </button>
      {multi && (
        <p role="status" className={cn('text-sm', leftPaise === 0 ? 'text-muted-foreground' : 'text-neutral-negative')}>
          {leftPaise === 0 ? 'Payments add up to the total.' : leftPaise > 0 ? `${formatINR(leftPaise)} left to assign` : `${formatINR(-leftPaise)} more than the total`}
        </p>
      )}
      {error && <p id="ge-payers-error" role="alert" className="text-sm text-neutral-negative">{error}</p>}
    </fieldset>
  )
}
