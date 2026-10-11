'use client'
import { UndoToaster } from '@/components/undo/undo-toaster'
import type { MotionPref } from '@/lib/motion-pref'
import { LenisProvider } from './lenis-provider'
import { MotionPrefProvider } from './motion-pref'
import { QueryProvider } from './query-provider'

/**
 * Per-route-group providers. Mount exactly once per tree (marketing, app, onboarding);
 * sign-in/up get none. Theme lives in the root layout (`ThemeRoot`), not here.
 */
export function AppProviders({ motionPref, children }: { motionPref: MotionPref; children: React.ReactNode }) {
  return (
    <QueryProvider>
      <MotionPrefProvider initial={motionPref}>
        <LenisProvider>{children}</LenisProvider>
        <UndoToaster />
      </MotionPrefProvider>
    </QueryProvider>
  )
}
