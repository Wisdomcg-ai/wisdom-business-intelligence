---
phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
plan: 09
subsystem: infra
tags: [cron, observability, supabase, xero, vercel, monitoring]

requires:
  - phase: 69-xero-token-auto-refresh-diagnosis-production-durability-fix
    provides: cron_heartbeats table + recordHeartbeat helper (the data this script queries)
  - phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients
    provides: 70-01 snapshot baseline; 70-04 / 70-05 / 70-08 Xero-dependent verdicts whose trust level this check informs
provides:
  - Read-only cron-cadence health-check script (`scripts/70-09-C2-cron-heartbeat-check.mjs`)
  - Phase 70 close-out cron health snapshot (`70-09-cron-health-report.md`)
  - Empirical detection that Phase 69-04 migration is NOT yet applied to production Supabase as of capture (despite PR #231 merging the app code)
  - Reusable verification artifact — re-runnable after the migration lands to confirm first organic cron tick
affects: [phase-69-xero-token-durability post-deploy soak, phase-70-08-audit-reverification, future Vercel cron drift monitoring]

tech-stack:
  added: []
  patterns:
    - Read-only multi-cron heartbeat cadence query (per-cron classification + table-missing graceful detection)
    - WARN-not-BLOCK exit-code contract (warn loudly via stdout + report, always exit 0)
    - PGRST205 schema-cache-miss vs. genuine RLS / no-rows disambiguation (non-head probe required)

key-files:
  created:
    - scripts/70-09-C2-cron-heartbeat-check.mjs
    - .planning/phases/70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients/70-09-cron-health-report.md
  modified: []

key-decisions:
  - Classify TABLE_MISSING as UNKNOWN (not CRITICAL) — distinguishes "migration not yet applied" from "migration applied but cron silent"; both warn, neither blocks
  - Use non-head SELECT for tableExists() probe — head=true returned status=204 / error=null / count=null when relation was schema-cache-missing (false-positive "exists")
  - critical=true flag scoped to refresh-xero-tokens only — other crons (sync-all-xero, reconciliation-watch, daily-health-report, weekly-digest) are background ops whose silence wouldn't invalidate a Phase 70 verdict
  - Treat status='failed' AND status='partial' both as "failures_last_24h" — per Phase 70's "fresh Xero data" requirement, a partially-failed refresh tick is operationally equivalent to a failure for the affected tenant
  - Always exit 0 (WARN-not-BLOCK) per CONTEXT.md C2 contract — Phase 70 close is independent of cron health; only downstream verification freshness is affected

patterns-established:
  - Cron heartbeat cadence queries should distinguish 4 states (HEALTHY/WARN/CRITICAL/UNKNOWN), with UNKNOWN reserved for query failure (most often missing table)
  - Critical-cron loud-warning block in stdout when the load-bearing cron is unhealthy, even though exit code stays 0
  - Cross-reference Phase 69-04 monitoring runbook for escalation protocol rather than re-documenting

requirements-completed:
  - PHASE-70-VERIFY-C2

duration: 4min
completed: 2026-05-30
---

# Phase 70 Plan 09: C2 cron heartbeat health check Summary

**Read-only cron-cadence audit against `cron_heartbeats`; classifies all 5 vercel.json crons HEALTHY/WARN/CRITICAL/UNKNOWN; empirically detected that Phase 69-04 migration has NOT yet been applied to production Supabase despite PR #231's app-code deploy.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-30T22:22:54Z
- **Completed:** 2026-05-30T22:27:10Z
- **Tasks:** 1 (single-task plan)
- **Files modified:** 2 (1 script + 1 report)

## Accomplishments

- Built `scripts/70-09-C2-cron-heartbeat-check.mjs` (≈460 lines, 21 KB) — read-only, no flags, no mutations, queries all 5 vercel.json cron paths against `cron_heartbeats` and classifies each.
- Generated `70-09-cron-health-report.md` snapshot — Phase 70 close-out artifact answering "is the cron firing?" with empirical evidence (not assumption).
- **Empirical finding:** `cron_heartbeats` table is NOT yet present in production Supabase (PGRST205 — "Could not find the table 'public.cron_heartbeats' in the schema cache"). PR #231 merged the Phase 69-04 *app code* (cron route changes + heartbeat helper imports) but the *Supabase migration* (`supabase/migrations/20260530000000_phase69_cron_heartbeats.sql`) has not been applied to the production database.

## Task Commits

1. **Task 1: Build heartbeat-check script + generate health report** — `9967a7ae` (feat)

**Plan metadata:** (final commit follows — includes SUMMARY.md + STATE.md + ROADMAP.md)

## Files Created/Modified

- `scripts/70-09-C2-cron-heartbeat-check.mjs` — Read-only cron heartbeat cadence audit. Queries `cron_heartbeats` per cron_path for last_run / 24h tick count / 24h failure count; classifies HEALTHY (within cadence + zero 24h failures) / WARN (1×–2× cadence OR any 24h failures) / CRITICAL (≥ 2× cadence OR never) / UNKNOWN (query error / table missing). Loud stdout warning when critical-flagged refresh-xero-tokens is CRITICAL. Always exits 0 per WARN-not-BLOCK contract.
- `.planning/phases/70-.../70-09-cron-health-report.md` — Markdown snapshot of cron health at Phase 70 close. Includes per-cron summary table, Phase 70 implications section (explicit downstream consequences for 70-04 / 70-05 / 70-08), 24h recommendations, cross-references to Phase 69-04 monitoring runbook + PR #231.

## Empirical capture (2026-05-30T22:25Z)

| Cron path | Status | Last run | Cadence | Ticks 24h | Failures 24h |
|---|---|---|---|---|---|
| `/api/cron/refresh-xero-tokens` **(critical)** | UNKNOWN | NEVER | 6h | 0 | 0 |
| `/api/cron/sync-all-xero` | UNKNOWN | NEVER | 24h | 0 | 0 |
| `/api/cron/reconciliation-watch` | UNKNOWN | NEVER | 24h | 0 | 0 |
| `/api/cron/daily-health-report` | UNKNOWN | NEVER | 24h | 0 | 0 |
| `/api/cron/weekly-digest` | UNKNOWN | NEVER | 168h | 0 | 0 |

**All UNKNOWN because the table itself is not in the schema cache** — not because the crons are silent.

## Phase 69 verification verdict

**UNKNOWN — migration-not-applied, not cron-silent.**

This is a third distinct verdict beyond the plan's HEALTHY/WARN/CRITICAL trichotomy. The script handles it explicitly:

- **NOT** "Phase 69 deploy successful — cron firing on schedule" (HEALTHY)
- **NOT** "Cron firing but slightly stale — monitor next tick" (WARN)
- **NOT** "No heartbeat since deploy — Vercel may not have re-registered the cron" (CRITICAL — Vercel-side)
- **IS** "Phase 69-04 migration has not been applied to production Supabase. The cron may or may not be firing — without the heartbeat table we cannot tell."

**Root cause hypothesis:** Vercel deploys app code; it does NOT apply Supabase migrations. The Supabase preview-branch + manual-promote-to-prod workflow (per project conventions) means the migration in `supabase/migrations/20260530000000_phase69_cron_heartbeats.sql` ships with the codebase but only takes effect once the operator runs `supabase db push` (or the preview-branch merge auto-applies). The PR #231 merge to `main` shipped:
- Cron route changes (Phase 69-03)
- `src/lib/cron/heartbeat.ts` helper
- vercel.json registration
- The migration file itself (visible in git)

What it did NOT do automatically (per project conventions):
- Run the migration against the production Supabase project.

So the cron *may* be firing (the route code is live) and attempting to write heartbeats — but every write is failing with `relation "cron_heartbeats" does not exist`, swallowed silently by the fail-soft `recordHeartbeat` helper (per `src/lib/cron/heartbeat.ts` line 89–127: `try/catch` around the insert, never throws to the caller). This is *exactly* the fail-soft design intent — cron must never die from a telemetry failure — but it does mean we have no read-side evidence of cron firing until the migration lands.

## Recommendations for next 24h

**Immediate (Matt action — outside this plan's autonomous scope):**
1. Apply the Phase 69-04 migration to production Supabase. Either via `supabase db push` against the prod project, or via the standard preview-branch promotion if the migration is sitting in a preview state.
2. After migration lands, wait ≤ 6h for the first organic `refresh-xero-tokens` tick (next UTC boundary: 00:00 / 06:00 / 12:00 / 18:00).
3. Re-run `node scripts/70-09-C2-cron-heartbeat-check.mjs`. Expected output post-migration + post-tick: refresh-xero-tokens = HEALTHY, last run within 6h, ticks_24h ≥ 1.

**If migration is applied + 12h elapsed + still no heartbeats:**
- This is the genuine CRITICAL case: Vercel has not re-registered the cron despite PR #231.
- Escalate per `.planning/phases/69-xero-token-auto-refresh-diagnosis-production-durability-fix/69-04-MONITORING-RUNBOOK.md` Step 1 (Vercel Dashboard cron registration check + redeploy).
- If a second `vercel --prod` redeploy doesn't restore registration, activate the GitHub Actions fallback skeleton documented in 69-04-MONITORING-RUNBOOK.md.

**For Phase 70 close:** Per CONTEXT.md C2 contract, this check does NOT block Phase 70 close. The data backfills (70-02 through 70-07) operated on the *current* DB state regardless of token freshness; only the verification verdicts (70-04 / 70-05 / 70-08) that depend on "is the Xero data we just queried actually fresh?" carry a provisional asterisk until cron firing is empirically confirmed.

## Cross-reference to 70-08

70-08 (audit re-run via `scripts/phase-70-data-audit.mjs`) is running in parallel with this plan. Two scenarios:

- **If 70-08's verdicts come back GREEN/HEALTHY:** treat as PROVISIONAL until the heartbeat layer confirms refresh-xero-tokens is firing. The audit reads `xero_connections.expires_at` and `last_synced_at` — stale tokens would manifest as expired connections, but a connection that's fresh at audit time (because, say, an operator manually re-connected yesterday) doesn't prove the *cron* is keeping them fresh. The cron firing is the durability story; the audit confirms the point-in-time state.
- **If 70-08's verdicts flag expired/stale tokens:** that's stronger evidence the cron isn't running (or is running but failing). Combine with this report's UNKNOWN verdict: "no heartbeat evidence + expired tokens = cron almost certainly not firing in production; escalate immediately."

Either way, 70-08 does NOT need a re-run *because of this plan's findings* — it needs a re-run *after* the Phase 69-04 migration lands AND ≥ 6h of cron firing is observed, to confirm the durability story end-to-end.

## Decisions Made

- **Classify TABLE_MISSING as UNKNOWN, not CRITICAL.** CRITICAL means "the cron should be firing and isn't" — a Vercel-side fault. UNKNOWN means "we cannot tell whether the cron is firing" — a Supabase migration gap. Different root causes; different remediation paths; the report needs to discriminate.
- **Use non-head SELECT for table-existence probe.** `head: true, count: 'exact'` returns `status=204, error=null, count=null` when the relation is missing from PostgREST's schema cache — a false-positive "exists" signal. A regular `.select('id').limit(1)` returns the proper PGRST205 error envelope. Fixed mid-execution after the first run mis-classified the cron states as UNKNOWN with no `query_error` populated.
- **`critical=true` scoped to refresh-xero-tokens only.** The other 4 crons (sync-all-xero, reconciliation-watch, daily-health-report, weekly-digest) are background ops whose silence wouldn't invalidate a Phase 70 verdict. Refresh is the only one Phase 70 verification (70-04 / 70-05 / 70-08) materially depends on.
- **Combine status='failed' and status='partial' into failures_last_24h.** Per Phase 70's "fresh Xero data" requirement, a partially-failed refresh tick is operationally equivalent to a failure for the affected tenant — a partial WARN is correct WARN classification.
- **Always exit 0 per CONTEXT.md C2 WARN-not-BLOCK contract.** The script communicates via stdout + the markdown report + the loud warning block; exit code stays 0 even on CRITICAL so the script can be safely chained into CI/cron without taking Phase 70 close hostage.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed false-positive `tableExists()` probe**
- **Found during:** Task 1, first script run
- **Issue:** Initial probe used `.select('id', { count: 'exact', head: true })`. When `cron_heartbeats` is missing from PostgREST's schema cache, this returns `status=204, error=null, count=null` — looks like "table exists but empty" rather than "table missing". The script then ran 5 per-cron queries that each surfaced the real PGRST205 error, classifying every cron as UNKNOWN with a populated `query_error` but the report still claimed the table was present with 0 rows.
- **Fix:** Switched probe to `.select('id').limit(1)` — non-head SELECT, which returns the full PGRST205 error envelope. Added explicit detection for both `PGRST205` and `42P01` error codes plus the "Could not find the table" / "does not exist" / "relation" message substrings.
- **Files modified:** `scripts/70-09-C2-cron-heartbeat-check.mjs`
- **Verification:** Re-ran; got correct "cron_heartbeats table NOT present in this database" diagnostic + tableProbe.exists=false short-circuit + dedicated TABLE_MISSING report header.
- **Committed in:** `9967a7ae` (Task 1 commit; the fix was incorporated before the single Task 1 commit was made — visible in the file as-shipped).

**2. [Rule 2 - Missing Critical] Added UNKNOWN verdict beyond plan's HEALTHY/WARN/CRITICAL trichotomy**
- **Found during:** Task 1, while wiring the classification logic
- **Issue:** Plan spec listed 4 classification states (HEALTHY/WARN/CRITICAL/UNKNOWN) for individual cron checks but the expected_output block in the executor prompt only enumerated 3 Phase-69-verification verdicts (HEALTHY / WARN / CRITICAL). The plan's "table missing" branch was bundled into a generic "exit 0 with message" but not formally classified — which meant the report wouldn't visually distinguish "Phase 69 migration not applied" from "Phase 69 cron silent on Vercel side" (very different remediation paths).
- **Fix:** Added explicit TABLE_MISSING / UNKNOWN handling end-to-end: dedicated `## cron_heartbeats table NOT present` block in the report, dedicated "Status: UNKNOWN — `cron_heartbeats` table not present" implications branch, dedicated UNKNOWN recommendations block. This is the **actual** verdict observed in production at capture time, so the discrimination is load-bearing.
- **Files modified:** `scripts/70-09-C2-cron-heartbeat-check.mjs`
- **Verification:** Report output contains both the TABLE_MISSING-specific block and the UNKNOWN classification row for every cron, with the right remediation pointing to "apply the migration" rather than the wrong remediation pointing to "check Vercel dashboard".
- **Committed in:** `9967a7ae` (Task 1 commit).

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both auto-fixes essential. Without #1, the report would have falsely claimed "cron silent on Vercel side" when the actual root cause is "migration not yet applied to Supabase". Without #2, Matt would be sent down the wrong remediation path. No scope creep — both are inside the plan's read-only health-check mandate.

## Issues Encountered

- **Cannot test the HEALTHY / WARN / CRITICAL branches against live data.** The TABLE_MISSING branch is the only branch the production DB currently exercises. The other three classification branches are tested only at the code-level (pure functions with explicit threshold conditions). Once the migration lands and the first cron tick arrives, the next run will exercise HEALTHY (if all good), and we'll have empirical coverage of that branch.

## User Setup Required

None for this plan itself (read-only).

**Implicit next step for Matt (NOT a deviation, NOT in this plan's scope):** Apply the Phase 69-04 Supabase migration to production. The migration file is already in the codebase at `supabase/migrations/20260530000000_phase69_cron_heartbeats.sql` — it just needs to be run against the prod project (via `supabase db push` or the preview-branch promotion flow, per project convention).

## Next Phase Readiness

- Phase 70 close is NOT blocked by this finding (per CONTEXT.md C2 WARN-not-BLOCK contract). 70-08 verification can proceed in parallel; this plan does not gate it.
- The script is reusable and idempotent — re-runnable any time post-migration to confirm cron firing.
- **Follow-up to track at orchestrator level:** "Apply Phase 69-04 Supabase migration to production + re-run `scripts/70-09-C2-cron-heartbeat-check.mjs` to confirm HEALTHY status of refresh-xero-tokens before declaring the Phase 69 durability story end-to-end verified."

## Self-Check: PASSED

Script exists at `/Users/mattmalouf/Desktop/business-coaching-platform/scripts/70-09-C2-cron-heartbeat-check.mjs` (21 KB, all acceptance criteria met). Report exists at `/Users/mattmalouf/Desktop/business-coaching-platform/.planning/phases/70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients/70-09-cron-health-report.md` (53 lines, > 30 required). Commit `9967a7ae` present in git log.

---
*Phase: 70-production-data-backfill-migration-debt-cleanup-for-month-end-reporting-clients*
*Completed: 2026-05-30*
