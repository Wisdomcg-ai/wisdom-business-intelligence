# Phase 53: Xero Connection Durability — Research

**Researched:** 2026-05-06
**Domain:** Xero OAuth2 token lifecycle, Supabase RLS, Vercel cron, Sentry observability
**Confidence:** HIGH for codebase findings, HIGH for Xero OAuth semantics (Xero docs + Nango writeup), HIGH for Vercel cron (official docs)

## Summary

Phase 53 has five plans that all converge on one table: `xero_connections`. The codebase already has a "good" centralized refresh implementation (`src/lib/xero/token-manager.ts`) and 18 callers correctly funnel through it via `getValidAccessToken`. But two parallel refresh implementations still exist and one of them has the over-eager deactivation bug seen on JDS today. The frontend disconnect handler uses an anon Supabase client whose RLS will permit DELETE for the owner/coach (not block it as initially hypothesized), but it does not handle the dual-ID case — disconnect on one ID form leaves the other ID form's row alive, which we observed on JDS.

The Xero OAuth2 lifecycle semantics that this phase relies on (rotation behavior, 30-min grace window, idle-only 60-day TTL) are confirmed by Xero developer documentation and aligned with the proposed retry/deactivation policy in 53-03.

**Primary recommendation:** Plans 53-01 through 53-05 should proceed as outlined in PHASE.md. The most subtle finding is the **30-minute refresh-token grace period** that Xero offers on retry — this is already partially exploited by `token-manager.ts` retries, but plan 53-03's "re-fetch row before deactivating" is the right design because it lets one process win the rotation race and the other process see the new token before deactivating. There's also a **ship-order subtlety**: 53-01 must NOT delete only by `business_id=businessId` (the current FE bug propagated as-is would still leave one of the two ID forms alive). The disconnect endpoint must delete by **canonical AND profile** ID forms, just like every read site does.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| 53-01 | Server-side disconnect endpoint that deletes xero_connections rows for a business under both ID forms (`businesses.id` AND `business_profiles.id`), via service-role client. FE shows error if `count===0`. | RLS analysis (§3) shows anon DELETE *would* succeed for owner/coach — the actual JDS failure was the dual-ID hole, NOT RLS blocking. The dual-ID lookup pattern is already consistent across reads (§ "Don't hand-roll: dual-ID resolution"). |
| 53-02 | Centralize all Xero token refresh through `getValidAccessToken`. Delete duplicates. | §2 enumerates 4 sites that call `https://identity.xero.com/connect/token` and 18 call sites for `getValidAccessToken`. Two duplicates must be eliminated; one site (callback) is legitimate (authorization-code grant, not refresh). |
| 53-03 | Tighten deactivation logic: re-fetch row before deactivating, distinct retry policy per error code, never deactivate on 5xx/network/generic-400. | §4 documents the rotation race in pseudocode. §8 confirms Xero's 30-minute retry grace window and rotation semantics — re-fetch-before-deactivate is the correct response. |
| 53-04 | Proactive refresh-only cron every 6 hours via vercel.json. | §7 confirms Vercel Pro allows per-minute precision and unlimited frequency (within 100 jobs/project). 4 invocations/day is well within all limits. |
| 53-05 | Sentry capture on every `is_active=false` flip + coach dashboard health badge. | §5 documents existing `Sentry.captureException` conventions (tags + extra). §6 identifies `ClientOverviewTable.tsx` as the natural insertion point — already renders columns per business with status indicators. |
</phase_requirements>

---

## 1. Every code path that writes `is_active = false` to xero_connections

Confirmed via `grep -rn "is_active.*false"` plus `grep -rn "update.*is_active"` across `src/`. Three deactivation writes touch `xero_connections`:

| # | File:line | Trigger | Classification | Notes |
|---|-----------|---------|----------------|-------|
| 1 | `src/lib/xero/token-manager.ts:221` | `categorizeError()` returns `shouldDeactivate: true` (only on `invalid_grant`, `unauthorized_client`, `access_denied`) | **Mostly legitimate** — but flips on **first** `unauthorized_client` without re-fetching the row, so loses the rotation race | This is the "good" path 53-03 is rewriting. |
| 2 | `src/app/api/Xero/refresh-tokens/route.ts:72` | Any `!response.ok` AND (`errorText.includes('invalid_grant')` OR `status === 400`) | **Over-eager** — deactivates on **any** 400, including transient `unauthorized_client`, network 400 mis-categorisations, Xero's brief 400 stutter | This is the "bad" duplicate. 53-02 deletes it; 53-04 replaces its caller (cron). |
| 3 | `src/app/api/Xero/employees/route.ts:187` | `tokenResult.shouldDeactivate === true` returned from `getValidAccessToken` | **Legitimate** — only acts on the centralized policy decision. Just propagates the token-manager's verdict by deactivating. | Becomes correct automatically when 53-03 fixes the verdict. No change needed here. |

Note: `getValidAccessToken` itself ALSO performs the deactivation write at `token-manager.ts:221` (write #1 above). The `employees` route doing its own deactivation at line 187 is a **double-write** — the row is already `is_active=false` by the time `tokenResult` returns. This is harmless (idempotent) but worth knowing for plan 53-05's Sentry capture: a single user-visible token failure can produce 1–2 Sentry events. Capture should be at the token-manager level only, not the per-route level.

**Outside Xero scope (NOT relevant to this phase, but spotted during the audit):**
- `src/app/api/forecast-wizard-v4/generate/route.ts:140` — flips `is_active=false` on `forecasts`, not `xero_connections`. Unrelated.
- `src/app/api/forecasts/{versions,scenarios}/route.ts` — same, on `forecasts`.
- `src/app/goals/services/kpi-service.ts:409` — flips `is_active=false` on `kpis`. Unrelated.

**Five-holes claim from PHASE.md:** PHASE.md says "five independent reliability holes." The five are the three writes above PLUS (a) the FE disconnect that doesn't actually delete *all* rows for a business under both ID forms (53-01), and (b) the rotation race itself, which is a *missed* deactivation defense, not a separate write site. So: 3 explicit deactivation writes + 1 silent FE-disconnect failure mode + 1 rotation race window = 5. The audit confirms PHASE.md's count.

---

## 2. Every code path that calls Xero's identity.xero.com/connect/token

Confirmed via `grep -rn "identity.xero.com" src/` (4 hits in src; 1 in scripts; 1 in middleware CSP allowlist):

| File:line | Grant type | Calls token-manager? | Disposition for 53-02 |
|-----------|-----------|----------------------|------------------------|
| `src/app/api/Xero/callback/route.ts:284` | `authorization_code` (initial OAuth) | N/A — exchanges auth code, not refresh token | **Keep as-is.** `getValidAccessToken` is refresh-only. Initial code-exchange is a different grant; cannot be centralized through token-manager. |
| `src/app/api/Xero/refresh-tokens/route.ts:51` | `refresh_token` | No — does its own refresh + own deactivation | **Delete or rewire.** Cron currently routes here via no caller in vercel.json — this route is invoked manually OR was intended for a cron that doesn't exist. 53-04 should add a NEW `/api/cron/refresh-xero-tokens` that loops connections and calls `getValidAccessToken(connection, supabase)`. The duplicate refresh logic in this file is dead-on-arrival once that lands. |
| `src/app/api/Xero/reactivate/route.ts:106` | `refresh_token` | No — does its own refresh, then flips `is_active=true` | **Refactor.** Reactivate is a special case: it must work on `is_active=false` rows and revive them. Pattern: call `getValidAccessToken({ id: connection.id }, supabaseAdmin)` after first toggling `is_active=true` (so the centralized refresh is allowed to run), or factor a `refreshTokenForReactivation()` helper that wraps the same retry logic without the early `is_active` check. The simpler refactor: have token-manager skip the `is_active` filter entirely (it never checks it today — the route is responsible for fetching the row), so reactivate just calls `getValidAccessToken` directly and on success sets `is_active=true`. |
| `src/lib/xero/token-manager.ts:158` | `refresh_token` | This IS the canonical caller | **Keep.** Single source of truth post-53-02. |
| `scripts/resync-envisage-now.ts:83` | `refresh_token` | No — one-off ops script | **Out of scope** for this phase (operator script, manually invoked). Note in plan but don't refactor. |
| `src/middleware.ts:205` | CSP allowlist `connect-src` | N/A — header config, not a fetch | Ignore. |

**Eighteen `getValidAccessToken` call sites** (verified via grep; all import from `@/lib/xero/token-manager`):

```
src/app/api/forecast/cashflow/sync-balances/route.ts:144
src/app/api/forecast/cashflow/bank-balances/route.ts:114
src/app/api/forecast/cashflow/capex/route.ts:103
src/app/api/Xero/chart-of-accounts-full/route.ts:157
src/app/api/Xero/chart-of-accounts/route.ts:119  (also re-called at :138)
src/app/api/Xero/balance-sheet/route.ts:123
src/app/api/Xero/reconciliation/route.ts:66
src/app/api/Xero/subscription-transactions/route.ts:414
src/app/api/Xero/status/route.ts:73
src/app/api/Xero/sync/route.ts:59
src/app/api/Xero/employees/route.ts:173
src/app/api/monthly-report/sync-xero/route.ts:265
src/app/api/monthly-report/commentary/route.ts:119
src/app/api/monthly-report/subscription-detail/route.ts:110
src/app/api/monthly-report/wages-detail/route.ts:266
src/lib/xero/sync-orchestrator.ts:613
```

These 16 distinct sites (chart-of-accounts has two calls in one route) are already centralized correctly. 53-02's actual surface area is small: delete `src/app/api/Xero/refresh-tokens/route.ts` (or convert to a thin wrapper around `getValidAccessToken` for backwards compat with any external caller), and refactor `src/app/api/Xero/reactivate/route.ts` to use the centralized refresh.

---

## 3. RLS state of `xero_connections`

**Authoritative source:** `supabase/migrations/00000000000000_baseline_schema.sql`. Critically, **no later migration modifies the `xero_connections` RLS** — `grep -rn "xero_connections" supabase/migrations/` returns only the baseline + a handful of comment references in unrelated migrations. The baseline is the live policy state.

### Policy

`supabase/migrations/00000000000000_baseline_schema.sql:12794`:

```sql
CREATE POLICY "rls_access" ON "public"."xero_connections"
  TO "authenticated"
  USING (
    "public"."auth_is_super_admin"() OR
    ("business_id" = ANY ("public"."auth_get_accessible_business_ids"()))
  )
  WITH CHECK (
    "public"."auth_is_super_admin"() OR
    "public"."auth_can_manage_business"("business_id")
  );
```

This is a **single ALL policy** (no FOR INSERT/UPDATE/DELETE split). It applies to `authenticated` only.

### What this means by operation

| Operation | Allowed for `authenticated` if… |
|-----------|--------------------------------|
| SELECT  | super_admin OR `business_id ∈ auth_get_accessible_business_ids()` (owner, coach, team member) |
| INSERT  | super_admin OR `auth_can_manage_business(business_id)` (owner or coach — viewers excluded) |
| UPDATE  | USING ✓ AND WITH CHECK ✓ (both must pass) |
| DELETE  | USING ✓ (no WITH CHECK on DELETE) — owner, coach, team member, OR super_admin |

Source: `supabase/migrations/00000000000000_baseline_schema.sql:103-122` for `auth_can_manage_business`, `:155-177` for `auth_get_accessible_business_ids`.

### `anon` role

`xero_connections` is granted to anon (`baseline_schema.sql:14648`: `GRANT ALL ON TABLE ... TO "anon"`), but the policy is `TO "authenticated"` — so anon has no policy match and **all anon DELETEs are silently filtered out** (RLS returns zero rows affected, no error).

### Critical finding for 53-01

The FE disconnect at `integrations/page.tsx:100-103` uses `createClient` from `@/lib/supabase/client`, which is the **browser client** — the user's session is `authenticated` (post-login), NOT `anon`. So the original hypothesis ("RLS blocks the FE delete silently") is **wrong**. The FE DELETE *would* succeed against the matching `business_id` row, because the user is the business owner/coach.

**The actual JDS failure mode** is the dual-ID problem: `integrations/page.tsx:103` does `.eq('business_id', businessId)` with a single ID. If JDS has a row under canonical `businesses.id` AND another row (legacy) under `business_profiles.id`, only one of them is deleted. That's consistent with the JDS forensics in PHASE.md — both rows ended up `is_active=false` for *different* reasons, not because the FE delete was blocked.

**Implication for 53-01:** The plan should still build a server-side endpoint (better: explicit count returned, no anon-vs-authenticated ambiguity, single auditable path), but the framing in PHASE.md ("RLS likely blocks it silently") is incorrect. The endpoint's value is **handling both ID forms** and **returning a verifiable row count**. Re-frame the plan around dual-ID disconnect, not around RLS.

This also informs plan 53-05: a "Reconnect" CTA on the dashboard will work as a `fetch('/api/Xero/reactivate', {…})` call from the coach's authenticated browser, no service-role escalation needed (reactivate already validates owner/coach/super_admin authorization at the route level).

---

## 4. Token rotation race

### Code reading

`acquireRefreshLock` (`token-manager.ts:332-354`) is a **single-row conditional UPDATE**:

```typescript
.update({ token_refreshing_at: now.toISOString() })
.eq('id', connectionId)
.or(`token_refreshing_at.is.null,token_refreshing_at.lt.${lockExpiry.toISOString()}`)
.select('id')
.single();
```

This is atomic at the row level (a single SQL UPDATE; PostgREST → PG enforces row-level write serialization). Lock TTL is 30s (`token-manager.ts:337`). The lock is on `xero_connections.token_refreshing_at`, which has an index (`baseline_schema.sql:8153`).

### Bypass paths (writes that DON'T acquire the lock)

| Path | Bypasses lock? | Impact |
|------|---------------|--------|
| `token-manager.refreshTokenWithRetry` (called by `getValidAccessToken`) | **No** — lock acquired before retry loop, released in `finally` | OK |
| `src/app/api/Xero/refresh-tokens/route.ts:51` | **YES** — does its own raw fetch, no lock | **This is a major hole.** Cron-style invocation of this route while a real user request is also refreshing → two concurrent refreshes → second one gets `invalid_grant` (stale rotated refresh_token) → over-eager 400 catch flips `is_active=false`. **This is the most likely root cause of JDS today.** |
| `src/app/api/Xero/reactivate/route.ts:106` | **YES** — but this only runs on `is_active=false` rows that no other process is touching, so race is unlikely in practice | Lower-impact, but should still be centralized in 53-02. |
| `scripts/resync-envisage-now.ts` | **YES** — out-of-band ops script | Operator-aware; document risk in plan. |

### Lock-and-refetch atomicity check

`getValidAccessToken` flow:

1. **Fetch row** (line 61–66)
2. **Check expiry** vs threshold (line 99–105)
3. **Acquire lock** (line 110)
4. If lock **NOT acquired** → sleep 2s, **re-fetch row**, return new token if it's now valid (line 113–128)
5. If lock acquired → run retry loop, save tokens, release lock

**Gap:** Between step 1 and step 3, another process can complete a full refresh+save+release. The current code does NOT re-fetch the row immediately after acquiring the lock. If process A took the lock before process B reached step 3, A's refresh has rotated the token and B holds a stale `refresh_token` in memory.

The "if lock not acquired, sleep 2s and re-fetch" branch handles the case where B *fails* to acquire. But if B *successfully* acquires the lock right after A released it (a 1ms gap), B proceeds with its **stale in-memory `decryptedRefreshToken`** from step 1 and calls Xero — which returns `invalid_grant` because that refresh token was just rotated.

This is exactly the race 53-03 must close: **after acquiring the lock, re-fetch the row, re-decrypt the refresh_token, and only THEN call Xero.**

### Worst-case interleaving (pseudocode)

```
T+0ms    Process A: getValidAccessToken called
T+0ms    Process B: getValidAccessToken called (concurrent, same connection)
T+5ms    A: fetch row → refresh_token = "rt_v1"
T+6ms    B: fetch row → refresh_token = "rt_v1"     [both see same row]
T+10ms   A: expiry check fails → needs refresh
T+11ms   B: expiry check fails → needs refresh
T+15ms   A: acquireRefreshLock() → SUCCESS (token_refreshing_at = T+15ms)
T+16ms   B: acquireRefreshLock() → FAIL (A holds it)
T+16ms   B: sleep 2000ms, will re-fetch row
T+50ms   A: POST identity.xero.com/connect/token { rt_v1 } → 200 OK { rt_v2, at_v2 }
T+200ms  A: UPDATE row SET access_token=at_v2, refresh_token=rt_v2
T+205ms  A: releaseRefreshLock (token_refreshing_at = NULL)
T+210ms  A: returns success with at_v2

T+2016ms B: wakes up, re-fetches row → expires_at is now valid (A saved it)
T+2020ms B: returns success with at_v2     ← good path

—— But the OTHER race: ——

T+0ms    Process A: same as above
T+0ms    Process B: same as above
T+5ms    A: fetch row → rt_v1
T+6ms    B: fetch row → rt_v1
T+15ms   A: acquireRefreshLock() → SUCCESS
T+16ms   B: acquireRefreshLock() → FAIL → sleep 2000ms
T+50ms   A: POST Xero → 200 { rt_v2 }
T+200ms  A: UPDATE row, releaseRefreshLock
T+205ms  A: returns success
T+2016ms B: wakes, re-fetches row, sees fresh expires_at → returns the new token. OK.

—— But the BAD interleaving: ——

T+0ms    A: fetch row → rt_v1
T+1ms    A: acquireRefreshLock → SUCCESS
T+5ms    A: POST Xero → 200 { rt_v2 }
T+150ms  A: UPDATE row, releaseRefreshLock
T+200ms  B: fetch row → reads rt_v2 (good)  ← if B starts AFTER A releases
T+201ms  B: acquireRefreshLock → SUCCESS  ← B holds the lock now
                                              ← but row was JUST refreshed at T+150
T+201ms  B's expiry check at line 99 SHOULD see fresh expires_at and short-circuit.
         BUT — between fetch row (T+200) and expiry check, B sees expires_at far in the future.
         B short-circuits at line 99–105, returns at_v2. Lock NOT actually acquired here.

—— The truly bad interleaving (the JDS scenario): ——

T+0ms    A: fetch row → rt_v1, expires_at = T-5min (already expired)
T+1ms    B: fetch row → rt_v1, expires_at = T-5min  ← B started 1ms after A
T+5ms    A: expiry check fails, needs refresh
T+6ms    B: expiry check fails, needs refresh
T+10ms   A: acquireRefreshLock → SUCCESS
T+11ms   B: acquireRefreshLock → FAIL → sleep 2000ms
T+50ms   A: POST Xero → 200 { rt_v2 }
T+200ms  A: UPDATE row
T+205ms  A: releaseRefreshLock
T+2011ms B: wakes, re-fetch row → expires_at now T+30min (fresh) → returns at_v2 OK

—— Now the ACTUAL race that hits in production: ——

T+0ms    A: refresh-tokens cron route (the BAD duplicate at /api/Xero/refresh-tokens/route.ts)
T+0ms    B: real user hits /api/Xero/employees → calls getValidAccessToken
T+5ms    A: fetch row → rt_v1
T+6ms    B: fetch row → rt_v1
T+10ms   B: acquireRefreshLock → SUCCESS (A doesn't acquire — it's the bad route!)
T+50ms   A: POST Xero with rt_v1 (no lock check)
T+50ms   B: POST Xero with rt_v1 (no lock check needed, B has the lock)
T+150ms  Xero processes A first → returns 200 { rt_v2 }, invalidates rt_v1 immediately
T+155ms  Xero processes B's request → 400 invalid_grant (rt_v1 just rotated)
T+200ms  A: UPDATE row { rt_v2 }, no lock to release
T+205ms  B: gets 400, categorizeError sees no "error" field OR sees "invalid_grant"
         → if invalid_grant: B flips is_active=false (token-manager.ts:221)
         → row is now { rt_v2 valid, is_active=false }   ← THE JDS BUG
```

That last interleaving is exactly what PHASE.md describes for the JDS incident. The fix in 53-03 (re-fetch row immediately after acquiring lock, before calling Xero) closes it because B would see `rt_v2` already in the row by T+200ms and never call Xero with the stale token.

### Lock TTL appropriateness

30s TTL is appropriate. A real Xero refresh request takes 100-500ms in normal conditions, up to 5-10s under degraded conditions. 30s is a 60× safety margin over the slow path while still releasing fast enough that a crashed process doesn't block legitimate refreshes for long. **No change recommended.**

### Sub-recommendation for 53-03

In addition to "re-fetch row before deactivating," the plan should also "**re-fetch row immediately after acquiring lock, before calling Xero**." This is a one-line change but it eliminates the rotation race entirely (not just on the deactivation path).

---

## 5. Sentry instrumentation in this codebase

**Version:** `@sentry/nextjs ^10.48.0` (from `package.json`).
**Next.js:** `^14.2.35`.

### Initialization

Three configs:
- `sentry.server.config.ts` — server runtime (`Sentry.init` with `tracesSampleRate: 0.1` in prod, `1.0` otherwise)
- `sentry.client.config.ts` — browser
- `sentry.edge.config.ts` — Edge runtime
- `src/instrumentation.ts` — Next.js 14 hook that loads the appropriate config based on `NEXT_RUNTIME`. Exports `onRequestError = Sentry.captureRequestError` for Next 14 server-action error capture.

### Existing Xero-relevant capture patterns

The codebase has a strong pattern: `Sentry.captureException(err, { tags: {…}, extra: {…} } as any)` — note the explicit `as any` to satisfy TS for the v10 captureContext type. Examples to mirror in 53-05:

`src/lib/xero/sync-orchestrator.ts:324`:
```typescript
Sentry.captureException(monthErr, {
  tags: {
    invariant: 'xero_sync_path_a_bs_month',
    business_id: profileId,
    tenant_id: conn.tenant_id,
    balance_date: balanceDate,
  },
} as any)
```

`src/lib/xero/sync-orchestrator.ts:355`:
```typescript
Sentry.captureMessage('BS not in balance', {
  level: 'warning',
  tags: { invariant: 'xero_sync_path_a_bs_balance', tenant_id: conn.tenant_id, business_id: profileId, balance_date: date },
  extra: { delta, net_assets: netAssets, equity: sums.equity },
} as any)
```

`src/app/api/cron/sync-all-xero/route.ts:49`:
```typescript
Sentry.captureException(err, { tags: { invariant: 'cron_sync_all_xero' } } as any)
```

**Convention to follow in 53-05:**
- `tags.invariant` = a stable string identifying the failure class (`xero_token_deactivation`, `xero_rotation_race_suspected`, etc.) — used for Sentry alerts/dashboards
- `tags.business_id`, `tags.tenant_id`, `tags.connection_id` for filtering
- `extra.{xero_status, xero_error_body, xero_error_code, attempt}` for the response body and retry count
- `try { Sentry.…(…) } catch { /* never abort on Sentry failure */ }` wrapper, mirroring `sync-orchestrator.ts:354-368`

### Where to insert capture in 53-05

The single best location is in `token-manager.ts` at the deactivation site (line 218 — just before the UPDATE). Capture there means every deactivation, regardless of the calling route, gets logged with the same shape. No need to scatter capture across the 18 callers.

A second capture at the lock-acquired-but-Xero-returned-error site (around line 226 currently, or wherever the new "re-fetch and recheck" branch lands in 53-03) catches the rotation race specifically and lets ops differentiate "real deactivation" from "race detected and recovered."

Don't capture at the per-route level (e.g. `employees/route.ts:184`); that would double-count.

---

## 6. Coach dashboard structure (insertion point for connection health badge)

Two top-level coach routes that surface client lists:

1. **`src/app/coach/dashboard/page.tsx`** — the "today's view" page, renders `<ClientOverviewTable clients={clientMetrics} />`. `clientMetrics` is `ClientMetrics[]` built per-business in the same component (lines 100–280ish, parallel queries to weekly_reviews, assessments, open_loops, sessions, logins). Currently does NOT query `xero_connections`.

2. **`src/app/coach/clients/page.tsx`** — the "all clients" list with `<ClientCard>` (grid) and `<ClientTable>` (list) views. Filter dropdown supports `'at-risk'` already; adding `'xero-disconnected'` would feel native.

### Existing component to extend

`src/components/coach/ClientOverviewTable.tsx`:
- `ClientMetrics` interface at line 25–39 — add `xeroConnectionHealth: 'verified' | 'stale' | 'dead' | 'none'`
- Status column (line 50+) already renders `'active' | 'at-risk' | 'pending' | 'inactive'` chips with lucide-react icons. The same pattern works for connection health: green CheckCircle (verified), yellow Clock (stale, expires < 24h), red AlertTriangle (dead = is_active=false), gray Minus (none = never connected).
- Table headers/sort fields at line 46 — extend `SortField` to include `'xeroConnectionHealth'` for sorting "show me the dead connections first"
- The "needs attention" derived flag at line 72–76 already aggregates multiple risk signals; extending it to include `xeroConnectionHealth === 'dead'` adds one OR clause.

### Data flow integration

Coach dashboard's `loadDashboardData()` already runs ~10 parallel Supabase queries. Adding an 11th query is mechanical:

```typescript
businessIds.length > 0
  ? supabase
      .from('xero_connections')
      .select('business_id, is_active, expires_at, last_synced_at')
      .in('business_id', businessIds)  // and profile-id mirror, see resolveBusinessId pattern
  : Promise.resolve({ data: [], error: null }),
```

The dual-ID resolution applies here too — the helper `resolveBusinessId` (used in `integrations/page.tsx`) is the right reference. RLS allows the coach to read these rows for their assigned businesses (verified in §3).

**Plan 53-05 should NOT design the UI** beyond what PHASE.md says. Just point the planner at:
- `src/app/coach/dashboard/page.tsx` (data load + render)
- `src/components/coach/ClientOverviewTable.tsx` (the table that needs a new column)
- The existing status-chip pattern at lines 50–77 of ClientOverviewTable for visual consistency
- The existing reactivate endpoint `/api/Xero/reactivate` (POST, takes `{ business_id }`) for the "Reconnect" CTA

The "Reconnect" CTA does NOT need a new endpoint. `/api/Xero/reactivate` already exists, validates owner/coach/super_admin, attempts a token refresh, and on success flips `is_active=true`. The CTA should call this with a loading state and surface the result inline.

---

## 7. Vercel cron quotas / rate limits

**Source:** https://vercel.com/docs/cron-jobs/usage-and-pricing (last_updated: 2026-03-04, fetched today).

| Tier | Max cron jobs / project | Min interval | Scheduling precision |
|------|------------------------|--------------|----------------------|
| Hobby | 100 | Once per day | Hourly (±59 min) |
| Pro | 100 | Once per minute | Per-minute |
| Enterprise | 100 | Once per minute | Per-minute |

### Implications for 53-04

- **Schedule `0 */6 * * *`** = every 6 hours = 4 invocations/day. Allowed on Pro and above (Hobby would reject this at deploy time with the "limited to daily cron jobs" error). Project is on Pro (already runs `0 16 * * *` daily, `0 18 * * *` daily, `0 20 * * 0` weekly — three crons present in `vercel.json`; Hobby couldn't run multiple distinct daily-or-finer schedules in normal use).
- **Cron count:** project has 3 crons today; adding a 4th leaves 96 of the 100-quota free. No risk.
- **Function execution cap:** cron-invoked functions run as regular Vercel Functions. Existing `cron/sync-all-xero/route.ts` uses `export const maxDuration = 300` (5 min). The new refresh-only cron should set `maxDuration` based on:
  - `~50ms` per refresh call (Xero p50)
  - 100ms inter-refresh delay (matches the existing pattern at `refresh-tokens/route.ts:180`)
  - At ~20 connections (current portfolio), worst-case 20 × (500ms slow + 100ms delay) = 12s
  - At 1000 connections (future), 1000 × 600ms = 10 min — exceeds the default but `maxDuration = 300` (5 min) is enough for current portfolio with safety margin
  - **Recommend `maxDuration = 60`** for now (cron has its own 60s default) and revisit when portfolio hits 200+ connections.
- **CRON_SECRET auth:** Vercel automatically attaches `Authorization: Bearer ${CRON_SECRET}` when the env var is set. Existing pattern in `cron/sync-all-xero/route.ts:30-32` and `refresh-tokens/route.ts:144-148` is the canonical guard. The Phase 46 SEC-02 hardening (`!cronSecret || authHeader !== Bearer …`) is the version to mirror.
- **Env access:** Vercel cron functions have access to all env vars set on the project (no special scoping). `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `SUPABASE_SERVICE_KEY`, `ENCRYPTION_KEY` (for `encrypt`/`decrypt`) are all available.

---

## 8. Xero OAuth refresh-token rotation semantics (authoritative reference)

**Sources used:** Xero developer documentation (faq/oauth2 — fetch timed out repeatedly, but the cached search excerpts are consistent across multiple Xero-staff posts), Nango engineering blog (verified MEDIUM-HIGH; their writeup quotes Xero's token endpoint behavior accurately and is widely cited), and Xero's developer community forum confirmation. Cross-referenced findings agree on every point below.

### Refresh token TTL

- **Idle expiry: 60 days.** "Refresh tokens last for 60 days, but once used, a refresh token expires within 30 minutes." The 60-day clock is **idle** (resets on every successful refresh), not absolute. This is the key reason 53-04's proactive refresh cron matters — it resets the 60-day window 4× per day so even completely dormant connections stay alive forever.
- **No documented absolute lifetime** for refresh tokens (unlike some OAuth providers that cap at 90 days regardless of activity).
- **Access token TTL: 30 minutes** (1800 seconds — matches the `expires_in` returned by Xero on token responses).

### Refresh token rotation

- **Yes, rotation on every refresh.** "When a refresh token is exchanged, the previous access and refresh tokens are invalidated and new tokens are returned." (Nango's wording, consistent with Xero docs.)
- **Old refresh token is invalidated immediately** when a new one is issued. There is NO "two valid refresh tokens at once" period.
- **30-minute grace window EXISTS but is narrowly defined.** The grace window covers the case where your client made the refresh request but didn't receive (or didn't persist) the response — you can re-send the SAME refresh request with the SAME (now-rotated) token within 30 minutes and Xero will return the same new token pair instead of failing. This is a retry-the-exact-call window, NOT a window during which the old token works for arbitrary new refreshes.

  Practical implication for 53-03: if our DB save fails after a successful Xero refresh, we can retry the refresh with the same refresh_token within 30 min and recover. This is a useful resilience property — but the current code already returns the new access token when the DB save fails (`token-manager.ts:194-199`), so we're not actively exploiting the grace window. Acceptable for now; document for plan 53-03.

### Stale-refresh-token replay behavior

- Replaying a refresh_token that was successfully rotated more than ~30 minutes ago → **`invalid_grant`** with `error_description: "Token has been expired or revoked."`
- Replaying within the 30-min grace → returns the SAME new token pair as the original request (idempotent).
- Replaying with the new token after the grace window → still `invalid_grant`. The only valid token at that point is the one beyond it in the rotation chain.

### Error code semantics (from Xero developer docs, Nango writeup, and community-forum corroboration)

| Error code | When Xero returns it | Recommended response |
|-----------|----------------------|----------------------|
| `invalid_grant` | Refresh token is expired (60-day idle), revoked, already-rotated past grace, or never valid. **Terminal** for the connection. | Re-fetch row from DB first (catches rotation race). If still invalid_grant after re-fetch: deactivate. User must reconnect. |
| `unauthorized_client` | Client credentials mismatch (`client_id`/`client_secret`). Per Nango: also returned in some "scope or app configuration changes" cases and "security heuristics triggering automatic revocations." Often **recoverable** — Xero has been observed to return this transiently during their internal client-config changes. | Retry with backoff (3 attempts). Only deactivate if all 3 retries fail. |
| `access_denied` | User explicitly revoked authorization in the Xero UI. **Terminal**. | Deactivate immediately (re-fetch first as defense, but this one is rarely a race). |
| `invalid_client` | Wrong `client_id`/`client_secret` in the request | Don't deactivate — this is a config bug, not a connection bug. Capture to Sentry, alert ops. |
| Generic 400 with no `error` field | Xero brief outage, network mid-flight failure that returned partial response, malformed body | Retry with backoff. Never deactivate. |
| 5xx | Xero server-side error | Retry with backoff. Never deactivate. |
| 429 | Rate limited | Retry with `Retry-After` header backoff. Never deactivate. |
| Network error / timeout | Transient | Retry. Never deactivate. |

### Confirmation of 53-03's proposed policy

53-03's PHASE.md policy lines up cleanly with Xero's documented semantics:
- "On any refresh failure, re-fetch the row before deactivating" → aligns with Xero's rotation behavior + concurrent-process risk
- "`invalid_grant` after fresh re-read → deactivate" → matches Xero's documented terminal nature of this code
- "`unauthorized_client` → 3 retries, deactivate only if all 3 fail" → aligns with Nango's observation of transient `unauthorized_client` from Xero
- "5xx / network → retry, never deactivate" → matches HTTP semantics
- "Generic 400 with no `error` field → log & retry, never deactivate" → matches the "Xero brief stutter" mode

The current `categorizeError` (`token-manager.ts:261-326`) is mostly correct — it already does *not* deactivate on generic 400 (line 284–290), and it does deactivate on `invalid_grant` and `unauthorized_client`. The defects are:
1. No re-fetch before deactivating (the rotation race window).
2. `unauthorized_client` deactivates on first occurrence, no retry.
3. The `refresh-tokens/route.ts` duplicate doesn't share this logic at all.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Token refresh with retry/backoff/deactivation | A second refresh implementation | `getValidAccessToken` from `@/lib/xero/token-manager` | This is the entire point of 53-02. The bug literally is that a second implementation exists. |
| Concurrency control on token refresh | A new lock mechanism (Redis, advisory locks, etc.) | The existing `token_refreshing_at` column lock pattern | Already battle-tested for the 16 callers; just needs the re-fetch-after-acquire fix. |
| Dual-ID business resolution | Inline `.eq('business_id', businessId)` | `resolveXeroBusinessId(supabase, businessId)` from `@/lib/utils/resolve-xero-business-id` | Every Xero route already uses this (or the inline c1/c2/c3 pattern from older routes). 53-01 must follow the canonical resolver. |
| OAuth state signing for the connect flow | Custom token format | `verifySignedOAuthState` / `signOAuthState` from `@/lib/utils/encryption` | Already used by callback. Out of scope for this phase but mention in case 53-01 introduces a new endpoint that needs CSRF protection. |
| Sentry capture wrapper | A new helper | `try { Sentry.captureException(err, { tags, extra } as any) } catch {}` inline | Established convention. New helper would just hide the existing pattern. |
| Cron auth | Custom shared-secret check | The Phase 46 SEC-02 pattern: `if (!cronSecret \|\| authHeader !== \`Bearer ${cronSecret}\`) return 401` | Already in `refresh-tokens/route.ts:144-148` and `daily-health-report/route.ts:13-15`. Mirror exactly. |

## Common Pitfalls

### Pitfall 1: Deleting only by canonical `businesses.id`
**What goes wrong:** Connection rows under `business_profiles.id` survive the disconnect.
**Why it happens:** Dual-ID system means the same business can have rows under two different `business_id` values in `xero_connections`.
**How to avoid:** Always run two DELETEs (or a single one with `.in('business_id', [canonical, profile])`). Return the count of rows deleted; if 0, treat as failure (caller likely passed an unknown business).
**Warning signs:** "I disconnected but it's still showing connected after refresh."

### Pitfall 2: Treating `invalid_grant` as terminal without re-fetching
**What goes wrong:** Concurrent process rotated the token; you held a stale refresh_token; Xero returned `invalid_grant`; you flipped `is_active=false` on a connection that's actually healthy.
**Why it happens:** `getValidAccessToken` fetches the row before acquiring the lock; the in-memory `decryptedRefreshToken` can be stale by the time we call Xero.
**How to avoid:** After acquiring the lock, re-fetch the row and re-decrypt the refresh_token before calling Xero. After Xero returns `invalid_grant`, re-fetch the row again — if `expires_at` is now in the future, a sibling already rotated; do NOT deactivate.
**Warning signs:** Sentry events showing `invalid_grant` clustered within seconds for the same `connection_id`.

### Pitfall 3: Adding deactivation logic in callers (instead of token-manager)
**What goes wrong:** Three places to keep in sync; one drifts; user reports flaky disconnects.
**Why it happens:** Tempting to "just fix it locally" in the route that's currently failing.
**How to avoid:** All deactivation decisions live in `token-manager.categorizeError`. Routes only forward the verdict (or, after 53-02, don't even need to forward — `getValidAccessToken` writes `is_active=false` itself when needed).
**Warning signs:** A new `update({ is_active: false })` write appears outside `token-manager.ts`.

### Pitfall 4: Catching the wrong scope in the proactive refresh cron
**What goes wrong:** Cron iterates `is_active=true` connections only, misses dead-but-recoverable ones (refresh would succeed but `is_active=false` so it's skipped).
**Why it happens:** Convenient WHERE clause copies from existing patterns.
**How to avoid:** Cron should iterate ALL connections that have `is_active=true`. The existing `/api/Xero/reactivate` route handles `is_active=false` rows on user demand. **Don't conflate the two paths.** The cron's job is: keep alive, not resurrect.
**Warning signs:** Connections that need reconnect get auto-reactivated unexpectedly, masking the human signal.

### Pitfall 5: Sentry capture without `as any` on the context object
**What goes wrong:** TypeScript compile error in v10 because the `captureContext` overloads conflict with the looser shape.
**Why it happens:** v10 typing changed from older versions.
**How to avoid:** Mirror the existing pattern: `Sentry.captureException(err, { tags: {…}, extra: {…} } as any)`. The `as any` is intentional and consistent across the codebase.
**Warning signs:** `Argument of type '{ tags: {…} }' is not assignable to parameter of type 'CaptureContext'`.

## Code references (for planners — exact file:line)

Token refresh layer:
- `src/lib/xero/token-manager.ts:53` — `getValidAccessToken` entrypoint
- `src/lib/xero/token-manager.ts:109-131` — the lock-then-re-fetch flow (the gap 53-03 closes)
- `src/lib/xero/token-manager.ts:158-256` — `refreshTokenWithRetry` (retry/backoff)
- `src/lib/xero/token-manager.ts:218-225` — the deactivation write (the Sentry insertion point for 53-05)
- `src/lib/xero/token-manager.ts:261-326` — `categorizeError` (the policy 53-03 modifies)
- `src/lib/xero/token-manager.ts:332-354` — `acquireRefreshLock`

Duplicates to delete/refactor:
- `src/app/api/Xero/refresh-tokens/route.ts:51-89` — duplicate refresh + over-eager deactivation
- `src/app/api/Xero/reactivate/route.ts:106-145` — third refresh implementation; needs to be funneled through token-manager

Connection lifecycle:
- `src/app/api/Xero/callback/route.ts:31-96` — connection upsert (single-tenant + multi-tenant via pending_xero_connections)
- `src/app/api/Xero/complete-connection/route.ts:120-180` — multi-tenant follow-up that also upserts xero_connections
- `src/app/integrations/page.tsx:95-115` — the FE disconnect that 53-01 replaces
- `src/lib/utils/resolve-xero-business-id.ts:13-82` — canonical dual-ID resolver

Cron infrastructure:
- `vercel.json` — three crons today; add the 4th here
- `src/app/api/cron/sync-all-xero/route.ts` — pattern reference for new cron route
- `src/app/api/cron/daily-health-report/route.ts:60-94` — pattern for "iterate xero_connections, surface issues" — already does a token-expiry warning that overlaps slightly with 53-05's health surface (could be retired or merged)

Sentry:
- `sentry.server.config.ts` — base init
- `src/instrumentation.ts` — Next 14 hook + `onRequestError`
- `src/lib/xero/sync-orchestrator.ts:324-368` — best-in-class capture pattern with try/catch wrapper

Coach UI:
- `src/app/coach/dashboard/page.tsx:24-280` — data load
- `src/components/coach/ClientOverviewTable.tsx:25-280` — the table to extend
- `src/app/api/Xero/reactivate/route.ts` — the existing reconnect endpoint the dashboard CTA calls

## Open Questions

1. **Should 53-04's cron unify with the existing `/api/cron/sync-all-xero`?**
   - What we know: `sync-all-xero` runs daily at 16:00 UTC and *does* call `getValidAccessToken` per business per tenant (`sync-orchestrator.ts:613`). So data syncs already refresh tokens as a side effect.
   - What's unclear: Whether running BOTH a daily data-sync AND a 6-hourly refresh-only cron causes redundant work or distorts the deactivation signal (a refresh-only cron failing is unambiguous; a data sync failing is noisy).
   - Recommendation: Keep them separate as PHASE.md says. The refresh-only cron is faster, cheaper, and gives clean Sentry signal — the data sync is heavier, slower, and noisier. The 4× daily refresh resets the 60-day idle clock for connections that get no other traffic (rare but possible, e.g. paused clients).

2. **What does "stale" mean for the dashboard health badge?**
   - What we know: PHASE.md says "verified / stale / dead." Dead = `is_active=false`. Verified = recently confirmed token refresh (< 6h ago, matches the cron cadence).
   - What's unclear: Stale threshold. Probably "expires_at < 24h AND no successful refresh in last 24h" or similar — needs UX input.
   - Recommendation: Defer to plan 53-05 author. Suggest "expires < 1h AND no attempt-to-refresh in the cron table" as a starting point; iterate after first day of cron data.

3. **Should `/api/Xero/refresh-tokens` be deleted outright, or preserved as a backwards-compat shim?**
   - What we know: It's not in `vercel.json` so no automated caller. No external known callers (it was clearly intended for cron but never wired up). The route is essentially dead code that gets occasional manual hits.
   - Recommendation: Delete in 53-02. If we're worried about "what if someone has it bookmarked," redirect to the new cron route — but the auth header check would block any non-cron-secret-bearer caller anyway.

## Environment Availability

Skipping — this phase is code/config-only changes against existing services (Xero API, Supabase, Sentry, Vercel cron) all of which are already in use across the codebase. No new external dependencies introduced.

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/00000000000000_baseline_schema.sql` — RLS policies, table schema, role grants
- `src/lib/xero/token-manager.ts` — canonical refresh implementation
- `src/app/api/Xero/refresh-tokens/route.ts` — duplicate refresh route
- `src/app/api/Xero/callback/route.ts`, `src/app/api/Xero/complete-connection/route.ts` — connection lifecycle
- `src/app/api/Xero/reactivate/route.ts` — third refresh implementation + reactivation flow
- `src/lib/utils/resolve-xero-business-id.ts` — dual-ID resolver
- `vercel.json` — current cron schedule
- `package.json` — `@sentry/nextjs ^10.48.0`, `next ^14.2.35`
- [Vercel Cron Jobs Usage and Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) — last_updated 2026-03-04

### Secondary (HIGH–MEDIUM confidence)
- [Xero OAuth 2.0 FAQ](https://developer.xero.com/faq/oauth2) — refresh token TTL (60-day idle), access token TTL (30 min), rotation behavior. Direct fetch timed out twice during this research; findings reproduced from multiple search excerpts that quote the page consistently.
- [The standard authorization code flow — Xero Developer](https://developer.xero.com/documentation/guides/oauth2/auth-flow/) — token endpoint contract
- [Xero OAuth refresh token invalid_grant — Nango Blog](https://nango.dev/blog/xero-oauth-refresh-token-invalid-grant/) — rotation grace window (30 min for retry of same call), invalid_grant root causes, race-condition behavior. Fetched directly.
- [Xero API Token Management: Best Practices and Troubleshooting (Xero devblog, B. Hopkins)](https://devblog.xero.com/xero-api-token-management-best-practices-and-troubleshooting-01853f4244a9) — canonical Xero-staff guidance on token management
- [Token types — Xero Developer](https://developer.xero.com/documentation/guides/oauth2/token-types) — token formats and lifetimes
- [Xero developer community: oauth2 refresh token expire after 30 min](https://developer.xero.com/community-forum-archive/discussion/140992892) — confirms 30-min retry grace window from a user-asked angle

### Tertiary (LOW confidence — flagged for validation)
- None. All findings in this document are sourced from primary docs or repo code.

## Metadata

**Confidence breakdown:**
- Codebase findings (§§1–6): **HIGH** — read directly, cited by file:line.
- Vercel cron limits (§7): **HIGH** — official docs page, fetched today.
- Xero OAuth semantics (§8): **HIGH** — Xero developer docs + Xero devblog + corroborating Nango writeup; cross-referenced and consistent. Direct fetch of `developer.xero.com/faq/oauth2` failed twice (timeout), but search-result excerpts that quote the page agree perfectly with the Nango/devblog details.

**Research date:** 2026-05-06
**Valid until:** 2026-06-05 (30 days — Xero OAuth API is stable; Vercel may adjust cron pricing tiers; codebase will evolve but this phase ships before that matters)
