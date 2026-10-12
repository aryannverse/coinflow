# Lighthouse evidence

<!-- LANDING:START -->
## Landing page (`/`, production build via `next start`)

Measured 2026-10-12 by `pnpm lh` (scripts/lighthouse-landing.ts). Server warmed with 2 requests first.

| Preset | Performance | Accessibility | Role |
|---|---|---|---|
| Desktop | 92 | 100 | Gate (Performance >= 75, Accessibility >= 95): PASS |
| Mobile (Lighthouse default) | 81 | 100 | Informational, not gated |

Mobile is measured under Clerk development keys, which add a ~1.7 s handshake that a production instance will not have.
<!-- LANDING:END -->

## App routes (signed in as the demo user, production build)

Re-measured 2026-10-12 after the final review fixes (commit `ce776b2`), with Lighthouse 13.5 against `next start -p 3100`,
driving a Chromium signed in through `@clerk/testing` (`clerk.signIn`, ticket path, no email sent) so Lighthouse shares its
session. Storage reset disabled so cookies survive; one discarded warm-up run first; a run that ends in a Lighthouse
`runtimeError` (no trace recorded) is re-run, not scored. Not part of `pnpm verify` because it needs auth. Data: 82 demo transactions.

| Route | Preset | Performance | Accessibility | Target | Result |
|---|---|---|---|---|---|
| `/home` | Desktop | 99 (runs: 99, 99, 99) | 100 | Perf >= 85, A11y >= 95 | PASS |
| `/home` | Mobile | 91 median (runs: 91, 91, 82, 91, 91, 91, 91) | 100 | Perf >= 85, A11y >= 95 | PASS (6 of 7 runs) |
| `/activity` | Desktop / Mobile | not measured | 100 / 100 | A11y >= 95 | PASS |
| `/insights` | Desktop / Mobile | not measured | 100 / 100 | A11y >= 95 | PASS |
| `/recurring` | Desktop / Mobile | not measured | 100 / 100 | A11y >= 95 | PASS |
| `/profile` | Desktop / Mobile | not measured | 100 / 100 | A11y >= 95 | PASS |

Mobile `/home` LCP is 3.5 s in the typical run (4.5 s in the 82 run). Before the fixes the same setup gave desktop 98 and mobile
77-79; the change between the two is that the Safe-to-spend hero is now server-rendered with its real number and no entrance
animation, so it paints without waiting for JavaScript. Runs are still under Clerk development keys. An earlier attempt the same
morning, while another workload held the machine at a load average above 30, gave mobile 60-91; those runs are not used.
