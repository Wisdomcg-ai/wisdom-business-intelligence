---
phase: 69-xero-token-auto-refresh-diagnosis-production-durability-fix
plan: 03
subsystem: xero-cron-registration
tags: [xero, cron, vercel, observability, regression-guard, deploy-protocol]
dependency_graph:
  requires:
    - 69-01 (diagnosis confirmed Vercel scheduler did not register refresh-xero-tokens despite vercel.json being correct since PR #110)
    - 69-04 (cron_heartbeats table + cadence query land the runtime detection half; this plan lands the codebase-side invariant + cron registration fix)
  provides:
    - daily-health-report cron registered in vercel.json (was on disk since a0c11751 but never scheduled)
    - Force re-registration of all crons (Vercel re-reads vercel.json from scratch on every production deploy that touches it)
    - PR-time regression guard `src/__tests__/vercel/cron-registration.test.ts` — every cron route on disk must be declared, every declaration must have a route on disk
    - Post-deploy verification runbook section — three-step protocol (visual dashboard check immediately after deploy, cadence-query check at 12h, 7-day daily soak)
    - GitHub Actions backup fallback documented (NOT built — escape hatch for the next-but-one regression)
    - Dual-track closure note documenting 69-02 retroactive reconnect + 69-03 forward fix are both required for Phase 69 completeness
  affects:
    - vercel.json (5 cron entries total, was 4)
    - Future PRs that touch src/app/api/cron/* (now CI-gated against declaration drift)
tech_stack:
  added: []
  patterns: [cron-registration-parity, force-redeploy-as-fix, codebase-runtime-double-gate]
key_files:
  created:
    - src/__tests__/vercel/cron-registration.test.ts
  modified:
    - vercel.json
    - .planning/phases/69-xero-token-auto-refresh-diagnosis-production-durability-fix/69-04-MONITORING-RUNBOOK.md
key_decisions:
  - "The original 69-03 plan was written before the root cause was known (hypothesis-conditional sub-action templates H1–H7). User investigation between plan write-up and execution confirmed root cause is Vercel platform-level cron registration miss (not code bug). Executor pivoted: skip all H2–H7 code-mutation sub-actions; apply the H1 fix (re-registration via vercel.json modification) + add a codebase-invariant regression test + extend the runbook. Zero modifications to src/lib/xero/token-manager.ts or the core logic of src/app/api/cron/refresh-xero-tokens/route.ts — root cause is registration, not code."
  - "daily-health-report schedule chosen as `0 7 * * *` UTC = 17:00 AEST / 18:00 AEDT. Start of AU business day after the prior day rolls over so Matt's morning inbox shows yesterday's portfolio health summary. Spaced 9h after sync-all-xero (16:00 UTC) and 13h after reconciliation-watch (18:00 UTC) so it observes a settled state."
  - "Regression test lives at `src/__tests__/vercel/cron-registration.test.ts`. Pure fs+JSON.parse — no Vercel API auth required, deterministic in CI. Asserts both directions (declared-but-missing AND declared-without-route) plus explicit phase-69 regression guards naming refresh-xero-tokens and daily-health-report so any future removal triggers a PR-review-time failure mentioning Phase 69 by name."
  - "GitHub Actions backup fallback is documented in the runbook but NOT built. Rationale: vercel.json modification + redeploy IS the published fix path for this Vercel failure mode. Dual-write semantics (Vercel + external cron) introduce a second secret-management surface and concurrent-invocation reasoning for a problem that may not recur. Built only if 12h post-deploy check fails OR the regression recurs within 90 days."
metrics:
  duration: ~3 min
  tasks_completed: 3 (vercel.json fix + regression test + runbook extension)
  files_created: 2 (test + this summary)
  files_modified: 2 (vercel.json + monitoring runbook)
  tests_added: 5 (vercel cron registration parity)
  tests_passing: 49/49 across 8 cron-related + Phase 53 invariant test files
  completed_date: 2026-05-30
---

# Phase 69 Plan 03: Apply confirmed root-cause fix (Vercel cron registration) Summary

Forward-fix the Vercel-scheduler "silent cron registration drop" symptom by editing vercel.json (forcing Vercel to re-read + re-register every cron on next production deploy), adding the previously-missing `daily-health-report` entry, and locking the codebase-side invariant via a PR-time regression test. Pairs with 69-02 (retroactive reconnect of the 5 dead tenants) to fully close Phase 69.

## What shipped

### 1. vercel.json — daily-health-report registered + force re-registration

Added the 5th cron entry:

```json
{ "path": "/api/cron/daily-health-report", "schedule": "0 7 * * *" }
```

`daily-health-report` route has existed at `src/app/api/cron/daily-health-report/route.ts` since commit `a0c11751` (Phase 46-04, 2026-05-10), with full CRON_SECRET auth + Sentry capture + (since 69-04) heartbeat wiring. It was never declared in vercel.json so Vercel never invoked it. This commit closes the gap.

Schedule choice: `0 7 * * *` UTC = 17:00 AEST / 18:00 AEDT — start of AU business day after the prior day rolls over. Spaced from existing daily crons (sync-all-xero at 16:00 UTC, reconciliation-watch at 18:00 UTC) so it observes a settled portfolio state when sending Matt's morning summary.

The vercel.json edit itself is the primary fix: per Vercel docs, crons re-register on every production deploy that includes vercel.json. The 24-day silent absence of `refresh-xero-tokens` invocations (confirmed by Matt's dashboard check, per 69-DIAGNOSIS.md root cause 1) was Vercel's scheduler having silently dropped registration despite vercel.json being unchanged since PR #110. Editing vercel.json + redeploying forces a full re-read.

### 2. `src/__tests__/vercel/cron-registration.test.ts` — PR-time invariant guard

New test file with 5 tests (all literal `phase-69` in describe/test names per the plan's acceptance criteria):

1. **Every cron route on disk has a matching vercel.json entry** — fs walk of `src/app/api/cron/*/route.ts`, JSON parse of `vercel.json`, set-difference. Detailed failure message names the missing path(s) and prints a skeleton crons[] entry to add.
2. **Every vercel.json cron entry has a route file on disk** — opposite-direction set-difference. Detects stale declarations that would 404 in production.
3. **Every cron entry has a non-empty schedule string** — schema sanity.
4. **phase-69 regression guard: daily-health-report is registered** — explicit pin of the secondary regression.
5. **phase-69 regression guard: refresh-xero-tokens is registered** — explicit pin of the primary cron.

Pure fs + JSON.parse. No Vercel API auth required. Runs in standard vitest CI. Would have caught the daily-health-report miss at PR-time when commit `a0c11751` landed.

### 3. `69-04-MONITORING-RUNBOOK.md` — three new sections appended

**Post-Deploy Cron Registration Verification** — the protocol that would have caught Phase 69 within 12h instead of 24 days:
- Step 1 (immediately after `vercel --prod`): visual check of Vercel Dashboard → Project → Settings → Crons. Every vercel.json entry must appear with correct schedule + `Next run` within window.
- Step 2 (12h post-deploy): cadence SQL query (from 69-04). Expected per-cron `hours_since_last`: ≤6h for refresh-xero-tokens, ≤24h for daily crons, ≤7d for weekly-digest.
- Step 3 (7-day soak): re-run cadence query daily. Alert threshold per cron = `2 × <its schedule interval>` (e.g. refresh-xero-tokens missing > 12h → P1).

**Backup: GitHub Actions Fallback (mentioned, NOT built)** — escape hatch for a recurring regression. Skeleton workflow at `.github/workflows/cron-fallback-refresh-xero-tokens.yml` with secret-mgmt notes. Built only if the 12h post-deploy check fails or the regression recurs within 90 days.

**Dual-Track Closure (69-02 + 69-03)** — explicit note that the vercel.json fix does NOT retroactively revive the 5 dead refresh tokens. 69-02's manual reconnect (retroactive) and 69-03's cron re-registration (forward) are both required for full Phase 69 closure.

## What did NOT change (intentional)

Zero modifications to:
- `src/lib/xero/token-manager.ts` — root cause is platform registration, not code logic. H3, H6 hypothesis-conditional sub-actions in the original plan were ruled out by 69-DIAGNOSIS data evidence (every existing row has `expires_at − updated_at = 30min`, proving persistence works).
- Core logic of `src/app/api/cron/refresh-xero-tokens/route.ts` — already structurally sound per H2/H5 ruling. 69-04 already added heartbeat + pre-expiry sensor. No further code mutation needed.

The diagnostic gap (no telemetry for "cron didn't run at all") was closed in 69-04 by `cron_heartbeats`. The codebase-side declaration invariant is closed by the new regression test. The Vercel-side scheduler registration is fixed by the act of editing vercel.json + redeploying.

## Test status

- New: `src/__tests__/vercel/cron-registration.test.ts` (5 tests) — all pass.
- Phase 53 invariants pinned (no regression):
  - `src/__tests__/xero/phase-53-02-centralized-refresh.test.ts` — pass.
  - `src/__tests__/xero/phase-53-token-manager-sentry.test.ts` — pass.
- Phase 69-04 sibling tests still pass:
  - `src/__tests__/lib/cron-heartbeat.test.ts` (6 cases) — pass.
  - `src/__tests__/api/cron-refresh-xero-tokens.test.ts` (9 cases) — pass.
  - `src/__tests__/api/cron-refresh-xero-tokens-pre-expiry.test.ts` (8 cases) — pass.
  - `src/__tests__/api/cron-sync-all.test.ts` — pass.
  - `src/__tests__/api/reconciliation-watch-cron.test.ts` — pass.

Total scoped: **49/49 pass**. `npx tsc --noEmit -p tsconfig.json` exit 0.

## Deviations from Plan

### Plan-vs-execution divergence (locked by user investigation)

The 69-03 plan was written before the root cause was known. It contained 7 hypothesis-conditional sub-action templates (H2 cron silent error, H3 refresh not persisting, H4 threshold too late, H5 fail-forward gap, H6 rotation not persisted, H7 auth-lock cap) intended to be applied based on whatever 69-DIAGNOSIS named.

By execution time, the user (Matt) had completed the post-diagnosis investigation: Vercel dashboard showed ZERO invocations of `/api/cron/refresh-xero-tokens` in the last 7 days — not even 401s. Combined with vercel.json being correct since PR #110, Vercel plan being Pro (cron-allowed), and CRON_SECRET being shared with the still-firing `sync-all-xero` cron, this isolated the failure to Vercel platform-level registration drop.

**Executor pivot:** skip H2–H7 code-mutation templates (they target hypotheses ruled out by the data). Apply the H1 fix (force re-registration via vercel.json edit) + add the codebase-invariant regression test + extend the runbook with the post-deploy verification protocol. Track this as Rule 4-equivalent "fix shape changed under us" rather than a discovered deviation — the user's investigation provided the locked decision, so no checkpoint was needed.

### Auto-fixed Issues

None. The vercel.json fix is a single-entry addition (and the act of touching the file forces re-registration). The regression test was written first-try and passed on the post-fix vercel.json. The runbook extension is pure documentation. No bugs surfaced during execution.

No authentication gates occurred.

## Known Stubs

None.

## Action Required From Matt

1. **Merge + deploy** this PR. The act of `vercel --prod` deploying with the modified `vercel.json` is what forces Vercel's scheduler to re-register every cron. No additional steps.
2. **Immediately after deploy**, check Vercel Dashboard → Project → Settings → Crons. Confirm all 5 cron entries appear with `Next run` timestamps within their schedule windows. Per the runbook's Step 1, if any are missing, redeploy once more; if still missing on second redeploy, escalate to the GitHub Actions fallback.
3. **At 12h post-deploy**, run the cadence SQL query (see 69-04-MONITORING-RUNBOOK.md). Expected: at least 2 `refresh-xero-tokens` rows in `cron_heartbeats` (one at the post-deploy tick, one at the next 6h tick). Zero rows = registration still broken; escalate.
4. **7-day soak**: re-run the cadence query daily for the first week. Any cron going stale > 2× its interval = regression; escalate.
5. **Coordinate with 69-02**: the 5 dead tenants (Envisage, JDS, IICT × 3) need the manual reconnect from 69-02 — the vercel.json fix does NOT revive their expired refresh tokens. Recommend running 69-03 deploy first (so reconnected tenants land in a working-cron environment).

## Post-deploy verification steps (per plan output spec)

1. **Force-near-expiry test (optional, can wait for organic data):** in production, manually set one row's `expires_at` to `now() + 5h` via Supabase Studio (super_admin only). Wait for the next 0/6/12/18 UTC cron tick. Within 6h:
   - Sentry should show `xero_token_pre_expiry` event with the corresponding `connection_id` tag (from 69-04 pre-expiry sensor).
   - `cron_heartbeats` should show a fresh row for `/api/cron/refresh-xero-tokens` (from 69-04 heartbeat wiring).
   - The row's `expires_at` should advance to `now() + 30min` (cron refreshed proactively).
2. **Organic verification:** if step 1 isn't run, monitor cadence query for 24h post-deploy. 4 rows for refresh-xero-tokens in any 24h window = healthy. If `cron_heartbeats` shows zero rows for refresh-xero-tokens after 12h, Vercel registration is still broken — escalate to GitHub Actions fallback.

## Self-Check: PASSED

- `vercel.json` — daily-health-report entry FOUND (5 cron entries total)
- `src/__tests__/vercel/cron-registration.test.ts` — FOUND (5 tests, all pass)
- `.planning/phases/69-xero-token-auto-refresh-diagnosis-production-durability-fix/69-04-MONITORING-RUNBOOK.md` — three new sections appended (Post-Deploy Cron Registration Verification, Backup: GitHub Actions Fallback, Dual-Track Closure)
- `.planning/phases/69-xero-token-auto-refresh-diagnosis-production-durability-fix/69-03-SUMMARY.md` — this file FOUND
- Commit `9f45271b` (Task 1 — vercel.json fix) — FOUND
- Commit `dae84591` (Task 2 — regression test) — FOUND
- Commit `2f869896` (Task 3 — runbook extension) — FOUND
- `npx vitest run` scoped to Phase 69 + Phase 53 invariants — 49/49 pass
- `npx tsc --noEmit -p tsconfig.json` — exit 0
- `grep -c "phase-69" src/__tests__/vercel/cron-registration.test.ts` → 3 matches (describe block + 2 regression-guard test names)
- Zero modifications to `src/lib/xero/token-manager.ts` (as required — root cause is registration, not code)
- Zero modifications to core logic of `src/app/api/cron/refresh-xero-tokens/route.ts` (as required — 69-04 already added the heartbeat + pre-expiry sensor)
