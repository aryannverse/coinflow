'use client'
import { useTheme } from 'next-themes'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { useReducedMotion } from '@/components/providers/motion-pref'
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { useUndo } from '@/hooks/queries'
import { resolveUndoTarget, UNDO_VISIBLE_MS, undoStore } from '@/lib/undo-store'
import { useUndoShortcut } from './use-undo-shortcut'

/** Seconds-left ring. Ticks once a second (a static ring) under reduced motion. */
function Countdown({ createdAt }: { createdAt: number }) {
  const reduced = useReducedMotion()
  const [left, setLeft] = useState(UNDO_VISIBLE_MS)
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, UNDO_VISIBLE_MS - (Date.now() - createdAt))), reduced ? 1000 : 100)
    return () => clearInterval(id)
  }, [createdAt, reduced])
  return (
    <div aria-hidden="true" className="relative size-9 shrink-0">
      {/* The vendored ring prints a percentage; hide it and show whole seconds instead. */}
      <AnimatedCircularProgressBar
        className="size-9 [&>span]:hidden" max={UNDO_VISIBLE_MS} min={0} value={left}
        gaugePrimaryColor="var(--primary)" gaugeSecondaryColor="var(--surface-2)"
      />
      <span className="absolute inset-0 grid place-items-center font-mono text-[10px] tabular-nums">{Math.ceil(left / 1000)}</span>
    </div>
  )
}

export function UndoToaster() {
  const entry = useSyncExternalStore(undoStore.subscribe, undoStore.current, () => null)
  const { mutate: undoMutate } = useUndo() // stable: depending on the whole mutation object would restart the 10 s timer every render
  const { resolvedTheme } = useTheme()
  useUndoShortcut()

  useEffect(() => {
    if (!entry) return
    let fired = false // per toast: a second click must not undo twice
    const id = toast.custom(
      (t) => (
        <div role="status" className="flex w-[min(92vw,380px)] items-center gap-3 rounded-tile border bg-popover p-3 text-popover-foreground shadow-lg">
          <Countdown createdAt={entry.createdAt} />
          <p className="flex-1 text-sm">{entry.label}</p>
          <Button
            variant="secondary" className="min-h-12 min-w-12 px-4 active:scale-[0.97]"
            onClick={() => {
              // The toast can outlive the store window (sonner pauses on hover/hidden tab), so undo its OWN entry.
              const target = resolveUndoTarget(undoStore.current(), entry, fired)
              fired = true
              if (target.clearStore) undoStore.clear(entry.auditId)
              if (target.auditId) undoMutate(target.auditId)
              toast.dismiss(t)
            }}
          >
            Undo <kbd className="ml-2 hidden font-mono text-xs text-muted-foreground sm:inline">⌘Z</kbd>
          </Button>
        </div>
      ),
      { id: entry.auditId, duration: UNDO_VISIBLE_MS, onAutoClose: () => undoStore.clear(entry.auditId) },
    )
    return () => {
      toast.dismiss(id)
    }
  }, [entry, undoMutate])

  return <Toaster position="bottom-center" offset={96} theme={resolvedTheme as 'light' | 'dark' | undefined} />
}
