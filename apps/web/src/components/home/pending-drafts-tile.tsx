'use client'
import { useMotionReady, useReducedMotion } from '@/components/providers/motion-pref'
import { BorderBeam } from '@/components/ui/border-beam'
import { Button } from '@/components/ui/button'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'
import { useConfirmDraft, useDrafts, useSkipDraft } from '@/hooks/queries'
import type { TransactionDTO } from '@/lib/api-types'
import { formatINR } from '@/lib/money'
import { TileHeading } from './tile-heading'

export function PendingDraftsTile({ initial }: { initial?: TransactionDTO[] }) {
  const { data: drafts = [] } = useDrafts(initial)
  const confirm = useConfirmDraft()
  const skip = useSkipDraft()
  const quick = useQuickAdd()
  const reduced = useReducedMotion()
  const showBeam = useMotionReady() && !reduced
  if (drafts.length === 0) return null
  return (
    <section aria-labelledby="drafts-title" className="relative overflow-hidden rounded-tile border bg-card p-5">
      {showBeam && <BorderBeam size={120} duration={8} colorFrom="#C8F560" colorTo="#7FD8C4" />}
      <TileHeading id="drafts-title">Waiting for you · {drafts.length}</TileHeading>
      <p className="mt-1 text-sm text-muted-foreground">Scheduled items don’t count as spent until you confirm them.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {drafts.map((d) => {
          const name = d.note ?? d.category.name
          const confirming = confirm.isPending && confirm.variables?.id === d.id
          const skipping = skip.isPending && skip.variables?.id === d.id
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-chip bg-surface-2 p-2">
              <span aria-hidden>{d.category.emoji}</span>
              <span className="min-w-0 flex-1 text-sm">{name} · <span className="amount">{formatINR(d.amount)}</span></span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  className="min-h-12 min-w-12 active:scale-[0.97]"
                  disabled={confirming || skipping}
                  onClick={() => confirm.mutate({ id: d.id, name })}
                >
                  {confirming ? 'Confirming…' : 'Confirm'}<span className="sr-only"> {name}</span>
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="min-h-12 min-w-12 active:scale-[0.97]"
                  onClick={() =>
                    quick.open({
                      editId: d.id,
                      type: d.type,
                      amount: d.amount,
                      categoryId: d.categoryId,
                      note: d.note,
                      method: d.method,
                      occurredAt: d.occurredAt,
                    })
                  }
                >
                  Edit<span className="sr-only"> {name}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-12 min-w-12 active:scale-[0.97]"
                  disabled={confirming || skipping}
                  onClick={() => skip.mutate({ id: d.id, name })}
                >
                  {skipping ? 'Skipping…' : 'Skip'}<span className="sr-only"> {name}</span>
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
