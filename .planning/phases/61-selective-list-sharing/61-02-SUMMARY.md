---
phase: 61-selective-list-sharing
plan: 02
subsystem: database
tags: [postgres, supabase, rls, security-definer, sharing, daily_tasks, ideas, asymmetric-policies, rpc]

# Dependency graph
requires:
  - "61-01 (shared_with_all + shared_with columns must exist on both tables)"
provides:
  - "daily_tasks SELECT policy: daily_tasks_select_shared (owner OR team-wide+member OR explicit recipient)"
  - "ideas SELECT policy: ideas_select_consolidated (original 4 OR clauses preserved verbatim + 2 new sharing clauses)"
  - "public.mark_task_complete(p_task_id uuid, p_completed boolean) RETURNS public.daily_tasks — SECURITY DEFINER"
  - "public.mark_idea_status(p_idea_id uuid, p_status text) RETURNS public.ideas — SECURITY DEFINER"
affects: [61-03-service-layer, 61-04-api-routes, 61-05-ui, 61-06-coach-counts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Asymmetric RLS: SELECT broadened, INSERT/UPDATE/DELETE left strictly owner-only"
    - "SECURITY DEFINER status-flip RPC as the ONLY non-owner mutation channel"
    - "Manual visibility check inside SECURITY DEFINER (mirrors SELECT predicate), narrow column UPDATE"
    - "search_path = public on SECURITY DEFINER to defeat search-path injection"
    - "Preserve pre-existing RLS clauses verbatim when broadening — copy from baseline, never re-derive"
    - "SQLSTATE 42501 (insufficient_privilege) on access denied → API maps to HTTP 403"
    - "SQLSTATE 22P02 (invalid_text_representation) on bad enum-string input"

key-files:
  created:
    - "supabase/migrations/20260514000001_phase61_sharing_rls.sql"
  modified: []

key-decisions:
  - "Option B (dedicated SECURITY DEFINER RPC) chosen for status sync per RESEARCH.md §5 Risk 1"
  - "ideas allowed-status values sourced from src/lib/services/ideasService.ts IdeaStatus TS union — the DB has NO ideas_status_check constraint; the TS type IS the source of truth"
  - "INSERT/UPDATE/DELETE policies on daily_tasks AND ideas left strictly unchanged — recipients cannot rename/archive/delete via generic UPDATE"
  - "Ideas SELECT pre-existing four OR clauses (owner, super_admin, coach via assigned_coach_id, coach via profiles JOIN) copied VERBATIM from baseline_schema.sql lines 12100-12107; two new sharing clauses appended as additive ORs"
  - "Daily_tasks SELECT policy renamed from \"Users can view their own tasks\" → \"daily_tasks_select_shared\" to reflect the broadened model"

patterns-established:
  - "Asymmetric RLS + SECURITY DEFINER RPC for non-owner narrow-column mutation — reusable on any table that needs Private/Team/Specific visibility with bounded recipient capabilities"

requirements-completed: []

# Metrics
duration: ~2min (Task 1 only — Task 2 deferred, see Deferred Verification)
completed: 2026-05-14
---

# Phase 61 Plan 02: Asymmetric RLS + Status-Flip RPCs Summary

**Replaces the strict per-user SELECT on `daily_tasks`, broadens `ideas` SELECT additively, and adds two SECURITY DEFINER RPCs (`mark_task_complete`, `mark_idea_status`) as the ONLY non-owner mutation channel — owner-only INSERT/UPDATE/DELETE remain untouched, making recipient writes physically impossible outside the RPCs.**

## Performance

- **Duration:** ~2 min (Task 1)
- **Started:** 2026-05-14T23:14Z
- **Completed:** 2026-05-14T23:16Z
- **Tasks:** 1 of 2 (Task 2 is a human-verify checkpoint — see Deferred Verification)
- **Files modified:** 1 created (289 lines of SQL)

## Accomplishments
- **Asymmetric RLS landed.** SELECT broadened on both tables to (owner) OR (team-wide + business member via `auth_get_accessible_business_ids()`) OR (explicit recipient via `= ANY(shared_with)`). Mutations stay owner-only.
- **Ideas pre-existing clauses preserved verbatim.** All four legacy OR clauses (owner / super_admin / coach via `assigned_coach_id` / coach via businesses⨝profiles JOIN) copied byte-for-byte from baseline_schema.sql lines 12100-12107; two new sharing clauses appended as additive ORs. Coach/super_admin visibility is mathematically unchanged.
- **Two SECURITY DEFINER RPCs.** `mark_task_complete(uuid, boolean)` flips `status`/`completed_at`/`updated_at` only. `mark_idea_status(uuid, text)` flips `status`/`updated_at` only. Both perform their own visibility check (mirroring the SELECT predicate) and raise `SQLSTATE 42501` on access denied so the API layer can map cleanly to HTTP 403.
- **Hardened against search-path injection.** Both RPCs set `search_path = public` (SECURITY DEFINER best practice).
- **Permissions explicit.** `REVOKE ALL ON FUNCTION ... FROM PUBLIC` + `GRANT EXECUTE ... TO authenticated` on both RPCs.
- **Atomic + idempotent.** Whole file wrapped in BEGIN/COMMIT; `DROP POLICY IF EXISTS` + `CREATE OR REPLACE FUNCTION` make re-runs safe.

## Task Commits

1. **Task 1: Write the RLS + RPC migration SQL** — `20cba500` (feat)
2. **Task 2: Apply RLS migration locally + walk the 9-cell test matrix** — **NOT EXECUTED** (human-verify checkpoint, see Deferred Verification below)

## Files Created/Modified

- `supabase/migrations/20260514000001_phase61_sharing_rls.sql` (289 lines) — three sections:
  - **A** — daily_tasks: DROP old SELECT policy, CREATE `daily_tasks_select_shared` with broadened predicate. INSERT/UPDATE/DELETE policies untouched.
  - **B** — ideas: DROP old `ideas_select_consolidated`, recreate with original 4 OR clauses verbatim + 2 additive sharing clauses. INSERT/UPDATE/DELETE policies untouched.
  - **C** — Two SECURITY DEFINER RPCs (`mark_task_complete`, `mark_idea_status`) with explicit REVOKE PUBLIC + GRANT authenticated.

## Verification Performed (Static, against the file)

| Check | Expected | Actual | Status |
|---|---|---|---|
| File wrapped in `BEGIN;` / `COMMIT;` | both present | line 26 / line 289 | PASS |
| `CREATE POLICY` or `ON public.daily_tasks` refs | ≥1 | 5 | PASS |
| `mark_task_complete` / `mark_idea_status` symbol count | ≥3 | 13 | PASS |
| `GRANT EXECUTE ON FUNCTION public.mark_*` count | 2 | 2 | PASS |
| `REVOKE ALL ON FUNCTION public.mark_*` count | 2 | 2 | PASS |
| `auth_get_accessible_business_ids` references | ≥2 (policy + RPCs for both tables) | 5 | PASS |
| `CREATE OR REPLACE FUNCTION` count | 2 | 2 | PASS |
| `$$` body markers (must be even — 2 functions) | 4 | 4 | PASS |
| `RAISE EXCEPTION` count (2 auth + 2 access-denied + 1 invalid-status) | 5 | 5 | PASS |
| `ERRCODE = '42501'` count (2 auth + 2 access-denied) | 4 | 4 | PASS |
| `daily_tasks_status_check` values used in RPC (`'done'` / `'to-do'`) | both | both present in CASE | PASS |
| `v_allowed` array matches IdeaStatus TS union | 5 strings | `captured, under_review, approved, rejected, parked` (line 222) | PASS |
| DDL on forbidden tables (`action_items` / `issues_list` / `ideas_filter`) | 0 | 0 (single comment-only mention in header) | PASS |

### Note on the "forbidden tables" grep

The plan's automated verify line is `! grep -qE "action_items\|issues_list\|ideas_filter"` and expects zero matches. The file contains **1 match**, on line 18, in the header comment block explicitly documenting which tables are NOT touched by this migration:

```sql
-- Scope (NON-NEGOTIABLE): only `daily_tasks` and `ideas`. Do NOT touch
-- `action_items`, `issues_list`, `ideas_filter`, or `business_users` RLS.
```

Zero DDL statements (`CREATE POLICY`, `DROP POLICY`, `ALTER TABLE`, `CREATE FUNCTION`, etc.) operate on those tables — verified by `grep -E "^(CREATE|DROP|ALTER) (POLICY|TABLE|TRIGGER|FUNCTION|INDEX).*(action_items|issues_list|ideas_filter)"` which returns empty. The truth-condition of the plan's `must_haves` ("Migration touches ONLY `daily_tasks` and `ideas`") is fully satisfied. This is the same pattern documented in 61-01-SUMMARY.md.

## Decisions Made

### Source of truth for `ideas.status` allowed values

The plan instructed: "Validate `p_status` against the existing `ideas_status_check` constraint values (read them from baseline_schema.sql). Do NOT guess the allowed status strings."

**Investigation found:** No `ideas_status_check` constraint exists in the database. The `ideas` table CREATE TABLE block (baseline_schema.sql lines 3197-3210) declares `status text DEFAULT 'captured'::text` with no CHECK constraint. Grep across `supabase/migrations/` for `ideas_status\|ideas.*status.*check` returned zero post-baseline matches.

**Decision:** Use the canonical `IdeaStatus` TypeScript union from `src/lib/services/ideasService.ts:23` as the source of truth:

```typescript
export type IdeaStatus = 'captured' | 'under_review' | 'approved' | 'rejected' | 'parked';
```

This is the same enum the existing application code uses everywhere (e.g., `getIdeasStats` filters by `'captured'`, `'under_review'`, etc., lines 291-292). The RPC mirrors it:

```sql
v_allowed text[] := ARRAY['captured', 'under_review', 'approved', 'rejected', 'parked'];
```

This decision is documented in a comment block above `mark_idea_status` in the migration file so future archeology can find it. If a future migration adds a DB-level CHECK constraint, the RPC `v_allowed` and the TS type must be updated in lockstep.

### Daily_tasks SELECT policy rename

The original policy was named `"Users can view their own tasks"`. We DROP it and CREATE the broadened version as `daily_tasks_select_shared` — the new name reflects the broadened model and avoids confusion in `pg_policies` introspection. This is a pure rename; the INSERT/UPDATE/DELETE policies (`"Users can create their own tasks"`, etc.) keep their original names.

### Visibility check inside SECURITY DEFINER mirrors the SELECT policy

Both RPCs duplicate the SELECT predicate inline rather than relying on RLS (which is bypassed under SECURITY DEFINER). This is intentional:
- The function runs as `postgres`, so RLS doesn't apply on the inner SELECT.
- The explicit `WHERE id = p_id AND (visibility-predicate)` matches the SELECT policy exactly, so the RPC can never make a row visible to a caller who couldn't already SEE it via direct query.
- If a future migration broadens the SELECT predicate further, both the policy AND the RPCs must be updated in the same migration to keep them in sync. (Documented in the function COMMENT.)

## Deviations from Plan

**One documented adaptation, no functional deviation:**

The plan's `<read_first>` block told the executor to "find `ideas_status_check`" and copy the values verbatim. That constraint does not exist in the database — `ideas.status` is unconstrained at the DB level and validated only in TypeScript. The plan acknowledged this ambiguity in 61-02-PLAN-CHECK.md §"Issues found" and explicitly punted to the executor: "the executor copies-and-fills." The chosen fill (the `IdeaStatus` TS union) is the only source of truth that exists. This is documented in §Decisions Made above and in the migration file itself.

No other deviations.

## Issues Encountered

None.

## Deferred Verification (Task 2 — Human Checkpoint)

Task 2 in the plan is a `checkpoint:human-verify` requiring the migration to be applied to a local Supabase instance and the 9-cell test matrix walked manually with simulated JWT claims. **This was not executed in this session** because:

- Docker is not running on the host, so `supabase start` / `supabase db push` cannot bring up the local stack.
- This follows the same pattern as 61-01-SUMMARY.md §Deferred Verification (Docker-down → defer the human-verify checkpoint, document the queries).
- The `supabase` CLI is installed at `/opt/homebrew/bin/supabase`; `supabase/config.toml` exists.

### 9-cell test matrix to run before merging

Set up: in `psql`, simulate JWTs via `SET LOCAL "request.jwt.claims" = '{"sub":"<uuid>","role":"authenticated"}'` (or whatever pattern the repo's existing migration tests use — check `tests/migrations/*` or `verify-production-migration.ts`).

**daily_tasks (6 cells):**

| # | Cell | Setup | Predicate | Expected | Result |
|---|---|---|---|---|---|
| 1 | Private + non-owner | User A creates task, no sharing. JWT as user B. | `SELECT * FROM daily_tasks WHERE id = <task>` | 0 rows | NOT RUN |
| 2 | Team-wide + same-business teammate | A creates in business X, `shared_with_all=true`. JWT as B (active member of X). | same SELECT | 1 row | NOT RUN |
| 2b | Team-wide + different-business member | Same row, JWT as C (member of different business). | same SELECT | 0 rows | NOT RUN |
| 3 | Specific + targeted recipient | A creates, `shared_with = ARRAY[<D-uuid>]`. JWT as D. | same SELECT | 1 row | NOT RUN |
| 3b | Specific + non-targeted | Same row, JWT as E (not in array). | same SELECT | 0 rows | NOT RUN |
| 4 | Recipient UPDATE blocked | JWT as D (recipient from case 3). | `UPDATE daily_tasks SET title='hijacked' WHERE id=<task>` | 0 rows affected (RLS rejects) | NOT RUN |
| 5 | Recipient status flip via RPC succeeds | JWT as D. | `SELECT * FROM mark_task_complete(<task>, true)` | returns row, `status='done'`, `completed_at IS NOT NULL`. Owner re-SELECT confirms. | NOT RUN |
| 6 | Non-recipient RPC call fails | JWT as E (not in shared_with). | `SELECT mark_task_complete(<task>, true)` | RAISES `Task not found or access denied`, SQLSTATE `42501` | NOT RUN |

**ideas (3 cells):**

| # | Cell | Setup | Predicate | Expected | Result |
|---|---|---|---|---|---|
| 7 | Pre-existing super_admin clause still works | Insert system_roles row for user S, role='super_admin'. Create idea owned by A, no sharing. JWT as S. | `SELECT * FROM ideas WHERE id=<idea>` | 1 row | NOT RUN |
| 8 | `shared_with_all` idea visible to teammates | A creates idea in business X, `shared_with_all=true`. JWT as B (active member of X). | same SELECT | 1 row | NOT RUN |
| 9 | `mark_idea_status` invalid status | JWT as A (owner). | `SELECT mark_idea_status(<idea>, 'totally-not-a-status')` | RAISES `Invalid idea status: totally-not-a-status`, SQLSTATE `22P02` | NOT RUN |

### Full 9-cell × 2-table reference matrix (RESEARCH.md §6, for completeness)

| Mode | Owner | Recipient (`= ANY(shared_with)`) | Other team member | Non-member | Coach (via `assigned_coach_id`) | Super_admin |
|---|---|---|---|---|---|---|
| Private | see/edit/delete | n/a | n/a | n/a | ideas only (legacy) | ideas only (legacy) |
| Team-wide | see/edit/delete | n/a (all team members in scope) | see (new clause) | n/a | ideas + daily_tasks if member of business | always |
| Specific | see/edit/delete | see, mark status only via RPC | n/a | n/a | ideas only (legacy) | ideas only (legacy) |

Notes on coach/super_admin coverage:
- For `ideas`: coverage is unchanged from pre-phase (the 4 legacy OR clauses are preserved verbatim).
- For `daily_tasks`: coach/super_admin gain SELECT access via the team-wide clause only when `business_id` is set AND `shared_with_all=true` AND they're an active member or coach of that business (which `auth_get_accessible_business_ids()` enforces). There is no special super_admin clause on `daily_tasks` — consistent with RESEARCH.md §1 ("No super_admin clause" today) and CONTEXT.md ("Coach / super_admin visibility: unchanged").

### Run procedure when Docker is available

1. Start Docker; then `supabase start` (or `supabase db reset` to baseline + replay migrations).
2. Verify migrations applied: `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 2;` — expect `20260514000001` on top, `20260514000000` second.
3. Confirm policies exist:
   ```sql
   SELECT polname, cmd FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('daily_tasks', 'ideas')
    ORDER BY tablename, polname;
   ```
   Expected on `daily_tasks`: `daily_tasks_select_shared` (SELECT) + `Users can create their own tasks` (INSERT) + `Users can update their own tasks` (UPDATE) + `Users can delete their own tasks` (DELETE). Expected on `ideas`: `ideas_select_consolidated` (SELECT) + the existing INSERT/UPDATE/DELETE/coach_* policies unchanged.
4. Confirm RPCs:
   ```sql
   SELECT proname, prosecdef, proacl
     FROM pg_proc
    WHERE proname IN ('mark_task_complete', 'mark_idea_status')
      AND pronamespace = 'public'::regnamespace;
   ```
   Expected: both rows, `prosecdef = true`, `proacl` shows `authenticated=X/postgres` and NO `PUBLIC` execute.
5. Walk the 9-cell matrix above. Document pass/fail inline.
6. If any cell fails, fix the SQL and re-stage. Update this section before merging.

## User Setup Required

None — this is a pure schema/RLS migration. No external service configuration, no secrets, no manual UI step. Once Docker is up, the apply path is `supabase db push` (or `supabase db reset` for a clean baseline replay).

## Next Phase Readiness

**61-04 (API routes for share / status endpoints) has everything it needs:**

- `mark_task_complete(p_task_id uuid, p_completed boolean) RETURNS daily_tasks` — the 61-04 share endpoint's "mark complete" handler should call this RPC (e.g., via `supabase.rpc('mark_task_complete', { p_task_id, p_completed })`) instead of a generic UPDATE. The route returns 403 on `SQLSTATE 42501`.
- `mark_idea_status(p_idea_id uuid, p_status text) RETURNS ideas` — same pattern for ideas. Route returns 400 on `22P02` (invalid status), 403 on `42501` (access denied).
- The SELECT path is broadened, so READ endpoints in 61-03 / 61-04 will automatically return shared rows once the service layer fetches them — no extra filter needed on the route side, but `is_owner: row.user_id === requesterId` must be computed in the response for the UI badge.
- INSERT/UPDATE/DELETE policies are unchanged, so the `PATCH /api/todos/[id]/share` endpoint (which owner-mutates `shared_with_all`/`shared_with`) continues to work via the existing owner-only UPDATE policy — no new write policy needed.

**Coexists cleanly with 61-03 (this wave, parallel executor):** 61-03 modifies service-layer code (`ideasService` ownership gaps, ownership filters). It has zero overlap with this plan's SQL migration. The two waves merge cleanly.

**Open dependency for full sign-off:** Task 2 human-verify checkpoint (9-cell matrix, Docker-up + apply locally) must be executed before this migration ships to staging/prod. The migration file itself is reviewable independently; downstream service-layer / API / UI work in 61-03→61-06 can proceed in parallel against the policy + RPC shapes declared here.

## Self-Check: PASSED

- `supabase/migrations/20260514000001_phase61_sharing_rls.sql` — FOUND (289 lines)
- `.planning/phases/61-selective-list-sharing/61-02-SUMMARY.md` — FOUND (this file)
- Commit `20cba500` — FOUND in `git log`

---
*Phase: 61-selective-list-sharing*
*Plan: 02 — Asymmetric RLS + status-flip RPCs*
*Completed: 2026-05-14 (Task 1) | Task 2 deferred to Docker-available verification pass*
