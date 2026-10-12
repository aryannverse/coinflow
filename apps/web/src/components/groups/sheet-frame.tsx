'use client'
import { X } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'

/**
 * Radix Dialog returns focus only to its Trigger, and these dialogs and sheets have none (they open from rows, the bell
 * or another component). Spread `props` on DialogContent / SheetContent: focus goes back to whoever opened it, or to
 * the element `redirectTo(id)` named (when the opener is about to disappear), or to #main — never <body>.
 */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null)
  const redirect = useRef<string | null>(null)
  return {
    redirectTo: (id: string) => {
      redirect.current = id
    },
    props: {
      onOpenAutoFocus: () => {
        const active = document.activeElement
        opener.current = active instanceof HTMLElement && active !== document.body ? active : null
        redirect.current = null
      },
      onCloseAutoFocus: (e: Event) => {
        e.preventDefault()
        const named = redirect.current ? document.getElementById(redirect.current) : null
        const back = opener.current?.isConnected ? opener.current : null
        ;(named ?? back ?? document.getElementById('main'))?.focus()
      },
    },
  }
}

/**
 * The frame every group sheet shares (same as quick add): a centred dialog from 1024 px, a bottom sheet below it.
 * The body supplies its own DialogTitle. Radix only returns focus to a Trigger and these sheets are opened from
 * anywhere (a row, the bell, the agent panel), so the frame remembers who opened it and returns focus there.
 */
export function SheetFrame({ open, onClose, initialFocus, size = 'md', children }: {
  open: boolean
  onClose: () => void
  /** Selector focused on open, when it exists (e.g. '#ge-amount'). Otherwise Radix focuses the first control. */
  initialFocus?: string
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
}) {
  const desktop = useMediaQuery('(min-width: 1024px)') ?? false
  const focus = useReturnFocus()
  const contentProps = {
    onOpenAutoFocus: (e: Event) => {
      focus.props.onOpenAutoFocus()
      if (!initialFocus) return
      const root = e.currentTarget instanceof HTMLElement ? e.currentTarget : document
      const target = root.querySelector<HTMLElement>(initialFocus)
      if (!target) return
      e.preventDefault()
      target.focus()
    },
    onCloseAutoFocus: focus.props.onCloseAutoFocus,
  }
  // Its own row that never scrolls: as an overlay it covered whatever scrolled under it (the "Itemized" chip).
  const close = (
    <div className="flex shrink-0 justify-end px-2 pt-2">
      <DialogClose asChild>
        <Button variant="ghost" className="size-12 rounded-chip active:scale-[0.97]">
          <X className="size-5" aria-hidden />
          <span className="sr-only">Close</span>
        </Button>
      </DialogClose>
    </div>
  )
  const width = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg' }[size]
  return desktop ? (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} {...contentProps} className={cn('flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-tile p-0', width)}>
        {close}
        {children}
      </DialogContent>
    </Dialog>
  ) : (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" showCloseButton={false} {...contentProps} className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden rounded-t-tile p-0">
        {close}
        {children}
      </SheetContent>
    </Sheet>
  )
}
