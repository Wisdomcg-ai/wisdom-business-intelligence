---
phase: 49-database-integrity-hygiene
plan: 03
subsystem: database / RLS
tags: [rls, security, documentation, additive, comment-only]
requirements:
  - DB-06
status: complete
branch: feat/49-03-rls-comments
commits:
  - bfa7843: "feat(49-03): RED — failing introspection test for DB-06 RLS policy intent COMMENTs"
  - 2cd9734: "feat(49-03): GREEN — add DB-06 RLS policy intent documentation migration"
metrics:
  tasks_planned: 2
  tasks_completed: 2
  commits: 2
  files_created: 2
  files_modified: 0
  lines_added: 331
deviations: 0
---

# Phase 49 Plan 03: DB-06 RLS Policy Intent Documentation — Summary

## One-liner

Added explicit `COMMENT ON POLICY` statements (with the `INTENT:` sentinel) to the three over-permissive (`USING (true)`) RLS policies on `swot_templates`, `kpi_benchmarks`, and `kpi_definitions`, plus an introspection regression test and a migration-side `DO $$ ... RAISE EXCEPTION` self-check that fails the apply if any comment fails to land.

## Goal Achieved

PHASE.md success criterion #5: *"The 3 `USING (true)` RLS policies (`swot_templates`, `kpi_benchmarks`, `kpi_definitions`) carry an explicit migration comment recording the intent... Any policy narrowed has a regression test confirming a non-owner cannot read another tenant's row."* — Achieved as a comment-only migration; no narrowing happened (all three tables structurally lack a tenant column per RESEARCH.md DB-06), so the "regression test for narrowed policies" sub-clause does not trigger.

## What Was Built

### 1. `supabase/migrations/20260504000001_db06_rls_policy_intent_documentation.sql` (NEW, 149 lines)

- Three `COMMENT ON POLICY` statements with the `INTENT:` sentinel:
  - `swot_templates` → `Authenticated users can view swot templates`
  - `kpi_benchmarks` → `kpi_benchmarks_select_consolidated`
  - `kpi_definitions` → `kpi_definitions_select_consolidated`
- Long header comment explaining the audit context, the reframing (audit was wrong; tables are legitimate system-wide reference data), what the migration does and does NOT do, rollback path, and post-apply verification SQL (Sentinel 4).
- A `DO $db06_check$ ... RAISE EXCEPTION` self-check at the end with two safeguards:
  1. Fails the apply if any of the three (table, policy) targets has a NULL or non-`INTENT:` comment after the COMMENT statements run.
  2. Fails the apply if any of the three expected (table, policy) pairs is not present in `pg_policy` (catches the silent-no-op risk where a typo in the long, space-containing `swot_templates` policy name would otherwise produce a successful but ineffective COMMENT).
- Filename suffix `000001` sorts deterministically AFTER 49-01's `20260504000000_*` migration so the two Wave 1 migrations apply in order.
- Filename matches the new strict CI regex `^[0-9]{14}_[a-z0-9_]+\.sql$` (DB-05 hygiene).

### 2. `src/__tests__/migrations/db-06-rls-comments.test.ts` (NEW, 182 lines)

- **Static file assertions (always run, even with placeholder env vars):**
  - Migration file exists at the expected path.
  - Contains exactly 3 `COMMENT ON POLICY` statements.
  - Contains ≥3 `INTENT:` sentinels.
  - All three (table, policy-name) pairs appear verbatim in the file (case-sensitive — guards against the long policy-name-with-spaces typo risk).
- **Live-DB introspection (skipped in CI placeholder mode, per the 06C convention):**
  - Probes `pg_policy` via PostgREST. Supabase does not expose `pg_catalog` by default, so the probe almost always fails — when it does, the per-policy assertions skip with a console warning. The migration's own `DO $$ ... RAISE EXCEPTION` self-check is the authoritative apply-time enforcement (runs on EVERY environment the migration lands on, including production).

## How DB-06 Is Verified Live

Three layers of defence (only one needs to fire to catch a regression):

| Layer | Where | When fires |
|-------|-------|-----------|
| Static file checks | `db-06-rls-comments.test.ts` static `describe` block | Every `vitest run` (CI included) |
| Live-DB introspection | `db-06-rls-comments.test.ts` live `describe.skip(...)` | Local dev / preview branch with real env vars |
| Migration self-check (`DO $$ ... RAISE EXCEPTION`) | Inside the migration file itself | EVERY `supabase migration up` (preview, prod, fresh local DB) |

## Deviations from Plan

**None.** Plan executed exactly as written. Two minor implementation choices worth flagging:

1. **Test approach:** Plan Task 1 said "use whatever SQL-execution helper the project already exposes (matching `06C` style — do NOT invent a new helper)." Investigation revealed 06C uses pure PostgREST behavioural verification (no SQL helper), and `pg_policy` cannot be queried directly via PostgREST. Resolution: the test combines (a) static file assertions that always run, plus (b) a best-effort `from('pg_policy')` probe that gracefully skips when PostgREST cannot reach the catalog (mirrors 06C's `tablePresent` skip pattern). The migration's own `DO $$` self-check provides the authoritative live-DB enforcement. This stays within the "no new helpers" constraint.

2. **Migration self-check (`DO $$ ... RAISE EXCEPTION`):** Plan Task 2 called out the silent-no-op risk for `COMMENT ON POLICY` against a non-existent name and said "Re-confirm the policy names match the baseline schema EXACTLY before saving." I went one step further and embedded a `DO $$` block that fails the migration apply if any of the three comments end up NULL / missing the sentinel, OR if any of the three expected (table, policy) pairs is absent from `pg_policy`. This is a defensive belt-and-braces — adds 50 lines but eliminates the silent-failure mode entirely. Treating as in-scope hardening of Task 2's stated risk (not a deviation).

## Local CI Status (run before push)

| Check | Result | Notes |
|-------|--------|-------|
| `npx vitest run` (full suite) | 638 passed, 1 failed, 23 skipped, 4 todo | Pre-existing failure in `plan-period-banner.test.tsx` (date-sensitive — flagged as expected in execution prompt). New `db-06-rls-comments.test.ts`: 6 passed, 4 skipped (live-DB sub-tests skip in placeholder env). |
| `npx tsc --noEmit` | Clean (exit 0) | No type errors anywhere. |
| `npx next lint` | Warnings only, all pre-existing | None of the warnings are in files this plan touched. |
| Migration filename hygiene | PASS | `20260504000001_db06_rls_policy_intent_documentation.sql` matches `^[0-9]{14}_[a-z0-9_]+\.sql$`. |

## Risk Worth Verifier Scrutinizing Hardest

**The migration self-check is itself untested against a live DB from this branch.** The `DO $$ ... RAISE EXCEPTION` block is correct PL/pgSQL by inspection — but no preview-branch apply has actually run it yet from this checkout (no live Supabase URL configured locally, and the project doesn't ship a `pg` driver to do an out-of-band apply). The migration is unambiguous and the SQL is straightforward, but the verifier should confirm that when this PR's preview branch is created (Supabase GitHub integration auto-applies migrations), the `DO $$` block does NOT raise — i.e., the three `COMMENT ON POLICY` statements above it land on real policy rows. If a typo slipped past my visual inspection of the long `swot_templates` policy name, the preview-branch apply will fail and we'll know immediately. That failure mode is by design (better to fail loud than land silent no-ops), but the verifier should flag it for clarity in the PR description so the operator isn't surprised.

## Out-of-Scope Items Surfaced

None. RESEARCH.md DB-06 was already explicit that no narrowing is feasible without a schema change (out of scope for Phase 49). If Matt later wants per-business custom SWOT templates or KPI definitions, that's a future phase (would require adding a `creator_id` or `business_id` column to the relevant table, plus updating RLS policies and the seeding flow).

## Files Touched

| File | Change | Purpose |
|------|--------|---------|
| `supabase/migrations/20260504000001_db06_rls_policy_intent_documentation.sql` | CREATE | Three `COMMENT ON POLICY` statements + apply-time self-check |
| `src/__tests__/migrations/db-06-rls-comments.test.ts` | CREATE | Static file assertions + (skipped) live-DB introspection |

## Self-Check

- [x] `supabase/migrations/20260504000001_db06_rls_policy_intent_documentation.sql` exists
- [x] `src/__tests__/migrations/db-06-rls-comments.test.ts` exists
- [x] Commit `bfa7843` (RED test) exists in git log
- [x] Commit `2cd9734` (GREEN migration) exists in git log
- [x] Branch `feat/49-03-rls-comments` pushed to origin
- [x] `vitest run src/__tests__/migrations/db-06-rls-comments.test.ts` passes (6 / 4 skip)
- [x] Migration's grep counts: `COMMENT ON POLICY` = 3, `INTENT:` = 8 (3 in policy bodies, 5 in header/comment lines)
- [x] All three policy names appear verbatim in the migration

## Self-Check: PASSED
