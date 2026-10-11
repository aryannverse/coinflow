import { Show } from '@clerk/nextjs'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

/** Server component: Clerk's `Show` resolves signed-in/out while rendering, so the right links are in the HTML. */
export function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/40 bg-background/60 backdrop-blur-md supports-[backdrop-filter]:bg-background/50">
      <nav aria-label="Site" className="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex min-h-12 items-center gap-2 rounded-chip font-display text-xl font-bold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span aria-hidden className="grid size-8 place-items-center rounded-chip bg-primary text-primary-foreground">₹</span>
          coinflow
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <Show
            when="signed-in"
            fallback={
              <>
                <Button asChild variant="ghost" className="min-h-12 min-w-12 px-4 text-sm active:scale-[0.97]">
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                <Button asChild className="min-h-12 min-w-12 px-5 text-sm font-semibold active:scale-[0.97]">
                  <Link href="/sign-up">Get started</Link>
                </Button>
              </>
            }
          >
            <Button asChild className="min-h-12 min-w-12 px-5 text-sm font-semibold active:scale-[0.97]">
              <Link href="/home">Open Coinflow</Link>
            </Button>
          </Show>
        </div>
      </nav>
    </header>
  )
}
