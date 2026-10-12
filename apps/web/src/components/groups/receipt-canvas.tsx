'use client'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { GroupMemberDTO } from '@/lib/api-types'
import type { ExpenseDraft, ItemDraft, Preview } from '@/lib/expense-form'
import { formatINR, parseRupeesToPaise } from '@/lib/money'
import { cn } from '@/lib/utils'
import { MemberAvatar } from './member-avatar'
import { MoneyInput } from './money-input'

const nameOf = (m: GroupMemberDTO) => (m.isMe ? 'You' : m.displayName)
const paiseOf = (t: string) => parseRupeesToPaise(t.trim() || '0') ?? 0
const itemAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-item-key]')?.dataset.itemKey ?? null

/**
 * `error` / `errorField` come only from a save attempt (typing clears them). The message is a role="alert" with id
 * `ge-split-error`; the field it names (an item's price or people, or tax / tip / discount) is marked invalid
 * (`data-invalid` is what the sheet focuses) and described by it.
 */
export function ReceiptCanvas({ members, draft, preview, error, errorField, onChange }: {
  members: GroupMemberDTO[]; draft: ExpenseDraft; preview: Preview; error: string | null; errorField?: string | null
  onChange: (patch: Partial<ExpenseDraft>) => void
}) {
  const errId = error ? 'ge-split-error' : undefined
  const bad = (field: string) => Boolean(error && errorField && (errorField === field || errorField.startsWith(`${field}.`)))
  const [drag, setDrag] = useState<{ memberId: string; x: number; y: number } | null>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const items = draft.items
  const setItems = (next: ItemDraft[]) => onChange({ items: next })
  const toggle = (key: string, memberId: string) =>
    setItems(items.map((it) => (it.key !== key ? it : {
      ...it, memberIds: it.memberIds.includes(memberId) ? it.memberIds.filter((x) => x !== memberId) : [...it.memberIds, memberId],
    })))
  const assign = (key: string, memberId: string) =>
    setItems(items.map((it) => (it.key === key && !it.memberIds.includes(memberId) ? { ...it, memberIds: [...it.memberIds, memberId] } : it)))
  const unassigned = items.filter((it) => it.memberIds.length === 0).reduce((s, it) => s + paiseOf(it.amount), 0)
  const itemsTotal = items.reduce((s, it) => s + paiseOf(it.amount), 0)
  const dragged = members.find((m) => m.id === drag?.memberId)
  const line = unassigned > 0
    ? `Unassigned ${formatINR(unassigned)}`
    : (preview.error?.message ?? `Items ${formatINR(itemsTotal)} · tax, tip and discount follow what each person had.`)

  return (
    <div className="flex flex-col gap-3">
      {/* Pointer shortcut only: the per-item toggles below do the same for touch and keyboard, so this strip is hidden from AT. */}
      <div aria-hidden="true" className="flex flex-wrap items-center gap-2 rounded-chip border border-dashed p-2">
        <span className="text-xs text-muted-foreground">Drag people onto items</span>
        {members.map((m) => (
          <div
            key={m.id}
            style={{ touchAction: 'none' }}
            className="cursor-grab select-none active:cursor-grabbing"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              setDrag({ memberId: m.id, x: e.clientX, y: e.clientY })
            }}
            onPointerMove={(e) => {
              if (drag?.memberId !== m.id) return
              setDrag({ memberId: m.id, x: e.clientX, y: e.clientY })
              setHoverKey(itemAt(e.clientX, e.clientY))
            }}
            onPointerUp={(e) => {
              if (drag?.memberId !== m.id) return
              const key = itemAt(e.clientX, e.clientY)
              setDrag(null)
              setHoverKey(null)
              if (key) assign(key, m.id)
            }}
            onPointerCancel={() => {
              setDrag(null)
              setHoverKey(null)
            }}
          >
            <MemberAvatar name={m.displayName} claimed={m.claimed} size={40} />
          </div>
        ))}
      </div>
      {drag && dragged && (
        <div aria-hidden className="pointer-events-none fixed z-[60]" style={{ left: drag.x - 20, top: drag.y - 20 }}>
          <MemberAvatar name={dragged.displayName} claimed={dragged.claimed} size={40} className="shadow-lg ring-2 ring-primary" />
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((it, i) => {
          const label = it.name.trim() || `item ${i + 1}`
          return (
            <li key={it.key} data-item-key={it.key}
              className={cn('rounded-chip border p-2 transition-colors', hoverKey === it.key && 'border-primary bg-primary/10')}>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`ge-item-name-${it.key}`} className="sr-only">Item {i + 1} name</label>
                  <Input id={`ge-item-name-${it.key}`} value={it.name} placeholder="Masala dosa" maxLength={60} className="min-h-12"
                    onChange={(e) => setItems(items.map((x) => (x.key === it.key ? { ...x, name: e.target.value } : x)))} />
                </div>
                <MoneyInput id={`ge-item-${it.key}`} label={`Price of ${label}`} value={it.amount}
                  invalid={bad(`split.items.${i}.amountPaise`)} describedBy={bad(`split.items.${i}.amountPaise`) ? errId : undefined}
                  onChange={(v) => setItems(items.map((x) => (x.key === it.key ? { ...x, amount: v } : x)))} />
                <Button type="button" variant="ghost" aria-label={`Remove ${label}`} className="size-12 rounded-chip active:scale-[0.97]"
                  onClick={() => setItems(items.filter((x) => x.key !== it.key))}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
              <div role="group" aria-label={`Who had ${label}`} aria-describedby={bad(`split.items.${i}.memberIds`) ? errId : undefined}
                className={cn('mt-2 flex flex-wrap gap-1.5', bad(`split.items.${i}.memberIds`) && 'rounded-chip ring-2 ring-neutral-negative/60')}>
                {members.map((m, mi) => {
                  const on = it.memberIds.includes(m.id)
                  return (
                    <button key={m.id} type="button" aria-pressed={on} onClick={() => toggle(it.key, m.id)}
                      data-invalid={(mi === 0 && bad(`split.items.${i}.memberIds`)) || undefined}
                      className={cn('flex min-h-12 items-center gap-1.5 rounded-chip border px-2.5 text-sm active:scale-[0.97]',
                        on ? 'border-primary bg-primary/15 text-foreground' : 'bg-surface-2 text-muted-foreground')}>
                      <MemberAvatar name={m.displayName} claimed={m.claimed} size={24} />
                      {nameOf(m)}
                    </button>
                  )
                })}
              </div>
              {it.memberIds.length === 0 && paiseOf(it.amount) > 0 && (
                <p className="mt-1 text-sm text-neutral-negative">Unassigned {formatINR(paiseOf(it.amount))}</p>
              )}
            </li>
          )
        })}
      </ul>
      <Button type="button" variant="outline" className="min-h-12 self-start rounded-chip active:scale-[0.97]"
        onClick={() => setItems([...items, { key: crypto.randomUUID(), name: '', amount: '', memberIds: [] }])}>
        <Plus className="size-4" aria-hidden /> Add item
      </Button>
      <div className="grid grid-cols-3 gap-2">
        <MoneyInput id="ge-tax" label="Tax" hideLabel={false} value={draft.tax} onChange={(v) => onChange({ tax: v })}
          invalid={bad('split.taxPaise')} describedBy={bad('split.taxPaise') ? errId : undefined} />
        <MoneyInput id="ge-tip" label="Tip" hideLabel={false} value={draft.tip} onChange={(v) => onChange({ tip: v })}
          invalid={bad('split.tipPaise')} describedBy={bad('split.tipPaise') ? errId : undefined} />
        <MoneyInput id="ge-discount" label="Discount" hideLabel={false} value={draft.discount} onChange={(v) => onChange({ discount: v })}
          invalid={bad('split.discountPaise')} describedBy={bad('split.discountPaise') ? errId : undefined} />
      </div>
      {error && <p id="ge-split-error" role="alert" className="text-sm text-neutral-negative">{error}</p>}
      <p role="status" className={cn('text-sm', unassigned > 0 || preview.error ? 'text-neutral-negative' : 'text-muted-foreground')}>{line}</p>
      {preview.rows.length > 0 && (
        <ul aria-label="Each person’s share" className="flex flex-col gap-1 text-sm">
          {preview.rows.map((r) => {
            const m = members.find((x) => x.id === r.memberId)
            return (
              <li key={r.memberId} className="flex justify-between">
                <span>{m ? nameOf(m) : 'Someone'}</span>
                <span className="amount tabular-nums">{formatINR(r.sharePaise)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
