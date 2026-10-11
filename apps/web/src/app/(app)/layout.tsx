import { redirect } from 'next/navigation'
import { AppProviders } from '@/components/providers/app-providers'
import { AppShell } from '@/components/shell/app-shell'
import { ThemeSync } from '@/components/shell/theme-sync'
import { toISTDate } from '@/lib/dates'
import { requireCurrentUser } from '@/server/auth'
import { AppError } from '@/server/errors'
import { logger } from '@/server/logger'
import { materializeDueRecurring } from '@/server/services/recurring'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCurrentUser().catch((err) => {
    if (err instanceof AppError && err.status === 401) redirect('/sign-in')
    throw err
  })
  if (!user.onboardedAt) redirect('/onboarding')
  try {
    await materializeDueRecurring(user.id, toISTDate(new Date()))
  } catch (err) {
    // Due recurring items are a convenience; a failure here must not take the whole app down.
    logger.error({ err, userId: user.id }, 'materializeDueRecurring failed in (app) layout')
  }
  return (
    <AppProviders motionPref={user.reducedMotion}>
      <ThemeSync theme={user.theme} />
      <AppShell>{children}</AppShell>
    </AppProviders>
  )
}
