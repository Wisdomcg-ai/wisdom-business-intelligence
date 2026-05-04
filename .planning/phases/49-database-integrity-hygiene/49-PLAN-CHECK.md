# Phase 49 — Plan Check Verdict

**Date:** 2026-05-02
**Checker:** gsd-plan-checker
**Plans verified:** 49-01, 49-02, 49-03, 49-04, 49-05, 49-06, 49-07
**Inputs read:** PHASE.md, RESEARCH.md, all 7 PLAN.md files
**Reference checks:** baseline schema FK count (250 total, 194 with ON DELETE → 56 without — matches RESEARCH.md exactly), 2 filename violators present, 1 existing migration test (06C) confirming Wave 0 helper extraction is needed.

---

## VERDICT: PASS WITH NOTES

All 7 plans achieve their stated goals and the 5 PHASE.md success criteria are fully covered. The "audit was wrong" reframing is consistently honored across all 7 plans (delete-test-user, not delete-test-business; SET NULL skew, not CASCADE skew; auth.users.id, not businesses.id). No FULL or PARTIAL block. Two refinement-class notes (1 medium, 1 low) recommended below — neither blocks execution.

**Decision on the 24-FK-per-plan question:** **Keep as 2-way (24+24).** Reasoning detailed in the cross-plan section.

---

## PHASE.md Success Criteria Coverage

| # | Success Criterion | Plan / Task | Verdict |
|---|-------------------|-------------|---------|
| 1 | 8 financial tables expose `deleted_at` / `deleted_by` / `created_by` / `updated_by` (DB-01 + DB-02) | **49-01 Task 2** (single migration `20260504000000_db01_db02_db05_audit_columns_and_renames.sql`) + **Task 1** (introspection tests) | COVERED |
| 2 | `docs/db/fk-policy.md` exists with all 56 FKs documented + Matt's sign-off (DB-03) | **49-02 Task 1** (draft doc) → **Task 2** (operator-blocking checkpoint) → **Task 3** (apply decisions, mark ACTIVE) | COVERED |
| 3 | Preview-branch test deleting a test user shows zero orphan rows; per-FK behavior matches fk-policy.md (DB-04) | **49-04 Task 1** (Wave 0 `_helpers.ts` with `createTestUser` / `deleteTestUser` / `assertOrphans`) → **49-04..07 Tasks 2/3** (per-FK tests + migrations across all 4 plans, 56 FKs total) | COVERED — note that "test deleting a user" pattern is correctly implemented in the helper, not "test deleting a business" |
| 4 | `ls supabase/migrations/` shows every file in `YYYYMMDDHHMMSS_*.sql` form (DB-05) | **49-01 Task 3** (git mv on the 2 violators + CI regex tightening) + **Task 1** (vitest filename hygiene assertion) | COVERED |
| 5 | 3 `USING (true)` RLS policies carry explicit COMMENT recording intent (DB-06) | **49-03 Task 2** (comment-only migration `20260504000001_db06_rls_policy_intent_documentation.sql`) + **Task 1** (introspection test asserting `INTENT:` sentinel) | COVERED — no narrowing happens (per RESEARCH.md analysis: all 3 tables structurally lack a tenant column), so "regression test for narrowed policies" sub-clause does not trigger |

All 5 criteria have a clear delivery path. No gaps.

---

## Per-Plan Verdicts

### 49-01 — DB-01 + DB-02 + DB-05 (additive columns + filename hygiene)

**Verdict: PASS**

**Strengths:**
- Bundles 3 requirements into 1 PR correctly (same 8 tables, same `ALTER TABLE` pattern; DB-05 is a 2-file `git mv` that rides along with no extra risk).
- Migration filename `20260504000000_db01_db02_db05_audit_columns_and_renames.sql` is a 14-digit timestamp + descriptive slug — passes the new CI regex.
- Task 1 establishes the TDD pattern (3 introspection vitest files RED → migration GREEN) before the migration is authored.
- The trigger-absence caveat (RESEARCH.md's critical finding that `log_forecast_change` and `audit_employee_changes` are defined but never wired with `CREATE TRIGGER`) is captured in BOTH the migration COMMENT AND the plan SUMMARY expectations — backfill expectations are correctly set to "best-effort, many will be NULL".
- DB-05 includes the operator-run SQL block for production's `schema_migrations` table updates — properly flagged as a manual post-deploy step in the PR description, not a code change.
- The new `deleted_by` / `created_by` / `updated_by` FKs ship WITH `ON DELETE SET NULL` from day one — RESEARCH.md line 96 noted this prevents DB-04 from having to come back; plan honors that.

**Notes / scrutiny:**
- Task 2's `DO $$ … LOOP` block uses `format('CREATE INDEX IF NOT EXISTS idx_%s_deleted_at …', t, t)` — note the first `%s` (not `%I`) for the index-name suffix is correct because table names are simple identifiers without quoting needs in index names. Minor — works either way.
- Task 1's `db-02-audit-columns.test.ts` includes the assertion `SELECT count(*) FROM financial_forecasts WHERE created_by IS NULL` should be 0 — this assumes 100% backfill. It will be 0 ONLY because `financial_forecasts.user_id` is NOT NULL (baseline:2544). Correct, but worth noting the test will silently break if any future migration relaxes that NOT NULL.

**Rollback story:** Documented (DROP COLUMN on revert). Trivial.

---

### 49-02 — DB-03 (FK policy doc; operator-blocking; gates 49-04..07)

**Verdict: PASS**

**Strengths:**
- Single artifact (`docs/db/fk-policy.md`), single sign-off, naturally a gating plan.
- Task 1 lifts the FK enumeration verbatim from RESEARCH.md DB-03 (lines 237-323) — preserves the audit's correction.
- Task 1 explicitly instructs the planner to add the `Status` / `applied:` column to the bucket tables → enables the "fk-policy.md never goes out of sync" requirement (49-04..07 each Task 4 updates this column).
- Task 2 (operator checkpoint) explicitly forces Matt to make the businesses.owner_id call BEFORE 49-04 starts. The 3 options + their consequences are spelled out in detail.
- Task 3 reaches into the resume-signal text and flips Status from DRAFT to ACTIVE — clean handoff.

**Notes / scrutiny:**
- The TL;DR section explicitly says "the audit was wrong" up front — exactly the reframing required.
- Bucket counts in interfaces table say "~48 / ~5 / ~3" with `~` to allow Matt to shift 1-2 entries between buckets at sign-off without breaking the plan.
- One soft observation: the third Bucket C item is left as "TBD per 49-02 sign-off". This is intentional (operator surfaces it during checkpoint) but if Matt declines to add a third Bucket C item, only 2 will be in 49-07. The plan handles this implicitly (Task 2 of 49-07 says "1 per Bucket C FK"), so no blocker — just noting that the Bucket C count could be 2 not 3 and downstream plans tolerate it.

**Rollback:** doc-only; `git revert`. Trivial.

**fk-policy.md as single source of truth — verified:**
- 49-02 produces the doc with `applied:` annotations as part of the table schema.
- 49-04 Task 4 (mark batch 1 as applied), 49-05 Task 4 (batch 2), 49-06 Task 3 (Bucket B), 49-07 Task 4 (Bucket C + Phase complete) each update the doc.
- The "Migration history" running log section is appended to by every subsequent plan.
- **fk-policy.md never goes out of sync — confirmed.**

---

### 49-03 — DB-06 (RLS comments)

**Verdict: PASS**

**Strengths:**
- Comment-only migration — minimal blast radius. Task 1 RED → Task 2 GREEN works cleanly.
- Migration filename `20260504000001_…` (note `000001` suffix) sorts AFTER 49-01's `000000` — deterministic order between two Wave 1 migrations is correctly handled.
- The 3 policy names are listed verbatim (case-sensitive, including the long `Authenticated users can view swot templates` policy name with spaces). Task 2 calls out the silent no-op risk if names are mistyped, and Task 1's vitest catches it (post-migration assertion fails if `INTENT:` not present).
- Sentinel string `INTENT:` is the convention for future grep-based audits — surfaced clearly in `must_haves.truths`.
- No regression test required (nothing is narrowed) — correctly aligned with PHASE.md success criterion #5 wording.
- Task 2 includes a HALT/escalate path if the operator decides during execution that a policy SHOULD be narrowed (which would require a schema change, out of scope).

**Notes:** None substantive.

**Rollback:** Trivial — `COMMENT ON POLICY … IS NULL` would restore prior state.

---

### 49-04 — DB-04 SET NULL batch 1 (~24 FKs) + builds reusable test helpers

**Verdict: PASS** (this was the plan I scrutinized hardest given the 24-FK-per-plan question)

**Strengths:**
- **Wave 0 helper extraction is correctly placed here** (Task 1 builds `_helpers.ts` with all 5 named exports + `TEST_BUSINESS_ID`). Plans 49-05/06/07 import from it — no duplication. The `assertOrphans` helper handles all 3 modes (`'null'` / `'cascade'` / `'block'`) so the same helper serves all 4 DB-04 plans unchanged.
- TDD pattern: Task 2 RED (per-FK tests against unmigrated DB) → Task 3 GREEN (migration with DROP+ADD CONSTRAINT pattern) → Task 4 (fk-policy.md update). This is the correct sequence and makes 49-05/06/07 all repeatable variants of the same 4-task structure.
- `<interfaces>` block enumerates the 24 batch-1 FKs explicitly (with baseline line cites) → no ambiguity for executor about which FKs go in batch 1.
- The 3 re-bucketed FKs (`coach_benchmarks.source_interaction_id`, `forecasts.created_by → profiles`, `monthly_report_settings.budget_forecast_id`) are correctly identified as "non-auth.users tests" — Task 2 calls out the variant test pattern (create OTHER parent, not user).
- DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT pattern is correctly justified (Postgres doesn't support `ALTER CONSTRAINT … SET ON DELETE`).
- CI gate handling is correct: tests skip in CI placeholder mode (per the 06C convention), operator runs against preview branch with real env vars and pastes output in PR — RESEARCH.md DB-04 lines 440-446 endorsed Option 2.

**Notes / scrutiny:**
- The plan acknowledges the planner's flagged risk on context-window sizing: "PRs of 12+ migration files are still reviewable; 24 is too many. Half lets the second batch incorporate any lessons from the first." See cross-plan section for verdict.
- Task 2's `verify` block requires `≥20 it() blocks` (allowing batch sizing of ±2-4). Reasonable tolerance.
- The "insert dependencies" wrinkle (most affected tables have NOT NULL `business_id`) is correctly surfaced in `<interfaces>` — Task 1 adds `seedTestBusiness(supabase)` and `TEST_BUSINESS_ID` constant (matching 06C's deterministic-UUID convention).

**Rollback:** Reversible — DROP CONSTRAINT and re-add without ON DELETE clause. Documented in RESEARCH.md cross-cutting rollback table.

---

### 49-05 — DB-04 SET NULL batch 2 (~24 FKs)

**Verdict: PASS**

**Strengths:**
- Mirror of 49-04 structure. `depends_on: [44-05, 49-02, 49-04]` correctly sequences after 49-04 so helpers exist + lessons can propagate.
- Task 1 explicitly says "review 49-04 lessons; if no extension needed, no-op + record in SUMMARY". Doesn't force change for change's sake.
- Task 1 strictly forbids changing existing helper signatures (would break 49-04 batch-1 tests). Backward compatibility enforced.
- The 6 non-auth.users batch-2 FKs (self-FKs, `→ profiles`, `→ strategic_initiatives`, `→ quarterly_snapshots`) get a custom test pattern explicitly walked through in `<interfaces>`. Examples shown for `todo_items.parent_task_id` and `annual_snapshots.q[1-4]_snapshot_id`.
- Task 4 enforces: after this plan, 100% of Bucket A is annotated `applied:` (or surface discrepancy).

**Notes / scrutiny:**
- Plan's batch-2 enumeration (lines 81-108 of 49-05) lists 25 FKs by my count. Combined with batch-1's ~24, that's ~49, vs. RESEARCH.md's ~48 SET NULL — within the "± 1-2" tolerance the planner allowed. Acceptable.
- The plan is honest that "the signed-off `docs/db/fk-policy.md` is authoritative" — if Matt re-bucketed during 49-02 sign-off, batch-2's FK list adjusts automatically (Task 2 reads from fk-policy.md, not from the plan's `<interfaces>` block).

---

### 49-06 — DB-04 CASCADE batch (~5 FKs; highest risk; irreversible)

**Verdict: PASS**

**Strengths — this was the plan I scrutinized for safety carefully:**
- IRREVERSIBILITY warning is in 4 places: `must_haves.truths`, `<objective>` opening paragraph, Task 2 header COMMENT, and the PR description template. Cannot be missed.
- Each of the 5 CASCADE FKs has its own justification COMMENT in the migration (the planner enforces this in Task 2's action). E.g., `session_attendees.user_id` has dedicated rationale that distinguishes it from `session_attendees.added_by` (which goes to Bucket A).
- Test pattern (Task 1) includes THREE assertions per FK, not just one: (a) immediate cascade fires, (b) unrelated rows in the same table survive (bounded-cascade check), (c) grandparent survives (no upward cascade). This is materially stronger than 49-04/05's tests.
- PR description template includes a manual pre/post row-count verification block — operator dumps actual row counts before and after the test on a preview branch with realistic seed data. This is the audit trail for if production behavior ever surprises.
- Header COMMENT spells out: "PR review must confirm: (a) the cascade chain is bounded (no chain into the existing business_id CASCADE web), (b) the parent tables are NOT routinely deleted in app code without explicit user intent." — reviewer checklist embedded in the migration.

**Rollback callout — verified:**
- 49-06's plan explicitly notes irreversibility ("once these CASCADEs are live, deleting a parent in production destroys the children. Recovery requires a database backup").
- This matches RESEARCH.md cross-cutting rollback table line 702: "DB-04 CASCADE is irreversible if a delete fired in production."

**Notes:**
- `session_attendees.user_id` was originally in RESEARCH.md Bucket C (line 309) but RESEARCH.md re-bucketed to B with MEDIUM confidence ("defensible either way"). Plan correctly carries this forward AND surfaces it as the one to scrutinise during operator sign-off in plan 49-02. If Matt during 49-02 sign-off moves it back to A or C, the plan handles that (Task 2 reads from fk-policy.md as authoritative).

---

### 49-07 — DB-04 RESTRICT/manual review (~3 FKs incl. owner_id; operator-blocking)

**Verdict: PASS**

**Strengths:**
- Operator-blocking checkpoint at the START (Task 1) — re-confirms 49-02's businesses.owner_id decision after Matt has seen Buckets A and B ship. This is the "second look" before the load-bearing decision lands. Two checkpoints (49-02 + 49-07) give Matt two chances to revise.
- Task 1's how-to-verify explicitly references reading `49-02-SUMMARY.md`, `49-04/05/06-SUMMARY.md` for any surprises that would inform Bucket C. Lessons from earlier plans propagate.
- Task 2's RESTRICT test pattern is non-trivial — uses try/catch around `deleteTestUser`, asserts the catch fires, matches Postgres error message OR SQLSTATE 23503. Cleanup ordering (delete dependent first, then user) is correctly called out — a common test-flakiness footgun.
- Task 2 adds a meta-assertion: `SELECT delete_rule FROM information_schema.referential_constraints WHERE constraint_name = 'businesses_owner_id_fkey'` should equal `'RESTRICT'`. This is the assertion that RED→GREEN's the migration. Critical because the previous NO ACTION behavior was already blocking — the only observable change in BEHAVIOR is the explicit clause label.
- Task 3 includes a Phase 49 final-status block in the PR description (56/56 FKs covered, Sentinel 1 returns zero rows). Closes the loop.
- Task 4 marks fk-policy.md's status as ACTIVE — Phase 49 COMPLETE; adds the "Phase 49 Complete" section at top.

**Notes:**
- The `<interfaces>` Bucket C table has TBD entries for the 49-02 decisions — correct (operator captures during 49-02 checkpoint, this plan reads from fk-policy.md).
- Task 3's example SQL shows BOTH the RESTRICT (businesses.owner_id) and CASCADE (custom_kpis_library.business_id) variants. Future executor adapts to whatever Task 1 ratified.
- Plan correctly notes app-code follow-up: "any user-deletion flow must first call the business-reassignment / archival API. Surface to Matt in 49-07 SUMMARY." This is out of scope for 49-07 itself but flagged for a future phase.

---

## Cross-Plan Findings

### A. Audit-was-wrong reframing — VERIFIED across all 7 plans

The "FKs are 77% on auth.users.id, not businesses.id; test pattern is delete-test-user, not delete-test-business" reframing is consistently applied:

- 49-01: Migration adds `deleted_by`/`created_by`/`updated_by` as FKs to `auth.users(id)`, not `businesses(id)`. SET NULL on the new FKs from day one.
- 49-02: TL;DR opens with the reframing front-and-centre. Bucket A enumeration shows 41+ FKs to `auth.users.id`. The doc explicitly states "the audit was wrong about businesses.id".
- 49-03: N/A (RLS, not FK).
- 49-04: Test helper is `createTestUser` / `deleteTestUser` (not `…TestBusiness`). The 24 batch-1 FKs are mostly to `auth.users.id`. Per-FK tests `INSERT` row referencing the test user, then delete the user.
- 49-05: Same pattern. The 6 non-auth.users batch-2 FKs are correctly handled with table-specific create/delete pairs.
- 49-06: CASCADE test for `session_attendees.user_id` deletes a test user (not a business) and asserts attendance rows are gone.
- 49-07: RESTRICT test for `businesses.owner_id` deletes a test user; asserts the delete is blocked. Matches "delete a user, not a business" reframing.

**No plan still treats the audit's wrong framing as truth.** ✓

### B. The 24-FK-per-plan question — DECISION: KEEP AS 2-WAY (24+24)

**Reasoning:**
- Task atomicity: each batch is structured as 4 tasks (review helpers / TDD tests / GREEN migration / fk-policy.md update). The TDD step writes ~24 `it()` blocks, each ~10-15 lines (setup, insert, delete, assert, cleanup). That's ~360 lines of test code per batch.
- The migration itself is mechanical — DROP+ADD pairs per FK, ~10 lines each, ~240 lines total per batch. Mostly copy-paste with constraint-name substitution.
- Helpers are pre-built (49-04 Task 1) — executor doesn't re-derive the test pattern in 49-05.
- RESEARCH.md's confidence on Bucket A is HIGH — minimal per-FK decision-making during execution.
- One executor context window can hold: PHASE.md (~150 lines) + RESEARCH.md DB-03/04 sections (~600 lines) + fk-policy.md (~200 lines once filled in) + the plan (~400 lines) + ~600 lines of code generation. Total ~2000 lines well within budget.
- Splitting 4-way (12+12+12+12) would create 4 PRs to review where 2 would do, and each PR would have less material to amortize the review overhead against. Worse signal-to-noise for the reviewer.

**Counterargument considered:** if any single per-FK test takes more setup than expected (e.g., the 6 non-auth.users tests in batch 2 each need 3-4 fixture rows), batch 2 could exceed budget. **Mitigation:** the planner explicitly says in 49-04's `<objective>` that lessons from batch 1 propagate. If batch 1 reveals tests are heavier than expected, the operator can split batch 2 into 49-05a/05b at that point as gap-closure.

**No action required.** Keep 49-04 and 49-05 as-is.

### C. owner_id product decision flow — VERIFIED

- 49-02 Task 2 (operator checkpoint) explicitly asks: "businesses.owner_id: make the product call. CASCADE / SET NULL / RESTRICT" with the consequences spelled out for each option. Researcher recommends RESTRICT.
- 49-02 Task 3 records the decision in the doc with sign-off date.
- 49-07 Task 1 (operator checkpoint) explicitly references reading `49-02-SUMMARY.md` and re-confirming. The how-to-verify says: "Researcher recommendation: RESTRICT (block user delete until business reassigned/archived). Implications: [list of 3]."
- Neither 49-02 nor 49-07 ships the owner_id migration without explicit operator approval (both are `gate="blocking"` checkpoints).
- 49-07 Task 3's migration template shows the RESTRICT variant prominently with the rationale COMMENT.

**Two-checkpoint pattern confirmed.** ✓

### D. CASCADE batch (49-06) safety story — VERIFIED

- 49-06 has THE most thorough preview-branch test (3 assertions per FK: cascade fires, unrelated rows survive, grandparent survives). ✓
- Migration COMMENT includes IRREVERSIBILITY warning. ✓
- Each of the 5 CASCADE FKs has explicit justification — not just "default". E.g., `session_attendees.user_id` has dedicated rationale distinguishing it from `session_attendees.added_by`. ✓
- Test confirms no orphan rows survive AND unrelated rows are not touched (the "unrelated control" pattern). ✓
- PR description template includes manual pre/post row-count verification. ✓

### E. CI / preview-branch infrastructure — VERIFIED

- 49-04 Task 1 authors `src/__tests__/migrations/_helpers.ts` (the Wave 0 helper). ✓
- 49-05 Task 1 reviews/extends helpers (additive only; no signature changes). 49-06 / 49-07 reuse without modification. ✓
- Tests run in CI as `describe.skip` (placeholder env vars per 06C convention). Operator runs against preview branch with real env vars before merge; pastes output in PR. ✓
- This matches RESEARCH.md DB-04 lines 440-446's recommended Option 2 (skip-on-placeholder + operator-runs-locally).

### F. Migration filename hygiene (DB-05) — VERIFIED

- Old name → new name documented: `20260424_cfo_email_log.sql` → `20260424000000_cfo_email_log.sql`; `20260427_unique_active_forecast_per_fy.sql` → `20260427000000_unique_active_forecast_per_fy.sql`. ✓
- CI regex tightening captured (delete second `grep -v -E` line in `.github/workflows/supabase-preview.yml`). ✓
- Sanity note about renaming after applied to production: 49-01 Task 3 includes the `UPDATE supabase_migrations.schema_migrations SET version = …` operator-action SQL in the PR description. ✓

### G. Out-of-scope hygiene — VERIFIED

PHASE.md explicitly defers: destructive schema changes, historical `updated_by` backfill, helper function refactor, index tuning, SECURITY DEFINER changes. **No plan creeps in.** Verified by spot-checking each plan's `<objective>` and tasks:
- 49-01: only ADDs columns; no DROP. `updated_by` backfill is "from this point forward only" per the migration COMMENT — matches PHASE.md "out of scope: backfilling updated_by historically".
- 49-02: doc-only.
- 49-03: COMMENT-only on RLS policies; no policy DROP/CREATE.
- 49-04..07: only `DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT` — no column/table changes.

### H. Cross-plan data contracts — N/A

No shared data pipelines between plans. Each plan modifies disjoint schema objects (49-01 = additive columns, 49-02 = doc, 49-03 = RLS comments, 49-04..07 = FK constraints on different tables). The shared artifact is `docs/db/fk-policy.md`, which has a single-writer pattern (only one plan at a time updates it during sequenced waves). No contract violations.

### I. CLAUDE.md compliance

No `./CLAUDE.md` file in repo (RESEARCH.md confirmed). User MEMORY.md notes are honored:
- "Push only to wisdom-business-intelligence remote" — plans don't push directly; operator handles.
- "Go deep before deploying fixes" — RESEARCH.md was thorough; the audit-correction itself is evidence.
- "CFO-grade Xero accuracy" — relevant to FK policy: `business_id` FKs (which are auth-user-attribution-adjacent like `coach_audit_log.coach_id`) get SET NULL to preserve audit reconcilability.

Skip dimension: no rules to verify against beyond RESEARCH.md's own constraints.

---

## Recommendations for Executor

1. **Execute waves in strict order:** Wave 1 (49-01, 49-03 — parallel-safe), Wave 2 (49-02 — operator-blocking), Wave 3 (49-04 then 49-05 — sequential despite same wave; 49-05 depends on 49-04 helpers + lessons), Wave 4 (49-06), Wave 5 (49-07 — operator-blocking).

2. **49-02 operator checkpoint is the gate:** do NOT start 49-04/05/06/07 until Matt's sign-off in `docs/db/fk-policy.md` is committed and Status reads "ACTIVE". The plan correctly enforces this via `depends_on: [44-05, 49-02]` on each downstream plan.

3. **For 49-04 specifically:** before writing per-FK tests, read 49-04 `<interfaces>` block carefully — the 24 batch-1 FKs are enumerated explicitly. If any have been re-bucketed during 49-02 sign-off, the executor must propagate the change (and surface in 49-04 SUMMARY).

4. **For 49-06:** the manual pre/post row-count verification in the PR description is not optional. Run it on a preview branch with realistic seed data (the 3 production tenants — Fit2Shine, Dragon, IICT-HK if their data is in the preview seed).

5. **For 49-05/06/07:** do not modify `_helpers.ts` signatures. Add new helpers; don't change existing ones. 49-05 Task 1 enforces this.

6. **Soft note on 49-07's "third Bucket C item":** if Matt during 49-02 only surfaces 2 Bucket C items (not 3), 49-07 Task 2 should have 2 `it()` blocks not 3. The plan's `verify` block requires "≥3" — adjust the threshold to match if needed.

7. **fk-policy.md is the contract:** before authoring any DB-04 migration in 49-04..07, re-read fk-policy.md. The plan's `<interfaces>` block is a snapshot from RESEARCH.md; the live doc (post-49-02 sign-off) is authoritative.

---

## Summary

All 7 plans are coherent, internally consistent, and aligned with the RESEARCH.md correction of the audit. The decomposition (49-01 bundles low-risk additive work; 49-02 gates the policy decision; 49-03 ships in parallel; 49-04/05 split SET NULL into 2 reviewable batches; 49-06 isolates the irreversible CASCADEs with extra-thorough testing; 49-07 isolates the high-stakes RESTRICT/manual calls behind a second operator checkpoint) is the right shape. The two operator checkpoints (49-02 and 49-07) give Matt two chances to revise the businesses.owner_id call. The single Wave 0 (`_helpers.ts`) is correctly placed in 49-04 and reused by 49-05/06/07 without duplication. No FULL or PARTIAL block.

**Cleared for execution starting at Wave 1 (49-01 and 49-03 in parallel).**
