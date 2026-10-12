# Coinflow Parts B & C: interaction rationale

Part B adds groups and events (shared expenses, balances, settling up, friends). Part C adds an AI layer (chat, voice, receipts and a coach) that only ever *proposes*. This document explains why each new interaction is designed as it is, with evidence for each claim. It follows the conventions of [part-a-rationale.md](part-a-rationale.md).

**Evidence conventions**

- **Screenshots** are in [`screens/`](screens/), captured 2026-10-12 by `e2e/capture-bc.spec.ts` (tagged `@capture`, run with `CAPTURE=1`) from a production build (`pnpm build && pnpm start`) with `reducedMotion: 'reduce'`. As in Part A, each screen has a `-1440` capture (1440×900, dark) and a `-390` capture (390×844 at 2×, light).
- **Accounts.** Only the E2E accounts appear: "Coinflow E2E" (the payee) and a second E2E user who claims the placeholder "Asha". The friends screen uses two fixture rows that are not Clerk users. The demo account was not touched.
- **The agent is stubbed in every E2E and capture run.** No LLM is configured locally, so the real assistant reports "Assistant offline". The specs replace only the agent routes (`/api/v1/agent/health`, `/chat`, `/outcome`); Approve still goes through the real API. **The real LLM is not part of the graded run**; the agent itself is covered by pytest with a scripted fake LLM (`apps/agent/tests/`). In the B screens health is stubbed online, so the pill reads "Ask Coinflow…"; `c-offline` stubs it offline, which matches what the real local setup reports.
- **Tests** are cited as `e2e/<file>.spec.ts › <title>`, by path under `apps/web/src/` (unit, integration and code), or as `apps/agent/tests/<file>.py::<test>` (pytest).
- **Test run behind this document:** a full `pnpm verify` at commit `b97ebf8` (2026-10-12) passed: lint, typecheck, **358 unit**, **97 agent** (pytest), **167 integration**, build, **77 E2E passed** with 10 expected skips (8 phone-only reflow checks in the desktop project; the two-person groups and friends journeys in the mobile project, which run once, on desktop), and the landing Lighthouse gate (performance desktop 92 / mobile 82, accessibility 100 / 100). Review fix round 1 (commit `1b6bc5a`) changed only E2E code and re-ran the four affected specs on both projects (`groups`, `groups-a11y`, `agent`, `friends`: 24 passed, 3 expected skips) and the capture spec; the full verify is repeated at the end of the branch.

| Screen | Desktop (dark) | Mobile (light) | Account / state |
|---|---|---|---|
| Groups list | [b-groups-1440](screens/b-groups-1440.png) | [b-groups-390](screens/b-groups-390.png) | E2E; one event, "Goa trip", 16–19 Oct, 4 people |
| Expense sheet, Percent mode | [b-expense-modes-1440](screens/b-expense-modes-1440.png) | [b-expense-modes-390](screens/b-expense-modes-390.png) | ₹1,200 "Villa deposit", 40/20/20/20 % with the live ₹ preview |
| Receipt canvas (itemized) | [b-receipt-canvas-1440](screens/b-receipt-canvas-1440.png) | [b-receipt-canvas-390](screens/b-receipt-canvas-390.png) | three lines, "Fresh lime soda" unassigned, tax ₹37.50, tip ₹60 |
| Balances with "Why?" | [b-balances-why-1440](screens/b-balances-why-1440.png) | [b-balances-why-390](screens/b-balances-why-390.png) | the ₹900 dinner: you paid ₹500, Ravi ₹400; split between you, Asha and Ravi |
| Settlement graph | [b-balances-graph-1440](screens/b-balances-graph-1440.png) | [b-balances-graph-390](screens/b-balances-graph-390.png) | the same two payments as a map, above "Where everyone stands" |
| Settle sheet | [b-settle-1440](screens/b-settle-1440.png) | [b-settle-390](screens/b-settle-390.png) | second user (as Asha) paying ₹200; the payee has no UPI ID yet ("No QR yet") |
| Join page | [b-join-1440](screens/b-join-1440.png) | [b-join-390](screens/b-join-390.png) | second user on the invite link; nothing preselected |
| Bell with Confirm / Not received | [b-notification-confirm-1440](screens/b-notification-confirm-1440.png) | [b-notification-confirm-390](screens/b-notification-confirm-390.png) | the payee, after "I’ve paid" |
| Friends | [b-friends-1440](screens/b-friends-1440.png) | [b-friends-390](screens/b-friends-390.png) | one incoming request, one friend, one search result |
| Agent panel with a proposal | [c-panel-proposal-1440](screens/c-panel-proposal-1440.png) | [c-panel-proposal-390](screens/c-panel-proposal-390.png) | stubbed agent; pending ₹250 expense chip |
| Voice status | [c-voice-status-1440](screens/c-voice-status-1440.png) | [c-voice-status-390](screens/c-voice-status-390.png) | hold to talk; "Listening…" while the microphone prompt is pending |
| Assistant offline | [c-offline-1440](screens/c-offline-1440.png) | [c-offline-390](screens/c-offline-390.png) | health reports offline; the pill still opens quick add |

---

## 1. Who it's for

The primary user is still Part A's **Anxious Budgeter**: personal money first, splitting second. Parts B and C keep that order:

- A group expense reaches your own Coinflow only as **your share**, through a read-only mirror row in Activity.
- Money you owe always counts against Safe-to-Spend. Money you are owed counts only if you allow it.
- The assistant drafts and you decide. Nothing changes your money until you press Approve.

The SRS group personas (§1.3) gain what Part A deferred: people not yet on Coinflow, uneven payers, explained payments, and settlements both sides agree on.

---

## 2. Heuristic map

Principles: Nielsen heuristics (N1–N10), Jakob's law, recognition over recall, WCAG criteria and non-punitive feedback. **(change from Part A)** marks a departure from the earlier spec.

| Interaction | Principle | How | Evidence |
|---|---|---|---|
| **Amount-first expense sheet** | Jakob's law; N4 consistency | The group sheet opens on Amount, then "What for?", then category chips, the same order as Part A's quick add. Payers and the split come after, with sensible defaults: you paid, split equally between everyone. | [b-expense-modes-1440](screens/b-expense-modes-1440.png); `e2e/groups.spec.ts › event → multi-payer subset expense → claim → balances → mark paid → confirm` |
| **Avatar toggles for people** | Recognition over recall; N7 | "Paid by" and "Split between" are rows of avatar toggle buttons (`aria-pressed`), never a typed name. Leaving Dev out of a dinner is one tap. Placeholders have a dashed ring, so "not on Coinflow yet" is visible without colour. | [b-expense-modes-390](screens/b-expense-modes-390.png); the groups spec (Dev toggled off, `pressed: true` locator) |
| **Live per-person preview, "₹X left to assign"** | N1 visibility of system status; N5 error prevention | Every split mode shows each person's ₹ share as you type and one status line ("4 people · shares add up to the total", or what is missing). Multiple payers show "Payments add up to the total." or what is left. An invalid save gets an inline alert beside the split, not a toast. | [b-expense-modes-1440](screens/b-expense-modes-1440.png); `lib/expense-form.test.ts › multiple payers: shows what is left and refuses to save until it adds up`; `lib/split.test.ts › percent that does not reach 100% names what is left` |
| **Shares are never silently rescaled** | N3 user control; N5 | If you type exact amounts for ₹900 and then change the total to ₹1,000, the sheet says "₹100 left to assign"; it never stretches your numbers. Every split is integer paise and adds up exactly (largest remainder, ties by member order). | `lib/expense-form.test.ts › total changed after exact entries: says what is left instead of rescaling`; `lib/split.test.ts › indivisible totals always add up exactly, within a paisa of the exact share (500 cases)` |
| **Receipt canvas: drag, or toggle** | N7 flexibility; WCAG 2.5.7 dragging movements (single-pointer alternative); status not by colour alone | Each line has "Who had …" toggles; dragging an avatar onto a line is a pointer shortcut for the same action (the drag strip is `aria-hidden`, with no focusable parts). An untaken line says "Unassigned ₹180" in words. Tax, tip and discount follow what each person had. | [b-receipt-canvas-390](screens/b-receipt-canvas-390.png); `components/groups/receipt-canvas.tsx`; `lib/split.test.ts › itemized: tax, tip and discount follow each member’s item subtotal`; `lib/expense-form.test.ts › an itemized line nobody took is a field error on that item` |
| **"Who pays whom" with "Why?"** | N1; N2 match with the real world; trust through explanation | Balances shows the fewest payments (greedy min-cash-flow, at most N−1). Each row has a "Why?" disclosure with a full sentence: "Asha pays you ₹200: Asha owes ₹300 across Dinner; you are owed ₹200 and Ravi ₹100." It uses names, not pronouns (ruling A10). | [b-balances-why-1440](screens/b-balances-why-1440.png); `lib/settle.test.ts › explains each payment with the debtor’s expenses and how their debt is split (spec §2.6 example)`; the groups spec asserts this exact sentence |
| **The graph repeats the list** | N4; one source of truth | The graph below the list is `aria-hidden` with no focusable parts; tapping an arrow opens that row's "Why?", so it never says something the list does not. Edges stop animating under reduced motion. | [b-balances-graph-1440](screens/b-balances-graph-1440.png), [b-balances-graph-390](screens/b-balances-graph-390.png); `components/groups/settlement-graph.tsx` |
| **Mark paid → confirm or reject** | N1; mutual agreement; nothing moves money | Settle up shows the payee's UPI QR (or "No QR yet" and plain steps), then "I’ve paid". The payee confirms or answers "Not received" from the bell. Only a confirmed payment changes balances. Pending marks are listed under "Waiting for confirmation" but never counted. | [b-settle-390](screens/b-settle-390.png), [b-notification-confirm-1440](screens/b-notification-confirm-1440.png); `server/services/groups/settlements.int.test.ts › mark → payee notified → confirm → mirrors, balances, and the payer is told`; `› reject tells the payer and moves no money`; the groups spec |
| **Undo a mark only while pending** | N3, with honest limits | A mark has the usual 10 s undo. Once the payee has confirmed, undo is refused with a plain message, because the other person has already acted on it. | `server/services/groups/settlements.int.test.ts › undoing a mark the payee already confirmed is refused` |
| **Joining: "Which one is you?"** | Recognition over recall; N5 | The invite page lists the placeholders and "I’m not listed". Nothing is preselected, because a claim is final. "Join group" without a choice shows an inline alert. Two people claiming the same name: one wins, and the other is told who took it. | [b-join-390](screens/b-join-390.png); the groups spec (no radio checked, inline alert); `server/services/groups/groups.int.test.ts › concurrent claims of one placeholder: exactly one wins, the other is told who took it` |
| **Friends by exact email** (spec §3.8) | Privacy; N7 efficiency of use | Search matches only an exact, case-insensitive email, so nobody can browse accounts. An accepted request is standing consent: either friend can add the other straight into a group, with no link or claim. "Link Asha to a friend" keeps the placeholder's history. Unfriending never rewrites shared money. | [b-friends-390](screens/b-friends-390.png); `e2e/friends.spec.ts › friend by email → accept from the bell → add to a group directly → they see it`; `server/services/friends.int.test.ts › search is exact and case-insensitive, and says how you are related`; `› linking a placeholder to a friend backfills their mirrors and is refused for strangers or taken names` |
| **Personal-first money** | N2; user control | Only your **share** is your spending (Insights, budgets), while the cash you actually paid keeps the balance honest. `S = B − R + I − F + G`, where G is your group position. What you owe always counts. What you are owed counts only with "Count money owed to me in Safe-to-Spend" (Profile), applied per group. Settling never changes Safe-to-Spend. | `lib/safe-to-spend.test.ts › worked example: settling never changes S`; `› counts what you owe always, and what you are owed only when allowed — per group`; `server/services/safe-to-spend.int.test.ts › S moves by my share only; settling never changes S; owed money can be left out` |
| **Proposals over drafts** (change from Part A) | N3 user control; N5; SRS staging requirement | Part A's spec said the agent "writes drafts"; spec §1 changes this: the agent never writes. Proposals appear as chips ("Expense · not saved yet") with Approve, Edit and Dismiss. Approve saves through the same `/api/v1` route and undo as a manual entry; the agent's own token is read-only. | [c-panel-proposal-1440](screens/c-panel-proposal-1440.png); `e2e/agent.spec.ts › a proposal is staged, then Approve saves it through the normal API with undo`; `app/api/v1/agent.api.int.test.ts › the AI never writes: an internal token reads (GET 200) but every write is refused with 403 read_only`; `apps/agent/tests/test_no_writes.py::test_the_user_client_cannot_write` |
| **The agent asks instead of guessing** | N5; N9 | An amount the agent cannot pin down ("1,5") or a person who is not in the group produces a question, not a chip. The web proxy re-validates every proposal against the API schemas and drops any that fail or name a non-member. | `apps/agent/tests/test_tools.py::test_an_unclear_amount_is_asked_about_not_guessed`; `::test_unknown_member_asks_instead_of_proposing`; `app/api/v1/agent.api.int.test.ts › chat streams through and drops proposals that fail the API schemas or name a non-member` |
| **Voice status as text** | N1; WCAG 4.1.3 status messages | Holding the mic (pointer, Space or Enter) shows "Listening…" before the permission prompt resolves, then "Transcribing…" and "Thinking…", in a `role="status"` line. Esc cancels the clip. A denied mic says "The microphone is blocked…" and suggests typing. Reduced motion swaps the waveform for a static level bar. | [c-voice-status-390](screens/c-voice-status-390.png); `e2e/agent.spec.ts › hold to talk shows "Listening…" as unobscured text at once; a blocked mic explains itself`; `lib/agent-chat.test.ts › shows Thinking… the moment a message is sent (spec §4.7: within 100 ms, as text)`; Task 4 smoke (b) |
| **Coach** | Non-punitive feedback; N3 | Rules decide; the LLM may only reword (every ₹ amount kept, no "!", template on any doubt). At most two a day, none in quiet hours, with an off switch ("Coach notifications", Profile). | `apps/agent/tests/test_coach.py::test_tone_is_never_punitive`; `::test_at_most_two_a_day_in_priority_order`; `::test_quiet_hours_can_wrap_midnight`; `e2e/agent.spec.ts › a coach nudge written through the internal endpoint shows in the bell` |
| **Assistant offline** | Graceful degradation; N1 | When the agent is down or no LLM is configured, the pill reads "Assistant offline · quick add still works" and opens the ⌘K palette. Everything else works. Quick add stays the first palette action for amount-led input either way. | [c-offline-390](screens/c-offline-390.png); `e2e/agent.spec.ts › assistant offline: the pill says so, and quick add still works`; `app/api/v1/agent.api.int.test.ts › agent unreachable → 503 agent_offline; health says offline; unconfigured → offline without calling out` |

---

## 3. Accessibility evidence

### 3.1 axe

`e2e/groups-a11y.spec.ts` runs axe (WCAG 2 A/AA and 2.1 AA tags) on both projects (desktop dark, mobile light) and expects **zero serious or critical** violations on:

- `/groups`, both empty and with a group;
- every group tab: Expenses, Balances, Activity and Members;
- the expense sheet in Itemized mode with a line added;
- the settle sheet ("Pay Asha");
- the Members tab with "Add from friends", and the "Who is Asha?" link dialog;
- the agent panel;
- `/join/<token>` for the second user;
- `/friends` with a request, a friend and a search result.

Each check first waits for the network and every finite animation (`settleAnimations` in `e2e/helpers.ts`); otherwise axe reads colours mid-fade. As in Part A, **no elements are excluded**. Two parts are hidden from assistive technology on purpose, each with an equivalent: the receipt drag strip (the toggles) and the settlement graph (the list and "Why?").

### 3.2 Reflow

The same spec loads `/groups`, `/friends`, all four group tabs and `/join/<token>` at **390 and 320 px**, with reduced motion off and on, and fails on any sideways page scroll. It found one real bug (§3.4).

### 3.3 Keyboard paths

- **Splitting.** Payers, participants and item owners are buttons with `aria-pressed`; Split mode is a radiogroup; Shares use −/+ steppers with a polite count. A split error is a `role="alert"` beside the split, and the inputs it names are `aria-invalid` and described by it.
- **Receipt canvas.** Every drag action has a Tab-reachable toggle ("Who had Prawn curry" group).
- **Hold to talk.** Space or Enter starts, release sends, Esc cancels (`aria-keyshortcuts="Space"`). The E2E drives the voice state with Space only.
- **Focus after removal.** Answering the last friend request moves focus to the "Your friends" heading, not `<body>` (`e2e/friends.spec.ts › answering the last request on /friends keeps focus on the page, not <body>`). Confirming a payment or accepting a friend request from the bell keeps focus on that notification's link (asserted with `toBeFocused()` in the groups and friends journeys).
- **Bell links.** A notification that links to the same group's `?tab=balances` switches the tab without a reload: the groups spec sets a window marker before the click and asserts it survives.

### 3.4 Problems found and fixed during this verification

| Problem | Effect | Fix | Evidence |
|---|---|---|---|
| The group page (a server component) imported `GROUP_TABS` from the client `GroupView` | **Every** `/groups/[id]` load threw `GROUP_TABS.includes is not a function`; typecheck and build both passed | The tab list moved to `lib/group-display.ts`; a boundary test fails any server module under `src/app` that imports a non-component value from a client module | `app/client-boundary.test.ts`; `lib/group-display.test.ts › ?tab= resolves to a known tab, else the fallback`; commit `5df6e7e` |
| Deleting a user who had created a group | a foreign-key error (affects Clerk `user.deleted`) | `deleteUser` deletes the user's groups first, in the same transaction | `server/services/users.int.test.ts › deleteUser removes a user who created a group, with the group, without an FK error (found in E2E reset)`; commit `e007bcd` |
| Members tab at 320 px with a friend to add | 356 px wide: the implicit `auto` grid track grew to a long email | `grid-cols-1` (`minmax(0, 1fr)`), also on `/friends` | the reflow test; commit `58ac30b` |
| The mic level meter sat on top of "Listening…" | the status text the spec requires was partly hidden while recording | the meter now floats to the right of the mic | `e2e/agent.spec.ts › hold to talk shows "Listening…" as unobscured text at once; a blocked mic explains itself` (it compares the two boxes); commit `82ca601` |

**Accepted exception.** On phones the Ask pill's "+" (Part A's personal quick add) and the group header button are both named "Add expense"; see §6.

---

## 4. Evaluation plan hooks

Part A §5 covered VM-1 and VM-4 for personal tasks. Part B makes the group metrics testable. The SRS (§5, "Verification & Academic Evaluation Framework") defines them as follows (quoted exactly):

| Metric | Parameter | Evaluation protocol | Success benchmark |
|---|---|---|---|
| VM-1 | System Usability Scale (SUS) | 10-question standardized post-test survey | Score ≥80.0 (Grade A) |
| VM-2 | Bill Allocation Efficiency | Timed task: 5 members, 10 itemized items | Completion time ≤60 s |
| VM-3 | Algorithmic Transparency Rating | 7-point Likert scale on settlement clarity | Mean score ≥5.8/7.0 |
| VM-4 | Cognitive Workload Reduction | NASA-TLX comparison against manual split apps | ≥30% drop in Mental Demand |

- **VM-1:** one post-test SUS covering T1–T13.
- **VM-2:** T13's long variant: a printed 10-line receipt for 5 members, timed from opening the sheet to Save.
- **VM-3:** asked right after T10: "How clear was it why you pay what you pay?" (1–7).
- **VM-4:** NASA-TLX Mental Demand after T9–T11, against the same tasks in the participant's current method (Splitwise, a notes app or a spreadsheet).

**Setup** (beyond Part A's): a second test account, and the "Goa trip" event from the screens with Asha unclaimed. T12 needs a configured LLM, or the facilitator runs the stubbed panel and says so.

| Task | Prompt | Success criterion | Automated precedent |
|---|---|---|---|
| T8 | "Create an event for 5 people for your Goa trip. Two of them aren't on Coinflow." | Event with you + 4 people, 2 or more shown as "Hasn’t joined yet", within 90 s | groups spec (creation) |
| T9 | "Log ₹900 dinner: you paid 500, Ravi paid 400, Dev wasn't there." | Payers ₹500/₹400, participants You/Asha/Ravi; Balances shows "Asha pays you ₹200" and "Asha pays Ravi ₹100" | groups spec (identical expense and rows) |
| T10 | "Explain why you get ₹200 from Asha." | Opens "Why?" and restates the reason (Asha's ₹300 dinner share goes to you and Ravi); then VM-3 | groups spec (the exact sentence); `lib/settle.test.ts` |
| T11 | (as Asha, second account) "Settle with the payee and get it confirmed." | "I’ve paid", the payee confirms from the bell, the payment leaves Balances | groups spec (mark → bell → Confirm) |
| T12 | "Say '250 lunch with Asha' to Coinflow, then save it." | A ₹250 chip is approved and appears in Activity; the participant knows nothing was saved before Approve | `e2e/agent.spec.ts › a proposal is staged, then Approve saves it through the normal API with undo` (stubbed) |
| T13 | "Scan this receipt and give the two dosas to Asha and the coffee to you." | Itemized split saved with ≥ 2 lines assigned and nothing unassigned | `apps/agent/tests/test_receipt.py::test_a_receipt_that_adds_up`; no E2E (needs a vision model) |

**Proposed targets** (ours, not SRS values): ≥ 80 % unaided completion on T8–T11, ≥ 80 % correct restatements on T10, and nobody on T12 believing the chat saved before Approve.

---

## 5. Performance notes

**Speech to text.** The spec targets ≤ 2.5 s for clips under 15 s with faster-whisper `small` int8 on CPU. Neither measurement met it, and both were taken on a heavily loaded machine:

- **Task 3:** 3.28 s, under a load average of 6–10.
- **This task (Step 5):** the Docker run of `scripts/bench_speech.py` was killed by the Docker VM (exit 137, out of memory). That VM has 7.65 GiB, shared with about 6 GiB of unrelated containers. The same script run natively on macOS arm64 (10 cores) printed:

  `clip 5.1 s · transcribed in 2.91 s · SLOW (target ≤ 2.5 s)`

  The load average was **14.44** before the run and **16.61** after.

The target is therefore **not demonstrated**; it needs a run on an idle machine (`base` measured 0.94 s in Task 3). The bench synthesises its clip with Kokoro, whose macOS espeak fallback is disabled, so "Asha" and "Toit" were missing from the audio and from the transcript.

**Min-cash-flow.** `lib/settle.test.ts › 50 members: ≤ N−1 payments, < 50 ms, and paying them settles everyone` asserts the < 50 ms bound for 50 members on every `pnpm test` run.

---

## 6. Known limitations & future work

**Limitations**

- **No web push** (spec §8): in-app only, SSE then 30 s polling.
- **Payments to placeholders wait for a claim** (ruling A7). "Waiting for Ravi to confirm" stays pending until someone claims Ravi.
- **Speech runs in Docker.** On macOS, Kokoro's espeak fallback is disabled, so names may be skipped. STT latency is not demonstrated (§5).
- **The coach's run marker lives in memory**; after a restart, per-key dedupe and the server's cap of two a day still stop duplicates.
- **Quiet hours are honoured but not editable**: Profile has no control yet.
- **Group expense `source` is not stored.** Only personal expenses keep `chat` / `voice` / `scan`.
- **Two "Add expense" buttons on phones** (§3.4): the pill's "+" should read "Add personal expense" on group pages.
- **The real LLM is not evaluated here**, only a scripted fake in pytest.

**Ambiguity rulings** (from the plan; the spec is silent or contradicts itself)

- **A1 Settlement sign:** net = paid − share + settlements paid − settlements received, the only arithmetic that keeps "settling never changes S".
- **A2 Zero-cash mirrors:** the amount check allows `0` only for `source = 'group'`.
- **A3 Positive G per group:** being owed in one group never hides what you owe in another.
- **A4 Re-showable invite links:** the token is an HMAC of the invite id, and only its hash is stored, so Invite can show it again without revoking it.
- **A5 `split_mismatch` field:** `field` is the input path, and the message names the amount left.
- **A6 Group categories:** built-in, non-system expense categories only. "Settle up" categories are hidden from pickers.
- **A7 Placeholders in settlements:** pending until claimed; cash *received* from a placeholder is confirmed at once, with no undo, after a confirmation question.
- **A8 Group-expense PATCH:** takes the whole body. Deleting an expense notifies the people involved.
- **A9 Coach scheduling:** hourly slots from 08:30 to 21:30 IST, once per user per day, outside quiet hours. The server caps it at two a day and dedupes.
- **A10 "Why?" text:** uses the debtor's name, not a gendered pronoun.
- **A11 Agent read tools:** `list_categories` and `get_group` were added. Proposal tools take rupee strings and names, and resolve them or ask.
- **A12 One internal-token format:** used both ways. Service calls use `aud='coinflow-internal'`, `sub='svc:agent'`.
- **A13 Speech extra:** installed in the Docker image only. Plain `uv sync` skips it, and health then reports `stt`/`tts` false.

**Future work**

- **The study:** §4, with the SRS VM-1 to VM-4 benchmarks.
- **A configured LLM run:** T12 and T13 end to end, with a vision model for receipts.
- **Notification channels:** web push or email for settlement confirmations, if the scope allows it.
