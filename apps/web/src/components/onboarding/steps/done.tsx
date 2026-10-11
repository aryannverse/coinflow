'use client'
import { AmountTicker } from '@/components/fx/amount-ticker'
import { CelebrateOnMount } from '@/components/fx/celebrate'
import { Skeleton } from '@/components/ui/skeleton'
import { useSafeToSpend } from '@/hooks/queries'
import { stsDisplay } from '@/lib/sts-display'
import { StepHeading } from './step-heading'

/** `celebrate` is false when the user comes back to this step, so the burst happens once. */
export function DoneStep({ name, celebrate }: { name: string; celebrate: boolean }) {
  const sts = useSafeToSpend()
  const view = sts.data ? stsDisplay(sts.data) : null
  const first = name.trim().split(/\s+/)[0]
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      {celebrate && <CelebrateOnMount />}
      <StepHeading>{first ? `You’re all set, ${first}.` : 'You’re all set.'}</StepHeading>
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">You can safely spend</p>
      {sts.isPending ? (
        <Skeleton className="h-16 w-56" role="status">
          <span className="sr-only">Working out your number</span>
        </Skeleton>
      ) : sts.isError ? (
        <>
          <p className="font-display text-2xl font-bold">We couldn’t work that out just now</p>
          <p className="text-muted-foreground">Your number will be waiting on Home.</p>
        </>
      ) : view?.headline != null ? (
        <>
          <p className="flex flex-wrap items-baseline justify-center gap-x-2">
            <AmountTicker paise={view.headline} from="value" className={view.tone === 'neutral-negative' ? 'text-4xl font-bold text-neutral-negative min-[360px]:text-5xl sm:text-6xl' : 'text-4xl font-bold text-primary min-[360px]:text-5xl sm:text-6xl'} />
            {view.suffix && <span className="text-lg text-muted-foreground">{view.suffix}</span>}
          </p>
          <p className="text-muted-foreground">{view.line}</p>
        </>
      ) : (
        <>
          <p className="font-display text-2xl font-bold">Add your balance on Home to see this</p>
          <p className="text-muted-foreground">It only takes a moment, whenever you’re ready.</p>
        </>
      )}
    </div>
  )
}
