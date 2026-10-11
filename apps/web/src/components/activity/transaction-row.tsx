'use client'
import { Trash2 } from 'lucide-react'
import { motion, useAnimation } from 'motion/react'
import { useRef } from 'react'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'
import type { TransactionDTO } from '@/lib/api-types'
import { METHODS } from '@/lib/activity-filters'
import { formatINR } from '@/lib/money'

const SWIPE_TO_DELETE = -80
const RING = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60'

const methodLabel = (m: string) => METHODS.find((x) => x.value === m)?.label ?? m
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

export function TransactionRow({ t, onDelete }: { t: TransactionDTO; onDelete: (t: TransactionDTO) => void }) {
  const quick = useQuickAdd()
  const controls = useAnimation()
  // Swipe is a touch shortcut. On desktop a mouse drag must never delete; the Delete button covers it.
  const swipe = useMediaQuery('(max-width: 1023px)') === true
  const dragged = useRef(false)

  const name = t.note ?? t.category.name
  const amount = formatINR(t.amount)
  const edit = () => {
    if (dragged.current) return // the click that ends a drag is not a tap
    quick.open({ editId: t.id, type: t.type, amount: t.amount, categoryId: t.categoryId, note: t.note, method: t.method, occurredAt: t.occurredAt })
  }

  return (
    <li data-row-id={t.id} className="group relative overflow-hidden rounded-chip">
      {swipe && (
        <div className="absolute inset-y-0 right-0 flex items-center bg-surface-2 px-4" aria-hidden>
          <Trash2 className="size-5 text-muted-foreground" />
        </div>
      )}
      <motion.div
        drag={swipe ? 'x' : false}
        dragDirectionLock
        dragConstraints={{ left: -96, right: 0 }}
        dragElastic={0.1}
        animate={controls}
        onDragStart={() => { dragged.current = true }}
        onDragEnd={(_, info) => {
          setTimeout(() => { dragged.current = false }, 0)
          const remove = info.offset.x < SWIPE_TO_DELETE
          void controls.start({ x: 0 }) // if the delete is refused, the row must not stay offset
          if (remove) onDelete(t)
        }}
        className="relative flex min-h-14 items-center gap-1 bg-card px-2 lg:hover:bg-surface-2"
      >
        <button
          type="button"
          data-row-main
          onClick={edit}
          className={`flex min-h-14 min-w-12 flex-1 items-center gap-3 rounded-chip text-left active:scale-[0.99] ${RING}`}
        >
          {/* The name comes from the visible text, so it always contains it (WCAG 2.5.3): "Edit Swiggy biryani Food · 6:00 pm · UPI −₹389". */}
          <span className="sr-only">Edit </span>
          <span className="grid size-10 shrink-0 place-items-center rounded-chip bg-surface-2" aria-hidden="true">{t.category.emoji}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm">{name}</span>
            <span className="truncate text-xs text-muted-foreground">{t.category.name} · {timeLabel(t.occurredAt)} · {methodLabel(t.method)}</span>
          </span>
          <span className={`amount shrink-0 ${t.type === 'income' ? 'text-primary' : ''}`}>{t.type === 'expense' ? '−' : '+'}{amount}</span>
        </button>
        {/* Always visible on touch (the non-drag way to delete, WCAG 2.5.7); on desktop it appears on hover or focus. */}
        <div className="shrink-0 lg:opacity-0 lg:transition-opacity lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onDelete(t)}
            aria-label={`Delete ${name} ${amount}`}
            className={`grid size-12 place-items-center rounded-chip text-muted-foreground hover:bg-accent hover:text-foreground active:scale-[0.97] ${RING}`}
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </motion.div>
    </li>
  )
}
