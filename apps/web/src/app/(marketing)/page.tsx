import { Show } from '@clerk/nextjs'
import type { Metadata } from 'next'
import Link from 'next/link'
import { FeatureBento } from '@/components/landing/feature-bento'
import { FooterCta } from '@/components/landing/footer-cta'
import { Hero } from '@/components/landing/hero'
import { MoneyFlow } from '@/components/landing/money-flow'
import { LandingNav } from '@/components/landing/nav'
import { Principles } from '@/components/landing/principles'
import { ShimmerButton } from '@/components/ui/shimmer-button'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'

const DESCRIPTION =
  'Coinflow sets aside your bills and basics, then tells you, calmly, what is yours to enjoy until payday. No bank login. No red alerts. Splitting with friends is coming next.'

export const metadata: Metadata = {
  title: { absolute: 'Coinflow: know what’s safe to spend' },
  description: DESCRIPTION,
  openGraph: { title: 'Coinflow: know what’s safe to spend', description: DESCRIPTION, type: 'website', locale: 'en_IN' },
  alternates: { canonical: '/' },
}

const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

// The CTAs are server-rendered with Clerk's `Show`, so the signed-in/out state is right in the first HTML
// (no flash, no JS needed) and the client sections just receive them as slots.
function HeroCta() {
  return (
    <Show
      when="signed-in"
      fallback={
        <ShimmerButton asChild background="#C8F560" shimmerColor="#ffffff" className={`min-h-14 px-8 font-semibold text-[#0F1210] ${FOCUS}`}>
          <Link href="/sign-up">Start free</Link>
        </ShimmerButton>
      }
    >
      <ShimmerButton asChild background="#C8F560" shimmerColor="#ffffff" className={`min-h-14 px-8 font-semibold text-[#0F1210] ${FOCUS}`}>
        <Link href="/home">Open Coinflow</Link>
      </ShimmerButton>
    </Show>
  )
}

function FooterButton() {
  return (
    <Show
      when="signed-in"
      fallback={
        <InteractiveHoverButton asChild className={`flex min-h-14 items-center justify-center px-8 ${FOCUS}`}>
          <Link href="/sign-up">Get started</Link>
        </InteractiveHoverButton>
      }
    >
      <InteractiveHoverButton asChild className={`flex min-h-14 items-center justify-center px-8 ${FOCUS}`}>
        <Link href="/home">Open Coinflow</Link>
      </InteractiveHoverButton>
    </Show>
  )
}

export default function LandingPage() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[60] focus-visible:rounded-chip focus-visible:bg-primary focus-visible:px-4 focus-visible:py-3 focus-visible:font-medium focus-visible:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Skip to content
      </a>
      <LandingNav />
      <main id="main">
        <Hero cta={<HeroCta />} />
        <MoneyFlow />
        <FeatureBento />
        <Principles />
      </main>
      <FooterCta cta={<FooterButton />} />
    </>
  )
}
