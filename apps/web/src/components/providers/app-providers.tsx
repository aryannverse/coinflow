'use client'
import type { MotionPref } from '@/lib/motion-pref'
import { LenisProvider } from './lenis-provider'
import { MotionPrefProvider } from './motion-pref'

/**
 * Per-route-group providers. Mount exactly once per tree (marketing, app, onboarding);
 * sign-in/up get none. Theme lives in the root layout (`ThemeRoot`), not here.
 * Task 14 adds QueryProvider (outermost) and UndoToaster.
 */
export function AppProviders({ motionPref, children }: { motionPref: MotionPref; children: React.ReactNode }) {
  return (
    <MotionPrefProvider initial={motionPref}>
      <LenisProvider>{children}</LenisProvider>
    </MotionPrefProvider>
  )
}
