'use client'
import { UserButton } from '@clerk/nextjs'
import { Plus } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from '@/components/fx/theme-toggle'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'
import { Button } from '@/components/ui/button'
import { useUpdateMe } from '@/hooks/queries'
import { isActivePath, NAV_ITEMS } from './nav-items'

export function TopBar() {
  const quick = useQuickAdd()
  const updateMe = useUpdateMe()
  const path = usePathname()
  const title = NAV_ITEMS.find((i) => isActivePath(path, i.href))?.label
  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur lg:px-8">
      <span className="font-display text-lg font-bold lg:hidden">coinflow</span>
      <span className="sr-only lg:not-sr-only lg:font-display lg:text-lg">{title}</span>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle onPersist={(theme) => updateMe.mutate({ theme })} />
        <Button
          onClick={() => quick.open()}
          aria-keyshortcuts="N"
          data-quick-add-return
          className="hidden min-h-12 gap-2 rounded-chip px-4 active:scale-[0.97] lg:inline-flex"
        >
          <Plus className="size-4" aria-hidden /> Add <kbd className="font-mono text-xs opacity-70">N</kbd>
        </Button>
        <div className="grid min-h-12 min-w-12 place-items-center">
          <UserButton />
        </div>
      </div>
    </header>
  )
}
