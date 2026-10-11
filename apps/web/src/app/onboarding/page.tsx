import { redirect } from 'next/navigation'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { AppProviders } from '@/components/providers/app-providers'
import type { MeDTO } from '@/lib/api-types'
import { requireCurrentUser } from '@/server/auth'
import { AppError } from '@/server/errors'

export const metadata = { title: 'Welcome' }

export default async function OnboardingPage() {
  const user = await requireCurrentUser().catch((err) => {
    if (err instanceof AppError && err.status === 401) redirect('/sign-in')
    throw err
  })
  // The (app) layout sends un-onboarded users here, so onboarded ones must leave or they would loop.
  if (user.onboardedAt) redirect('/home')
  return (
    <AppProviders motionPref={user.reducedMotion}>
      <OnboardingFlow me={JSON.parse(JSON.stringify(user)) as MeDTO} />
    </AppProviders>
  )
}
