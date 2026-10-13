'use client'
import { Plus, Sparkles } from 'lucide-react'
import { useAgent } from '@/components/agent/agent-provider'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'
import { pillAction } from '@/lib/agent-health'
import { usePaletteShortcutLabel } from './shortcut-label'

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Opens the agent panel (spec §4.7), also while health is still loading; only a confirmed offline answer says so and
 * opens the command palette instead.
 */
export function AskPill({ onOpenPalette }: { onOpenPalette: () => void }) {
  const quick = useQuickAdd()
  const shortcut = usePaletteShortcutLabel()
  const agent = useAgent()
  const offline = pillAction(agent.healthState) === 'palette'
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 lg:bottom-6">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-[20px] border bg-popover/95 p-1.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] backdrop-blur">
        <button
          type="button"
          onClick={offline ? onOpenPalette : () => agent.open()}
          aria-keyshortcuts="Control+K Meta+K"
          className={`flex min-h-12 flex-1 items-center gap-2 rounded-2xl px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-surface-2 active:scale-[0.99] ${ring}`}
        >
          <Sparkles className="size-4 text-primary" aria-hidden />
          {offline ? (
            <>Assistant offline <span className="sr-only">. Open quick commands</span><span className="hidden sm:inline">· quick add still works</span></>
          ) : (
            <>Ask Coinflow… <span className="hidden sm:inline">try “250 lunch with Asha”</span></>
          )}
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
