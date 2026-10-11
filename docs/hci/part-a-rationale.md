# Coinflow Part A: interaction rationale

Part A of Coinflow is the personal-finance foundation. This document explains why each interaction is designed as it is, with evidence for each claim.

**Evidence conventions**

- **Screenshots** are in [`screens/`](screens/), captured 2026-10-12 from a production build with `reducedMotion: 'reduce'`. Each screen has a `-1440` capture (1440×900, dark) and a `-390` capture (390×844, light).
- **Tests** are cited as `e2e/<file>.spec.ts › <title>` (Playwright, `apps/web/e2e/`), or by path under `apps/web/src/` for unit and integration tests. Code is cited by path under `apps/web/src/`.
- **What was re-run for this document (2026-10-12, commit `4893b1c`):** six E2E spec files, in both the desktop and mobile projects. They were `a11y`, `keyboard` (desktop only), `reduced-motion`, `budgets`, `quick-add-undo` and `recurring-draft`. **33/33 passed**, including the one setup test.
- **Not re-run:** `onboarding.spec.ts`, `theme.spec.ts` and `landing-signed-in.spec.ts`. They passed in the earlier full `pnpm verify` run at the same commit, which recorded 41/41 E2E, 261 unit and 118 integration tests (per the project's controller ledger).

| Screen | Desktop (dark) | Mobile (light) | Account / state |
|---|---|---|---|
| Landing hero | [landing-1440](screens/landing-1440.png) | [landing-390](screens/landing-390.png) | signed out |
| Home | [home-1440](screens/home-1440.png) | [home-390](screens/home-390.png) | demo |
| Quick add (₹450 · Food & Dining) | [quick-add-1440](screens/quick-add-1440.png) | [quick-add-390](screens/quick-add-390.png) | demo |
| Undo toast | [undo-toast-1440](screens/undo-toast-1440.png) | [undo-toast-390](screens/undo-toast-390.png) | demo; undone after capture |
| Activity | [activity-1440](screens/activity-1440.png) | [activity-390](screens/activity-390.png) | demo |
| Insights (charts) | [insights-1440](screens/insights-1440.png) | [insights-390](screens/insights-390.png)¹ | demo |
| Insights (over-plan soft plan) | [insights-budget-1440](screens/insights-budget-1440.png) | [insights-budget-390](screens/insights-budget-390.png)¹ | demo + Food & Dining plan of ₹3,000 |
| Recurring | [recurring-1440](screens/recurring-1440.png) | [recurring-390](screens/recurring-390.png) | demo |
| Recurring draft on Home | [recurring-draft-1440](screens/recurring-draft-1440.png) | [recurring-draft-390](screens/recurring-draft-390.png) | E2E account: demo seed + one bill due today |
| Onboarding step 3 | [onboarding-step3-1440](screens/onboarding-step3-1440.png) | [onboarding-step3-390](screens/onboarding-step3-390.png) | fresh E2E account |
| Profile, motion setting | [profile-motion-1440](screens/profile-motion-1440.png) | [profile-motion-390](screens/profile-motion-390.png) | demo |

¹ For the two mobile Insights captures, the screen-reader-only chart tables (`table.sr-only`) were hidden by a style applied only during capture. Those tables overflow the page at 390 px (§6, known bug, being fixed), and the overflow would otherwise push the bottom navigation out of frame.

---

## 1. Who it's for

Of the three SRS personas (§1.3), two are about groups. The third, **the Anxious Budgeter**, "wants clear financial pacing without facing guilt-inducing red alerts or complex manual ledger tracking". Coinflow makes this persona the **primary user**: personal spending first, group splitting in Part B. Part A has no group features, and the receivables term `G` is 0 until Part B (spec §4.11).

We assume this user checks money briefly and often, mostly on a phone. They reject scolding red alerts, will not hand over bank credentials or keep a full ledger, and make mistakes that should be cheap to fix. These are design assumptions; §5 is how they get tested. They lead to five commitments:

1. One number.
2. Three-interaction logging.
3. Neutral language for negatives.
4. No bank login.
5. Everything reversible.

The landing page states the priority ("Personal money · then split with friends", [landing-1440](screens/landing-1440.png)).

---

## 2. Heuristic map

Principles are cited as Nielsen heuristics (N1–N10), Fitts's law, Jakob's law, recognition over recall, and non-punitive feedback. Rows marked **(change from spec)** depart from the design spec. The reason is given in the row and in §6.

| Interaction | Principle | Design decision | Evidence |
|---|---|---|---|
| **Safe-to-Spend hero** | N1 visibility of system status; N8 minimalist design; recognition over recall | Home leads with one figure, `S = B − R + I − F + G` (balance, minus bills and drafts still due, plus other income due, minus prorated fixed costs, plus receivables), with a pace line ("≈ ₹1,836/day for 20 days"). The user never subtracts bills in their head. If `S < 0` the hero shows "₹0 free this cycle", a neutral line "₹X more committed than available", and a "See what's committed" link. It never shows a red negative. | [home-1440](screens/home-1440.png); `e2e/onboarding.spec.ts › new user completes onboarding and sees Safe-to-Spend`; `lib/sts-display.test.ts › negative: ₹0 headline with a "free this cycle" suffix and neutral, non-punitive copy (R26)` |
| **Whole-rupee display** (change from spec §7.1) | N8; honest rounding | The hero and the pace are **floored** to whole rupees. Paise are noise at 48–72 px, and flooring never overstates what the user has. Other amounts still show non-zero paise. | [home-390](screens/home-390.png); `lib/sts-display.test.ts › positive: whole rupees, rounded down, for both the headline and the pace` |
| **Pay-cycle dot strip** | N2 match with the real world (payday-to-payday budgeting); status not by colour alone | One bar per day of the cycle: past days solid, future days at 15 % opacity, today ringed. A single `role="img"` reads "Day N of M in this pay cycle". | [home-1440](screens/home-1440.png); `lib/cycle-dots.test.ts › marks past, today and future days of the cycle` |
| **Amount-first quick add** | Fitts's law; N7 efficiency | The order is amount, category, Save. Everything else is folded into "Note, date & method". Below 1024 px wide (narrow screens; the rule is width-based, not touch detection), an on-screen keypad replaces the OS keyboard (`inputMode="none"`). Save is full-width, 56 px, pinned to the sheet bottom (thumb zone, never below the fold at 390×844), and repeats the amount ("Save ₹450"). | [quick-add-390](screens/quick-add-390.png); `e2e/quick-add-undo.spec.ts › quick add in ≤ 3 interactions, then undo restores Safe-to-Spend` |
| **Category chips** | Recognition over recall; N6; WCAG 2.1.1 | Categories are visible 48 px chips (emoji plus name), not a dropdown. They form an ARIA `radiogroup` with a roving tab stop: Tab enters, arrows move and select, Space selects. The emoji is `aria-hidden`. | [quick-add-1440](screens/quick-add-1440.png); `e2e/keyboard.spec.ts › quick add is completable from the keyboard: N, amount, Tab to a category, Space, Enter` |
| **Enter-to-save on a chip** (added during testing) | N7 accelerators; keyboard-first logging (spec §4.6) | Enter on a chip (`role="radio"`) submits the form. Before this fix, keyboard users could not finish. A held Enter and IME composition are both ignored, and fields keep their native Enter. | same keyboard spec; `lib/quick-add-keys.test.ts › submits on Enter over a radio chip or toggle` |
| **⌘K / Ctrl K palette ("Ask Coinflow" pill)** | Jakob's law (the ⌘K convention from Slack, Linear and VS Code); N7; N10 | The pill opens a palette that navigates, switches theme, searches, and parses "250 food lunch" into a prefilled quick add; the placeholder teaches the syntax. **N** opens quick add (not while typing). Part C turns the same pill into the agent, so its location is learned now. | [home-1440](screens/home-1440.png); `lib/quick-command.test.ts › "450 chai" style input resolves through synonyms and keeps the word as the note` |
| **Undo toast + ⌘Z** | N3 user control and freedom; N1; SRS §4.1 10 s undo | Every ledger create, edit and delete raises a toast ("Added ₹450 expense") with Undo and a seconds countdown. ⌘Z / Ctrl Z undoes the latest change, except inside text fields. The toast shows for **10 s**; the server accepts undo for **30 s** to cover slow networks and hover-paused toasts. | [undo-toast-1440](screens/undo-toast-1440.png) (hero ₹36,721 → ₹36,271, exactly ₹450); `e2e/quick-add-undo.spec.ts › quick add in ≤ 3 interactions, then undo restores Safe-to-Spend`; `server/services/audit.int.test.ts › refuses after the 30 s window` |
| **Recurring drafts (staging)** | SRS staging principle; N3; N5 error prevention | A due bill becomes a **draft** under "Waiting for you", with Confirm / Edit / Skip and the line "Scheduled items don't count as spent until you confirm them." Drafts already count as committed money, so **confirming never changes Safe-to-Spend**. §6 lists one same-day edge case. | [recurring-draft-1440](screens/recurring-draft-1440.png) (same seed plus a ₹119 draft; the hero is ₹119 below [home-1440](screens/home-1440.png)); `e2e/recurring-draft.spec.ts › a due bill appears as a draft and can be confirmed`; `server/services/safe-to-spend.int.test.ts › confirming a due-today recurring draft after a same-day check-in leaves Safe-to-Spend unchanged` |
| **Soft budgets with neutral overflow** | Non-punitive feedback; status not by colour alone | Plans are "Optional monthly guides … Going over is just information, no alarms." Going over adds a **hatched** end segment and "₹349 over plan" in warm grey (`--neutral-negative`), not red. The slider is keyboard-operable. | [insights-budget-1440](screens/insights-budget-1440.png); `e2e/budgets.spec.ts › budget slider is keyboard-operable and over-plan copy is neutral` (asserts the label colour is not saturated red) |
| **Category comparison: "vs the previous N days"** (change from spec §4.9) | N2; N4 consistency; not colour alone | The spec asked for this cycle vs last cycle per category. The build instead compares any selected range with the **previous window of the same length**, and the caption says so. Reason: halfway through a cycle, a partial cycle against a full one would always look like an improvement, and a same-length window also works for the 3-month and custom ranges. The previous bars are hatched and labelled. | [insights-1440](screens/insights-1440.png); `components/insights/category-chart.tsx`; `server/services/insights.int.test.ts › groups by IST day and compares with the previous window` |
| **Balance check-in instead of bank login** | N2; trust (no third-party bank access); low effort | Onboarding step 3 asks "Roughly how much is in your account right now?" and says "No bank login. A rough number is fine…". A live ₹ preview shows how the input was parsed ("₹42,500"). "Update balance" on the hero corrects drift later. | [onboarding-step3-390](screens/onboarding-step3-390.png); `server/services/safe-to-spend.int.test.ts › uses the latest check-in and only confirmed activity after it` |
| **Inline field errors** | N9 recognise, diagnose, recover; N5 | Errors appear beside the field with `role="alert"`, and focus moves to that field. A server 422 for a named field shows there too, with no duplicate toast. A paste over the ₹1,00,00,000 cap is rejected whole. | `components/quick-add/quick-add-sheet.tsx` (`fail()`); `lib/keypad.test.ts › flags text over the cap so the caller can reject it whole` |
| **Visible Delete on narrow screens** (change from spec §4.7) | WCAG 2.2 SC 2.5.7 Dragging Movements; N6; discoverability | The spec asked for swipe-left to delete on mobile. Swipe is kept as a **shortcut**, but below 1024 px wide (a width-based CSS rule, not touch detection) every row also shows a 48 px trash button. SC 2.5.7 requires this single-pointer path, and a hidden gesture cannot be discovered by sight. At 1024 px and above the button appears on hover or focus, and a mouse drag never deletes. Every delete raises the undo toast. | [activity-390](screens/activity-390.png) (trash icons); `components/activity/transaction-row.tsx` |
| **Mobile reach to Recurring** | Information scent; N6 | Mobile has four tabs (spec), so Recurring has no tab. It is linked from "Manage" on Upcoming bills, from the Profile row "Recurring bills & income", and from the palette. | [home-390](screens/home-390.png) ("Manage"); [profile-motion-1440](screens/profile-motion-1440.png) |
| **Reduced-motion setting** | WCAG 2.3.3; N3 | Profile → Reduce motion: **On / Off / Match device**, with a plain explanation underneath. It applies immediately and is saved to the profile. See §3. | [profile-motion-1440](screens/profile-motion-1440.png); `e2e/reduced-motion.spec.ts › app pages honour reduced motion` |
| **48 px targets** | Fitts's law; SRS §4.1; WCAG 2.5.8 | Primary controls use `min-h-12` (48 px) or more: chips, toggles, draft actions, row actions and the undo button. Save is 56 px, and the tab bar is 57 px tall. Pressables have an immediate `active:scale-[0.97]` state. | all screenshots; `components/home/pending-drafts-tile.tsx`, `components/undo/undo-toaster.tsx` |
| **Skip link and landmarks** | WCAG 2.4.1, 1.3.1 | On app-shell pages and the landing page the first Tab stop is "Skip to content" (to `<main id="main">`). The shell exposes `<header>`, one visible `<nav aria-label="Main">` and `<main>`. App routes, the landing page and onboarding steps each have an `<h1>`. Tiles are labelled regions. | `components/shell/app-shell.tsx`; `e2e/a11y.spec.ts`; `e2e/recurring-draft.spec.ts` (locates the region by role) |

---

## 3. Motion rationale

One preference (`components/providers/motion-pref.tsx`: `on`/`off`/`system`) gates all motion; heavy effects wait until the OS setting is known. Under reduced motion, `MotionConfig` is `reducedMotion="always"` and a global `!important` rule in `app/globals.css` (on `html[data-reduce-motion="true"]`) sets:

- CSS animations to 1 ms.
- Transitions to **120 ms**, within the spec's "≤ 150 ms fades".

Every built §7.2 component, with its fallback as found in code:

| Animation (source) | Where | Purpose | Reduced-motion fallback |
|---|---|---|---|
| Dither WebGL (React Bits) | Landing hero | Delight | Not mounted; static CSS gradient. Dimmed so text stays ≥ 4.5:1 (§4.3). |
| Split Text (CSS-only `SplitHeading`) | Landing h1 | Delight | `animation: none`. Server-rendered; fully visible within ~650 ms when animated. |
| Animated Beam + GSAP ScrollTrigger (Magic UI) | Landing money-flow | Continuity (income → bills → safe-to-spend) | Static connectors; beams and the scroll rise are not rendered. |
| Number Ticker (Magic UI) via `AmountTicker` | Home, onboarding Done, landing | Feedback | Static text. `data-amount` and an sr-only label always carry the final value. |
| Counter (React Bits) via `AmountRoll` | Quick-add readout | Feedback per keypress | Static text; when animated, the retuned spring settles in < 300 ms. |
| Spotlight Card via `Tile`; Magic Card | App tiles; landing bento | Delight | Plain bordered section, no cursor effect. |
| Blur Fade (Magic UI) via `Reveal` | Home (40 ms stagger), Insights, Recurring, landing | Continuity (reading order) | Plain `<div>`; content is present immediately. |
| Animated List (Magic UI) | Home "Recent" | Continuity (new row slides in) | Plain `<ul>`. |
| Stepper (React Bits, adapted) | Onboarding | Continuity (direction) | 120 ms opacity fade; spinner static. |
| Elastic Slider (React Bits) | Soft plans | Feedback | `elastic={false}`; keyboard stepping unchanged. |
| Click Spark (React Bits) | Quick-add Save | Feedback | Pass-through. Fires on pointer clicks only, not Enter. |
| Animated Circular Progress (Magic UI) | Undo countdown | Status (time left) | Updates once a second instead of every 100 ms; the seconds label stays. |
| Confetti (Magic UI / canvas-confetti), once | Onboarding Done | Delight | Never fires (preference gate + `disableForReducedMotion`). |
| Animated Theme Toggler (Magic UI) | Top bar | Feedback | `animated={false}`; instant flip, no view transition. |
| Lenis smooth scroll | Pages mounting `AppProviders` | Continuity | Not mounted. E2E asserts no `html.lenis` **on the landing page only**; on app pages it asserts `data-reduce-motion="true"` and no canvas (`e2e/reduced-motion.spec.ts`). |
| Recharts entry | Insights | Continuity | `isAnimationActive={false}`. |
| Decorative set: Safari frame, Shimmer / Hover buttons, Marquee, Scroll Reveal, Progressive Blur, Border Beam (drafts tile) | Landing; Activity; Home | Delight / affordance | Safari and Progressive Blur are static. Shimmer is cut to 1 ms. Marquee and Scroll Reveal become static text (one sr-only copy carries it). Border Beam is not rendered. |

**About the 100 ms rule.** The SRS (§4.1) requires a visible indicator within 100 ms for *background AI processing states*. The design spec (§1) generalises this to "any input". Part A meets the generalised rule with immediate press states and inline "Saving…", "Confirming…" and "Skipping…" labels, not with decorative motion.

---

## 4. Accessibility evidence

### 4.1 axe

`e2e/a11y.spec.ts` runs axe-core (`wcag2a`, `wcag2aa`, `wcag21aa`) and fails on any serious or critical violation. It covers these routes: `/`, `/sign-in`, `/sign-up`, `/onboarding` (fresh user), `/home`, `/activity`, `/insights`, `/recurring` and `/profile`. It also covers quick add, filled in and then with the undo toast fully faded in. Every route runs in both projects, for 20 checks. **Result on 2026-10-12: 20/20 passed, 0 serious or critical violations.**

The only exclusion is `.cl-footer` on the sign-in and sign-up pages, which is Clerk's third-party development-instance badge. Note that axe did not detect the mobile `/insights` overflow listed in §6.

### 4.2 Keyboard-only walkthrough

**Tested (asserted by a named spec)**

- `e2e/keyboard.spec.ts › quick add is completable from the keyboard: N, amount, Tab to a category, Space, Enter`. This test asserts that **N** opens the dialog with focus in Amount, Tab reaches the first chip, Space checks it, and Enter saves (the undo toast appears).
- `e2e/keyboard.spec.ts › onboarding can be finished with Tab and Enter only`. All seven steps can be completed with Tab and Enter, and each step's visible "Step N of 7" text is asserted.
- `e2e/quick-add-undo.spec.ts › quick add in ≤ 3 interactions, then undo restores Safe-to-Spend`. This asserts that ⌘Z / Ctrl Z typed inside the palette's text field does **not** trigger an app undo.
- `e2e/budgets.spec.ts › budget slider is keyboard-operable and over-plan copy is neutral`. ArrowRight steps the plan slider to ₹5,500, as asserted through `aria-valuetext`.

**Implemented, not separately tested**

- **⌘K / Ctrl K** opens the palette (`components/shell/shortcuts.tsx:21`); a spec presses it but does not assert the result. The hint reads "⌘K" or "Ctrl K" by platform.
- **⌘Z / Ctrl Z** undoes the latest change outside text fields (`components/undo/use-undo-shortcut.ts`). The E2E test uses the toast's Undo button instead.
- **Esc** closes dialogs and sheets (Radix default).
- **Arrow keys** move between category chips and select them (`components/quick-add/category-chips.tsx:18`).
- **Focus returns to the opener** (or the visible Add button) when quick add closes (`components/quick-add/quick-add-sheet.tsx:285–296`).
- **Focus after a delete** moves to the next row, else the previous row, else the `<h1>`. This is implemented in Activity (`components/activity/activity-view.tsx:66–74`) and Recurring (`components/recurring/recurring-view.tsx:89–96`).

### 4.3 Contrast

`pnpm --filter web test src/styles.tokens.test.ts` gives **40/40 passed**. The test reads both themes' tokens from `globals.css` and enforces 13 pairs per theme. Six key pairs are shown below, with ratios from the same WCAG formula as `lib/contrast.ts`.

| Pair | Minimum | Light | Dark |
|---|---|---|---|
| `foreground` on `background` | 4.5 | 16.60 | 17.35 |
| `muted-foreground` on `card` | 4.5 | 6.22 | 6.98 |
| `primary-foreground` on `primary` | 4.5 | 6.13 | 14.97 |
| `neutral-negative` (over plan) on `card` | 4.5 | 5.91 | 8.21 |
| slider `track` on `card` (non-text) | 3 | 3.34 | 3.71 |
| `foreground` (thumb border) on `track` | 3 | 5.40 | 4.34 |

The file also checks text over the landing dither's worst-case and brightest pixels (lowest 5.01:1) and the money-flow beam path (≥ 3:1; 4.23 light, 4.48 dark). The neutral over-plan colour passes AA in both themes, so "non-punitive" does not mean "low contrast".

### 4.4 Lighthouse

The following is copied from [`evidence/lighthouse.md`](evidence/lighthouse.md), measured on the production build on 2026-10-12. The gated landing check also runs in `pnpm verify`, which recorded desktop 92/100 at `4893b1c`.

| Route | Preset | Performance | Accessibility | Target | Result |
|---|---|---|---|---|---|
| `/` (landing) | Desktop | 94 | 100 | Perf ≥ 75, A11y ≥ 95 (gated) | PASS |
| `/` (landing) | Mobile | 82 | 100 | informational | — |
| `/home` | Desktop | 98 | 100 | Perf ≥ 85, A11y ≥ 95 | PASS |
| `/home` | Mobile | 79 (runs: 79, 77, 79, 79) | 100 | Perf ≥ 85, A11y ≥ 95 | A11y PASS, **Performance MISSES** |
| `/activity`, `/insights`, `/recurring`, `/profile` | Desktop / Mobile | not measured | 100 / 100 | A11y ≥ 95 | PASS |

Cause of the mobile `/home` miss: **Clerk development keys** add a ~1.7 s dev-instance handshake, and the root layout loads the whole Clerk bundle; simulated mobile throttling amplifies both (the landing page's 82 has the same cause). Production keys were not measured, so the miss stands.

---

## 5. Evaluation plan hooks

SRS §5 sets two metrics that Part A's personal flows can address:

- **VM-1 SUS:** 10-item post-test survey, target **≥ 80.0**. It is administered for the **Coinflow condition only**.
- **VM-4 NASA-TLX:** the target is a **≥ 30 % drop in Mental Demand** against manual apps. Part A has no splitting, so the baseline becomes the participant's current method: a notes app, a spreadsheet or a generic tracker.

VM-2 and VM-3 need Part B.

**Protocol (proposed)**

- **Design.** 8–12 participants who budget payday to payday; within-subjects, counterbalanced; phone at 390×844.
- **Setup before each session:**
  1. Reset the account and run `pnpm db:seed:demo`, so every participant sees the same numbers.
  2. Remove any soft plans, so T5 starts from no plan.
  3. Create one bill due **today** for T6. Either add it in Recurring with today as the next due date, or insert it the way `e2e/recurring-draft.spec.ts` does (a `recurring_items` row with `next_due_on` set to today in IST). The draft appears on the next page load.
- **Measures.** Completion, time, errors and undo use (audit log); raw NASA-TLX after each condition; SUS after the Coinflow condition.

| # | Task (read to participant) | Success criterion | Feature | Automated precedent |
|---|---|---|---|---|
| T1 | "Find how much you can safely spend today." | States the pace or cycle amount within 10 s of reaching Home, without leaving Home | Safe-to-Spend hero | `e2e/onboarding.spec.ts › new user completes onboarding and sees Safe-to-Spend` |
| T2 | "You just paid ₹450 for chai. Log it under Food." | One ₹450 Food & Dining expense within 10 s; ≤ 3 interactions after opening quick add (the Add / "Add expense" button with the plus icon, or the **N** key) | Quick add, chips | `e2e/quick-add-undo.spec.ts › quick add in ≤ 3 interactions, then undo restores Safe-to-Spend` |
| T3 | "You deleted the wrong entry. Get it back." (facilitator triggers the delete) | Row restored by Undo or ⌘Z / Ctrl Z within the 10 s toast | Undo toast, visible Delete | same quick-add-undo spec |
| T4 | "Pause your Netflix subscription." | Netflix shows "Paused" within 60 s; on mobile, record which path reached Recurring | Recurring; mobile reach | none (manual) |
| T5 | "Set a soft plan for Food of ₹3,000 a month." (below the seeded spend, ~₹3,349 as captured; if the seed date differs, use any amount below the spend Insights shows) | A Food & Dining plan below current spend exists and shows "over plan"; asked afterwards, the participant does not describe the state as alarming | Soft plans, neutral overflow | `e2e/budgets.spec.ts › budget slider is keyboard-operable and over-plan copy is neutral` |
| T6 | "A bill is waiting for you. Deal with it." (needs the setup bill) | Draft confirmed or skipped from "Waiting for you"; correctly answers "Did your safe-to-spend change?" (no, on confirm) | Recurring drafts | `e2e/recurring-draft.spec.ts › a due bill appears as a draft and can be confirmed` |
| T7 | "Your account actually has ₹40,000 now. Tell Coinflow." | New ₹40,000 check-in; the hero updates | Balance check-in | `server/services/safe-to-spend.int.test.ts › uses the latest check-in and only confirmed activity after it` |

**Study-level targets.** The SRS sets two of them: SUS ≥ 80 (VM-1) and Mental Demand ≥ 30 % below baseline (VM-4). The rest are *proposed* by us, not SRS values: median T2 time ≤ 10 s, ≥ 90 % unaided completion on T1–T3, and no participant calling the T5 over-plan state alarming.

---

## 6. Known limitations & future work

**Accepted rules**

- **Same-day draft double count.** A recurring bill confirmed *before* a same-day check-in is counted again, because no `confirmedAt` orders the two events. Confirming after a check-in is correct and tested. Fix: a `confirmed_at` column.
- **Bill paid before the check-in.** A pending draft for such a bill stays in R until it is confirmed or skipped (spec §4.11.3).
- **Undo timing.** The toast's button works up to the server's 30 s limit, then shows "It's too late to undo that change."
- **Enter on toggles.** Enter on the Expense/Income or Paid-with toggles also saves, consistent with the chip rule. Needs checking in the study.

**Deviations from the spec**

- **Whole-rupee hero** (§7.1): see §2.
- **Visible Delete below 1024 px** (§4.7): see §2.
- **Same-length comparison window instead of this-cycle vs last-cycle** (§4.9): a fair comparison mid-cycle, and it works for every range.
- **Category chips are not "recent first"** (§4.6). The chips use a fixed built-in order.
- **Landing money-flow** is scroll-scrubbed, not pinned (§4.2).
- **Number Ticker on Home** is still short of its final value about **4.5 s** after load. The final value is always in `data-amount` and the sr-only label, and reduced motion shows it at once. Settling within about 1 s is queued for the final review.

**Issues found while capturing** (reported, not fixed)

1. **`/insights` at 390 px lays out 707 px wide.** The `table.sr-only` chart tables (`insights/spend-chart.tsx:82`, `insights/category-chart.tsx:63`) do not clip, which pushes the fixed tab bar and the Ask pill off-screen (WCAG 1.4.10 Reflow). This is the known overflow bug behind screen-index footnote ¹.
2. **Profile at 390 px clips the selected "✓ Match device" toggle** ([profile-motion-390](screens/profile-motion-390.png)).
3. **The mobile undo toast overlaps the tab-bar labels** for 10 s ([undo-toast-390](screens/undo-toast-390.png)).
4. **The landing product shot is out of date.** It predates the whole-rupee change (₹36,721.71), and the hard-coded "₹18,450" badge does not match it ([landing-1440](screens/landing-1440.png)).
5. **The demo seed duplicates "Toit dinner"** on the same day.

**Performance.** Mobile `/home` Lighthouse is 77–79 against 85 under development keys (§4.4). The next steps are to scope `ClerkProvider` to the route groups that need it and to measure with production keys.

**Future work**

- **Part B:** groups, receivables feeding `G`, and UPI settle-up.
- **Part C:** the pill becomes the AI agent, whose outputs arrive as staged drafts.
- **The §5 study.**
