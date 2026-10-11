'use client'
import { motion } from 'motion/react'
import type { KeyboardEvent } from 'react'
import type { CategoryDTO } from '@/lib/api-types'
import { cn } from '@/lib/utils'

const NEXT: Record<string, 1 | -1> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/**
 * Category radiogroup with a roving tab stop: Tab enters on the selected chip (or the first),
 * arrows move and select, Space selects. Emoji is decorative; the accessible name is the category name.
 */
export function CategoryChips({ categories, value, onChange, invalid }: {
  categories: CategoryDTO[]; value: string | null; onChange: (id: string) => void; invalid?: boolean
}) {
  const stop = categories.some((c) => c.id === value) ? value : categories[0]?.id

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = NEXT[e.key]
    if (!step || categories.length === 0) return
    e.preventDefault()
    const at = Math.max(0, categories.findIndex((c) => c.id === (value ?? stop)))
    const next = categories[(at + step + categories.length) % categories.length]
    onChange(next.id)
    e.currentTarget.querySelector<HTMLElement>(`[data-cat="${next.id}"]`)?.focus()
  }

  return (
    <div role="radiogroup" aria-label="Category" aria-invalid={invalid || undefined} onKeyDown={onKeyDown} className="flex flex-wrap gap-2">
      {categories.map((c) => {
        const selected = c.id === value
        return (
          <motion.button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={selected}
            data-cat={c.id}
            tabIndex={c.id === stop ? 0 : -1}
            onClick={() => onChange(c.id)}
            whileTap={{ scale: 0.95 }}
            className={cn(
              'flex min-h-12 items-center gap-2 rounded-chip border px-3 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring',
              selected ? 'border-primary bg-primary text-primary-foreground' : 'bg-surface-2 hover:border-primary/50',
            )}
          >
            <span aria-hidden>{c.emoji}</span> {c.name}
          </motion.button>
        )
      })}
    </div>
  )
}
