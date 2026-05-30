# Phase 69-04 — Monitoring Runbook

**Status:** ready for Matt's Sentry dashboard configuration after 69-03 ships.
**Last updated:** 2026-05-30

This runbook documents the observability layer added by Phase 69-04. Three signals — `xero_token_pre_expiry` (Sentry), `cron_heartbeats` (DB), and the existing `XeroHealthPill` (UI from Phase 53-05) — together close the diagnostic gap that let Phase 69's "tokens dying despite Phase 53" regression go undetected for 1–7+ days at month-end.

---

## Sentry Alert Configuration

Sentry MCP is read-only per memory (`feedback_sentry_triage.md`). Matt configures these manually in the Sentry web UI.

### Alert 1: `xero_token_pre_expiry` — Early Warning (NEW in 69-04)

**Sentry Dashboard → Alerts → Create Alert Rule**

- Project: production WisdomBI Next.js project
- Conditions: `event.tags.invariant equals xero_token_pre_expiry`
- Frequency threshold: **≥1 event in 6 hours per tenant_id tag**
- Action: email `cfo@wisdombi.ai` (and on-call if separate)
- Severity: WARNING
- Notes for triage: tag `hours_until_expiry` carries the lead time. `last_status` is the per-cron-tick result that triggered the warning — `still_valid` means the token-manager short-circuited as fresh while the row was actually closer to expiry than the next cron tick (cron was about to miss the refresh window); `failed` means the cron tried to refresh but the call failed transiently.
- Rationale: pre-expiry means the token will die within 24h. If this fires repeatedly for the same `tenant_id` across multiple cron ticks, the cron IS firing but failing to refresh — that's the exact symptom Phase 70 audit caught after 7 days. With this alert, lead time becomes ≤6h.

### Alert 2: `xero_connection_deactivated` — Terminal Failure (already exists per 53-05)

- Conditions: `event.tags.invariant equals xero_connection_deactivated`
- Severity: ERROR
- Action: P1 page on-call.
- Confirm this alert is configured. If not, add it — terminal token death always requires manual reconnect.

### Alert 3: `cron_refresh_xero_tokens` — Aggregate Cron Failure (already exists per 53-04)

- Conditions: `event.tags.invariant equals cron_refresh_xero_tokens`
- Severity: ERROR
- Aggregate-level failure means the cron itself is broken (env missing, supabase down, etc.) — needs immediate triage.

### Alert 4: `cron_heartbeat_insert_failed` / `cron_heartbeat_insert_threw` — Telemetry Self-Health (NEW in 69-04)

- Conditions: `event.tags.invariant equals cron_heartbeat_insert_failed` OR `cron_heartbeat_insert_threw`
- Severity: WARNING
- Rationale: a heartbeat write failure means the cadence query below would give a false negative. Catching this in Sentry lets us notice the observability layer itself is unhealthy before relying on it for triage.

---

## cron_heartbeats — Cadence Query (NEW in 69-04)

### Where it lives

- Table: `public.cron_heartbeats`. Migration: `supabase/migrations/20260530000000_phase69_cron_heartbeats.sql`.
- Schema: `id uuid PK`, `cron_path text`, `ran_at timestamptz`, `status text CHECK IN ('success','failed','partial')`, `error_message text`, `metadata jsonb`.
- Index: `(cron_path, ran_at DESC)` — single seek for any "last heartbeat per cron" query.
- RLS: super_admin SELECT; no UPDATE; no DELETE. Service-role inserts only.

### Which cron routes write to it (after 69-04)

- `/api/cron/refresh-xero-tokens` (every 6h, 0 */6 * * *) — the original gap
- `/api/cron/sync-all-xero` (daily 16:00 UTC)
- `/api/cron/reconciliation-watch` (daily 18:00 UTC)
- `/api/cron/daily-health-report` (registered separately; Vercel Pro)
- `/api/cron/weekly-digest` (weekly Sun 20:00 UTC)

### The exact query that would have surfaced Phase 69 on day 1

```sql
-- "Did each registered cron fire in the last N hours?"
-- Run this once a day in Supabase Studio. If any cron has a NULL or stale
-- last_heartbeat, that cron is broken — open a P1 ticket.
SELECT
  cron_path,
  MAX(ran_at) AS last_heartbeat,
  EXTRACT(EPOCH FROM (now() - MAX(ran_at))) / 3600 AS hours_since_last,
  COUNT(*) FILTER (WHERE ran_at > now() - interval '24 hours') AS runs_last_24h,
  COUNT(*) FILTER (WHERE ran_at > now() - interval '24 hours' AND status = 'success') AS success_last_24h,
  COUNT(*) FILTER (WHERE ran_at > now() - interval '24 hours' AND status = 'partial') AS partial_last_24h,
  COUNT(*) FILTER (WHERE ran_at > now() - interval '24 hours' AND status = 'failed') AS failed_last_24h
FROM public.cron_heartbeats
GROUP BY cron_path
ORDER BY hours_since_last DESC;
```

Expected output during healthy operation (UTC):

| cron_path                          | last_heartbeat (≤ N ago)        | runs_last_24h |
|------------------------------------|---------------------------------|---------------|
| /api/cron/refresh-xero-tokens      | ≤ 6h                            | 4             |
| /api/cron/sync-all-xero            | ≤ 24h                           | 1             |
| /api/cron/reconciliation-watch     | ≤ 24h                           | 1             |
| /api/cron/daily-health-report      | ≤ 24h                           | 1             |
| /api/cron/weekly-digest            | ≤ 7 days                        | 0 or 1        |

If `/api/cron/refresh-xero-tokens` shows `hours_since_last > 12` (= 2 missed cron ticks), pivot immediately to:

```sql
-- "What did the cron say went wrong on its most recent run?"
SELECT cron_path, ran_at, status, error_message, metadata
FROM public.cron_heartbeats
WHERE cron_path = '/api/cron/refresh-xero-tokens'
ORDER BY ran_at DESC
LIMIT 10;
```

If zero rows exist at all → the cron is not registered with Vercel (H1a from 69-DIAGNOSIS.md) — confirm in Vercel Dashboard → Project → Settings → Crons and re-deploy.

If recent rows exist with `status='failed'` → read `error_message`; that IS the cron's own diagnosis.

If recent rows exist with `status='success'` → the cron is healthy; tokens dying despite that means the bug is INSIDE token-manager refresh flow (H3 / H6 sub-cases). Drop into Sentry to look for `cron_refresh_xero_tokens_failed` or `xero_connection_deactivated`.

### Per-tenant pre-expiry SQL (as a belt-and-braces complement to Sentry Alert 1)

```sql
SELECT
  business_id,
  tenant_name,
  expires_at,
  EXTRACT(EPOCH FROM (expires_at - now())) / 3600 AS hours_until_expiry,
  CASE
    WHEN expires_at <= now() THEN 'EXPIRED'
    WHEN expires_at - now() < interval '24 hours' THEN 'PRE_EXPIRY'
    WHEN updated_at < now() - interval '12 hours' THEN 'STALE'
    ELSE 'VERIFIED'
  END AS health_state,
  updated_at,
  is_active
FROM xero_connections
WHERE is_active = true
ORDER BY expires_at ASC;
```

Run this once per day during the 7-day post-deploy soak. Any row in `EXPIRED` or `STALE` state is a signal that the fix in 69-03 is not holding.

---

## XeroHealthPill (53-05) — Visual Verification

### Component + endpoint location (verified 2026-05-30)

- Pill component: `src/components/coach/ClientOverviewTable.tsx` lines 66–122 (defined locally — NOT a shared `src/components/coach/XeroHealthPill.tsx` file).
- Used at: same file, ~line 577, inside the table row render.
- Endpoint that powers it: `src/app/api/Xero/connection-health/route.ts`.

### States it renders

- `verified` (green CheckCircle): `is_active=true` AND (last refresh within 12h OR expires_at > now + 30min).
- `none` (grey Minus, "No Xero"): no `xero_connections` row exists for this business under either ID form.
- `stale` (yellow Clock): `is_active=true` AND last refresh >12h ago AND expires_at past 30min grace.
- `dead` (red AlertTriangle, anchor to `/api/Xero/auth?business_id=…&return_to=/coach/dashboard`): `is_active=false`.

The "verified" threshold is **12h** (per `VERIFIED_WINDOW_MS` in `src/app/api/Xero/connection-health/route.ts:71`). 53-05 chose 12h = 2× the 6h cron period — tolerates one missed cron run but surfaces sustained cron failure within half a day.

### Pre-expiry coverage gap (intentional)

The pill's `dead` state fires when `is_active=false` (token-manager already gave up). The new `xero_token_pre_expiry` Sentry warning fires when `expires_at - now() < 24h` AND the cron did not refresh. There IS a window where the pill says "verified" (e.g. 11h since last refresh, expires_at = now + 23h) but Sentry is warning. This is INTENTIONAL — the pill is the user-facing signal; Sentry is the ops signal. If Matt wants visual pre-expiry indication later, that's Phase 71+ UX scope.

### Verification procedure (after 69-03 ships)

1. Confirm a near-expiry state surfaces in Sentry. Easiest: in production wait for the next organic cron tick after the 5 reconnected tenants from 69-02 hit a state where the cron did not refresh. Alternative: in staging, manually set `xero_connections.expires_at = now() + 23h` on one row and trigger `/api/cron/refresh-xero-tokens` via authenticated curl.
2. Visit `/coach/dashboard` as a coach with access to the affected client. Confirm the pill renders the expected state — `verified` if the cron refreshed within 12h (regardless of pre-expiry); `dead` if the connection was terminally disconnected.
3. Sentry should show the `xero_token_pre_expiry` event within minutes of the cron tick. If not, the warning is not wired — return to the 69-04 plan and re-verify the cron route changes landed.

---

## Stale-sync banner status

`src/app/finances/monthly-report/components/XeroConnectionBanner.tsx` exists and DOES display `last_synced_at` when the connection is healthy (line 86–90: "Last synced: <date>"). However it does NOT currently surface a banner when `last_synced_at > 48h ago` — there's no per-staleness branch.

Adding a stale-sync banner trigger when `now() - last_synced_at > 48h` is a Phase 71+ UX scope (low-risk, ~20 LOC change to that file, but out of scope for 69-04 which is observability-focused). Tracked as a deferred item.

---

## Production Smoke Test Checklist

After 69-03 and 69-04 deploy to production:

- [ ] Sentry Alert 1 (`xero_token_pre_expiry`) configured per above.
- [ ] Sentry Alert 2 (`xero_connection_deactivated`) confirmed active.
- [ ] Sentry Alert 3 (`cron_refresh_xero_tokens`) confirmed active.
- [ ] Sentry Alert 4 (`cron_heartbeat_insert_failed` / `cron_heartbeat_insert_threw`) configured.
- [ ] `cron_heartbeats` table exists in production (`SELECT 1 FROM cron_heartbeats LIMIT 1` returns).
- [ ] First cron tick after deploy writes a row visible in the cadence query above.
- [ ] One organic `refresh-xero-tokens` heartbeat observed in the first 6h post-deploy.
- [ ] All 5 reconnected tenants from 69-02 show pill state = `verified` on coach dashboard.
- [ ] Test connection (deliberately near-expiry) triggers `xero_token_pre_expiry` event in Sentry within 6h.
- [ ] No `cron_refresh_xero_tokens_failed` events for the production tenants over the next 7 days.
- [ ] Cadence query run on day 1, day 3, day 7 — all 5 crons show fresh heartbeats.
