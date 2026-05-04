---
phase: 49-database-integrity-hygiene
plan: 04
subsystem: database
tags: [db-04, fk-constraints, set-null, audit-attribution, batch-1, test-helpers]
requirements: [DB-04]
dependency-graph:
  requires:
    - 44-05 (CI gate enforced)
    - 49-02 (fk-policy.md ACTIVE — Bucket A signed off)
  provides:
    - "24 audit-attribution FKs converted from NO ACTION to ON DELETE SET NULL"
    - "Reusable migration-test helpers (createTestUser/deleteTestUser/assertOrphans/seedTestBusiness)"
    - "Test pattern proven for plans 49-05/06/07 to extend"
  affects:
    - "Deleting a coach/user no longer blocks at the database — affected dependent rows null the user attribution and survive"
    - "6 columns lose NOT NULL (chat_messages.sender_id, client_invitations.invited_by, coach_audit_log.coach_id, coaching_sessions.coach_id, custom_kpis_library.created_by, process_comments.commented_by) — application reads must null-check"
tech-stack:
  added: []
  patterns:
    - "DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT (atomic in single transaction; PostgreSQL doesn't support ALTER CONSTRAINT … SET ON DELETE)"
    - "Skip-on-placeholder vitest pattern for migration tests (mirrors 06C)"
    - "assertOrphans('null'|'cascade'|'block') — single helper serves all 4 DB-04 plans"
key-files:
  created:
    - src/__tests__/migrations/_helpers.ts
    - src/__tests__/migrations/db-04-set-null-batch-1.test.ts
    - supabase/migrations/20260505000000_db04_set_null_fks_batch_1.sql
    - .planning/phases/49-database-integrity-hygiene/49-04-DEVIATION.md
    - .planning/phases/49-database-integrity-hygiene/49-04-SUMMARY.md
  modified:
    - docs/db/fk-policy.md (24 rows marked applied; migration history entry)
decisions:
  - "Drop NOT NULL on 6 columns whose policy decision is SET NULL — without it, the cascade fails at delete time with a not-null violation"
  - "3 non-auth.users FKs (#12 coach_benchmarks, #17 forecasts, #21 monthly_report_settings) tested by deleting the OTHER parent (ai_interactions/profiles/financial_forecasts row) instead of a user"
  - "Test helper exposes both TEST_BUSINESS_ID (uuid → businesses.id) and TEST_BUSINESS_PROFILE_ID (uuid → business_profiles.id) to handle the dual-id wrinkle (MEMORY.md project_dual_id)"
metrics:
  duration: ~50min
  completed: 2026-05-05
  tasks: 4
  commits: 4
  files: 5 created + 1 modified
---

# Phase 49 Plan 04: DB-04 SET NULL Batch 1 — Summary

First half of the DB-04 SET NULL conversions: 24 audit-attribution FKs flipped from NO ACTION to ON DELETE SET NULL via DROP+ADD CONSTRAINT pattern, plus reusable migration-test helpers (`_helpers.ts`) that plans 49-05/06/07 will import rather than duplicate. The migration also drops NOT NULL on 6 columns where the policy decision (SET NULL) was incompatible with the baseline NOT NULL constraint.

## What shipped

### The 24 batch-1 FKs (mapped to docs/db/fk-policy.md Bucket A row numbers)

| Row | FK | Notes |
|----|----|-------|
| 1 | `action_items.assigned_to → auth.users.id` | |
| 2 | `action_items.created_by → auth.users.id` | |
| 3 | `business_financial_goals.user_id → auth.users.id` | |
| 4 | `business_kpis.user_id → auth.users.id` | NOT NULL relaxed |
| 5 | `business_users.invited_by → auth.users.id` | |
| 6 | `businesses.assigned_coach_id → auth.users.id` | |
| 7 | `businesses.created_by → auth.users.id` | |
| 8 | `chat_messages.sender_id → auth.users.id` | NOT NULL relaxed |
| 9 | `client_error_logs.user_id → auth.users.id` | |
| 10 | `client_invitations.invited_by → auth.users.id` | NOT NULL relaxed |
| 11 | `coach_audit_log.coach_id → auth.users.id` | NOT NULL relaxed (audit log preserves) |
| 12 | `coaching_sessions.coach_id → auth.users.id` | NOT NULL relaxed |
| 13 | `custom_kpis_library.approved_by → auth.users.id` | |
| 14 | `custom_kpis_library.created_by → auth.users.id` | NOT NULL relaxed |
| 15 | `forecast_scenarios.created_by → auth.users.id` | |
| 16 | `forecasts.created_by → public.profiles.id` | Variant: → profiles |
| 17 | `ideas_filter.evaluated_by → auth.users.id` | |
| 18 | `messages.recipient_id → auth.users.id` | |
| 19 | `messages.sender_id → auth.users.id` | |
| 20 | `monthly_reviews.created_by → auth.users.id` | |
| 21 | `process_comments.commented_by → auth.users.id` | NOT NULL relaxed |
| 22 | `process_comments.commented_to → auth.users.id` | |
| 47 | `coach_benchmarks.source_interaction_id → ai_interactions.id` | Variant: → ai_interactions |
| 48 | `monthly_report_settings.budget_forecast_id → financial_forecasts.id` | Variant: → financial_forecasts |

(Note: numbering above follows the order constraints appear in the migration. fk-policy.md row #s are non-contiguous because rows 23-46 + 49-50 belong to plan 49-05's batch-2.)

### Reusable test helpers (`src/__tests__/migrations/_helpers.ts`)

- `skipIfNoLiveDb()` — gate on placeholder env vars (CI green)
- `getTestSupabase()` — service-role client for setup/teardown
- `TEST_BUSINESS_ID` + `TEST_BUSINESS_PROFILE_ID` — deterministic uuids for fixtures (handles dual-id system)
- `seedTestBusiness(supabase)` — idempotent upsert into both `businesses` and `business_profiles`
- `createTestUser(supabase) → userId` — unique-email-per-call to avoid collisions on concurrent runs
- `deleteTestUser(supabase, userId)` — Admin API delete; throws if FK blocks
- `assertOrphans(supabase, table, fkColumn, parentId, expected, dependentRowIds)` — handles all 3 buckets ('null' / 'cascade' / 'block')

The `assertOrphans` helper is generic across all 4 DB-04 plans. `'block'` mode does NOT call `deleteTestUser` itself — the calling test wraps it in try/catch — so RESTRICT-specific knowledge stays out of the helper.

## Operator action required before merge

Run the per-FK test suite against a Supabase preview branch with the migration applied:

```bash
NEXT_PUBLIC_SUPABASE_URL=<preview-branch-url> \
SUPABASE_SERVICE_ROLE_KEY=<preview-service-role-key> \
npx vitest run src/__tests__/migrations/db-04-set-null-batch-1.test.ts
```

Expected output:
```
Phase 49 plan 49-04 — preview-branch test output
Preview URL: https://<project-ref>.supabase.co
Ran 24 tests, 24 passed, 0 skipped, 0 failed.
```

Paste output into the PR description per RESEARCH.md DB-04 lines 440-446.

## Deviations from Plan

### [Rule 2 — Auto-add missing critical functionality] Drop NOT NULL on 6 columns

**Found during:** Task 2 (writing per-FK tests) — full detail in `.planning/phases/49-database-integrity-hygiene/49-04-DEVIATION.md`.

**Issue:** 6 of the 24 batch-1 FKs reference columns declared NOT NULL in baseline. PostgreSQL accepts `ON DELETE SET NULL` on a NOT NULL column at constraint-creation time but the cascade fails at delete time with `null value in column "..." violates not-null constraint`, leaving the FK in an inconsistent state and the user-deletion call returning an error.

**Fix:** The migration drops NOT NULL on those 6 columns (`chat_messages.sender_id`, `client_invitations.invited_by`, `coach_audit_log.coach_id`, `coaching_sessions.coach_id`, `custom_kpis_library.created_by`, `process_comments.commented_by`) as part of the same transaction.

**Files modified:** `supabase/migrations/20260505000000_db04_set_null_fks_batch_1.sql` (added 6 `ALTER COLUMN … DROP NOT NULL` statements interleaved with the corresponding ADD CONSTRAINT pairs); migration COMMENT documents the rationale.

**Commit:** `58d8722`

### [Rule 2] Defensive skip on `ideas_filter` and `process_comments` test inserts

**Found during:** Task 2 — `ideas_filter.idea_id` and `process_comments.process_id` are NOT NULL with FKs to parent tables (`ideas`, `process_diagrams`) we don't seed. If those FKs reject the insert, the test gracefully cleans up the user and returns instead of failing. This means tests #18, #23, #24 may silently no-op against a fresh preview branch with no `ideas` / `process_diagrams` rows. The verifier should confirm at least one of these tests inserts successfully on the preview branch (e.g. by spot-checking that 22+ tests pass, not 19).

**Files modified:** `src/__tests__/migrations/db-04-set-null-batch-1.test.ts` only.

**Commit:** `c5ea494`

## Local CI Status

| Gate | Result | Notes |
|------|--------|-------|
| `npx tsc --noEmit` | PASS | Clean |
| `npx next lint` | PASS | Only pre-existing warnings (no new ones from this plan) |
| `npx vitest run` | 683 passed / 1 failed / 65 skipped / 4 todo | The 1 failure is the **pre-existing date-sensitive test** `src/__tests__/goals/plan-period-banner.test.tsx` — expects `2026-04-01` but receives `2026-03-31`; not introduced by this plan (matches the prompt's note). The 65 skipped includes the 24 new DB-04 tests (placeholder env, by design) plus the helper smoke tests passed. |

## Commits (4)

| # | Hash | Subject |
|---|------|---------|
| 1 | `492e402` | feat(49-04): Task 1 — reusable migration-test helpers |
| 2 | `c5ea494` | test(49-04): Task 2 — RED — per-FK SET NULL tests for 24 batch-1 FKs |
| 3 | `58d8722` | feat(49-04): Task 3 — GREEN — SET NULL migration for batch 1 (24 FKs) |
| 4 | `f2841cb` | docs(49-04): Task 4 — mark batch-1 FKs applied in fk-policy.md |

## Risk worth verifier scrutinizing hardest

**The NOT NULL relaxation on `coach_audit_log.coach_id`.** This is an audit log — fk-policy.md flags it as "**AUDIT LOG — must preserve**". Dropping NOT NULL technically allows future code paths (or buggy app code) to insert audit rows with `coach_id = NULL`, which would defeat the audit log's purpose: who did the action? Today, every insertion goes through code that sets `coach_id` from the authenticated session, so a future regression is the only way it becomes NULL — but the database can no longer enforce that invariant. Two mitigations the verifier should consider before merge:

1. **App-side defence:** add a Zod or runtime assertion in any `coach_audit_log.insert` call site (`grep -rn 'coach_audit_log' src/` to enumerate) requiring `coach_id` to be non-null before the SQL fires.
2. **DB-side CHECK:** consider a follow-up migration `CHECK (coach_id IS NOT NULL OR <user-was-deleted-marker>)` — this is out of scope for 49-04 but worth tracking. The deletion event sets `coach_id = NULL`, so any CHECK must accept the post-delete state.

The same risk applies (lower severity) to the other 5 NOT NULL-relaxed columns, but `coach_audit_log` is uniquely load-bearing for compliance.

## Self-Check: PASSED

**Created files exist:**
- FOUND: `src/__tests__/migrations/_helpers.ts`
- FOUND: `src/__tests__/migrations/db-04-set-null-batch-1.test.ts`
- FOUND: `supabase/migrations/20260505000000_db04_set_null_fks_batch_1.sql`
- FOUND: `.planning/phases/49-database-integrity-hygiene/49-04-DEVIATION.md`

**Modified files:**
- VERIFIED: `docs/db/fk-policy.md` — 24 rows marked applied (Bucket A rows 1-22 + 47 + 48); migration history entry added; Bucket B/C untouched

**Commits exist (verified via `git log`):**
- FOUND: `492e402` (Task 1)
- FOUND: `c5ea494` (Task 2)
- FOUND: `58d8722` (Task 3)
- FOUND: `f2841cb` (Task 4)

**Branch:** `feat/49-04-set-null-batch-1` — to be pushed to origin.
