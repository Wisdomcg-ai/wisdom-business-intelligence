# Phase 49 Plan 04 — Deviation Note

## NOT NULL columns combined with ON DELETE SET NULL

**Found during:** Task 2 (writing per-FK tests)

**Issue:** Six of the 24 batch-1 FKs reference columns that are declared
NOT NULL in the baseline schema:

| FK | Column | NOT NULL? |
|----|--------|-----------|
| chat_messages.sender_id | `sender_id uuid NOT NULL` (baseline:2186) | YES |
| client_invitations.invited_by | `invited_by uuid NOT NULL` (baseline:2276) | YES |
| coach_audit_log.coach_id | `coach_id uuid NOT NULL` (baseline:2292) | YES |
| coaching_sessions.coach_id | `coach_id uuid NOT NULL` (baseline:2358) | YES |
| custom_kpis_library.created_by | `created_by uuid NOT NULL` (baseline:2461) | YES |
| process_comments.commented_by | `commented_by uuid NOT NULL` (baseline:3851) | YES |

PostgreSQL accepts `ALTER TABLE … ADD CONSTRAINT … ON DELETE SET NULL` on
a NOT NULL column at constraint-creation time — but the cascade fails at
delete time with `null value in column "..." violates not-null constraint`.
The dependent row stays referencing a now-deleted user, leaving the FK in
an inconsistent state, and the user-deletion call returns an error.

**Why this is in scope:** the policy decision in `docs/db/fk-policy.md`
is SET NULL for all six. Honoring the policy literally requires also
dropping the NOT NULL constraint on each column. Otherwise the SET NULL
clause is decorative and the test suite's `deleteTestUser` will fail
exactly the same way it would have before the migration — RED stays RED.

**Decision (Rule 2 — auto-add missing critical functionality):** the
migration drops NOT NULL on the six columns above as part of the same
transaction that adds the SET NULL clauses. This is additive (relaxing a
constraint, not adding one) and matches PHASE.md "additive-only" intent.
The migration COMMENT records the rationale for each.

**Alternative considered:** treat these six as Bucket C (RESTRICT) per
Principle 3 — "sole-relationship FKs → RESTRICT". Rejected because the
policy doc explicitly approved SET NULL for all six, and RESTRICT would
prevent legitimate user deletion (e.g., a coach leaving the platform
should not be blocked just because they sent chat messages).

**Risk surfaced for the verifier:** is there application code that
INSERTs these tables and assumes the columns are NOT NULL? A spot-check
via `grep -rn "sender_id\|invited_by\|commented_by" src/app/api` is
worth running before merge. Inserts pass an explicit value today; the
risk is reads that destructure without null-checks.

## Test pattern adjustments

For the three non-`auth.users.id` FKs in batch 1
(`coach_benchmarks.source_interaction_id`,
`forecasts.created_by → public.profiles.id`,
`monthly_report_settings.budget_forecast_id`), the test creates the
OTHER parent row instead of a user — per `<interfaces>` block of the
plan and RESEARCH.md DB-04 batch-2 notes.

For `business_financial_goals` and `business_kpis`, both use a `text`
business_id (legacy) rather than uuid, which is unrelated to this plan
but documented here so the verifier doesn't flag the test fixture as
inconsistent with `TEST_BUSINESS_ID` (uuid).
