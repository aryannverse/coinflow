'use client'
import { useTheme } from 'next-themes'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { useReducedMotion } from '@/components/providers/motion-pref'
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { useShortcutLabel } from '@/components/shell/shortcut-label'
import { useUndo } from '@/hooks/queries'
import { useMediaQuery } from '@/hooks/use-media-query'
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

/** ⌘Z on Apple platforms, Ctrl Z elsewhere; nothing until the platform is known (hydration-safe). */
function UndoKbd() {
  const label = useShortcutLabel('Z')
  if (!label) return null
  return <kbd className="ml-2 hidden font-mono text-xs text-muted-foreground sm:inline">{label}</kbd>
}

/**
 * The toast must clear the floating Ask pill and the bottom tabs below 1024 px (152 px; sonner's
 * `mobileOffset` takes over under 600 px and adds the home-indicator inset), and sits 96 px up on desktop.
 */
const DESKTOP_OFFSET = { bottom: 96 }
const MOBILE_OFFSET = { bottom: 152 }
const PHONE_OFFSET = { bottom: 'calc(152px + env(safe-area-inset-bottom))' }

export function UndoToaster() {
  const entry = useSyncExternalStore(undoStore.subscribe, undoStore.current, () => null)
  const { mutate: undoMutate } = useUndo() // stable: depending on the whole mutation object would restart the 10 s timer every render
  const { resolvedTheme } = useTheme()
  const desktop = useMediaQuery('(min-width:1024px)') ?? false
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
              const target = resolveUndoTarget(undoStore.current(), entry, {
                fired, consumed: undoStore.isConsumed(entry.auditId),
              })
              fired = true
              if (target.clearStore) undoStore.clear(entry.auditId)
              if (target.auditId) {
                undoStore.markConsumed(target.auditId)
                undoMutate(target.auditId)
              }
              toast.dismiss(t)
            }}
          >
            Undo <UndoKbd />
          </Button>
        </div>
      ),
      { id: entry.auditId, duration: UNDO_VISIBLE_MS, onAutoClose: () => undoStore.clear(entry.auditId) },
    )
    return () => {
      toast.dismiss(id)
    }
  }, [entry, undoMutate])

  return (
    <Toaster
      position="bottom-center" offset={desktop ? DESKTOP_OFFSET : MOBILE_OFFSET} mobileOffset={PHONE_OFFSET}
      theme={resolvedTheme as 'light' | 'dark' | undefined}
    />
  )
}
