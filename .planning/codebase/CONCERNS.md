# Codebase Concerns — WisdomBI Exhaustive Stability Audit

**Analysis Date:** 2026-05-30
**Scope:** Stability-first, exhaustive. Every finding includes file:line evidence, risk, blast radius, fork note.

---

## Summary Table (Ranked by Risk Tier)

| # | Tier | Category | Finding | Files |
|---|------|----------|---------|-------|
| C-01 | CRITICAL | Data integrity | Dual/triple business-ID collision — 98 tables, 12 measurably mixed | Multiple |
| C-02 | HIGH | Security | RLS silent-failure on **orphan/user-ID-polluted** rows (CORRECTED: helper is dual-role + dual-ID tolerant; clean profile rows ARE visible to all 4 roles) | baseline_schema.sql:158,171 |
| C-03 | CRITICAL | Security | `xero_connections.business_id` has no FK constraint — orphaned rows, no referential integrity | baseline_schema.sql:5545 |
| C-04 | HIGH | Security | 4 of 5 cron routes degrade to fail-open **only if `CRON_SECRET` is unset** AND attacker sends literal `Bearer undefined` (CORRECTED: fails closed for normal requests; prod likely safe) | sync-all-xero:34, reconciliation-watch:44, weekly-digest:17, daily-health-report:17 |
| C-05 | CRITICAL | Money accuracy | Cashflow GST/depreciation classification via keyword match, not account ID — wrong bucketing silently mis-states cash | engine.ts:54–78 |
| C-06 | CRITICAL | Money accuracy | `AnnualPlanProgressWidget` YTD actuals hardcoded to 0 — budget vs actual progress always shows 0% | AnnualPlanProgressWidget.tsx:59–61 |
| C-07 | HIGH | Security | 59+ API routes use raw `createClient` with service-role key — bypass factory's `cache: 'no-store'` guard | 20+ route files |
| C-08 | HIGH | Security | In-memory rate limiter resets on every cold start — multi-instance (Vercel) offers zero protection | rate-limiter.ts:23 |
| C-09 | HIGH | Data integrity | `strategic_initiatives` route uses runtime schema-detection probe query every request — N+1 and schema drift signal | strategic-initiatives/route.ts:70–89 |
| C-10 | HIGH | Data integrity | `resolveBusinessIds` cache is module-level (process-lifetime) — stale cross-tenant resolution after DB changes | resolve-business-ids.ts:21 |
| C-11 | HIGH | Data integrity | Three divergent business-ID resolvers: `resolveBusinessIds`, `resolveXeroBusinessId`, `resolveBusinessId` — resolver selected inconsistently | resolve-business-ids.ts, resolve-xero-business-id.ts, resolveBusinessId.ts |
| C-12 | HIGH | Data integrity | `verifyBusinessAccess` in `kpis/route.ts` is a weaker local copy — missing `business_users` membership and `super_admin` paths | kpis/route.ts:15–35 |
| C-13 | HIGH | Security | `x-forwarded-for` header read naively — spoofable; entire rate-limit system can be bypassed with a crafted header | rate-limiter.ts:114–117 |
| C-14 | HIGH | Money accuracy | FX consolidation `presentation_currency` hardcoded to `'AUD'` — non-AUD parent entity gives wrong consolidated numbers | engine.ts:136 |
| C-15 | HIGH | Correctness | Report share tokens never expire — a leaked URL gives permanent read access to CFO reports | report-token.ts:7 |
| C-16 | HIGH | Fragile | `sync-orchestrator.ts` is 1,286 lines with 11 bare `catch {}` blocks that swallow errors silently | sync-orchestrator.ts |
| C-17 | HIGH | Input validation | Zero Zod/Joi/schema validation across all 82 API routes that parse `request.json()` — raw `any` casts throughout | All POST/PUT/PATCH routes |
| C-18 | MEDIUM | Data integrity | `activity_log.business_id` is `text` (not UUID) with no FK — accepts any string, including user auth IDs | baseline_schema.sql:1425 |
| C-19 | MEDIUM | Performance | Sequential token refresh cron: at 200+ connections × 600ms worst case = 120s, at 400+ connections it breaches the 300s `maxDuration` | refresh-xero-tokens/route.ts:75–79 |
| C-20 | MEDIUM | Performance | `strategic_initiatives` route fires 2–3 serial queries per user+business lookup before touching actual data | strategic-initiatives/route.ts:42–137 |
| C-21 | MEDIUM | Secrets | `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` accessed with bare `process.env.X!` (non-null assertion) — silently `undefined:undefined` in B64 if missing | token-manager.ts:385, auth/route.ts:12 |
| C-22 | MEDIUM | Secrets | Three env var names for the encryption key (`APP_SECRET_KEY`, `ENCRYPTION_KEY`, with PBKDF2 fallback for short secrets) — mis-configured prod would silently derive a weaker key | encryption.ts:26–47 |
| C-23 | MEDIUM | Fragile | `supabase/helpers-backup.ts` is a dead file (never imported) but deletes from an old `kpis` table — confusing if executed manually | helpers-backup.ts |
| C-24 | MEDIUM | Fragile | `src/lib/kpi-definitions-legacy.ts` exists alongside the new registry (`src/lib/kpi/`) — no imports found, but its presence invites accidental resurrection | kpi-definitions-legacy.ts |
| C-25 | MEDIUM | Correctness | Consolidation cashflow per-tenant breakdown is explicitly TODO — `consolidate_cashflows` uses a single business-level forecast, silently ignoring tenant-level cash positions | cashflow.ts:190 |
| C-26 | MEDIUM | Fork-readiness | WisdomBI brand hardcoded in 7 email files, 3+ pages, and fallback URLs — `DEFAULT_FROM`, `LOGO_URL`, `BRAND_ORANGE/NAVY`, invitation copy, password-reset subjects | resend.ts:7–30, send-report.ts:12–13 |
| C-27 | MEDIUM | Fork-readiness | `https://wisdombi.ai` as fallback in 6 API routes — a fork that omits `NEXT_PUBLIC_APP_URL` silently sends invitation emails with wrong links | send-invitation/route.ts:104, admin/clients/route.ts:377, coach/clients/route.ts:226 |
| C-28 | MEDIUM | Correctness | `ReportSnapshotView` renders a stub "report is ready" placeholder — the shared report body is permanently incomplete (TODO Plan 35-06) | ReportSnapshotView.tsx:11, 68–69 |
| C-29 | MEDIUM | Correctness | `ForecastCFO` / `CFOConversation` "Save to database" never implemented — AI CFO forecasts are lost on page reload | CFOConversation.tsx:501, ForecastCFO.tsx:99 |
| C-30 | LOW | Performance | Duplicate index on `xero_connections.business_id`: `idx_xero_connections_business` and `idx_xero_connections_business_id` are identical | baseline_schema.sql:8145–8149 |
| C-31 | LOW | Dead code | Three Supabase Edge Functions (`check-actions-due`, `check-session-reminders`, `send-notifications`) exist in `supabase/functions/` but are never invoked by the app | supabase/functions/ |
| C-32 | LOW | Tech debt | `auth_get_accessible_business_ids_text()` includes `auth.uid()::TEXT` unconditionally — every authenticated user implicitly has access to rows keyed by their own UUID, which can match swot rows stored under `created_by` | baseline_schema.sql:171 |
| C-33 | LOW | Correctness | Branded ID types (`BusinessId`, `UserId`, `BusinessProfileId`) adopted in only ~4 files — the primary safety benefit exists only at boundaries where the brand is explicitly used | types/ids.ts, resolveBusinessId.ts |
| C-34 | HIGH | Security | Canonical `verifyBusinessAccess` membership check is status- and role-blind — a removed/pending team member still passes (RLS requires `status='active'`) | verify-business-access.ts:48–57 |
| C-35 | MEDIUM | Fork-readiness | Coach access is a single `assigned_coach_id` column — no co-coaches / coach history; structural ceiling to decide before fork | baseline_schema.sql:158, verify-business-access.ts:22 |
| C-36 | CRITICAL | Security | `monthly-report/templates` route — unauthenticated, service-role CRUD on any tenant's templates (no `getUser`/`verifyBusinessAccess` on any verb) | monthly-report/templates/route.ts:8–11,17–205 |
| C-37 | HIGH | Money accuracy | Balance-sheet sync is non-atomic delete+insert; insert failure after delete leaves BS empty but returns `success: true` — silent financial-data loss | monthly-report/sync-xero/route.ts:338–371 |
| C-38 | MEDIUM | Security | `forecasts/scenarios` POST skips forecast-ownership check — cross-tenant scenario write-pollution (PATCH/DELETE are correctly user-scoped) | forecasts/scenarios/route.ts:91–153 |
| C-39 | MEDIUM | Data integrity | Client-delete cascade silently wipes `xero_pl_lines` + ~40 cascaded tables; no soft-delete/backup/confirmation (super_admin-gated) | admin/clients/route.ts:545–587, baseline_schema.sql:9685 |
| C-40 | LOW | Money accuracy | KPI target validator divides by zero when current=0 → misleading/absent warning (no crash, `isValid` unaffected) | kpi/utils/validators.ts:147 |

---

## CRITICAL

---

### C-01 — Dual/Triple Business-ID Collision

**Issue:** `business_id` columns across 98 tables hold values from three different domains interchangeably: `businesses.id`, `business_profiles.id`, or `auth.users.id`. 12 tables are measurably mixed in production:

- `activity_log`: 2,503 rows keyed by `business_profiles.id`, 11 by `businesses.id`, 31 orphaned
- `strategic_initiatives`: 439 rows under profile IDs, 9 under biz IDs, 36 under user auth IDs (because `business_id = created_by` was the original design)
- `swot_analyses`: ~26 rows under biz IDs, ~27 under user auth UUIDs (`business_id == created_by`)
- `financial_forecasts.business_id` has no FK and accepts either ID form
- `xero_connections.business_id` has no FK (see C-03)

**Files:**
- `src/lib/utils/resolve-business-ids.ts` (resolves bizId ↔ profileId)
- `src/lib/utils/resolve-xero-business-id.ts` (resolves for Xero connections, 3 lookup paths)
- `src/lib/business/resolveBusinessId.ts` (role-aware UI resolver)
- `supabase/migrations/00000000000000_baseline_schema.sql:5545` (xero_connections, no FK)
- `supabase/diagnostics/check_client_data_linkage.sql` (diagnostic query)

**Why it's a risk:** A `resolveBusinessIds` call that fails silently falls back to `bizId = profileId = inputId` (line 67–73 of `resolve-business-ids.ts`). A query against the wrong ID returns empty data — same symptom as "no data yet" — and the user sees a blank screen, not an error. Writes under the wrong ID create phantom records in the correct table that are invisible to RLS policies (see C-02). For money-sensitive tables (`financial_forecasts`, `xero_pl_lines`) this means the wrong P&L data can be silently returned.

**Blast radius:** Every page that reads or writes business-scoped data. Production incidents documented: dashboard sync returning wrong tenant's P&L, KPI saves writing to coach's own business, SWOT pages silently empty.

**Fix approach:** Enforce a single canonical ID (recommend `businesses.id`) with a write-time migration that normalises all 12 mixed tables. Add a NOT NULL FK on every `business_id` column pointing to `businesses(id)`. Until migration: enforce resolver usage at the route boundary with a lint rule.

**Fork note:** The fork inherits this. inLIFE Pulse will face the same resolution ambiguity unless the migration is completed before the fork.

---

### C-02 — RLS Silent-Failure on Orphan / User-ID-Polluted Rows

> **CORRECTED 2026-05-31 (four-role re-audit).** The original write-up claimed coaches get a silent-empty result on a client's *profile-keyed* rows. Reading the actual function body disproves that: the 5th UNION branch **does** expand `business_profiles.id` via `b.assigned_coach_id = auth.uid()` (and `owner_id`, and active `business_users`). So clean profile-keyed rows **are** visible to owner, coach, active team member, and super_admin. The real residual risk is narrower — see below.

**Issue:** `auth_get_accessible_business_ids()` (UUID variant) is actually **dual-role and dual-ID tolerant** — it `UNION`s, for the current user: owned businesses, coached businesses (`assigned_coach_id`), active `business_users` memberships, the user's own `business_profiles.id`, **and** profile IDs for any business they own/coach/are-a-member-of. Clean rows in either ID-space resolve correctly across all four roles.

The genuine silent-failure surface is the **orphan / user-ID-polluted rows**: a `business_id` value that matches neither a `businesses.id` nor a valid `business_profiles.id` (e.g. a user auth UUID, or a `business_profiles.id` whose parent-business linkage is broken) is invisible to RLS — empty result, HTTP 200, no error. In the TEXT variant this is *masked* for the writing user by the `auth.uid()::TEXT` band-aid (see C-32), which is why the pollution never surfaced as an error.

**Files:**
- `supabase/migrations/00000000000000_baseline_schema.sql:155–158` (UUID variant — coach/owner/member/profile bridge confirmed)
- `supabase/migrations/00000000000000_baseline_schema.sql:168–171` (TEXT variant — adds `auth.uid()::TEXT`, the pollution mask)
- `supabase/migrations/20260428000006_xero_pl_lines_rls.sql` (xero_pl_lines policy)
- `supabase/migrations/20260430000010_xero_bs_lines.sql:104–117` (xero_bs_lines policy)

**Why it's a risk:** Silent empty result is the worst failure mode for a CFO platform — no 403, no error log. The narrower (corrected) blast radius is orphan rows in the 12 MIXED tables (see C-01), and any **new** table whose RLS policy omits the `bp.id` bridge or picks the wrong helper variant — that table reverts to the broad silent-empty failure for profile-keyed rows.

**Blast radius:** Orphan/user-ID rows in the 12 MIXED tables; any future table that doesn't reuse the dual-tolerant helper.

**Fix approach:** Normalise all affected `business_id` columns to `businesses.id` (C-01 subsumes this), which lets the RLS helpers drop the `business_profiles.id` UNION branches entirely. Standardise every new policy on the canonical helper so the bridge is never re-omitted. **Ordering:** do NOT remove the `auth.uid()::TEXT` mask (C-32) until the orphan/user-ID rows are cleansed (R14), or those rows become inaccessible to the user who wrote them.

**Four-role note:** Coach access is via the single `businesses.assigned_coach_id` column (one coach per business — see C-34). Every RLS/resolver change must be verified across all four roles × both ID-spaces (owner, active team member, coach, super_admin).

**Fork note:** The *code* (helper functions) is dual-tolerant and forks cleanly; the *data* pollution is WisdomBI-prod only. Fork starts clean.

---

### C-03 — `xero_connections.business_id` Has No Foreign Key Constraint

**Issue:** `xero_connections.business_id` is declared `uuid NOT NULL` at `baseline_schema.sql:5547` but has no `REFERENCES businesses(id)` or `REFERENCES business_profiles(id)` FK. Any UUID can be inserted.

**Files:**
- `supabase/migrations/00000000000000_baseline_schema.sql:5545–5563` (CREATE TABLE)
- No FK ADD CONSTRAINT exists anywhere in the 45-migration history for this column.

**Why it's a risk:** Orphaned `xero_connections` rows (no parent in either businesses or business_profiles) accumulate. The cron refresh loop iterates all `is_active=true` rows — orphaned rows consume Xero API quota and Vercel function time on every cron tick. If the business is deleted without cascading, the connection row persists and the cron keeps refreshing a token for a non-existent tenant.

**Blast radius:** Cron efficiency; potential token-refresh quota exhaustion; confusing data in health dashboard.

**Fix approach:** Add `FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE` after normalising all rows to `businesses.id`. Until then, add a uniqueness + orphan check to the cron's pre-flight.

**Fork note:** Fork inherits this schema gap.

---

### C-04 — Weak Cron Auth Pattern (4 of 5 Routes) — narrow fail-open only when `CRON_SECRET` is unset

> **CORRECTED 2026-05-31 (firsthand re-verification).** The original write-up had a logic error: it claimed an absent header "passes." It does NOT. The code is `if (auth !== \`Bearer ${process.env.CRON_SECRET}\`) return 401`. With the header absent, `auth` is `null`; `null !== 'Bearer undefined'` is `true`, so the guard **returns 401 — fails CLOSED** for a normal unauthenticated request. **Severity downgraded CRITICAL → HIGH.** If `CRON_SECRET` is set in prod (it is, on Vercel), these routes are currently secure; the fix is defense-in-depth.

**Issue:** `sync-all-xero`, `reconciliation-watch`, `weekly-digest`, and `daily-health-report` use:
```typescript
if (auth !== `Bearer ${process.env.CRON_SECRET}`) { return 401 }
```
The residual hole is narrow: **only when `CRON_SECRET` is unset** does the guard degrade to `auth !== 'Bearer undefined'`, which an attacker can satisfy by sending the literal header `Authorization: Bearer undefined`. A normal request with no header still gets 401. So the exposure is: misconfigured environment (preview deploy, local `vercel dev`, a fork that forgot to set `CRON_SECRET`) **AND** an attacker who sends the literal `Bearer undefined`. Only `refresh-xero-tokens` uses the explicit fail-closed pattern (`if (!cronSecret || ...)`).

**Files:** (all confirmed firsthand — identical pattern)
- `src/app/api/cron/sync-all-xero/route.ts:34`
- `src/app/api/cron/reconciliation-watch/route.ts:44`
- `src/app/api/cron/weekly-digest/route.ts:17`
- `src/app/api/cron/daily-health-report/route.ts:17`
- Compare: `src/app/api/cron/refresh-xero-tokens/route.ts:126–129` (correct, fail-closed)

**Why it's a risk:** In any environment where `CRON_SECRET` is not set, these four routes become triggerable by an attacker who guesses the misconfiguration and sends `Bearer undefined` — forcing a full Xero sync (quota exhaustion), digest emails, or reconciliation logic. **Most relevant for the fork** (a fresh deploy that hasn't set `CRON_SECRET` yet), less so for current WisdomBI prod where the secret is set.

**Blast radius:** All four cron endpoints, *only* in environments missing `CRON_SECRET`. Pre-flight: confirm `CRON_SECRET` is set in Vercel prod (likely already true → routes currently safe).

**Fix approach:** Change all four to the fail-closed pattern:
```typescript
const cronSecret = process.env.CRON_SECRET
const authHeader = req.headers.get('authorization')
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) { return 401 }
```

**Fork note:** Fork inherits this. A new fork deployment without `CRON_SECRET` configured is immediately vulnerable.

---

### C-05 — Cashflow GST/Depreciation Classification via Keyword Match

**Issue:** The cashflow engine classifies accounts as GST-exempt or depreciation using substring matching against `account_name`:
```typescript
// src/lib/cashflow/engine.ts:54–57
const GST_EXEMPT_KEYWORDS = ['wage', 'salary', 'super', 'payg', 'worker', 'insurance', 'bank interest', 'depreciation', 'amortisation', 'amortization']
function isGSTExemptExpense(accountName: string): boolean {
  return GST_EXEMPT_KEYWORDS.some(kw => lower.includes(kw))
}
```
An account named "Software Superannuation Tracker" would be classified as GST-exempt because it contains "super". An account named "Maintenance of Bank" would suppress GST gross-up. These misclassifications propagate to BAS payment projections and net cash position.

**Files:**
- `src/lib/cashflow/engine.ts:40–57` (keyword arrays)
- `src/lib/cashflow/engine.ts:444–456` (GST-exempt check in expense loop)
- `src/lib/cashflow/engine.ts:575` (second GST-exempt check)
- `src/lib/cashflow/account-resolution.ts:2–10` (documents this is interim, Phase 28.2 upgrade not yet landed)

**Why it's a risk:** Wrong GST classification mis-states cashflow projections shown to clients as CFO-level forecasts. BAS payment timing and quarterly tax liability are both derived from this classification.

**Blast radius:** All cashflow forecasts for all clients. Silent numeric error with no warning.

**Fix approach:** Phase 28.2 (referenced in engine.ts:71) — use explicit account IDs from `cashflow_settings.bank_account_ids` and extend settings to hold depreciation/super account IDs. Until then, add a validation warning when the keyword fallback fires.

**Fork note:** Fork inherits this. The inLIFE Pulse cashflow feature would carry the same GST mis-classification risk.

---

### C-06 — Annual Plan Progress Widget YTD Actuals Hardcoded to Zero

**Issue:**
```typescript
// src/app/finances/forecast/components/AnnualPlanProgressWidget.tsx:59–61
ytdRevenue: 0, // TODO: Sum from actual P&L data
ytdGrossProfit: 0, // TODO: Calculate from P&L
ytdNetProfit: 0, // TODO: Calculate from P&L
```
The widget displays revenue/gross profit/net profit progress vs annual goals with all actuals permanently 0. Progress bars will always show 0% regardless of actual business performance.

**Files:**
- `src/app/finances/forecast/components/AnnualPlanProgressWidget.tsx:50–68`

**Why it's a risk:** A client or coach looking at annual plan progress sees 0% performance on all financial KPIs. This actively misleads — a business hitting 80% of annual revenue looks the same as one at 0%.

**Blast radius:** Every user of the forecast/annual plan page. Visible, client-facing UI with wrong numbers.

**Fix approach:** Wire the widget to the `/api/forecast/dashboard-actuals` endpoint which already aggregates YTD P&L from `xero_pl_lines`. The data exists; the connection is simply missing.

**Fork note:** Fork inherits this. inLIFE Pulse would ship broken progress tracking.

---

## HIGH

---

### C-07 — Raw `createClient` Bypasses Factory `cache: 'no-store'` Guard (59 Usages)

**Issue:** `createServiceRoleClient()` in `src/lib/supabase/admin.ts` explicitly sets `fetch: (url, init) => fetch(url, { ...init, cache: 'no-store' })` to prevent Next.js from caching Supabase responses. However, 59 API routes construct a raw `createClient(url, key)` without this override, meaning Next.js may serve stale Supabase data from the fetch cache.

**Files (sample):**
- `src/app/api/forecast/cashflow/settings/route.ts:13–16`
- `src/app/api/forecast/cashflow/sync-balances/route.ts:13–16`
- `src/app/api/forecast/cashflow/capex/route.ts:13–16`
- `src/app/api/Xero/status/route.ts:13–16`
- `src/app/api/Xero/active-tenants/route.ts:31–34`
- (and 54 more)

**Why it's a risk:** Stale financial data served from cache. A freshly synced P&L could return the previous month's numbers on the next request if Next.js's automatic caching applies.

**Blast radius:** All routes using raw `createClient`. All routes that have `export const dynamic = 'force-dynamic'` are partially protected (prevents page-level caching) but not fetch-level caching.

**Fix approach:** Replace all raw `createClient` in API routes with `createServiceRoleClient()`. Add a lint rule banning direct `import { createClient } from '@supabase/supabase-js'` in `src/app/api/`.

**Fork note:** Fork inherits all 59 usages.

---

### C-08 — In-Memory Rate Limiter Ineffective on Multi-Instance Deployments

**Issue:**
```typescript
// src/lib/utils/rate-limiter.ts:23
const rateLimitMap = new Map<string, RateLimitRecord>()
```
Rate limit state lives in a module-level `Map`. Vercel deploys each serverless function invocation in its own isolate. The rate limiter resets on every cold start and is not shared between concurrent instances.

**Files:**
- `src/lib/utils/rate-limiter.ts:1–146`

**Why it's a risk:** Auth rate limiting (5 attempts / 15 min) and AI rate limiting (30 / hour) provide no actual protection in production. An attacker can brute-force passwords by spreading requests across concurrent invocations, or exhaust AI quota by sending concurrent requests.

**Blast radius:** Password reset (`auth/reset-password`), password update (`auth/update-password`), all AI endpoints, any route using `checkRateLimit`.

**Fix approach:** Use Redis (Upstash) or Supabase for rate limit counters, keyed by user ID + route. The comment in `rate-limiter.ts:3` already acknowledges this.

**Fork note:** Fork inherits this. A fork without Redis rate limiting is vulnerable from day 1.

---

### C-09 — `strategic_initiatives` Route Fires a Schema-Detection Probe Every Request

**Issue:**
```typescript
// src/app/api/strategic-initiatives/route.ts:74–88
const { error: testErr } = await supabase
  .from('strategic_initiatives')
  .select(EXTENDED_COLUMNS)
  .limit(0)
if (testErr) { columns = CORE_COLUMNS; hasExtendedCols = false }
```
Every GET to this route fires a `.limit(0)` query purely to detect whether `estimated_cost` and `is_monthly_cost` columns exist. This is a schema-detection anti-pattern: the columns were added in a migration months ago; if the migration has run, this probe is wasted every request.

**Files:**
- `src/app/api/strategic-initiatives/route.ts:70–89`

**Why it's a risk:** Extra DB round-trip on every strategic-initiatives load. More critically, it signals migration drift — the code doesn't trust its own schema. If the schema detection ever returns false in production (e.g. a Supabase outage causing a 500), the route silently drops cost data from all returned initiatives.

**Blast radius:** All annual plan views that load strategic initiatives.

**Fix approach:** Remove the probe. The columns exist. If forward-compatibility is needed, use a TypeScript-level optional property and rely on the schema types.

**Fork note:** Fork inherits this. Should be cleaned before forking.

---

### C-10 — Module-Level `resolveBusinessIds` Cache Never Invalidated

**Issue:**
```typescript
// src/lib/utils/resolve-business-ids.ts:21
const cache = new Map<string, ResolvedIds>()
```
The cache is process-lifetime (survives across requests in a warm Vercel function). A business that changes its `business_profiles` relationship (e.g. after a migration run or admin correction) would return stale resolution results until the function cold-starts.

**Files:**
- `src/lib/utils/resolve-business-ids.ts:21–73`

**Why it's a risk:** If a tenant's `business_profiles.id` ↔ `businesses.id` mapping changes (which Phase 53 and 69 have done in production via reconnect runbooks), the stale cache returns the old IDs. Subsequent queries use the wrong ID and return empty data or write to the wrong row.

**Blast radius:** Any route that resolves IDs in a long-lived warm function — effectively the sync orchestrator (which runs for up to 300s and resolves IDs across multiple tenants in one execution).

**Fix approach:** Limit cache lifetime (TTL-based, e.g. 60s) or scope the cache per-request using `AsyncLocalStorage`. Do not use module-level state for mutable business data.

**Fork note:** Fork inherits this.

---

### C-11 — Three Divergent Business-ID Resolvers

**Issue:** Three separate resolver implementations exist, each with different lookup logic:

1. `src/lib/utils/resolve-business-ids.ts` — bidirectional, returns `{ bizId, profileId, all }`, has module cache, no auth check
2. `src/lib/utils/resolve-xero-business-id.ts` — Xero-specific, 3-path lookup (direct → profile→biz → biz→profile), returns latest active connection
3. `src/lib/business/resolveBusinessId.ts` — role-aware, UI-facing, returns branded `BusinessId | null`, no Xero concern

**Files:**
- `src/lib/utils/resolve-business-ids.ts`
- `src/lib/utils/resolve-xero-business-id.ts`
- `src/lib/business/resolveBusinessId.ts`

**Why it's a risk:** Routes that choose the wrong resolver get silently wrong behavior. A route calling `resolveBusinessIds` for a Xero operation may get the profile ID when the connection is stored under the biz ID, or vice versa. There is no lint enforcement of which resolver to use where.

**Blast radius:** Xero sync, financial forecast writes, connection health checks.

**Fix approach:** Consolidate into one canonical resolver with typed return variants. Document which tables use which ID form. Until consolidation, add a comment header to each resolver stating exactly which tables it covers.

**Fork note:** Fork inherits all three. A fork would ideally consolidate before adding new features.

---

### C-12 — Divergent `verifyBusinessAccess` in `kpis/route.ts`

**Issue:** `src/app/api/kpis/route.ts:15–35` defines a local `verifyBusinessAccess` that checks only `owner_id`/`assigned_coach_id` and `business_profiles.user_id`. It is missing:
- `business_users` team membership check
- `super_admin` role check

The canonical version in `src/lib/utils/verify-business-access.ts` includes both. The KPI route uses its own weaker version throughout all four verbs (GET, POST, DELETE, PATCH).

**Files:**
- `src/app/api/kpis/route.ts:15–35` (weak local copy)
- `src/lib/utils/verify-business-access.ts:14–67` (canonical version)

**Why it's a risk:** Team members with `business_users` membership cannot read or write their own business's KPIs. Super admins get 403 on KPI operations. This is an active access-control bug affecting multi-user businesses.

**Blast radius:** All KPI operations for any business with team members or super-admin access.

**Fix approach:** Replace the local function with an import of `verifyBusinessAccess` from `@/lib/utils/verify-business-access`. **Consolidate together with C-34** — the canonical function itself needs a status/role fix, so the end state is one canonical, role- and status-aware `verifyBusinessAccess` used everywhere.

**Fork note:** Fork inherits this bug.

---

### C-13 — `x-forwarded-for` Header Spoofable by Attackers

**Issue:**
```typescript
// src/lib/utils/rate-limiter.ts:114–117
const forwardedFor = request.headers.get('x-forwarded-for')
if (forwardedFor) {
  return forwardedFor.split(',')[0].trim()
}
```
`x-forwarded-for` is a user-controlled header. Any client can set `X-Forwarded-For: 1.2.3.4` to use a different IP for each request, defeating IP-based rate limiting entirely.

**Files:**
- `src/lib/utils/rate-limiter.ts:112–127`

**Why it's a risk:** Combined with C-08 (in-memory), rate limiting provides effectively zero protection. An attacker can brute-force passwords from a single IP by rotating the `X-Forwarded-For` header.

**Blast radius:** Auth endpoints (password reset, password update), AI endpoints.

**Fix approach:** Use Vercel's trusted `x-vercel-forwarded-for` header (set by the edge, not spoofable) or use user-ID-based rate limits instead of IP-based. For auth, Supabase's built-in rate limiting on auth operations is more reliable.

**Fork note:** Fork inherits this.

---

### C-14 — Consolidation `presentation_currency` Hardcoded to `'AUD'`

**Issue:**
```typescript
// src/lib/consolidation/engine.ts:136
presentation_currency: 'AUD', // hardcoded for now — could add to businesses column later
```
The consolidation engine always translates to AUD regardless of the parent entity's actual reporting currency.

**Files:**
- `src/lib/consolidation/engine.ts:134–138`

**Why it's a risk:** A group entity reporting in USD or NZD would get AUD-denominated consolidated statements. The FX translation module (`fx.ts`) uses `presentation_currency` to decide whether to translate or pass through — hardcoding AUD means non-AUD groups are silently mis-stated.

**Blast radius:** Any multi-entity consolidation where the group's presentation currency is not AUD. Currently production uses are AUD-only (Dragon/IICT), but this blocks any non-AUD expansion.

**Fix approach:** Add `presentation_currency` to the `businesses` table (a single migration). Read it via `loadBusinessContext`. Until then, document the limitation prominently in the consolidation UI.

**Fork note:** Fork inherits this. inLIFE Pulse serving non-Australian markets is blocked by this.

---

### C-15 — Report Share Tokens Never Expire

**Issue:**
```typescript
// src/lib/reports/report-token.ts:7
// Tokens do NOT encode an expiry or issued-at timestamp — per D-21 they are
// valid indefinitely. The only global kill-switch is rotating the secret.
```
A report share link is valid forever. There is no per-token revocation mechanism.

**Files:**
- `src/lib/reports/report-token.ts:1–57`

**Why it's a risk:** If a CFO report link is shared and later the business relationship ends (e.g. client offboards), the link remains live and grants access to that client's financial data indefinitely. The only remediation is rotating `REPORT_LINK_SECRET`, which invalidates ALL existing share links for all clients.

**Blast radius:** All shared CFO reports. Shared report tokens for departed clients are permanently valid.

**Fix approach:** Encode an `exp` timestamp in the token payload. Add a `created_at` + `expires_at` to `cfo_report_status` rows and check validity at the view endpoint.

**Fork note:** Fork inherits this. Any fork that uses the report-sharing feature ships with permanent-validity tokens.

---

### C-16 — `sync-orchestrator.ts` 1,286 Lines, 11 Bare `catch {}` Blocks

**Issue:** The sync orchestrator swallows errors in 11 places with empty `catch {}` blocks. Several are intentional (Sentry outage protection), but others swallow substantive errors:

- `sync-orchestrator.ts:501` — `catch {}` around the business-profile fiscal year lookup: silently defaults to July start for any client whose profile query fails
- `sync-orchestrator.ts:598` — around Sentry breadcrumb (acceptable)
- `sync-orchestrator.ts:752, 818, 838, 941, 972` — around BS month/FY writes; failures leave partial data silently
- `sync-orchestrator.ts:1046, 1154` — around Sentry + activity_log writes (acceptable)

**Files:**
- `src/lib/xero/sync-orchestrator.ts:332, 365, 501, 598, 752, 818, 838, 941, 972, 1046, 1154`

**Why it's a risk:** A BS write failure at line 838 leaves a partial balance sheet for that period with no error signal. The sync job reports `status: 'partial'` but the specific month that failed is not identifiable in the `sync_jobs` audit row.

**Blast radius:** Balance sheet data integrity. A partially-written BS month shows wrong net-assets / equity balances.

**Fix approach:** Replace bare `catch {}` around write operations with `catch (err) { monthsFailed.push(...); Sentry.captureException(err) }`. Reserve bare `catch {}` exclusively for Sentry/telemetry blocks.

**Fork note:** Fork inherits this.

---

### C-17 — No Schema Validation on Request Bodies (82 Routes)

**Issue:** Zero Zod/Joi/yup usage anywhere in the codebase. All 82 API routes that parse `request.json()` cast the result to `any` or use destructuring with no runtime type checking:
```typescript
const body = await request.json()
const { businessId, kpis } = body  // no validation
```

**Files (sample):**
- `src/app/api/kpis/route.ts:107–128`
- `src/app/api/forecast/cashflow/settings/route.ts:144`
- `src/app/api/forecast/cashflow/sync-balances/route.ts:113`
- `src/app/api/goals/save/route.ts` (complex multi-step, no validation)
- All POST/PUT/PATCH routes

**Why it's a risk:** Missing `businessId` causes null-pointer downstream rather than a clean 400. Unexpected extra fields can trigger unexpected behavior (e.g., injecting `is_active: false` into an upsert payload). For money-sensitive writes, invalid numeric types pass through to DB without error.

**Blast radius:** All mutation endpoints. A malformed request can produce partial writes or unhandled exceptions.

**Fix approach:** Add Zod schemas at route entry points. At minimum, validate all required fields and their types before any DB operation.

> **NUANCE (re-verification):** "Zero validation" overstates it — there is no schema *library* (no Zod/Joi/yup anywhere in `src/`), but routes do apply ad-hoc presence guards (e.g. `kpis/route.ts:109–127` checks `!businessId` and `!Array.isArray(kpis)`; `goals/save/route.ts:33–36` checks `!businessId`). The real gap is **no type/shape/range enforcement** — presence checks only. Severity HIGH still holds for money-mutating routes.

**Fork note:** Fork inherits this. Any fork expansion that adds new endpoints will perpetuate the pattern.

---

## MEDIUM

---

### C-18 — `activity_log.business_id` Is `text` With No FK

**Issue:** `activity_log.business_id` is typed `text` (not `uuid`) with no FK constraint. The RLS policy uses `auth_get_accessible_business_ids_text()` which returns `TEXT[]`. This means any string can be inserted as `business_id`, including user auth UUIDs (confirmed in production: 31 orphaned rows with non-business UUIDs).

**Files:**
- `supabase/migrations/00000000000000_baseline_schema.sql:1423–1431`
- `src/app/api/kpis/route.ts:194–200` (inserts `businessId` directly without resolution)

**Why it's a risk:** The `kpis` POST route inserts an activity_log entry at line 194 with the raw `businessId` from the request. If that ID is a profile ID, the log entry will not be visible under the biz ID. Coach activity views show gaps.

**Blast radius:** Activity log completeness. Coaching session history may be incomplete.

**Fix approach:** Migrate `business_id` to `uuid` with an FK to `businesses(id)`, after normalising existing rows.

---

### C-19 — Sequential Token Refresh Cron Approaching Timeout at Scale

**Issue:** The `refresh-xero-tokens` cron is explicitly sequential:
```
// src/app/api/cron/refresh-xero-tokens/route.ts:75–79
// At ~20 active connections × ~200ms each = ~4s. Even at 200 connections × 600ms
// worst case = 120s, comfortably under the 300s maxDuration budget. Revisit
// maxDuration / chunked iteration if portfolio crosses ~400 connections
```
At current growth (18+ clients, some with multiple tenants), the cron runs in ~4s. But at 50 clients with 2 tenants each = 100 connections × 600ms = 60s; at 100 clients with 3 tenants = 300 connections × 600ms = 180s.

**Files:**
- `src/app/api/cron/refresh-xero-tokens/route.ts:75–79, 99`

**Why it's a risk:** When the 300s budget is breached, Vercel kills the function mid-run. Connections refreshed late in the loop get no refresh, silently expiring within the next 15 minutes. The heartbeat won't fire (the function was killed), so there's no alert.

**Blast radius:** All Xero connections for tenants ordered late in the snapshot. The last ~20% of connections would expire.

**Fix approach:** Switch to chunked parallel execution (e.g., 5 concurrent with `Promise.allSettled`) with per-chunk `sleep(100ms)` to avoid Xero rate limits. Implement at >80 connections.

> **NUANCE (re-verification):** Cited lines `75–79` are the developer's own risk *comment*, not the loop. The actual sequential `for...of` loop is at **`refresh-xero-tokens/route.ts:182`**. Finding is architecturally correct; this is a **future** risk (>400 connections; currently ~18 clients), severity MEDIUM is right.

---

### C-20 — `strategic_initiatives` Route: 2–3 Serial DB Queries Before Data Access

**Issue:** The route at `src/app/api/strategic-initiatives/route.ts` fires:
1. `businesses` lookup (line 46–50)
2. `business_profiles` lookup (line 57–65)
3. Schema detection probe (line 74–88)
4. Then the actual data query (line 93–102)

This is 3–4 serial round-trips before any data is returned.

**Files:**
- `src/app/api/strategic-initiatives/route.ts:42–137`

**Why it's a risk:** Latency on every strategic-initiatives page load. At ~20ms per Supabase round-trip, this adds 60–80ms overhead per request.

**Fix approach:** Remove schema detection (C-09). Resolve business IDs with `resolveBusinessIds` (one query). Query with `.in('user_id', userIds).or('business_id.in.(...)')` using resolved IDs in a single query.

---

### C-21 — Xero Credentials Accessed via Non-Null Assertion Without Validation

**Issue:**
```typescript
// src/lib/xero/token-manager.ts:385
`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
```
If either env var is missing, the Basic Auth header becomes `undefined:undefined` encoded in Base64. Xero returns a `400 invalid_client` error which the token manager correctly does not deactivate connections for (C-21b: this means Xero silent mis-configuration never escalates — a known policy trade-off per `categorizeError`). However, all token refreshes silently fail for the entire duration of the misconfiguration.

**Files:**
- `src/lib/xero/token-manager.ts:383–387`
- `src/app/api/Xero/auth/route.ts:12` (`XERO_CLIENT_ID` at module level)
- `src/app/api/Xero/callback/route.ts:21–22`

**Why it's a risk:** A deployment with missing `XERO_CLIENT_ID` or `XERO_CLIENT_SECRET` silently fails all token refreshes. The cron logs `status: 'failed'` per connection but doesn't surface "credentials missing" as the root cause.

**Fix approach:** Add an explicit check at startup (in `src/lib/utils/env-validation.ts`) that `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET` are non-empty. Throw a startup error rather than silently constructing `undefined:undefined`.

---

### C-22 — Three Encryption Key Env Var Names With PBKDF2 Fallback

**Issue:**
```typescript
// src/lib/utils/encryption.ts:26
const keyString = process.env.APP_SECRET_KEY || process.env.ENCRYPTION_KEY
```
Plus a fallback at lines 163–165 that also checks `OAUTH_STATE_SECRET`. If neither is a 64-char hex or 44-char base64, the code falls through to `pbkdf2Sync` with a static salt (`xero-tokens-salt-v1`). A short human-readable secret like `mysecret123` would derive a key with much lower entropy than AES-256 intends.

**Files:**
- `src/lib/utils/encryption.ts:25–48`
- `src/lib/utils/encryption.ts:160–165`

**Why it's a risk:** A misconfigured deployment silently uses a weaker derived key. Xero access/refresh tokens at rest are only as secure as the derived key entropy.

**Fix approach:** Remove the PBKDF2 fallback. Require `APP_SECRET_KEY` to be exactly 64 hex chars. Fail loudly at startup (via `env-validation.ts`) if it is not.

---

### C-23 — `helpers-backup.ts` Dead File Deletes From Old `kpis` Table

**Issue:** `src/lib/supabase/helpers-backup.ts` is never imported anywhere. It contains `batchUpsertKPIs` which deletes from a `kpis` table (which is now `business_kpis`). If a developer executes this function by mistake (e.g., wires it to a button during a refactor), it would delete from a non-existent or wrong table.

**Files:**
- `src/lib/supabase/helpers-backup.ts:1–30+`

**Why it's a risk:** Accidental data deletion if the file is accidentally imported during refactoring. Confusing because it references old table names.

**Fix approach:** Delete the file. It is orphaned dead code.

---

### C-24 — `kpi-definitions-legacy.ts` Present Alongside New Registry

**Issue:** `src/lib/kpi-definitions-legacy.ts` exists alongside `src/lib/kpi-definitions.ts` and the new `src/lib/kpi/` registry. No active imports found. Its presence invites accidental use during future KPI work.

**Files:**
- `src/lib/kpi-definitions-legacy.ts`
- `src/lib/kpi-definitions.ts` (also unused via imports — verify before deleting)
- `src/lib/kpi/data/registry.ts` (current canonical source)

**Fix approach:** Verify no imports, then delete both legacy files.

---

### C-25 — Consolidation Cashflow Per-Tenant Breakdown Is TODO

**Issue:**
```typescript
// src/lib/consolidation/cashflow.ts:190
// Per-tenant cashflow breakdown is TODO — today we combine a single
// baseline with per-tenant opening bank balances via loadTenantOpeningBankBalance.
```
The consolidated cashflow view uses one single business-level forecast (tenant_id IS NULL) for all P&L lines. Per-tenant cash positions (opening balances) are loaded separately, but the P&L-derived cashflow items are not tenant-separated.

**Files:**
- `src/lib/consolidation/cashflow.ts:185–200`
- `src/lib/consolidation/cashflow.ts:456` (capex also not per-tenant)

**Why it's a risk:** A Dragon Group or IICT Group consolidated cashflow statement blends cash timing from all tenants as if they were one entity. Intercompany timing differences are invisible. For entities with different DSO/DPO settings, the consolidated cashflow is materially wrong.

**Blast radius:** All users of the consolidated cashflow tab (admin/consolidation page).

---

### C-26 — WisdomBI Brand Hardcoded in Email Services

**Issue:** The following are hardcoded in source files, not environment variables:

- `src/lib/email/resend.ts:7`: `DEFAULT_FROM = 'WisdomBI <noreply@mail.wisdombi.ai>'`
- `src/lib/email/resend.ts:24–25`: `BRAND_ORANGE = '#F5821F'`, `BRAND_NAVY = '#172238'`
- `src/lib/email/resend.ts:30`: `LOGO_URL = 'https://wisdombi.ai/images/logo-main.png'`
- `src/lib/email/resend.ts:53`: `<img src="${LOGO_URL}" alt="WisdomBI" ...>`
- `src/lib/email/send-report.ts:12–13`: same pattern
- Invitation email subject: `"...invited you to ... on WisdomBI"` (resend.ts:177)
- Password reset subject: `"Reset your WisdomBI password"` (resend.ts:223)

**Files:**
- `src/lib/email/resend.ts:7, 24–30, 53, 63, 139, 143, 177, 223`
- `src/lib/email/send-report.ts:12–13, 79, 91`

**Why it's a risk for fork:** An inLIFE Pulse deployment using this codebase sends WisdomBI-branded emails with WisdomBI logo to inLIFE clients. Brand confusion and potential legal issues.

**Fix approach:** Move all brand constants to env vars (`BRAND_NAME`, `BRAND_COLOR_PRIMARY`, `BRAND_LOGO_URL`, `BRAND_FROM_EMAIL`). The email templates can read from these at send time.

---

### C-27 — `https://wisdombi.ai` Hardcoded as URL Fallback in 6 Routes

**Issue:** Six routes use `process.env.NEXT_PUBLIC_APP_URL || 'https://wisdombi.ai'` as the base URL for invitation links:

- `src/app/api/clients/send-invitation/route.ts:104`
- `src/app/api/admin/clients/route.ts:377`
- `src/app/api/admin/clients/resend-invitation/route.ts:90`
- `src/app/api/admin/reset-password/route.ts:113`
- `src/app/api/auth/reset-password/route.ts:101`
- `src/app/api/coach/clients/route.ts:226`

**Why it's a risk for fork:** A fork deployment that doesn't set `NEXT_PUBLIC_APP_URL` sends invitation emails with `https://wisdombi.ai/...` links. The client clicks the link, lands on the wrong product, and the invite token is useless. Silently sends wrong links without any error.

**Fix approach:** Remove the fallback. Throw a startup error if `NEXT_PUBLIC_APP_URL` is not set. It is a required configuration for any deployment.

---

### C-28 — Report Snapshot View Is a Permanent Stub

**Issue:**
```typescript
// src/app/reports/view/[token]/ReportSnapshotView.tsx:11, 68–69
// TODO(Plan 35-06): replace the minimal "report is ready" body below with the
// TODO(Plan 35-06): render the detailed report body from snapshot.report
```
The shared CFO report view (`/reports/view/[token]`) renders a "your report is ready" message rather than the actual report content. Plan 35-06 was never completed.

**Files:**
- `src/app/reports/view/[token]/ReportSnapshotView.tsx:11, 34–75`
- `src/app/reports/view/[token]/page.tsx:50`

**Why it's a risk:** The CFO report sharing feature (Phase 35) is partially shipped. Coaches can generate a share link; clients who click it see only a placeholder. This is a client-facing gap.

**Fix approach:** Implement Plan 35-06: render `snapshot.report` (the `GeneratedReport` shape) in the view component.

---

### C-29 — AI CFO Forecast Generation Not Persisted

**Issue:**
```typescript
// src/app/finances/forecast/components/forecast-cfo/CFOConversation.tsx:501
// TODO: Save to database
// src/app/finances/forecast/components/forecast-cfo/ForecastCFO.tsx:99
// TODO: Save forecast to database and return ID
```
The AI CFO conversation flow generates a forecast but never persists it. Refreshing the page loses all AI-generated forecast data.

**Files:**
- `src/app/finances/forecast/components/forecast-cfo/CFOConversation.tsx:501`
- `src/app/finances/forecast/components/forecast-cfo/ForecastCFO.tsx:99`

**Why it's a risk:** This is a client-visible feature that silently loses work. A client who completes the AI CFO conversation then navigates away loses their entire forecast.

---

## LOW

---

### C-30 — Duplicate Index on `xero_connections.business_id`

**Issue:** Two identical btree indexes on `xero_connections.business_id`:
- `idx_xero_connections_business` (line 8145)
- `idx_xero_connections_business_id` (line 8149)

**Files:**
- `supabase/migrations/00000000000000_baseline_schema.sql:8141–8153`

**Fix approach:** Drop one. `idx_xero_connections_active` (business_id, is_active) is a covering index that supersedes both for the common `WHERE business_id = X AND is_active = true` query.

---

### C-31 — Three Dead Supabase Edge Functions

**Issue:** `supabase/functions/check-actions-due/`, `check-session-reminders/`, and `send-notifications/` are deployed but never invoked by any code in `src/`.

**Files:**
- `supabase/functions/check-actions-due/index.ts`
- `supabase/functions/check-session-reminders/index.ts`
- `supabase/functions/send-notifications/index.ts`

**Fix approach:** If replaced by cron routes, delete from the functions directory and undeploy from Supabase. Reduces attack surface and confusion.

---

### C-32 — `auth_get_accessible_business_ids_text()` Includes `auth.uid()::TEXT` Unconditionally

**Issue:**
```sql
-- supabase/migrations/00000000000000_baseline_schema.sql:171
UNION SELECT auth.uid()::TEXT
```
The TEXT version of the helper includes the current user's auth UUID in the returned array. This means any row with `business_id = auth.uid()::TEXT` is accessible to that user. This was the original design that allowed `swot_analyses` rows (where `business_id = created_by = user.id`) to be visible.

**Files:**
- `supabase/migrations/00000000000000_baseline_schema.sql:168–172`

**Why it's a risk:** It perpetuates the incorrect `business_id = user.id` pattern. Any future table that accidentally stores a user's auth UUID in `business_id` becomes silently accessible (not blocked by RLS) rather than giving an explicit error. This is also the **mask** that has kept the user-ID pollution (C-01, C-02) from ever surfacing as an error — every user can see their own polluted rows, so nothing looks broken.

**Fix approach:** Remove `auth.uid()::TEXT` from the union — but this is **coupled to the data cleanse**. Removing it before the orphan/user-ID rows are re-keyed (R14) makes those rows inaccessible to the user who wrote them, which will surface as "my data disappeared". **Hard ordering: R14 (data cleanse) must land before this removal.**

---

### C-33 — Branded ID Types Adopted in Only ~4 Files

**Issue:** `src/lib/types/ids.ts` defines `BusinessId`, `UserId`, `BusinessProfileId` branded types. Only `src/lib/business/resolveBusinessId.ts` and `src/lib/types/__tests__/ids.test-d.ts` and ~2 other files use them. The vast majority of the codebase passes plain `string` for business IDs.

**Files:**
- `src/lib/types/ids.ts` (definitions)
- `src/lib/business/resolveBusinessId.ts` (uses BusinessId)
- 1,128 other source files that use `string` for business IDs

**Why it's a risk:** The type safety benefit exists only at the 4 files that use the brand. All other files — including all 82 API routes — can still pass user IDs as business IDs without a TypeScript error.

**Fix approach:** Incrementally adopt the branded types in API route boundaries. At minimum, use them in all `verifyBusinessAccess` and resolver call sites.

---

### C-34 — Canonical `verifyBusinessAccess` Membership Check Is Status- and Role-Blind

> **NEW 2026-05-31 (four-role re-audit).**

**Issue:** The canonical `verifyBusinessAccess` (`src/lib/utils/verify-business-access.ts:48–57`) grants access on *any* `business_users` row for the user+business, filtering on **neither `status` nor `role`**:
```ts
const { data: membership } = await supabaseAdmin
  .from('business_users')
  .select('id')
  .eq('business_id', businessId)
  .eq('user_id', userId)
  .maybeSingle();   // no .eq('status', 'active'), no role filter
```
The RLS layer, by contrast, requires `status = 'active'` (and `role IN ('admin','member')` in `auth_can_manage_business`) — `baseline_schema.sql:116, 158`. So a **removed, pending, or invited-but-not-accepted team member** passes the application-layer `verifyBusinessAccess` while RLS would deny them.

**Files:**
- `src/lib/utils/verify-business-access.ts:48–57` (status/role-blind membership check)
- `supabase/migrations/00000000000000_baseline_schema.sql:158` (RLS requires `status = 'active'`)
- `src/lib/business/resolveBusinessId.ts:93–98` (the role-aware resolver *does* filter `status = 'active'` — the correct pattern)

**Why it's a risk:** A deactivated team member retains access through any route that authorizes via `verifyBusinessAccess` (the service-role path bypasses RLS). This is an active access-control divergence between the app layer and the database layer, in the **team-member** role specifically.

**Blast radius:** Every route using `verifyBusinessAccess` for a business that has ever had a removed/pending team member.

**Fix approach:** Add `.eq('status', 'active')` (and a role filter matching the RLS contract) to the membership check. Fold into the C-12 consolidation so there is **one** canonical, role- and status-aware `verifyBusinessAccess`.

**Fork note:** Fork inherits this bug.

---

### C-35 — Coach Access Is a Single `assigned_coach_id` Column (No Co-Coaches / Coach History)

> **NEW 2026-05-31 (four-role re-audit).**

**Issue:** The coach role resolves to a business solely through `businesses.assigned_coach_id` (a single nullable UUID column), used in both the RLS helper (`baseline_schema.sql:158`) and `verifyBusinessAccess` (`verify-business-access.ts:22`). This models **exactly one coach per business** with no history, no co-coaching, and no handoff record.

**Files:**
- `supabase/migrations/00000000000000_baseline_schema.sql:158, 484` (RLS + business creation set `assigned_coach_id`)
- `src/lib/utils/verify-business-access.ts:22`
- `src/lib/business/resolveBusinessId.ts:87–90` (coach has no resolution path without an `activeBusinessId` — by design)

**Why it's a risk:** Not a bug today, but a **structural ceiling**. If either WisdomBI or inLIFE Pulse ever needs multiple coaches per client, a coaching team, coach handoff/audit, or "associate coach" tiers, this is a schema migration touching RLS, resolvers, and access checks. Cheaper to decide *before* the fork inherits the single-column model.

**Blast radius:** Product/roadmap decision, not a runtime fault.

**Fix approach:** Decide pre-fork whether the coach↔business relationship should become a join table (`business_coaches`: business_id, coach_id, role, status, assigned_at). If yes, do it as part of R1's canonicalization so both products inherit the richer model. If no, document the single-coach constraint as intentional.

**Fork note:** Fork decision — resolve before cutting inLIFE Pulse.

---

## Deep-Dive Round 2 — New Findings (2026-05-31, all verified firsthand)

These were surfaced by a second, deeper audit pass focused on tenant-isolation, destructive DB ops, and money math. Each was confirmed by reading the actual code, not an agent summary.

### C-36 — `monthly-report/templates` Route: Unauthenticated, Service-Role CRUD on Any Tenant

**Severity: CRITICAL.** `src/app/api/monthly-report/templates/route.ts` instantiates a **module-level service-role client** (lines 8–11, `getSupabaseSecretKey()`) and **none of GET/POST/PUT/DELETE call `getAuthenticatedUser()` or `verifyBusinessAccess()`** — the only gate is a presence check on `business_id`. Because the service-role client bypasses RLS, any caller who supplies a valid `business_id` UUID can **read, create, overwrite, or delete report templates for any of the ~27 live tenants**.

**Files:** `src/app/api/monthly-report/templates/route.ts:8–11` (service-role client), `:17–41` (GET), `:51–105` (POST), `:114–173` (PUT), `:179–205` (DELETE) — all auth-less.

**Why it's a risk:** Unauthenticated tenant-data mutation. Nuance: it's report-*layout* config (sections, column settings, account-code mappings), not raw P&L, and requires a valid business UUID (not trivially guessable) — but it is still a fully open write/delete endpoint on tenant data. An attacker enumerating IDs could corrupt or wipe every tenant's report configuration.

**Blast radius:** All `report_templates` rows for all tenants. Report generation breaks for any tenant whose default template is deleted/corrupted.

**Fix approach:** Add `getAuthenticatedUser()` + `verifyBusinessAccess(user.id, business_id)` to all four verbs, matching the pattern used by sibling routes. **This is the single highest-priority NEW fix — ship before the others.**

**Fork note:** Fork inherits this. Audit ALL service-role routes for the same missing-auth pattern (see C-07 — 59 raw-client sites; this is the worst instance found).

---

### C-37 — Balance-Sheet Sync Is Non-Atomic Delete+Insert That Reports Success on Insert Failure

**Severity: HIGH.** `src/app/api/monthly-report/sync-xero/route.ts:338–357` deletes all `xero_balance_sheet_lines` for a tenant, then inserts fresh rows. If the **delete succeeds but the insert fails** (line 350), the error is logged only as a Sentry **`warning`** (line 351) and the route still returns **`success: true`** (line 371). The tenant's balance sheet is left **empty** with no error shown to coach or client. Not wrapped in a transaction — non-atomic by construction.

**Files:** `src/app/api/monthly-report/sync-xero/route.ts:338–342` (delete), `:347–351` (insert + warning-only handling), `:371` (unconditional success).

**Why it's a risk:** Silent financial-data loss — the worst failure mode for a CFO product. A transient insert failure (constraint, network blip, partial payload) wipes the BS and the UI shows a blank balance sheet as if it were real.

**Blast radius:** Any tenant whose BS insert fails mid-sync. Recovery requires a re-sync, but the user has no signal one is needed.

**Fix approach:** Make it atomic (RPC/transaction, or insert-to-temp + swap), or at minimum: do not delete until the new rows are validated, and return `success: false` / surface the error if the insert fails. P&L lines already use `ON CONFLICT` upsert (idempotent) — apply the same pattern to BS.

**Fork note:** Fork inherits this.

---

### C-38 — `forecasts/scenarios` POST Skips Forecast-Ownership Check (Cross-Tenant Write Pollution)

**Severity: MEDIUM** (corrected down from an initial HIGH). `src/app/api/forecasts/scenarios/route.ts` POST (`:91–153`) authenticates the user and correctly forces `user_id = authenticatedUserId` (ignores body `user_id`), but does **not** verify the caller can access the business behind the supplied `forecast_id`. PATCH (`:178–187`) and DELETE are scoped `.eq('user_id', authenticatedUserId)` — so a caller can only mutate/delete **their own** scenarios (not arbitrary ones). The residual gap: a user can **insert** scenario rows (tagged with their own id) against **another tenant's `forecast_id`**.

**Files:** `src/app/api/forecasts/scenarios/route.ts:91–153` (POST, no forecast-access check); contrast GET `:44–65` which *does* verify business access.

**Why it's a risk:** Cross-tenant write *pollution*, not read or hijack. Another business's forecast gains stray scenario rows. Requires knowing a valid `forecast_id`. No data exfiltration.

**Blast radius:** Forecast scenario lists for any forecast whose ID leaks. Cosmetic-to-moderate data-integrity noise.

**Fix approach:** Add a forecast→business access check in POST mirroring GET's check before insert.

**Fork note:** Fork inherits this.

---

### C-39 — Client Deletion Cascade Silently Wipes Xero Financial History (No Soft-Delete/Backup)

**Severity: MEDIUM** (operational footgun, super_admin-gated — not a vulnerability). The super_admin client-delete path (`src/app/api/admin/clients/route.ts`, gated at `:58/:470/:525`) manually deletes from ~12 tables (`:545–572`) then deletes the `businesses` row (`:576–577`). `xero_pl_lines_business_id_fkey` is `ON DELETE CASCADE` (`baseline_schema.sql:9685`), as are dozens of other tables — so deleting the business **silently wipes all Xero P&L history and every cascaded table**, none of which appears in the explicit delete list. No soft-delete, no export/backup, no confirmation gate.

**Files:** `baseline_schema.sql:9685` (+ ~40 other `ON DELETE CASCADE` FKs to `businesses`); `src/app/api/admin/clients/route.ts:545–587`.

**Why it's a risk:** One super_admin mis-click permanently destroys a tenant's entire financial history with no recovery path. The cascade is invisible in the code, so the operator can't see the true blast radius. **Side note worth a separate check:** the manual deletes target `kpis`, `messages`, `annual_goals`, `quarterly_goals` — possibly *legacy* table names (cf. `business_kpis`, `chat_messages`); if so these are no-op deletes hitting wrong/nonexistent tables.

**Blast radius:** A deleted tenant's complete data. Recovery = restore from Supabase PITR backup only.

**Fix approach:** Soft-delete (`deleted_at`) instead of hard delete; export-to-archive before any hard delete; add an explicit confirmation token. Separately, audit the manual-delete table names against the live schema.

**Fork note:** Fork inherits the cascade design — fine if soft-delete is added.

---

### C-40 — KPI Target Validator Divides by Zero When Current Value Is 0

**Severity: LOW.** `src/lib/kpi/utils/validators.ts:147` computes `((target - current) / current) * 100` with no guard for `current === 0`. When a KPI starts at 0 (leads, new hires), `percentChange` becomes `Infinity` or `NaN`. It does **not** crash or flip `isValid` (still returns `isValid: true` at `:161`) — it only produces a misleading warning ("more than 300% higher") or none. Cosmetic.

**Files:** `src/lib/kpi/utils/validators.ts:147–159`.

**Why it's a risk:** Minor — a confusing/absent validation warning on the KPI target UI when current value is 0. No money-correctness or validation-bypass impact.

**Fix approach:** Guard `current === 0` and skip percent-change warnings (or special-case "from 0").

**Fork note:** Fork inherits this. Low priority.

---

## Appendix: Fork-Readiness Checklist

Before forking to inLIFE Pulse, the following must be addressed to avoid shipping WisdomBI-specific behavior:

| Item | Concern | Files |
|------|---------|-------|
| Email brand hardcodes | C-26 | `resend.ts`, `send-report.ts` |
| URL fallback to wisdombi.ai | C-27 | 6 route files |
| Privacy/Terms pages | Static — wisdombi.ai email | `privacy/page.tsx`, `terms/page.tsx` |
| Admin login placeholder | `admin@wisdombi.com.au` | `admin/login/page.tsx:125` |
| Coach login placeholder | `coach@wisdombi.com.au` | `coach/login/page.tsx:133` |
| Bali retreat page | Hardcoded wisdombi links | `bali-retreat/page.tsx` |
| AI advantage page | wisdombi.ai links | `ai-advantage/page.tsx` |
| Report token no-expiry | C-15 | `report-token.ts` |
| Presentation currency AUD | C-14 | `consolidation/engine.ts:136` |
| Dual-ID resolution | C-01 | All resolvers |

---

*Concerns audit: 2026-05-30*
