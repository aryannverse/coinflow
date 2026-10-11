# Coinflow Part A2 — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Coinflow's Mint-Bento website on top of Plan A1's API: design system and motion layer, app shell with the "Ask Coinflow" command palette, quick add with undo, home bento, activity, recurring, insights & budgets, onboarding, profile, the landing page, and the E2E/accessibility quality gates.

**Architecture:** Next.js App Router with route groups `(marketing)` (public landing) and `(app)` (signed-in shell). Server components load first paint via A1's services; client components use TanStack Query against `/api/v1/*` with optimistic updates and a global undo store. Visual effects come from the **Magic UI** and **React Bits** MCPs, vendored into `src/components/ui` (Magic UI, via `shadcn add`) and `src/components/reactbits` (React Bits, via MCP source), and always consumed through thin wrappers in `src/components/fx` that enforce reduced-motion rules.

**Tech Stack:** Next.js 16.4, React 19.3, Tailwind CSS 4.3, shadcn/ui (Radix), Magic UI, React Bits, motion 14, GSAP 3.15 + @gsap/react, Lenis 1.3, next-themes, TanStack Query 5, Recharts 3, sonner, @clerk/nextjs 7 + @clerk/ui + @clerk/testing, Playwright 1.64, @axe-core/playwright, Lighthouse CLI.

**Spec:** `docs/superpowers/specs/2026-10-11-coinflow-part-a-design.md` (§4 screens, §7 design & motion, §9 quality gates, §12 HCI doc). **Depends on:** `docs/superpowers/plans/2026-10-11-coinflow-a1-foundation-backend.md` — complete it first; this plan consumes its services, schemas and endpoints by the exact names listed there.

## Global Constraints

- Everything in Plan A1's Global Constraints still applies (local only, versions, paise, IST, Clerk 7, commit trailer).
- **Website first:** desktop (≥ 1024 px) is a first-class layout with a left sidebar; mobile (< 1024 px) uses bottom tabs. PWA features are out of scope.
- **Component sourcing:** visual effects come from the Magic UI MCP (`npx shadcn@latest add "https://magicui.design/r/<name>.json"`) or the React Bits MCP (`mcp__reactbits__get_component` with `style: "tailwind"`). Every vendored file starts with a header comment `// Source: Magic UI <name>` or `// Source: React Bits <name> (adapted: …)`. App code imports effects **only** through `src/components/fx/*` wrappers.
- **Tokens (exact):** dark `--background #0E100F`, `--card #161917`, `--popover/--muted/--secondary/--surface-2 #1B1F1D`, `--border #262B28`, `--primary #C8F560` on `--primary-foreground #0F1210`, `--foreground #F1F5F2`, `--muted-foreground #9BA59F`, `--neutral-negative #B9AFA4`, `--destructive #FF8A7A`; light `--background #F4F6F1`, `--card #FFFFFF`, `--muted/--secondary/--surface-2 #EEF1EA`, `--border #DDE2D8`, `--primary #4D6B0F` on `#FFFFFF`, `--foreground #141714`, `--muted-foreground #5A635D`, `--neutral-negative #6E6258`, `--destructive #B3261E`. Dark is the default theme.
- **Type:** Space Grotesk (display + amounts, `tabular-nums`), Inter (body), Geist Mono (labels).
- **Non-punitive money UI:** negative or over-budget values use `text-neutral-negative` + a "−"/"over plan" label — never red, never alarm icons. `--destructive` is only for destructive confirmations.
- **Targets & feedback:** interactive targets ≥ 48×48 px (`min-h-12 min-w-12`); every pressable has an `active:scale-[0.97]` press state; async actions show inline pending state within 100 ms.
- **Reduced motion:** when the user's `reducedMotion` is `on`, or `system` + OS `prefers-reduced-motion: reduce`: no Lenis, no GSAP scroll effects, no WebGL backgrounds, no confetti, no cursor/spark effects; transitions become ≤ 150 ms opacity fades.
- **Undo:** every mutation response with an `auditId` shows the undo toast for **10 s** with a countdown ring and ⌘Z / Ctrl+Z.
- **Charts:** load the `dataviz` skill before writing any chart code (Task 20).

## Review Focus

1. **Typing amounts with the keyboard and keypad** — "1,250.50", a third decimal, a second ".", or > ₹1 crore must be refused gracefully without losing what was typed. Pinned in Task 16 (`keypad.test.ts`).
2. **Pressing ⌘Z after the toast has expired or in a text field** — must not undo anything or hijack the browser's own text undo. Pinned in Task 14 (`undo-store.test.ts` + `use-undo-shortcut` guard) and Task 24 (`quick-add-undo.spec.ts`).
3. **Reduced motion everywhere** — with OS reduce-motion on, no Lenis instance and no `<canvas>` on any page. Pinned in Task 24 (`reduced-motion.spec.ts`).
4. **Day grouping around IST midnight in Activity** — an expense at 00:30 IST appears under that day, labelled "Today"/"Yesterday" correctly. Pinned in Task 18 (`group-by-day.test.ts`).
5. **Over-budget and negative Safe-to-Spend display** — shows neutral "₹400 over plan" / "₹0 free this cycle" copy, never red. Pinned in Task 20 (`budget-band.test.ts`) and Task 17 (`sts-display.test.ts`).

---

## File Structure (new in A2, under `apps/web/`)

```
src/app/
  layout.tsx                         root: fonts, ClerkProvider, AppProviders
  globals.css                        Tailwind v4 + Mint Bento tokens
  (marketing)/layout.tsx, page.tsx   landing
  (app)/layout.tsx                   auth + onboarding guard + recurring materialization + shell
  (app)/home/page.tsx  activity/page.tsx  insights/page.tsx  recurring/page.tsx  profile/page.tsx
  onboarding/page.tsx
src/components/
  ui/            shadcn primitives + Magic UI vendored components
  reactbits/     React Bits vendored components
  fx/            wrappers: reveal.tsx amount-ticker.tsx tile.tsx spark.tsx celebrate.tsx hero-background.tsx
                 split-heading.tsx budget-slider.tsx theme-toggle.tsx
  providers/     app-providers.tsx motion-pref.tsx lenis-provider.tsx query-provider.tsx
  shell/         app-shell.tsx sidebar.tsx bottom-tabs.tsx top-bar.tsx ask-pill.tsx command-palette.tsx nav-items.ts
  undo/          undo-toaster.tsx use-undo-shortcut.ts
  quick-add/     quick-add-provider.tsx quick-add-sheet.tsx keypad.tsx category-chips.tsx
  home/          safe-to-spend-tile.tsx today-tile.tsx upcoming-bills-tile.tsx top-category-tile.tsx
                 recent-activity-tile.tsx pending-drafts-tile.tsx checkin-dialog.tsx
  activity/      activity-view.tsx filters-bar.tsx transaction-row.tsx
  recurring/     recurring-view.tsx recurring-form.tsx
  insights/      insights-view.tsx spend-chart.tsx category-chart.tsx budgets-panel.tsx
  onboarding/    onboarding-flow.tsx steps/*.tsx
  profile/       profile-view.tsx upi-qr-upload.tsx
  landing/       nav.tsx hero.tsx money-flow.tsx feature-bento.tsx principles.tsx footer-cta.tsx
src/lib/
  contrast.ts motion-pref.ts api-client.ts api-types.ts undo-store.ts quick-command.ts keypad.ts
  slider-keys.ts cycle-dots.ts group-by-day.ts budget-band.ts sts-display.ts home-selectors.ts
src/hooks/queries.ts
e2e/  global.setup.ts helpers.ts *.spec.ts      playwright.config.ts
scripts/ capture-landing-shot.ts lighthouse-landing.ts
docs/design/stitch/*.png   docs/hci/part-a-rationale.md (repo root docs/)
```

---

### Task 12: Design tokens, fonts, theme & reduced-motion providers, Lenis, Stitch references

**Files:**
- Create: `src/lib/contrast.ts`, `src/lib/motion-pref.ts`, `src/components/providers/motion-pref.tsx`, `src/components/providers/lenis-provider.tsx`, `src/components/providers/app-providers.tsx`, `docs/design/stitch/` (repo root)
- Modify/replace: `src/app/globals.css`, `src/app/layout.tsx`, `components.json` (shadcn init)
- Test: `src/lib/contrast.test.ts`, `src/lib/motion-pref.test.ts`, `src/styles.tokens.test.ts`

**Interfaces:**
- Produces:
  - `contrastRatio(hexA: string, hexB: string): number`
  - `type MotionPref = 'on' | 'off' | 'system'`; `resolveReducedMotion(pref: MotionPref, osPrefersReduce: boolean): boolean`
  - `<MotionPrefProvider initial={MotionPref}>`; `useReducedMotion(): boolean`; `useMotionPref(): { pref: MotionPref; setPref(p: MotionPref): void }`
  - `<LenisProvider>` (no-op when reduced motion); `<AppProviders motionPref={MotionPref}>` wraps ThemeProvider + MotionPrefProvider + LenisProvider (+ QueryProvider and UndoToaster added in Task 14).
  - Tailwind utilities from tokens: `bg-background text-foreground bg-card bg-surface-2 border-border bg-primary text-primary-foreground text-muted-foreground text-neutral-negative`, fonts `font-display font-sans font-mono`, radius `rounded-tile` (22px) / `rounded-chip` (12px).

- [ ] **Step 1: Install UI foundations**

```bash
cd apps/web
pnpm dlx shadcn@latest init --base-color neutral --yes
pnpm dlx shadcn@latest add button dialog sheet popover dropdown-menu tooltip command input label select switch tabs sonner skeleton toggle-group separator
pnpm add next-themes motion@^14.1.0 gsap@^3.15.0 @gsap/react@^2.1.2 lenis@^1.3.26 @clerk/ui
cd ../..
```

- [ ] **Step 2: Write failing tests**

`src/lib/contrast.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { contrastRatio } from './contrast'

describe('contrastRatio', () => {
  it('matches WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
  })
})
```

`src/lib/motion-pref.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { resolveReducedMotion } from './motion-pref'

describe('resolveReducedMotion', () => {
  it('follows the OS on "system"', () => {
    expect(resolveReducedMotion('system', true)).toBe(true)
    expect(resolveReducedMotion('system', false)).toBe(false)
  })
  it('explicit settings override the OS', () => {
    expect(resolveReducedMotion('on', false)).toBe(true)
    expect(resolveReducedMotion('off', true)).toBe(false)
  })
})
```

`src/styles.tokens.test.ts` (parses `globals.css` so tokens and test can never drift):
```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from './lib/contrast'

const css = readFileSync(new URL('./app/globals.css', import.meta.url), 'utf8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  const body = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]))
}

const PAIRS: [string, string, number][] = [
  ['foreground', 'background', 4.5], ['foreground', 'card', 4.5],
  ['muted-foreground', 'background', 4.5], ['muted-foreground', 'card', 4.5], ['muted-foreground', 'muted', 4.5],
  ['primary-foreground', 'primary', 4.5], ['neutral-negative', 'card', 4.5], ['neutral-negative', 'background', 4.5],
  ['primary', 'background', 3], ['destructive', 'card', 3],
]

describe.each([[':root', 'light'], ['.dark', 'dark']])('%s tokens (%s)', (selector) => {
  const t = block(selector)
  it.each(PAIRS)('%s on %s ≥ %d:1', (fg, bg, min) => {
    expect(t[fg], `missing --${fg}`).toBeDefined()
    expect(t[bg], `missing --${bg}`).toBeDefined()
    expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(min)
  })
})
```

Update `vitest.config.ts` include to also match this file: `include: ['src/**/*.test.ts']` already matches `src/styles.tokens.test.ts`.

Run: `pnpm --filter web test -- src/lib/contrast.test.ts src/lib/motion-pref.test.ts src/styles.tokens.test.ts`
Expected: FAIL — modules missing / tokens missing.

- [ ] **Step 3: Implement `contrast.ts` and `motion-pref.ts`**

`src/lib/contrast.ts`:
```ts
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
```

`src/lib/motion-pref.ts`:
```ts
export type MotionPref = 'on' | 'off' | 'system'

export function resolveReducedMotion(pref: MotionPref, osPrefersReduce: boolean): boolean {
  if (pref === 'on') return true
  if (pref === 'off') return false
  return osPrefersReduce
}
```

- [ ] **Step 4: Replace `globals.css` with Mint Bento tokens**

Keep the `@import` lines shadcn generated (e.g. `tw-animate-css`) at the top, then replace the rest with:
```css
@import "tailwindcss";
@import "tw-animate-css";
@import "@clerk/ui/themes/shadcn.css";

@custom-variant dark (&:is(.dark *));

:root {
  --background: #F4F6F1;
  --foreground: #141714;
  --card: #FFFFFF;
  --card-foreground: #141714;
  --popover: #FFFFFF;
  --popover-foreground: #141714;
  --primary: #4D6B0F;
  --primary-foreground: #FFFFFF;
  --secondary: #EEF1EA;
  --secondary-foreground: #141714;
  --muted: #EEF1EA;
  --muted-foreground: #5A635D;
  --accent: #E4E9DE;
  --accent-foreground: #141714;
  --destructive: #B3261E;
  --border: #DDE2D8;
  --input: #CBD2C5;
  --ring: #4D6B0F;
  --surface-2: #EEF1EA;
  --neutral-negative: #6E6258;
  --lime: #C8F560;
  --chart-1: #4D6B0F;
  --chart-2: #2F7D6D;
  --chart-3: #8A6D1F;
  --chart-4: #6B5BA8;
  --chart-5: #9A4F3D;
  --radius: 14px;
}

.dark {
  --background: #0E100F;
  --foreground: #F1F5F2;
  --card: #161917;
  --card-foreground: #F1F5F2;
  --popover: #1B1F1D;
  --popover-foreground: #F1F5F2;
  --primary: #C8F560;
  --primary-foreground: #0F1210;
  --secondary: #1B1F1D;
  --secondary-foreground: #F1F5F2;
  --muted: #1B1F1D;
  --muted-foreground: #9BA59F;
  --accent: #262B28;
  --accent-foreground: #F1F5F2;
  --destructive: #FF8A7A;
  --border: #262B28;
  --input: #2E3430;
  --ring: #C8F560;
  --surface-2: #1B1F1D;
  --neutral-negative: #B9AFA4;
  --lime: #C8F560;
  --chart-1: #C8F560;
  --chart-2: #7FD8C4;
  --chart-3: #F5D76E;
  --chart-4: #B79CED;
  --chart-5: #FF9F80;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-surface-2: var(--surface-2);
  --color-neutral-negative: var(--neutral-negative);
  --color-lime: var(--lime);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --font-sans: var(--font-inter);
  --font-display: var(--font-space-grotesk);
  --font-mono: var(--font-geist-mono);
  --radius-sm: calc(var(--radius) - 6px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-tile: 22px;
  --radius-chip: 12px;
}

@layer base {
  * { @apply border-border outline-ring/60; }
  html { color-scheme: dark; }
  html:not(.dark) { color-scheme: light; }
  body { @apply bg-background text-foreground font-sans antialiased; }
  .amount { @apply font-display tabular-nums tracking-tight; }
  html[data-reduce-motion="true"] *,
  html[data-reduce-motion="true"] *::before,
  html[data-reduce-motion="true"] *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 120ms !important;
    scroll-behavior: auto !important;
  }
  html.lenis, html.lenis body { height: auto; }
  .lenis.lenis-smooth { scroll-behavior: auto !important; }
}
```

Run: `pnpm --filter web test -- src/styles.tokens.test.ts src/lib/contrast.test.ts src/lib/motion-pref.test.ts`
Expected: PASS. If a pair fails, adjust only the failing token value and record the change in the commit message.

- [ ] **Step 5: Implement providers**

`src/components/providers/motion-pref.tsx`:
```tsx
'use client'
import { MotionConfig } from 'motion/react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { resolveReducedMotion, type MotionPref } from '@/lib/motion-pref'

const Ctx = createContext<{ pref: MotionPref; reduced: boolean; setPref: (p: MotionPref) => void } | null>(null)

export function MotionPrefProvider({ initial, children }: { initial: MotionPref; children: React.ReactNode }) {
  const [pref, setPref] = useState<MotionPref>(initial)
  const [osReduce, setOsReduce] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setOsReduce(mq.matches)
    const onChange = () => setOsReduce(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const reduced = resolveReducedMotion(pref, osReduce)
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduced)
  }, [reduced])

  const value = useMemo(() => ({ pref, reduced, setPref }), [pref, reduced])
  return (
    <Ctx.Provider value={value}>
      <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>{children}</MotionConfig>
    </Ctx.Provider>
  )
}

export function useReducedMotion(): boolean {
  return useContext(Ctx)?.reduced ?? false
}

export function useMotionPref() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useMotionPref must be used inside MotionPrefProvider')
  return { pref: ctx.pref, setPref: ctx.setPref }
}
```

`src/components/providers/lenis-provider.tsx`:
```tsx
'use client'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ReactLenis, type LenisRef } from 'lenis/react'
import { useEffect, useRef } from 'react'
import { useReducedMotion } from './motion-pref'

gsap.registerPlugin(ScrollTrigger)

export function LenisProvider({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion()
  const lenisRef = useRef<LenisRef>(null)

  useEffect(() => {
    if (reduced) return
    const update = (time: number) => lenisRef.current?.lenis?.raf(time * 1000)
    gsap.ticker.add(update)
    gsap.ticker.lagSmoothing(0)
    const lenis = lenisRef.current?.lenis
    lenis?.on('scroll', ScrollTrigger.update)
    return () => {
      gsap.ticker.remove(update)
      lenis?.off('scroll', ScrollTrigger.update)
    }
  }, [reduced])

  if (reduced) return <>{children}</>
  return (
    <ReactLenis root ref={lenisRef} options={{ autoRaf: false, lerp: 0.12, smoothWheel: true }}>
      {children}
    </ReactLenis>
  )
}
```

`src/components/providers/app-providers.tsx`:
```tsx
'use client'
import { ThemeProvider } from 'next-themes'
import type { MotionPref } from '@/lib/motion-pref'
import { LenisProvider } from './lenis-provider'
import { MotionPrefProvider } from './motion-pref'

export function AppProviders({ motionPref, children }: { motionPref: MotionPref; children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <MotionPrefProvider initial={motionPref}>
        <LenisProvider>{children}</LenisProvider>
      </MotionPrefProvider>
    </ThemeProvider>
  )
}
```

- [ ] **Step 6: Root layout with fonts and themed Clerk**

`src/app/layout.tsx`:
```tsx
import { ClerkProvider } from '@clerk/nextjs'
import { shadcn } from '@clerk/ui/themes'
import type { Metadata, Viewport } from 'next'
import { Geist_Mono, Inter, Space_Grotesk } from 'next/font/google'
import { AppProviders } from '@/components/providers/app-providers'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk', display: 'swap' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Coinflow', template: '%s · Coinflow' },
  description: 'Know what’s safe to spend — then split the rest with friends.',
}
export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#0E100F' }, { media: '(prefers-color-scheme: light)', color: '#F4F6F1' }],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`dark ${inter.variable} ${grotesk.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <ClerkProvider
          appearance={{ theme: shadcn, variables: { colorPrimary: 'var(--primary)', borderRadius: '14px' } }}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/home"
          signUpFallbackRedirectUrl="/onboarding"
        >
          <AppProviders motionPref="system">{children}</AppProviders>
        </ClerkProvider>
      </body>
    </html>
  )
}
```
(The `(app)` layout re-wraps with the user's saved `motionPref` in Task 15.)

- [ ] **Step 7: [product_designer] Stitch reference screens**

Using the Stitch MCP (tools `mcp__stitch__create_project`, `mcp__stitch__create_design_system`, `mcp__stitch__generate_screen_from_text`, `mcp__stitch__get_screen`):
1. Create project **"Coinflow"** (device: DESKTOP).
2. Create design system **"Coinflow Mint Bento"** with the exact dark/light tokens, fonts (Space Grotesk / Inter / Geist Mono) and radii from Global Constraints.
3. Generate three screens: (a) desktop Home bento with lime Safe-to-Spend hero, today/bills/top-category/recent tiles, left sidebar and floating "Ask Coinflow" pill; (b) mobile quick-add bottom sheet (amount first, category chips, Save); (c) desktop landing hero with dithered lime background and a Safari-framed dashboard.
4. Download each screen's screenshot to `docs/design/stitch/home-desktop.png`, `quick-add-mobile.png`, `landing-hero.png`.
These are visual references for Tasks 15–23; they never override the tokens above.

- [ ] **Step 8: Verify and commit**

Run: `pnpm --filter web test && pnpm --filter web build` → PASS. `pnpm dev` → `/sign-in` renders dark Mint-Bento-themed Clerk card.
```bash
git add apps/web docs/design
git commit -m "feat(ui): Mint Bento tokens with contrast tests, fonts, theme, reduced-motion and Lenis providers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Vendor Magic UI + React Bits components and the `fx` wrapper layer

**Files:**
- Create (Magic UI via shadcn): `src/components/ui/{number-ticker,blur-fade,animated-list,border-beam,confetti,animated-circular-progress-bar,shimmer-button,interactive-hover-button,safari,animated-beam,marquee,animated-theme-toggler,progressive-blur,magic-card}.tsx`
- Create (React Bits via MCP): `src/components/reactbits/{SplitText,Dither,SpotlightCard,Stepper,ElasticSlider,ClickSpark,Counter,ScrollReveal}.tsx`
- Create: `src/lib/slider-keys.ts`, `src/components/fx/{reveal,amount-ticker,tile,spark,celebrate,hero-background,split-heading,budget-slider,theme-toggle}.tsx`
- Test: `src/lib/slider-keys.test.ts`

**Interfaces:**
- Consumes: `useReducedMotion` (Task 12), `formatINR` (A1 Task 4).
- Produces (the only effect APIs app code may use):
  - `<Reveal delay?: number className?>` — BlurFade, or plain div when reduced.
  - `<AmountTicker paise: number className? signed?: boolean>` — counts up in ₹ (en-IN); static `formatINR` when reduced.
  - `<Tile className? spotlight?: boolean as?: 'section' | 'div'>` — SpotlightCard surface (`bg-card rounded-tile border`).
  - `<Spark>` — ClickSpark around a child; passthrough when reduced.
  - `celebrate(): void` and `<CelebrateOnMount />` — Confetti burst once; no-op when reduced.
  - `<HeroBackground />` — lazy Dither (WebGL); renders a static gradient when reduced.
  - `<SplitHeading as?: 'h1' | 'h2' text: string className?>` — SplitText; plain heading when reduced.
  - `<BudgetSlider value: number /* paise */ onValueChange(p: number): void max: number step?: number label: string>` — adapted ElasticSlider (controlled + ARIA slider + keyboard).
  - `<ThemeToggle />` — Magic UI Animated Theme Toggler wired to next-themes, persisting via `PATCH /me` when signed in (`onPersist?: (t: 'dark' | 'light') => void`).
  - `sliderKeyStep(key: string, value: number, o: { min: number; max: number; step: number; page: number }): number | null`

- [ ] **Step 1: Install Magic UI components**

```bash
cd apps/web
for c in number-ticker blur-fade animated-list border-beam confetti animated-circular-progress-bar shimmer-button \
  interactive-hover-button safari animated-beam marquee animated-theme-toggler progressive-blur magic-card; do
  pnpm dlx shadcn@latest add "https://magicui.design/r/$c.json" --yes
done
cd ../..
```
Then add the header `// Source: Magic UI <name>` to each new file in `src/components/ui/`.
Edit `src/components/ui/number-ticker.tsx`: change its `Intl.NumberFormat("en-US", …)` to `Intl.NumberFormat("en-IN", …)` so grouping is ₹1,25,000 (add `(adapted: en-IN grouping)` to its header).

- [ ] **Step 2: Vendor React Bits components via MCP**

For each of `split-text`, `dither`, `spotlight-card`, `stepper`, `elastic-slider`, `click-spark`, `counter`, `scroll-reveal`: call `mcp__reactbits__get_component` with `{ name, style: "tailwind" }` and save the returned source verbatim to `src/components/reactbits/<PascalCase>.tsx` with header `// Source: React Bits <name>`. Install their dependencies:
```bash
cd apps/web
pnpm add three @react-three/fiber @react-three/postprocessing postprocessing @hugeicons/react @hugeicons/core-free-icons
pnpm add -D @types/three
cd ../..
```
If a component imports something else (check each file's imports), install it too.

- [ ] **Step 3: Write the failing slider-keys test**

`src/lib/slider-keys.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { sliderKeyStep } from './slider-keys'

const o = { min: 0, max: 1_000_000, step: 50_000, page: 200_000 }

describe('sliderKeyStep', () => {
  it('steps with arrows and clamps', () => {
    expect(sliderKeyStep('ArrowRight', 100_000, o)).toBe(150_000)
    expect(sliderKeyStep('ArrowDown', 0, o)).toBe(0)
    expect(sliderKeyStep('ArrowUp', 990_000, o)).toBe(1_000_000)
  })
  it('pages and jumps', () => {
    expect(sliderKeyStep('PageUp', 100_000, o)).toBe(300_000)
    expect(sliderKeyStep('Home', 500_000, o)).toBe(0)
    expect(sliderKeyStep('End', 0, o)).toBe(1_000_000)
  })
  it('ignores other keys', () => {
    expect(sliderKeyStep('a', 1, o)).toBeNull()
  })
})
```
Run: `pnpm --filter web test -- src/lib/slider-keys.test.ts` → FAIL.

- [ ] **Step 4: Implement `slider-keys.ts`**

```ts
export function sliderKeyStep(
  key: string, value: number, o: { min: number; max: number; step: number; page: number },
): number | null {
  const clamp = (v: number) => Math.min(o.max, Math.max(o.min, v))
  switch (key) {
    case 'ArrowRight': case 'ArrowUp': return clamp(value + o.step)
    case 'ArrowLeft': case 'ArrowDown': return clamp(value - o.step)
    case 'PageUp': return clamp(value + o.page)
    case 'PageDown': return clamp(value - o.page)
    case 'Home': return o.min
    case 'End': return o.max
    default: return null
  }
}
```
Run the test → PASS.

- [ ] **Step 5: Adapt ElasticSlider to be controlled and accessible**

Replace `src/components/reactbits/ElasticSlider.tsx` with this adaptation of the vendored file (keeps the elastic overflow physics, adds `value`/`onValueChange`, ARIA slider semantics, keyboard support, token colours):
```tsx
// Source: React Bits elastic-slider (adapted: controlled value, onValueChange, role=slider + keyboard, theme tokens)
'use client'
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react'
import { useRef, useState } from 'react'
import { sliderKeyStep } from '@/lib/slider-keys'

const MAX_OVERFLOW = 50

function decay(value: number, max: number): number {
  if (max === 0) return 0
  const entry = value / max
  return 2 * (1 / (1 + Math.exp(-entry)) - 0.5) * max
}

export interface ElasticSliderProps {
  value: number
  onValueChange: (v: number) => void
  min?: number
  max: number
  step?: number
  label: string
  valueText: (v: number) => string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  className?: string
}

export default function ElasticSlider({
  value, onValueChange, min = 0, max, step = 1, label, valueText, leftIcon, rightIcon, className = '',
}: ElasticSliderProps) {
  const sliderRef = useRef<HTMLDivElement>(null)
  const [region, setRegion] = useState<'left' | 'middle' | 'right'>('middle')
  const clientX = useMotionValue(0)
  const overflow = useMotionValue(0)
  const scale = useMotionValue(1)

  useMotionValueEvent(clientX, 'change', (latest: number) => {
    if (!sliderRef.current) return
    const { left, right } = sliderRef.current.getBoundingClientRect()
    let over = 0
    if (latest < left) { setRegion('left'); over = left - latest }
    else if (latest > right) { setRegion('right'); over = latest - right }
    else setRegion('middle')
    overflow.jump(decay(over, MAX_OVERFLOW))
  })

  const fromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!sliderRef.current) return
    const { left, width } = sliderRef.current.getBoundingClientRect()
    const raw = min + ((e.clientX - left) / width) * (max - min)
    onValueChange(Math.min(max, Math.max(min, Math.round(raw / step) * step)))
    clientX.jump(e.clientX)
  }

  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100

  return (
    <motion.div
      onHoverStart={() => animate(scale, 1.08)}
      onHoverEnd={() => animate(scale, 1)}
      style={{ scale }}
      className={`flex w-full touch-none select-none items-center gap-3 ${className}`}
    >
      <motion.div animate={{ scale: region === 'left' ? [1, 1.4, 1] : 1 }} aria-hidden>{leftIcon}</motion.div>
      <div
        ref={sliderRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText(value)}
        className="relative flex min-h-12 flex-grow cursor-grab items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onPointerDown={(e) => { fromPointer(e); e.currentTarget.setPointerCapture(e.pointerId) }}
        onPointerMove={(e) => { if (e.buttons > 0) fromPointer(e) }}
        onPointerUp={() => animate(overflow, 0, { type: 'spring', bounce: 0.5 })}
        onLostPointerCapture={() => animate(overflow, 0, { type: 'spring', bounce: 0.5 })}
        onKeyDown={(e) => {
          const next = sliderKeyStep(e.key, value, { min, max, step, page: step * 4 })
          if (next !== null) { e.preventDefault(); onValueChange(next) }
        }}
      >
        <motion.div
          style={{
            scaleX: useTransform(() => (sliderRef.current ? 1 + overflow.get() / sliderRef.current.getBoundingClientRect().width : 1)),
            scaleY: useTransform(overflow, [0, MAX_OVERFLOW], [1, 0.8]),
            transformOrigin: useTransform(() => {
              if (!sliderRef.current) return 'center'
              const { left, width } = sliderRef.current.getBoundingClientRect()
              return clientX.get() < left + width / 2 ? 'right' : 'left'
            }),
          }}
          className="flex h-2 flex-grow"
        >
          <div className="relative h-full flex-grow overflow-hidden rounded-full bg-surface-2">
            <div className="absolute h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </motion.div>
      </div>
      <motion.div animate={{ scale: region === 'right' ? [1, 1.4, 1] : 1 }} aria-hidden>{rightIcon}</motion.div>
    </motion.div>
  )
}
```

- [ ] **Step 6: Write the `fx` wrappers**

Check each vendored component's exported name and props in its file; the wrappers below assume the current Magic UI / React Bits APIs (`BlurFade{delay,inView}`, `NumberTicker{value,decimalPlaces}`, `SpotlightCard{className,spotlightColor}`, `ClickSpark{sparkColor,sparkCount,children}`, `SplitText{text,tag,className,delay,splitType}`, `Dither{waveColor,backgroundColor,colorNum,pixelSize,enableMouseInteraction}`, Magic UI `confetti` export from `@/components/ui/confetti`). If a prop name differs in the vendored file, adapt the wrapper — never the call sites.

`src/components/fx/reveal.tsx`:
```tsx
'use client'
import { BlurFade } from '@/components/ui/blur-fade'
import { useReducedMotion } from '@/components/providers/motion-pref'

export function Reveal({ delay = 0, className, children }: { delay?: number; className?: string; children: React.ReactNode }) {
  if (useReducedMotion()) return <div className={className}>{children}</div>
  return <BlurFade delay={delay} inView className={className}>{children}</BlurFade>
}
```

`src/components/fx/amount-ticker.tsx`:
```tsx
'use client'
import { NumberTicker } from '@/components/ui/number-ticker'
import { useReducedMotion } from '@/components/providers/motion-pref'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'

export function AmountTicker({ paise, className, signed }: { paise: number; className?: string; signed?: boolean }) {
  const reduced = useReducedMotion()
  const label = formatINR(paise, { signed })
  // data-amount always carries the final formatted value (stable hook for tests and screen readers)
  if (reduced || paise < 0) return <span className={cn('amount', className)} data-amount={label}>{label}</span>
  const hasPaise = paise % 100 !== 0
  return (
    <span className={cn('amount', className)} aria-label={label} data-amount={label}>
      <span aria-hidden>{signed && paise > 0 ? '+₹' : '₹'}</span>
      <NumberTicker aria-hidden value={paise / 100} decimalPlaces={hasPaise ? 2 : 0} className="amount text-inherit" />
    </span>
  )
}
```

`src/components/fx/tile.tsx`:
```tsx
'use client'
import SpotlightCard from '@/components/reactbits/SpotlightCard'
import { useReducedMotion } from '@/components/providers/motion-pref'
import { cn } from '@/lib/utils'

export function Tile({ className, spotlight = true, children, ...rest }: React.HTMLAttributes<HTMLElement> & { spotlight?: boolean }) {
  const base = cn('rounded-tile border bg-card p-5 text-card-foreground', className)
  if (!spotlight || useReducedMotion()) return <section className={base} {...rest}>{children}</section>
  return (
    <SpotlightCard className={base} spotlightColor="rgba(200, 245, 96, 0.14)">
      <section {...rest}>{children}</section>
    </SpotlightCard>
  )
}
```

`src/components/fx/spark.tsx`:
```tsx
'use client'
import ClickSpark from '@/components/reactbits/ClickSpark'
import { useReducedMotion } from '@/components/providers/motion-pref'

export function Spark({ children }: { children: React.ReactNode }) {
  if (useReducedMotion()) return <>{children}</>
  return <ClickSpark sparkColor="#C8F560" sparkCount={10} sparkRadius={22} duration={420}>{children}</ClickSpark>
}
```

`src/components/fx/celebrate.tsx`:
```tsx
'use client'
import { useEffect, useRef } from 'react'
import { confetti } from '@/components/ui/confetti'
import { useReducedMotion } from '@/components/providers/motion-pref'

export function celebrate() {
  if (document.documentElement.dataset.reduceMotion === 'true') return
  void confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors: ['#C8F560', '#F1F5F2', '#7FD8C4'] })
}

export function CelebrateOnMount() {
  const reduced = useReducedMotion()
  const fired = useRef(false)
  useEffect(() => {
    if (reduced || fired.current) return
    fired.current = true
    celebrate()
  }, [reduced])
  return null
}
```

`src/components/fx/hero-background.tsx`:
```tsx
'use client'
import dynamic from 'next/dynamic'
import { useReducedMotion } from '@/components/providers/motion-pref'

const Dither = dynamic(() => import('@/components/reactbits/Dither'), { ssr: false })

export function HeroBackground() {
  const reduced = useReducedMotion()
  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
      {reduced ? (
        <div className="h-full w-full bg-[radial-gradient(60%_60%_at_50%_30%,rgba(200,245,96,0.18),transparent)]" />
      ) : (
        <Dither waveColor={[0.78, 0.96, 0.38]} backgroundColor={[0.055, 0.063, 0.059]} colorNum={4} pixelSize={2} enableMouseInteraction />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />
    </div>
  )
}
```

`src/components/fx/split-heading.tsx`:
```tsx
'use client'
import SplitText from '@/components/reactbits/SplitText'
import { useReducedMotion } from '@/components/providers/motion-pref'

export function SplitHeading({ as = 'h1', text, className }: { as?: 'h1' | 'h2'; text: string; className?: string }) {
  const Tag = as
  if (useReducedMotion()) return <Tag className={className}>{text}</Tag>
  return <SplitText tag={as} text={text} className={className} delay={30} splitType="chars" />
}
```

`src/components/fx/budget-slider.tsx`:
```tsx
'use client'
import ElasticSlider from '@/components/reactbits/ElasticSlider'
import { formatINR } from '@/lib/money'

export function BudgetSlider({ value, onValueChange, max, step = 50_000, label }: {
  value: number; onValueChange: (paise: number) => void; max: number; step?: number; label: string
}) {
  return (
    <ElasticSlider
      value={value} onValueChange={onValueChange} min={0} max={max} step={step} label={label}
      valueText={(v) => formatINR(v)} leftIcon={<span className="text-muted-foreground">−</span>} rightIcon={<span className="text-muted-foreground">+</span>}
    />
  )
}
```

`src/components/fx/theme-toggle.tsx`:
```tsx
'use client'
import { useTheme } from 'next-themes'
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler'

/** Magic UI toggler drives the class; we mirror the result into next-themes and (optionally) the user profile. */
export function ThemeToggle({ onPersist }: { onPersist?: (t: 'dark' | 'light') => void }) {
  const { setTheme } = useTheme()
  return (
    <span
      className="inline-grid min-h-12 min-w-12 place-items-center"
      onClickCapture={() => {
        requestAnimationFrame(() => {
          const t = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
          setTheme(t)
          onPersist?.(t)
        })
      }}
    >
      <AnimatedThemeToggler aria-label="Switch colour theme" className="rounded-full p-3" />
    </span>
  )
}
```
If the vendored `AnimatedThemeToggler` does not spread extra props onto its `<button>`, edit it to accept and spread `...props` (note `(adapted: spreads props)` in its header) so the `aria-label` reaches the button — the theme E2E test locates it by that name.

- [ ] **Step 7: Verify and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint` → PASS (fix vendored lint errors by adding file-level `/* eslint-disable … */` comments only inside `src/components/reactbits` and `src/components/ui`).
```bash
git add apps/web
git commit -m "feat(fx): vendor Magic UI + React Bits components behind reduced-motion-aware wrappers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Client data layer, undo store, undo toast and ⌘Z

**Files:**
- Create: `src/lib/api-types.ts`, `src/lib/api-client.ts`, `src/lib/undo-store.ts`, `src/hooks/queries.ts`, `src/components/providers/query-provider.tsx`, `src/components/undo/undo-toaster.tsx`, `src/components/undo/use-undo-shortcut.ts`
- Modify: `src/components/providers/app-providers.tsx`
- Test: `src/lib/api-client.test.ts`, `src/lib/undo-store.test.ts`

**Interfaces:**
- Consumes: A1 response contract; A1 types `User`, `Category`, `Transaction`, `RecurringItem`, `BalanceCheckin` (type-only), `TransactionWithCategory`, `SafeToSpendResult`, `BudgetWithSpend`, `Insights`; A1 schemas' input types.
- Produces:
  - `type Serialized<T>` (Dates → ISO strings); DTOs `MeDTO`, `CategoryDTO`, `TransactionDTO` (with `category`), `RecurringDTO`, `BudgetDTO`, `InsightsDTO`, `SafeToSpendDTO`.
  - `class ApiError extends Error { code: string; status: number; field?: string; requestId?: string }`; `api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T>`.
  - `UNDO_VISIBLE_MS = 10_000`; `createUndoStore(now?: () => number)` → `{ push(e: { auditId: string; label: string }): void; current(): UndoEntry | null; take(): UndoEntry | null; clear(auditId?: string): void; subscribe(l: () => void): () => void }`; singleton `undoStore`.
  - Query keys `qk`; hooks: `useMe`, `useCategories(kind?)`, `useSafeToSpend(initial?)`, `useTransactions(filters)` (infinite), `useDrafts`, `useRecurring`, `useBudgets`, `useInsights(from, to)`; mutations `useCreateTransaction`, `useUpdateTransaction`, `useDeleteTransaction`, `useConfirmDraft`, `useSkipDraft`, `useCreateRecurring`, `useUpdateRecurring`, `useDeleteRecurring`, `useUpsertBudget`, `useDeleteBudget`, `useCheckin`, `useUpdateMe`, `useUndo`.
  - `<UndoToaster />` (mounted once in `AppProviders`), `useUndoShortcut()`.

- [ ] **Step 1: Install**

```bash
cd apps/web && pnpm add @tanstack/react-query@^5.104.1 && cd ../..
```

- [ ] **Step 2: Write failing tests**

`src/lib/api-client.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api-client'

afterEach(() => vi.unstubAllGlobals())

describe('api', () => {
  it('prefixes /api/v1 and sends JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: 1 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(api('/me', { method: 'PATCH', json: { name: 'A' } })).resolves.toEqual({ data: 1 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/me')
    expect(init.body).toBe('{"name":"A"}')
    expect(init.headers['content-type']).toBe('application/json')
  })

  it('throws ApiError with server code, field and requestId', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'invalid', message: 'Pick a category.', field: 'categoryId' }, requestId: 'r9' }), { status: 422 })))
    const err = await api('/transactions').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ code: 'invalid', status: 422, field: 'categoryId', requestId: 'r9', message: 'Pick a category.' })
  })

  it('maps network failures to an offline ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(api('/me')).rejects.toMatchObject({ code: 'offline', status: 0 })
  })
})
```

`src/lib/undo-store.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { createUndoStore, UNDO_VISIBLE_MS } from './undo-store'

describe('undo store', () => {
  it('keeps only the latest entry and notifies subscribers', () => {
    let t = 0
    const s = createUndoStore(() => t)
    const l = vi.fn()
    s.subscribe(l)
    s.push({ auditId: 'a', label: 'Added ₹450' })
    s.push({ auditId: 'b', label: 'Deleted ₹99' })
    expect(s.current()?.auditId).toBe('b')
    expect(l).toHaveBeenCalledTimes(2)
  })

  it('expires after the visible window', () => {
    let t = 0
    const s = createUndoStore(() => t)
    s.push({ auditId: 'a', label: 'x' })
    t = UNDO_VISIBLE_MS + 1
    expect(s.current()).toBeNull()
    expect(s.take()).toBeNull()
  })

  it('take() consumes the entry exactly once', () => {
    const s = createUndoStore(() => 0)
    s.push({ auditId: 'a', label: 'x' })
    expect(s.take()?.auditId).toBe('a')
    expect(s.take()).toBeNull()
  })

  it('clear(id) ignores stale ids', () => {
    const s = createUndoStore(() => 0)
    s.push({ auditId: 'b', label: 'x' })
    s.clear('a')
    expect(s.current()?.auditId).toBe('b')
    s.clear('b')
    expect(s.current()).toBeNull()
  })
})
```
Run: `pnpm --filter web test -- src/lib/api-client.test.ts src/lib/undo-store.test.ts` → FAIL.

- [ ] **Step 3: Implement types, client and store**

`src/lib/api-types.ts`:
```ts
import type { SafeToSpendResult } from './safe-to-spend'
import type { BalanceCheckin, Category, RecurringItem, User } from '@/server/db/schema'
import type { TransactionWithCategory } from '@/server/services/transactions'
import type { BudgetWithSpend } from '@/server/services/budgets'
import type { Insights } from '@/server/services/insights'

export type Serialized<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] extends object ? Serialized<T[K]> : T[K]
}

export type MeDTO = Serialized<User>
export type CategoryDTO = Serialized<Category>
export type TransactionDTO = Serialized<TransactionWithCategory>
export type RecurringDTO = Serialized<RecurringItem>
export type CheckinDTO = Serialized<BalanceCheckin>
export type BudgetDTO = BudgetWithSpend
export type InsightsDTO = Insights
export type SafeToSpendDTO = SafeToSpendResult
export type Mutation<T = unknown> = { data?: T; auditId: string | null }
```
(Type-only imports from `@/server/*` are erased at build time and never reach the client bundle.)

`src/lib/api-client.ts`:
```ts
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly field?: string,
    public readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init
  let res: Response
  try {
    res = await fetch(`/api/v1${path}`, {
      ...rest,
      headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...(headers as Record<string, string>) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    })
  } catch {
    throw new ApiError('offline', 'You’re offline — changes will sync when you’re back.', 0)
  }
  if (res.ok) return (await res.json()) as T
  const body = (await res.json().catch(() => null)) as { error?: { code: string; message: string; field?: string }; requestId?: string } | null
  throw new ApiError(
    body?.error?.code ?? 'http_error',
    body?.error?.message ?? 'Something went wrong. Please try again.',
    res.status,
    body?.error?.field,
    body?.requestId,
  )
}
```

`src/lib/undo-store.ts`:
```ts
export const UNDO_VISIBLE_MS = 10_000

export interface UndoEntry {
  auditId: string
  label: string
  createdAt: number
}

export function createUndoStore(now: () => number = () => Date.now()) {
  let entry: UndoEntry | null = null
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())

  const current = (): UndoEntry | null => {
    if (entry && now() - entry.createdAt > UNDO_VISIBLE_MS) entry = null
    return entry
  }

  return {
    push(e: { auditId: string; label: string }) {
      entry = { ...e, createdAt: now() }
      emit()
    },
    current,
    take(): UndoEntry | null {
      const e = current()
      if (e) {
        entry = null
        emit()
      }
      return e
    },
    clear(auditId?: string) {
      if (entry && (!auditId || entry.auditId === auditId)) {
        entry = null
        emit()
      }
    },
    subscribe(l: () => void) {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
  }
}

export const undoStore = createUndoStore()
```
Run the two tests → PASS.

- [ ] **Step 4: Query provider, hooks and undo UI**

`src/components/providers/query-provider.tsx`:
```tsx
'use client'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '@/lib/api-client'

/** Expired session → sign in and come straight back (spec §8). */
function redirectOn401(err: unknown) {
  if (err instanceof ApiError && err.status === 401 && typeof window !== 'undefined') {
    window.location.href = `/sign-in?redirect_url=${encodeURIComponent(window.location.pathname + window.location.search)}`
  }
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    queryCache: new QueryCache({ onError: redirectOn401 }),
    mutationCache: new MutationCache({ onError: redirectOn401 }),
    defaultOptions: {
      queries: {
        staleTime: 20_000,
        retry: (count, err) => err instanceof ApiError && (err.code === 'offline' || err.status >= 500) && count < 3,
      },
      mutations: { retry: (count, err) => err instanceof ApiError && err.code === 'offline' && count < 5, retryDelay: 2_000 },
    },
  }))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
```
(Offline quick adds are retried in memory, per spec §8.)

`src/hooks/queries.ts`:
```ts
'use client'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/api-client'
import type {
  BudgetDTO, CategoryDTO, CheckinDTO, InsightsDTO, MeDTO, Mutation, RecurringDTO, SafeToSpendDTO, TransactionDTO,
} from '@/lib/api-types'
import { formatINR } from '@/lib/money'
import type { MePatch } from '@/lib/schemas/me'
import type { RecurringCreate, RecurringPatch } from '@/lib/schemas/recurring'
import { undoStore } from '@/lib/undo-store'

export type TxnFilters = { type?: string; categoryId?: string; method?: string; from?: string; to?: string; q?: string }
export type TxnInput = { type: 'expense' | 'income'; amount: number; categoryId: string; note?: string | null; method?: string; occurredAt?: string }

export const qk = {
  me: ['me'] as const,
  categories: (kind?: string) => ['categories', kind ?? 'all'] as const,
  sts: ['safe-to-spend'] as const,
  transactions: (f: TxnFilters) => ['transactions', 'confirmed', f] as const,
  drafts: ['transactions', 'draft'] as const,
  recurring: ['recurring'] as const,
  budgets: ['budgets'] as const,
  insights: (from: string, to: string) => ['insights', from, to] as const,
}

const LEDGER_KEYS: QueryKey[] = [['transactions'], qk.sts, qk.budgets, ['insights']]

function qs(f: Record<string, string | undefined>) {
  const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][])
  const s = p.toString()
  return s ? `?${s}` : ''
}

function useLedgerMutation<TVars, TRes extends Mutation>(
  fn: (v: TVars) => Promise<TRes>,
  label: (v: TVars, r: TRes) => string,
  extraKeys: QueryKey[] = [],
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (res, vars) => {
      if (res.auditId) undoStore.push({ auditId: res.auditId, label: label(vars, res) })
      for (const key of [...LEDGER_KEYS, ...extraKeys]) void qc.invalidateQueries({ queryKey: key })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong.', {
      description: err instanceof ApiError && err.requestId ? `Ref: ${err.requestId}` : undefined,
    }),
  })
}

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: () => api<{ data: MeDTO }>('/me').then((r) => r.data) })
export const useCategories = (kind?: 'expense' | 'income') =>
  useQuery({ queryKey: qk.categories(kind), queryFn: () => api<{ data: CategoryDTO[] }>(`/categories${qs({ kind })}`).then((r) => r.data), staleTime: 300_000 })
export const useSafeToSpend = (initial?: SafeToSpendDTO) =>
  useQuery({ queryKey: qk.sts, queryFn: () => api<{ data: SafeToSpendDTO }>('/summary/safe-to-spend').then((r) => r.data), initialData: initial })
export const useTransactions = (filters: TxnFilters) =>
  useInfiniteQuery({
    queryKey: qk.transactions(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api<{ data: TransactionDTO[]; nextCursor: string | null }>(`/transactions${qs({ ...filters, cursor: pageParam })}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
export const useDrafts = () =>
  useQuery({ queryKey: qk.drafts, queryFn: () => api<{ data: TransactionDTO[] }>('/transactions?status=draft').then((r) => r.data) })
export const useRecurring = () => useQuery({ queryKey: qk.recurring, queryFn: () => api<{ data: RecurringDTO[] }>('/recurring').then((r) => r.data) })
export const useBudgets = () => useQuery({ queryKey: qk.budgets, queryFn: () => api<{ data: BudgetDTO[] }>('/budgets').then((r) => r.data) })
export const useInsights = (from: string, to: string) =>
  useQuery({ queryKey: qk.insights(from, to), queryFn: () => api<{ data: InsightsDTO }>(`/insights${qs({ from, to })}`).then((r) => r.data) })

const verb = (t: { type: string }) => (t.type === 'income' ? 'income' : 'expense')

export const useCreateTransaction = () =>
  useLedgerMutation(
    (v: TxnInput) => api<Mutation<TransactionDTO>>('/transactions', { method: 'POST', json: v }),
    (v) => `Added ${formatINR(v.amount)} ${verb(v)}`,
  )
export const useUpdateTransaction = () =>
  useLedgerMutation(
    ({ id, patch }: { id: string; patch: Partial<TxnInput> }) => api<Mutation<TransactionDTO>>(`/transactions/${id}`, { method: 'PATCH', json: patch }),
    () => 'Saved changes',
  )
export const useDeleteTransaction = () =>
  useLedgerMutation(
    (t: { id: string; amount: number }) => api<Mutation>(`/transactions/${t.id}`, { method: 'DELETE' }),
    (t) => `Deleted ${formatINR(t.amount)}`,
  )
export const useConfirmDraft = () =>
  useLedgerMutation((t: { id: string; name: string }) => api<Mutation>(`/transactions/${t.id}/confirm`, { method: 'POST' }), (t) => `Confirmed ${t.name}`)
export const useSkipDraft = () =>
  useLedgerMutation((t: { id: string; name: string }) => api<Mutation>(`/transactions/${t.id}/skip`, { method: 'POST' }), (t) => `Skipped ${t.name}`)
export const useCreateRecurring = () =>
  useLedgerMutation((v: RecurringCreate) => api<Mutation<RecurringDTO>>('/recurring', { method: 'POST', json: v }), (v) => `Scheduled ${v.name}`, [qk.recurring])
export const useUpdateRecurring = () =>
  useLedgerMutation(
    ({ id, patch }: { id: string; name: string; patch: RecurringPatch }) => api<Mutation<RecurringDTO>>(`/recurring/${id}`, { method: 'PATCH', json: patch }),
    (v) => `Updated ${v.name}`, [qk.recurring],
  )
export const useDeleteRecurring = () =>
  useLedgerMutation((v: { id: string; name: string }) => api<Mutation>(`/recurring/${v.id}`, { method: 'DELETE' }), (v) => `Removed ${v.name}`, [qk.recurring])
export const useUpsertBudget = () =>
  useLedgerMutation(
    (v: { categoryId: string; monthlyLimit: number; name: string }) => api<Mutation>(`/budgets/${v.categoryId}`, { method: 'PUT', json: { monthlyLimit: v.monthlyLimit } }),
    (v) => `${v.name} plan set to ${formatINR(v.monthlyLimit)}`,
  )
export const useDeleteBudget = () =>
  useLedgerMutation((v: { categoryId: string; name: string }) => api<Mutation>(`/budgets/${v.categoryId}`, { method: 'DELETE' }), (v) => `Removed ${v.name} plan`)
export const useCheckin = () =>
  useLedgerMutation((v: { amount: number }) => api<Mutation<CheckinDTO>>('/checkins', { method: 'POST', json: v }), (v) => `Balance set to ${formatINR(v.amount)}`)

export const useUpdateMe = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: MePatch) => api<{ data: MeDTO }>('/me', { method: 'PATCH', json: patch }).then((r) => r.data),
    onSuccess: (me) => {
      qc.setQueryData(qk.me, me)
      void qc.invalidateQueries({ queryKey: qk.sts })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Couldn’t save that.'),
  })
}

export const useUndo = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (auditId: string) => api<{ data: unknown }>(`/undo/${auditId}`, { method: 'POST' }),
    onSuccess: () => {
      for (const key of [...LEDGER_KEYS, qk.recurring]) void qc.invalidateQueries({ queryKey: key })
      toast.success('Undone')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Couldn’t undo that.'),
  })
}
```

`src/components/undo/use-undo-shortcut.ts`:
```ts
'use client'
import { useEffect } from 'react'
import { useUndo } from '@/hooks/queries'
import { undoStore } from '@/lib/undo-store'

const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

/** ⌘Z / Ctrl+Z undoes the latest app change — but never hijacks native text undo inside fields. */
export function useUndoShortcut() {
  const undo = useUndo()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey || isTextField(e.target)) return
      const entry = undoStore.take()
      if (!entry) return
      e.preventDefault()
      undo.mutate(entry.auditId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])
}
```

`src/components/undo/undo-toaster.tsx`:
```tsx
'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { toast, Toaster } from 'sonner'
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar'
import { Button } from '@/components/ui/button'
import { useUndo } from '@/hooks/queries'
import { UNDO_VISIBLE_MS, undoStore } from '@/lib/undo-store'
import { useUndoShortcut } from './use-undo-shortcut'

function Countdown({ createdAt }: { createdAt: number }) {
  const [left, setLeft] = useState(UNDO_VISIBLE_MS)
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, UNDO_VISIBLE_MS - (Date.now() - createdAt))), 100)
    return () => clearInterval(id)
  }, [createdAt])
  return (
    <AnimatedCircularProgressBar
      className="size-9 text-[10px]" max={UNDO_VISIBLE_MS} min={0} value={left}
      gaugePrimaryColor="var(--primary)" gaugeSecondaryColor="var(--surface-2)"
    />
  )
}

export function UndoToaster() {
  const entry = useSyncExternalStore(undoStore.subscribe, undoStore.current, () => null)
  const undo = useUndo()
  useUndoShortcut()

  useEffect(() => {
    if (!entry) return
    const id = toast.custom(
      (t) => (
        <div role="status" className="flex w-[min(92vw,380px)] items-center gap-3 rounded-tile border bg-popover p-3 text-popover-foreground shadow-lg">
          <Countdown createdAt={entry.createdAt} />
          <p className="flex-1 text-sm">{entry.label}</p>
          <Button
            variant="secondary" className="min-h-12 px-4 active:scale-[0.97]"
            onClick={() => { if (undoStore.take()) undo.mutate(entry.auditId); toast.dismiss(t) }}
          >
            Undo <kbd className="ml-2 hidden font-mono text-xs text-muted-foreground sm:inline">⌘Z</kbd>
          </Button>
        </div>
      ),
      { id: entry.auditId, duration: UNDO_VISIBLE_MS, onAutoClose: () => undoStore.clear(entry.auditId) },
    )
    return () => { toast.dismiss(id) }
  }, [entry, undo])

  return <Toaster position="bottom-center" offset={96} theme="system" />
}
```

Update `src/components/providers/app-providers.tsx` to wrap with `QueryProvider` and mount `<UndoToaster />`:
```tsx
'use client'
import { ThemeProvider } from 'next-themes'
import { UndoToaster } from '@/components/undo/undo-toaster'
import type { MotionPref } from '@/lib/motion-pref'
import { LenisProvider } from './lenis-provider'
import { MotionPrefProvider } from './motion-pref'
import { QueryProvider } from './query-provider'

export function AppProviders({ motionPref, children }: { motionPref: MotionPref; children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryProvider>
        <MotionPrefProvider initial={motionPref}>
          <LenisProvider>{children}</LenisProvider>
          <UndoToaster />
        </MotionPrefProvider>
      </QueryProvider>
    </ThemeProvider>
  )
}
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck` → PASS.
```bash
git add apps/web
git commit -m "feat(client): typed API client, query hooks with undo-aware mutations, undo toast and ⌘Z

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: App shell — guard, sidebar, bottom tabs, "Ask Coinflow" command palette

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/components/shell/{app-shell,sidebar,bottom-tabs,top-bar,ask-pill,command-palette,nav-items}.tsx|ts`, `src/components/quick-add/quick-add-provider.tsx`, `src/lib/quick-command.ts`
- Test: `src/lib/quick-command.test.ts`

**Interfaces:**
- Consumes: `requireCurrentUser` (A1), `materializeDueRecurring` (A1), `toISTDate` (A1); `AppProviders`-level hooks; `useCategories`, `useMe` (Task 14).
- Produces:
  - `type QuickCommand = { type: 'expense' | 'income'; amount: number; categoryId: string | null; note: string | null }`; `parseQuickCommand(text: string, categories: { id: string; name: string; kind: 'expense' | 'income' }[]): QuickCommand | null`
  - `<QuickAddProvider>`; `useQuickAdd(): { open(prefill?: Partial<QuickCommand> & { editId?: string; occurredAt?: string; method?: string }): void; close(): void; state }`
  - `NAV_ITEMS: { href: string; label: string; icon: LucideIcon; mobile: boolean }[]`
  - Shell keyboard: **N** opens quick add; **⌘K / Ctrl+K** opens the palette.

- [ ] **Step 1: Write the failing parser test**

`src/lib/quick-command.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { parseQuickCommand } from './quick-command'

const cats = [
  { id: 'food', name: 'Food & Dining', kind: 'expense' as const },
  { id: 'transport', name: 'Transport', kind: 'expense' as const },
  { id: 'groceries', name: 'Groceries', kind: 'expense' as const },
  { id: 'salary', name: 'Salary', kind: 'income' as const },
]

describe('parseQuickCommand', () => {
  it('amount + category word', () => {
    expect(parseQuickCommand('250 food lunch', cats)).toEqual({ type: 'expense', amount: 25_000, categoryId: 'food', note: 'lunch' })
  })
  it('synonyms keep the word in the note', () => {
    expect(parseQuickCommand('1.2k uber to office', cats)).toEqual({ type: 'expense', amount: 120_000, categoryId: 'transport', note: 'uber to office' })
  })
  it('leading + means income and matches income categories', () => {
    expect(parseQuickCommand('+50000 salary', cats)).toEqual({ type: 'income', amount: 5_000_000, categoryId: 'salary', note: null })
  })
  it('₹ and commas are fine; unknown words become the note', () => {
    expect(parseQuickCommand('₹1,250 movie night', cats)).toEqual({ type: 'expense', amount: 125_000, categoryId: null, note: 'movie night' })
  })
  it('returns null without a leading amount', () => {
    expect(parseQuickCommand('food 250', cats)).toBeNull()
    expect(parseQuickCommand('', cats)).toBeNull()
  })
})
```
Run → FAIL.

- [ ] **Step 2: Implement the parser**

`src/lib/quick-command.ts`:
```ts
import { MAX_AMOUNT_PAISE, parseRupeesToPaise } from './money'

export type QuickCommand = { type: 'expense' | 'income'; amount: number; categoryId: string | null; note: string | null }
type Cat = { id: string; name: string; kind: 'expense' | 'income' }

const SYNONYMS: Record<string, string> = {
  uber: 'Transport', ola: 'Transport', cab: 'Transport', auto: 'Transport', metro: 'Transport', petrol: 'Transport', rapido: 'Transport',
  swiggy: 'Food & Dining', zomato: 'Food & Dining', lunch: 'Food & Dining', dinner: 'Food & Dining', chai: 'Food & Dining', coffee: 'Food & Dining',
  blinkit: 'Groceries', zepto: 'Groceries', bigbasket: 'Groceries', grocery: 'Groceries',
  netflix: 'Subscriptions', spotify: 'Subscriptions', prime: 'Subscriptions',
  recharge: 'Bills & Utilities', electricity: 'Bills & Utilities', wifi: 'Bills & Utilities',
  pvr: 'Entertainment', movie: 'Entertainment', medicine: 'Health', pharmacy: 'Health',
  amazon: 'Shopping', myntra: 'Shopping', flipkart: 'Shopping',
}

function parseAmount(token: string): number | null {
  const k = /^(.*?)k$/i.exec(token)
  const paise = parseRupeesToPaise(k ? k[1] : token)
  if (paise === null) return null
  const value = k ? paise * 1000 : paise
  return value > 0 && value <= MAX_AMOUNT_PAISE ? value : null
}

export function parseQuickCommand(text: string, categories: Cat[]): QuickCommand | null {
  const trimmed = text.trim()
  const income = trimmed.startsWith('+')
  const [first, ...rest] = trimmed.replace(/^\+/, '').split(/\s+/).filter(Boolean)
  if (!first) return null
  const amount = parseAmount(first)
  if (amount === null) return null
  const type = income ? 'income' : 'expense'
  const pool = categories.filter((c) => c.kind === type)

  let categoryId: string | null = null
  const noteWords = [...rest]
  for (let i = 0; i < rest.length && !categoryId; i++) {
    const word = rest[i].toLowerCase()
    const direct = pool.find((c) => c.name.toLowerCase().split(/[\s&]+/).some((part) => part && part.startsWith(word) && word.length >= 3))
    if (direct) {
      categoryId = direct.id
      noteWords.splice(i, 1)
      break
    }
    const synonym = SYNONYMS[word]
    const viaSynonym = synonym ? pool.find((c) => c.name === synonym) : undefined
    if (viaSynonym) categoryId = viaSynonym.id
  }
  const note = noteWords.join(' ').trim()
  return { type, amount, categoryId, note: note || null }
}
```
Run the test → PASS.

- [ ] **Step 3: Quick-add context (the sheet itself arrives in Task 16)**

`src/components/quick-add/quick-add-provider.tsx`:
```tsx
'use client'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { QuickCommand } from '@/lib/quick-command'

export type QuickAddPrefill = Partial<QuickCommand> & { editId?: string; occurredAt?: string; method?: string }
type State = { open: boolean; prefill: QuickAddPrefill }

const Ctx = createContext<{ state: State; open: (p?: QuickAddPrefill) => void; close: () => void } | null>(null)

export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ open: false, prefill: {} })
  const open = useCallback((prefill: QuickAddPrefill = {}) => setState({ open: true, prefill }), [])
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), [])
  const value = useMemo(() => ({ state, open, close }), [state, open, close])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useQuickAdd() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useQuickAdd must be used inside QuickAddProvider')
  return ctx
}
```

- [ ] **Step 4: Navigation pieces**

`src/components/shell/nav-items.ts`:
```ts
import { Activity, CalendarClock, Home, PieChart, UserRound, type LucideIcon } from 'lucide-react'

export const NAV_ITEMS: { href: string; label: string; icon: LucideIcon; mobile: boolean }[] = [
  { href: '/home', label: 'Home', icon: Home, mobile: true },
  { href: '/activity', label: 'Activity', icon: Activity, mobile: true },
  { href: '/insights', label: 'Insights', icon: PieChart, mobile: true },
  { href: '/recurring', label: 'Recurring', icon: CalendarClock, mobile: false },
  { href: '/profile', label: 'Profile', icon: UserRound, mobile: true },
]
```

`src/components/shell/sidebar.tsx`:
```tsx
'use client'
import { motion } from 'motion/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'

export function Sidebar() {
  const path = usePathname()
  return (
    <nav aria-label="Main" className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r bg-card/40 p-4 lg:flex">
      <Link href="/home" className="mb-6 flex min-h-12 items-center gap-2 px-3 font-display text-xl font-bold">
        <span className="grid size-8 place-items-center rounded-chip bg-primary text-primary-foreground">₹</span> coinflow
      </Link>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = path.startsWith(href)
        return (
          <Link
            key={href} href={href} aria-current={active ? 'page' : undefined}
            className={cn('relative flex min-h-12 items-center gap-3 rounded-chip px-3 text-sm transition-colors hover:bg-surface-2 active:scale-[0.98]',
              active ? 'text-foreground' : 'text-muted-foreground')}
          >
            {active && <motion.span layoutId="nav-active" className="absolute inset-0 -z-10 rounded-chip bg-surface-2" />}
            <Icon className={cn('size-5', active && 'text-primary')} aria-hidden /> {label}
          </Link>
        )
      })}
    </nav>
  )
}
```

`src/components/shell/bottom-tabs.tsx`:
```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'

export function BottomTabs() {
  const path = usePathname()
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {NAV_ITEMS.filter((i) => i.mobile).map(({ href, label, icon: Icon }) => {
          const active = path.startsWith(href)
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? 'page' : undefined}
                className={cn('flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] active:scale-[0.97]', active ? 'text-primary' : 'text-muted-foreground')}>
                <Icon className="size-5" aria-hidden /> {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

`src/components/shell/top-bar.tsx`:
```tsx
'use client'
import { UserButton } from '@clerk/nextjs'
import { Plus } from 'lucide-react'
import { ThemeToggle } from '@/components/fx/theme-toggle'
import { Button } from '@/components/ui/button'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'
import { useUpdateMe } from '@/hooks/queries'

export function TopBar({ title }: { title?: string }) {
  const quick = useQuickAdd()
  const updateMe = useUpdateMe()
  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur lg:px-8">
      <span className="font-display text-lg font-bold lg:hidden">coinflow</span>
      <span className="sr-only lg:not-sr-only lg:font-display lg:text-lg">{title}</span>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle onPersist={(theme) => updateMe.mutate({ theme })} />
        <Button onClick={() => quick.open()} className="hidden min-h-12 gap-2 rounded-chip px-4 active:scale-[0.97] lg:inline-flex">
          <Plus className="size-4" aria-hidden /> Add <kbd className="font-mono text-xs opacity-70">N</kbd>
        </Button>
        <div className="grid min-h-12 min-w-12 place-items-center"><UserButton /></div>
      </div>
    </header>
  )
}
```

`src/components/shell/ask-pill.tsx`:
```tsx
'use client'
import { Plus, Sparkles } from 'lucide-react'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'

/** Part A: opens the command palette. Part C upgrades the same pill to the agent. */
export function AskPill({ onOpenPalette }: { onOpenPalette: () => void }) {
  const quick = useQuickAdd()
  return (
    <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 lg:bottom-6">
      <div className="flex w-full max-w-md items-center gap-2 rounded-[20px] border bg-popover/95 p-1.5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] backdrop-blur">
        <button type="button" onClick={onOpenPalette}
          className="flex min-h-12 flex-1 items-center gap-2 rounded-2xl px-3 text-left text-sm text-muted-foreground hover:bg-surface-2 active:scale-[0.99]">
          <Sparkles className="size-4 text-primary" aria-hidden />
          Ask Coinflow… <span className="hidden sm:inline">try “250 food lunch”</span>
          <kbd className="ml-auto hidden font-mono text-xs sm:inline">⌘K</kbd>
        </button>
        <button type="button" aria-label="Add expense" onClick={() => quick.open()}
          className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground active:scale-[0.95] lg:hidden">
          <Plus className="size-6" aria-hidden />
        </button>
      </div>
    </div>
  )
}
```

`src/components/shell/command-palette.tsx`:
```tsx
'use client'
import { Moon, Plus, Search } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'
import { useCategories } from '@/hooks/queries'
import { formatINR } from '@/lib/money'
import { parseQuickCommand } from '@/lib/quick-command'
import { NAV_ITEMS } from './nav-items'

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [text, setText] = useState('')
  const router = useRouter()
  const quick = useQuickAdd()
  const { setTheme, resolvedTheme } = useTheme()
  const { data: categories = [] } = useCategories()
  const parsed = parseQuickCommand(text, categories)
  const cat = categories.find((c) => c.id === parsed?.categoryId)
  const run = (fn: () => void) => { onOpenChange(false); setText(''); fn() }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Ask Coinflow" description="Add an expense, jump to a page, or search">
      <CommandInput placeholder="“250 food lunch”, “+5000 salary”, or search…" value={text} onValueChange={setText} />
      <CommandList>
        <CommandEmpty>Try starting with an amount, like “120 chai”.</CommandEmpty>
        {parsed && (
          <CommandGroup heading="Quick add">
            <CommandItem value={`add ${text}`} onSelect={() => run(() => quick.open(parsed))}>
              <Plus className="text-primary" aria-hidden />
              {parsed.type === 'income' ? 'Add income' : 'Add expense'} {formatINR(parsed.amount)}
              {cat ? ` · ${cat.emoji} ${cat.name}` : ''}{parsed.note ? ` · “${parsed.note}”` : ''}
            </CommandItem>
          </CommandGroup>
        )}
        {text && !parsed && (
          <CommandGroup heading="Search">
            <CommandItem value={`search ${text}`} onSelect={() => run(() => router.push(`/activity?q=${encodeURIComponent(text)}`))}>
              <Search aria-hidden /> Search activity for “{text}”
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Go to">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <CommandItem key={href} value={`go ${label}`} onSelect={() => run(() => router.push(href))}>
              <Icon aria-hidden /> {label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Preferences">
          <CommandItem value="toggle theme" onSelect={() => run(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'))}>
            <Moon aria-hidden /> Switch to {resolvedTheme === 'dark' ? 'light' : 'dark'} theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
```

`src/components/shell/app-shell.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { QuickAddProvider, useQuickAdd } from '@/components/quick-add/quick-add-provider'
import { QuickAddSheet } from '@/components/quick-add/quick-add-sheet'
import { AskPill } from './ask-pill'
import { BottomTabs } from './bottom-tabs'
import { CommandPalette } from './command-palette'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'

function Shortcuts({ onPalette }: { onPalette: () => void }) {
  const quick = useQuickAdd()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); onPalette() }
      else if (!typing && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); quick.open() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPalette, quick])
  return null
}

function OfflineBanner() {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    setOnline(navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  if (online) return null
  return (
    <div role="status" className="sticky top-0 z-50 bg-surface-2 px-4 py-2 text-center text-sm">
      You’re offline — changes will sync when you’re back.
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [palette, setPalette] = useState(false)
  return (
    <QuickAddProvider>
      <OfflineBanner />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-chip focus:bg-primary focus:p-3 focus:text-primary-foreground">Skip to content</a>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-44 pt-6 lg:px-8 lg:pb-28">{children}</main>
        </div>
      </div>
      <AskPill onOpenPalette={() => setPalette(true)} />
      <BottomTabs />
      <CommandPalette open={palette} onOpenChange={setPalette} />
      <QuickAddSheet />
      <Shortcuts onPalette={() => setPalette(true)} />
    </QuickAddProvider>
  )
}
```
(`QuickAddSheet` is created in Task 16 — until then, create a stub `src/components/quick-add/quick-add-sheet.tsx` exporting `export function QuickAddSheet() { return null }` so the build passes.)

- [ ] **Step 5: The guarded `(app)` layout**

`src/app/(app)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { AppProviders } from '@/components/providers/app-providers'
import { AppShell } from '@/components/shell/app-shell'
import { toISTDate } from '@/lib/dates'
import { requireCurrentUser } from '@/server/auth'
import { AppError } from '@/server/errors'
import { materializeDueRecurring } from '@/server/services/recurring'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCurrentUser().catch((err) => {
    if (err instanceof AppError && err.status === 401) redirect('/sign-in')
    throw err
  })
  if (!user.onboardedAt) redirect('/onboarding')
  await materializeDueRecurring(user.id, toISTDate(new Date()))
  return (
    <AppProviders motionPref={user.reducedMotion}>
      <AppShell>{children}</AppShell>
    </AppProviders>
  )
}
```
Create placeholder pages so navigation works (each replaced by later tasks): `src/app/(app)/{home,activity,insights,recurring,profile}/page.tsx` each `export default function Page() { return <h1 className="font-display text-3xl">…</h1> }` with the page name.

- [ ] **Step 6: Verify and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web build` → PASS.
Manual: `pnpm dev`, sign in. Because `onboardedAt` is null you land on `/onboarding` (404 until Task 21) — temporarily run `psql postgres://coinflow:coinflow@localhost:5433/coinflow -c "update users set onboarded_at = now()"`, then confirm: sidebar on desktop, bottom tabs at 390 px width, ⌘K opens the palette, typing "250 food" shows "Add expense ₹250 · 🍜 Food & Dining".
```bash
git add apps/web
git commit -m "feat(shell): guarded app layout, sidebar/tabs, Ask Coinflow pill and command palette

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Quick add sheet (amount-first, keypad, category chips, spark, undo)

**Files:**
- Create: `src/lib/keypad.ts`, `src/components/quick-add/{quick-add-sheet,keypad,category-chips}.tsx`
- Test: `src/lib/keypad.test.ts`

**Interfaces:**
- Consumes: `useQuickAdd` (Task 15), `useCategories`, `useCreateTransaction`, `useUpdateTransaction` (Task 14), `Spark` (Task 13), `parseRupeesToPaise`, `formatINR`.
- Produces: `keypadInput(current: string, key: string): string` (keys `'0'–'9'`, `'.'`, `'back'`, `'clear'`); `<QuickAddSheet />` (create and edit mode via `prefill.editId`).

- [ ] **Step 1: Write the failing keypad test**

`src/lib/keypad.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { keypadInput } from './keypad'

const type = (keys: string[]) => keys.reduce(keypadInput, '')

describe('keypadInput', () => {
  it('builds amounts digit by digit', () => {
    expect(type(['4', '5', '0'])).toBe('450')
  })
  it('collapses leading zeros and starts decimals with 0.', () => {
    expect(type(['0', '0', '7'])).toBe('7')
    expect(type(['.', '5'])).toBe('0.5')
  })
  it('allows one decimal point and two decimal places', () => {
    expect(type(['1', '.', '2', '.', '3', '4'])).toBe('1.23')
  })
  it('refuses keys that would exceed ₹1,00,00,000 without losing input', () => {
    expect(keypadInput('10000000', '0')).toBe('10000000')
  })
  it('back and clear', () => {
    expect(keypadInput('12.5', 'back')).toBe('12.')
    expect(keypadInput('12.5', 'clear')).toBe('')
  })
})
```
Run → FAIL.

- [ ] **Step 2: Implement `keypad.ts`**

```ts
import { MAX_AMOUNT_PAISE, parseRupeesToPaise } from './money'

export function keypadInput(current: string, key: string): string {
  if (key === 'clear') return ''
  if (key === 'back') return current.slice(0, -1)
  if (key === '.') return current.includes('.') ? current : (current || '0') + '.'
  if (!/^\d$/.test(key)) return current
  const [, decimals] = current.split('.')
  if (decimals !== undefined && decimals.length >= 2) return current
  const next = current === '0' ? key : current + key
  const paise = parseRupeesToPaise(next.endsWith('.') ? next.slice(0, -1) : next)
  return paise !== null && paise > MAX_AMOUNT_PAISE ? current : next
}
```
Run → PASS.

- [ ] **Step 3: Keypad and chips components**

`src/components/quick-add/keypad.tsx`:
```tsx
'use client'
import { Delete } from 'lucide-react'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']

export function Keypad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 lg:hidden" aria-label="Number pad">
      {KEYS.map((k) => (
        <button key={k} type="button" onClick={() => onKey(k)} aria-label={k === 'back' ? 'Delete digit' : k}
          className="grid min-h-14 place-items-center rounded-chip bg-surface-2 font-display text-xl active:scale-[0.95] active:bg-accent">
          {k === 'back' ? <Delete className="size-5" aria-hidden /> : k}
        </button>
      ))}
    </div>
  )
}
```

`src/components/quick-add/category-chips.tsx`:
```tsx
'use client'
import { motion } from 'motion/react'
import type { CategoryDTO } from '@/lib/api-types'
import { cn } from '@/lib/utils'

export function CategoryChips({ categories, value, onChange }: {
  categories: CategoryDTO[]; value: string | null; onChange: (id: string) => void
}) {
  return (
    <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-2">
      {categories.map((c) => {
        const selected = c.id === value
        return (
          <motion.button
            key={c.id} type="button" role="radio" aria-checked={selected} onClick={() => onChange(c.id)}
            whileTap={{ scale: 0.95 }}
            className={cn('flex min-h-12 items-center gap-2 rounded-chip border px-3 text-sm transition-colors',
              selected ? 'border-primary bg-primary text-primary-foreground' : 'bg-surface-2 hover:border-primary/50')}
          >
            <span aria-hidden>{c.emoji}</span> {c.name}
          </motion.button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: The sheet**

`src/components/quick-add/quick-add-sheet.tsx` (replaces the Task 15 stub):
```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { Spark } from '@/components/fx/spark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCategories, useCreateTransaction, useUpdateTransaction } from '@/hooks/queries'
import { ApiError } from '@/lib/api-client'
import { keypadInput } from '@/lib/keypad'
import { formatINR, paiseToRupeeString, parseRupeesToPaise } from '@/lib/money'
import { CategoryChips } from './category-chips'
import { Keypad } from './keypad'
import { useQuickAdd } from './quick-add-provider'

const METHODS = [['upi', 'UPI'], ['cash', 'Cash'], ['card', 'Card'], ['other', 'Other']] as const
const LAST_METHOD_KEY = 'coinflow:last-method'

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    setDesktop(mq.matches)
    const on = () => setDesktop(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return desktop
}

function localDateTimeValue(iso?: string) {
  const d = iso ? new Date(iso) : new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function QuickAddSheet() {
  const { state, close } = useQuickAdd()
  const desktop = useIsDesktop()
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [method, setMethod] = useState<string>('upi')
  const [when, setWhen] = useState(localDateTimeValue())
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null)
  const { data: categories = [] } = useCategories(type)
  const create = useCreateTransaction()
  const update = useUpdateTransaction()
  const editing = Boolean(state.prefill.editId)

  useEffect(() => {
    if (!state.open) return
    const p = state.prefill
    setType(p.type ?? 'expense')
    setAmount(p.amount ? paiseToRupeeString(p.amount) : '')
    setCategoryId(p.categoryId ?? null)
    setNote(p.note ?? '')
    setMethod(p.method ?? (typeof window !== 'undefined' ? localStorage.getItem(LAST_METHOD_KEY) : null) ?? 'upi')
    setWhen(localDateTimeValue(p.occurredAt))
    setFieldError(null)
  }, [state.open, state.prefill])

  const paise = useMemo(() => parseRupeesToPaise(amount), [amount])
  const pending = create.isPending || update.isPending
  const canSave = paise !== null && paise > 0 && categoryId !== null && !pending

  async function save() {
    if (!canSave) {
      setFieldError(paise ? { field: 'categoryId', message: 'Pick a category.' } : { field: 'amount', message: 'Enter an amount more than ₹0.' })
      return
    }
    const body = { type, amount: paise!, categoryId: categoryId!, note: note.trim() || null, method, occurredAt: new Date(when).toISOString() }
    try {
      if (editing) await update.mutateAsync({ id: state.prefill.editId!, patch: body })
      else await create.mutateAsync(body)
      localStorage.setItem(LAST_METHOD_KEY, method)
      close()
    } catch (err) {
      if (err instanceof ApiError && err.field) setFieldError({ field: err.field, message: err.message })
    }
  }

  return (
    <Sheet open={state.open} onOpenChange={(o) => !o && close()}>
      <SheetContent side={desktop ? 'right' : 'bottom'} className="max-h-[92dvh] overflow-y-auto rounded-t-tile p-5 lg:max-w-md lg:rounded-none">
        <SheetHeader className="p-0">
          <SheetTitle className="font-display text-xl">{editing ? 'Edit entry' : type === 'income' ? 'Add income' : 'Add expense'}</SheetTitle>
          <SheetDescription>Amount first, then a category. Everything else is optional.</SheetDescription>
        </SheetHeader>

        <form className="mt-4 flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void save() }}>
          <ToggleGroup type="single" value={type} onValueChange={(v) => v && (setType(v as typeof type), setCategoryId(null))} className="w-full">
            <ToggleGroupItem value="expense" className="min-h-12 flex-1">Expense</ToggleGroupItem>
            <ToggleGroupItem value="income" className="min-h-12 flex-1">Income</ToggleGroupItem>
          </ToggleGroup>

          <div>
            <Label htmlFor="qa-amount" className="text-muted-foreground">Amount</Label>
            <div className="mt-1 flex items-baseline gap-1 border-b-2 border-border pb-2 focus-within:border-primary">
              <span className="amount text-4xl text-muted-foreground">₹</span>
              <input
                id="qa-amount" inputMode="decimal" autoComplete="off" autoFocus={desktop}
                value={amount} placeholder="0"
                aria-invalid={fieldError?.field === 'amount'} aria-describedby="qa-amount-help"
                onChange={(e) => setAmount(e.target.value.split('').reduce(keypadInput, ''))}
                className="amount w-full bg-transparent text-5xl outline-none placeholder:text-muted-foreground/40"
              />
            </div>
            <p id="qa-amount-help" className="mt-1 text-sm text-muted-foreground" aria-live="polite">
              {fieldError?.field === 'amount' ? fieldError.message : paise ? formatINR(paise) : 'e.g. 450 or 1,250.50'}
            </p>
          </div>

          <Keypad onKey={(k) => setAmount((a) => keypadInput(a, k))} />

          <div>
            <p className="mb-2 text-sm text-muted-foreground" id="qa-cat-label">Category</p>
            <CategoryChips categories={categories} value={categoryId} onChange={(id) => { setCategoryId(id); setFieldError(null) }} />
            {fieldError?.field === 'categoryId' && <p className="mt-2 text-sm text-neutral-negative" role="alert">{fieldError.message}</p>}
          </div>

          <details className="group rounded-chip border bg-surface-2/50 p-3">
            <summary className="flex min-h-12 cursor-pointer items-center text-sm text-muted-foreground">Note, date & method</summary>
            <div className="mt-3 flex flex-col gap-3">
              <Label htmlFor="qa-note">Note</Label>
              <Input id="qa-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="min-h-12" placeholder="Toit dinner" />
              <Label htmlFor="qa-when">When</Label>
              <Input id="qa-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="min-h-12" />
              <p className="text-sm" id="qa-method-label">Paid with</p>
              <ToggleGroup type="single" value={method} onValueChange={(v) => v && setMethod(v)} aria-labelledby="qa-method-label" className="w-full">
                {METHODS.map(([v, l]) => <ToggleGroupItem key={v} value={v} className="min-h-12 flex-1">{l}</ToggleGroupItem>)}
              </ToggleGroup>
            </div>
          </details>

          <Spark>
            <Button type="submit" disabled={pending} className="min-h-14 w-full rounded-chip text-base active:scale-[0.97]">
              {pending ? 'Saving…' : editing ? 'Save changes' : `Save${paise ? ` ${formatINR(paise)}` : ''}`}
            </Button>
          </Spark>
        </form>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck` → PASS. Manual: press **N**, type `450`, pick Food, Enter → sheet closes, undo toast with countdown ring appears; ⌘Z undoes it.
```bash
git add apps/web
git commit -m "feat(quick-add): amount-first sheet with keypad, category chips, spark and undo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Home bento

**Files:**
- Create: `src/lib/cycle-dots.ts`, `src/lib/sts-display.ts`, `src/lib/home-selectors.ts`, `src/components/home/{safe-to-spend-tile,today-tile,upcoming-bills-tile,top-category-tile,recent-activity-tile,pending-drafts-tile,checkin-dialog}.tsx`
- Modify: `src/app/(app)/home/page.tsx`
- Test: `src/lib/cycle-dots.test.ts`, `src/lib/sts-display.test.ts`, `src/lib/home-selectors.test.ts`

**Interfaces:**
- Consumes: `getSafeToSpend`, `listRecurring`, `listTransactions` (A1, server side for first paint); hooks from Task 14; fx wrappers from Task 13.
- Produces:
  - `cycleDots(cycleStart: ISODate, cycleEnd: ISODate, today: ISODate): ('past' | 'today' | 'future')[]`
  - `stsDisplay(r: { status: 'ok' | 'unknown'; amount: number; dailyPace: number; daysLeft: number }): { headline: number | null; line: string; tone: 'default' | 'neutral-negative' }`
  - `upcomingBills(recurring: RecurringDTO[], today: ISODate, cycleEnd: ISODate, limit?: number): { id: string; name: string; amount: number; dueOn: ISODate }[]`; `todaySummary(txns: TransactionDTO[], today: ISODate): { total: number; count: number; last: TransactionDTO | null }`
  - `<CheckinDialog trigger={ReactNode} />` (reused by onboarding/profile).

- [ ] **Step 1: Write failing tests**

`src/lib/cycle-dots.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { cycleDots } from './cycle-dots'

describe('cycleDots', () => {
  it('marks past, today and future days of the cycle', () => {
    const dots = cycleDots('2026-10-01', '2026-10-05', '2026-10-03')
    expect(dots).toEqual(['past', 'past', 'today', 'future', 'future'])
  })
})
```

`src/lib/sts-display.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { stsDisplay } from './sts-display'

describe('stsDisplay', () => {
  it('positive: amount + daily pace', () => {
    expect(stsDisplay({ status: 'ok', amount: 1_845_000, dailyPace: 92_250, daysLeft: 20 }))
      .toEqual({ headline: 1_845_000, line: '≈ ₹922.50/day for 20 days', tone: 'default' })
  })
  it('negative: ₹0 headline and neutral, non-punitive copy', () => {
    expect(stsDisplay({ status: 'ok', amount: -40_000, dailyPace: 0, daysLeft: 9 }))
      .toEqual({ headline: 0, line: '₹400 more committed than available this cycle', tone: 'neutral-negative' })
  })
  it('unknown: no headline, prompts a check-in', () => {
    expect(stsDisplay({ status: 'unknown', amount: 0, dailyPace: 0, daysLeft: 9 }))
      .toEqual({ headline: null, line: 'Check in your balance to see this', tone: 'default' })
  })
  it('singular day', () => {
    expect(stsDisplay({ status: 'ok', amount: 10_000, dailyPace: 10_000, daysLeft: 1 }).line).toBe('≈ ₹100/day for 1 day')
  })
})
```

`src/lib/home-selectors.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { todaySummary, upcomingBills } from './home-selectors'

const r = (over: object) => ({ id: 'x', kind: 'bill', name: 'Netflix', amount: 64_900, cadence: 'monthly', nextDueOn: '2026-10-20', anchorDay: 20, active: true, ...over }) as never

describe('upcomingBills', () => {
  it('lists active bill occurrences in the cycle, soonest first, limited', () => {
    const list = upcomingBills([
      r({ id: 'a', nextDueOn: '2026-10-20' }),
      r({ id: 'b', name: 'Gym', cadence: 'weekly', nextDueOn: '2026-10-14', anchorDay: 14 }),
      r({ id: 'c', kind: 'income', name: 'Salary' }),
      r({ id: 'd', active: false }),
      r({ id: 'e', nextDueOn: '2026-11-05' }),
    ], '2026-10-11', '2026-10-31', 3)
    expect(list.map((b) => `${b.name}@${b.dueOn}`)).toEqual(['Gym@2026-10-14', 'Netflix@2026-10-20', 'Gym@2026-10-21'])
  })
})

describe('todaySummary', () => {
  it('sums today’s confirmed expenses by IST day', () => {
    const t = (occurredAt: string, amount: number, type = 'expense') => ({ occurredAt, amount, personalShare: amount, type }) as never
    const s = todaySummary([t('2026-10-11T19:00:00Z', 5_000), t('2026-10-12T06:00:00Z', 10_000), t('2026-10-12T07:00:00Z', 99, 'income'), t('2026-10-11T10:00:00Z', 7_000)], '2026-10-12')
    expect(s.total).toBe(15_000)
    expect(s.count).toBe(2)
  })
})
```
Run → FAIL.

- [ ] **Step 2: Implement the pure helpers**

`src/lib/cycle-dots.ts`:
```ts
import { addDays, diffDays, type ISODate } from './dates'

export function cycleDots(cycleStart: ISODate, cycleEnd: ISODate, today: ISODate): ('past' | 'today' | 'future')[] {
  const n = diffDays(cycleEnd, cycleStart) + 1
  return Array.from({ length: n }, (_, i) => {
    const d = addDays(cycleStart, i)
    return d < today ? 'past' : d === today ? 'today' : 'future'
  })
}
```

`src/lib/sts-display.ts`:
```ts
import { formatINR } from './money'

export function stsDisplay(r: { status: 'ok' | 'unknown'; amount: number; dailyPace: number; daysLeft: number }) {
  if (r.status === 'unknown') return { headline: null, line: 'Check in your balance to see this', tone: 'default' as const }
  if (r.amount < 0) {
    return { headline: 0, line: `${formatINR(-r.amount)} more committed than available this cycle`, tone: 'neutral-negative' as const }
  }
  const days = r.daysLeft === 1 ? '1 day' : `${r.daysLeft} days`
  return { headline: r.amount, line: `≈ ${formatINR(r.dailyPace)}/day for ${days}`, tone: 'default' as const }
}
```

`src/lib/home-selectors.ts`:
```ts
import type { RecurringDTO, TransactionDTO } from './api-types'
import { toISTDate, type ISODate } from './dates'
import { occurrencesInRange } from './recurrence'

export function upcomingBills(recurring: RecurringDTO[], today: ISODate, cycleEnd: ISODate, limit = 3) {
  return recurring
    .filter((r) => r.active && r.kind === 'bill')
    .flatMap((r) => occurrencesInRange(r.nextDueOn, r.cadence, r.anchorDay, today, cycleEnd).map((dueOn) => ({ id: r.id, name: r.name, amount: r.amount, dueOn })))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    .slice(0, limit)
}

export function todaySummary(txns: TransactionDTO[], today: ISODate) {
  const mine = txns.filter((t) => t.type === 'expense' && toISTDate(new Date(t.occurredAt)) === today)
  return { total: mine.reduce((s, t) => s + t.personalShare, 0), count: mine.length, last: mine[0] ?? null }
}
```
Run the three tests → PASS.

- [ ] **Step 3: Tiles**

`src/components/home/checkin-dialog.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useCheckin } from '@/hooks/queries'
import { formatINR, parseRupeesToPaise } from '@/lib/money'

export function CheckinDialog({ trigger, onDone }: { trigger: React.ReactNode; onDone?: () => void }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const checkin = useCheckin()
  const paise = parseRupeesToPaise(value)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="rounded-tile">
        <DialogHeader>
          <DialogTitle className="font-display">What’s in your account right now?</DialogTitle>
          <DialogDescription>A rough number is fine. Coinflow tracks changes from here, no bank login needed.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (paise === null) return; checkin.mutate({ amount: paise }, { onSuccess: () => { setOpen(false); onDone?.() } }) }}>
          <label htmlFor="checkin-amount" className="sr-only">Balance in rupees</label>
          <div className="flex items-baseline gap-1 border-b-2 pb-2 focus-within:border-primary">
            <span className="amount text-3xl text-muted-foreground">₹</span>
            <input id="checkin-amount" inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value)}
              className="amount w-full bg-transparent text-4xl outline-none" placeholder="50,000" />
          </div>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">{paise !== null ? formatINR(paise) : 'Numbers only'}</p>
          <Button type="submit" disabled={paise === null || checkin.isPending} className="mt-4 min-h-12 w-full active:scale-[0.97]">
            {checkin.isPending ? 'Saving…' : 'Save balance'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

`src/components/home/safe-to-spend-tile.tsx`:
```tsx
'use client'
import { AmountTicker } from '@/components/fx/amount-ticker'
import { Button } from '@/components/ui/button'
import { useSafeToSpend } from '@/hooks/queries'
import type { SafeToSpendDTO } from '@/lib/api-types'
import { cycleDots } from '@/lib/cycle-dots'
import { stsDisplay } from '@/lib/sts-display'
import { cn } from '@/lib/utils'
import { CheckinDialog } from './checkin-dialog'

export function SafeToSpendTile({ initial, today }: { initial: SafeToSpendDTO; today: string }) {
  const { data = initial } = useSafeToSpend(initial)
  const view = stsDisplay(data)
  const dots = cycleDots(data.cycleStart, data.cycleEnd, today)
  return (
    <section aria-labelledby="sts-title" className="relative h-full overflow-hidden rounded-tile bg-lime p-6 text-[#0F1210]">
      <h2 id="sts-title" className="font-mono text-xs uppercase tracking-[0.12em] opacity-75">Safe to spend</h2>
      {view.headline === null ? (
        <div className="mt-3">
          <p className="font-display text-2xl font-bold">{view.line}</p>
          <CheckinDialog trigger={<Button className="mt-4 min-h-12 bg-[#0F1210] text-[#F1F5F2] hover:bg-[#0F1210]/90 active:scale-[0.97]">Check in balance</Button>} />
        </div>
      ) : (
        <>
          <AmountTicker paise={view.headline} className="mt-2 block text-6xl font-bold lg:text-7xl" />
          <p className={cn('mt-2 text-sm', view.tone === 'neutral-negative' ? 'font-medium' : 'opacity-80')}>{view.line}</p>
        </>
      )}
      <div className="mt-6" aria-label={`Day ${dots.indexOf('today') + 1} of ${dots.length} in this pay cycle`} role="img">
        <div className="flex gap-[3px]">
          {dots.map((d, i) => (
            <span key={i} className={cn('h-6 flex-1 rounded-[5px] bg-[#0F1210]', d === 'future' && 'opacity-15', d === 'today' && 'ring-2 ring-[#0F1210] ring-offset-2 ring-offset-[#C8F560]')} />
          ))}
        </div>
        <p className="mt-2 font-mono text-xs opacity-75">Pay cycle ends {new Date(data.cycleEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
      </div>
    </section>
  )
}
```

`src/components/home/today-tile.tsx`:
```tsx
'use client'
import { AmountTicker } from '@/components/fx/amount-ticker'
import { Tile } from '@/components/fx/tile'
import { useTransactions } from '@/hooks/queries'
import type { TransactionDTO } from '@/lib/api-types'
import { todaySummary } from '@/lib/home-selectors'

export function TodayTile({ today, initial }: { today: string; initial: TransactionDTO[] }) {
  const { data } = useTransactions({ from: today, to: today })
  const items = data?.pages.flatMap((p) => p.data) ?? initial
  const s = todaySummary(items, today)
  return (
    <Tile aria-labelledby="today-title">
      <h2 id="today-title" className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">Today</h2>
      <AmountTicker paise={s.total} className="mt-2 block text-3xl font-bold" />
      <p className="mt-1 text-sm text-muted-foreground">{s.count === 0 ? 'Nothing yet today' : `${s.count} spend${s.count > 1 ? 's' : ''} · last: ${s.last?.note ?? s.last?.category.name}`}</p>
    </Tile>
  )
}
```

`src/components/home/upcoming-bills-tile.tsx`:
```tsx
'use client'
import Link from 'next/link'
import { Tile } from '@/components/fx/tile'
import { useRecurring } from '@/hooks/queries'
import type { RecurringDTO } from '@/lib/api-types'
import { upcomingBills } from '@/lib/home-selectors'
import { formatINR } from '@/lib/money'

export function UpcomingBillsTile({ today, cycleEnd, initial }: { today: string; cycleEnd: string; initial: RecurringDTO[] }) {
  const { data = initial } = useRecurring()
  const bills = upcomingBills(data, today, cycleEnd)
  return (
    <Tile aria-labelledby="bills-title">
      <h2 id="bills-title" className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">Upcoming bills</h2>
      {bills.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No bills scheduled this cycle. <Link className="underline underline-offset-4" href="/recurring">Add one</Link></p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {bills.map((b) => (
            <li key={`${b.id}-${b.dueOn}`} className="flex items-center justify-between text-sm">
              <span>{b.name} <span className="text-muted-foreground">· {new Date(b.dueOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span></span>
              <span className="amount">{formatINR(b.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  )
}
```

`src/components/home/top-category-tile.tsx`:
```tsx
'use client'
import { Tile } from '@/components/fx/tile'
import { useInsights } from '@/hooks/queries'
import { formatINR } from '@/lib/money'

/** Hidden until the user has 3+ expenses (spec §4.5) — a "top" of one or two items is noise. */
export function TopCategoryTile({ from, to, enabled }: { from: string; to: string; enabled: boolean }) {
  const { data } = useInsights(from, to)
  const top = data?.byCategory[0]
  if (!enabled || !data || !top || data.totalExpense === 0) return null
  const share = Math.round((top.amount / data.totalExpense) * 100)
  return (
    <Tile aria-labelledby="top-title">
      <h2 id="top-title" className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">Top category · this cycle</h2>
      <p className="mt-2 text-lg"><span aria-hidden>{top.emoji}</span> {top.name}</p>
      <p className="amount text-2xl font-bold">{formatINR(top.amount)}</p>
      <div className="mt-3 h-2 rounded-full bg-surface-2" role="img" aria-label={`${share}% of this cycle’s spending`}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{share}% of spending</p>
    </Tile>
  )
}
```

`src/components/home/recent-activity-tile.tsx`:
```tsx
'use client'
import Link from 'next/link'
import { Tile } from '@/components/fx/tile'
import { AnimatedList } from '@/components/ui/animated-list'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'
import { Button } from '@/components/ui/button'
import { useTransactions } from '@/hooks/queries'
import type { TransactionDTO } from '@/lib/api-types'
import { formatINR } from '@/lib/money'

export function RecentActivityTile({ initial }: { initial: TransactionDTO[] }) {
  const { data } = useTransactions({})
  const items = (data?.pages.flatMap((p) => p.data) ?? initial).slice(0, 5)
  const quick = useQuickAdd()
  return (
    <Tile aria-labelledby="recent-title">
      <div className="flex items-center justify-between">
        <h2 id="recent-title" className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">Recent</h2>
        <Link href="/activity" className="flex min-h-12 items-center text-sm text-muted-foreground underline-offset-4 hover:underline">See all</Link>
      </div>
      {items.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-muted-foreground">Add your first expense — it takes three taps.</p>
          <Button onClick={() => quick.open()} className="mt-3 min-h-12 active:scale-[0.97]">Add expense</Button>
        </div>
      ) : (
        <AnimatedList delay={60} className="mt-2 gap-1">
          {items.map((t) => (
            <div key={t.id} className="flex min-h-12 w-full items-center gap-3 rounded-chip px-2 hover:bg-surface-2">
              <span className="grid size-9 place-items-center rounded-chip bg-surface-2" aria-hidden>{t.category.emoji}</span>
              <span className="flex-1 truncate text-sm">{t.note ?? t.category.name}</span>
              <span className={`amount text-sm ${t.type === 'expense' ? '' : 'text-primary'}`}>
                {t.type === 'expense' ? `−${formatINR(t.amount)}` : `+${formatINR(t.amount)}`}
              </span>
            </div>
          ))}
        </AnimatedList>
      )}
    </Tile>
  )
}
```

`src/components/home/pending-drafts-tile.tsx`:
```tsx
'use client'
import { BorderBeam } from '@/components/ui/border-beam'
import { Button } from '@/components/ui/button'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'
import { useConfirmDraft, useDrafts, useSkipDraft } from '@/hooks/queries'
import { formatINR } from '@/lib/money'

export function PendingDraftsTile() {
  const { data: drafts = [] } = useDrafts()
  const confirm = useConfirmDraft()
  const skip = useSkipDraft()
  const quick = useQuickAdd()
  if (drafts.length === 0) return null
  return (
    <section aria-labelledby="drafts-title" className="relative overflow-hidden rounded-tile border bg-card p-5">
      <BorderBeam size={120} duration={8} colorFrom="#C8F560" colorTo="#7FD8C4" />
      <h2 id="drafts-title" className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">Waiting for you · {drafts.length}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Scheduled items don’t count as spent until you confirm them.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {drafts.map((d) => {
          const name = d.note ?? d.category.name
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-chip bg-surface-2 p-2">
              <span aria-hidden>{d.category.emoji}</span>
              <span className="flex-1 text-sm">{name} · <span className="amount">{formatINR(d.amount)}</span></span>
              <Button size="sm" className="min-h-12 active:scale-[0.97]" onClick={() => confirm.mutate({ id: d.id, name })}>Confirm</Button>
              <Button size="sm" variant="secondary" className="min-h-12"
                onClick={() => quick.open({ editId: d.id, type: d.type, amount: d.amount, categoryId: d.categoryId, note: d.note, occurredAt: d.occurredAt, method: d.method })}>Edit</Button>
              <Button size="sm" variant="ghost" className="min-h-12" onClick={() => skip.mutate({ id: d.id, name })}>Skip</Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Home page (server first paint)**

`src/app/(app)/home/page.tsx`:
```tsx
import { Reveal } from '@/components/fx/reveal'
import { PendingDraftsTile } from '@/components/home/pending-drafts-tile'
import { RecentActivityTile } from '@/components/home/recent-activity-tile'
import { SafeToSpendTile } from '@/components/home/safe-to-spend-tile'
import { TodayTile } from '@/components/home/today-tile'
import { TopCategoryTile } from '@/components/home/top-category-tile'
import { UpcomingBillsTile } from '@/components/home/upcoming-bills-tile'
import type { RecurringDTO, SafeToSpendDTO, TransactionDTO } from '@/lib/api-types'
import { toISTDate } from '@/lib/dates'
import { transactionListQuerySchema } from '@/lib/schemas/transactions'
import { requireCurrentUser } from '@/server/auth'
import { listRecurring } from '@/server/services/recurring'
import { getSafeToSpend } from '@/server/services/safe-to-spend'
import { listTransactions } from '@/server/services/transactions'

export const metadata = { title: 'Home' }
const json = <T,>(v: unknown) => JSON.parse(JSON.stringify(v)) as T

export default async function HomePage() {
  const user = await requireCurrentUser()
  const today = toISTDate(new Date())
  const [sts, recurring, recent] = await Promise.all([
    getSafeToSpend(user.id),
    listRecurring(user.id),
    listTransactions(user.id, transactionListQuerySchema.parse({ limit: 20 })),
  ])
  const expenseCount = recent.data.filter((t) => t.type === 'expense').length
  // [tile, grid placement] — placement lives on the Reveal wrapper because it is the grid child
  const tiles: [React.ReactNode, string][] = [
    [<TodayTile key="today" today={today} initial={json<TransactionDTO[]>(recent.data)} />, ''],
    [<UpcomingBillsTile key="bills" today={today} cycleEnd={sts.cycleEnd} initial={json<RecurringDTO[]>(recurring)} />, ''],
    [<TopCategoryTile key="top" from={sts.cycleStart} to={today} enabled={expenseCount >= 3} />, ''],
    [<PendingDraftsTile key="drafts" />, 'sm:col-span-2'],
    [<RecentActivityTile key="recent" initial={json<TransactionDTO[]>(recent.data)} />, 'sm:col-span-2'],
  ]
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <h1 className="sr-only">Home</h1>
      <Reveal className="sm:col-span-2 lg:row-span-2"><SafeToSpendTile initial={json<SafeToSpendDTO>(sts)} today={today} /></Reveal>
      {tiles.map(([tile, placement], i) => <Reveal key={i} delay={0.04 * (i + 1)} className={placement}>{tile}</Reveal>)}
    </div>
  )
}
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web build` → PASS. Manual at 1440 and 390 px: tiles stagger in; STS counts up; empty states read correctly before a check-in.
```bash
git add apps/web
git commit -m "feat(home): Safe-to-Spend hero, today, bills, top category, recent and drafts bento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Activity page

**Files:**
- Create: `src/lib/group-by-day.ts`, `src/components/activity/{activity-view,filters-bar,transaction-row}.tsx`
- Modify: `src/app/(app)/activity/page.tsx`
- Test: `src/lib/group-by-day.test.ts`

**Interfaces:**
- Consumes: `useTransactions`, `useDeleteTransaction`, `useCategories` (Task 14), `useQuickAdd` (Task 15), `toISTDate`, `addDays`.
- Produces: `groupByDay(items: TransactionDTO[]): { date: ISODate; items: TransactionDTO[]; expenseTotal: number }[]`; `dayLabel(date: ISODate, today: ISODate): string` ("Today", "Yesterday", or "Sat, 10 Oct").

- [ ] **Step 1: Write the failing test**

`src/lib/group-by-day.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { dayLabel, groupByDay } from './group-by-day'

const t = (id: string, occurredAt: string, amount = 1000, type = 'expense') => ({ id, occurredAt, amount, personalShare: amount, type }) as never

describe('groupByDay', () => {
  it('groups by IST day in input order and totals expenses only', () => {
    const groups = groupByDay([
      t('a', '2026-10-11T19:00:00Z', 5000),          // 00:30 IST Oct 12
      t('b', '2026-10-11T18:00:00Z', 2000),          // 23:30 IST Oct 11
      t('c', '2026-10-11T10:00:00Z', 9000, 'income'),
    ])
    expect(groups.map((g) => [g.date, g.items.map((i) => i.id), g.expenseTotal])).toEqual([
      ['2026-10-12', ['a'], 5000],
      ['2026-10-11', ['b', 'c'], 2000],
    ])
  })
})

describe('dayLabel', () => {
  it('uses relative words for today and yesterday', () => {
    expect(dayLabel('2026-10-12', '2026-10-12')).toBe('Today')
    expect(dayLabel('2026-10-11', '2026-10-12')).toBe('Yesterday')
    expect(dayLabel('2026-10-10', '2026-10-12')).toBe('Sat, 10 Oct')
  })
})
```
Run → FAIL.

- [ ] **Step 2: Implement**

`src/lib/group-by-day.ts`:
```ts
import type { TransactionDTO } from './api-types'
import { addDays, toISTDate, type ISODate } from './dates'

export function groupByDay(items: TransactionDTO[]) {
  const groups: { date: ISODate; items: TransactionDTO[]; expenseTotal: number }[] = []
  for (const item of items) {
    const date = toISTDate(new Date(item.occurredAt))
    let g = groups[groups.length - 1]
    if (!g || g.date !== date) groups.push((g = { date, items: [], expenseTotal: 0 }))
    g.items.push(item)
    if (item.type === 'expense') g.expenseTotal += item.personalShare
  }
  return groups
}

const fmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export function dayLabel(date: ISODate, today: ISODate): string {
  if (date === today) return 'Today'
  if (date === addDays(today, -1)) return 'Yesterday'
  return fmt.format(new Date(`${date}T00:00:00Z`)).replace(/^(\w+) (\d+) (\w+)$/, '$1, $2 $3')
}
```
Run → PASS. (If ICU formats as "Sat, 10 Oct" already, the regex is a no-op.)

- [ ] **Step 3: Components**

`src/components/activity/filters-bar.tsx`:
```tsx
'use client'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCategories, type TxnFilters } from '@/hooks/queries'

export function FiltersBar({ value, onChange }: { value: TxnFilters; onChange: (f: TxnFilters) => void }) {
  const { data: categories = [] } = useCategories()
  const set = (patch: Partial<TxnFilters>) => onChange({ ...value, ...patch })
  return (
    <div className="flex flex-col gap-3 rounded-tile border bg-card p-3 lg:flex-row lg:items-center">
      <label className="relative flex-1">
        <span className="sr-only">Search notes and categories</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input defaultValue={value.q} placeholder="Search “Toit”, “food”…" className="min-h-12 pl-9" onChange={(e) => set({ q: e.target.value || undefined })} />
      </label>
      <ToggleGroup type="single" value={value.type ?? 'all'} onValueChange={(v) => set({ type: v === 'all' || !v ? undefined : v })} aria-label="Type">
        <ToggleGroupItem value="all" className="min-h-12">All</ToggleGroupItem>
        <ToggleGroupItem value="expense" className="min-h-12">Spent</ToggleGroupItem>
        <ToggleGroupItem value="income" className="min-h-12">Received</ToggleGroupItem>
      </ToggleGroup>
      <Select value={value.categoryId ?? 'all'} onValueChange={(v) => set({ categoryId: v === 'all' ? undefined : v })}>
        <SelectTrigger className="min-h-12 lg:w-48" aria-label="Category"><SelectValue placeholder="Category" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.emoji} {c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        <label className="flex flex-col text-xs text-muted-foreground">From<Input type="date" value={value.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} className="min-h-12" /></label>
        <label className="flex flex-col text-xs text-muted-foreground">To<Input type="date" value={value.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} className="min-h-12" /></label>
      </div>
    </div>
  )
}
```

`src/components/activity/transaction-row.tsx`:
```tsx
'use client'
import { Pencil, Trash2 } from 'lucide-react'
import { motion, useAnimation } from 'motion/react'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'
import { useDeleteTransaction } from '@/hooks/queries'
import type { TransactionDTO } from '@/lib/api-types'
import { formatINR } from '@/lib/money'

export function TransactionRow({ t }: { t: TransactionDTO }) {
  const quick = useQuickAdd()
  const del = useDeleteTransaction()
  const controls = useAnimation()
  const edit = () => quick.open({ editId: t.id, type: t.type, amount: t.amount, categoryId: t.categoryId, note: t.note, occurredAt: t.occurredAt, method: t.method })
  const time = new Date(t.occurredAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
  return (
    <li className="group relative overflow-hidden rounded-chip">
      <div className="absolute inset-y-0 right-0 flex items-center bg-surface-2 px-4 lg:hidden" aria-hidden><Trash2 className="size-5" /></div>
      <motion.div
        drag="x" dragConstraints={{ left: -96, right: 0 }} dragElastic={0.1} animate={controls}
        onDragEnd={(_, info) => { if (info.offset.x < -80) del.mutate({ id: t.id, amount: t.amount }); else void controls.start({ x: 0 }) }}
        className="relative flex min-h-14 items-center gap-3 bg-card px-2 lg:hover:bg-surface-2"
      >
        <button type="button" onClick={edit} className="flex min-h-14 flex-1 items-center gap-3 text-left" aria-label={`Edit ${t.note ?? t.category.name}, ${formatINR(t.amount)}`}>
          <span className="grid size-10 place-items-center rounded-chip bg-surface-2" aria-hidden>{t.category.emoji}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm">{t.note ?? t.category.name}</span>
            <span className="text-xs text-muted-foreground">{t.category.name} · {time} · {t.method.toUpperCase()}</span>
          </span>
          <span className={`amount ${t.type === 'income' ? 'text-primary' : ''}`}>{t.type === 'expense' ? `−${formatINR(t.amount)}` : `+${formatINR(t.amount)}`}</span>
        </button>
        <div className="hidden gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 lg:flex">
          <button type="button" onClick={edit} aria-label="Edit" className="grid size-12 place-items-center rounded-chip hover:bg-accent"><Pencil className="size-4" /></button>
          <button type="button" onClick={() => del.mutate({ id: t.id, amount: t.amount })} aria-label="Delete" className="grid size-12 place-items-center rounded-chip hover:bg-accent"><Trash2 className="size-4" /></button>
        </div>
      </motion.div>
    </li>
  )
}
```

`src/components/activity/activity-view.tsx`:
```tsx
'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ProgressiveBlur } from '@/components/ui/progressive-blur'
import { Skeleton } from '@/components/ui/skeleton'
import { useTransactions, type TxnFilters } from '@/hooks/queries'
import { toISTDate } from '@/lib/dates'
import { dayLabel, groupByDay } from '@/lib/group-by-day'
import { formatINR } from '@/lib/money'
import { FiltersBar } from './filters-bar'
import { TransactionRow } from './transaction-row'

const KEYS: (keyof TxnFilters)[] = ['q', 'type', 'categoryId', 'method', 'from', 'to']

export function ActivityView() {
  const params = useSearchParams()
  const router = useRouter()
  const path = usePathname()
  const initial = useMemo(() => Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? undefined])) as TxnFilters, [params])
  const [filters, setFilters] = useState<TxnFilters>(initial)
  const [debounced, setDebounced] = useState(filters)

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(filters)
      const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString()
      router.replace(qs ? `${path}?${qs}` : path, { scroll: false })
    }, 250)
    return () => clearTimeout(id)
  }, [filters, path, router])

  const q = useTransactions(debounced)
  const items = q.data?.pages.flatMap((p) => p.data) ?? []
  const groups = groupByDay(items)
  const today = toISTDate(new Date())
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage() })
    io.observe(el)
    return () => io.disconnect()
  }, [q])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl font-bold">Activity</h1>
      <FiltersBar value={filters} onChange={setFilters} />
      {q.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14 rounded-chip" />)}</div>
      ) : groups.length === 0 ? (
        <p className="rounded-tile border bg-card p-8 text-center text-muted-foreground">Nothing matches these filters.</p>
      ) : (
        <div className="relative">
          {groups.map((g) => (
            <section key={g.date} aria-labelledby={`d-${g.date}`} className="mb-4">
              <h2 id={`d-${g.date}`} className="sticky top-16 z-10 flex justify-between bg-background/90 py-2 text-sm backdrop-blur">
                <span className="font-medium">{dayLabel(g.date, today)}</span>
                <span className="amount text-muted-foreground">{g.expenseTotal ? `−${formatINR(g.expenseTotal)}` : ''}</span>
              </h2>
              <ul className="flex flex-col gap-1">{g.items.map((t) => <TransactionRow key={t.id} t={t} />)}</ul>
            </section>
          ))}
          <div ref={sentinel} className="h-10" aria-hidden />
          {q.isFetchingNextPage && <p className="text-center text-sm text-muted-foreground" aria-live="polite">Loading more…</p>}
          <ProgressiveBlur position="bottom" height="15%" className="pointer-events-none fixed inset-x-0 bottom-0" />
        </div>
      )}
    </div>
  )
}
```

`src/app/(app)/activity/page.tsx`:
```tsx
import { Suspense } from 'react'
import { ActivityView } from '@/components/activity/activity-view'

export const metadata = { title: 'Activity' }
export default function ActivityPage() {
  return <Suspense><ActivityView /></Suspense>
}
```

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck` → PASS. Manual: search updates the URL; swipe-left deletes on mobile emulation; hover shows actions on desktop; delete shows undo.
```bash
git add apps/web
git commit -m "feat(activity): day-grouped infinite activity with URL filters, swipe/hover actions and undo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Recurring page

**Files:**
- Create: `src/components/recurring/{recurring-view,recurring-form}.tsx`
- Modify: `src/app/(app)/recurring/page.tsx`

**Interfaces:**
- Consumes: `useRecurring`, `useCreateRecurring`, `useUpdateRecurring`, `useDeleteRecurring`, `useCategories` (Task 14); `RecurringCreate` (A1); `parseRupeesToPaise`, `formatINR`, `paiseToRupeeString`.
- Produces: `<RecurringForm initial?: RecurringDTO onDone(): void kindDefault?: 'bill' | 'income' prefill?: { name: string; category: string; amount: number } />` (reused by onboarding step 4); `BILL_SUGGESTIONS: { name: string; category: string; amount: number }[]`.

- [ ] **Step 1: Form component**

`src/components/recurring/recurring-form.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCategories, useCreateRecurring, useUpdateRecurring } from '@/hooks/queries'
import { ApiError } from '@/lib/api-client'
import type { RecurringDTO } from '@/lib/api-types'
import { addDays, toISTDate } from '@/lib/dates'
import { paiseToRupeeString, parseRupeesToPaise } from '@/lib/money'

export const BILL_SUGGESTIONS = [
  { name: 'Rent', category: 'Rent', amount: 1_500_000 },
  { name: 'Electricity', category: 'Bills & Utilities', amount: 150_000 },
  { name: 'Mobile recharge', category: 'Bills & Utilities', amount: 34_900 },
  { name: 'Wi-Fi', category: 'Bills & Utilities', amount: 70_000 },
  { name: 'Netflix', category: 'Subscriptions', amount: 64_900 },
  { name: 'Spotify', category: 'Subscriptions', amount: 11_900 },
  { name: 'Gym', category: 'Health', amount: 150_000 },
  { name: 'EMI', category: 'Bills & Utilities', amount: 500_000 },
]

export function RecurringForm({ initial, onDone, kindDefault = 'bill', prefill }: {
  initial?: RecurringDTO; onDone: () => void; kindDefault?: 'bill' | 'income'; prefill?: { name: string; category: string; amount: number }
}) {
  const [kind, setKind] = useState<'bill' | 'income'>(initial?.kind ?? kindDefault)
  const [name, setName] = useState(initial?.name ?? prefill?.name ?? '')
  const [amount, setAmount] = useState(initial ? paiseToRupeeString(initial.amount) : prefill ? paiseToRupeeString(prefill.amount) : '')
  const [cadence, setCadence] = useState(initial?.cadence ?? 'monthly')
  const [nextDueOn, setNextDueOn] = useState(initial?.nextDueOn ?? addDays(toISTDate(new Date()), 1))
  const { data: categories = [] } = useCategories(kind === 'bill' ? 'expense' : 'income')
  const suggested = categories.find((c) => c.name === prefill?.category)?.id
  const [categoryId, setCategoryId] = useState<string | undefined>(initial?.categoryId)
  const [error, setError] = useState<{ field?: string; message: string } | null>(null)
  const create = useCreateRecurring()
  const update = useUpdateRecurring()
  const paise = parseRupeesToPaise(amount)
  const cat = categoryId ?? suggested

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!paise || !cat || !name.trim()) return setError({ message: 'Add a name, an amount and a category.' })
    const body = { kind, name: name.trim(), amount: paise, cadence, nextDueOn, categoryId: cat }
    try {
      if (initial) await update.mutateAsync({ id: initial.id, name: body.name, patch: body })
      else await create.mutateAsync(body)
      onDone()
    } catch (err) {
      if (err instanceof ApiError) setError({ field: err.field, message: err.message })
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <ToggleGroup type="single" value={kind} onValueChange={(v) => v && (setKind(v as typeof kind), setCategoryId(undefined))}>
        <ToggleGroupItem value="bill" className="min-h-12 flex-1">Bill</ToggleGroupItem>
        <ToggleGroupItem value="income" className="min-h-12 flex-1">Income</ToggleGroupItem>
      </ToggleGroup>
      <Label htmlFor="rf-name">Name</Label>
      <Input id="rf-name" value={name} onChange={(e) => setName(e.target.value)} className="min-h-12" placeholder="Rent" />
      <Label htmlFor="rf-amount">Amount (₹)</Label>
      <Input id="rf-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="amount min-h-12" />
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="rf-cadence">Repeats</Label>
          <Select value={cadence} onValueChange={(v) => setCadence(v as typeof cadence)}>
            <SelectTrigger id="rf-cadence" className="min-h-12"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rf-due">Next due</Label>
          <Input id="rf-due" type="date" value={nextDueOn} onChange={(e) => setNextDueOn(e.target.value)} className="min-h-12" />
        </div>
      </div>
      <Label htmlFor="rf-cat">Category</Label>
      <Select value={cat} onValueChange={setCategoryId}>
        <SelectTrigger id="rf-cat" className="min-h-12"><SelectValue placeholder="Pick a category" /></SelectTrigger>
        <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.emoji} {c.name}</SelectItem>)}</SelectContent>
      </Select>
      {error && <p role="alert" className="text-sm text-neutral-negative">{error.message}</p>}
      <Button type="submit" disabled={create.isPending || update.isPending} className="min-h-12 active:scale-[0.97]">
        {initial ? 'Save' : 'Add to schedule'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 2: View and page**

`src/components/recurring/recurring-view.tsx`:
```tsx
'use client'
import { Pause, Play, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Reveal } from '@/components/fx/reveal'
import { Tile } from '@/components/fx/tile'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDeleteRecurring, useRecurring, useUpdateRecurring } from '@/hooks/queries'
import type { RecurringDTO } from '@/lib/api-types'
import { formatINR } from '@/lib/money'
import { BILL_SUGGESTIONS, RecurringForm } from './recurring-form'

export function RecurringView() {
  const { data = [], isPending } = useRecurring()
  const [editing, setEditing] = useState<RecurringDTO | 'new' | (typeof BILL_SUGGESTIONS)[number] | null>(null)
  const update = useUpdateRecurring()
  const del = useDeleteRecurring()
  const sections = [['bill', 'Bills'], ['income', 'Income']] as const

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <h1 className="font-display text-3xl font-bold">Recurring</h1>
        <Button onClick={() => setEditing('new')} className="min-h-12 active:scale-[0.97]">Add</Button>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Suggestions">
        {BILL_SUGGESTIONS.filter((s) => !data.some((d) => d.name === s.name)).map((s) => (
          <button key={s.name} type="button" onClick={() => setEditing(s)} className="min-h-12 rounded-chip border bg-surface-2 px-3 text-sm hover:border-primary/60 active:scale-[0.97]">+ {s.name}</button>
        ))}
      </div>
      {sections.map(([kind, title]) => {
        const items = data.filter((d) => d.kind === kind)
        return (
          <Reveal key={kind}>
            <Tile aria-labelledby={`rec-${kind}`}>
              <h2 id={`rec-${kind}`} className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">{title}</h2>
              {!isPending && items.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Nothing scheduled yet.</p>}
              <ul className="mt-2 flex flex-col">
                {items.map((r) => (
                  <li key={r.id} className={`flex min-h-14 items-center gap-2 border-b last:border-0 ${r.active ? '' : 'opacity-60'}`}>
                    <button type="button" onClick={() => setEditing(r)} className="flex min-h-14 flex-1 flex-col items-start text-left">
                      <span>{r.name}{!r.active && <span className="ml-2 rounded-chip bg-surface-2 px-2 py-0.5 text-xs">Paused</span>}</span>
                      <span className="text-xs text-muted-foreground">{r.cadence} · next {new Date(r.nextDueOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    </button>
                    <span className="amount">{formatINR(r.amount)}</span>
                    <button type="button" aria-label={r.active ? `Pause ${r.name}` : `Resume ${r.name}`} className="grid size-12 place-items-center rounded-chip hover:bg-accent"
                      onClick={() => update.mutate({ id: r.id, name: r.name, patch: { active: !r.active } })}>
                      {r.active ? <Pause className="size-4" /> : <Play className="size-4" />}
                    </button>
                    <button type="button" aria-label={`Remove ${r.name}`} className="grid size-12 place-items-center rounded-chip hover:bg-accent"
                      onClick={() => del.mutate({ id: r.id, name: r.name })}><Trash2 className="size-4" /></button>
                  </li>
                ))}
              </ul>
            </Tile>
          </Reveal>
        )
      })}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="rounded-tile">
          <DialogHeader><DialogTitle className="font-display">{editing && editing !== 'new' && 'id' in editing ? 'Edit schedule' : 'New schedule'}</DialogTitle></DialogHeader>
          {editing && (
            <RecurringForm
              initial={editing !== 'new' && 'id' in editing ? editing : undefined}
              prefill={editing !== 'new' && !('id' in editing) ? editing : undefined}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

`src/app/(app)/recurring/page.tsx`:
```tsx
import { RecurringView } from '@/components/recurring/recurring-view'

export const metadata = { title: 'Recurring' }
export default function RecurringPage() {
  return <RecurringView />
}
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Manual: add "Netflix" from a suggestion chip, pause it, delete it, undo.
```bash
git add apps/web
git commit -m "feat(recurring): schedule bills and income with suggestions, pause and undoable delete

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Insights & soft budgets

**Files:**
- Create: `src/lib/budget-band.ts`, `src/components/insights/{insights-view,spend-chart,category-chart,budgets-panel}.tsx`
- Modify: `src/app/(app)/insights/page.tsx`
- Test: `src/lib/budget-band.test.ts`

**Interfaces:**
- Consumes: `useInsights`, `useBudgets`, `useUpsertBudget`, `useDeleteBudget`, `useCategories`, `useSafeToSpend` (Task 14); `BudgetSlider` (Task 13); `payCycle`, `addDays`, `toISTDate`.
- Produces: `budgetBand(spent: number, limit: number): { pct: number; overBy: number; label: string }` — `pct` capped at 100 for the bar; label "₹3,200 of ₹5,000 · 64%" or "₹400 over plan".

- [ ] **Step 1: Load the `dataviz` skill**

Invoke the `dataviz` skill and follow it for both charts (form choice, palette from `--chart-*` tokens, axis, tooltip, accessible table fallback).

- [ ] **Step 2: Write the failing budget-band test**

`src/lib/budget-band.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { budgetBand } from './budget-band'

describe('budgetBand', () => {
  it('under plan', () => {
    expect(budgetBand(320_000, 500_000)).toEqual({ pct: 64, overBy: 0, label: '₹3,200 of ₹5,000 · 64%' })
  })
  it('over plan stays neutral and caps the bar', () => {
    expect(budgetBand(540_000, 500_000)).toEqual({ pct: 100, overBy: 40_000, label: '₹400 over plan' })
  })
  it('zero spend', () => {
    expect(budgetBand(0, 500_000).label).toBe('₹0 of ₹5,000 · 0%')
  })
})
```
Run → FAIL.

- [ ] **Step 3: Implement**

`src/lib/budget-band.ts`:
```ts
import { formatINR } from './money'

export function budgetBand(spent: number, limit: number) {
  const ratio = limit > 0 ? spent / limit : 0
  const overBy = Math.max(0, spent - limit)
  const pct = Math.min(100, Math.round(ratio * 100))
  const label = overBy > 0 ? `${formatINR(overBy)} over plan` : `${formatINR(spent)} of ${formatINR(limit)} · ${pct}%`
  return { pct, overBy, label }
}
```
Run → PASS.

- [ ] **Step 4: Charts (Recharts, per the dataviz skill)**

```bash
cd apps/web && pnpm add recharts@^3.10.1 && cd ../..
```

`src/components/insights/spend-chart.tsx`:
```tsx
'use client'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { InsightsDTO } from '@/lib/api-types'
import { formatINR } from '@/lib/money'

export function SpendChart({ data }: { data: InsightsDTO }) {
  const rows = data.byDay.map((d) => ({ ...d, label: new Date(`${d.date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }), rupees: d.expense / 100 }))
  return (
    <figure aria-labelledby="spend-chart-cap">
      <figcaption id="spend-chart-cap" className="mb-2 text-sm text-muted-foreground">Daily spending · total {formatINR(data.totalExpense)}</figcaption>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ left: 0, right: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} tickFormatter={(v: number) => formatINR(v * 100)} />
            <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12 }}
              formatter={(v: number) => [formatINR(v * 100), 'Spent']} />
            <Bar dataKey="rupees" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only"><caption>Daily spending</caption><tbody>{rows.map((r) => <tr key={r.date}><th>{r.label}</th><td>{formatINR(r.expense)}</td></tr>)}</tbody></table>
    </figure>
  )
}
```

`src/components/insights/category-chart.tsx`:
```tsx
'use client'
import type { InsightsDTO } from '@/lib/api-types'
import { formatINR } from '@/lib/money'

/** Horizontal bars (not a donut): this period vs previous, labelled directly. */
export function CategoryChart({ data }: { data: InsightsDTO }) {
  const max = Math.max(1, ...data.byCategory.flatMap((c) => [c.amount, c.previous]))
  return (
    <figure aria-labelledby="cat-cap">
      <figcaption id="cat-cap" className="mb-3 text-sm text-muted-foreground">By category · this period vs previous</figcaption>
      <ul className="flex flex-col gap-3">
        {data.byCategory.map((c) => {
          const delta = c.amount - c.previous
          return (
            <li key={c.categoryId}>
              <div className="flex justify-between text-sm">
                <span><span aria-hidden>{c.emoji}</span> {c.name}</span>
                <span className="amount">{formatINR(c.amount)}
                  <span className="ml-2 text-xs text-muted-foreground">{delta === 0 ? 'same' : `${delta > 0 ? '+' : '−'}${formatINR(Math.abs(delta))} vs before`}</span>
                </span>
              </div>
              <div className="mt-1 flex flex-col gap-1" aria-hidden>
                <div className="h-2 rounded-full bg-chart-1" style={{ width: `${(c.amount / max) * 100}%` }} />
                <div className="h-1.5 rounded-full bg-muted-foreground/40" style={{ width: `${(c.previous / max) * 100}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
    </figure>
  )
}
```

- [ ] **Step 5: Budgets panel and view**

`src/components/insights/budgets-panel.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { BudgetSlider } from '@/components/fx/budget-slider'
import { Tile } from '@/components/fx/tile'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBudgets, useCategories, useDeleteBudget, useUpsertBudget } from '@/hooks/queries'
import type { BudgetDTO } from '@/lib/api-types'
import { budgetBand } from '@/lib/budget-band'

function BudgetRow({ b }: { b: BudgetDTO }) {
  const [draft, setDraft] = useState(b.monthlyLimit)
  const upsert = useUpsertBudget()
  const del = useDeleteBudget()
  useEffect(() => setDraft(b.monthlyLimit), [b.monthlyLimit])
  useEffect(() => {
    if (draft === b.monthlyLimit || draft <= 0) return
    const id = setTimeout(() => upsert.mutate({ categoryId: b.categoryId, monthlyLimit: draft, name: b.name }), 600)
    return () => clearTimeout(id)
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps
  const band = budgetBand(b.spent, draft)
  return (
    <li className="flex flex-col gap-2 border-b py-3 last:border-0">
      <div className="flex justify-between text-sm"><span><span aria-hidden>{b.emoji}</span> {b.name}</span>
        <span className={band.overBy ? 'text-neutral-negative' : 'text-muted-foreground'}>{band.label}</span></div>
      <div className="relative h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={band.label}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${band.pct}%` }} />
        {band.overBy > 0 && <div className="absolute inset-y-0 right-0 w-6 bg-[repeating-linear-gradient(135deg,var(--neutral-negative)_0_3px,transparent_3px_6px)]" />}
      </div>
      <div className="flex items-center gap-2">
        <BudgetSlider value={draft} onValueChange={setDraft} max={Math.max(2_000_000, b.monthlyLimit * 2)} label={`${b.name} monthly plan`} />
        <Button variant="ghost" className="min-h-12" onClick={() => del.mutate({ categoryId: b.categoryId, name: b.name })}>Remove</Button>
      </div>
    </li>
  )
}

export function BudgetsPanel() {
  const { data: budgets = [] } = useBudgets()
  const { data: categories = [] } = useCategories('expense')
  const upsert = useUpsertBudget()
  const free = categories.filter((c) => !budgets.some((b) => b.categoryId === c.id))
  return (
    <Tile aria-labelledby="budgets-title">
      <h2 id="budgets-title" className="font-display text-xl font-bold">Soft plans</h2>
      <p className="text-sm text-muted-foreground">Optional monthly guides per category. Going over is just information — no alarms.</p>
      <ul className="mt-2">{budgets.map((b) => <BudgetRow key={b.budgetId} b={b} />)}</ul>
      {free.length > 0 && (
        <Select onValueChange={(id) => { const c = free.find((f) => f.id === id)!; upsert.mutate({ categoryId: id, monthlyLimit: 500_000, name: c.name }) }}>
          <SelectTrigger className="mt-3 min-h-12" aria-label="Add a plan for a category"><SelectValue placeholder="+ Add a plan for…" /></SelectTrigger>
          <SelectContent>{free.map((c) => <SelectItem key={c.id} value={c.id}>{c.emoji} {c.name}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </Tile>
  )
}
```

`src/components/insights/insights-view.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { Reveal } from '@/components/fx/reveal'
import { Tile } from '@/components/fx/tile'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useInsights, useSafeToSpend } from '@/hooks/queries'
import { addDays, toISTDate } from '@/lib/dates'
import { BudgetsPanel } from './budgets-panel'
import { CategoryChart } from './category-chart'
import { SpendChart } from './spend-chart'

type Range = 'cycle' | 'last' | '3m' | 'custom'

export function InsightsView() {
  const [range, setRange] = useState<Range>('cycle')
  const { data: sts } = useSafeToSpend()
  const today = toISTDate(new Date())
  const start = sts?.cycleStart ?? addDays(today, -29)
  const length = sts ? Math.round((Date.parse(sts.nextPayday) - Date.parse(sts.cycleStart)) / 86_400_000) : 30
  const [custom, setCustom] = useState({ from: addDays(today, -13), to: today })
  const [from, to] =
    range === 'cycle' ? [start, today]
    : range === 'last' ? [addDays(start, -length), addDays(start, -1)]
    : range === '3m' ? [addDays(today, -89), today]
    : [custom.from, custom.to < custom.from ? custom.from : custom.to]
  const { data, isPending } = useInsights(from, to)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Insights</h1>
        <ToggleGroup type="single" value={range} onValueChange={(v) => v && setRange(v as Range)} aria-label="Range">
          <ToggleGroupItem value="cycle" className="min-h-12">This cycle</ToggleGroupItem>
          <ToggleGroupItem value="last" className="min-h-12">Last cycle</ToggleGroupItem>
          <ToggleGroupItem value="3m" className="min-h-12">3 months</ToggleGroupItem>
          <ToggleGroupItem value="custom" className="min-h-12">Custom</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {range === 'custom' && (
        <div className="flex gap-2">
          <label className="flex flex-col text-xs text-muted-foreground">From
            <Input type="date" max={today} value={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} className="min-h-12" /></label>
          <label className="flex flex-col text-xs text-muted-foreground">To
            <Input type="date" max={today} value={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} className="min-h-12" /></label>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-5">
        <Reveal className="lg:col-span-3"><Tile>{isPending || !data ? <Skeleton className="h-64" /> : <SpendChart data={data} />}</Tile></Reveal>
        <Reveal delay={0.05} className="lg:col-span-2"><Tile>{isPending || !data ? <Skeleton className="h-64" /> : <CategoryChart data={data} />}</Tile></Reveal>
        <Reveal delay={0.1} className="lg:col-span-5"><BudgetsPanel /></Reveal>
      </div>
    </div>
  )
}
```

`src/app/(app)/insights/page.tsx`:
```tsx
import { InsightsView } from '@/components/insights/insights-view'

export const metadata = { title: 'Insights' }
export default function InsightsPage() {
  return <InsightsView />
}
```

- [ ] **Step 6: Verify and commit**

Run: `pnpm --filter web test && pnpm --filter web typecheck` → PASS. Manual: keyboard arrows move a budget slider; over-plan shows hatched neutral overflow, never red.
```bash
git add apps/web
git commit -m "feat(insights): daily and category charts with soft, non-punitive budget plans

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: Onboarding stepper

**Files:**
- Create: `src/app/onboarding/page.tsx`, `src/components/onboarding/onboarding-flow.tsx`, `src/components/onboarding/steps/{welcome,income,balance,bills,fixed-costs,upi,done}.tsx`

**Interfaces:**
- Consumes: React Bits `Stepper`/`Step` (vendored, controlled via `step` + `onStepChange`), `useUpdateMe`, `useCheckin`, `useSafeToSpend`, `RecurringForm` + `BILL_SUGGESTIONS` (Task 19), `UpiQrUpload` (Task 22 — build it here first, Task 22 reuses it), `CelebrateOnMount`, `AmountTicker`.
- Produces: `/onboarding` route (server-guarded; onboarded users are redirected to `/home`); `<UpiQrUpload />` in `src/components/profile/upi-qr-upload.tsx`.

- [ ] **Step 1: UPI QR upload component (shared with Profile)**

`src/components/profile/upi-qr-upload.tsx`:
```tsx
'use client'
import { useQueryClient } from '@tanstack/react-query'
import { ImageUp } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { qk, useMe } from '@/hooks/queries'

export function UpiQrUpload() {
  const { data: me } = useMe()
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function upload(file: File) {
    setError(null)
    if (file.size > 2 * 1024 * 1024) return setError('That image is over 2 MB. Try a smaller screenshot.')
    setBusy(true)
    const form = new FormData()
    form.set('file', file)
    const res = await fetch('/api/v1/me/upi-qr', { method: 'POST', body: form })
    setBusy(false)
    if (!res.ok) return setError((await res.json().catch(() => null))?.error?.message ?? 'Upload failed.')
    qc.setQueryData(qk.me, (await res.json()).data)
  }

  return (
    <div className="flex items-center gap-4">
      <div className="grid size-28 place-items-center overflow-hidden rounded-tile border bg-surface-2">
        {me?.upiQrUrl ? <img src={me.upiQrUrl} alt="Your UPI QR code" className="size-full object-contain" /> : <ImageUp className="size-8 text-muted-foreground" aria-hidden />}
      </div>
      <div className="flex flex-col gap-2">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="upi-qr-file"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
        <Button type="button" variant="secondary" className="min-h-12" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Uploading…' : me?.upiQrUrl ? 'Replace QR' : 'Upload QR image'}
        </Button>
        <p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 2 MB. Friends see it when settling up (Groups, coming soon).</p>
        {error && <p role="alert" className="text-sm text-neutral-negative">{error}</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Steps**

Each step is a small controlled form that saves before advancing. Create the files:

`src/components/onboarding/steps/welcome.tsx`:
```tsx
'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function WelcomeStep({ name, setName }: { name: string; setName: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-2xl font-bold">Hi! What should we call you?</h2>
      <p className="text-muted-foreground">Coinflow is your money, first. Splitting with friends comes later.</p>
      <Label htmlFor="ob-name">Name</Label>
      <Input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} className="min-h-12" autoFocus />
    </div>
  )
}
```

`src/components/onboarding/steps/income.tsx`:
```tsx
'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function IncomeStep({ income, setIncome, payday, setPayday }: {
  income: string; setIncome: (v: string) => void; payday: number; setPayday: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-2xl font-bold">When does money come in?</h2>
      <p className="text-muted-foreground">Your pay cycle runs from one payday to the next. Skip if it varies.</p>
      <Label htmlFor="ob-income">Monthly income (₹, optional)</Label>
      <Input id="ob-income" inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} className="amount min-h-12" placeholder="90,000" />
      <Label htmlFor="ob-payday">Payday (day of month)</Label>
      <Input id="ob-payday" type="number" min={1} max={31} value={payday} onChange={(e) => setPayday(Math.min(31, Math.max(1, Number(e.target.value) || 1)))} className="min-h-12 w-28" />
    </div>
  )
}
```

`src/components/onboarding/steps/balance.tsx`:
```tsx
'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatINR, parseRupeesToPaise } from '@/lib/money'

export function BalanceStep({ balance, setBalance }: { balance: string; setBalance: (v: string) => void }) {
  const p = parseRupeesToPaise(balance)
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-2xl font-bold">Roughly how much is in your account right now?</h2>
      <p className="text-muted-foreground">No bank login. A rough number is fine — you can refresh it anytime.</p>
      <Label htmlFor="ob-balance" className="sr-only">Balance in rupees</Label>
      <Input id="ob-balance" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} className="amount min-h-14 text-3xl" placeholder="₹ 50,000" />
      <p className="text-sm text-muted-foreground" aria-live="polite">{p !== null ? formatINR(p) : ' '}</p>
    </div>
  )
}
```

`src/components/onboarding/steps/bills.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { RecurringForm, BILL_SUGGESTIONS } from '@/components/recurring/recurring-form'
import { useRecurring } from '@/hooks/queries'
import { formatINR } from '@/lib/money'

export function BillsStep() {
  const { data = [] } = useRecurring()
  const [prefill, setPrefill] = useState<(typeof BILL_SUGGESTIONS)[number] | null>(null)
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-2xl font-bold">Any regular bills?</h2>
      <p className="text-muted-foreground">Tap to add. These are set aside before we tell you what’s safe to spend.</p>
      <div className="flex flex-wrap gap-2">
        {BILL_SUGGESTIONS.filter((s) => !data.some((d) => d.name === s.name)).map((s) => (
          <button key={s.name} type="button" onClick={() => setPrefill(s)} className="min-h-12 rounded-chip border bg-surface-2 px-3 text-sm active:scale-[0.97]">+ {s.name}</button>
        ))}
      </div>
      {prefill && <RecurringForm key={prefill.name} prefill={prefill} onDone={() => setPrefill(null)} />}
      {data.length > 0 && (
        <ul className="text-sm">{data.map((d) => <li key={d.id} className="flex justify-between py-1"><span>{d.name}</span><span className="amount">{formatINR(d.amount)}</span></li>)}</ul>
      )}
    </div>
  )
}
```

`src/components/onboarding/steps/fixed-costs.tsx`:
```tsx
'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function FixedCostsStep({ value, setValue }: { value: string; setValue: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-2xl font-bold">Everyday basics</h2>
      <p className="text-muted-foreground">About how much goes on groceries and commute each month? We spread it across your cycle so Safe-to-Spend stays honest. Optional.</p>
      <Label htmlFor="ob-fixed">Monthly basics (₹)</Label>
      <Input id="ob-fixed" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="amount min-h-12" placeholder="8,000" />
    </div>
  )
}
```

`src/components/onboarding/steps/upi.tsx`:
```tsx
'use client'
import { UpiQrUpload } from '@/components/profile/upi-qr-upload'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function UpiStep({ upiId, setUpiId, error }: { upiId: string; setUpiId: (v: string) => void; error?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-2xl font-bold">How do friends pay you back?</h2>
      <p className="text-muted-foreground">Used later for splitting. Coinflow never moves money — friends pay in their own UPI app.</p>
      <Label htmlFor="ob-upi">UPI ID (optional)</Label>
      <Input id="ob-upi" value={upiId} onChange={(e) => setUpiId(e.target.value)} className="min-h-12" placeholder="name@okaxis" aria-invalid={Boolean(error)} />
      {error && <p role="alert" className="text-sm text-neutral-negative">{error}</p>}
      <UpiQrUpload />
    </div>
  )
}
```

`src/components/onboarding/steps/done.tsx`:
```tsx
'use client'
import { AmountTicker } from '@/components/fx/amount-ticker'
import { CelebrateOnMount } from '@/components/fx/celebrate'
import { useSafeToSpend } from '@/hooks/queries'
import { stsDisplay } from '@/lib/sts-display'

export function DoneStep() {
  const { data } = useSafeToSpend()
  const view = data ? stsDisplay(data) : null
  return (
    <div className="flex flex-col items-center gap-2 py-4 text-center">
      <CelebrateOnMount />
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">You can safely spend</p>
      {view?.headline != null ? <AmountTicker paise={view.headline} className="text-6xl font-bold text-primary" /> : <p className="font-display text-2xl">Add a balance anytime to see this</p>}
      <p className="text-muted-foreground">{view?.line}</p>
    </div>
  )
}
```

- [ ] **Step 3: The flow and page**

`src/components/onboarding/onboarding-flow.tsx`:
```tsx
'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Stepper, { Step } from '@/components/reactbits/Stepper'
import { useCheckin, useUpdateMe } from '@/hooks/queries'
import { ApiError } from '@/lib/api-client'
import type { MeDTO } from '@/lib/api-types'
import { paiseToRupeeString, parseRupeesToPaise } from '@/lib/money'
import { BalanceStep } from './steps/balance'
import { BillsStep } from './steps/bills'
import { DoneStep } from './steps/done'
import { FixedCostsStep } from './steps/fixed-costs'
import { IncomeStep } from './steps/income'
import { UpiStep } from './steps/upi'
import { WelcomeStep } from './steps/welcome'

export function OnboardingFlow({ me }: { me: MeDTO }) {
  const router = useRouter()
  const updateMe = useUpdateMe()
  const checkin = useCheckin()
  const [step, setStep] = useState(Math.min(7, Math.max(1, me.onboardingStep || 1)))
  const [name, setName] = useState(me.name)
  const [income, setIncome] = useState(me.monthlyIncome ? paiseToRupeeString(me.monthlyIncome) : '')
  const [payday, setPayday] = useState(me.paydayDay)
  const [balance, setBalance] = useState('')
  const [fixed, setFixed] = useState(me.fixedCostsEstimate ? paiseToRupeeString(me.fixedCostsEstimate) : '')
  const [upiId, setUpiId] = useState(me.upiId ?? '')
  const [upiError, setUpiError] = useState<string>()

  async function saveStep(current: number) {
    const next = current + 1
    if (current === 1) await updateMe.mutateAsync({ name: name.trim() || me.name, onboardingStep: next })
    if (current === 2) await updateMe.mutateAsync({ paydayDay: payday, monthlyIncome: parseRupeesToPaise(income), onboardingStep: next })
    if (current === 3) {
      const p = parseRupeesToPaise(balance)
      if (p !== null) await checkin.mutateAsync({ amount: p })
      await updateMe.mutateAsync({ onboardingStep: next })
    }
    if (current === 4) await updateMe.mutateAsync({ onboardingStep: next })
    if (current === 5) await updateMe.mutateAsync({ fixedCostsEstimate: parseRupeesToPaise(fixed) ?? 0, onboardingStep: next })
    if (current === 6) {
      try {
        await updateMe.mutateAsync({ upiId: upiId.trim() || null, onboardingStep: next })
        setUpiError(undefined)
      } catch (err) {
        if (err instanceof ApiError) setUpiError(err.message)
        throw err
      }
    }
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-xl place-items-center p-4">
      <Stepper
        step={step}
        theme="dark"
        accentColor="#C8F560"
        width="100%"
        indicator="bars"
        backButtonText="Back"
        nextButtonText="Continue"
        completeButtonText="Go to Coinflow"
        nextButtonProps={{
          className: 'min-h-12',
          onClick: (e) => {
            // We drive the controlled `step` ourselves so each step can save before advancing.
            e.preventDefault()
            if (step === 7) {
              setStep(8) // shows completedContent
              void updateMe.mutateAsync({ onboarded: true, onboardingStep: 7 }).then(() => router.push('/home'))
              return
            }
            void saveStep(step).then(() => setStep(step + 1)).catch(() => {})
          },
        }}
        backButtonProps={{ className: 'min-h-12', onClick: (e) => { e.preventDefault(); setStep(Math.max(1, step - 1)) } }}
        completedContent={<p className="text-center text-muted-foreground">Taking you home…</p>}
      >
        <Step title="You"><WelcomeStep name={name} setName={setName} /></Step>
        <Step title="Income"><IncomeStep income={income} setIncome={setIncome} payday={payday} setPayday={setPayday} /></Step>
        <Step title="Balance"><BalanceStep balance={balance} setBalance={setBalance} /></Step>
        <Step title="Bills"><BillsStep /></Step>
        <Step title="Basics"><FixedCostsStep value={fixed} setValue={setFixed} /></Step>
        <Step title="UPI"><UpiStep upiId={upiId} setUpiId={setUpiId} error={upiError} /></Step>
        <Step title="Done"><DoneStep /></Step>
      </Stepper>
      <button type="button" className="mt-4 min-h-12 text-sm text-muted-foreground underline underline-offset-4"
        onClick={() => void updateMe.mutateAsync({ onboarded: true }).then(() => router.push('/home'))}>
        Skip setup for now
      </button>
    </main>
  )
}
```
Note: the vendored Stepper only advances (and fires its callbacks) through its internal `go()`, which the `preventDefault()` above skips — so completion is handled explicitly in the step-7 branch.

`src/app/onboarding/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { AppProviders } from '@/components/providers/app-providers'
import type { MeDTO } from '@/lib/api-types'
import { requireCurrentUser } from '@/server/auth'
import { AppError } from '@/server/errors'

export const metadata = { title: 'Welcome' }

export default async function OnboardingPage() {
  const user = await requireCurrentUser().catch((err) => {
    if (err instanceof AppError && err.status === 401) redirect('/sign-in')
    throw err
  })
  if (user.onboardedAt) redirect('/home')
  return (
    <AppProviders motionPref={user.reducedMotion}>
      <OnboardingFlow me={JSON.parse(JSON.stringify(user)) as MeDTO} />
    </AppProviders>
  )
}
```

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Manual with a fresh Clerk user: every step saves; refreshing mid-way resumes at the same step; "Done" shows confetti once and the STS number; "Skip setup" lands on `/home`.
```bash
git add apps/web
git commit -m "feat(onboarding): resumable 7-step stepper with balance check-in, bills, UPI and celebration

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: Profile & settings

**Files:**
- Create: `src/components/profile/profile-view.tsx`
- Modify: `src/app/(app)/profile/page.tsx`

**Interfaces:**
- Consumes: `useMe`, `useUpdateMe` (Task 14), `UpiQrUpload` (Task 21), `ThemeToggle` (Task 13), `useMotionPref` (Task 12), `CheckinDialog` (Task 17), Clerk `SignOutButton`.

- [ ] **Step 1: Profile view**

`src/components/profile/profile-view.tsx`:
```tsx
'use client'
import { SignOutButton } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import { ThemeToggle } from '@/components/fx/theme-toggle'
import { Tile } from '@/components/fx/tile'
import { CheckinDialog } from '@/components/home/checkin-dialog'
import { useMotionPref } from '@/components/providers/motion-pref'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useMe, useUpdateMe } from '@/hooks/queries'
import type { MotionPref } from '@/lib/motion-pref'
import { paiseToRupeeString, parseRupeesToPaise } from '@/lib/money'
import { UpiQrUpload } from './upi-qr-upload'

export function ProfileView() {
  const { data: me } = useMe()
  const update = useUpdateMe()
  const { pref, setPref } = useMotionPref()
  const [form, setForm] = useState({ name: '', upiId: '', payday: 1, income: '', fixed: '' })

  useEffect(() => {
    if (me) setForm({ name: me.name, upiId: me.upiId ?? '', payday: me.paydayDay, income: me.monthlyIncome ? paiseToRupeeString(me.monthlyIncome) : '', fixed: paiseToRupeeString(me.fixedCostsEstimate) })
  }, [me])

  if (!me) return null
  const save = () => update.mutate({
    name: form.name.trim(), upiId: form.upiId.trim() || null, paydayDay: form.payday,
    monthlyIncome: parseRupeesToPaise(form.income), fixedCostsEstimate: parseRupeesToPaise(form.fixed) ?? 0,
  })

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl font-bold">Profile</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Tile aria-labelledby="p-you">
          <h2 id="p-you" className="font-display text-xl font-bold">You & your money</h2>
          <form className="mt-3 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save() }}>
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" className="min-h-12" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2"><Label htmlFor="p-payday">Payday</Label>
                <Input id="p-payday" type="number" min={1} max={31} className="min-h-12" value={form.payday} onChange={(e) => setForm({ ...form, payday: Number(e.target.value) || 1 })} /></div>
              <div className="flex flex-col gap-2"><Label htmlFor="p-income">Monthly income (₹)</Label>
                <Input id="p-income" inputMode="decimal" className="amount min-h-12" value={form.income} onChange={(e) => setForm({ ...form, income: e.target.value })} /></div>
            </div>
            <Label htmlFor="p-fixed">Monthly basics (₹)</Label>
            <Input id="p-fixed" inputMode="decimal" className="amount min-h-12" value={form.fixed} onChange={(e) => setForm({ ...form, fixed: e.target.value })} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="min-h-12 active:scale-[0.97]" disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save'}</Button>
              <CheckinDialog trigger={<Button type="button" variant="secondary" className="min-h-12">Refresh balance</Button>} />
            </div>
          </form>
        </Tile>

        <Tile aria-labelledby="p-upi">
          <h2 id="p-upi" className="font-display text-xl font-bold">UPI</h2>
          <div className="mt-3 flex flex-col gap-3">
            <Label htmlFor="p-upiid">UPI ID</Label>
            <Input id="p-upiid" className="min-h-12" placeholder="name@okaxis" value={form.upiId} onChange={(e) => setForm({ ...form, upiId: e.target.value })} onBlur={save} />
            <UpiQrUpload />
          </div>
        </Tile>

        <Tile aria-labelledby="p-prefs">
          <h2 id="p-prefs" className="font-display text-xl font-bold">Look & feel</h2>
          <div className="mt-3 flex items-center justify-between"><span>Theme</span><ThemeToggle onPersist={(theme) => update.mutate({ theme })} /></div>
          <p className="mt-4" id="motion-label">Motion</p>
          <ToggleGroup type="single" value={pref} aria-labelledby="motion-label" className="mt-2"
            onValueChange={(v) => { if (!v) return; setPref(v as MotionPref); update.mutate({ reducedMotion: v as MotionPref }) }}>
            <ToggleGroupItem value="system" className="min-h-12 flex-1">Match device</ToggleGroupItem>
            <ToggleGroupItem value="on" className="min-h-12 flex-1">Reduce</ToggleGroupItem>
            <ToggleGroupItem value="off" className="min-h-12 flex-1">Full</ToggleGroupItem>
          </ToggleGroup>
        </Tile>

        <Tile aria-labelledby="p-data">
          <h2 id="p-data" className="font-display text-xl font-bold">Your data</h2>
          <p className="mt-2 text-sm text-muted-foreground">Download every transaction as a spreadsheet-friendly CSV.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild variant="secondary" className="min-h-12"><a href="/api/v1/export.csv" download>Export CSV</a></Button>
            <SignOutButton redirectUrl="/"><Button variant="ghost" className="min-h-12">Sign out</Button></SignOutButton>
          </div>
        </Tile>
      </div>
    </div>
  )
}
```

`src/app/(app)/profile/page.tsx`:
```tsx
import { ProfileView } from '@/components/profile/profile-view'

export const metadata = { title: 'Profile' }
export default function ProfilePage() {
  return <ProfileView />
}
```

- [ ] **Step 2: Verify and commit**

Run: `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Manual: set Motion → Reduce; the Home ticker renders a static amount and no spotlight; theme toggle persists after reload.
```bash
git add apps/web
git commit -m "feat(profile): money settings, UPI ID + QR, theme and motion preferences, CSV export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: Landing page

**Files:**
- Create: `src/app/(marketing)/layout.tsx`, `src/app/(marketing)/page.tsx`, `src/components/landing/{nav,hero,money-flow,feature-bento,principles,footer-cta}.tsx`, `scripts/capture-landing-shot.ts`, `public/landing/home-dark.png` (generated)
- Delete: `src/app/page.tsx` (create-next-app default)

**Interfaces:**
- Consumes: `HeroBackground`, `SplitHeading`, `Reveal`, `AmountTicker` (Task 13); Magic UI `Safari`, `AnimatedBeam`, `Marquee`, `ShimmerButton`, `InteractiveHoverButton`, `MagicCard`; React Bits `ScrollReveal`; GSAP ScrollTrigger; Clerk `Show`, `SignInButton`.
- Produces: `/` landing; `pnpm shot:landing` script.

- [ ] **Step 1: Product screenshot for the Safari frame**

`scripts/capture-landing-shot.ts` (run against `pnpm dev` with a demo-seeded user; uses the E2E sign-in from Task 24 — if Task 24 isn't done yet, sign in manually and run with `--headed`):
```ts
import { loadEnvConfig } from '@next/env'
import { chromium } from '@playwright/test'
import { clerk, clerkSetup } from '@clerk/testing/playwright'

loadEnvConfig(process.cwd())
process.env.CLERK_PUBLISHABLE_KEY ??= process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

async function main() {
  await clerkSetup()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto('http://localhost:3000/')
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! })
  await page.goto('http://localhost:3000/home')
  await page.getByRole('heading', { name: 'Safe to spend' }).waitFor()
  await page.screenshot({ path: 'public/landing/home-dark.png' })
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
```
```bash
cd apps/web
pnpm add -D @playwright/test@^1.64.0 @clerk/testing @axe-core/playwright lighthouse
pnpm pkg set scripts.shot:landing="tsx scripts/capture-landing-shot.ts"
cd ../..
```
Run once after `pnpm db:seed:demo <your-email>` (with `E2E_CLERK_USER_EMAIL` set to that email in `.env.local`), producing `public/landing/home-dark.png`. Commit the PNG.

- [ ] **Step 2: Landing components**

`src/components/landing/nav.tsx`:
```tsx
'use client'
import { Show, SignInButton } from '@clerk/nextjs'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-transparent bg-background/60 backdrop-blur">
      <nav aria-label="Site" className="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex min-h-12 items-center gap-2 font-display text-xl font-bold">
          <span className="grid size-8 place-items-center rounded-chip bg-primary text-primary-foreground">₹</span> coinflow
        </Link>
        <div className="flex items-center gap-2">
          <Show when="signed-out">
            <SignInButton><Button variant="ghost" className="min-h-12">Sign in</Button></SignInButton>
            <Button asChild className="min-h-12"><Link href="/sign-up">Get started</Link></Button>
          </Show>
          <Show when="signed-in"><Button asChild className="min-h-12"><Link href="/home">Go to dashboard</Link></Button></Show>
        </div>
      </nav>
    </header>
  )
}
```

`src/components/landing/hero.tsx`:
```tsx
'use client'
import Link from 'next/link'
import { HeroBackground } from '@/components/fx/hero-background'
import { Reveal } from '@/components/fx/reveal'
import { SplitHeading } from '@/components/fx/split-heading'
import { Safari } from '@/components/ui/safari'
import { ShimmerButton } from '@/components/ui/shimmer-button'

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden pt-32" aria-labelledby="hero-title">
      <HeroBackground />
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 text-center">
        <p className="rounded-chip border bg-card/60 px-3 py-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground backdrop-blur">Personal money · then split with friends</p>
        <SplitHeading as="h1" text="Know what’s safe to spend." className="mt-6 max-w-4xl font-display text-5xl font-bold tracking-tight sm:text-7xl" />
        <Reveal delay={0.3}>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">Coinflow sets aside your bills and basics, then tells you — calmly — what’s yours to enjoy until payday. No bank login. No red alerts.</p>
        </Reveal>
        <Reveal delay={0.45} className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/sign-up"><ShimmerButton background="#C8F560" shimmerColor="#ffffff" className="min-h-14 px-7 font-semibold text-[#0F1210]">Start free</ShimmerButton></Link>
          <a href="#how" className="flex min-h-14 items-center rounded-full border px-6 text-sm hover:bg-surface-2">See how it works</a>
        </Reveal>
        <Reveal delay={0.6} className="mt-16 w-full max-w-5xl">
          <Safari url="coinflow.local/home" imageSrc="/landing/home-dark.png" className="size-full drop-shadow-[0_40px_80px_rgba(200,245,96,0.15)]" />
        </Reveal>
      </div>
    </section>
  )
}
```

`src/components/landing/money-flow.tsx`:
```tsx
'use client'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { forwardRef, useRef } from 'react'
import { AmountTicker } from '@/components/fx/amount-ticker'
import { useReducedMotion } from '@/components/providers/motion-pref'
import { AnimatedBeam } from '@/components/ui/animated-beam'

gsap.registerPlugin(ScrollTrigger)

const Node = forwardRef<HTMLDivElement, { label: string; paise: number; lime?: boolean }>(({ label, paise, lime }, ref) => (
  <div ref={ref} className={`flow-node z-10 rounded-tile border p-4 ${lime ? 'bg-lime text-[#0F1210]' : 'bg-card'}`}>
    <p className="font-mono text-xs uppercase tracking-[0.12em] opacity-75">{label}</p>
    <AmountTicker paise={paise} className="text-2xl font-bold" />
  </div>
))
Node.displayName = 'Node'

export function MoneyFlow() {
  const container = useRef<HTMLDivElement>(null)
  const income = useRef<HTMLDivElement>(null)
  const bills = useRef<HTMLDivElement>(null)
  const basics = useRef<HTMLDivElement>(null)
  const safe = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  useGSAP(() => {
    if (reduced) return
    gsap.from('.flow-node', {
      y: 40, opacity: 0, stagger: 0.15, ease: 'power3.out',
      scrollTrigger: { trigger: container.current, start: 'top 75%', end: 'top 30%', scrub: true },
    })
  }, { scope: container, dependencies: [reduced] })

  return (
    <section id="how" aria-labelledby="flow-title" className="mx-auto max-w-6xl px-4 py-32">
      <h2 id="flow-title" className="text-center font-display text-4xl font-bold">Your money, in one honest number</h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">Income comes in. Bills and basics are set aside first. What’s left is safe to spend — every day until payday.</p>
      <div ref={container} className="relative mt-16 grid grid-cols-1 items-center gap-10 md:grid-cols-3">
        <Node ref={income} label="Income" paise={9_000_000} />
        <div className="flex flex-col gap-10">
          <Node ref={bills} label="Bills set aside" paise={2_350_000} />
          <Node ref={basics} label="Basics" paise={800_000} />
        </div>
        <Node ref={safe} label="Safe to spend" paise={5_850_000} lime />
        {!reduced && (
          <>
            <AnimatedBeam containerRef={container} fromRef={income} toRef={bills} gradientStartColor="#C8F560" gradientStopColor="#7FD8C4" />
            <AnimatedBeam containerRef={container} fromRef={income} toRef={basics} gradientStartColor="#C8F560" gradientStopColor="#7FD8C4" delay={0.4} />
            <AnimatedBeam containerRef={container} fromRef={income} toRef={safe} gradientStartColor="#C8F560" gradientStopColor="#C8F560" delay={0.8} curvature={-60} />
          </>
        )}
      </div>
    </section>
  )
}
```

`src/components/landing/feature-bento.tsx`:
```tsx
'use client'
import { Reveal } from '@/components/fx/reveal'
import { MagicCard } from '@/components/ui/magic-card'

const FEATURES = [
  { title: 'Three-tap logging', body: 'Amount, category, done. Or type “250 food lunch” anywhere with ⌘K.', span: 'md:col-span-2' },
  { title: 'Undo everything', body: 'Every change has a 10-second undo. Mistakes cost nothing.', span: '' },
  { title: 'Bills you confirm', body: 'Rent and subscriptions show up as drafts — nothing counts until you say so.', span: '' },
  { title: 'Calm insights', body: 'Soft plans per category. Going over is information, not a red alarm.', span: 'md:col-span-2' },
  { title: 'Coming next: split with friends', body: 'Trips and dinners, itemised receipts, and the fewest payments to settle — with reasons.', span: 'md:col-span-3' },
]

export function FeatureBento() {
  return (
    <section aria-labelledby="features-title" className="mx-auto max-w-6xl px-4 py-24">
      <h2 id="features-title" className="font-display text-4xl font-bold">Built for how you actually spend</h2>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={0.05 * i} className={f.span}>
            <MagicCard className="h-full rounded-tile p-6" gradientColor="rgba(200,245,96,0.12)">
              <h3 className="font-display text-xl font-bold">{f.title}</h3>
              <p className="mt-2 text-muted-foreground">{f.body}</p>
            </MagicCard>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
```

`src/components/landing/principles.tsx`:
```tsx
'use client'
import ScrollReveal from '@/components/reactbits/ScrollReveal'
import { useReducedMotion } from '@/components/providers/motion-pref'
import { Marquee } from '@/components/ui/marquee'

const PHRASES = ['250 food lunch', '+50000 salary', '1.2k uber to office', '649 netflix', '80 chai', '3200 groceries']
const LINE = 'No guilt. No red alerts. Just a clear number and the freedom to enjoy it.'

export function Principles() {
  const reduced = useReducedMotion()
  return (
    <section aria-label="Principles" className="py-24">
      <Marquee pauseOnHover className="[--duration:40s]" aria-hidden>
        {PHRASES.map((p) => <span key={p} className="mx-2 rounded-chip border bg-card px-4 py-2 font-mono text-sm text-muted-foreground">{p}</span>)}
      </Marquee>
      <div className="mx-auto mt-16 max-w-4xl px-4">
        {reduced ? <p className="font-display text-4xl font-bold">{LINE}</p>
          : <ScrollReveal baseOpacity={0.15} enableBlur baseRotation={2} blurStrength={6} textClassName="font-display text-4xl font-bold">{LINE}</ScrollReveal>}
      </div>
    </section>
  )
}
```

`src/components/landing/footer-cta.tsx`:
```tsx
'use client'
import Link from 'next/link'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'

export function FooterCta() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-24 text-center">
        <h2 className="font-display text-4xl font-bold">See your safe-to-spend in two minutes.</h2>
        <Link href="/sign-up"><InteractiveHoverButton className="min-h-14 px-8">Get started</InteractiveHoverButton></Link>
        <p className="text-sm text-muted-foreground">Coinflow · an HCI class project · your data stays in your database.</p>
      </div>
    </footer>
  )
}
```

`src/app/(marketing)/layout.tsx`:
```tsx
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```

`src/app/(marketing)/page.tsx`:
```tsx
import { FeatureBento } from '@/components/landing/feature-bento'
import { FooterCta } from '@/components/landing/footer-cta'
import { Hero } from '@/components/landing/hero'
import { MoneyFlow } from '@/components/landing/money-flow'
import { LandingNav } from '@/components/landing/nav'
import { Principles } from '@/components/landing/principles'

export default function LandingPage() {
  return (
    <>
      <LandingNav />
      <main id="main">
        <Hero />
        <MoneyFlow />
        <FeatureBento />
        <Principles />
      </main>
      <FooterCta />
    </>
  )
}
```
Delete `src/app/page.tsx`.

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter web build` → PASS. Manual: Lenis smooth scroll; nodes rise on scroll; beams flow; with OS reduce-motion there is no `<canvas>` and no beams.
```bash
git add apps/web
git commit -m "feat(landing): Dither hero, GSAP money-flow with animated beams, feature bento and principles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 24: E2E, accessibility, reduced-motion and Lighthouse gates

**Files:**
- Create: `playwright.config.ts`, `e2e/global.setup.ts`, `e2e/helpers.ts`, `e2e/onboarding.spec.ts`, `e2e/quick-add-undo.spec.ts`, `e2e/recurring-draft.spec.ts`, `e2e/budgets.spec.ts`, `e2e/theme.spec.ts`, `e2e/a11y.spec.ts`, `e2e/reduced-motion.spec.ts`, `scripts/lighthouse-landing.ts`
- Modify: `package.json` scripts (`e2e`, `lh`, `verify`), `.env.example` (`E2E_CLERK_USER_EMAIL`)

**Interfaces:**
- Consumes: the whole app; `@clerk/testing/playwright` (`clerkSetup`, `clerk.signIn`, `setupClerkTestingToken`); `DATABASE_URL` for resetting the E2E user.

- [ ] **Step 1: [USER CHECKPOINT] Create the E2E test user**

Ask the user to create a Clerk dev user with an email containing `+clerk_test` (e.g. `you+clerk_test@example.com`) via the Clerk dashboard (Users → Create) or `npx -y clerk@latest users create --email you+clerk_test@example.com --yes`, then add `E2E_CLERK_USER_EMAIL=you+clerk_test@example.com` to `apps/web/.env.local` and `E2E_CLERK_USER_EMAIL=` to `.env.example`.

- [ ] **Step 2: Playwright config and setup**

`playwright.config.ts`:
```ts
import { loadEnvConfig } from '@next/env'
import { defineConfig, devices } from '@playwright/test'

loadEnvConfig(process.cwd())
// @clerk/testing reads the un-prefixed name
process.env.CLERK_PUBLISHABLE_KEY ??= process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: { command: 'pnpm dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    { name: 'desktop', dependencies: ['setup'], use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'dark' } },
    { name: 'mobile', dependencies: ['setup'], use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, colorScheme: 'light' } },
  ],
})
```

`e2e/global.setup.ts`:
```ts
import { clerkSetup } from '@clerk/testing/playwright'
import { test as setup } from '@playwright/test'
import postgres from 'postgres'

setup.describe.configure({ mode: 'serial' })

setup('clerk + clean e2e user', async () => {
  await clerkSetup()
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
  await sql`delete from users where email = ${process.env.E2E_CLERK_USER_EMAIL!}`
  await sql.end()
})
```

`e2e/helpers.ts`:
```ts
import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright'
import type { Page } from '@playwright/test'
import postgres from 'postgres'

export async function signIn(page: Page) {
  await setupClerkTestingToken({ page })
  await page.goto('/')
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! })
}

/** Skips onboarding with a known balance so feature specs start from a predictable state. */
export async function signInOnboarded(page: Page, balanceRupees = 50_000) {
  await signIn(page)
  await page.goto('/onboarding')
  if (page.url().includes('/onboarding')) {
    await page.getByRole('button', { name: 'Skip setup for now' }).click()
    await page.waitForURL('**/home')
  }
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
  const [u] = await sql`select id from users where email = ${process.env.E2E_CLERK_USER_EMAIL!}`
  await sql`delete from transactions where user_id = ${u.id}`
  await sql`delete from recurring_items where user_id = ${u.id}`
  await sql`delete from budgets where user_id = ${u.id}`
  await sql`delete from balance_checkins where user_id = ${u.id}`
  await sql`insert into balance_checkins (user_id, amount, taken_at) values (${u.id}, ${balanceRupees * 100}, now() - interval '1 minute')`
  await sql.end()
  await page.goto('/home')
}
```

- [ ] **Step 3: Write the specs**

`e2e/onboarding.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import postgres from 'postgres'
import { signIn } from './helpers'

test('new user completes onboarding and sees Safe-to-Spend', async ({ page }) => {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
  await sql`delete from users where email = ${process.env.E2E_CLERK_USER_EMAIL!}`
  await sql.end()
  await signIn(page)
  await page.goto('/home')
  await page.waitForURL('**/onboarding')
  await page.getByLabel('Name').fill('Asha')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Payday (day of month)').fill('1')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Balance in rupees').fill('50000')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click() // bills
  await page.getByRole('button', { name: 'Continue' }).click() // basics
  await page.getByRole('button', { name: 'Continue' }).click() // upi
  await expect(page.getByText('You can safely spend')).toBeVisible()
  await page.getByRole('button', { name: 'Go to Coinflow' }).click()
  await page.waitForURL('**/home')
  await expect(page.getByRole('heading', { name: 'Safe to spend' })).toBeVisible()
})
```

`e2e/quick-add-undo.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { signInOnboarded } from './helpers'

test('quick add in ≤ 3 interactions, then undo restores Safe-to-Spend', async ({ page, isMobile }) => {
  await signInOnboarded(page, 50_000)
  const sts = page.getByRole('region', { name: 'Safe to spend' }).locator('[data-amount]').first()
  const before = await sts.getAttribute('data-amount')

  if (isMobile) await page.getByRole('button', { name: 'Add expense' }).click()
  else await page.keyboard.press('n')
  await page.getByLabel('Amount').fill('450')
  await page.getByRole('radio', { name: /Food & Dining/ }).click()
  await page.getByRole('button', { name: /Save ₹450/ }).click()

  await expect(page.getByRole('status').getByText('Added ₹450 expense')).toBeVisible()
  await expect(sts).not.toHaveAttribute('data-amount', before!)

  // ⌘Z inside a text field must NOT trigger app undo
  await page.keyboard.press('ControlOrMeta+k')
  await page.keyboard.type('x')
  await page.keyboard.press('ControlOrMeta+z')
  await page.keyboard.press('Escape')
  await expect(page.getByText('Undone')).toHaveCount(0)

  await page.getByRole('button', { name: /^Undo/ }).click()
  await expect(page.getByText('Undone')).toBeVisible()
  await expect(sts).toHaveAttribute('data-amount', before!)
})
```

`e2e/recurring-draft.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import postgres from 'postgres'
import { signInOnboarded } from './helpers'

test('a due bill appears as a draft and can be confirmed', async ({ page }) => {
  await signInOnboarded(page)
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
  const [u] = await sql`select id from users where email = ${process.env.E2E_CLERK_USER_EMAIL!}`
  const [cat] = await sql`select id from categories where user_id is null and name = 'Subscriptions'`
  await sql`insert into recurring_items (user_id, kind, name, amount, cadence, next_due_on, anchor_day, category_id)
            values (${u.id}, 'bill', 'Netflix', 64900, 'monthly', current_date, extract(day from current_date), ${cat.id})`
  await sql.end()
  await page.goto('/home')
  const drafts = page.getByRole('region', { name: /Waiting for you/ })
  await expect(drafts.getByText('Netflix')).toBeVisible()
  await drafts.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('status').getByText('Confirmed Netflix')).toBeVisible()
  await expect(drafts).toHaveCount(0)
})
```

`e2e/budgets.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { signInOnboarded } from './helpers'

test('budget slider is keyboard-operable and over-plan copy is neutral', async ({ page }) => {
  await signInOnboarded(page)
  await page.goto('/insights')
  await page.getByRole('combobox', { name: 'Add a plan for a category' }).click()
  await page.getByRole('option', { name: /Food & Dining/ }).click()
  const slider = page.getByRole('slider', { name: 'Food & Dining monthly plan' })
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await expect(slider).toHaveAttribute('aria-valuetext', '₹5,500')
  const label = page.getByText(/of ₹5,500|over plan/)
  await expect(label).toBeVisible()
  const color = await label.evaluate((el) => getComputedStyle(el).color)
  expect(color).not.toMatch(/rgb\(2[0-5]\d, [0-9]{1,2}, [0-9]{1,2}\)/) // not a saturated red
})
```

`e2e/theme.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { signInOnboarded } from './helpers'

test('theme toggle persists across reloads', async ({ page }) => {
  await signInOnboarded(page)
  const html = page.locator('html')
  const wasDark = (await html.getAttribute('class'))?.includes('dark')
  await page.getByRole('button', { name: 'Switch colour theme' }).first().click()
  await expect(html).toHaveClass(wasDark ? /^(?!.*\bdark\b)/ : /\bdark\b/)
  await page.reload()
  await expect(html).toHaveClass(wasDark ? /^(?!.*\bdark\b)/ : /\bdark\b/)
})
```

`e2e/a11y.spec.ts`:
```ts
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { signInOnboarded } from './helpers'

for (const path of ['/home', '/activity', '/insights', '/recurring', '/profile']) {
  test(`no serious axe violations on ${path}`, async ({ page }) => {
    await signInOnboarded(page)
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  })
}

test('no serious axe violations on the landing page', async ({ page }) => {
  await page.goto('/')
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([])
})
```

`e2e/reduced-motion.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { signInOnboarded } from './helpers'

test.use({ reducedMotion: 'reduce' })

test('landing has no WebGL canvas and no Lenis when motion is reduced', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('canvas')).toHaveCount(0)
  await expect(page.locator('html')).not.toHaveClass(/\blenis\b/)
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true')
})

test('app pages honour reduced motion', async ({ page }) => {
  await signInOnboarded(page)
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true')
  await expect(page.locator('canvas')).toHaveCount(0)
})
```

- [ ] **Step 4: Lighthouse for the landing page**

`scripts/lighthouse-landing.ts`:
```ts
import { launch } from 'chrome-launcher'
import lighthouse from 'lighthouse'

async function main() {
  const chrome = await launch({ chromeFlags: ['--headless=new'] })
  const result = await lighthouse('http://localhost:3000/', { port: chrome.port, onlyCategories: ['performance', 'accessibility'] })
  await chrome.kill()
  const perf = Math.round((result?.lhr.categories.performance.score ?? 0) * 100)
  const a11y = Math.round((result?.lhr.categories.accessibility.score ?? 0) * 100)
  console.log(`Landing — performance ${perf}, accessibility ${a11y}`)
  if (perf < 75 || a11y < 95) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
```
```bash
cd apps/web
pnpm add -D chrome-launcher
pnpm exec playwright install chromium
pnpm pkg set scripts.e2e="playwright test"
pnpm pkg set scripts.lh="tsx scripts/lighthouse-landing.ts"
pnpm pkg set scripts.verify="pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm build && pnpm e2e && pnpm lh"
cd ../..
```
App-route Lighthouse (spec §9: Accessibility ≥ 95 everywhere, Performance ≥ 85 on `/home`) runs through the **chrome-devtools MCP** (`mcp__chrome-devtools-mcp__lighthouse_audit`) while signed in; the QA agent records scores in `docs/hci/evidence/lighthouse.md` (create it) with date and route.

- [ ] **Step 5: Run everything**

```bash
pnpm db:up
pnpm verify
```
Expected: lint, typecheck, unit, integration, build, all Playwright specs on desktop + mobile, and the landing Lighthouse gate PASS. Fix real failures in app code (not by loosening thresholds).

- [ ] **Step 6: Commit**

```bash
git add apps/web docs/hci/evidence
git commit -m "test(e2e): Playwright flows with Clerk testing, axe, reduced-motion and Lighthouse gates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 25: HCI rationale document

**Files:**
- Create: `docs/hci/part-a-rationale.md` (repo root), `docs/hci/screens/*.png`

**Interfaces:**
- Consumes: the finished app; `docs/hci/evidence/lighthouse.md`; Playwright HTML report; spec §1 HCI requirements and SRS §4.1.

- [ ] **Step 1: Capture screens**

With the demo-seeded user, capture at 1440×900 dark and 390×844 light: Home, Quick add (open), Undo toast, Activity, Insights (with an over-plan budget), Recurring with a draft, Onboarding step 3, Profile motion setting, Landing hero. Save to `docs/hci/screens/<name>-<viewport>.png` (Playwright `page.screenshot` or the playwright MCP).

- [ ] **Step 2: Write the rationale**

`docs/hci/part-a-rationale.md` must contain, in this order:
1. **Who it’s for** — the Anxious Budgeter persona reframed as the primary user; personal-first priority.
2. **Heuristic map** — a table with one row per interaction: Interaction | Principle (Nielsen #, Fitts, Jakob, recognition over recall, non-punitive feedback) | Design decision | Evidence (screenshot + test name). Rows at minimum: Safe-to-Spend hero; pay-cycle dot strip; amount-first quick add; category chips; ⌘K palette; undo toast + ⌘Z; recurring drafts (staging); soft budgets with neutral overflow; balance check-in instead of bank login; reduced-motion setting; 48 px targets; skip link and landmarks.
3. **Motion rationale** — each animation from spec §7.2 with its purpose (status, continuity, feedback, delight) and its reduced-motion fallback.
4. **Accessibility evidence** — axe results summary, keyboard-only walkthrough notes, contrast test output (`src/styles.tokens.test.ts`), Lighthouse table.
5. **Evaluation plan hooks** — how Part A supports SRS VM-1 (SUS) and VM-4 (NASA-TLX) for the personal flows; tasks to use in the study.

- [ ] **Step 3: Commit**

```bash
git add docs/hci
git commit -m "docs(hci): Part A interaction rationale with heuristic map and accessibility evidence

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Plan A2 done when

- `pnpm verify` passes (including E2E on desktop + mobile, axe, reduced-motion, landing Lighthouse).
- Spec §14 success criteria 1–6 are demonstrably met; the HCI rationale document exists with evidence.
