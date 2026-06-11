# Quarterly Review Module → 10/10 (Q1 FY27 workshop readiness)

**Goal:** make the quarterly review workshop reliable and complete enough to run live
with every client to plan **Q1 FY27** (Jul–Sep 2026). Audit done 2026-06-11.

**In scope:** all audit findings EXCEPT live Xero integration (scorecard *financial
actuals* stay manual entry this round — explicitly deferred).

**Out of scope (deferred):** pulling Xero financial actuals into the scorecard.

**Status:** PLAN — for Matt's review before any coding starts. Nothing here is built yet.

---

## TL;DR of what we're fixing

| # | Item | Severity | Why it matters for the workshop |
|---|------|----------|--------------------------------|
| 1 | Quarterly Plan step shows **0 KPIs** for every client | 🔴 P0 | Can't set Q1 FY27 KPI targets — list is empty for all |
| 2 | Reflect/carryover uses **calendar quarter, not review quarter** | 🔴 P0 | Running a Q1 FY27 review in June reflects on the WRONG quarter |
| 3 | **No way to pick Q1 FY27** in the UI (locked to current quarter) | 🟠 P1 | Can't start the right review without hand-editing the URL |
| 4 | Landing-page `year_type` read by wrong id | 🟡 P2 | Minor; silently defaults to FY |
| 5 | Legacy `/reviews/quarterly` page: dead-save + duplicate snapshots | 🟠 P1 | Coach could land there and lose a client's reflections |
| 6 | **Coach notes** unwired (no field to capture them live) | 🟠 P1 | No place for the coach to record facilitation notes |
| 7 | Scorecard pre-fill (non-Xero) + polish items | 🟡 P2 | Quality-of-life; reduce blank screens |
| 8 | Pre-flight data readiness check | 🟠 P1 (ops) | Catch clients missing FY27 targets/KPIs before the session |

---

## PHASE 1 — Correctness (must ship before the workshop)

### 1.1 Fix empty KPI list in Quarterly Plan step  🔴
- **Problem:** Step 4.2 KPI list is empty for all clients.
- **Root cause:** `QuarterlyPlanStep.tsx:379` reads `business_kpis` by `businessesId`
  (= `review.business_id` = businesses.id). KPIs are stored under `business_profiles.id`.
  Proven against prod: 0 KPIs under businesses.id for all 12 clients; all KPIs under
  profile id. The misleading comment at `:375` ("uses businesses.id") is wrong.
- **Fix:** query by `businessId` (the profile id already computed at `:336`); correct the
  comment. Mirror `ScorecardReviewStep.tsx:183` / `QuarterlyTargetsStep.tsx:133`, which do
  this correctly.
- **Files:** `components/steps/QuarterlyPlanStep.tsx`.
- **Risk:** negligible (read-only change to an already-resolved variable).
- **Test:** open Quarterly Plan as 2–3 clients → KPI list populates.

### 1.2 Standardize business-id resolution (root-cause fix, prevents recurrence)  🔴
- **Problem:** every step re-derives ids ad-hoc (`profile?.id || review.business_id`,
  `activeBusiness?.ownerId`, `review.business_id`). One got it wrong (1.1); the pattern
  invites the next bug.
- **Fix:** add a single helper/hook (e.g. `useReviewBusinessIds(review)`) that resolves
  ONCE and returns `{ businessesId, profileId, ownerUserId }`. Refactor steps to consume it
  instead of re-querying `business_profiles` in each `fetchData`. Keeps the three id-spaces
  explicit and named so a step can't accidentally use the wrong one.
- **Files:** new `hooks/useReviewBusinessIds.ts`; refactor the ~12 step components that
  currently re-query `business_profiles`.
- **Risk:** medium (touches many steps) — do as a careful, mechanical refactor with the
  full id-map from the audit as the spec. Each step's resolved value must match the audit
  table (profile-keyed tables → profileId; quarterly_reviews → businessesId; SWOT → ownerUserId).
- **Test:** regression pass through all steps as a client AND as a coach viewing a client.
- **Note:** if time is tight, 1.1 alone unblocks the workshop; 1.2 is the durable fix.

### 1.3 Fix quarter semantics for a Q1 review run before FY rollover  🔴
- **Problem:** reflect/carryover steps compute "current/previous quarter" from
  `getCurrentQuarter(yearType)` (today's calendar quarter), not from `review.quarter`.
  Example: `RocksReviewStep.tsx:71-75`. Running a **Q1 FY27** review next week (calendar =
  Q4 FY26) makes these steps review Q3 FY26 instead of Q4 FY26.
- **Decision needed (Q-A/Q-B below):** confirm the model — the review's quarter is the
  quarter being PLANNED; reflect looks at `review.quarter − 1` with **FY-year rollback**
  (Q1 FY27 → previous = Q4 FY26).
- **Fix:** make all reflect/carryover steps derive previous quarter from `review.quarter`
  (with year rollback, as the Source-3 fallback at `RocksReviewStep.tsx:156-157` already
  does), NOT from `getCurrentQuarter`. Audit every step that calls `getCurrentQuarter` /
  `getCurrentFiscalYear` and switch to review-relative quarter math.
- **Files:** `RocksReviewStep.tsx`, `QuarterlyPlanStep.tsx` (`getCurrentFiscalYear` use at
  :350), `ScorecardReviewStep.tsx` (`determinePlanYear`), and any other step using the live
  clock; shared quarter helpers in `goals/utils/quarters.ts` / `lib/utils/fiscal-year-utils.ts`.
- **Risk:** medium — date math; needs explicit tests at the FY boundary.
- **Test (critical):** create a Q1 FY27 review while system clock is in Q4 FY26; confirm
  reflect/rocks pull Q4 FY26, plan targets label Q1 FY27, dates = Jul–Sep 2026.

### 1.4 Landing-page year_type lookup  🟡
- **Problem:** `page.tsx:66` reads `business_financial_goals.year_type` by `bizId`
  (businesses.id), no profile fallback → returns nothing → defaults to FY.
- **Fix:** use the same multi-id/profile fallback as `useQuarterlyReview.ts:217-246`.
- **Risk:** trivial. **Test:** landing page shows correct default quarter/year.

---

## PHASE 2 — Workshop usability (should ship before the workshop)

### 2.1 Quarter/year selector to start a Q1 FY27 review  🟠
- **Problem:** `page.tsx` locks the new review to the detected current quarter; the only way
  to start Q1 FY27 is editing the URL `?quarter=1&year=2027`.
- **Fix:** add a small quarter+year picker (or "Plan next quarter →" action) on the landing
  page that feeds `startNewReview`. Default it sensibly given timing (see Q-A) — likely
  default to the quarter being planned (Q1 FY27) when run near quarter-end.
- **Files:** `page.tsx` (+ a small `QuarterPicker` component).
- **Risk:** low. **Test:** can start a Q1 FY27 review in two clicks; existing/in-progress
  detection still works.

### 2.2 Neutralize the legacy `/reviews/quarterly` page  🟠
- **Problem:** dead-save reflection textareas (local state, no autosave, lost on nav) and it
  writes `quarterly_snapshots`/`kpi_actuals` under a DIFFERENT key than the workshop →
  duplicate/fragmented history. Reachable via the coach viewer.
- **Evidence:** only entry point is `coach/clients/[id]/view/[...path]/page.tsx:43`
  (`'reviews/quarterly'` mapping). No other nav links found.
- **Fix:** remove the coach-view mapping line (:43) and replace the page body with a
  redirect to `/quarterly-review`. Optionally delete the route after a soak.
- **Risk:** low — confirm no client nav links (grep was clean). **Test:** old links land on
  the new module; coach viewer no longer routes there.

### 2.3 Coach facilitation notes  🟠
- **Problem:** `coach_notes` (jsonb) exists on `quarterly_reviews` and renders on the
  complete screen, but no active step captures it; the note step isn't in the flow.
- **DECISION (Q-C): notes are VISIBLE TO THE CLIENT** — a shared facilitation record, not
  coach-private.
- **Fix:** add a persistent, collapsible **Notes** panel available on every step, editable
  by coach (and client), shown in BOTH the coach and client views and on the summary page.
  Writes into `quarterly_reviews.coach_notes` (keyed by step or freeform), saved through the
  existing autosave path. No visibility gating.
- **Files:** new `components/CoachNotesPanel.tsx`; wire into `workshop/page.tsx` +
  `useQuarterlyReview` save flow; surface on `summary/[id]/page.tsx`.
- **Risk:** low–medium. **Test:** notes typed on several steps persist on resume and are
  visible to both coach and client.

---

## PHASE 3 — Substance & polish (optional this round; no Xero)

- **3.1 Scorecard pre-fill (non-Xero):** pre-populate the scorecard's KPI/metric *actuals*
  from existing data (`business_kpis.current_value`, prior `quarterly_snapshots`,
  `kpi_actuals` if present) instead of blank fields. NOTE: financial actuals (rev/GP/NP)
  still need Xero → remain manual this round. Honest limitation. (Low value until Xero.)
- **3.2 SWOT pre-population:** optionally pre-fill the new SWOT from the prior quarter
  (currently shows prior for comparison but starts blank).
- **3.3 Prework carryover:** show last quarter's prework answers for reference.
- **3.4 Annual ÷ 4 fallback warning:** make it explicit when a client has no FY27 quarterly
  targets so variance isn't silently misstated.
- **3.5 PDF / print summary:** DEFERRED this round (Q-E). Leave the stub as-is.
- **3.6 Cleanup:** remove unused/duplicate step components (PersonalCommitments,
  SessionClose, InitiativeReview(s), SprintRocks) to reduce confusion.
- **3.7 Timezone note:** quarter boundaries use local clock; ensure hosting is AU/UTC
  consistent (deployment check, no code change expected).

---

## PHASE 0 — Pre-flight data readiness (run BEFORE the workshops)

Build a read-only script/query that produces a per-client readiness table:
- has `business_financial_goals` row + **FY27 quarterly_targets** set (else scorecard uses
  annual ÷ 4),
- has `business_kpis` (else KPI screens empty even after 1.1),
- has prior-quarter rocks/initiatives (else "no previous rocks"),
- `year_type` present.
Output a simple ✅/⚠️ per client so gaps get fixed before sessions. Optional follow-up: a
"readiness" banner in the UI. **Deliverable:** `scripts/audit-quarterly-readiness.mjs`.

---

## Suggested sequencing
1. **Phase 1** (1.1 → 1.3 → 1.4 → 1.2) — correctness; 1.1+1.3 are the true blockers.
2. **Phase 2** (2.1, 2.2, 2.3) — usability.
3. **Phase 0** — run the readiness check against prod; fix client data gaps.
4. **Phase 3** — as time allows; 3.5 (PDF) likely highest value for the workshop.
5. **Dry run** — full workshop as a coach for 1 test client at Q1 FY27 before go-live.

## Testing strategy
- Unit tests for the FY-boundary quarter math (Q1 FY27 → prev Q4 FY26).
- Manual dry-run checklist: start Q1 FY27 review → each step loads correct data (KPIs,
  rocks, goals, SWOT) → autosave/resume → complete → downstream sync → summary correct.
- Run as BOTH a client and a coach-viewing-client (the two id paths).
- Verify with 2–3 real clients of different shapes (e.g. Precision = 12 KPIs, Digital Bond = 1).

## Rollout & rollback
- Code changes ship via PR/branch (no prod DB migrations expected in Phases 1–3, except
  possibly none). Per project rules: never blind `db push`; push only to
  wisdom-business-intelligence.
- Each phase independently revertable; 1.1 is a one-line, low-risk hotfix that can ship alone.

## Decisions (from Matt, 2026-06-11)
- **Q-A (timing):** ✅ Running BEFORE 1 Jul (during Q4 FY26), planning Q1 FY27 → **1.3 is
  required** (review-relative quarter math, not calendar clock).
- **Q-C (coach notes):** ✅ VISIBLE TO CLIENT — shared record, no gating (see updated 2.3).
- **Q-E (PDF):** ✅ DEFERRED this round.
- **Q-F (scorecard):** ✅ Financial actuals stay MANUAL this round (Xero deferred).
- **Q-B (selector):** assume yes — user picks the quarter being planned (Q1 FY27); reflect
  auto-targets the prior quarter.

- **Q-D (legacy `/reviews/quarterly`):** ✅ REMOVE — redirect → `/quarterly-review` and
  remove the coach-viewer mapping (`view/[...path]:43`). It is the OLD single-page quarterly
  review (Initiatives Progress / KPI Actuals / Reflections + "Complete Quarter"), superseded
  by the 14-step workshop.

## All decisions locked — plan ready to execute (Phase 1 first).

---

# REVISED APPROACH (confirmed 2026-06-11) — supersedes 1.3 and 2.1

During implementation we confirmed the real usage and re-anchored the model. **This
section overrides the original 1.3 (review-relative math) and 2.1 (selector).**

## Confirmed usage
- A quarterly review is run in a **~45-day window** around quarter-end and routinely
  happens AFTER the FY rolls over (1 Jul). For this cycle: review **Q4 FY26**, plan
  **Q1 FY27**, with sessions spanning ~late-Jun → mid-Aug 2026.
- The current tool derives "which quarter" from **today's date**, so the same session
  plans Q1 FY27 in June but Q2 FY27 in July — wrong. Must be fixed.
- Both **coach AND client** must be able to start/continue the review at any point in the
  window — no role gating, no date lockout.

## Decisions
- **Anchor = the quarter being PLANNED.** `review.quarter / review.year` = **Q1 FY27**.
- Reflect steps operate on the PREVIOUS quarter = `getPreviousQuarterOf(review.quarter,
  review.year)` = Q4 FY26. Plan steps operate on `review.quarter` = Q1 FY27.
- **No calendar/`getCurrentQuarter`/`isNextQuarter` for quarter determination** anywhere in
  the workshop steps — everything derives from the review. Result: identical, correct
  behaviour whether run 20 Jun, 10 Jul, or 5 Aug.
- **Availability:** the Q1 FY27 planning review is startable/continuable by coach and client
  with no hard date cutoff (the ~45 days is the practical window, not a lock).

## Work items (replaces 1.3/2.1)
1. **Quarter helpers** (`types/index.ts`): add pure `getPreviousQuarterOf(q,y)` and
   `getNextQuarterOf(q,y)` (FY-year rollover on Q1/Q4).
2. **Reflect steps → previous quarter** (Q4 FY26):
   - `ScorecardReviewStep`: score `getPreviousQuarterOf(review.*)` (currently scores
     `review.quarter`); planYear/date-range from that previous quarter.
   - `RocksReviewStep`: review previous quarter's rocks via `getPreviousQuarterOf` (replace
     the `getCurrentQuarter` logic; step_type key = `q${prev.quarter}` = `q4`).
3. **Plan steps → review.quarter** (Q1 FY27):
   - `QuarterlyPlanStep`: planYear/quarter from `review.year/quarter` (replace
     `getCurrentFiscalYear`).
   - `QuarterlyRocksStep`: sprint quarter = `review.quarter` (replace `isCurrent/isNextQuarter`
     calendar lookup); new rocks `step_type = q${review.quarter}` = `q1`.
   - `ConfidenceRealignmentStep`: YTD/quarter position derived from `review.*` (replace
     `getCurrentQuarter`). Needs care — verify YTD math in dry-run.
4. **Start/continue the correct review** (`page.tsx`): default new review to the quarter
   being PLANNED with a small "which quarter are you planning?" selector (default Q1 FY27);
   available to coach and client. Existing in-progress reviews continue correctly.
5. **Labels:** reviews read "Q1 FY27" (planned quarter) — confirm `getQuarterLabel` and step
   subtitles reflect plan-quarter vs review-quarter correctly.

## Risk & validation (mandatory before client use)
- This re-anchors most of the module's quarter logic → **higher-touch change.**
- **Unit tests** for the FY-boundary helpers (prev of Q1 FY27 = Q4 FY26; next of Q4 FY26 =
  Q1 FY27).
- **Live dry-run with Matt** driving a test client through review-Q4 / plan-Q1 with the
  clock simulated as July — confirm every step reads correctly — BEFORE any real session.
- Note: existing demo/in-progress reviews may re-interpret under the new anchor; verify they
  still render acceptably (data is mostly test data).

## Status
- ✅ 1.1 (KPI fix) and 1.4 (year_type id fix) implemented on branch
  `feat/quarterly-review-10-10`.
- ⏭️ Next: implement items 1–5 above, then 2.2 (remove legacy), 2.3 (notes), Phase 0
  (readiness), then the dry-run.
