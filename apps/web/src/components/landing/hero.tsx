'use client'
import Image from 'next/image'
import { HeroBackground } from '@/components/fx/hero-background'
import { AmountTicker } from '@/components/fx/amount-ticker'
import { SplitHeading } from '@/components/fx/split-heading'
import { Safari } from '@/components/ui/safari'
import { formatINR } from '@/lib/money'

/**
 * The Safe-to-spend figure the product shot shows, in paise. ONE source for the alt text and the floating
 * badge, so the landing page never shows two different numbers. Update it from the value
 * `pnpm shot:landing` prints after recapturing `public/landing/home-dark.png` against the demo user.
 */
export const SHOT_STS_PAISE = 3_672_100
export const SHOT_ALT = `Coinflow Home screen: Safe to spend ${formatINR(SHOT_STS_PAISE)}, two upcoming bills, today’s spending, top category Food & Dining and recent spends.`

/** `cta` is a server-rendered slot (Clerk `Show` picks Start free / Open Coinflow) so it is in the first HTML. */
export function Hero({ cta }: { cta: React.ReactNode }) {
  return (
    <section className="relative isolate overflow-hidden pt-32 sm:pt-40" aria-labelledby="hero-title">
      <HeroBackground />
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 text-center">
        <p className="rounded-chip border bg-card/70 px-3 py-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground backdrop-blur">
          Personal money · then split with friends
        </p>
        <SplitHeading
          as="h1"
          id="hero-title"
          text="Know what’s safe to spend."
          className="mt-6 max-w-4xl text-balance pb-2 font-display text-5xl font-bold leading-[1.08] tracking-tight sm:text-7xl"
        />
        <p className="hero-rise mx-auto mt-5 max-w-xl text-lg text-muted-foreground [animation-delay:200ms]">
          Coinflow sets aside your bills and basics, then tells you — calmly — what’s yours to enjoy until payday. No bank
          login. No red alerts.
        </p>
        <div className="hero-rise mt-8 flex flex-wrap items-center justify-center gap-3 [animation-delay:320ms]">
          {cta}
          <a
            href="#how"
            className="flex min-h-14 items-center rounded-full border bg-card/50 px-6 text-sm font-medium backdrop-blur outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]"
          >
            See how it works
          </a>
        </div>

        <div className="hero-lift relative mt-16 w-full max-w-5xl [animation-delay:250ms]">
          <div aria-hidden className="absolute inset-x-[8%] -top-6 bottom-10 -z-10 rounded-full bg-lime/20 blur-3xl" />
          <div className="[mask-image:linear-gradient(to_bottom,#000_70%,transparent_100%)]">
            <Safari
              url="coinflow.local/home"
              className="size-full"
              image={
                <Image
                  src="/landing/home-dark.png"
                  width={1440}
                  height={900}
                  sizes="(min-width:1024px) 1024px, 100vw"
                  alt={SHOT_ALT}
                  preload
                  fetchPriority="high"
                  quality={70}
                  className="block size-full object-cover object-top"
                />
              }
            />
          </div>
          <div className="absolute -top-10 right-2 flex items-center gap-3 rounded-tile border bg-card/90 px-4 py-3 text-left shadow-xl backdrop-blur sm:right-8 sm:-top-12">
            <span aria-hidden className="grid size-9 place-items-center rounded-full bg-lime text-sm font-bold text-[#0F1210]">₹</span>
            <div>
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">Safe to spend</p>
              <AmountTicker paise={SHOT_STS_PAISE} className="block text-xl font-bold leading-tight sm:text-2xl" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
