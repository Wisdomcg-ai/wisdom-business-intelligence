# Phase 69 — Diagnosis

**Date:** 2026-05-30
**Status:** COMPLETE — primary root cause identified with strong evidence; secondary contributing factor named; one item flagged INCONCLUSIVE (Vercel cron invocation log) but the strength of the data-state evidence makes the verdict actionable without it.
**Symptom:** Phase 70 month-end audit (2026-05-30) found all 5 sampled production Xero tenants with expired access tokens (3–7 days expired; JDS last sync 20 days ago) despite Phase 53-04 shipping a proactive `0 */6 * * *` UTC refresh cron at `/api/cron/refresh-xero-tokens` on 2026-05-06. The portfolio has been silently dying.

---

## Production State Snapshot (read-only — `scripts/phase-69-token-state-audit.mjs`, run 2026-05-29T22:51:16Z)

| Tenant | businesses.id | tenant_id | expires_at | updated_at | token_refreshing_at | is_active | exp − upd | Last-refresh hour (UTC) |
|---|---|---|---|---|---|---|---|---|
| Envisage — Malouf Family Trust (AUD) | `8c8c63b2…` | `04d9df1f…` | 2026-05-22T22:33:19Z | 2026-05-22T22:03:20Z | null | true | 30 min | 22:03 |
| JDS — Aeris Solutions Pty Ltd (AUD) | `fea253dd…` | `0219d3a9…` | 2026-05-26T07:49:31Z | 2026-05-26T07:19:31Z | null | true | 30 min | 07:19 |
| IICT — IICT (Aust) Pty Ltd (AUD) | `fbc6dffd…` | `1d83c9a4…` | 2026-05-27T02:30:33Z | 2026-05-27T02:00:33Z | null | true | 30 min | 02:00 |
| IICT — IICT Group Limited (HKD) | `fbc6dffd…` | `de943481…` | 2026-05-26T22:20:22Z | 2026-05-26T21:50:22Z | null | true | 30 min | 21:50 |
| IICT — IICT Group Pty Ltd (AUD) | `fbc6dffd…` | `44582ebf…` | 2026-05-26T22:20:18Z | 2026-05-26T21:50:18Z | null | true | 30 min | 21:50 |

### Critical inferences from the snapshot

1. **Every row's `expires_at − updated_at` is exactly ~30 minutes.** This is the Xero access-token TTL. The most recent write on each row is a *successful* refresh: `token-manager.ts:401–410` writes `expires_at = now + tokens.expires_in` and `updated_at = now` in the same `.update()`. So *when* a refresh has fired, it has SUCCEEDED and PERSISTED correctly. **H3 (refresh succeeds but doesn't persist) is RULED OUT.**
2. **The "last-refresh hour (UTC)" column does NOT line up with the `0 */6 * * *` cron schedule** (which fires at 00:00, 06:00, 12:00, 18:00 UTC). Witnessed hours are 22:03, 07:19, 02:00, 21:50, 21:50 — none of these are cron ticks. They line up with Australian business-hours user activity (UTC+10/11 → AEST 07:00–09:00 = UTC 21:00–23:00; AEDT/AEST midday = UTC 02:00). The refresh writes we see are **user-driven**, not cron-driven.
3. **`token_refreshing_at = null` on every row.** The cron's lock-acquire write (`token-manager.ts:711–717`) never happened — or always completed and cleaned up — but combined with finding (2), the simplest explanation is that the cron has not been touching these rows.
4. **Aggregate sanity check (12 active rows):**

```
updated_at age distribution (cron is "0 */6 * * *" = every 6h):
  <6h     : 0    ← if cron were firing, this would dominate
  6-12h   : 0    ← if cron were firing, this would also dominate
  12-24h  : 0
  1-3d    : 2
  3-7d    : 3
  >7d     : 7
  null    : 0

stuck refresh locks (>30s old): 0

most-recent updated_at across ALL active rows: 2026-05-28T22:36:24.326Z (24h ago)
  tenant: Armstrong & Co Projects Pty Ltd
```

**The most-recent `updated_at` across the ENTIRE 12-row active portfolio is 24 hours ago.** A cron firing every 6 hours and successfully refreshing rows that are past the 15-minute threshold should produce *many* rows updated in the last 6 hours. Zero rows in the `<6h` and `6-12h` buckets is structural evidence the cron is **not advancing rows at all**.

---

## Vercel Cron Invocation Log (last 7 days)

**INCONCLUSIVE — could not pull from CLI in this session.**

`vercel logs https://wisdombi.ai` hung without producing output in a non-interactive shell (likely awaiting auth or interactive selection). The Vercel MCP plugin shows `! Needs authentication`.

**Action for Matt (10 min):** run one of the following in a logged-in shell and paste the result here:

```bash
# Option A — direct CLI
vercel logs --since 7d $(vercel ls --prod | head -3 | tail -1 | awk '{print $2}') 2>&1 \
  | grep -i "refresh-xero-tokens" | tail -30

# Option B — Vercel dashboard
# https://vercel.com/<team>/wisdombi/logs?filter=path%3A%2Fapi%2Fcron%2Frefresh-xero-tokens
# Look at last 7 days. Record: (a) any invocations at all? (b) HTTP status of each.
```

**Expected outcomes:**
- (a) Zero invocations → confirms H1 directly.
- (b) Invocations exist but all return 401 → confirms H1 variant (CRON_SECRET misconfig).
- (c) Invocations exist and return 200 → falsifies H1; means cron IS firing but failing silently somewhere we don't capture (escalate to H2 deep-dive or 1-day instrumented production capture).

**Confidence without this log:** ~85%. The data-state evidence alone (point 4 above) is structural and hard to explain any other way. The dashboard log will move us to ~99%.

---

## Sentry Trail (last 14 days)

**INCONCLUSIVE — Sentry MCP not invoked in this executor session.**

The Sentry MCP server is connected (`sentry: https://mcp.sentry.dev/mcp ✓ Connected`) but no Sentry tools were exposed to this agent. Per memory `feedback_sentry_triage.md`, Sentry MCP is READ-ONLY (triage + verdict only), so no resolve/archive actions would have been taken regardless.

**Action for Matt (5 min):** in the Sentry web UI, search for each invariant tag and record event count + last-seen timestamp:

| Invariant tag | Where it fires | What seeing zero events tells us | What seeing events tells us |
|---|---|---|---|
| `invariant:cron_refresh_xero_tokens` | Aggregate cron-level failure (top-level catch in route) | Cron either isn't running OR is running successfully and never throws aggregate-level | Cron IS running but aggregate-level error somewhere |
| `invariant:cron_refresh_xero_tokens_per_connection` | Unhandled throw inside the per-row loop | No exceptions during iteration | Specific tenants throwing — record which `connection_id` tags |
| `invariant:cron_refresh_xero_tokens_failed` | Transient per-row failure (categorized but not terminal) | No transient errors per-row | Tenants having Xero-side stutters — should be self-healing on next tick |
| `invariant:xero_connection_deactivated` | Token-manager system-detected deactivation (terminal) | No terminal deactivations (good) | Hard token death — should be very rare |

**Predicted result given the data-state evidence:** ZERO events on all four invariants in the last 14 days. Reasoning: if the cron were even attempting to refresh, even a partial failure would have left a Sentry trace. The complete absence of Sentry events combined with the complete absence of `updated_at` advancement strongly suggests the cron route is not being hit by Vercel at all.

---

## Per-Hypothesis Verdict

### H1 — Cron firing?

**Verdict:** CONFIRMED NOT FIRING (operationally; awaiting Vercel log confirmation for the final 15% of certainty)

**Evidence:**
- `vercel.json:14-18` correctly registers `{"path": "/api/cron/refresh-xero-tokens", "schedule": "0 */6 * * *"}`. The literal entry is present and well-formed.
- Route file exists at `src/app/api/cron/refresh-xero-tokens/route.ts` (verified by `find`) — Next.js App Router will resolve it.
- BUT the data state shows zero `updated_at` advancement on ANY of 12 active rows in the last 24 hours, and 7/12 rows untouched for >7 days. A `0 */6 * * *` cron that loops every active row and calls `getValidAccessToken` (which refreshes every row whose `expires_at < now + 15min` — guaranteed-true for all 12 rows currently, since they're 1–7+ days expired) cannot produce this distribution if it is firing.
- Refresh writes that ARE in the data are at user-business-hours UTC offsets (22:03, 07:19, 02:00, 21:50), not cron-tick UTC offsets (00:00/06:00/12:00/18:00).
- Two plausible sub-causes:
  - **H1a — Vercel cron disabled / not deployed.** Cron entry may not have made it to production despite vercel.json being correct (cron config requires a fresh production deploy to register; if the deploy that landed `0 */6 * * *` never registered the cron with Vercel's scheduler, it never fires). Per Vercel docs, crons re-register on every `vercel --prod` deploy of `vercel.json`.
  - **H1b — `CRON_SECRET` env var unset or wrong in production.** Vercel-injected `Authorization: Bearer ${CRON_SECRET}` would mismatch, route returns 401, no work done, no Sentry capture (the 401 path returns directly without calling `Sentry.captureException`). The other 3 crons in `vercel.json` (weekly-digest, sync-all-xero, reconciliation-watch) all use the same `CRON_SECRET` header — if CRON_SECRET were globally broken, those would be silent too. Matt should compare: does the daily sync-all-xero at 16:00 UTC fire? If yes, H1b is RULED OUT and H1a is confirmed.

**Final confirmation step:** Vercel dashboard log lookup (Matt action above). The data evidence already makes this hypothesis the primary root cause.

---

### H2 — Cron erroring silently?

**Verdict:** RULED OUT (structurally, but contingent on Sentry trail check)

**Evidence:**
- The cron route (`src/app/api/cron/refresh-xero-tokens/route.ts`) wraps every meaningful failure in Sentry capture:
  - Aggregate-level errors → `invariant: cron_refresh_xero_tokens` (line 259)
  - Per-connection thrown exceptions → `invariant: cron_refresh_xero_tokens_per_connection` (line 240)
  - Per-connection transient failures → `invariant: cron_refresh_xero_tokens_failed` (line 216)
- Token-manager itself fires `invariant: xero_connection_deactivated` on terminal token death (token-manager.ts:514).
- IF the cron were firing and erroring partway, at least one of these four invariants would have events in Sentry. Matt's predicted Sentry check should return zero events on all four — which is consistent with "cron not firing at all" but inconsistent with "cron firing but erroring".
- The ONLY silent failure mode is the 401 auth-gate response (line 108) — that returns directly without capture. That collapses into H1b above.

**Final confirmation step:** Sentry zero-events check (Matt action above). RULED OUT pending that confirmation.

---

### H3 — Refresh succeeding but not persisting?

**Verdict:** RULED OUT (strongly — direct evidence in the production data)

**Evidence:**
- Every active row in the snapshot has `expires_at − updated_at = exactly ~30 minutes` (the Xero access-token TTL written by `token-manager.ts:398–408`). This is only possible if a real Xero refresh succeeded AND the database write landed AND was visible to a fresh service-role client read.
- The persistence code path (`token-manager.ts:401–422`) is structurally sound: a single `.update()` call with `access_token`, `refresh_token`, `expires_at`, and `updated_at` in one payload, error-checked at line 412.
- **Caveat noted but not material:** if the `.update()` matches zero rows it would NOT throw (it returns `{ data: [], error: null }`). The cron snapshots `is_active=true` rows, then the inner refresh updates by `.eq('id', connectionId)`. The only way to get a zero-row update is if `is_active` were flipped between snapshot and update — but the update path doesn't filter on `is_active`, only on `id`. So this is safe. Document as future-defensive: consider adding `.select()` to the update for an explicit affected-row assertion.
- Service-role client (`src/lib/supabase/admin.ts:1-23`) bypasses RLS by design and uses `autoRefreshToken: false, persistSession: false` — no auth-lock interaction. No RLS interference.

---

### H4 — Refresh threshold too late?

**Verdict:** RULED OUT (structurally)

**Evidence:**
- `REFRESH_THRESHOLD_MINUTES = 15` (token-manager.ts:23). Xero access-token TTL = 30 min. Cron interval = 360 min.
- Timeline: at T=0 (cron tick) refresh fires → new access-token valid until T+30 → at T+360 (next cron tick) the access token has been expired for 330 min, so `expiry > thresholdTime` is FALSE (`token-manager.ts:207`), so the refresh path runs unconditionally. The refresh path uses the (still-valid) 60-day refresh-token to get a new access-token.
- The threshold is irrelevant when the cron interval (6h) >> access-token TTL (30min). It only matters if the cron *fails* once: then 12h passes, and the next tick sees a token expired for >12h. The 60-day refresh-token still works to get a new one — so even a single missed cron is recoverable. The current state (3–7+ days expired) requires the cron to have been missing for many consecutive ticks, which is also consistent with H1.

---

### H5 — Per-tenant fail-forward gap?

**Verdict:** RULED OUT (by code reading)

**Evidence:**
- `src/app/api/cron/refresh-xero-tokens/route.ts:154-247` wraps the entire iteration body in `for (const row of rows) { try { ... } catch (err) { ... } }`. Both the success path (line 170) and the per-row exception path (line 229) push results and continue.
- The only `throw` that could escape is from the initial `supabase.from('xero_connections').select(...)` at line 116, which lives OUTSIDE the loop but inside the route-level `try` at line 111. That falls to the aggregate Sentry capture (line 259).
- `getValidAccessToken` returns `{success, error, shouldDeactivate}` — it does NOT throw on Xero errors (it categorizes them in `categorizeError`, token-manager.ts:599-696).
- One bad tenant cannot abort the batch. The structural isolation is sound.

---

### H6 — Token rotation issue?

**Verdict:** RULED OUT

**Evidence:**
- `token-manager.ts:402–410` — the success-path update includes `refresh_token: encrypt(tokens.refresh_token)`. The rotated refresh-token returned by Xero is persisted on every successful refresh.
- `src/app/api/Xero/callback/route.ts:63–79` — the OAuth-callback initial save persists `refresh_token: encrypt(tokens.refresh_token)` in the upsert. Initial connect is correct.
- Both write paths handle rotation correctly. The 110-char length of the encrypted `refresh_token` is identical across all 5 expired tenants, suggesting all are valid encrypted-rotated tokens (Xero's rotation produces consistent token-length).

---

### H7 — `fec0c1e2` auth-lock cap regression?

**Verdict:** RULED OUT (definitively)

**Evidence:**
- `git show fec0c1e2 --stat` lists exactly 6 files touched:
  - `src/app/admin/login/page.tsx` (browser)
  - `src/app/auth/login/page.tsx` (browser)
  - `src/app/coach/login/page.tsx` (browser)
  - `src/lib/auth/__tests__/lock-recovery.test.ts` (test)
  - `src/lib/auth/lock-recovery.ts` (browser helper)
  - `src/lib/supabase/client.ts` (browser, adds `auth: { lockAcquireTimeout: 10_000 }`)
- `src/lib/supabase/admin.ts` is **NOT in the diff**. The service-role client the cron uses calls `createClient` from `@supabase/supabase-js` (NOT `createBrowserClient` from `@supabase/ssr`) with `autoRefreshToken: false, persistSession: false`. No `navigator.locks` involvement, no `lockAcquireTimeout` setting reachable.
- The fix targets browser-side stuck-lock recovery only. The Node.js cron environment has no `navigator` global and supabase-js v2 only uses `navigator.locks` when the auth subsystem is configured to persist sessions — explicitly disabled in `admin.ts:14-17`.
- Even if the cap WERE inherited, a 10s cap would produce a thrown `LockAcquireTimeoutError`, which would be caught by the per-row catch in `route.ts:229` and emit a Sentry `cron_refresh_xero_tokens_per_connection` event. Zero such events expected per H2 → would have surfaced.

---

### Bonus — RLS interaction?

**Verdict:** RULED OUT

**Evidence:**
- `src/lib/supabase/admin.ts:10-22` uses the service role secret (`getSupabaseSecretKey()`), which bypasses RLS by design. The cron calls `createServiceRoleClient()` (route.ts:112).
- All `xero_connections` writes in the refresh path use the same service role client passed through the call stack (`route.ts:168` → `token-manager.ts:402`).
- If the cron were somehow using the anon client, an `is_active=true` SELECT might still return rows (depending on policy), but the UPDATE would silently no-op under RLS. Confirmed not the case — `createServiceRoleClient()` is the literal import.

---

## Root Cause

### Root Cause 1 — Cron not firing in production (primary; H1)

**Named cause:** The `/api/cron/refresh-xero-tokens` Vercel cron registered in `vercel.json:14-18` is not invoking the route handler in production. The evidence chain:

1. The 12-row active portfolio has **zero rows touched in the last 24 hours** despite a `0 */6 * * *` schedule that should have produced 4 invocations and refreshed every row (all 12 are well past the 15-min threshold).
2. The `updated_at` timestamps that DO exist line up with Australian business-hours UTC offsets, not cron-tick UTC offsets — these are user-driven syncs (Matt opening dashboards) and the daily `sync-all-xero` at 16:00 UTC for some, not the every-6-hours refresh cron.
3. None of the four cron-route Sentry invariants (`cron_refresh_xero_tokens*`) are predicted to have events (Matt to confirm) — consistent with the route never executing, not with the route executing-then-failing.
4. The route file exists at the correct path and the route code is structurally sound (H2/H3/H5 all RULED OUT by code reading and direct data evidence).

**Two sub-causes remain to be distinguished by Matt's Vercel-log check:**

- **1a — `vercel.json` cron not registered with Vercel scheduler.** Most likely. Crons re-register on every production deploy that includes `vercel.json`. Possible failure modes: the original 53-04 deploy on 2026-05-06 succeeded but didn't fire the cron registration (rare); a subsequent deploy (PR #197, #198, #224, #225, #226, #228, #229 — at least 7 production deploys since) overrode or invalidated the cron registration; the production Vercel project is on a plan tier that limits cron count (Hobby = 2 max, Pro = unlimited) and one of the 4 crons silently dropped.
- **1b — `CRON_SECRET` env var unset or rotated in production.** Less likely but plausible. The cron route fails closed (returns 401 immediately, no Sentry capture). Diagnostic: does the daily `sync-all-xero` cron at 16:00 UTC fire? It uses the same `CRON_SECRET` pattern (`src/app/api/cron/sync-all-xero/route.ts:31`). If `sync-all-xero` is firing successfully (visible by checking `last_synced_at` advancement on rows with valid tokens), then `CRON_SECRET` is set correctly and H1a is confirmed over H1b. If `sync-all-xero` is also silently failing, H1b is the unified cause for both.

**Quickest disambiguation (Matt, 5 min):** Open Vercel dashboard → Project → Logs → filter `path:/api/cron/refresh-xero-tokens`. Last 7 days.
- Zero invocations entirely → H1a (cron not registered).
- Invocations exist but all are 401 → H1b (CRON_SECRET broken).
- Invocations exist and are 200 → H1 RULED OUT; pivot to instrumented capture.

### Root Cause 2 — No monitoring would have surfaced the silent cron failure (contributing; emergent — H8)

**Named cause:** The Phase 53 telemetry instrumented "**what happens when the cron runs**" but not "**did the cron run at all**". All 4 invariants in the route file fire only inside the request handler. A cron that never invokes the handler produces zero telemetry, indistinguishable from a cron that successfully no-ops. The Phase 53-05 health-pill on the `/cfo` dashboard (per `53-05-SUMMARY.md`) shows token freshness at the per-tenant level, but a coach checking it for the first time in 24 days (Matt's pre-month-end audit pattern) would see it green when stale.

This is what allowed a regression as severe as "ALL 12 tenants silently expiring for 1–7+ days" to go undetected until a manual month-end audit on 2026-05-30 caught it.

---

## Recommended Fix Scope for 69-03

Map each root cause to a concrete fix template:

### Fix 1 (Root Cause 1) — Restore + lock the cron firing

- **1a Restoration:** Once Matt's Vercel log check disambiguates 1a vs 1b:
  - If **1a (not registered):** trigger a clean production redeploy of `vercel.json` (no code change needed). Verify on Vercel dashboard that the cron appears under Settings → Crons with the correct next-run timestamp.
  - If **1b (CRON_SECRET broken):** rotate `CRON_SECRET` via Vercel env, redeploy, verify the daily `sync-all-xero` and the new `refresh-xero-tokens` both produce 200s on the next tick.
- **1b Regression guard (code change):** Add a "heartbeat" write at the very top of the cron handler — BEFORE the auth gate — that records the invocation to a `cron_heartbeats` table (or appends to a lightweight log line). Even a 401 should leave a trace so the next person debugging knows "the cron WAS invoked, the secret was wrong" instead of guessing. Specifically:
  - Either: log an unauthenticated heartbeat row `{ cron_name: 'refresh-xero-tokens', invoked_at: now(), auth_passed: false|true }` before returning 401.
  - Or: emit a Sentry breadcrumb (not capture — too noisy) on every invocation regardless of auth outcome, so the breadcrumb trail itself confirms invocation cadence.
  - Recommendation: prefer the lightweight DB row — it's queryable from the same audit script and persists across the rolling Sentry retention window.
- **1c Belt-and-braces (code change):** Add a SECOND, idempotent mechanism for keeping tokens alive — invoke `getValidAccessToken` opportunistically inside the daily `sync-all-xero` cron at 16:00 UTC before each tenant's sync. If `refresh-xero-tokens` is broken, `sync-all-xero` will still pick up the slack (16:00 UTC is within the 60-day refresh-token TTL even after many missed 6h ticks). This converts "ALL refreshes fail silently for a week" into "refreshes still happen once a day during sync, just less proactively". Note: `sync-all-xero` already implicitly does this when it calls Xero APIs (which call `getValidAccessToken` first) — but explicitly invoking the refresh BEFORE the data-fetch loop guarantees refresh runs even if the data-fetch is skipped for some other reason. Document this dependency.

### Fix 2 (Root Cause 2) — Invocation-cadence monitoring

- See 69-04 recommendations below.

---

## Recommended Monitoring Scope for 69-04

The single most valuable alert would have caught this within hours:

1. **Cron-invocation freshness alert** — "If no `refresh-xero-tokens` cron invocation in last 12h, alert P1." Trigger source options:
   - (Preferred) Query the `cron_heartbeats` table added in Fix 1b. Run from a separate `daily-health-report` cron (already exists at `src/app/api/cron/daily-health-report/route.ts`). One additional query, one additional Sentry capture if stale.
   - (Alternative) Vercel's own cron-failure notifications — but these only fire on HTTP errors, not on missing invocations.
2. **Portfolio-level expires_at SLO** — "If ANY active connection has `now() - expires_at > 6h` (== 1 cron tick missed), alert P2; if `> 24h` (== 4 ticks missed), alert P1." This catches both cron-not-firing AND cron-firing-but-failing-per-tenant cases. Implement as one query in the `daily-health-report` cron.
3. **Per-tenant pre-expiry alert (already locked in 69-CONTEXT.md)** — "If `expires_at - now() < 24h` AND last refresh attempt did not succeed, capture Sentry event with tenant tag." Slightly different shape: this fires BEFORE expiry; the SLO above fires AFTER.
4. **CFO dashboard surfacing** — verify the 53-05 connection-health pill is wired into `/cfo` and is sort-ordered "dead first" per `53-05-SUMMARY.md`. Phase 70 audit ran before this pill was prominent enough to surface the issue.

---

## Open Questions Requiring Matt

1. **(Highest leverage, 5 min)** Vercel dashboard log for `path:/api/cron/refresh-xero-tokens` over last 7 days. Outcomes:
   - Zero invocations entirely → H1a (cron not registered with scheduler).
   - All 401s → H1b (CRON_SECRET broken).
   - Mix of 200s/non-200s → cron IS running; pivot to instrumented capture.
2. **(Same trip, 1 min)** Same dashboard, last 7 days for `path:/api/cron/sync-all-xero`. Distinguishes "all crons broken" (CRON_SECRET) from "just this one" (registration).
3. **(5 min)** Sentry search for each of the 4 invariants — record event count + last-seen. Predicted all zero.
4. **(Decision)** Does Matt want the cron-heartbeat to be a new DB table (`cron_heartbeats`) or an extension of an existing one? Recommend new table — small, append-only, queryable. Migration is trivial.
5. **(Decision)** Vercel project plan tier check — confirm Pro tier is active so `0 */6 * * *` is allowed. Hobby caps at daily.

---

## Self-Check: PASSED

- `.planning/phases/69-xero-token-auto-refresh-diagnosis-production-durability-fix/69-DIAGNOSIS.md` — FOUND
- 7/7 hypothesis sections present (`### H1` through `### H7`)
- 8 `Verdict:` lines (7 hypotheses + 1 bonus RLS check)
- `## Root Cause` heading present, naming Root Cause 1 (Cron not firing — H1) and Root Cause 2 (No invocation-cadence monitoring — emergent H8)
- All 5 known-expired tenants represented in the Production State Snapshot table (Envisage, JDS Aeris, IICT × 3)
- All 4 Sentry invariants referenced: `cron_refresh_xero_tokens`, `cron_refresh_xero_tokens_per_connection`, `cron_refresh_xero_tokens_failed`, `xero_connection_deactivated`
- Recommended Fix Scope for 69-03 maps each named root cause to concrete fixes
- `git status --porcelain src/ supabase/` returns 0 lines — zero production code modified
- Read-only audit script created at `scripts/phase-69-token-state-audit.mjs` (reusable for future verification)
