'use client'
import { Minus, Plus } from 'lucide-react'
import type { GroupMemberDTO } from '@/lib/api-types'
import type { ExpenseDraft, Preview } from '@/lib/expense-form'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { MemberAvatar } from './member-avatar'
import { MoneyInput } from './money-input'

const nameOf = (m: GroupMemberDTO) => (m.isMe ? 'You' : m.displayName)

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= 0} onClick={() => onChange(value - 1)}
        className="grid size-12 place-items-center rounded-chip border bg-surface-2 active:scale-[0.97] disabled:opacity-50"><Minus className="size-4" aria-hidden /></button>
      <span className="amount w-8 text-center" aria-live="polite">{value}</span>
      <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= 1000} onClick={() => onChange(value + 1)}
        className="grid size-12 place-items-center rounded-chip border bg-surface-2 active:scale-[0.97] disabled:opacity-50"><Plus className="size-4" aria-hidden /></button>
    </div>
  )
}

export function SplitEditor({ members, draft, preview, error, onChange }: {
  members: GroupMemberDTO[]; draft: ExpenseDraft; preview: Preview; error: string | null; onChange: (patch: Partial<ExpenseDraft>) => void
}) {
  const people = members.filter((m) => draft.participants.includes(m.id))
  const share = (id: string) => preview.rows.find((r) => r.memberId === id)?.sharePaise
  const summary = error ?? preview.error?.message ?? (people.length ? `${people.length} ${people.length === 1 ? 'person' : 'people'} · shares add up to the total` : 'Pick who to split with.')
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {people.map((m) => {
          const s = share(m.id)
          return (
            <li key={m.id} className="flex min-h-12 items-center gap-2 rounded-chip bg-surface-2/60 px-2">
              <MemberAvatar name={m.displayName} claimed={m.claimed} size={32} />
              <span className="min-w-0 flex-1 truncate text-sm">{nameOf(m)}</span>
              {draft.mode === 'exact' && (
                <MoneyInput id={`ge-exact-${m.id}`} label={`Amount for ${nameOf(m)}`} value={draft.exact[m.id] ?? ''}
                  invalid={Boolean(error)} onChange={(v) => onChange({ exact: { ...draft.exact, [m.id]: v } })} />
              )}
              {draft.mode === 'shares' && (
                <Stepper label={`Shares for ${nameOf(m)}`} value={draft.shares[m.id] ?? 0} onChange={(n) => onChange({ shares: { ...draft.shares, [m.id]: n } })} />
              )}
              {draft.mode === 'percent' && (
                <div className="flex items-center gap-1">
                  <label htmlFor={`ge-pct-${m.id}`} className="sr-only">Percent for {nameOf(m)}</label>
                  <input id={`ge-pct-${m.id}`} inputMode="decimal" value={draft.percent[m.id] ?? ''} placeholder="0"
                    onChange={(e) => onChange({ percent: { ...draft.percent, [m.id]: e.target.value.replace(/[^\d.]/g, '') } })}
                    className="amount min-h-12 w-16 rounded-chip border bg-surface-2 px-2 text-right outline-none focus:border-primary focus:ring-3 focus:ring-ring" />
                  <span aria-hidden className="text-muted-foreground">%</span>
                </div>
              )}
              {/* Live preview of what each person will owe for this expense. */}
              <span className="amount w-20 shrink-0 text-right text-sm tabular-nums">{s === undefined ? '—' : formatINR(s)}</span>
            </li>
          )
        })}
      </ul>
      <p role="status" className={cn('text-sm', error || preview.error ? 'text-neutral-negative' : 'text-muted-foreground')}>{summary}</p>
    </div>
  )
}
