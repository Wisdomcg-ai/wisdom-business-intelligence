---
phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
plan: 02
subsystem: forecasts
tags: [supabase, financial-forecasts, dedupe, phase-67-followup, no-op]

# Dependency graph
requires:
  - phase: 67-multi-currency-and-unique-active-forecast
    provides: Partial unique index on (business_id, fiscal_year, forecast_type) WHERE is_active — the very constraint this plan was meant to enforce retroactively
  - phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
    plan: 01
    provides: Pre-write rollback snapshot containing every active forecast row (recoverable baseline if a future apply ever does mutate)
provides:
  - scripts/70-02-A1-active-forecast-remediation.mjs (two-mode dry-run / --apply cross-client active-forecast deduplication script — preserved for future use)
  - Empirical confirmation that production satisfies the Phase 67 unique-active-forecast invariant TODAY (25 active forecasts across 25 unique (business_id, fiscal_year, forecast_type) groups)
  - Audit framing correction: "multiple active forecasts" warning in scripts/phase-70-data-audit.mjs is schema-correct when the duplicates are FY26 vs FY27 (different fiscal_year → different unique-index key)
affects: [70-03-payroll-summary-backfill, 70-06-jds-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-mode --apply discipline: defensive guard `if (APPLY) { ... }` around every `.update()` call so a typo in CLI args cannot mutate prod"
    - "Per-row update with per-row try/catch (not bulk WHERE IN) so a single bad id cannot nuke the batch"
    - "Group-key conservatism: script groups on (business_id, fiscal_year, year_type, forecast_type) — strictly tighter than the production unique index (business_id, fiscal_year, forecast_type) so we will never deactivate a legitimately-distinct CY vs FY pair at the same fiscal_year number"

key-files:
  created:
    - scripts/70-02-A1-active-forecast-remediation.mjs
  modified:
    - .planning/phases/70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients/70-02-SUMMARY.md
    - .planning/STATE.md
    - .planning/ROADMAP.md

key-decisions:
  - "Accepted the no-op outcome rather than expanding scope: the original plan assumed retroactive cleanup was required; the dry-run proved no cleanup is needed because Phase 67's unique partial index already allows multi-fiscal-year active forecasts per business by design"
  - "Kept script in tree (not deleted) — it is the reusable cross-business dedupe tool the platform will need the first time a real duplicate (same business_id, same fiscal_year, same forecast_type, both is_active) appears in prod"
  - "Documented JDS's FY26-empty / FY27-healthy split as out of scope — that is a forecast-population issue, not a forecast-multiplicity issue, and is the explicit subject of 70-06"
  - "Empty --apply commit (--allow-empty) used to record the verified-clean outcome rather than skipping the audit-trail commit; future readers can grep `git log --grep 70-02` and see both the build commit and the verified-clean commit"

patterns-established:
  - "Pre-write audit framing must distinguish schema-VIOLATIONS from schema-PERMITTED-multiplicity; an audit script that says 'multiple X' should also assert against the actual unique-key shape, not infer 'multiple = bad' from cardinality alone"

# Metrics
metrics:
  duration: 25 minutes (continuation only — Task 2 apply + summary + state)
  tasks: 2
  files: 1 created (script) + 1 created (this SUMMARY) + 2 modified (STATE, ROADMAP)
  completed: 2026-05-30
  mutations-applied: 0
  rows-deactivated: 0
  groups-with-conflicts: 0
---

# Phase 70 Plan 02: Active-Forecast Remediation Summary

Cross-business `financial_forecasts.is_active` audit + remediation script: built, dry-run, applied, verified clean. 0 mutations needed — production already satisfies the Phase 67 unique-active-forecast invariant; the original "multiple active" warning that motivated this plan was a framing mismatch between the audit script and the actual production unique index.

## What shipped

- `scripts/70-02-A1-active-forecast-remediation.mjs` (337 lines, ~16 KB) — a two-mode (default dry-run / `--apply` writes) cross-client deduplication script that:
  - Reads every `is_active=true` row from `financial_forecasts`
  - Groups by `(business_id, fiscal_year, year_type, forecast_type)`
  - For any group with size > 1: applies the locked canonical-selection rule (most recently `updated_at` → most `forecast_pl_lines` → has any `forecast_payroll_summary` → most recently `created_at` → lowest id alphabetically as final tiebreaker)
  - On `--apply`: per-row UPDATE setting `is_active=false` on losers (NEVER deletes, NEVER touches winner, NEVER touches any other column), each wrapped in try/catch
  - Filters out forecasts whose parent `businesses.status != 'active'` (resolved via `business_profiles.business_id → businesses.id`)
  - Idempotent: re-running yields 0 mutations

## Audit framing mismatch — the headline finding

The Phase 70 pre-audit (`scripts/phase-70-data-audit.mjs`) reported `⚠ multiple active forecasts` for Envisage and JDS. That warning was framed as a Phase 67 constraint violation requiring retroactive cleanup. **It is not.**

Phase 67's migration (`supabase/migrations/20260427000000_unique_active_forecast_per_fy.sql`) created a **partial unique index keyed on `(business_id, fiscal_year, forecast_type) WHERE is_active = true`**. The `fiscal_year` column is part of the key, so the same business can legitimately have:

- one active FY26 forecast AND
- one active FY27 forecast AND
- one active FY28 forecast AND so on

…all simultaneously. That is the expected state for any business already planning ahead more than one year — exactly what coaches do during quarterly reviews.

When 70-02 ran the dry-run against production:

```
active forecasts total: 25
groups (any size): 25
groups with > 1 active: 0
Groups with conflicts: 0
Losers identified: 0
✓ Nothing to do — data already satisfies the unique-active invariant.
```

Every one of the 25 active forecasts in prod sits in its own unique `(business_id, fiscal_year, year_type, forecast_type)` group. The Phase 67 invariant is **already satisfied**. The audit's "multiple active" warning was counting `(business_id)` cardinality, not `(business_id, fiscal_year, forecast_type)` cardinality — a different shape from the actual constraint.

## Per-business breakdown of "dual active" forecasts (all legitimate)

The audit flagged four businesses with >1 active forecast. The dry-run confirmed each is a legitimate FY26 + FY27 pair:

| Business | Active forecasts | Index key collision? |
|----------|------------------|----------------------|
| Envisage | FY26 + FY27 | No — different fiscal_year |
| JDS | FY26 + FY27 | No — different fiscal_year |
| Dragon | FY26 + FY27 | No — different fiscal_year |
| Armstrong | FY26 + FY27 | No — different fiscal_year |

All four are the expected outcome of normal quarterly-review workflow (coach builds a forward-year forecast while keeping the current-year one active for variance reporting). The Phase 67 constraint permits this by design.

## JDS — deferred to 70-06 by design

JDS's specific symptom — active FY26 forecast with 0 `forecast_pl_lines` while a healthier FY27 sits alongside — is a **forecast-population** problem, not a **forecast-multiplicity** problem. 70-02 cannot fix it because deactivating FY26 would leave JDS with only an FY27 active (also wrong for current-period reporting), and populating FY26 with line data is a content-restoration job, not a dedupe job.

70-06 (JDS cleanup) is the correct owner. The script preserves this distinction by NOT deactivating any forecast in a `pl_line_count=0` group — the inline comment at the tie-breaker block calls this out explicitly.

## Script reusability

Although today it is a no-op, the script is preserved unmodified because:

1. The first time a coach accidentally clicks "make active" on a second forecast for the same (business, fiscal_year, forecast_type), the partial unique index will reject the INSERT with a 23505 error. The script is the cleanup tool when that error gets caught and the prior row needs to be located + deactivated.
2. Future onboarding migrations (importing forecasts from external systems) can run the script post-import to guarantee invariant compliance without manual SQL.
3. The two-mode dry-run / `--apply` pattern, per-row try/catch update path, and dual-ID resolution (`business_profiles.business_id → businesses.id`) are the canonical shapes the rest of Phase 70 inherits.

## Deviations from Plan

### Plan-vs-reality reframing

**[Rule 4 — Architectural framing, resolved without code change] Audit warning was schema-correct, not a violation**

- **Found during:** Task 1 (dry-run)
- **Issue:** The plan's `<objective>` block stated "Envisage has 2 active forecasts (FY26 + FY27)... Phase 67 added a unique constraint but pre-existing duplicates were never resolved." The dry-run proved this characterization wrong — those are not duplicates under the actual unique-index shape (which includes fiscal_year).
- **Decision:** Matt approved Option A (accept no-op, run idempotency-proof --apply, document the framing mismatch in this summary). No code change to script; no schema change; no rollback. The script's grouping logic was already conservatively correct (it groups on the union of `year_type` AND `forecast_type`, strictly tighter than the production index), which is why it returned 0 conflicts.
- **Files affected:** None code-wise; only this SUMMARY documents the reframing.
- **Commit:** 8b869680

### No auto-fixes

No Rule 1/2/3 deviations triggered. The script as built passed dry-run, --apply was a no-op, and the idempotency proof was the second --apply.

## Authentication gates

None.

## Verification

| Check | Expected | Actual | Pass |
|-------|----------|--------|------|
| Script exists | `scripts/70-02-A1-active-forecast-remediation.mjs` | exists, 337 lines, 16573 bytes | ✓ |
| Default dry-run header | "DRY RUN" | "DRY RUN — preview only" printed | ✓ |
| Apply header | "APPLY MODE" | "APPLY MODE — writes will commit to production Supabase" | ✓ |
| Active forecast row count | ≥ 1 | 25 | ✓ |
| Groups with conflicts (pre-apply) | unknown | 0 | (Reframed — see "Audit framing mismatch") |
| Mutations applied | 0 (no conflicts) | 0 | ✓ |
| Idempotency (re-run after apply) | 0 mutations | 0 mutations | ✓ |
| `.delete(` calls in script | 0 | 0 | ✓ |

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 0a7714f0 | feat(70-02): A1 active-forecast remediation script (dry-run + --apply) |
| 2 | 8b869680 | chore(70-02): apply A1 active-forecast remediation — verified clean (0 conflicts) |
| 3 | (this commit) | docs(70-02): complete active-forecast remediation plan — verified clean, 0 mutations |

## Self-Check: PASSED

- FOUND: scripts/70-02-A1-active-forecast-remediation.mjs
- FOUND: .planning/phases/70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients/70-02-SUMMARY.md
- FOUND commit: 0a7714f0
- FOUND commit: 8b869680
