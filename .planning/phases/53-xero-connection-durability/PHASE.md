# Phase 53 — Xero Connection Durability

## Goal

Eliminate the recurring "Xero connection drops" failure mode. After this phase, an active Xero connection on a coached business stays alive indefinitely under normal use, dies only on genuinely permanent failure (refresh token >60 days idle, or user-revoked in Xero), and when it does die we know within minutes — not when the client complains.

## Why now

Discovered 2026-05-05 during Step 4 (Team) testing on JDS:
- JDS's `xero_connections` row showed `is_active=false` despite the user having reconnected ~10 minutes prior.
- Root cause analysis surfaced **five independent reliability holes** that compound. Any one of them could kill a connection; together they make stable Xero integration effectively impossible without manual intervention.
- The same pattern likely affects every business in the portfolio. JDS is just the one that surfaced today.

This is not a JDS bug — it's structural.

## Scope (5 plans)

### 53-01 — Server-side disconnect endpoint (replace FE-only delete)
- `integrations/page.tsx:100-103` does `.delete()` from the browser using the anon Supabase client. RLS likely blocks it silently — no error, no rows actually deleted, FE flips to "disconnected" anyway.
- Replace with `/api/Xero/disconnect` route using the service-role client. Delete by both ID formats (canonical `businesses.id` and `business_profiles.id`). Return row count. FE shows error if `count === 0`.

### 53-02 — Centralize token refresh through token-manager.ts
- Three implementations of "refresh Xero access token" exist:
  1. `src/lib/xero/token-manager.ts` (good: lock, retries, careful deactivation)
  2. `src/app/api/Xero/refresh-tokens/route.ts:67` (over-eager: deactivates on **any** 400)
  3. Various inline `fetch('https://identity.xero.com/connect/token')` calls
- Delete the duplicates. Every consumer of access tokens funnels through `getValidAccessToken()`. Lock + retry + deactivation policy is centralized.

### 53-03 — Tighten deactivation logic in token-manager.ts
- Current: `unauthorized_client` deactivates on first occurrence (this is a *client-credentials* error, often transient).
- Current: `invalid_grant` deactivates without re-reading the DB row (loses the rotation race — a sibling process may have just rotated the token).
- New policy:
  - On any refresh failure, **re-fetch the row** before deactivating (catches rotation-race false positives).
  - `invalid_grant` after fresh re-read → deactivate.
  - `unauthorized_client` → 3 retries with exponential backoff, deactivate only if all 3 fail.
  - 5xx / network → retry with backoff, never deactivate.
  - Generic 400 with no `error` field → log & retry, never deactivate.

### 53-04 — Proactive refresh cron (every 6 hours)
- Add `/api/cron/refresh-xero-tokens` to `vercel.json` cron list.
- Walks all `is_active=true` connections, calls `getValidAccessToken` on each (refresh-only, no Xero data fetch).
- Resets the 60-day idle window 4× per day, surfaces problems before users notice, gives the rotation race fewer windows to land between long gaps.
- Distinct from the existing `sync-all-xero` daily cron (which does data fetch and may legitimately fail without indicating token health).

### 53-05 — Observability + connection health surface
- Sentry capture on every `is_active=false` flip with: full Xero response body, status code, `connection.id`, `tenant_id`, error category, route that triggered it.
- Coach dashboard surfaces: per-business "connection health" badge (verified / stale / dead) with a "Reconnect" CTA on dead rows. Don't wait for the client to report it.

## Out of scope

- Token encryption rotation (separate concern, covered by Phase 46 SEC work).
- Xero API rate-limit handling (separate concern, sync orchestrator owns this).
- Multi-tenant connection management UI improvements (Phase 44 owns the consolidation tenants UX).

## Success criteria

After this phase ships:
- Disconnect button **actually disconnects** (verified: row count returned, all rows for the business removed across both ID formats).
- A single transient Xero error **does not** deactivate a connection (verified: integration test injecting 400 / 5xx / network failures).
- Token rotation race **does not** falsely deactivate (verified: integration test firing two `getValidAccessToken` calls concurrently, both succeed, no deactivation).
- Refresh-only cron runs every 6h and reports per-connection success/fail to Sentry (verified in production logs after one full day).
- Coach dashboard shows connection health and a working reconnect CTA per dead connection (verified in browser).

## Dependencies / sequencing

- 53-01 is independent — can ship first.
- 53-02 depends on 53-03 (we want centralization to happen alongside the policy tightening, not before).
- 53-04 depends on 53-02 (cron should call the centralized refresh).
- 53-05 depends on 53-03 (Sentry hooks live next to the deactivation calls).

Recommended ship order: **53-01 → 53-03 → 53-02 → 53-04 → 53-05**.

## Effort estimate

- 53-01: ~1h code + ~30m test
- 53-02: ~2h code + ~1h test (touches several routes)
- 53-03: ~1h code + ~1h test (race scenarios are subtle)
- 53-04: ~1h code + ~30m test
- 53-05: ~2h code + ~30m test (Sentry plumbing, dashboard widget)

Total: ~10h focused work + manual verification on JDS at the end.

## Verification (post-execution)

1. Run `scripts/verify-xero-connection-health.ts` (to be added) against all active businesses.
2. Manually disconnect → reconnect on JDS, then sync from forecast — confirm no "Failed to sync".
3. Wait 24h, check Sentry for any `is_active=false` flip events; investigate each.
4. Coach dashboard: verify health surface shows correctly for at least one verified-good and one (deliberately broken) connection.
