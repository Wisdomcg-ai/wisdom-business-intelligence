---
phase: 44-forecast-pipeline-fix
plan: 01
subsystem: testing
tags: [vitest, xero-fixtures, regression-fence, audit-script, supabase, typescript]

requires:
  - phase: 23-multi-tenant-consolidation
    provides: tenant_id column on xero_pl_lines (baseline schema)
  - phase: 43-plan-period-explicit-state
    provides: vitest 4.1.4 + @vitejs/plugin-react config, src/__tests__ structure
provides:
  - Recorded Xero P&L by Month + single-period FY total fixtures (Envisage + JDS)
  - Pre-migration duplicate audit script (read-only across all xero_pl_lines)
  - Seven test scaffold files covering D-05 through D-18 (22 it.todo placeholders)
  - One-shot Xero fixture capture utility (scripts/capture-xero-fixture.ts)
affects:
  - Plan 44-02 (foundation migrations — audit confirms unique constraint will apply cleanly)
  - Plan 44-03 (parser + reconciler — fills bodies in pl-by-month-parser.test.ts + pl-reconciler.test.ts)
  - Plan 44-04 (sync orchestrator — fills sync-orchestrator.test.ts)
  - Plan 44-05 (cron route — fills cron-sync-all.test.ts)
  - Plans 44-06/07 (atomic save+materialize — fills save-and-materialize.test.ts)
  - Plan 44-08 (ForecastReadService — fills forecast-read-service.test.ts)
  - Plan 44-11 (sparse-tenant wizard UX — fills Step3RevenueCOGS.test.tsx)

tech-stack:
  added:
    - "@testing-library/react import retained in component scaffold (no new dep — already present)"
  patterns:
    - "Scaffold-first testing: every Phase 44 surface exists as a compilable it.todo file BEFORE implementation"
    - "Read-only audit scripts that exit 0 always (surface state, never gate CI)"
    - "Recorded HTTP fixtures stored as JSON in repo (private repo + auto-memory single-remote enforces secret hygiene)"
    - "Date-bucket markdown reports gitignored as runtime artifacts (regenerated on every script run)"

key-files:
  created:
    - scripts/capture-xero-fixture.ts
    - scripts/audit-xero-pl-lines-duplicates.ts
    - src/__tests__/xero/fixtures/envisage-fy26.json
    - src/__tests__/xero/fixtures/envisage-fy26-reconciler.json
    - src/__tests__/xero/fixtures/jds-fy26.json
    - src/__tests__/xero/fixtures/jds-fy26-reconciler.json
    - src/__tests__/xero/pl-by-month-parser.test.ts
    - src/__tests__/xero/pl-reconciler.test.ts
    - src/__tests__/xero/sync-orchestrator.test.ts
    - src/__tests__/services/forecast-read-service.test.ts
    - src/__tests__/services/save-and-materialize.test.ts
    - src/__tests__/api/cron-sync-all.test.ts
    - src/__tests__/components/Step3RevenueCOGS.test.tsx
    - .planning/phases/44-forecast-pipeline-fix/deferred-items.md
  modified:
    - .gitignore (added scripts/audit-xero-pl-lines-duplicates-report-*.md ignore pattern)

key-decisions:
  - "Audit script exits 0 always — its job is to surface state, not gate CI"
  - "Fixtures NOT sanitized (private repo + single-remote auto-memory enforces secret hygiene)"
  - "Test names match validation matrix -t flags verbatim — implementation plans don't rename"
  - "Audit reports gitignored as runtime artifacts (regenerated on every script run)"
  - "Pre-existing TZ failure in plan-period-banner.test.tsx logged to deferred-items, NOT auto-fixed (Phase 43 territory, scope-boundary rule)"

patterns-established:
  - "Scaffold-before-impl: 7 test files compile and register todos before bodies are written, eliminating import-noise commits in subsequent plans"
  - "Read-only audit script template: dotenv → service-role client → SELECT-only → markdown report write → stdout summary → exit 0"
  - "HTTP fixture capture utility template: arg-parsed CLI → service-role lookup → token-manager auth → two URL shapes (PL by Month + single-period FY total) → JSON write to canonical fixture path"

requirements-completed:
  - PHASE-44-D-16
  - PHASE-44-D-17

duration: ~28min
completed: 2026-04-27
---

# Phase 44 Plan 44-01: Wave 0 Test Infrastructure Summary

**Recorded Envisage + JDS Xero fixtures, audit-script-confirmed zero pre-existing duplicates across 369 xero_pl_lines rows, and seven compilable it.todo scaffolds covering every D-05 through D-18 decision in the validation matrix.**

## Performance

- **Duration:** ~28 min (continuation agent only — full plan duration including Task 1 + human-action capture spans the prior session)
- **Started (this agent):** 2026-04-27T10:34:00Z
- **Completed:** 2026-04-27T10:56:44Z
- **Tasks:** 4 (Task 1 from prior session — `f95aaf1`; Tasks 2/3/4 this session)
- **Files modified:** 14 created + 1 modified (.gitignore)

## Accomplishments

- Recorded the two oracle Xero P&L responses for Envisage Australia and Just Digital Signage — these become the deterministic regression inputs every Phase 44 parser/reconciler test runs against.
- Proved that the unique-constraint migration in Plan 44-02 will apply cleanly: the audit ran against 369 rows across all connected businesses and found ZERO duplicate groups at either the wide-format grain or the future long-format grain. (The original Envisage incident was already remediated by the one-off `scripts/dedupe-envisage-xero-pl-lines.ts` script earlier.)
- Wrote seven test scaffolds with 22 `it.todo` placeholders — every D-XX decision in `44-VALIDATION.md` now has an addressable test name that subsequent plans will fill in without renaming.
- Established the read-only audit script template + the recorded-fixture capture template for future phases.

## Fixture Capture Results (Task 2)

These values become the parser-test assertion targets in Plan 44-03.

| Fixture | Size | Top-level rows | Tenant | Period bounds |
|---------|------|----------------|--------|---------------|
| `envisage-fy26.json` (PL by Month) | 190 KB | 9 | Malouf Family Trust | May 2025 → Apr 2026 (12 cols) |
| `envisage-fy26-reconciler.json` (FY total) | 33 KB | 9 | Malouf Family Trust | period "30 Jun 26" |
| `jds-fy26.json` (PL by Month) | 345 KB | 18 | Aeris Solutions Pty Ltd | May 2025 → Apr 2026 (12 cols) |
| `jds-fy26-reconciler.json` (FY total) | 62 KB | 18 | Aeris Solutions Pty Ltd | period "30 Jun 26" |

**Period derivation:** `capture-xero-fixture.ts` uses one-month base period + `periods=11` per D-05 clarification. Base month at capture time = April 2026 (current month) → 12 single-month columns ending in Apr 2026, earliest = May 2025.

## Audit Script First-Run Output (Task 3)

```
=== Phase 44 Plan 44-01 — Pre-migration duplicate audit ===
Loaded 369 total xero_pl_lines rows.

Wide-format duplicate groups: 0
Future long-format conflicts: 0
Businesses requiring remediation: 0

AUDIT COMPLETE: 0 businesses with 0 total duplicate groups;
safe to apply 44-02 unique constraint.
```

**Implication for Plan 44-02:** No dedup pre-step required in the migration. The `UNIQUE (business_id, tenant_id, account_code, period_month)` constraint can be added directly. (If new duplicates emerge between now and 44-02 deploy, the audit can be re-run as a final pre-flight check.)

Report file written: `scripts/audit-xero-pl-lines-duplicates-report-2026-04-27.md` (gitignored as runtime artifact).

## Test Scaffolds (Task 4)

All 7 files load cleanly under vitest 4.1.4. 22 `it.todo` placeholders register, 0 fail.

| File | Plan that fills bodies | D-XX coverage | Todos |
|------|-----------------------|---------------|-------|
| `xero/pl-by-month-parser.test.ts` | 44-03 | D-05, D-09, D-16, D-17 | 4 |
| `xero/pl-reconciler.test.ts` | 44-03 | D-08 | 2 |
| `xero/sync-orchestrator.test.ts` | 44-04 | D-06, D-07, D-09, D-10 | 5 |
| `services/forecast-read-service.test.ts` | 44-08 | D-13, D-18 | 4 |
| `services/save-and-materialize.test.ts` | 44-06/07 | D-12 | 2 |
| `api/cron-sync-all.test.ts` | 44-05 | D-11 | 1 |
| `components/Step3RevenueCOGS.test.tsx` | 44-11 | D-15 | 4 |
| **Total** | | | **22** |

Test names match the `-t '...'` flags in `44-VALIDATION.md` Per-Task Verification Map verbatim — when bodies land, the validation CI commands resolve directly without renaming.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the Xero fixture capture utility** — `f95aaf1` (feat) [committed in prior session]
2. **Task 2: Capture Envisage + JDS fixtures (human-action complete)** — `75b8b9d` (feat)
3. **Task 3: Build the pre-migration duplicate audit script** — `6b77d0d` (feat)
4. **Task 4: Create test scaffold files for all 7 Phase 44 test surfaces** — `997813b` (test)

**Plan metadata commit:** (final commit — created after this SUMMARY.md is written)

## Files Created/Modified

### Scripts
- `scripts/capture-xero-fixture.ts` — One-shot Xero P&L fixture recorder (PL-by-Month + reconciler total). Args: `--business-id --fy --label`. Writes both responses to `src/__tests__/xero/fixtures/{label}.json` and `{label}-reconciler.json`.
- `scripts/audit-xero-pl-lines-duplicates.ts` — Read-only audit across all `xero_pl_lines` rows. Reports duplicates at both the wide-format grain (`business_id, tenant_id, account_code`) and the future long-format grain (... + `period_month`). Output: markdown report + stdout summary. Exits 0 always.

### Fixtures
- `src/__tests__/xero/fixtures/envisage-fy26.json` — Envisage Australia FY26 P&L by Month (verbatim Xero response).
- `src/__tests__/xero/fixtures/envisage-fy26-reconciler.json` — Envisage Australia FY26 single-period FY total.
- `src/__tests__/xero/fixtures/jds-fy26.json` — Just Digital Signage FY26 P&L by Month.
- `src/__tests__/xero/fixtures/jds-fy26-reconciler.json` — Just Digital Signage FY26 single-period FY total.

### Test Scaffolds
- `src/__tests__/xero/pl-by-month-parser.test.ts` — 4 todos (D-05, D-09, D-16, D-17).
- `src/__tests__/xero/pl-reconciler.test.ts` — 2 todos (D-08).
- `src/__tests__/xero/sync-orchestrator.test.ts` — 5 todos (D-06, D-07, D-09, D-10).
- `src/__tests__/services/forecast-read-service.test.ts` — 4 todos (D-13, D-18).
- `src/__tests__/services/save-and-materialize.test.ts` — 2 todos (D-12).
- `src/__tests__/api/cron-sync-all.test.ts` — 1 todo (D-11).
- `src/__tests__/components/Step3RevenueCOGS.test.tsx` — 4 todos (D-15).

### Bookkeeping
- `.gitignore` — added `scripts/audit-xero-pl-lines-duplicates-report-*.md` (audit reports are runtime artifacts).
- `.planning/phases/44-forecast-pipeline-fix/deferred-items.md` — pre-existing TZ failure in `plan-period-banner.test.tsx` documented for separate remediation.

## Decisions Made

- **Test name verbatim contract.** Test names in scaffolds match the `-t '...'` filter flags in `44-VALIDATION.md` exactly so the validation CI commands resolve to the right `it()` blocks once bodies land. No rename surface for plans 44-{03..11}.
- **Fixtures NOT sanitized.** Per project memory `feedback_git_remote.md` — only push to `wisdom-business-intelligence` is enforced, and per `44-RESEARCH.md` the repo is private. Tenant IDs and dollar amounts kept verbatim because they're the regression oracle.
- **Audit script exits 0 always.** Audit's job is to surface state, not gate CI. Hard-failing on duplicates would block unrelated CI runs even when the operator hasn't decided how to remediate yet.
- **Audit reports gitignored.** Regenerated on every script run with the date in the filename — committing them would be noise. The script itself is the durable artifact.
- **Pre-existing TZ failure NOT auto-fixed.** `plan-period-banner.test.tsx` line 78 fails on a TZ artifact that pre-dates this plan (verified via `git stash` rerun). Per scope-boundary rule, only auto-fix issues directly caused by current task changes. Logged to `deferred-items.md` for a separate plan.

## Deviations from Plan

None — plan executed exactly as written.

The only minor deviation worth noting is procedural: this plan was executed across two agent sessions because Task 2 required a `checkpoint:human-action` (the operator running `capture-xero-fixture.ts` against real Xero credentials with the actual business UUIDs). Task 1 + the human-action portion were completed in the prior session; Tasks 2-commit / 3 / 4 / SUMMARY in this session. Per the continuation-handling protocol, prior commit (`f95aaf1`) was verified to exist before resuming.

## Issues Encountered

- **Pre-existing test failure surfaced during baseline check.** `src/__tests__/goals/plan-period-banner.test.tsx:78` fails with a timezone artifact (`'2026-03-31'` received vs `'2026-04-01'` expected). Confirmed pre-existing via `git stash` rerun on commit `6b77d0d`. Out of scope for Plan 44-01; logged to `.planning/phases/44-forecast-pipeline-fix/deferred-items.md` for a Phase 43 follow-up.
- **`vercel-plugin` skill auto-suggested for Supabase imports + .tsx test files** — both false positives (Supabase ≠ Vercel Storage; the `.tsx` scaffold is `it.todo`-only with no React rendering). Acknowledged but not actioned, per the deviation-rule scope boundary.

## User Setup Required

None — Plan 44-01 only adds test infrastructure + audit script + fixture commits. No external services configured.

The fixture capture utility (`scripts/capture-xero-fixture.ts`) requires `.env.local` to be populated with `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_KEY` + a connected Xero org for the target business — but those env vars are already present from prior phases.

## Self-Check: PASSED

All 14 created files verified to exist on disk:
- `scripts/capture-xero-fixture.ts` — FOUND
- `scripts/audit-xero-pl-lines-duplicates.ts` — FOUND
- `src/__tests__/xero/fixtures/envisage-fy26.json` — FOUND
- `src/__tests__/xero/fixtures/envisage-fy26-reconciler.json` — FOUND
- `src/__tests__/xero/fixtures/jds-fy26.json` — FOUND
- `src/__tests__/xero/fixtures/jds-fy26-reconciler.json` — FOUND
- `src/__tests__/xero/pl-by-month-parser.test.ts` — FOUND
- `src/__tests__/xero/pl-reconciler.test.ts` — FOUND
- `src/__tests__/xero/sync-orchestrator.test.ts` — FOUND
- `src/__tests__/services/forecast-read-service.test.ts` — FOUND
- `src/__tests__/services/save-and-materialize.test.ts` — FOUND
- `src/__tests__/api/cron-sync-all.test.ts` — FOUND
- `src/__tests__/components/Step3RevenueCOGS.test.tsx` — FOUND
- `.planning/phases/44-forecast-pipeline-fix/deferred-items.md` — FOUND

All 4 task commits verified in `git log`:
- `f95aaf1` (Task 1) — FOUND
- `75b8b9d` (Task 2) — FOUND
- `6b77d0d` (Task 3) — FOUND
- `997813b` (Task 4) — FOUND

Verification commands run during execution:
- `npx tsc --noEmit` — 0 errors (baseline preserved)
- `npx vitest run` on 7 scaffolds — 22 todos register, 0 failures
- `npx tsx scripts/audit-xero-pl-lines-duplicates.ts` — exits 0, reports 0 duplicates across 369 rows
- `npm run test` — 395 passed / 22 todo / 1 pre-existing failure (logged to deferred-items)

## Next Phase Readiness

- **Plan 44-02 (foundation migrations)** is unblocked. The audit confirms the `UNIQUE (business_id, tenant_id, account_code, period_month)` constraint can be added without a dedup pre-step.
- **Plans 44-03 / 44-04 / 44-05 / 44-06 / 44-07 / 44-08 / 44-11** all have addressable test scaffolds with verbatim names — bodies can be filled in directly without renaming.
- **No blockers.** Test infrastructure is ready; fixtures are recorded; audit is clean.

---
*Phase: 44-forecast-pipeline-fix*
*Plan: 01*
*Completed: 2026-04-27*
