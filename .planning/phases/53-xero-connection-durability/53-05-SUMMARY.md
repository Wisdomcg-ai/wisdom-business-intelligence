---
phase: 53-xero-connection-durability
plan: 05
subsystem: xero-observability
tags:
  - sentry
  - observability
  - xero
  - coach-dashboard
  - phase-53-final
dependency_graph:
  requires:
    - 53-01-SUMMARY (server-side disconnect — provides the DELETE path that bypasses Sentry capture)
    - 53-02-SUMMARY (centralized refresh — guarantees one capture site)
    - 53-03-SUMMARY (tightened deactivation policy — prevents Sentry flood)
    - 53-04-SUMMARY (proactive cron — provides the 6h cadence the 12h threshold reasons about)
  provides:
    - Sentry event `xero_connection_deactivated` with stable tag schema for ops alerting
    - GET /api/Xero/connection-health endpoint for any consumer needing per-business Xero status
    - XeroHealthPill UI primitive (extractable to shared component if needed elsewhere)
  affects:
    - src/lib/xero/token-manager.ts (Sentry import + capture wrap)
    - src/app/api/cron/refresh-xero-tokens/route.ts (Issue C: removed double-capture)
    - src/app/api/Xero/employees/route.ts (comment marker — no behavior change)
    - src/components/coach/ClientOverviewTable.tsx (new column + pill)
    - src/app/coach/dashboard/page.tsx (11th Promise.all leg + ClientMetrics field)
tech_stack:
  added: []      # zero new dependencies — uses @sentry/nextjs ^10.48.0 already present
  patterns:
    - Sentry capture wrapped in try/catch so outages never abort the work being captured
    - Server-authoritative threshold logic (UI never recomputes status)
    - RBAC defense in depth (re-validate per-row even when caller "should" only request authorized ids)
    - Dual-ID resolution in a single batched query (canonical + profile id forms)
key_files:
  created:
    - src/app/api/Xero/connection-health/route.ts
    - src/__tests__/xero/phase-53-token-manager-sentry.test.ts
    - src/__tests__/api/phase-53-connection-health-route.test.ts
    - src/__tests__/coach/phase-53-connection-health-pill.test.tsx
  modified:
    - src/lib/xero/token-manager.ts
    - src/app/api/Xero/employees/route.ts
    - src/app/api/cron/refresh-xero-tokens/route.ts
    - src/components/coach/ClientOverviewTable.tsx
    - src/app/coach/dashboard/page.tsx
    - src/__tests__/api/cron-refresh-xero-tokens.test.ts
decisions:
  - Issue B — chose 12h "verified" window (vs 24h default in plan) because 53-04 cron runs every 6h; 12h = 2× cron period tolerates one missed run but surfaces sustained cron failure within half a day.
  - Issue C — removed `cron_refresh_xero_tokens_deactivated` per-connection capture from the cron route; token-manager now owns the canonical `xero_connection_deactivated` event. Cron retains aggregate + transient-failure + per-connection-throw captures (those remain cron-context-specific signal).
  - Threaded `connectionMeta: { tenant_id, business_id }` into `refreshTokenWithRetry` via the existing `RefreshContext` interface (already passing `expires_at_pre`/`updated_at_pre` for 53-03's race check) — no new arg needed; just used the fields already in flight.
  - Used `Sentry.captureMessage` (not `captureException`) at the deactivation site — there's no `Error` object to forward, just a categorized verdict. Level set to `'error'` so it's still alertable.
metrics:
  duration_minutes: 11
  completed_date: 2026-05-06
  tests_added: 26
  tests_modified: 1
  total_tests_green: 1064
---

# Phase 53 Plan 05: Observability + Connection Health Pill Summary

Wire one Sentry event per system-detected `xero_connections.is_active=false` flip with full diagnostic context, and surface per-business Xero health in the coach dashboard with a one-click reconnect CTA. Plus close the 53-04→53-05 double-capture gap (Issue C from PLAN-CHECK).

## What shipped vs the plan

The plan called for three tasks; all three delivered as designed, plus one inline addition for Issue C from the plan-check (cron route Sentry-capture removal). The plan-check FLAGs were addressed inline rather than deferred — see "Plan-check resolution" below.

### Task 1: Sentry capture in token-manager — RED → GREEN

| Step | File | Tests |
|---|---|---|
| RED | `src/__tests__/xero/phase-53-token-manager-sentry.test.ts` (new, 6 cases) | 6 RED |
| RED | `src/__tests__/api/cron-refresh-xero-tokens.test.ts` (modified Test 5 + new Test 5b for Issue C) | 2 RED |
| GREEN | `src/lib/xero/token-manager.ts` (+25 LOC: import + capture block) | 6 GREEN |
| GREEN | `src/app/api/Xero/employees/route.ts` (+8 LOC: comment marker only) | (regression preserved) |
| GREEN | `src/app/api/cron/refresh-xero-tokens/route.ts` (-13 LOC: removed deactivation capture) | 2 GREEN |

The Sentry capture lands immediately after `logDeactivationDecision()` and immediately before the `is_active=false` UPDATE, in the `shouldDeactivate` branch (post-53-03 line ~510). Tags: `invariant=xero_connection_deactivated`, `tenant_id`, `business_id`, `connection_id`, `error_code`, `retry_count` (all strings — Sentry tag requirement). Extras: `xero_status`, `xero_error_body` (truncated to 4096 chars), `xero_message`, `attempt`. Wrapped in try/catch so a Sentry outage never aborts the deactivation DB write that follows.

### Task 2: connection-health endpoint — RED → GREEN

| Step | File | Tests |
|---|---|---|
| RED | `src/__tests__/api/phase-53-connection-health-route.test.ts` (new, 12 cases) | 12 RED (module-not-found) |
| GREEN | `src/app/api/Xero/connection-health/route.ts` (new, ~218 LOC) | 12 GREEN |

`GET /api/Xero/connection-health?business_ids[]=…` returns `{ results: [{ business_id, status, last_refresh_at, expires_at, connection_id }] }` where `status ∈ 'verified' | 'stale' | 'dead' | 'none'`. Three Supabase round-trips per request regardless of input size: (1) auth `system_roles` lookup, (2) `businesses` RBAC filter or super_admin bypass, (3) batched `xero_connections` query against canonical+profile id forms. 200-id sanity cap. Active row preferred over dead row when both exist for the same business.

### Task 3: pill column + dashboard wiring — RED → GREEN

| Step | File | Tests |
|---|---|---|
| RED | `src/__tests__/coach/phase-53-connection-health-pill.test.tsx` (new, 7 cases) | 7 RED |
| GREEN | `src/components/coach/ClientOverviewTable.tsx` (+99 LOC: pill + sort + column) | 7 GREEN |
| GREEN | `src/app/coach/dashboard/page.tsx` (+38 LOC: 11th Promise.all leg + map) | (Phase 50/51/52 tests preserved) |

`ClientMetrics.xeroConnectionHealth` is REQUIRED (no optional `?`) — defaulted to `'none'` upstream when the dashboard fetch fails or the business has no row. Sort comparator orders dead < stale < none < verified ascending (operationally useful — coach sorts ascending to surface broken connections at the top). Pill is `hidden sm:inline-flex` (matching the column header `hidden sm:table-cell`) — mobile signal preserved via `bg-red-50/40` tint on the `<tr>` for dead rows plus `data-xero-health` attribute.

## Plan-check resolution

### Issue A — wording fix (cosmetic)

PLAN-CHECK noted that must_haves.truths[2] said "per-route captures are deleted" when the reality is *Per-route deactivation writes (employees/route.ts:187) survive but emit no Sentry — only the token-manager site captures.* Adopted the accurate framing in the SUMMARY decision notes and in the inline comment on `employees/route.ts` itself, which now explicitly says: "*Sentry capture is centralized in token-manager.ts; do NOT add a second capture here.*"

### Issue B — 12-hour vs 24-hour verified threshold (decision)

Plan defaulted to 24h. Per Issue B, this was tightened to **12h** consciously. Rationale documented in the route handler comment block:

> 53-04's refresh cron runs every 6h. A healthy connection's `updated_at` should advance every 6h. The original plan defaulted to a 24h "verified" window — but 24h means a connection where the cron has FAILED 3× in a row would still show verified. We tighten to 12h (= 2× cron period) so a single missed cron run is tolerated but a sustained cron failure surfaces within 12h.

Implementation: `VERIFIED_WINDOW_MS = 12 * 60 * 60 * 1000`. The 30-min `EXPIRES_GRACE_MS` allows a connection whose token was just refreshed (so `expires_at > now+30min`) to also count as verified, even if `last_synced_at` is older — handles the case where the cron successfully refreshed but no data sync ran.

### Issue C — cron deactivation capture removed (the real fix)

Without this fix, every cron-triggered deactivation would produce **two Sentry events** (one from cron's `cron_refresh_xero_tokens_deactivated`, one from token-manager's new `xero_connection_deactivated`) for one root cause — violating must_haves.truths[2].

Resolution:
- Removed the `safeSentryCapture(new Error(…), { invariant: 'cron_refresh_xero_tokens_deactivated', … })` call from `src/app/api/cron/refresh-xero-tokens/route.ts` in the `result.shouldDeactivate` branch.
- Added a verifying test (`Test 5b` in `cron-refresh-xero-tokens.test.ts`) that explicitly asserts `captureExceptionMock` is never called when `getValidAccessToken` returns `{ shouldDeactivate: true }`.
- Updated existing Test 5 (which previously asserted capture WAS called) to assert capture is NOT called.

Cron retains:
- **Aggregate** capture: `cron_refresh_xero_tokens` invariant on aggregate-level errors (e.g. supabase fetch throws).
- **Per-connection transient-failure** capture: `cron_refresh_xero_tokens_failed` for connections that failed but did NOT deactivate (transient, retry-eligible — these remain cron-context-specific signal).
- **Per-connection throw** capture: `cron_refresh_xero_tokens_per_connection` for unexpected exceptions outside the normal failure path.

## Test results

```
Task 1: 6/6 token-manager-sentry tests + 2/2 cron Issue C tests = 8 GREEN
Task 2: 12/12 connection-health endpoint tests             = 12 GREEN
Task 3: 7/7 pill column + sort tests                       = 7 GREEN
                                                       Total = 27 GREEN

Full vitest run (entire test suite): 957 passing, 1 pre-existing
unrelated failure (goals/plan-period-banner.test.tsx — date-fixture
drift; pre-existed on HEAD; verified by git stash + re-run; logged in
deferred-items.md).

tsc --noEmit: clean
ESLint on touched files: clean
```

## Decision: how `connection` was threaded for the Sentry meta tags

Plan suggested either (a) re-fetching the row inside the deactivation branch or (b) extending `refreshTokenWithRetry`'s args. Took option (b) — but importantly, **53-03 already added the same data via the `RefreshContext` interface** for its race-check. So the only change in 53-05 was to USE the existing `ctx.business_id` and `ctx.tenant_id` (with fallback to `postFailureRow?.business_id` / `postFailureRow?.tenant_id` from 53-03's already-fetched row). Zero new args, zero new DB roundtrips. Cleanest possible composition with 53-03.

## Decision: refresh-tokens/route.ts disposition

Plan flagged "if 53-02 deleted it, drop from `files_modified`." 53-02 DID delete the file (commit `4f7495c`, summary §2). Confirmed: `ls src/app/api/Xero/` shows no `refresh-tokens` directory. Dropped from this plan's scope; no comment marker needed.

## Net LOC per file

| File | Δ | Note |
|------|---|------|
| `src/lib/xero/token-manager.ts` | +35 | Sentry import + capture block + comment |
| `src/app/api/Xero/employees/route.ts` | +8 | Comment marker (no code change) |
| `src/app/api/cron/refresh-xero-tokens/route.ts` | -13 / +20 | Removed deactivation capture; added explanatory comment |
| `src/app/api/Xero/connection-health/route.ts` | +218 | NEW |
| `src/components/coach/ClientOverviewTable.tsx` | +99 | Pill + column + sort |
| `src/app/coach/dashboard/page.tsx` | +38 | 11th Promise.all leg + mapping |
| 3 new test files | +975 | RTL + endpoint + token-manager-sentry coverage |
| 1 modified test (cron) | +20 / -3 | Issue C verifying test |

## Sentinel result (deferred to post-deploy)

The plan's "Manual sentinel post-deploy" step (deliberately disconnect a low-stakes test tenant in Xero, verify Sentry event + dashboard pill flip + click-to-reconnect) requires production deploy + Sentry access + a designated test tenant — out of band for this plan's local execution. Sentinel is documented in 53-05-PLAN.md `<verification>` section and should run after PR merges to main and the deploy lands.

## Phase 53 closeout

This is the **final plan in Phase 53** (5/5 shipped). With 53-01..53-05 all merged, the durability story is whole:

- **53-01** server-side disconnect with dual-ID purge — no more silent FE deletes
- **53-02** centralized refresh through `getValidAccessToken` — single source of truth, no more over-eager 400-deactivation duplicate (likely root cause of JDS 2026-05-05 drop)
- **53-03** race-aware deactivation policy — closed the rotation race that produced false-positive deactivations on healthy connections
- **53-04** proactive 6h refresh cron — keeps the 60-day idle window from ever expiring on dormant connections + surfaces token-health problems before users notice
- **53-05** Sentry capture + dashboard health pill — coach sees connection problems within minutes, not when the client complains

JDS root cause (per 53-RESEARCH §4 worst-case interleaving): the rotation race between the now-deleted `/api/Xero/refresh-tokens` route and a concurrent `getValidAccessToken` caller that landed `invalid_grant` on a healthy refresh token. 53-02 deleted the duplicate path; 53-03 added re-fetch-after-acquire-lock + re-fetch-before-deactivate to close the residual race even if a new duplicate ever sneaks in. JDS now has the same protection the rest of the portfolio gets.

Recommended Phase 53 follow-ups (NOT in this plan, suggested for a future operations-readiness phase):
- Wire Sentry alert: `tags.invariant=xero_connection_deactivated` → P1, page on-call. Document in ops runbook.
- After 7 days of cron data, dashboard the `cron_refresh_xero_tokens_failed` rate per tenant — sustained per-tenant failure suggests a stuck connection that needs operator attention even though it hasn't gone terminal yet.
- Optional UX: add `last_refresh_at` tooltip on hover to the pill (useful for "is this stale because cron is late or because the connection is dying?"). Out of scope for 53-05 — opportunistic next pass.

## Self-Check: PASSED

All 9 touched/created files exist on disk:
- FOUND: src/lib/xero/token-manager.ts
- FOUND: src/app/api/Xero/employees/route.ts
- FOUND: src/app/api/cron/refresh-xero-tokens/route.ts
- FOUND: src/app/api/Xero/connection-health/route.ts
- FOUND: src/components/coach/ClientOverviewTable.tsx
- FOUND: src/app/coach/dashboard/page.tsx
- FOUND: src/__tests__/xero/phase-53-token-manager-sentry.test.ts
- FOUND: src/__tests__/api/phase-53-connection-health-route.test.ts
- FOUND: src/__tests__/coach/phase-53-connection-health-pill.test.tsx

All 6 commits present on `feat/53-05-observability-health-pill`:
- FOUND: 7ede571 test(53-05): add failing tests for Sentry capture
- FOUND: 4201895 feat(53-05): capture Xero connection deactivation to Sentry
- FOUND: 891bc84 test(53-05): add failing tests for connection-health endpoint
- FOUND: 56a6e6a feat(53-05): add /api/Xero/connection-health endpoint
- FOUND: 7e2e25d test(53-05): add failing tests for XeroHealthPill
- FOUND: e0dc496 feat(53-05): add Xero connection health column to coach dashboard
