import Link from 'next/link'

/** Server component. `cta` is the Clerk-aware button slot rendered by the page. */
export function FooterCta({ cta }: { cta: React.ReactNode }) {
  return (
    <footer className="relative isolate overflow-hidden border-t">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(50%_100%_at_50%_0%,color-mix(in_srgb,var(--lime)_16%,transparent),transparent)]" />
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-24 text-center">
        <h2 className="max-w-2xl text-balance font-display text-4xl font-bold tracking-tight sm:text-5xl">
          See your <span className="whitespace-nowrap">safe-to-spend</span> in two minutes.
        </h2>
        {cta}
        <p className="text-sm text-muted-foreground">
          Coinflow · an HCI class project · your data stays in your database.
        </p>
        <nav aria-label="Footer" className="-mb-2 flex gap-2 text-sm">
          <Link href="/sign-in" className="flex min-h-12 items-center rounded-chip px-4 text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring">
            Sign in
          </Link>
          <a href="#main" className="flex min-h-12 items-center rounded-chip px-4 text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring">
            Back to top
          </a>
        </nav>
      </div>
    </footer>
  )
}
