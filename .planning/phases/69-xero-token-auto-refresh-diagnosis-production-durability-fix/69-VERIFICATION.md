---
phase: 69-xero-token-auto-refresh-diagnosis-production-durability-fix
verified: 2026-05-30T11:50:00Z
status: human_needed
score: 12/12 must-haves verified (automated); 2 follow-ups require post-deploy human verification
human_verification:
  - test: "After PR #231 merges and Vercel re-deploys, open Vercel Dashboard → Project → Settings → Crons and confirm all 5 cron entries (weekly-digest, sync-all-xero, reconciliation-watch, refresh-xero-tokens, daily-health-report) appear with `Next run` timestamps within their schedule windows."
    expected: "All 5 entries present, each with a valid Next-run timestamp within its schedule interval."
    why_human: "Vercel scheduler registration is platform-side state; the codebase cannot observe it. Requires authenticated dashboard view."
  - test: "12h after PR #231 deploys, run the cron_heartbeats cadence SQL from 69-04-MONITORING-RUNBOOK.md against production. Expect ≥2 rows for /api/cron/refresh-xero-tokens (the first 6h tick + the next one)."
    expected: "Each cron's last_heartbeat ≤ 2× its schedule interval. Specifically: refresh-xero-tokens ≤ 6h, daily crons ≤ 24h, weekly-digest ≤ 7d."
    why_human: "Requires production DB access + waiting for two organic cron ticks."
  - test: "Configure the 4 Sentry alerts named in 69-04-MONITORING-RUNBOOK.md (xero_token_pre_expiry, xero_connection_deactivated, cron_refresh_xero_tokens, cron_heartbeat_insert_failed/threw)."
    expected: "Each invariant-tag alert configured with the documented severity + threshold."
    why_human: "Sentry MCP is read-only per project memory; Matt configures alerts in the Sentry web UI."
---

# Phase 69: Xero Token Auto-Refresh Diagnosis + Production Durability Fix — Verification Report

**Phase Goal:** Diagnose why Phase 53's Xero token auto-refresh is not keeping production tokens alive (5 tenants found expired 3–7 days, JDS 20d stale), execute manual reconnects to unblock month-end, fix the root cause permanently with regression tests, add pre-expiry monitoring.

**Verified:** 2026-05-30T11:50:00Z
**Status:** human_needed (12/12 automated checks pass; 3 items require Matt's post-deploy verification on the feature branch `phase-69-xero-cron-durability` / PR #231)
**Re-verification:** No — initial verification.

## Goal Achievement

### Observable Truths

| #   | Truth                                                                | Status     | Evidence                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Diagnosis names a root cause with evidence                           | ✓ VERIFIED | `69-DIAGNOSIS.md` has explicit `## Root Cause` heading naming RC1 (Vercel cron not firing — H1) and RC2 (emergent H8, no invocation-cadence monitoring). Evidence: data-state snapshot showing `expires_at − updated_at = ~30min` and zero rows touched in last 24h on 12 active rows. |
| 2   | 5 production tenants reconnected                                     | ✓ VERIFIED | `69-RECONNECT-RUNBOOK.md` Reconnect Outcome table shows all 5 tenants (Envisage Malouf Family Trust, JDS Aeris, IICT Group Pty Ltd, IICT Aust Pty Ltd, IICT Group Limited HKD) with pre-reconnect dates 3–7d ago and post-reconnect `expires_at` at 2026-05-30T02:12–02:16Z. Final-state SQL block shows all 5 rows `is_active=true` with fresh `updated_at`. |
| 3   | vercel.json includes all cron routes on disk                         | ✓ VERIFIED | `vercel.json` declares all 5 crons. Disk has 5 directories under `src/app/api/cron/`: daily-health-report, reconciliation-watch, refresh-xero-tokens, sync-all-xero, weekly-digest. Each has a matching entry in `vercel.json`. `daily-health-report` (the previously-missing one) is now registered with schedule `0 7 * * *`. |
| 4   | Registration parity regression test exists                           | ✓ VERIFIED | `src/__tests__/vercel/cron-registration.test.ts` (116 lines) — 5 tests. Test 1 asserts disk→vercel.json; Test 2 asserts vercel.json→disk; Test 3 schedule sanity; Tests 4 & 5 pin daily-health-report + refresh-xero-tokens by name as phase-69 regression guards. **Bidirectional parity confirmed.** |
| 5   | cron_heartbeats table migration exists with RLS + append-only intent | ✓ VERIFIED | `supabase/migrations/20260530000000_phase69_cron_heartbeats.sql` — Table created with id/cron_path/ran_at/status/error_message/metadata. RLS ENABLED. Policy `cron_heartbeats_no_update` (`FOR UPDATE … USING (false) WITH CHECK (false)`) and `cron_heartbeats_no_delete` (`FOR DELETE … USING (false)`) explicitly block mutation. Service-role inserts only via bypass; super_admin SELECT for ops triage. |
| 6   | recordHeartbeat helper exists + called from every cron route         | ✓ VERIFIED | `src/lib/cron/heartbeat.ts` defines `recordHeartbeat()` (129 lines, fail-soft, double-catch around Sentry). Grep confirms imports + calls in **all 5 cron routes**: refresh-xero-tokens (lines 8, 152, 334, 353), sync-all-xero (4, 49, 74), reconciliation-watch (25, 65, 110, 130), daily-health-report (6, 196, 205), weekly-digest (5, 31, 208, 225). |
| 7   | 24h pre-expiry Sentry warning implemented                            | ✓ VERIFIED | `src/app/api/cron/refresh-xero-tokens/route.ts` lines 26–27 define `PRE_EXPIRY_WARNING_HOURS = 24` and `PRE_EXPIRY_WARNING_MS`. Lines 276–327 implement the per-row sensor: fires Sentry.captureMessage with `invariant: 'xero_token_pre_expiry'` when `msUntilExpiry > 0 && msUntilExpiry < PRE_EXPIRY_WARNING_MS` AND row's `last_status !== 'refreshed' && !== 'deactivated'`. Tags carry connection_id, business_id, tenant_id, hours_until_expiry, last_status. |
| 8   | Phase 53 invariants preserved                                        | ✓ VERIFIED | `npx vitest run src/__tests__/xero/phase-53-02-centralized-refresh.test.ts src/__tests__/xero/phase-53-token-manager-sentry.test.ts` → **2 files / 10 tests passed**, duration 949ms, exit 0. |
| 9   | Phase 69 new tests pass                                              | ✓ VERIFIED | `npx vitest run src/__tests__/vercel/cron-registration.test.ts src/__tests__/lib/cron-heartbeat.test.ts src/__tests__/api/cron-refresh-xero-tokens-pre-expiry.test.ts` → **3 files / 19 tests passed**, duration 458ms, exit 0. Note: `src/__tests__/xero/phase-69-refresh-regression.test.ts` does NOT exist — but is intentionally not needed because the executor pivoted away from H2–H7 code-mutation templates after Matt's investigation isolated the cause to Vercel platform registration (see 69-03-SUMMARY decisions). Phase 69 regression coverage instead lives in cron-registration.test.ts (codebase-side declaration drift) + cron-refresh-xero-tokens-pre-expiry.test.ts (pre-expiry sensor). |
| 10  | Typecheck clean                                                      | ✓ VERIFIED | `npx tsc --noEmit` → exit 0, no output. |
| 11  | No production code modified beyond documented fix scope              | ✓ VERIFIED | `git diff fec0c1e2 HEAD -- src/lib/xero/token-manager.ts` → empty. Token-manager core logic untouched. The only production-code modifications in src/app/api/cron/refresh-xero-tokens/route.ts are (a) heartbeat import + 3 recordHeartbeat call sites, (b) pre-expiry sensor block, (c) PRE_EXPIRY_WARNING_HOURS constant. All documented in 69-04 plan/summary. Other cron routes only added heartbeat instrumentation. |
| 12  | Monitoring runbook documents post-deploy verification SQL            | ✓ VERIFIED | `69-04-MONITORING-RUNBOOK.md` contains the literal cron_heartbeats cadence query (lines 70–80: `SELECT cron_path, MAX(ran_at) AS last_heartbeat, EXTRACT(EPOCH FROM (now() - MAX(ran_at))) / 3600 AS hours_since_last … GROUP BY cron_path`). Also includes the per-tenant pre-expiry SQL (lines 113–129) with EXPIRED/PRE_EXPIRY/STALE/VERIFIED CASE expression. Three additional sections (Post-Deploy Cron Registration Verification, GitHub Actions Fallback skeleton, Dual-Track Closure) added by 69-03. |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | ----------- | ------ | ------- |
| `69-DIAGNOSIS.md` | Named root cause with evidence | ✓ VERIFIED | 290 lines; primary RC + emergent contributing RC; 7/7 hypotheses verdicts with evidence references; reusable audit script `scripts/phase-69-token-state-audit.mjs` |
| `69-RECONNECT-RUNBOOK.md` | Reusable reconnect procedure + outcome table | ✓ VERIFIED | All required sections present (Pre-flight, Per-Tenant Reconnect Loop, Verification SQL, Reconnect Outcome, Final State, Operator Notes); 5/5 outcome rows; operator quirks captured |
| `vercel.json` | 5 crons declared | ✓ VERIFIED | All 5 entries present (weekly-digest, sync-all-xero, reconciliation-watch, refresh-xero-tokens, daily-health-report) |
| `src/__tests__/vercel/cron-registration.test.ts` | Bidirectional parity + named regression guards | ✓ VERIFIED | 5 tests, both directions, explicit pins on daily-health-report and refresh-xero-tokens |
| `supabase/migrations/20260530000000_phase69_cron_heartbeats.sql` | Table + RLS + append-only | ✓ VERIFIED | Table + index + RLS enabled + no-UPDATE/no-DELETE policies + super_admin SELECT |
| `src/lib/cron/heartbeat.ts` | Fail-soft helper | ✓ VERIFIED | recordHeartbeat() with double try/catch, sanitization (2000-char error, 50-key metadata cap), Sentry self-health invariants |
| `src/app/api/cron/refresh-xero-tokens/route.ts` | PRE_EXPIRY_WARNING_HOURS=24 + xero_token_pre_expiry emission | ✓ VERIFIED | Constant at line 26, sensor block lines 276–327, tags + extras as specified |
| `69-04-MONITORING-RUNBOOK.md` | Sentry alerts + cadence SQL + XeroHealthPill | ✓ VERIFIED | All 4 Sentry alerts documented, cadence query present, XeroHealthPill component location pinpointed, post-deploy verification protocol included |
| `src/__tests__/lib/cron-heartbeat.test.ts` | Helper regression coverage | ✓ VERIFIED | Exists, 6 cases per 69-04 summary, all pass |
| `src/__tests__/api/cron-refresh-xero-tokens-pre-expiry.test.ts` | Pre-expiry sensor regression coverage | ✓ VERIFIED | Exists, all pass |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| Every cron route on disk | vercel.json `crons[]` entry | Cron-path string match | WIRED | Verified by cron-registration.test.ts Test 1 |
| Every cron route handler | cron_heartbeats row | `recordHeartbeat(...)` call AFTER auth gate | WIRED | All 5 cron routes import heartbeat helper + invoke it ≥1 time on success path + failure path |
| refresh-xero-tokens cron | xero_token_pre_expiry Sentry invariant | `Sentry.captureMessage({tags: {invariant: 'xero_token_pre_expiry'}})` | WIRED | Lines 304–322 of route.ts |
| recordHeartbeat helper | cron_heartbeats table | `supabase.from('cron_heartbeats').insert(...)` | WIRED | heartbeat.ts line 82, fail-soft wrapping |
| 69-DIAGNOSIS named root cause (Vercel registration miss) | 69-03 fix (vercel.json modification + redeploy) | Adding daily-health-report entry forces Vercel to re-read crons array | WIRED | 69-03-SUMMARY documents this mapping explicitly |
| 69-RECONNECT-RUNBOOK pre-reconnect state | Post-reconnect state SQL verification | Final-state SQL block re-run after each tenant | WIRED | All 5 tenants verified `is_active=true` AND `expires_at > now() + 1h` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| Pre-expiry warning | `row.expires_at`, `row.business_id`, `row.tenant_id` | Sequential SELECT of `xero_connections WHERE is_active=true` on cron tick | Yes — real production rows | ✓ FLOWING |
| recordHeartbeat | `cronPath`, `status`, `metadata` | Cron route counters (refreshed/still_valid/failed/deactivated/total) | Yes — derived from real per-row outcomes | ✓ FLOWING |
| cron_heartbeats table | Inserted rows | recordHeartbeat() call after auth + handler completion | Yes — but only after PR #231 deploys to production | ⚠️ STATIC until deploy (intentional — phase is functionally complete on branch) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase 53 invariants preserved | `npx vitest run src/__tests__/xero/phase-53-02-centralized-refresh.test.ts src/__tests__/xero/phase-53-token-manager-sentry.test.ts` | 2 files / 10 tests passed, 949ms | ✓ PASS |
| Phase 69 new tests pass | `npx vitest run src/__tests__/vercel/cron-registration.test.ts src/__tests__/lib/cron-heartbeat.test.ts src/__tests__/api/cron-refresh-xero-tokens-pre-expiry.test.ts` | 3 files / 19 tests passed, 458ms | ✓ PASS |
| Typecheck clean | `npx tsc --noEmit` | Exit 0, no output | ✓ PASS |
| token-manager.ts unchanged | `git diff fec0c1e2 HEAD -- src/lib/xero/token-manager.ts` | Empty diff | ✓ PASS |
| Cron registration parity holds | Embedded in cron-registration.test.ts | 5/5 tests pass including bidirectional + named regression guards | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| PHASE69-DIAG | 69-01 | Named root cause with evidence; addresses all 7 hypotheses | ✓ SATISFIED | 69-DIAGNOSIS.md with 7 verdicts + RC1 + emergent RC2 |
| PHASE69-RECONNECT | 69-02 | 5 tenants reconnected interactively + reusable runbook | ✓ SATISFIED | 5/5 tenants confirmed in 69-RECONNECT-RUNBOOK.md Final State section |
| PHASE69-FIX | 69-03 | Root-cause fix + regression test for failure mode | ✓ SATISFIED | vercel.json edit (forces Vercel scheduler re-registration) + daily-health-report entry + cron-registration.test.ts regression guard. Note: original H2–H7 sub-actions deliberately skipped because Matt's investigation isolated cause to Vercel platform registration (per 69-03-SUMMARY deviation note). Phase 53 tests pass. |
| PHASE69-MONITOR | 69-04 | Pre-expiry monitoring + alerting | ✓ SATISFIED | xero_token_pre_expiry sensor + cron_heartbeats table + helper + rollout across 5 routes + runbook with 4 Sentry alerts + cadence query |

No ORPHANED requirements detected — all PHASE69-* IDs are emergent (not roadmap-mapped) and each maps to a shipped artifact.

### Anti-Patterns Scanned

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| `src/lib/cron/heartbeat.ts` | `metadata = {}` empty default, `errorMessage = null` default | ℹ️ Info | Intentional fail-soft defaults; not stub indicators |
| `src/app/api/cron/refresh-xero-tokens/route.ts` lines 323–325 | Empty catch `try { Sentry.captureMessage(...) } catch {}` | ℹ️ Info | Intentional — Sentry outage must not abort cron; matches Phase 53-04 pattern |
| `supabase/migrations/20260530000000_phase69_cron_heartbeats.sql` | `USING (false)` policies | ℹ️ Info | Intentional — no-UPDATE/no-DELETE explicit invariant documentation, not a placeholder |

No blockers. No warnings. No TODO/FIXME/PLACEHOLDER comments in any Phase 69 artifact.

### Human Verification Required

Three items below need Matt's hands-on action post-deploy. These are operational concerns downstream of the codebase ship and are documented in the runbook for self-service:

#### 1. Verify Vercel registers all 5 crons after PR #231 deploys

**Test:** Open Vercel Dashboard → Project → Settings → Crons. Confirm all 5 entries present with `Next run` timestamps within their schedule windows.
**Expected:** weekly-digest, sync-all-xero, reconciliation-watch, refresh-xero-tokens, daily-health-report all visible with valid next-run timestamps.
**Why human:** Vercel scheduler state is platform-side; codebase can't observe it. Requires authenticated dashboard view.

#### 2. Verify cron_heartbeats accumulates rows post-deploy

**Test:** 12h after PR #231 deploys, run the cron_heartbeats cadence query from `69-04-MONITORING-RUNBOOK.md` against production.
**Expected:** ≥2 rows for `/api/cron/refresh-xero-tokens` (2 cron ticks at 6h apart). All other crons show `hours_since_last ≤ 2× schedule interval`.
**Why human:** Requires production DB access + waiting for organic cron ticks. If 12h passes with zero rows for refresh-xero-tokens, escalate to GitHub Actions fallback skeleton in 69-04 runbook.

#### 3. Configure 4 Sentry alerts

**Test:** In Sentry web UI, create alert rules for invariants: `xero_token_pre_expiry`, `xero_connection_deactivated`, `cron_refresh_xero_tokens`, `cron_heartbeat_insert_failed`/`cron_heartbeat_insert_threw`.
**Expected:** Each alert configured per severity + threshold specified in `69-04-MONITORING-RUNBOOK.md` "Sentry Alert Configuration" section.
**Why human:** Sentry MCP is read-only per project memory; alerts configured in Sentry UI.

### Gaps Summary

No code-level gaps found. The phase is functionally complete on branch `phase-69-xero-cron-durability` / PR #231.

One nominal "missing artifact" — `src/__tests__/xero/phase-69-refresh-regression.test.ts` named in the 69-03 plan frontmatter — is **intentionally absent** per documented executor pivot in `69-03-SUMMARY.md`. The original 69-03 plan was written before the root cause was confirmed and contained hypothesis-conditional templates for H2–H7. After Matt's Vercel dashboard check confirmed RC = Vercel platform registration (not token-manager code logic), the executor correctly skipped speculative H2–H7 code mutations and shipped only the H1-equivalent fix (vercel.json edit + bidirectional parity test in `cron-registration.test.ts`). Phase 53 invariant tests + Phase 69 cron-registration + cron-heartbeat + pre-expiry tests together cover the regression surface that the original phase-69-refresh-regression.test.ts file would have covered.

Three downstream operational verifications (Vercel dashboard inspection, post-deploy heartbeat observation, Sentry alert configuration) remain for Matt — all documented in `69-04-MONITORING-RUNBOOK.md`. None block the codebase ship.

---

_Verified: 2026-05-30T11:50:00Z_
_Verifier: Claude (gsd-verifier)_
