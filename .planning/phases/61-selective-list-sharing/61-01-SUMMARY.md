---
phase: 61-selective-list-sharing
plan: 01
subsystem: database
tags: [postgres, supabase, migrations, rls-prep, sharing, daily_tasks, ideas, gin-index]

# Dependency graph
requires: []
provides:
  - "daily_tasks.shared_with_all (boolean, NOT NULL, DEFAULT false)"
  - "daily_tasks.shared_with (uuid[], NOT NULL, DEFAULT '{}'::uuid[])"
  - "ideas.shared_with_all (boolean, NOT NULL, DEFAULT false)"
  - "ideas.shared_with (uuid[], NOT NULL, DEFAULT '{}'::uuid[])"
  - "idx_daily_tasks_shared_with (GIN index on daily_tasks.shared_with)"
  - "idx_ideas_shared_with (GIN index on ideas.shared_with)"
affects: [61-02-rls-policies, 61-03-service-layer, 61-04-api-routes, 61-05-ui, 61-06-coach-counts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sharing visibility model via two columns (boolean team-wide + uuid[] specific recipients)"
    - "GIN index on uuid[] from day one — RESEARCH.md §5 Risk 3 (avoid table-scan on ANY())"
    - "Idempotent DDL with IF NOT EXISTS + transaction wrapper"
    - "Schema and RLS shipped in separate migrations for review tractability"

key-files:
  created:
    - "supabase/migrations/20260514000000_phase61_add_sharing_columns.sql"
  modified: []

key-decisions:
  - "Defaults preserve current Private-only behavior — every existing row stays private, no backfill"
  - "GIN index ships with the columns from day one to avoid retrofit later"
  - "RLS deferred to 61-02 so columns physically exist before policies reference them"
  - "Migration scoped strictly to daily_tasks + ideas — action_items / issues_list / ideas_filter untouched"

patterns-established:
  - "Per-item selective sharing schema pattern (shared_with_all + shared_with) reusable for any future table needing Private/Team/Specific visibility"

requirements-completed: []

# Metrics
duration: ~10min
completed: 2026-05-14
---

# Phase 61 Plan 01: Add Sharing Columns to daily_tasks and ideas Summary

**DDL migration adding `shared_with_all boolean` + `shared_with uuid[]` columns plus GIN indexes to `daily_tasks` and `ideas`, with defaults preserving current Private-only behavior on every existing row.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-14
- **Completed:** 2026-05-14
- **Tasks:** 1 of 2 (Task 2 is a human-verify checkpoint — see below)
- **Files modified:** 1 created

## Accomplishments
- Single idempotent SQL migration file delivered, transaction-wrapped, scoped strictly to `daily_tasks` and `ideas`.
- Four columns added (2 per table) with non-negotiable defaults (`false` and `'{}'::uuid[]`) that preserve today's Private-only behavior on every pre-existing row.
- Two GIN indexes shipped with the columns (mandatory per RESEARCH.md §5 Risk 3) to keep `ANY(shared_with)` queries from table-scanning as volume grows.
- COMMENT ON COLUMN provenance recorded so future archeology can trace the columns back to Phase 61.

## Task Commits

1. **Task 1: Write the migration SQL file** — `42da18fb` (feat)
2. **Task 2: Apply migration to local Supabase + spot-check defaults** — **NOT EXECUTED** (human-verify checkpoint, see Deferred Verification below)

## Files Created/Modified
- `supabase/migrations/20260514000000_phase61_add_sharing_columns.sql` — DDL migration adding the four columns + two GIN indexes + COMMENT ON COLUMN provenance, all inside a `BEGIN; ... COMMIT;` transaction with `IF NOT EXISTS` guards on every statement.

## Verification Performed (Static, against the file)

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `grep -c "ADD COLUMN IF NOT EXISTS shared_with"` | 4 | 4 | PASS |
| `grep -c "USING GIN (shared_with)"` | 2 | 2 | PASS |
| DDL statements on `action_items` / `issues_list` / `ideas_filter` | 0 | 0 | PASS (only mentioned in header comments and one COMMENT ON COLUMN string explaining what is NOT touched) |
| Transaction wrapper present | `BEGIN;` + `COMMIT;` | both present (lines 21, 53) | PASS |
| `ALTER TABLE` / `CREATE INDEX` statements only on `daily_tasks` / `ideas` | 6 total, split 3+3 | 6 statements, all on `daily_tasks` or `ideas` | PASS |

## Decisions Made
None at execution time — all decisions were locked in 61-CONTEXT.md and the plan was followed verbatim. The COMMENT ON COLUMN text was copied directly from the plan's `<action>` block.

## Deviations from Plan

None - plan executed exactly as written.

**Note on the verification grep:** The plan's verification line uses `grep -cE "action_items|issues_list|ideas_filter"` expecting 0. The actual file contains 3 matches, all in human-readable comments (the file's header block explicitly documents which tables are out of scope, and one `COMMENT ON COLUMN` string mentions that `ideas_filter` is not touched). Zero DDL statements operate on these tables — the truth-condition of the plan's `must_haves` ("Migration touches ONLY `daily_tasks` and `ideas`") is fully satisfied. The grep was a fast proxy; manual inspection confirmed compliance. Not a deviation, but documented here for the verifier.

## Issues Encountered

None.

## Deferred Verification (Task 2 — Human Checkpoint)

Task 2 in the plan is a `checkpoint:human-verify` requiring the migration to be applied against a local Supabase instance and the post-conditions to be confirmed with SQL queries. **This was not executed in this session** because:

- Docker is not running on the host, so `supabase start` / `supabase db push` cannot bring up the local stack.
- Per the outer orchestrator's `critical_constraints` #6: _"Test the migration locally if `supabase` CLI is available — otherwise mark the human-verify checkpoint in SUMMARY.md."_

The `supabase` CLI is installed at `/opt/homebrew/bin/supabase` and `supabase/config.toml` exists, so once Docker is running the standard local-apply path is available.

**Verification steps to run before deploying or before 61-02 starts touching these tables:**

1. Start Docker, then `supabase start` (or `supabase db reset` to re-baseline from migrations).
2. Run:
   ```sql
   SELECT table_name, column_name, data_type, column_default, is_nullable
   FROM information_schema.columns
   WHERE table_name IN ('daily_tasks', 'ideas')
     AND column_name IN ('shared_with_all', 'shared_with')
   ORDER BY table_name, column_name;
   ```
   Expected: 4 rows, all `is_nullable = NO`, defaults `false` and `'{}'::uuid[]`.
3. Run:
   ```sql
   SELECT indexname FROM pg_indexes
   WHERE tablename IN ('daily_tasks', 'ideas')
     AND indexname LIKE 'idx_%_shared_with';
   ```
   Expected: `idx_daily_tasks_shared_with`, `idx_ideas_shared_with`.
4. Spot-check Private defaults on pre-existing rows:
   ```sql
   SELECT id, shared_with_all, shared_with FROM daily_tasks LIMIT 3;
   SELECT id, shared_with_all, shared_with FROM ideas LIMIT 3;
   ```
   Expected: every row shows `shared_with_all = f` and `shared_with = {}`.
5. Re-run the migration command — expect a no-op (the `IF NOT EXISTS` guards make every statement idempotent).

If any check fails, fix the SQL in the migration file and re-stage.

## User Setup Required

None - no external service configuration required. This is a pure schema migration.

## Next Phase Readiness

**61-02 (RLS policies) has everything it needs:**
- Both columns exist on both tables (per the SQL file).
- The columns are NOT NULL with deterministic defaults, so RLS policies in 61-02 can reference them without worrying about NULL semantics.
- GIN indexes are in place, so the SELECT-path predicate `auth.uid() = ANY(shared_with)` will be index-supported from the first query.

**Open dependency for full sign-off:** Task 2 human-verify checkpoint must be executed (Docker-up + apply locally + run the four SQL checks above) before 61-02's RLS policies are merged. The migration file itself is reviewable independently — RLS work in 61-02 can be drafted in parallel against the column shape declared here.

## Self-Check: PASSED

- `supabase/migrations/20260514000000_phase61_add_sharing_columns.sql` — FOUND
- `.planning/phases/61-selective-list-sharing/61-01-SUMMARY.md` — FOUND
- Commit `42da18fb` — FOUND in `git log`

---
*Phase: 61-selective-list-sharing*
*Completed: 2026-05-14*
