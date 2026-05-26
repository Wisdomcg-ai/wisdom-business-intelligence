---
phase: 57-subscriptions-flow-restructure
plan: 00
type: execute
wave: 0
depends_on: []
files_modified: []
autonomous: false
requirements: [SUBS-01, SUBS-02, SUBS-03, SUBS-04, SUBS-05, SUBS-06, SUBS-07, SUBS-08, SUBS-09]
must_haves:
  truths:
    - "Wizard step 5 is Subscriptions, step 6 is OpEx (swap is live in WIZARD_STEPS, renderStep, descriptions, YearTabs)"
    - "Step 5 subscription totals feed forecast P&L: summary.year{N}.subscriptions reflects Σ(active vendor monthly × 12) with Y2/Y3 grown by defaultOpExIncreasePct"
    - "Step 6 OpEx accountCodes covered by Step 5 contribute zero to summary.opex (no double-count)"
    - "BudgetFramework displays Revenue − COGS − Team − Subscriptions − Profit = Available OpEx with Subscriptions as an explicit line"
    - "Top-bar StepBar is clickable for any step ≤ maxVisitedStep (forward and backward); flush-saves before jumping"
    - "JDS forecast walks new flow with Y1 net profit unchanged from pre-Phase-57 baseline (modulo explainable rounding)"
    - "Excel Subscriptions tab reads from state.subscriptions and produces a non-empty tab"
    - "AI narrative step labels match the new ordering (no '**Step 5: Operating Expenses**' or '**Step 8: Final Review**')"
    - "buildAssumptions populates forecast_assumptions.subscriptions snapshot at save time"
  artifacts:
    - path: "src/app/finances/forecast/components/wizard-v4/types.ts"
      provides: "WIZARD_STEPS swapped, accountCode added to OpExLine, subscriptions field added to ForecastWizardState, YearlySummary.subscriptions added"
    - path: "src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts"
      provides: "WIZARD_VERSION 11 + soft migration, summary subscriptions computation, OpEx exclusion by accountCode, accountCode populated on Xero ingest, buildAssumptions snapshot, maxVisitedStep tracking"
    - path: "src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx"
      provides: "renderStep 5↔6 swap, step descriptions swapped, YearTabs gate updated to [3, 4, 6]"
    - path: "src/app/finances/forecast/components/wizard-v4/components/StepBar.tsx"
      provides: "clickable forward+backward nav using maxVisitedStep, validation icons, flush-save before jump"
    - path: "src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx"
      provides: "BudgetFramework with Subscriptions line + zero-contribution badge for covered accountCodes (Step5OpEx renders at case 6 after swap)"
    - path: "src/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions.tsx"
      provides: "Gap warning banner, flush-save-before-nav-jump (Step6Subscriptions renders at case 5 after swap)"
    - path: "src/app/finances/forecast/components/wizard-v4/components/AICFOPanel.tsx"
      provides: "Updated step labels (Step 5 Subscriptions, Step 6 OpEx, Step 9 Review)"
    - path: "src/app/finances/forecast/components/wizard-v4/components/ExcelExport.tsx"
      provides: "Subscriptions tab reads state.subscriptions, not dead isSubscription flag"
    - path: "src/app/finances/forecast/components/wizard-v4/types/assumptions.ts"
      provides: "SubscriptionAuditSummary populated by buildAssumptions"
  key_links:
    - from: "src/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions.tsx"
      to: "useForecastWizard.ts state.subscriptions"
      via: "actions.setSubscriptions on vendor edits + GET /api/subscription-budgets on mount"
      pattern: "actions\\.setSubscriptions\\("
    - from: "src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts:summary"
      to: "state.subscriptions and state.opexLines"
      via: "summary useMemo accumulator: subscriptions = Σ(active × 12 × growth^N-1); opex skips lines whose accountCode ∈ Σ(activeVendor.accountCodes)"
      pattern: "state\\.subscriptions\\.reduce|coveredAccountCodes\\.has"
    - from: "src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx (BudgetFramework)"
      to: "state.subscriptions via subscriptionsByYear prop"
      via: "Step5OpEx parent passes subscriptionsByYear={{y1, y2, y3}} into BudgetFramework"
      pattern: "subscriptionsByYear"
    - from: "src/app/finances/forecast/components/wizard-v4/components/StepBar.tsx"
      to: "state.maxVisitedStep + flushPendingSaves callback"
      via: "isClickable = step.step <= maxVisitedStep; onClick awaits flushPendingSaves before goToStep"
      pattern: "maxVisitedStep|flushPendingSaves"
---

<objective>
Phase 57 swaps wizard steps 5↔6 (Subscriptions before OpEx), wires Step 5 subscription totals into the forecast P&L rollup, prevents OpEx double-counting via accountCode-level exclusion, surfaces Subscriptions as an explicit line in BudgetFramework, makes the top-bar nav clickable across visited steps, snapshots subscriptions into forecast_assumptions, and cleans up stale step labels in the AI narrative + Excel export.

Purpose: Today Step 6 Subscriptions persists vendor budgets to `subscription_budgets` but the wizard's own P&L rollup never reads them. Operators end up double-budgeting software spend (Step 5 OpEx + Step 6 Subscriptions both count the same Xero account). Step 5 (OpEx) shows an artificially generous "Available OpEx" ceiling because Subscriptions are subtracted nowhere. After Phase 57 the operator sees Subscriptions explicitly subtracted before discretionary OpEx, and the Step 6 OpEx step zeros-out lines covered by Step 5.

Output: 16 atomic tasks across 6 ship batches. Each task has a dedicated `task-NN-*.md` file with goal, files (with line ranges), implementation notes, acceptance criteria, regression risks. Total estimated effort 5–7 working days.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/57-subscriptions-flow-restructure/CONTEXT.md
@.planning/phases/57-subscriptions-flow-restructure/RESEARCH.md

<!-- Source files repeatedly referenced. Each task file calls out its specific line ranges. -->
@src/app/finances/forecast/components/wizard-v4/types.ts
@src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts
@src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx
@src/app/finances/forecast/components/wizard-v4/components/StepBar.tsx
@src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx
@src/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions.tsx
@src/app/finances/forecast/components/wizard-v4/steps/Step8Review.tsx
@src/app/finances/forecast/components/wizard-v4/components/BudgetTracker.tsx
@src/app/finances/forecast/components/wizard-v4/components/ExcelExport.tsx
@src/app/finances/forecast/components/wizard-v4/components/AICFOPanel.tsx
</context>

## Phase requirements

| ID | Description | Owning task(s) |
|----|-------------|----------------|
| SUBS-01 | Reorder wizard: Subscriptions before OpEx | T05, T06 |
| SUBS-02 | Step 5 subscriptions feed P&L rollup | T02, T07, T08 |
| SUBS-03 | BudgetFramework subtracts subscriptions | T10 |
| SUBS-04 | OpEx step excludes accountCodes covered by Step 5 | T01, T07, T11 |
| SUBS-05 | Clickable top-bar wizard navigation | T04, T13 |
| SUBS-06 | Step migration for in-flight drafts (v10 → v11) | T03 |
| SUBS-07 | Cross-step impacts (Review waterfall, AI labels, Excel) | T08, T14, T15 |
| SUBS-08 | Snapshot subscriptions into forecast_assumptions | T09 |
| SUBS-09 | JDS end-to-end regression unchanged | T16 |

## Task table

| # | Task | Depends on | Files | Wave | Risk |
|---|------|------------|-------|------|------|
| T01 | Audit join key + add `accountCode` to `OpExLine`, populate on ingest | — | types.ts, useForecastWizard.ts | 1 | LOW |
| T02 | Add `subscriptions: VendorBudget[]` to state, load from API on mount | — | types.ts, useForecastWizard.ts, ForecastWizardV4.tsx | 1 | LOW |
| T03 | Bump `WIZARD_VERSION` 10→11, add step 5↔6 soft-migration | T01, T02 | useForecastWizard.ts | 2 | MEDIUM (data integrity) |
| T04 | Add `maxVisitedStep` to state with init/advance/migrate logic | T03 | useForecastWizard.ts, types.ts | 3 | LOW |
| T05 | Swap WIZARD_STEPS[5]↔[6] entries; update renderStep switch | T03 | types.ts, ForecastWizardV4.tsx | 3 | LOW |
| T06 | Update hardcoded step references (descriptions, YearTabs gate, programmatic goToStep callers) | T05 | ForecastWizardV4.tsx, Step8Review.tsx | 4 | LOW |
| T07 | Update summary rollup: subscriptions field + `YearlySummary.subscriptions` type field + accountCode exclusion in OpEx accumulator | T01, T02 | useForecastWizard.ts, types.ts | 2 | **HIGH (rollup math)** |
| T08 | Step8Review consumer code: waterfall + scenario base + advisor checks + checklist updates (type field already shipped in B2 with T07) | T07, T05 | Step8Review.tsx | 5 | MEDIUM |
| T09 | Populate `forecast_assumptions.subscriptions` in buildAssumptions | T07 | useForecastWizard.ts, types/assumptions.ts | 5 | LOW |
| T10 | BudgetFramework: add Subscriptions line, update header/explainer, BudgetTracker parity | T07 | Step5OpEx.tsx, BudgetTracker.tsx | 5 | MEDIUM (math regression) |
| T11 | Step 6 OpEx UI: "covered by Step 5" badge for matching accountCodes + legacy "Refresh from Xero" nudge banner | T07 | Step5OpEx.tsx | 5 | LOW |
| T12 | Step 5 Subscriptions UI: gap warning banner + flush-save-before-jump | T02 | Step6Subscriptions.tsx | 5 | LOW |
| T13 | StepBar clickable nav: maxVisitedStep + validation icons + flush-save-before-jump | T04, T12 | StepBar.tsx, ForecastWizardV4.tsx, useForecastWizard.ts | 6 | MEDIUM |
| T14 | Fix AI narrative stale step labels + content swap (AICFOPanel + AIAssistant) | T05 | AICFOPanel.tsx, AIAssistant.tsx | 6 | LOW |
| T15 | Rewrite Excel Subscriptions tab to read `state.subscriptions` | T02 | ExcelExport.tsx | 6 | LOW |
| T16 | JDS end-to-end manual walkthrough (gating QA) | All prior | — | 7 | **HIGH (gate)** |

**Note: `YearlySummary.subscriptions: number` type field ships in B2 with T07. Step8Review consumer code (waterfall + advisor) ships in B4 with T08. This split is deliberate — the type field must compile in B2 for the rollup math to land; the consumer code is independent and waits on B4 to keep the UX surface change contained.**

## Dependency graph

```
T01 ─────────┐
             ├──> T03 ──> T04 ──> T05 ──> T06 ──> T08 ─┐
T02 ─────────┤                                         ├─> T13 ─> T16
             ├──> T07 ─────────────> T09               │
             │            │                            │
             │            ├──> T10 ───────────────────┤
             │            ├──> T11 ───────────────────┤
             │            └──> T08                    │
             │                                         │
             ├──> T12 ─────────────────────────────────┤
             │                                         │
             └──> T15 ─────────────────> T14 ─────────┘
```

Wave decomposition (parallelism opportunities):
- **Wave 1:** T01, T02 (independent foundations)
- **Wave 2:** T03, T07 (T03 depends T01+T02 on integrity; T07 depends T01+T02 on data shape)
- **Wave 3:** T04, T05 (independent: state-machine vs. swap)
- **Wave 4:** T06 (depends on T05)
- **Wave 5:** T08, T09, T10, T11, T12 (all depend on T07; can run parallel; T12 also needs T02 which is wave 1)
- **Wave 6:** T13, T14, T15 (depend on T04+T12, T05, T02 respectively)
- **Wave 7:** T16 (gating manual QA)

## Recommended ship order (PR batches)

The wizard cannot ship in a half-broken state on `main`. Ship batches keep the wizard internally consistent at every commit boundary. Each batch ends with `npm run build && npm test` green; T16 gates the final merge.

**Critical restructure (post-checker fixes):** the wizard step swap (T05/T06) and the migration (T03) MUST ship in the same atomic batch to avoid a deploy window where the WIZARD_VERSION/migration is live but the actual step bindings haven't swapped yet. T07's rollup math (no-op for legacy forecasts whose `state.subscriptions === []`) ships independently in B2 to keep the math change bisectable.

| Batch | Tasks | Why this seam | PR title |
|-------|-------|---------------|----------|
| **B1 — Foundation (no UX change)** | T01, T02 | Pure additive: extend `OpExLine.accountCode` and `state.subscriptions`. Old paths still work because nothing consumes the new fields yet. Safe to deploy independently. | `feat(57-01): subscriptions integration foundation — accountCode + state.subscriptions` |
| **B2 — Rollup math + type field** | T07 (includes `YearlySummary.subscriptions: number` type addition) | T07 is no-op for legacy forecasts: existing forecasts have `state.subscriptions === []`, so `coveredAccountCodes` is empty, so OpEx accumulator behavior is identical. Subscriptions field on summary is 0. Net profit unchanged. The type field ships here so it compiles. Comprehensive unit tests. | `feat(57-02): subscription-aware rollup math (no-op for legacy forecasts) + YearlySummary.subscriptions field` |
| **B3 — Migration + step swap (atomic)** | T03, T04, T05, T06 (includes `maxVisitedStep` state) | Bump WIZARD_VERSION 10→11 with the soft-migration AT THE SAME TIME as the step component swap. This is atomic by necessity: the migration only makes sense if the steps have actually been swapped. Operators with v10 drafts get migrated on their next load and land on the right step in the new ordering. Add maxVisitedStep state machinery (consumed by B5's StepBar flag flip). | `feat(57-03): wizard v11 migration + step swap (5↔6) + maxVisitedStep state` |
| **B4 — Subscription UX** | T08 (Step8Review consumer code), T09, T10, T11, T12 | All the user-facing subscription wiring: Review waterfall + advisor checks (T08), buildAssumptions snapshot (T09), BudgetFramework subscriptions line (T10), "covered by Step 5" badges + legacy "Refresh from Xero" nudge banner (T11), Step 5 gap warning + flush-save (T12). After this PR the wizard is feature-complete for the operator. | `feat(57-04): BudgetFramework subscriptions line + covered-by-Step-5 badges + Review waterfall` |
| **B5 — Clickable nav + cleanup** | T13 (full implementation, ships with flag ON), T14, T15 | Ship StepBar's clickable behavior fully — no skeleton split. Fix AI narrative labels + swap step 5/6 narrative content. Rewrite Excel Subscriptions tab. Single seam, no soak window: maxVisitedStep was already in state since B3 so the value exists; flipping the StepBar logic is safe. | `feat(57-05): clickable top-bar nav + AI narrative content swap + Excel subscriptions tab` |
| **B6 — Gating QA** | T16 | JDS manual walkthrough; sign-off gate. No code changes if numbers match. If gaps surface, document in Phase 57.1 follow-up — do NOT block this batch on speculative cleanup. | `docs(57-06): Phase 57 ship sign-off — JDS regression OK` |

**Why no skeleton split for T13:** previous draft staged StepBar across B3 and B5 to allow a soak window. With B3 now atomic (migration + swap together), the soak window argument no longer applies — once B3 lands, the wizard is on v11 with new step ordering, and B5's clickable nav is a UX layer on top. Shipping T13 fully in B5 reduces the file-touched count from 2 to 1 and removes the "feature flag flip" follow-up commit.

**Risk window between B3 and B5:** between B3 (step swap live) and B5 (AI narrative fixed), the AI panel will reference wrong step labels for that deploy window. Mitigation: deploy B3+B4+B5 together if possible, or accept the 1–2-day operator-visible UX bug in the AI panel. R9 below tracks this.

**Total PRs:** 6. **Total atomic commits:** 16 (one per task). **Estimated reviewer time:** ~45 min/batch for batches 2–4, ~20 min for 1, 5, 6.

## Risk register

| # | Risk | Probability | Severity | Mitigation | Owning task |
|---|------|-------------|----------|------------|-------------|
| R1 | Step renumber breaks in-flight v10 drafts | HIGH | LOW (mitigated) | Soft-migration block + WIZARD_VERSION bump + unit test fixture | T03 |
| R2 | Double-count regression on existing forecasts (was "OpEx + Subscriptions both counted"); after Phase 57 the swap moves spend between buckets so totals must match | MEDIUM | **HIGH** | Snapshot pre-Phase-57 net profit on JDS Y1; verify post deploy delta is zero or explainable depreciation/rounding only | T07, T16 |
| R3 | New Step 5 navigates away before subscription auto-save fires | MEDIUM | LOW | flushPendingSaves() called synchronously inside goToStep before currentStep mutation | T12, T13 |
| R4 | Clickable nav lets operator skip required Step 1 setup | LOW | MEDIUM | maxVisitedStep init=1; Step 1 unblocks Step 2 by advancing maxVisitedStep on nextStep | T04, T13 |
| R5 | BudgetTracker drifts from BudgetFramework formula (different file, same ceiling math) | LOW | MEDIUM | Update BudgetTracker.tsx:105 in same task as BudgetFramework | T10 |
| R6 | accountCode missing on legacy OpExLine entries (drafts from before Phase 57) — silent double-count for legacy forecasts because exclusion can't match without a code | **HIGH** | **HIGH** | T03 sets `parsed.needsAccountCodeRefresh = true` on v10→v11 migration when any opexLine has `accountCode === undefined && accountId !== undefined`. T11 renders a yellow banner at the top of the Step 6 OpEx table prompting operator to "Refresh from Xero" — clicking re-ingests `/api/Xero/chart-of-accounts` and re-classifies opexLines with populated `accountCode`. Until refresh, T07 rollup uses ONLY `coveredAccountCodes` matching (no name fallback) — accept silent double-count for legacy unrefreshed forecasts as documented behavior; the banner is the mitigation. | T01, T03, T07, T11 |
| R7 | `defaultOpExIncreasePct` for subscription Y2/Y3 may underestimate SaaS inflation | LOW | LOW (accept) | Per CONTEXT.md locked decision — no per-vendor Y2/Y3 in this phase. Operator can override `defaultOpExIncreasePct`. Phase 58+ if real complaint. | T07 |
| R8 | Excel export Subscriptions tab still empty after T15 if state.subscriptions hasn't loaded yet | LOW | LOW | T15 reads from `state.subscriptions ?? []`; empty array produces "No subscriptions configured" placeholder text not an empty grid | T15 |
| R9 | Deploy window between B3 (step swap live, AI labels stale) and B5 (AI labels fixed) — operators see "Step 5: Operating Expenses" while looking at the Subscriptions step | MEDIUM | LOW | Deploy B3+B4+B5 together where possible. If staged, accept 1–2-day cosmetic UX bug. T14 acceptance criteria explicitly verify content swap (not just label swap). | T14 |
| R10 | JDS baseline script (`jds-baseline-pre-phase-57.json`) doesn't exist or doesn't capture forecast P&L — regression check has nothing to compare against | MEDIUM | **HIGH** | Before B1 PR opens, owner (Matt) runs `grep -i 'forecast\|net.profit\|y1.*np' scripts/verify-production-migration.ts`. If existing script doesn't output forecast P&L, write `scripts/snapshot-forecast-baseline.ts` to load JDS forecast and emit Y1 NP, Y1 OpEx total, Y1 subscription_budgets sum, Y2 NP, Y3 NP. Save baseline output and commit it. If `jds-baseline-pre-phase-57.json` is not committed at B1 review, BLOCK B1 merge. | T16 |

## Goal-backward verification (against CONTEXT.md acceptance criteria)

CONTEXT.md (lines 57-62) lists 5 acceptance criteria + the 9 prompt-stated phase-goal items. Mapping each to a task:

| AC | Statement | Task(s) delivering |
|----|-----------|--------------------|
| AC1 | Existing forecasts load and walk through new step order without data loss (soft migration) | T03 (migration) + T16 (QA verifies) |
| AC2 | Net profit math unchanged on existing forecasts | T07 (exclusion logic prevents double-count) + T16 (verifies on JDS) |
| AC3 | Subscription account double-counting impossible | T01 (accountCode field) + T07 (exclusion) + T11 (visible badge + legacy nudge) |
| AC4 | Top-bar nav: jump forward/back to any visited step, no data loss | T04 (maxVisitedStep) + T13 (StepBar UI + flush-save) |
| AC5 | JDS end-to-end walkthrough passes | T16 |
| Prompt-1 | Wizard step 5↔6 swap is live | T05 + T06 |
| Prompt-2 | Step 5 subscriptions feed P&L rollup | T02 + T07 |
| Prompt-3 | Step 6 OpEx excludes Step-5 accountCodes | T01 + T07 + T11 |
| Prompt-4 | BudgetFramework displays Team + Subscriptions + Available OpEx | T10 |
| Prompt-5 | Top-bar nav clickable | T04 + T13 |
| Prompt-6 | JDS unchanged P&L | T16 |
| Prompt-7 | Excel Subscriptions tab rewritten | T15 |
| Prompt-8 | AI narrative stale labels fixed | T14 |
| Prompt-9 | forecast_assumptions.subscriptions populated at save | T09 |

Every acceptance criterion has at least one owning task. No gap.

## Effort estimate

| Wave | Days | Notes |
|------|------|-------|
| Wave 1 (T01, T02) | 0.75 | T01 = 0.5d (audit + ingest population), T02 = 0.75d (state + load wiring) |
| Wave 2 (T03, T07) | 1.5 | T03 = 0.5d (migration + tests), T07 = 1.0d (rollup math + tests, highest care) |
| Wave 3 (T04, T05) | 0.75 | T04 = 0.25d, T05 = 0.5d |
| Wave 4 (T06) | 0.5 | Mechanical edits across grep-found references |
| Wave 5 (T08-T12) | 1.75 | T08 = 0.5d, T09 = 0.5d, T10 = 0.75d, T11 = 0.5d, T12 = 0.5d (parallelizable; serial = ~2.75d) |
| Wave 6 (T13, T14, T15) | 1.0 | T13 = 0.75d, T14 = 0.25d, T15 = 0.5d |
| Wave 7 (T16) | 0.5 | Manual QA + variance investigation if needed |
| **Total (serial)** | **~7 days** | |
| **Total (parallel)** | **~5 days** | If waves 5+6 are interleaved |

Add 1 day cushion for review feedback and integration debugging → **6 working days realistic**.

## Verification (overall phase)

- [ ] `npm run build` clean (zero new tsc errors over Phase 56 baseline of 16)
- [ ] `npm test -- forecast` passes including 4 new Phase 57 tests (renumber-migration, subscription-rollup, double-count-prevention, clickable-nav)
- [ ] JDS Y1 net profit matches pre-Phase-57 baseline (snapshot before B1 deploy — see R10)
- [ ] Subscription detail report (`/api/monthly-report/subscription-detail`) returns same vendor list before and after
- [ ] No `console.error` on opening a v10 localStorage draft
- [ ] StepBar clickable on visited steps, disabled on unvisited (verified manually post B5)
- [ ] Excel export Subscriptions tab shows real vendor data, not empty (verified manually post B5)

## Success criteria

Phase 57 is complete when:
1. All 16 tasks shipped to `main` via 6 PR batches
2. JDS forecast walks the new flow with no operator-visible regressions (T16 sign-off)
3. ROADMAP.md Phase 57 entry marked `[COMPLETE]`
4. Phase 57 SUMMARY.md written with: actual vs estimated effort, JDS Y1 net-profit delta (target zero), any deferred items moved to Phase 58 backlog

## Output

After completion, create `.planning/phases/57-subscriptions-flow-restructure/57-SUMMARY.md` capturing:
- Tasks shipped + commit SHAs
- JDS regression numbers (Y1 net profit before/after, subscription total before/after)
- Soft-migration log: how many v10 drafts were observed in production, any errors
- Deferred items for Phase 58 (per-vendor Y2/Y3, subscription scenario overlays, isSubscription flag deletion)
