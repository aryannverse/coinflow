# Lighthouse evidence

<!-- LANDING:START -->
## Landing page (`/`, production build via `next start`)

Measured 2026-10-12 by `pnpm lh` (scripts/lighthouse-landing.ts). Server warmed with 2 requests first.

| Preset | Performance | Accessibility | Role |
|---|---|---|---|
| Desktop | 95 | 100 | Gate (Performance >= 75, Accessibility >= 95): PASS |
| Mobile (Lighthouse default) | 82 | 100 | Informational, not gated |

Mobile is measured under Clerk development keys, which add a ~1.7 s handshake that a production instance will not have.
<!-- LANDING:END -->

## App routes (signed in as the demo user, production build)

Measured 2026-10-12 with Lighthouse 13.5 against `next start -p 3100`, driving a Chromium that was signed in through
`@clerk/testing` (`clerk.signIn`, ticket path, no email sent) so Lighthouse shares its session. Storage reset disabled so
cookies survive; one discarded warm-up run first. Not part of `pnpm verify` because it needs auth. Data: 82 demo transactions.

| Route | Preset | Performance | Accessibility | Target | Result |
|---|---|---|---|---|---|
| `/home` | Desktop | 98 | 100 | Perf >= 85, A11y >= 95 | PASS |
| `/home` | Mobile | 79 (runs: 79, 77, 79, 79) | 100 | Perf >= 85, A11y >= 95 | A11y PASS, **Performance MISSES (77-79)** |
| `/activity` | Desktop / Mobile | not measured | 100 / 100 | A11y >= 95 | PASS |
| `/insights` | Desktop / Mobile | not measured | 100 / 100 | A11y >= 95 | PASS |
| `/recurring` | Desktop / Mobile | not measured | 100 / 100 | A11y >= 95 | PASS |
| `/profile` | Desktop / Mobile | not measured | 100 / 100 | A11y >= 95 | PASS |

Mobile `/home` is under Clerk development keys (the dev-instance handshake and the ~1.7 s of Clerk JS add to the mobile
simulated throttling), the same condition that holds the landing page's mobile score at 82. The spec's 85 target is therefore met
on desktop and missed on mobile in this environment; production keys were not measured.
