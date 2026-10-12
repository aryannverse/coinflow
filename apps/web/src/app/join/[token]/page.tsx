import Link from 'next/link'
import { redirect } from 'next/navigation'
import { JoinView } from '@/components/join/join-view'
import { AppProviders } from '@/components/providers/app-providers'
import { requireCurrentUser } from '@/server/auth'
import { AppError } from '@/server/errors'
import { previewInvite } from '@/server/services/groups/invites'

export const metadata = { title: 'Join a group' }

/** Spec §3.3: signed-out visitors go to sign in and come straight back; members go straight to the group. */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const back = `/join/${encodeURIComponent(token)}`
  const user = await requireCurrentUser().catch((err) => {
    if (err instanceof AppError && err.status === 401) redirect(`/sign-in?redirect_url=${encodeURIComponent(back)}`)
    throw err
  })
  const preview = await previewInvite(user.id, token).catch((err) => {
    if (err instanceof AppError && err.code === 'invite_invalid') return null
    throw err
  })
  if (preview?.myMemberId) redirect(`/groups/${preview.group.id}`)
  return (
    <AppProviders motionPref={user.reducedMotion}>
      <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
        {preview ? (
          <JoinView token={token} preview={preview} defaultName={user.name} />
        ) : (
          <div className="flex flex-col gap-3 text-center">
            <h1 className="font-display text-2xl font-bold">This invite link doesn’t work any more</h1>
            <p className="text-muted-foreground">It may have been replaced with a new one. Ask the person who sent it for the latest link.</p>
            <Link href="/home" className="mx-auto inline-flex min-h-12 items-center rounded-chip px-4 underline underline-offset-4">Go to Coinflow</Link>
          </div>
        )}
      </main>
    </AppProviders>
  )
}
