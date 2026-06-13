# Annual Reset (full 12-month plan reset) — Design

**Status:** v1 SHIPPED (landing-CTA entry, #290) + AEST timezone fix (#291). **Entry redesigned 2026-06-14 — see the REVISION section below (LOCKED, approved for build).** The original "Entry logic" and "no reflection phase" decisions are SUPERSEDED by that revision.
**Context:** After a client finishes their plan year (e.g. FY26), they need to set a fresh
annual plan for the next year (FY27) — annual goals + quarterly targets + initiatives —
client-led, mirroring the existing Goals & Targets flow. Origin: 2026-06-12 review of the
quarterly-review module (the bolted-on annual steps were a worse-wired duplicate of the
Goals & Targets flow, and the entry was gated to the wrong quarter).

## Agreed model (confirmed with Matt)
1. **Reuse** the existing Goals & Targets wizard (`/goals`) as the planning engine — do NOT
   maintain the review's separate `NextYearTargets` / `AnnualInitiativePlan` steps.
2. **History:** snapshot the ending year's full plan BEFORE the reset overwrites it.
3. **Year 1 = the new year** on reset (FY27); Year 2 / Year 3 shift forward.
4. **Entry is data-driven** off the client's plan dates (`year1_end_date`), not the calendar —
   so clients who already planned FY27 (started May/June) are NOT forced to reset.

---

## REVISION — 2026-06-14: entry moves INTO the quarterly review at Part 4 (system-decided)

**Supersedes the "Entry logic" section below and the "no separate reflection phase" decision.**
Origin: after shipping the landing-CTA version (#290) and the AEST timezone fix (#291), Matt refined
the design. The reset trigger should NOT sit at the beginning (a landing pre-gate); it sits at the
**planning stage of the quarterly review — step 4.1 ("Annual Plan & Confidence")** — and the
**SYSTEM, not the client, decides** to reset.

### Why
- **Reflect before re-plan.** The review is Reflect (P1) → Analyse (P2) → Strategic Review (P3) →
  Plan (P4). A landing pre-gate makes a year-end client skip straight to "set new goals" before
  reflecting on the year. Putting the reset at P4 keeps reflection first.
- **Restores the year-end reflection we removed.** 73-05 deleted the bolted-on "Year in Review"
  step. Moving the reset to P4 gives that reflection back via the review's own P1–P3 — WITHOUT
  re-bolting annual steps onto the workshop (the goals wizard stays the only planning UI).
- **4.1 is already the annual-plan touchpoint.** 4.1 is literally "Annual Plan & Confidence"
  (`ConfidenceRealignmentStep`): each quarter the client reviews/realigns their annual plan. A
  year-end reset is the extreme form of that realignment.
- **The system decides, not the client.** Target users are "not numbers people" — they should not
  choose whether to reset. Detection is data-driven off `year1_end_date`.

### New entry + flow (LOCKED)
- **Landing: no annual-reset awareness.** Remove the data-driven CTA + detection from
  `/quarterly-review`. The client starts a normal quarterly review like any quarter — no choice.
- **Parts 1–3:** normal reflect/analyse/strategise (this IS the year-end reflection).
- **Part 3 → Part 4 boundary (entering 4.1):** the system checks `year1_end_date` vs the
  planning-quarter start (TZ-safe — `toUtcDateOnly` + `detectAnnualResetState`, per #291):
  - **needs-reset (year-end):** AUTOMATICALLY perform the rollover (snapshot → roll) and route into
    the goals wizard (`/goals?reset=annual`), prepopulated with the rolled FY plan. No "reset?"
    prompt — the client just proceeds into "let's set FY27." Mark the quarterly review **COMPLETE**
    on handoff. **4.2 (Quarterly Plan) and 4.3 (Quarterly Rocks) are skipped** — the goals wizard
    already sets the new annual plan + Q1 targets + carried-forward initiatives.
  - **normal-review:** unchanged — proceed to the existing 4.1 and on through 4.2/4.3.
- **Safety:** fire the auto-reset on *progressing into* Part 4 (a deliberate forward step), not on
  merely viewing it — so a coach browsing a year-end client never trips an accidental rollover.
  Every reset stays reversible via the `annual_reset_FY<yr>` snapshot.

### Reused verbatim (only the entry point moves)
Snapshot service, `executeAnnualReset` (D3 ladder, rolled dates, cleared quarterly_targets,
carry-forward initiatives), the `/goals?reset=annual` hook, and the TZ-safe detection (#291). Only
the ENTRY POINT moves (landing → P4 boundary) and becomes automatic.

### Consequence to respect
With no confirmation step, detection reliability is safety-critical — a wrong `year1_end_date` would
auto-mutate. Mitigated by data-driven + TZ-correct detection (#291) and snapshot reversibility. This
is why the change needs a **Precision dry-run** before going live.

## BUILD PLAN — 2026-06-14 (entry relocation)

- **B-1 — Surface `year1_end_date` in the workshop.** `useQuarterlyReview` already queries
  `business_financial_goals`; expose `year1EndDate: Date | null | undefined` (UTC-parsed) from the
  hook (mirror the landing's load). The workshop has `review.quarter/year` for the planning quarter.
- **B-2 — Year-end gate at the 3.2 → 4.1 transition (`workshop/page.tsx` `handleNext`).** Compute
  `planningQuarterStart = toUtcDateOnly(calculateQuarters(yearType, review.year).find(q1).startDate)`;
  `detectAnnualResetState({ planningQuarterStart, year1EndDate })`. If `needs-reset`: mark the review
  complete (reuse the hook's complete path) → `router.push(getPath('/goals?reset=annual'))`. Else:
  advance to 4.1 normally. Fire once, on the forward transition only.
- **B-3 — Remove landing detection/CTA (`quarterly-review/page.tsx`).** Delete `resetState` /
  `planningQuarterStart` / `year1EndDate` / the "Set your {FY} Annual Plan" CTA + the
  `setYear1EndDate` load. Landing = normal "Start Q{n} Review" + "Adjust annual plan" link only.
- **B-4 — Verify coach context + RLS for the routed reset.** Ensure `/goals?reset=annual` operates
  on the client (`activeBusiness` = the client in a coach-led review) and the writer (super_admin,
  the assigned coach, or the client) satisfies the `business_financial_goals` / `plan_snapshots` RLS
  (policies verified 2026-06-14). Pass an explicit client id on the route if `activeBusiness` is not
  reliably the client.
- **B-5 — Tests.** Unit: the year-end gate decision (AEST + UTC) at 3.2→4.1 → routes vs not.
  Integration: year-end review → reset fires once + review marked complete; normal review → 4.1
  unchanged + 4.2/4.3 reached. Keep all existing annual-reset service/integration/tz tests. Run the
  full suite under `TZ=Australia/Sydney`.
- **B-6 — Precision dry-run** (client-facing): a year-end client routes into the reset from P4 and
  rolls; an already-planned client (Armstrong/Fit2Shine) proceeds through normal 4.1–4.3 untouched.
  Then ship.

---

## Why data-driven entry (the May/June problem)
Verified in prod — `business_financial_goals.year1_end_date` per active client:
- **Year 1 ends 30 Jun 2026 (FY26) → needs FY27 reset:** ABC, Digital Bond, Distinct
  Directions, Efficient Living, Envisage, Espresso, First Logistics, Just Digital Signage,
  Precision, Sydney Pressed Metal (10).
- **Year 1 ends 29 Jun 2027 (FY27) → already planned, NO reset:** Armstrong, Fit2Shine.
- **Oh Nine (CY):** Year 1 ends 31 Dec 2026 → no reset until end of CY2026.
- **JVJ:** no plan dates → initial setup, not a reset.

The reset is therefore **per-client**, anchored to when their own plan year ends — which also
makes the 1 July boundary irrelevant (reading plan dates, not today's date).

## Entry logic
On the quarterly-review landing (client- and coach-visible), for the quarter being planned
(`planningQuarter` with its start date), read `business_financial_goals` plan dates:

- **No goals row / no plan dates** → **"Set up your Annual Plan"** (initial Goals & Targets
  run; nothing to snapshot).
- **planningQuarter start > `year1_end_date`** (current Year 1 has ended; plan no longer
  covers the new quarter) → **"Set your {FY} Annual Plan"** (the RESET: reflect → snapshot →
  Goals & Targets for the new year).
- **planningQuarter within current Year 1** → **"Start your Q{n} Review"** (normal quarterly
  review inside the existing plan); optional secondary **"Adjust annual plan"** link.

Edge cases to confirm in design: a client mid-way who wants to reset early; a plan whose Year 1
is longer/shorter than 12 months (Phase-42 plan periods can be extended). The `year1_end_date`
comparison handles both because it's an explicit date.

## The reset flow (decisions locked 2026-06-12)
**Decisions:** route into the existing `/goals` wizard (D2); prepopulate new Year 1 from prior
Year 2 (D3); **goals wizard ONLY — no reflection / year-in-review / vision & values steps (D1).**

So the reset is lean: **detect → snapshot → goals wizard (rollover mode).** There is no
separate reflection phase; the goals wizard's own current-vs-Year1/2/3 structure is the plan.

**Step 1 — Snapshot the ending year (history).** Before any overwrite, capture the full FY26
plan (financial ladder, `quarterly_targets`, KPIs, initiatives) as a point-in-time record.
**Reuse `plan_snapshots`** (tag e.g. `annual_reset_fy2026`). Gives year-over-year comparison.

**Step 2 — Roll the plan forward and route into `/goals`.** Update
`business_financial_goals` for the new year, then send the client into the Goals & Targets
wizard to confirm/adjust and set Q1–Q4 targets + initiatives:
- **Ladder rollover:** new Year 1 = FY27 (prepopulated from prior Year 2), Year 2 = FY28
  (prepopulated from prior Year 3), Year 3 = FY29 (blank/extrapolated). `*_current` set from
  the prior plan's Year-1 (the year just finished) as the new baseline.
- **Plan dates rollover:** `plan_start_date` = FY27 start, `year1_end_date` = FY27 end,
  `plan_end_date` = +3 years.
- **Quarterly targets:** reset for the new year (blank or even-split from new Year 1 — confirm
  in build); the client sets them in the wizard's Annual Plan step.
- **Initiatives:** carry forward incomplete initiatives as candidates for the new year
  (confirm in build) vs start fresh.

## Reuse map (from the Goals & Targets audit)
- Engine/services: `goals/services/financial-service.ts` (save/load goals),
  `goals/services/kpi-service.ts`, `goals/services/strategic-planning-service.ts`,
  `goals/hooks/useStrategicPlanning.ts`.
- UI: the `/goals` wizard steps — `Step1GoalsAndKPIs`, `Step4AnnualPlan` (quarterly-targets
  editor), plus `goals/utils/quarters.ts`, `goals/utils/formatting.ts`.
- Snapshot: `plan_snapshots` + `planSnapshotService`.

## What gets replaced / deprecated
Per D1 (goals wizard only), the entire `review_type='annual'` path is retired:
- `NextYearTargetsStep`, `AnnualInitiativePlanStep`, `YearInReviewStep`, `VisionStrategyStep`
  → **removed from the flow** (the goals wizard replaces all of them).
- The Q4-gated "Start Annual Review" button → **replaced** by the data-driven entry.
- Keep the `quarterly_reviews` annual jsonb columns for now (historical data); just stop
  routing into those steps.

## Decisions locked (D1–D3)
- **D1:** Goals wizard ONLY — no reflection / year-in-review / vision & values.
- **D2:** Route the client into the existing `/goals` wizard (no embed).
- **D3:** Prepopulate new Year 1 from prior Year 2.

## Implementation plan (build order — for approval, not yet started)
1. **Snapshot service:** capture the current full plan (goals ladder + quarterly_targets +
   KPIs + initiatives) into `plan_snapshots` tagged `annual_reset_<endingFY>` before any
   overwrite. (Reuse `planSnapshotService`/`financial-service`.)
2. **Rollover action (goals module):** a "start new plan year" operation that snapshots, shifts
   the ladder + plan dates forward (D3 prepopulation), resets quarterly_targets, and carries
   incomplete initiatives forward as candidates. Lands in `business_financial_goals` /
   `business_kpis` / `strategic_initiatives`.
3. **Entry detection + prompt:** on the quarterly-review landing (client- and coach-visible),
   compare `planningQuarter` start to `year1_end_date` → route to `/goals` rollover mode, vs
   normal quarterly review, vs initial setup. (Possibly also surface on the dashboard/goals
   page.)
4. **Retire the review's annual path:** remove the annual steps + Q4-gated button (keep columns).
5. **Tests:** rollover math (ladder shift, plan-date roll, FY + CY); entry detection for the
   three states (needs-reset / already-planned / no-plan) incl. Armstrong/Fit2Shine (already
   FY27) and the 10 FY26 clients; snapshot integrity (FY26 recoverable after reset).
6. **Dry-run with Matt** on one test client (needs-reset and already-planned) before any real
   session.

## Build-time confirmations (LOCKED 2026-06-12)
- **Quarterly targets on reset:** follow the **same pattern the goals wizard already uses**
  (`Step4AnnualPlan` — manual per-quarter with even-split-from-annual). Do NOT invent new
  behaviour; reuse the wizard's editor and defaults as-is.
- **Initiatives on reset:** **carry incomplete forward** as candidates (client keeps/drops);
  not wiped, not auto-committed.
- `*_current` baseline: set from the prior plan's Year-1 figures.

## Approval
All model + design + build-time decisions are locked. Awaiting Matt's explicit go to start
building (per "no changes until approved").

## Risks & sequencing
- This is a **new phase** of work, larger than the quarterly fixes already shipped. It touches
  the goals module + the review entry, and changes a client-facing flow → needs a dry-run.
- Snapshot-before-overwrite is the critical safety step (don't lose FY26 history).
- Sequence: entry detection → snapshot → handoff to goals (rollover) → deprecate review annual
  steps → test (client + coach, FY and CY, already-planned vs needs-reset).
- Build behind confirmation; verify with one test client before any real session.

## Not in scope here
- The already-shipped quarterly re-anchoring (separate, merged).
- Xero scorecard actuals (still deferred).
