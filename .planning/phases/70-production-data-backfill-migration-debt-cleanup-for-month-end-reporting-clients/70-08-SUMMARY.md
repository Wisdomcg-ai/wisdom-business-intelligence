---
phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
plan: 08
subsystem: phase-70-verification
tags: [verification, audit-rerun, before-after, framing-mismatch, read-only]

# Dependency graph
requires:
  - phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
    plan: 02
    provides: 70-02-SUMMARY recording the D1 framing mismatch (multi-active counts business-cardinality not unique-key-cardinality) — re-asserted in 70-08
  - phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
    plan: 03
    provides: 70-03-SUMMARY recording the 2 payroll-summary upserts now empirically visible in 70-08's re-run for Envisage Australia FY26
  - phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
    plan: 04
    provides: 70-04-SUMMARY recording the D3 framing mismatch (89 phantom rows) + 2 real candidates resolved — re-asserted in 70-08
  - phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
    plan: 05
    provides: 70-05-SUMMARY recording Envisage subs cleanup (44 → 43, 36 with codes) — re-asserted in 70-08
  - phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
    plan: 06
    provides: 70-06-SUMMARY recording the JDS deferral — re-asserted in 70-08
  - phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
    plan: 07
    provides: 70-07-SUMMARY recording the IICT deferral + 3 build-time deviations (D1 enum, D2 UI-not-curl, D3 already-no-op) — D1 cross-referenced in 70-08
provides:
  - 70-08-audit-comparison.md (238 lines) — the phase's "done check" document
  - Empirical verification (per-dimension per-client) that 70-02/03/04/05 backfill effects landed correctly
  - Explicit list of 4 audit-script fixes for the next ops touch-up
  - Phase 70 overall acceptance verdict: COMPLETE-WITH-DEFERRALS (cross-client gates MET; JDS + IICT deferred-by-design to coach sessions)
affects: [70-09-cron-heartbeat-verification, 71-code-fixes-phase, future-iict-coach-session, future-jds-coach-session]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verification-only plan pattern: re-runs an unmodified audit script as the phase's 'done check', writes a comparison doc against the original baseline, and surfaces framing mismatches as deliverables (not just side-effects)"
    - "Read-only plan: zero production data touched. Only artifacts are the comparison doc + this SUMMARY + STATE/ROADMAP updates"
    - "Audit-script-as-source-of-truth pattern: the script that produced the baseline is the same script re-run for the comparison; modifying it would invalidate the diff, so framing mismatches are documented as recommended fixes (TODO) rather than applied in-plan"

key-files:
  created:
    - .planning/phases/70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients/70-08-audit-comparison.md
    - .planning/phases/70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients/70-08-SUMMARY.md
  modified:
    - .planning/STATE.md
    - .planning/ROADMAP.md
  artifacts-captured:
    - /tmp/70-08-audit-after.txt (152 lines, audit re-run stdout — referenced in comparison doc but not git-tracked)

key-decisions:
  - "DO NOT MODIFY THE AUDIT SCRIPT (Matt invariant, locked in plan): scripts/phase-70-data-audit.mjs must be byte-identical between the 2026-05-30 baseline run and the 2026-05-31 re-run, otherwise the before/after comparison loses meaning. Therefore the 4 audit-script framing/display fixes (renewal_month filter, multi-active grouping, JSONB summary printer, consolidation_budget_mode enum literal) are recorded as RECOMMENDED FIXES + TODOs in the comparison doc, not applied here."
  - "PHASE 70 ACCEPTANCE = COMPLETE-WITH-DEFERRALS: cross-client gates D1/D2/D3 all CLOSED on the data side; Envisage at partial-substantial; JDS + IICT deferred-by-design via 70-06 + 70-07 to a focused coach session. The CONTEXT.md acceptance threshold ('IICT at minimum partial on identity, subs, snapshots') is NOT MET unconditionally — but the explicit defer (with committed scripts + future to-do at orchestrator level) is the agreed operational acceptance."
  - "FRAMING MISMATCH IS A FIRST-CLASS DELIVERABLE (not just a side-effect): the 3 mismatches surfaced by 70-02/04/07 + the JSONB display bug are documented at the same priority as the data backfill outcomes themselves. These are reusable signal for whoever next maintains the audit script + downstream audits."
  - "Re-emitted '⚠ multiple active forecasts' + '⚠ 47/47 NULL renewal_month' warnings in the re-run are EXPECTED, not regressions. The underlying data is now correct; the warnings persist because the audit script's framing was wrong from the start. The comparison doc carefully separates 'warning re-emitted' from 'data still broken' for every audit line."
  - "PARALLEL EXECUTION (70-08 + 70-09 wave 4): scripts/70-09-C2-cron-heartbeat-check.mjs + .planning/phases/70-.../70-09-cron-health-report.md were already untracked at plan start (70-09 sibling run was in progress in a separate executor thread). 70-08 did NOT touch those files. Final commit uses --no-verify per the parallel directive to avoid pre-commit hook contention."

patterns-established:
  - "When a verification plan re-runs an audit script and discovers framing mismatches with the audit's own claims, document them with sentinel lines (recommended replacements) so the next ops touch-up can apply them without re-deriving the mismatch. The recommended fixes block in 70-08 lists 4 such fixes with current/recommended/why for each."
  - "'COMPLETE-WITH-DEFERRALS' is a legitimate phase-acceptance verdict when the deferrals are (a) documented in per-plan SUMMARYs, (b) backed by committed-but-uninvoked scripts, (c) have orchestrator-level future to-dos, and (d) do not block downstream work (in 70's case, code-fixes phase 71)."

# Metrics
metrics:
  duration: ~25 minutes total (audit re-run ~2 min + read 7 SUMMARYs + 70-CONTEXT + original audit doc + write comparison doc + write this SUMMARY + commit)
  tasks: 1 (single auto task — re-run + write comparison)
  files: 2 created (comparison doc + this SUMMARY) + 0 production data writes + 2 modified (STATE + ROADMAP)
  completed: 2026-05-31
  audit-rerun-exit-code: 0
  audit-rerun-line-count: 152
  comparison-doc-line-count: 238
  framing-mismatches-documented: 4 (D1 multi-active, D3 renewal NULL filter, JSONB display bug, wrong enum literal)
  audit-script-fixes-recommended: 4 (all TODO — not applied in plan)
  clients-graded: 3 (Envisage / JDS / IICT)
  per-client-dimensions-compared: 6 each (identity / xero / forecasts / subs / snapshots / anomalies)
  cross-client-checks-verified: 3 (D1 / D2 / D3 all CLOSED)
---

# Phase 70 Plan 08: Audit Comparison Summary

Phase 70's "done check" — re-ran `scripts/phase-70-data-audit.mjs` against current live state, compared output against the original 2026-05-30 baseline (`docs/phase-70-month-end-audit.md`), and produced a 238-line comparison document with per-client deltas + cross-client check verdicts + 4 audit framing mismatches surfaced + 4 recommended audit-script fixes. **Zero production data touched.** All cross-client gates CLOSED; per-client B2 + B3 explicitly deferred per 70-06 + 70-07 (coach session route).

## Per-client verdict (audit re-run)

| Client | Before (2026-05-30) | After (2026-05-31) | Routing |
|---|---|---|---|
| **Envisage** | partial | **partial-substantial** | Code-fixes phase 71 picks up the residuals (D4, B1-B3, S1-S6) + Phase 69 owns D5 |
| **JDS** | broken | **partial (deferred-by-design)** | Future JDS-focused coach session rebuilds FY26 + flips `profile_completed` atomically |
| **IICT** | broken | **broken-as-expected (deferred-by-design)** | Future IICT-focused coach session drives 70-07 script through `--step=1` → `--step=5` interactively |

## Cross-client check verdicts (D1, D2, D3)

| Check | Verdict | Evidence |
|---|---|---|
| **D1** — businesses with >1 active forecast per (business_id, fiscal_year, forecast_type) | **CLOSED** | 70-02 verified 25 active → 25 unique groups; the "multiple active" warnings re-emitted in 70-08 are all FY26+FY27 legitimate dual-active per the Phase 67 design (audit script framing mismatch — fix recommended) |
| **D2** — active forecasts missing `forecast_payroll_summary` | **CLOSED** (for D2 scope) | 70-03 populated the 2 forecasts that had `forecast_employees > 0` (Envisage Aus FY26 + Precision Electrical FY26). 23 skipped have 0 employees — onboarding-completion scope per-client, not D2 scope |
| **D3** — annual+active `subscription_budgets.renewal_month` IS NULL | **CLOSED** | 70-04 resolved all 2 real candidates (both Envisage: LastPass + Click Up, both Jan). The 89 "phantom" rows the audit claimed never existed under the cashflow engine's filter (audit script's count lacks frequency+is_active filter — fix recommended) |

## Phase 70 acceptance per CONTEXT.md

**Verdict: PARTIAL — MET on every cross-client gate; PARTIAL on JDS + IICT by intentional defer.**

Detailed evidence in `70-08-audit-comparison.md` "Phase 70 acceptance verdict" section. Net:

- Cross-client backfills (A1 / A2 / A3 = D1 / D2 / D3): **all MET**
- Per-client Envisage (B1): **MET-substantial** (1 dedupe + 36 codes + 7 documented UNRESOLVED)
- Per-client JDS (B2): **PARTIAL — deferred by Matt 2026-05-31** to a future coach session
- Per-client IICT (B3): **PARTIAL — deferred by Matt 2026-05-31** to a future coach session
- Verification (C1, this plan): **MET** — comparison doc written; framing mismatches recorded
- Verification (C2, 70-09 sibling running in parallel): tracking; not blocking 70-08 completion

## Recommended next step

**Unblock Phase 71 (code fixes).** The cross-client data side is clean; the per-client residues are documented and routed; the code-fixes phase (B1-B3 + S1-S6 + D4) is the largest remaining month-end-reporting quality gap and does not depend on JDS/IICT onboarding being complete.

**Schedule one focused JDS coach session** (rebuild FY26 budget OR accept zero + build FY27) before 2026-07-01 so FY27 budget is in place before the new FY begins.

**Schedule one focused IICT coach session** (industry / revenue / profit / canonical subscription list / snapshot generation) — can be batched with JDS or run independently. The 70-07 script (commit 3cb30e71) is ready to drive interactively in `--step=1` → `--step=5` order with the D1/D2/D3 build-time fixes already baked in.

**Apply the 4 recommended audit-script fixes** in a 30-minute ops touch-up so the next baseline run is accurate without the framing mismatches surfaced here. See `70-08-audit-comparison.md` "Recommended fixes to the audit script" section — each fix has current/recommended/why blocks.

## Audit framing mismatches summary (full detail in comparison doc)

1. **D1** — `⚠ multiple active forecasts` counts business cardinality, not unique-key cardinality. Phase 67's unique partial index allows FY26+FY27 dual-active by design. **Fix:** group by `(fiscal_year, forecast_type)` and only warn on real key collisions.
2. **D3** — `⚠ N/M rows with NULL renewal_month` lacks `frequency='annual' AND is_active=true` filter. Audit claimed 91 NULL annual rows; reality was 2 (both fixed). **Fix:** add the missing `.eq()` clauses to the count query.
3. **D2 display bug** — `payroll: runs/mo=[object Object] wages_admin=[object Object] ...` because the columns are JSONB monthly maps. Substantive data IS populated; the print is wrong. **Fix:** summary-print `[Nmo: $total]` per map instead of raw value coercion.
4. **70-07 enum literal recommendation** — audit says `consolidation_budget_mode=single` should change for multi-tenant, but the suggested target value `'consolidated'` violates the CHECK constraint. **Fix:** add inline `(should be 'per_tenant', NOT 'consolidated')` to the warning text.

## Deviations from plan

None. Plan executed as written:

- Task 1: re-ran `scripts/phase-70-data-audit.mjs` → `/tmp/70-08-audit-after.txt` (exit 0, 152 lines)
- Task 1: parsed for 6 dimensions × 3 clients → wrote `70-08-audit-comparison.md` (238 lines)
- Task 1 acceptance criteria: file ≥ 60 lines (238 ✓); per-client readiness table with all 3 clients (✓); cross-client checks D1/D2/D3 table (✓); sign-off checklist (✓); verdict-word count ≥ 6 (20 ✓); captured audit output for all 3 clients (✓)

No Rule 1/2/3 auto-fixes triggered. No authentication gates. No checkpoints (Task 1 is fully autonomous per CONTEXT C1 spec).

## Authentication gates

None.

## Verification

| Check | Expected | Actual | Pass |
|---|---|---|---|
| Audit script exits cleanly | exit 0 | exit 0 | ✓ |
| Captured output exists | `/tmp/70-08-audit-after.txt` non-empty | 152 lines | ✓ |
| Captured output contains all 3 clients | 3 `CLIENT:` headers | 3 (Envisage / Just Digital / IICT) | ✓ |
| Comparison doc exists | `70-08-audit-comparison.md` | 238 lines, 11 KB | ✓ |
| Comparison doc min length | ≥ 60 lines | 238 lines | ✓ |
| Verdict word count | ≥ 6 | 20 occurrences of CLOSED/partial/healthy/broken | ✓ |
| Per-client readiness table | 3 clients × 6 dimensions | 3 × 6 with before/after cells | ✓ |
| Cross-client checks table | D1, D2, D3 | All 3 with verdict CLOSED | ✓ |
| Audit framing mismatches section | ≥ 3 mismatches | 4 (D1, D3, JSONB display, wrong enum) | ✓ |
| Recommended audit-script fixes | each with current/recommended/why | 4 fixes, all complete | ✓ |
| Sign-off checklist | all checked except deliberately unchecked TODO | 5 checked + 1 deliberate unchecked (audit-script fixes not applied here per plan invariant) | ✓ |
| Zero production data writes | grep for "UPDATE\|INSERT\|DELETE" in plan-run commits | only docs commit + this SUMMARY | ✓ |

## Commits

| # | Hash | Type | Description |
|---|---|---|---|
| 1 | 493cf60c | docs | docs(70-08): audit re-run + before/after comparison + framing-mismatch fixes |
| 2 | (next) | docs | docs(70-08): complete audit comparison plan (this SUMMARY + STATE + ROADMAP) |

Both commits use `--no-verify` per the parallel directive (70-08 + 70-09 running concurrently in wave 4).

## Self-Check: PASSED

- File `.planning/phases/70-.../70-08-audit-comparison.md`: FOUND (238 lines, 11 KB)
- File `.planning/phases/70-.../70-08-SUMMARY.md`: FOUND (this file)
- Captured audit output `/tmp/70-08-audit-after.txt`: FOUND (152 lines, exit 0)
- Commit 493cf60c: FOUND in `git log`
- All 7 referenced SUMMARYs (70-01..70-07) verified present at read time before authoring this plan
- Phase 70 acceptance verdict (PARTIAL — MET cross-client, MET Envisage, DEFERRED JDS + IICT) cross-checked against 70-CONTEXT.md acceptance section + 70-06 + 70-07 defer rationales
- Audit-script byte-equivalence between baseline and re-run preserved: `scripts/phase-70-data-audit.mjs` was NOT modified in this plan (verifiable via `git log --oneline -- scripts/phase-70-data-audit.mjs`)
