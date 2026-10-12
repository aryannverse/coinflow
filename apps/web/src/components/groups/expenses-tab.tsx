'use client'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { gk, useDeleteGroupExpense, useGroupExpenses } from '@/hooks/group-queries'
import { useFocusAfterRemoval } from '@/hooks/use-focus-after-removal'
import type { GroupDetailDTO, GroupExpenseDTO, Page } from '@/lib/api-types'
import { formatINR } from '@/lib/money'
import { useGroupSheets } from './group-sheets'

const RING = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring'
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

/** "You", "You and Ravi", "You, Ravi and Asha" — you first, then group order. */
function payerNames(e: GroupExpenseDTO, group: GroupDetailDTO): string {
  const paid = new Set(e.payers.filter((p) => p.paidPaise > 0).map((p) => p.memberId))
  const names = group.members
    .filter((m) => paid.has(m.id))
    .sort((a, b) => Number(b.isMe) - Number(a.isMe))
    .map((m) => (m.isMe ? 'You' : m.displayName))
  if (names.length <= 1) return names[0] ?? 'Someone'
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** Spec §3.5 Expenses tab: payer(s), participants and your share. `#expense-<id>` (from a notification) outlines its row. */
export function ExpensesTab({ group, initial }: { group: GroupDetailDTO; initial: Page<GroupExpenseDTO> }) {
  const q = useGroupExpenses(group.id, initial)
  const sheets = useGroupSheets()
  const del = useDeleteGroupExpense()
  const qc = useQueryClient()
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data])
  const focus = useFocusAfterRemoval(items.map((e) => e.id))

  function open(e: GroupExpenseDTO) {
    // The row already holds the whole expense: seed it so the sheet opens filled in, without a loading flash.
    qc.setQueryData(gk.expense(group.id, e.id), e)
    sheets.openExpense({ groupId: group.id, expenseId: e.id })
  }

  function remove(e: GroupExpenseDTO) {
    const i = items.findIndex((x) => x.id === e.id)
    const next = items[i + 1] ?? items[i - 1]
    focus.arm(e.id, next ? `#expense-${next.id} [data-row-main]` : null, 'expenses-h')
    del.mutate({ groupId: group.id, expenseId: e.id, description: e.description, amountPaise: e.amountPaise }, { onError: focus.disarm })
  }

  return (
    <section aria-labelledby="expenses-h" className="flex flex-col gap-3">
      <h2 id="expenses-h" tabIndex={-1} className="sr-only">Expenses</h2>
      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-tile border bg-card p-5">
          <p className="text-muted-foreground">No expenses yet. Add the first one — who paid and who was there.</p>
          <Button onClick={() => sheets.openExpense({ groupId: group.id })} className="min-h-12 gap-2 rounded-chip px-4 active:scale-[0.97]">
            <Plus className="size-4" aria-hidden /> Add expense
          </Button>
        </div>
      ) : (
        <ul aria-label="Expenses" className="flex flex-col gap-1.5">
          {items.map((e) => {
            const people = e.shares.filter((s) => s.sharePaise > 0).length
            const mine = e.mySharePaise > 0 ? `Your share ${formatINR(e.mySharePaise)}` : 'Not involved'
            return (
              <li key={e.id} id={`expense-${e.id}`}
                className="group relative flex min-h-16 scroll-mt-24 items-center gap-1 rounded-chip bg-card px-2 target:ring-2 target:ring-primary lg:hover:bg-surface-2">
                <button type="button" data-row-main onClick={() => open(e)}
                  className={`flex min-h-16 min-w-12 flex-1 items-center gap-3 rounded-chip py-2 text-left active:scale-[0.99] ${RING}`}>
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-chip bg-surface-2">{e.category.emoji}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{e.description}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      Paid by {payerNames(e, group)} · {people} {people === 1 ? 'person' : 'people'} · {dayLabel(e.occurredAt)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="amount">{formatINR(e.amountPaise)}</span>
                    <span className={`text-xs ${e.mySharePaise > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{mine}</span>
                  </span>
                </button>
                {/* Always visible on touch; on desktop it appears on hover or focus, like TransactionRow. */}
                <div className="shrink-0 lg:opacity-0 lg:transition-opacity lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                  <button type="button" aria-label={`Delete ${e.description}`} onClick={() => remove(e)}
                    className={`grid size-12 place-items-center rounded-chip text-muted-foreground hover:bg-accent hover:text-foreground active:scale-[0.97] ${RING}`}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {q.hasNextPage && (
        <Button variant="outline" aria-disabled={q.isFetchingNextPage || undefined}
          onClick={() => { if (!q.isFetchingNextPage) void q.fetchNextPage() }}
          className="min-h-12 self-center rounded-chip px-4 active:scale-[0.97] aria-disabled:opacity-50">
          {q.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      )}
      <p role="status" className="sr-only">{q.isFetchingNextPage ? 'Loading more expenses' : ''}</p>
    </section>
  )
}
