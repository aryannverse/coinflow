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

## App routes (signed in)

Pending: `/home` Performance >= 85 and Accessibility >= 95 on every app route, measured while signed in
(chrome-devtools MCP `lighthouse_audit` or the controller). Record date, route and scores here.
