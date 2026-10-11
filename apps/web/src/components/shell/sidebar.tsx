'use client'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSyncExternalStore } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { isActivePath, NAV_ITEMS } from './nav-items'
import { sidebarStore } from './sidebar-store'

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function Sidebar() {
  const path = usePathname()
  const collapsed = useSyncExternalStore(sidebarStore.subscribe, sidebarStore.get, sidebarStore.server)
  const animated = useSyncExternalStore(sidebarStore.subscribe, sidebarStore.animated, sidebarStore.animatedServer)

  return (
    <TooltipProvider>
      <nav
        id="app-sidebar"
        aria-label="Main"
        data-collapsed={collapsed}
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col gap-1 border-r bg-card/40 p-3 lg:flex',
          animated && 'transition-[width] duration-200 motion-reduce:transition-none',
          collapsed ? 'w-[76px]' : 'w-60',
        )}
      >
        <Link
          href="/home"
          aria-label={collapsed ? 'Coinflow home' : undefined}
          className={cn('mb-4 flex min-h-12 items-center gap-2 rounded-chip px-2 font-display text-xl font-bold', ring, collapsed && 'justify-center px-0')}
        >
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-chip bg-primary text-primary-foreground">₹</span>
          {!collapsed && <span>coinflow</span>}
        </Link>

        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(path, href)
          const link = (
            <Link
              href={href}
              aria-current={active ? 'page' : undefined}
              aria-label={collapsed ? label : undefined}
              className={cn(
                'flex min-h-12 items-center gap-3 rounded-chip px-3 text-sm transition-colors hover:bg-surface-2 active:scale-[0.98]',
                ring,
                collapsed && 'justify-center px-0',
                active ? 'bg-surface-2 text-foreground' : 'text-muted-foreground',
              )}
            >
              <Icon className={cn('size-5 shrink-0', active && 'text-primary')} aria-hidden />
              {!collapsed && label}
            </Link>
          )
          if (!collapsed) return <div key={href}>{link}</div>
          return (
            <Tooltip key={href}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          )
        })}

        {(() => {
          const toggle = (
            <button
              type="button"
              aria-expanded={!collapsed}
              aria-controls="app-sidebar"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => sidebarStore.set(!collapsed)}
              className={cn(
                'flex min-h-12 w-full items-center gap-3 rounded-chip px-3 text-sm text-muted-foreground transition-colors hover:bg-surface-2 active:scale-[0.98]',
                ring,
                collapsed && 'justify-center px-0',
              )}
            >
              {collapsed ? <PanelLeftOpen className="size-5" aria-hidden /> : <PanelLeftClose className="size-5" aria-hidden />}
              {!collapsed && <span>Collapse</span>}
            </button>
          )
          return (
            <div className="mt-auto">
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{toggle}</TooltipTrigger>
                  <TooltipContent side="right">Expand sidebar</TooltipContent>
                </Tooltip>
              ) : (
                toggle
              )}
            </div>
          )
        })()}
      </nav>
    </TooltipProvider>
  )
}
