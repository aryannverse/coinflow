'use client'
import { useCallback, useState } from 'react'
import { QuickAddProvider } from '@/components/quick-add/quick-add-provider'
import { QuickAddSheet } from '@/components/quick-add/quick-add-sheet'
import { AskPill } from './ask-pill'
import { BottomTabs } from './bottom-tabs'
import { CommandPalette } from './command-palette'
import { OfflineBanner } from './offline-banner'
import { Shortcuts } from './shortcuts'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [palette, setPalette] = useState(false)
  const openPalette = useCallback(() => setPalette(true), [])
  return (
    <QuickAddProvider>
      <OfflineBanner />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-chip focus:bg-primary focus:p-3 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pb-44 pt-6 outline-none lg:px-8 lg:pb-28">
            {children}
          </main>
        </div>
      </div>
      <AskPill onOpenPalette={openPalette} />
      <BottomTabs />
      <CommandPalette open={palette} onOpenChange={setPalette} />
      <QuickAddSheet />
      <Shortcuts onPalette={openPalette} />
    </QuickAddProvider>
  )
}
