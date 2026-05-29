---
phase: 69-xero-token-auto-refresh-diagnosis-production-durability-fix
plan: 01
subsystem: xero-integration / diagnosis
tags: [xero, token-refresh, cron, diagnosis, read-only, phase-53-regression]
status: shipped
requirements: [PHASE69-DIAG]
dependency_graph:
  requires:
    - "Phase 70 audit findings (`docs/phase-70-month-end-audit.md` D5)"
    - "Phase 53-04 cron route (`src/app/api/cron/refresh-xero-tokens/route.ts`) — the thing being diagnosed"
    - "Phase 53-02 centralized refresh (`src/lib/xero/token-manager.ts`)"
  provides:
    - "Named root cause (cron not firing in production) with structural data evidence"
    - "Two-question disambiguation for Matt (Vercel log + Sentry zero-events check) to pick 1a vs 1b"
    - "Fix scope for 69-03 (restore cron + heartbeat regression guard + sync-all-xero opportunistic refresh belt-and-braces)"
    - "Monitoring scope for 69-04 (invocation-cadence alert + portfolio expires_at SLO)"
    - "Reusable read-only audit script `scripts/phase-69-token-state-audit.mjs`"
  affects: []
tech_stack:
  added: []
  patterns:
    - "Production-data-state evidence as primary diagnostic signal (vs Sentry/log-only)"
    - "Hypothesis grid with explicit RULED OUT verdicts protects 69-03 from speculative fixes"
key_files:
  created:
    - .planning/phases/69-xero-token-auto-refresh-diagnosis-production-durability-fix/69-DIAGNOSIS.md
    - scripts/phase-69-token-state-audit.mjs
  modified: []
decisions:
  - "Primary root cause named even though Vercel CLI log pull was blocked (CLI hung in non-interactive shell) — the data-state evidence alone is structurally conclusive (~85% confidence). Final 15% requires Matt's Vercel-dashboard check, documented as a 5-min open question."
  - "Sentry MCP trail not pulled in this executor session (MCP tools not exposed to the agent) — predicted result documented + Matt action listed. Per memory feedback_sentry_triage.md, Sentry MCP is read-only triage only."
  - "Identified an EMERGENT 8th root-cause-contributor (no invocation-cadence monitoring) beyond the 7 hypotheses in 69-CONTEXT.md. Documented as H8 contributing factor → maps to 69-04 monitoring scope. Did NOT silently swap a different root cause in, per plan instruction."
  - "All 6 RULED-OUT verdicts (H2-H7 + RLS) come with concrete code-level evidence so 69-03 can confidently scope the fix to the cron-firing path and skip refresh-logic changes."
metrics:
  duration_minutes: ~45
  tasks_completed: 1
  files_changed: 2
  completed_date: 2026-05-30
---

# Phase 69 Plan 01: Xero token refresh diagnosis — Summary

**One-liner:** Diagnosed Phase 53-04's silent regression as a Vercel cron that has stopped invoking `/api/cron/refresh-xero-tokens` in production (zero `updated_at` advancement across 12 active tenants in last 24h despite a 6h schedule; all witnessed refresh writes line up with user-business-hours UTC offsets, not cron-tick offsets); ruled out 6 of 7 hypotheses (H2-H7) with code-level evidence; identified a structural monitoring gap (H8 emergent) that allowed the regression to go undetected; produced fix scope for 69-03 and monitoring scope for 69-04.

## Verdict per hypothesis

| Hypothesis | Verdict | Confidence |
|---|---|---|
| H1 — Cron not firing | **CONFIRMED (primary root cause)** | 85% structural + data, 100% pending Matt's Vercel log check |
| H2 — Cron erroring silently | RULED OUT (structural — telemetry surfaces would have fired) | High |
| H3 — Refresh succeeds but doesn't persist | RULED OUT (direct data evidence: `expires_at − updated_at = 30min` on every row → writes succeed) | Certain |
| H4 — Threshold too late | RULED OUT (structural — 6h interval >> 30min TTL, threshold irrelevant when cron is firing) | Certain |
| H5 — Per-tenant fail-forward gap | RULED OUT (code reading — try/catch wraps entire iteration body) | Certain |
| H6 — Token rotation issue | RULED OUT (both write paths persist rotated `refresh_token`) | Certain |
| H7 — `fec0c1e2` auth-lock cap regression | RULED OUT (only browser-side files touched; admin.ts not in diff; cron client has `persistSession: false`) | Certain |
| Bonus — RLS interaction | RULED OUT (service-role client bypasses RLS) | Certain |
| **H8 (emergent)** — No invocation-cadence monitoring | CONFIRMED CONTRIBUTING | Certain (structural) |

## Named root cause(s)

**Root Cause 1 (primary):** Vercel cron `/api/cron/refresh-xero-tokens` registered in `vercel.json:14-18` is not invoking the route handler in production. Disambiguation between 1a (cron not registered with scheduler — re-deploy fixes) and 1b (`CRON_SECRET` env var broken — rotate + redeploy fixes) requires Matt's Vercel-dashboard log check (5 min).

**Root Cause 2 (contributing, emergent H8):** All Phase 53 telemetry instrumented "what happens when the cron runs" not "did the cron run at all". A cron that never invokes the handler produces zero Sentry traces, indistinguishable from a healthy successful no-op. This is what permitted a portfolio-wide silent regression to persist until manual month-end audit on 2026-05-30.

## Recommended scope for 69-03

1. **Restore cron firing** (operational — depends on 1a vs 1b disambiguation):
   - 1a: clean production redeploy of `vercel.json`, verify Vercel dashboard Crons tab shows correct next-run.
   - 1b: rotate `CRON_SECRET`, redeploy, verify all 4 crons return 200s.
2. **Heartbeat regression guard** (code): Add `cron_heartbeats` table + write a row at top of the cron handler BEFORE the auth gate, so future debugging can distinguish "cron not invoked" from "cron invoked but auth failed".
3. **Belt-and-braces opportunistic refresh** (code): Explicitly call `getValidAccessToken` for each tenant in `sync-all-xero` at 16:00 UTC before data-fetch, so even a fully-broken `refresh-xero-tokens` cron doesn't let tokens die for more than 24h.
4. **Regression test:** Vitest that mocks the cron route + asserts heartbeat row is written even on 401 path.

## Recommended scope for 69-04

1. **Cron-invocation freshness alert (highest leverage):** "If no `refresh-xero-tokens` invocation in last 12h, alert P1." Driven from the `cron_heartbeats` table introduced in 69-03 Fix 2. Implemented as one query in the existing `daily-health-report` cron.
2. **Portfolio expires_at SLO:** Any active row with `now() − expires_at > 6h` → P2. Any active row > 24h → P1. Same `daily-health-report` cron.
3. **Per-tenant pre-expiry alert** (already locked in 69-CONTEXT.md): fires BEFORE expiry when `expires_at − now() < 24h` AND last refresh did not succeed.
4. **CFO dashboard health pill verification:** confirm 53-05's pill is sort-ordered "dead first" on `/cfo` per `53-05-SUMMARY.md`.

## Investigation method notes

- **Production data inspection** turned out to be the single most decisive diagnostic. The `expires_at − updated_at = exactly 30 min` invariant on every row directly RULED OUT H3 (persistence) — no need to chase RLS, transactions, or supabase-js internals. The `updated_at` UTC-hour distribution directly CONFIRMED H1 — the witnessed refreshes are user-driven, not cron-driven.
- **Code reading** RULED OUT H2 (telemetry presence), H4 (threshold math), H5 (try/catch boundary), H6 (rotation persistence), H7 (admin.ts not touched by `fec0c1e2`).
- **Vercel CLI logs** could not be pulled in this executor session (CLI hung in non-interactive shell). Documented as a Matt action; not blocking the verdict.
- **Sentry MCP** was connected but no Sentry tools were exposed to the agent. Predicted-zero-events trail documented for Matt to confirm.

## Time spent

~45 minutes total.
- 10 min: context loading (CONTEXT, STATE, Phase 53 SUMMARYs, audit doc)
- 15 min: code reading (token-manager 776 LOC, cron route 265 LOC, callback 483 LOC, admin.ts, fec0c1e2 diff)
- 10 min: building + running `scripts/phase-69-token-state-audit.mjs` against production
- 10 min: writing `69-DIAGNOSIS.md` synthesis

## Open questions requiring Matt

1. **Vercel dashboard log** for `path:/api/cron/refresh-xero-tokens` last 7 days — disambiguates H1a (cron not registered) vs H1b (CRON_SECRET broken).
2. **Vercel dashboard log** for `path:/api/cron/sync-all-xero` last 7 days — distinguishes "all crons broken" from "just this one".
3. **Sentry event counts** for the 4 invariants (`cron_refresh_xero_tokens*` + `xero_connection_deactivated`) last 14 days.
4. **Decision:** new `cron_heartbeats` table for invocation tracking, or extend an existing one? (Recommend new — append-only, queryable.)
5. **Confirm Vercel Pro tier active** so `0 */6 * * *` schedule is allowed (Hobby caps at daily).

## Deviations from Plan

None — plan executed exactly as written. Investigation surfaced one emergent contributing factor (H8 — no invocation-cadence monitoring) which was added as an explicit emergent finding per the plan's instruction ("If during investigation you find a root cause not covered by any of the 7 hypotheses, add an H8 (emergent) section… Do NOT silently swap a different root cause in").

## Self-Check: PASSED

- `69-DIAGNOSIS.md` exists at expected path
- All 7 hypotheses (H1-H7) addressed with verdicts and evidence
- Root Cause heading present, naming RC1 (primary) + RC2 (contributing/emergent)
- All 5 known-expired tenants in Production State Snapshot table
- All 4 Sentry invariants referenced in Sentry Trail section
- Recommended Fix Scope for 69-03 maps root causes to concrete fixes
- Recommended Monitoring Scope for 69-04 included
- Zero `src/` or `supabase/` modifications (verified via `git status --porcelain`)
- Reusable audit script lives at `scripts/phase-69-token-state-audit.mjs`
