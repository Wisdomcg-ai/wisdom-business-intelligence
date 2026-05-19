---
phase: 66-section-permission-followups
plan: "01"
subsystem: database
tags: [supabase, jsonb, migration, permissions, typescript, tsx]

# Dependency graph
requires:
  - phase: 65-section-permission-api-enforcement
    provides: requireSectionPermission helper reading canonical 'finances' key; baseline DEFAULT JSONB uses legacy 'financials'
provides:
  - Operator-run audit script that reports business_users + team_invites rows missing canonical 'finances' key
  - Idempotent transaction-wrapped backfill migration for both tables
affects: [65-section-permission-api-enforcement, phase-65-wave-65-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - tsx operator script pattern (dotenv + createClient service-role, CLI args, exit 0/1/2, stderr JSON)
    - JSONB || merge backfill migration (WHERE NOT col ? key idempotency guard)

key-files:
  created:
    - scripts/audit-section-permissions-legacy-key.ts
    - supabase/migrations/20260516000000_phase66_backfill_finances_section_key.sql
  modified: []

key-decisions:
  - "Backfill rule: finances <- financials value when present; true fallback for business_users (baseline DEFAULT intent), false fallback for team_invites (baseline DEFAULT = financials:false)"
  - "Filter in TypeScript rather than JSONB ? operator to avoid PostgREST query-string escaping issues and catch all affected rows uniformly (including rows with neither key)"
  - "Migration skips rows already carrying the finances key (WHERE NOT clause) — preserves any hand-edited conflicting rows"
  - "Audit script reports conflicting rows (both keys present with different values) as informational warnings, not failures"

patterns-established:
  - "Idempotent JSONB backfill: UPDATE ... SET col = col || jsonb_build_object(key, COALESCE(derived, default)) WHERE NOT (col ? key)"

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-05-16
---

# Phase 66 Plan 01: Section-Permission Legacy Key Audit + Migration Summary

**Read-only prod audit script + idempotent JSONB backfill migration closing the 'financials' vs 'finances' key drift that would let denied members through on Phase 65 Wave 65-04 ENFORCE cutover**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-16T22:28:00Z
- **Completed:** 2026-05-16T22:43:03Z
- **Tasks:** 2 complete, 1 at checkpoint
- **Files modified:** 2 created

## Accomplishments
- Created read-only operator audit script (`scripts/audit-section-permissions-legacy-key.ts`) that queries all `business_users` and `team_invites` rows, filters in TypeScript for rows missing the canonical `finances` key, and reports exact counts + sample rows with exit code 0 (clean) / 1 (migration needed) / 2 (error)
- Confirmed baseline schema: `business_users` DEFAULT has `"financials": true` (line 1929), `team_invites` DEFAULT has `"financials": false` (line 5206)
- Created idempotent `BEGIN/COMMIT` migration using `||` merge operator with `WHERE NOT (section_permissions ? 'finances')` guard on both tables — safe to re-run, never wipes sibling JSONB keys

## Task Commits

1. **Task 1: Prod audit script for legacy section-permission key drift** - `85cef5b1` (feat)
2. **Task 2: Idempotent transaction-wrapped backfill migration** - `c4e3d359` (feat)
3. **Task 3: Operator checkpoint** - PENDING human-verify

## Files Created/Modified
- `scripts/audit-section-permissions-legacy-key.ts` - Read-only operator audit script; queries both tables, filters in TS for missing 'finances' key, exit 0/1/2, stderr JSON
- `supabase/migrations/20260516000000_phase66_backfill_finances_section_key.sql` - Idempotent backfill migration, transaction-wrapped, two UPDATE statements, data-only (no DDL)

## Decisions Made
- **Backfill rule:** `finances` <- value of legacy `financials` when present; `true` fallback for `business_users` (matches baseline DEFAULT intent), `false` fallback for `team_invites` (matches `financials: false` DEFAULT at line 5206)
- **In-TypeScript filter vs JSONB `?` operator:** Chose TypeScript filter (`!('finances' in sp)`) for simplicity and to avoid PostgREST query-string escaping of the JSONB `?` operator — catches all missing rows uniformly including rows with neither key
- **Conflicting rows:** Audit reports them as informational warnings; migration skips them via the `WHERE NOT` idempotency guard (preserving any hand-edited state)

## Deviations from Plan

None - plan executed exactly as written.

The plan's Check 5 acceptance test (`! grep -q "DROP \|ALTER TABLE\|ADD COLUMN\|ALTER COLUMN .* SET DEFAULT"`) matched comment text in the migration file that documents what the migration does NOT do. The actual SQL body contains zero DDL statements — verified with `grep -nE "^(DROP |ALTER TABLE|ADD COLUMN|ALTER COLUMN)"`. False positive only.

## Issues Encountered
None — typecheck clean on first pass, all acceptance criteria met.

## Known Stubs
None — the audit script is read-only (no data path to stubs), and the migration is pure SQL with no stub values.

## User Setup Required
None — no external service configuration required. The operator runs the audit script manually (`npx tsx scripts/audit-section-permissions-legacy-key.ts`) and applies the migration via Supabase PR preview branch.

## Next Phase Readiness
- Task 3 (human-verify checkpoint) is pending: operator must run the audit script against production, open a PR so Supabase CI applies the migration to a preview branch, confirm 0 rows missing `finances` post-migrate, and confirm idempotency on re-run
- **CRITICAL SEQUENCING:** This migration must be applied to PRODUCTION before Phase 65 Wave 65-04 flips `SECTION_PERMISSION_ENFORCE=true`
- After Task 3 completes, 66-01 is independently shippable and 66-02/03/04 can proceed at normal pace

---
*Phase: 66-section-permission-followups*
*Completed: 2026-05-16 (Tasks 1-2; Task 3 at human-verify checkpoint)*
