'use client'
import dynamic from 'next/dynamic'
import { useMotionReady, useReducedMotion } from '@/components/providers/motion-pref'
import { Marquee } from '@/components/ui/marquee'

const REVEAL_TEXT = 'font-display text-4xl font-bold text-balance'
// Same markup as ScrollReveal's own (h2 > block span), so the server-rendered fallback is the final text, fully
// visible and identical in size: GSAP (loaded lazily with the component) only adds the scroll effect.
const ScrollReveal = dynamic(() => import('@/components/reactbits/ScrollReveal'), {
  ssr: false,
  loading: () => <StaticLine id="principles-title" className="text-center" />,
})

function StaticLine({ id, className }: { id: string; className?: string }) {
  return (
    <h2 id={id} className={`my-5 ${className ?? ''}`}>
      <span className={`block text-[clamp(1.6rem,4vw,3rem)] leading-[1.5] font-semibold ${REVEAL_TEXT}`}>{LINE}</span>
    </h2>
  )
}

const PHRASES = ['250 food lunch', '+50000 salary', '1.2k uber to office', '649 netflix', '80 chai', '3200 groceries']
const LINE = 'No guilt. No red alerts. Just a clear number and the freedom to enjoy it.'
const CHIP = 'rounded-chip border bg-card px-4 py-2 font-mono text-sm text-muted-foreground'

export function Principles() {
  const reduced = useReducedMotion()
  const ready = useMotionReady()
  return (
    <section aria-labelledby="principles-title" className="overflow-x-clip py-24">
      {/* The phrases are examples of what you can type; the moving copies are decorative, so they are hidden from AT
          and a single static list carries the content. */}
      <p className="sr-only">Examples you can type into quick add: {PHRASES.join(', ')}.</p>
      {reduced ? (
        <ul aria-hidden className="mx-auto flex max-w-4xl flex-wrap justify-center gap-3 px-4">
          {PHRASES.map((p) => (
            <li key={p} className={CHIP}>{p}</li>
          ))}
        </ul>
      ) : (
        <Marquee aria-hidden pauseOnHover className="[--duration:40s] [mask-image:linear-gradient(to_right,transparent,#000_10%,#000_90%,transparent)]">
          {PHRASES.map((p) => (
            <span key={p} className={`mx-2 ${CHIP}`}>{p}</span>
          ))}
        </Marquee>
      )}
      <div className="mx-auto mt-16 max-w-4xl px-4">
        {reduced || !ready ? (
          <StaticLine id="principles-title" className="text-center" />
        ) : (
          // Resting opacity 0.6 keeps the unrevealed words >= 4.5:1 in both themes (the vendored default of 0.1 fails AA).
          <ScrollReveal id="principles-title" baseOpacity={0.6} enableBlur baseRotation={2} blurStrength={6} containerClassName="text-center" textClassName={REVEAL_TEXT}>
            {LINE}
          </ScrollReveal>
        )}
      </div>
    </section>
  )
}
