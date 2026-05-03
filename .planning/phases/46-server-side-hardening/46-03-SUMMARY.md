---
phase: 46-server-side-hardening
plan: 03
subsystem: security/sql-functions
tags: [security, supabase, sql, security-definer, input-validation, SEC-05]
requirements: [SEC-05]
dependency_graph:
  requires:
    - 44-05  # CI gate enforcing on main
  provides:
    - "Hardened create_quarterly_swot: rejects out-of-range quarter (1..4) and year (2020..2100)"
    - "Hardened create_test_user: rejects roles outside canonical ('client','coach','super_admin')"
    - "Reduced create_test_user attack surface: REVOKE EXECUTE from anon and authenticated"
  affects:
    - "supabase/migrations/00000000000000_baseline_schema.sql function bodies (lines 499-530) — superseded by new migration"
tech-stack:
  added: []
  patterns:
    - "Use RAISE EXCEPTION ... USING ERRCODE = '22023' (invalid_parameter_value) for input-validation errors in SECURITY DEFINER functions"
    - "Mirror table-level CHECK constraint canonical lists in SECURITY DEFINER guards for clearer error surfaces"
    - "Vitest SQL tests gate on NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; skip safely in CI"
key-files:
  created:
    - supabase/migrations/20260503000000_sec05_security_definer_input_validation.sql
    - src/__tests__/sql/sec05-input-validation.test.ts
  modified: []
decisions:
  - "Kept the optional REVOKE EXECUTE block for create_test_user (planner default + RESEARCH.md recommendation): function has zero production callers, only invoked from psql with service_role"
  - "Skipped the happy-path create_quarterly_swot test in vitest because auth.uid() is NULL when called via service-role client; happy-path regression is covered by existing SwotUpdateStep wizard integration coverage"
  - "Mirrored the canonical role list ('client','coach','super_admin') from system_roles_role_check at baseline_schema.sql:5153 instead of inventing a new list"
metrics:
  duration: "~30 minutes"
  completed: "2026-05-02"
  tasks_completed: 2  # Task 3 is a checkpoint:human-action handed off to operator
  commits: 2
---

# Phase 46 Plan 03: SQL Input Validation (SEC-05) Summary

One-liner: Two SECURITY DEFINER SQL functions (`create_quarterly_swot`, `create_test_user`) now validate their inputs with explicit `RAISE EXCEPTION` guards before touching the database, and `create_test_user` is restricted to `service_role` only via `REVOKE EXECUTE`.

## Inputs

- **PHASE.md** — phase 46 server-side hardening, SEC-05 line 31
- **RESEARCH.md** — SEC-05 evidence at lines 261-360 (function bodies, callers, proposed fix, risks, test approach)
- **46-03-PLAN.md** — 3 tasks: TDD red test, GREEN migration, operator-applied checkpoint
- **46-PLAN-CHECK.md** — line 130 verdict "PASS" (no notes blocking execution)
- **baseline_schema.sql** — function bodies at :499 (create_quarterly_swot) and :515 (create_test_user); GRANT statements at :13394-13402; system_roles CHECK constraint at :5153

## Per-task delivery

| Task | Title                                                              | Status     | Commit    | Files                                                                            |
| ---- | ------------------------------------------------------------------ | ---------- | --------- | -------------------------------------------------------------------------------- |
| 1    | TDD — write failing SQL validation tests                           | Done       | `cdf4292` | `src/__tests__/sql/sec05-input-validation.test.ts` (133 LOC, 6 tests)            |
| 2    | GREEN — author SEC-05 migration                                    | Done       | `2128934` | `supabase/migrations/20260503000000_sec05_security_definer_input_validation.sql` |
| 3    | Operator — apply migration to preview branch + smoke test          | Handed off | n/a       | (no code changes — operator action only)                                         |

## Acceptance criteria checklist

From PLAN's `<verification>` block:

- [x] Migration file exists with correct timestamp prefix (`20260503000000_*`, matches CI regex `^[0-9]{14}_[a-z0-9_]+\.sql$`)
- [x] Both functions have RAISE EXCEPTION guards with specific error messages
  - `create_quarterly_swot`: `must be 1..4` (quarter), `p_year must be 2020..2100` (year)
  - `create_test_user`: `must be one of client/coach/super_admin`
- [x] Role list mirrors any existing `system_roles_role_check` CHECK constraint (verified at baseline_schema.sql:5153 — `('super_admin', 'coach', 'client')` — same set, alphabetical order in code)
- [x] `create_test_user` REVOKE EXECUTE FROM anon/authenticated applied (defence-in-depth, planner default)
- [x] Vitest suite has 6 tests (4 quarter-validation + 2 role-validation; 1 quarter test is intentionally `it.skip` for happy-path UUID return — see Decisions)
- [ ] All non-skipped tests GREEN against preview branch with migration applied — **deferred to operator (Task 3)**
- [ ] Operator confirms prod apply scheduled or complete — **deferred to operator (Task 3)**

The two unchecked items belong to Task 3, the human-action checkpoint. The migration + test files are committed and pushed; the operator runs the preview-branch smoke test + prod apply per the steps in `46-03-PLAN.md` Task 3.

## Local CI status (mirrors `.github/workflows/supabase-preview.yml`)

| Gate            | Status   | Notes                                                                                                                                |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| migration-check | PASS     | Filename `20260503000000_sec05_security_definer_input_validation.sql` matches `[0-9]{14}_[a-z0-9_]+\.sql`                            |
| lint            | PASS     | `npx next lint` — only pre-existing warnings, no new ones                                                                            |
| typecheck       | PASS     | `npx tsc --noEmit` — clean                                                                                                           |
| vitest          | PASS\*   | 619 passed, 19 skipped (incl. the 6 new SEC-05 tests skipped without DB env), **1 pre-existing failure** in `plan-period-banner.test.tsx` (date-sensitive, orchestrator pre-warned — not a regression I introduced) |
| build           | (not run locally — covered by CI on push)                                                                                            |

The vitest failure is `src/__tests__/goals/plan-period-banner.test.tsx:78` expecting `'2026-04-01'` but getting `'2026-03-31'`. Pre-existing; flagged in the orchestrator brief; not introduced by this plan.

## Deviations from PLAN

1. **Task 3 (operator checkpoint) — handed off, not executed inline.** The plan called for the operator to apply the migration to a Supabase preview branch and run psql smoke tests. The executor has no preview-branch credentials in this environment, so per orchestrator instructions ("a real apply happens in CI / on merge ... do not silently skip the test") the test + migration are committed and the operator picks up Task 3's steps from `46-03-PLAN.md` after PR merge or via the Supabase preview-branch GitHub integration.

2. **Happy-path test skipped intentionally.** The plan listed Test 4 (happy path: quarter=2 year=2025 returns a UUID) but warned it "needs auth.uid() workaround or a service_role connection". When called from a service-role client `auth.uid()` is NULL and the INSERT into `swot_analyses` may fail on the `created_by` FK / NOT NULL downstream of the validation guard. Marked `it.skip` with an in-file comment pointing at the existing wizard integration coverage in `SwotUpdateStep.tsx` as the regression check. This matches the plan's recommended skeleton (lines 197-200 of 46-03-PLAN.md).

3. **No other deviations.** The migration content matches the plan's proposed SQL exactly; the canonical role list mirrors the existing CHECK constraint (no invented list); REVOKE EXECUTE is included per planner default.

## Files changed

**Created:**

- `supabase/migrations/20260503000000_sec05_security_definer_input_validation.sql` — the SEC-05 migration (101 LOC, both function rewrites + REVOKE block, wrapped in BEGIN/COMMIT)
- `src/__tests__/sql/sec05-input-validation.test.ts` — vitest suite (133 LOC, 6 tests, gated on `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to stay CI-safe)

**Modified:** none.

**Out of scope (NOT touched):**

- `src/app/api/migrate/*` (46-01 territory)
- `src/middleware.ts`, `src/lib/utils/logger.ts` (46-01)
- `src/app/api/Xero/sync-all/*` (46-02)
- `src/lib/utils/encryption.ts` (46-04)

## Rollback story

If the migration ships and needs reverting (no callers known to break, but for completeness):

1. Author a follow-up migration `supabase/migrations/20260503000001_sec05_revert.sql` that:
   - Re-applies the original `create_quarterly_swot` body from `baseline_schema.sql:499-509` (no guards, inline `p_quarter::INTEGER` cast)
   - Re-applies the original `create_test_user` body from `baseline_schema.sql:515-530` (no role validation)
   - Re-grants EXECUTE on `create_test_user` to `anon` and `authenticated`:
     ```sql
     GRANT EXECUTE ON FUNCTION "public"."create_test_user"("text", "text") TO "anon";
     GRANT EXECUTE ON FUNCTION "public"."create_test_user"("text", "text") TO "authenticated";
     ```
2. Apply via the same Supabase migration deploy mechanism as forward migrations.

The original function bodies are preserved verbatim in `baseline_schema.sql` (Supabase migration files are append-only) so the source of truth for rollback is always available.

## Pre-flight grep results (for the PR description)

Per Task 1 acceptance criteria — recorded for traceability:

```
$ grep -n "create_quarterly_swot" supabase/migrations/00000000000000_baseline_schema.sql
499:CREATE OR REPLACE FUNCTION "public"."create_quarterly_swot"(...)
512:ALTER FUNCTION "public"."create_quarterly_swot"(...) OWNER TO "postgres";
13394-13396: GRANT ALL ON FUNCTION "public"."create_quarterly_swot"(...) TO "anon"/"authenticated"/"service_role"

$ grep -n "create_test_user" supabase/migrations/00000000000000_baseline_schema.sql
515:CREATE OR REPLACE FUNCTION "public"."create_test_user"(...)
533:ALTER FUNCTION "public"."create_test_user"(...) OWNER TO "postgres";
13400-13402: GRANT ALL ON FUNCTION "public"."create_test_user"(...) TO "anon"/"authenticated"/"service_role"

$ grep -B2 -A2 "system_roles.role\|role.*CHECK\|role.*ENUM" supabase/migrations/00000000000000_baseline_schema.sql
5153: CONSTRAINT "system_roles_role_check" CHECK (("role" = ANY (ARRAY['super_admin'::"text", 'coach'::"text", 'client'::"text"])))
```

Canonical role list confirmed: `('super_admin', 'coach', 'client')` — the migration's `IN ('client', 'coach', 'super_admin')` matches this set exactly (set membership, not order).

## Self-Check: PASSED

Verified:

- `supabase/migrations/20260503000000_sec05_security_definer_input_validation.sql` exists on disk
- `src/__tests__/sql/sec05-input-validation.test.ts` exists on disk
- Commit `cdf4292` exists in `git log` (Task 1 RED)
- Commit `2128934` exists in `git log` (Task 2 GREEN)
- Branch `feat/46-03-sql-validation` pushed to origin (`set up to track origin/feat/46-03-sql-validation`)
- Migration filename matches the CI regex `^[0-9]{14}_[a-z0-9_]+\.sql$`
- Migration file contains all 4 plan-required strings: `must be 1..4`, `must be one of`, `REVOKE EXECUTE`, both `CREATE OR REPLACE FUNCTION` blocks
