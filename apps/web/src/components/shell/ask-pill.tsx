'use client'
import { Plus, Sparkles } from 'lucide-react'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'
import { usePaletteShortcutLabel } from './shortcut-label'

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Part A: opens the command palette. Part C upgrades the same pill to the agent. */
export function AskPill({ onOpenPalette }: { onOpenPalette: () => void }) {
  const quick = useQuickAdd()
  const shortcut = usePaletteShortcutLabel()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 lg:bottom-6">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-[20px] border bg-popover/95 p-1.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] backdrop-blur">
        <button
          type="button"
          onClick={onOpenPalette}
          aria-keyshortcuts="Control+K Meta+K"
          className={`flex min-h-12 flex-1 items-center gap-2 rounded-2xl px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-surface-2 active:scale-[0.99] ${ring}`}
        >
          <Sparkles className="size-4 text-primary" aria-hidden />
          Ask Coinflow… <span className="hidden sm:inline">try “250 food lunch”</span>
          {shortcut && <kbd className="ml-auto hidden font-mono text-xs sm:inline">{shortcut}</kbd>}
        </button>
        <button
          type="button"
          aria-label="Add expense"
          data-testid="ask-add"
          data-quick-add-return
          onClick={() => quick.open()}
          className={`grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground active:scale-[0.95] lg:hidden ${ring} focus-visible:ring-offset-2 focus-visible:ring-offset-popover`}
        >
          <Plus className="size-6" aria-hidden />
        </button>
      </div>
    </div>
  )
}
