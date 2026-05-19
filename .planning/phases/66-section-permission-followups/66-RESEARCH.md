# Phase 66: Section-Permission Follow-ups & Hardening — Research

**Researched:** 2026-05-16
**Domain:** Permission system hardening, DB migration, service-role audit, consolidated-route ID resolution
**Confidence:** HIGH (all findings are from direct source-code inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Phase 66 is split so the legacy-key audit + migration is the FIRST plan (66-01), shipped on its own as fast as possible to unblock the Phase 65 Wave 65-04 ENFORCE cutover. The other three items follow at normal pace and do not gate the cutover.
- **D-02:** Audit production data using the verifier-script pattern — a one-off TypeScript script modeled on `scripts/verify-production-migration.ts`. It queries `business_users` against production and reports every row whose `section_permissions` JSONB carries `financials` but not `finances` (and, more generally, any row missing the `finances` key). Matt runs the script; its output drives the migration.
- **D-03:** After the audit confirms the affected-row set, ship an idempotent migration that backfills the `finances` key for affected rows. The exact backfill rule (e.g. `finances` ← value of legacy `financials`, or `finances` ← false for explicitly-denied legacy rows) is to be decided in planning once the audit output is known — but the migration MUST be safe to run regardless of current row state.
- **D-04:** The audit script and the migration are both prerequisites for flipping `SECTION_PERMISSION_ENFORCE=true`. Phase 65 Wave 65-04 must not proceed until 66-01 is shipped and the migration applied to production.
- **D-05:** Phase 66 produces an audit/report document only — a per-route disposition for each service-role client left in the 32 finance routes: `convert`, `keep`, or `carve`. Actual conversions are explicitly deferred to a later phase.
- **D-06:** Consolidated-route fix normalizes `consolidated/`, `consolidated-bs/`, `consolidated-cashflow/` to resolve business IDs via `resolveBusinessIds`, matching the rest of the finance routes.
- **D-07:** Ops/admin section-permission audit (item 4) is a decision document — enumerate admin/cron routes that surface $ data and recommend per-route whether each should also run the section-permission check. No code changes required for item 4 unless the audit surfaces a trivial, low-risk gap.

### Claude's Discretion

- Plan breakdown beyond "66-01 = legacy-key audit first": the planner decides how to group items 2, 3, 4 into subsequent plans.
- Exact migration backfill semantics — settled in planning after audit output is in hand (see D-03).

### Deferred Ideas (OUT OF SCOPE)

- Service-role → auth-bound RLS conversions. Phase 66 only audits and documents disposition.
- Ops/admin route section-permission wiring — item 4 is a recommendation document only; actual wiring is a future phase.
</user_constraints>

---

## Summary

Phase 66 closes four follow-up items from Phase 65. The most time-critical is the legacy `financials`-key mismatch in `business_users.section_permissions`: the baseline schema DEFAULT JSONB uses the legacy key `financials` (confirmed at line 1929 of the baseline migration), but every write path since then (team/invite flow, `DEFAULT_MEMBER_PERMISSIONS`, the `auth_get_section_permissions` Postgres function) uses the canonical key `finances`. Any row inserted via raw SQL using the column default — rather than through the TS invite flow — would have only `financials` in its JSONB. `requireSectionPermission` reads `section_permissions['finances']`, so such a row would read `finances` as absent → defaults to allow → bypasses an explicit deny once ENFORCE is on.

The consolidated-route drift concern (item 2) is real but narrow: the three consolidated routes (`consolidated/`, `consolidated-bs/`, `consolidated-cashflow/`) pass `business_id` from the request body directly to the consolidation engine and to `requireSectionPermission`. The engine already calls `resolveBusinessIds` internally, so engine data fetches are safe. The actual gap is that the access check (`.eq('id', business_id)`) and the section-permission call both assume `business_id` is a `businesses.id`. If a caller ever passes a `business_profiles.id`, the access check silently denies and the section-permission helper misses the owner/coach check. The frontend hook `useConsolidatedReport` receives its `businessId` from `resolveBusinessId` which is confirmed to return `businesses.id` branded type — so the live risk to Dragon/IICT is LOW, but the routes should be normalized to call `resolveBusinessIds` at the top of the handler for consistency and safety.

The service-role audit (item 3) is a documentation exercise: 21 of the 32 finance routes carry a module-level service-role client; 11 are fully auth-bound. The distinction and per-route disposition must be documented for the future conversion phase.

**Primary recommendation:** Ship 66-01 (audit script + idempotent migration) immediately. Group items 2, 3, 4 into 66-02 (consolidated-route fix + code change), 66-03 (service-role disposition doc), and 66-04 (ops/admin decision doc).

---

## A. Legacy-Key Audit (Item 1 — HIGHEST PRIORITY)

### Exact Schema Default — Confirmed

**File:** `supabase/migrations/00000000000000_baseline_schema.sql`, **line 1929**

```sql
"section_permissions" "jsonb" DEFAULT '{"goals": true, "actions": true, "roadmap": true, "messages": true, "documents": true, "financials": true, "business_profile": true, "quarterly_review": true}'::"jsonb"
```

The `business_users` table DEFAULT uses `"financials": true`. This key is absent from every application read path. **No post-baseline migration has ever touched `business_users.section_permissions`** — confirmed by grep: only the baseline migration file matches.

**Note also:** `team_invites.section_permissions` at line 5206 also uses the legacy key (`"financials": false`). This column is copied to `business_users` when an invite is accepted. If the invite-acceptance code copies `section_permissions` verbatim from `team_invites` without normalizing the key, accepted invites could also land with `financials` only. This must be investigated in the audit script and migration.

### What the TS Layer Uses — Confirmed

**File:** `src/lib/permissions/index.ts`

```ts
// DEFAULT_MEMBER_PERMISSIONS (line 24-36):
export const DEFAULT_MEMBER_PERMISSIONS: SectionPermissions = {
  finances: false,   // line 26 — canonical key
  ...
}

// FULL_PERMISSIONS (line 9-21):
export const FULL_PERMISSIONS: SectionPermissions = {
  finances: true,   // line 11 — canonical key
  ...
}

// SECTION_PERMISSION_MAP (lines 57-61):
'FINANCES': 'finances',
'Financial Forecast': 'finances',
'Budget vs Actual': 'finances',
'13-Week Rolling Cashflow': 'finances',
```

**File:** `src/lib/permissions/requireSectionPermission.ts` (line 130):

```ts
const keyValue = permissions?.[sectionKey]  // sectionKey = 'finances'
```

The helper reads `permissions['finances']`. If a row's JSONB has only `financials`, `permissions['finances']` is `undefined` → the helper's fallback rule (`undefined` → allow) fires → a member who was intended to be denied gets through once ENFORCE is on.

### The `auth_get_section_permissions` Postgres Function

This function (baseline line 181–207) uses `finances` in its hard-coded fallback JSONB:

```sql
THEN '{"dashboard":true,"weekly_reviews":true,"forecasts":true,"finances":true,...}'::JSONB
...
'{"dashboard":true,"weekly_reviews":true,"forecasts":true,"finances":false,...}'::JSONB
```

This function is called from the client (UI sidebar), not from `requireSectionPermission`. So the Postgres function is already using `finances` for sidebar visibility — but if the actual `business_users` row has only `financials`, the function's COALESCE returns the raw JSONB from the row (which lacks `finances`) and the UI would show finances enabled (because `financials: true`). Meanwhile `requireSectionPermission` sees `finances` as absent → allow. The two paths accidentally agree on "allow" but for different wrong reasons. This confirms the migration is needed — not just for ENFORCE correctness but for semantic consistency.

### No Prior Migration Exists

Migration history confirmed (37 migrations from baseline through `20260514000001`). No migration touches `business_users.section_permissions` or renames `financials` → `finances`. This is a first-time backfill.

### Audit Script Pattern — From `scripts/verify-production-migration.ts`

Key structural elements to model:

1. **Connection setup** (lines 34-36, 190-196):
   ```ts
   import { config } from 'dotenv'
   import path from 'path'
   config({ path: path.resolve(process.cwd(), '.env.local') })
   const supabase = createClient(supabaseUrl, supabaseServiceKey)
   ```
   Reads `.env.local` via dotenv, creates service-role client directly.

2. **CLI args** (lines 64-83): `--flag=value` parsing pattern, `help` escape hatch, required-arg validation, exit-code semantics (0=pass, 1=fail, 2=infrastructure error).

3. **Gate pattern** (lines 298-379): run named assertions, print human-readable per-gate summary to stdout, emit structured JSON to stderr for log aggregation, exit with 0/1/2.

4. **Operator invocation**: `npx tsx scripts/<script-name>.ts --flag=value`. No build step required; tsx handles TypeScript.

### Audit Script Spec for 66-01

The 66-01 audit script (`scripts/audit-section-permissions-legacy-key.ts`) should:

- Accept optional `--dry-run` and `--business-id=<uuid>` (for single-tenant scoping).
- Query `business_users` where `section_permissions ? 'financials'` (JSONB has-key operator) AND `(NOT section_permissions ? 'finances' OR section_permissions->>'finances' IS NULL)`.
- Also query `business_users` where `NOT section_permissions ? 'finances'` entirely (catches rows with neither key).
- Report per-row: `id`, `business_id`, `user_id`, `role`, `status`, `section_permissions` (raw), `financials_value`, `finances_value`.
- Emit gate: `PASS` if affected rows = 0 (no migration needed), `FAIL` with count and sample if affected rows > 0.
- Emit structured JSON to stderr for log aggregation.

### Idempotent Backfill Migration Spec for 66-01

The migration must be safe to run multiple times. The recommended idempotent pattern:

```sql
-- Idempotent: only updates rows where 'finances' key is absent
UPDATE public.business_users
SET section_permissions = section_permissions || jsonb_build_object(
  'finances',
  COALESCE(
    (section_permissions->>'financials')::boolean,
    true  -- baseline default was true; treat absent-financials as full-access
  )
)
WHERE NOT (section_permissions ? 'finances');
```

**Backfill rule rationale (D-03):**
- If the row has `financials: true` → set `finances: true` (preserve intent).
- If the row has `financials: false` → set `finances: false` (preserve explicit deny).
- If the row has neither key → set `finances: true` (matches original baseline intent; least-surprise, retroactively allow rather than deny someone who never had a deny).
- The migration MUST NOT touch rows that already have `finances` — the `WHERE NOT (section_permissions ? 'finances')` clause ensures idempotency.

**Note on `team_invites` table:** The same stale DEFAULT exists at line 5206. A second UPDATE statement in the same migration should cover `team_invites.section_permissions` rows using the same logic. However, the impact is lower because invite acceptance should copy via the TS path. Include it for completeness.

---

## B. Consolidated-Route Business-ID Resolution Drift (Item 2)

### Current State — Confirmed by Direct Read

All three consolidated routes (`consolidated/route.ts`, `consolidated-bs/route.ts`, `consolidated-cashflow/route.ts`) share an identical pattern:

1. Parse `business_id` from request body.
2. Access check: `authSupabase.from('businesses').eq('id', business_id).or('owner_id.eq...,assigned_coach_id.eq...')`.
3. Section-permission call: `requireSectionPermission(authSupabase, user.id, business_id, 'finances')`.
4. `business_profiles` lookup: `supabase.from('business_profiles').eq('business_id', business_id)` (service-role client).
5. Engine call: `buildConsolidation(supabase, { businessId: business_id, ... })`.

**The engine already resolves IDs internally** — `src/lib/consolidation/engine.ts` imports and calls `resolveBusinessIds` at lines 154, 295, 348. So engine data fetches are safe.

**The gap:** Steps 2, 3, and 4 all assume `business_id` is a `businesses.id`. If a caller ever passes a `business_profiles.id`:
- Step 2 fails (no match on `businesses.id`) → returns 403 before the section check is even reached.
- Step 4 succeeds only because `business_profiles.business_id` is queried with the ID, which would fail to match.

**Live risk to Dragon/IICT today:** LOW. The frontend sends `businesses.id` (confirmed — `resolveBusinessId` in `page.tsx` returns branded `businesses.id` type). But for safety and consistency with all other finance routes, `resolveBusinessIds` should be called at the top of each consolidated handler.

### `resolveBusinessIds` Signature and Pattern

**File:** `src/lib/utils/resolve-business-ids.ts`

```ts
export async function resolveBusinessIds(
  supabase: { from: (table: string) => any },
  businessId: string
): Promise<{ bizId: string; profileId: string; all: string[] }>
```

The function accepts either ID form and returns both. It has a module-level `Map` cache so repeated calls within a request are free.

**Canonical usage pattern** (from `forecast/dashboard-actuals/route.ts` — a Phase 65-02 route that does it correctly):

```ts
const ids = await resolveBusinessIds(supabase, businessId)
// ids.bizId   — use for business_users, businesses, business_kpis
// ids.profileId — use for xero_connections, financial_forecasts, xero_pl_lines
// ids.all      — use for .in() queries spanning both tables
```

**Note:** `resolveBusinessIds` accepts any supabase client (the signature is `{ from: ... }`). In the consolidated routes, it should receive the service-role client because the resolution query hits `business_profiles` which may be RLS-restricted for the auth-bound client.

**For the access check after resolving:** The access check `.eq('id', business_id)` should change to `.eq('id', ids.bizId)` since the access check hits `businesses` table which uses `businesses.id`. The section-permission call should also use `ids.bizId` as the `businessId` argument since `requireSectionPermission` hits `businesses` and `business_users` which both use `businesses.id`.

### Behavior-Change Risk for Dragon/IICT

No behavior change for live tenants. The frontend today passes `businesses.id` — `resolveBusinessIds` resolves it to the same `bizId`, so the access check and section-permission call produce identical results. The change is defensive normalization only.

---

## C. Service-Role Data-Fetching Audit (Item 3 — REPORT ONLY)

### Per-Route Inventory — Confirmed by grep

This is the raw inventory the planner needs to scope the audit document task. All 32 Phase 65-02 routes:

**Routes with NO service-role client (fully auth-bound — 11 routes):**

| Route | Auth Client Var | Notes |
|-------|----------------|-------|
| `forecast/[id]/route.ts` | `supabase` via `createRouteHandlerClient()` | Auth-bound only |
| `forecast/[id]/actuals-summary/route.ts` | auth-bound | Auth-bound only |
| `forecast/[id]/adjust-forward/route.ts` | auth-bound | Auth-bound only |
| `forecast/[id]/recompute/route.ts` | auth-bound + calls `resolveBusinessIds(supabase, ...)` | Auth-bound only |
| `forecast/cashflow/assumptions/route.ts` | auth-bound | Auth-bound only |
| `forecast/cashflow/payroll-summary/route.ts` | auth-bound | Auth-bound only |
| `forecast/dashboard-actuals/route.ts` | auth-bound + `resolveBusinessIds` | Auth-bound only |
| `forecast/quarterly-summary/route.ts` | auth-bound | Auth-bound only |
| `forecast/seed-from-prior/route.ts` | auth-bound + `resolveBusinessIds` | Auth-bound only |
| `Xero/pl-summary/route.ts` | auth-bound, uses `resolveXeroBusinessId` | Auth-bound only |
| `Xero/refresh-pl/route.ts` | auth-bound | Auth-bound only |

**Routes WITH a service-role client (21 routes):**

| Route | Service-Role Client Var | Primary Use of Service-Role |
|-------|------------------------|----------------------------|
| `forecast/cashflow/bank-balances/route.ts` | `supabase` (module-level `createClient`) | Reads `xero_connections`, `business_profiles` for Xero connection lookup (cross-business) |
| `forecast/cashflow/capex/route.ts` | `supabase` (module-level `createClient`) | Reads `xero_connections`, `business_profiles` for connection lookup |
| `forecast/cashflow/profiles/route.ts` | `supabase` (module-level `createClient`) | Reads `business_profiles` via `resolveBusinessIds` |
| `forecast/cashflow/settings/route.ts` | `supabase` (module-level `createClient`) | Reads `business_profiles` via `resolveBusinessIds` |
| `forecast/cashflow/sync-balances/route.ts` | `supabase` (module-level `createClient`) | Reads `xero_connections`, `business_profiles` for connection lookup |
| `forecast/cashflow/xero-actuals/route.ts` | `supabase` (module-level `createClient`) | Reads `xero_connections` via `resolveBusinessIds` |
| `monthly-report/account-mappings/route.ts` | `supabase` (module-level) | Financial data reads (xero_pl_lines / account mapping tables) |
| `monthly-report/auto-map/route.ts` | `supabase` (module-level) | Financial data reads |
| `monthly-report/commentary/route.ts` | `supabase` (module-level) | Financial data reads |
| `monthly-report/consolidated/route.ts` | `supabase` (module-level) | Engine: `buildConsolidation(supabase, ...)` — cross-tenant Xero data aggregation |
| `monthly-report/consolidated-bs/route.ts` | `supabase` (module-level) | Engine: `buildConsolidatedBalanceSheet(supabase, ...)` — cross-tenant |
| `monthly-report/consolidated-cashflow/route.ts` | `supabase` (module-level) | Engine: `buildConsolidatedCashflow(supabase, ...)` — cross-tenant |
| `monthly-report/full-year/route.ts` | `supabase` (module-level) | Financial data reads |
| `monthly-report/generate/route.ts` | `supabase` (module-level) | Financial data reads (financial_forecasts, xero_pl_lines) |
| `monthly-report/settings/route.ts` | `supabase` (module-level) | Report settings reads/writes |
| `monthly-report/snapshot/route.ts` | `supabase` (module-level) | Snapshot table writes (needs RLS bypass for writes) |
| `monthly-report/subscription-detail/route.ts` | `supabase` (module-level) | Subscription financial data |
| `monthly-report/wages-detail/route.ts` | `supabase` (module-level) | Payroll financial data |
| `Xero/balance-sheet/route.ts` | `supabase` (module-level) | Reads `xero_connections` for Xero connection lookup + `xero_bs_lines` |
| `Xero/reconciliation/route.ts` | `supabase` (module-level) | Canonical pattern: auth-bound for gate, service-role for Xero data writes |
| `Xero/subscription-transactions/route.ts` | `supabase` (module-level) | Subscription Xero data reads |

**Disposition guidance for the audit document (D-05 — REPORT ONLY, no conversions):**

- `keep` candidates: consolidated routes (service-role required for cross-tenant aggregation — Dragon has 2 entities, IICT has 3; auth-bound client would hit RLS on other tenants' data), `Xero/reconciliation` (canonical pattern established in Phase 65), any route fetching `xero_connections` or `xero_pl_lines` across multiple businesses.
- `convert` candidates: routes where service-role is only used to read data for the authenticated user's own business — auth-bound + RLS would work equivalently (likely `settings`, `commentary`, `subscription-detail`, `wages-detail`, `full-year`).
- `carve` candidates: none obvious from this inventory.

**Note:** `sync-xero/route.ts`, `templates/route.ts`, and `debug/route.ts` also have service-role clients but were NOT in the Phase 65-02 32-route list. The audit document should acknowledge these exist but scope them as out-of-band.

---

## D. Ops/Admin Section-Permission Audit (Item 4 — DECISION DOC ONLY)

### Admin/Cron Routes Enumerated

Routes found under `src/app/api/coach/`, `src/app/api/cron/`, `src/app/api/admin/`:

| Route | Surfaces $ Data | Notes |
|-------|----------------|-------|
| `coach/client-completion/route.ts` | YES (moderate) | Reads `financial_forecasts` (existence check only), `xero_connections` (existence), `business_financial_goals`. Does NOT read P&L amounts. Completion status only — no section-permission gate wired by Phase 65. |
| `coach/clients/route.ts` | NO | Client creation only — no financial data reads |
| `coach/stats/route.ts` | NO | Coach stats — no financial data |
| `coach/clients/[id]/route.ts` | Unknown — needs check |
| `cron/daily-health-report/route.ts` | LOW | Reads `sync_jobs`, `xero_connections` health — no P&L amounts |
| `cron/reconciliation-watch/route.ts` | LOW | Reads `sync_jobs` — no P&L amounts |
| `cron/refresh-xero-tokens/route.ts` | NO | Token-only, no financial data |
| `cron/sync-all-xero/route.ts` | Indirect | Triggers Xero sync — does not return financial data to callers |
| `cron/weekly-digest/route.ts` | Unknown — needs check |
| `admin/clients/route.ts` | NO | Client creation — uses service-role for auth user creation, no financial reads |
| `admin/demo-client/route.ts` | Unknown — needs check |
| `admin/check-auth/route.ts` | NO | Auth check only |
| `admin/activity/route.ts` | Unknown — needs check |
| `admin/coaches/route.ts` | NO | Coach management |
| `admin/reset-password/route.ts` | NO | Password reset |
| `admin/clients/resend-invitation/route.ts` | NO | Invitation only |

**Recommendation for the decision document:** `coach/client-completion` reads `financial_forecasts` (existence/count only, not amounts) and `xero_connections` (connection status only). This is metadata about financial features, not the financial data itself. The recommendation should be: **no section-permission gate needed** because the route surfaces completion status flags (not P&L numbers), and a restricted member legitimately needs to see "forecast not started" or "Xero not connected" banners in their coach's dashboard. Document this with rationale.

---

## Architecture Patterns

### Idempotent Migration Pattern (from Phase 49/61 precedent)

```sql
BEGIN;

-- business_users: backfill 'finances' key for rows that only have legacy 'financials'
UPDATE public.business_users
SET section_permissions = section_permissions || jsonb_build_object(
  'finances',
  COALESCE((section_permissions->>'financials')::boolean, true)
)
WHERE NOT (section_permissions ? 'finances');

-- team_invites: same logic for the staging table  
UPDATE public.team_invites
SET section_permissions = section_permissions || jsonb_build_object(
  'finances',
  COALESCE((section_permissions->>'financials')::boolean, false)  -- invite default was false
)
WHERE NOT (section_permissions ? 'finances');

COMMIT;
```

The `||` JSONB merge operator adds or overwrites a key. `WHERE NOT (section_permissions ? 'finances')` ensures idempotency — rows already having `finances` are untouched.

### resolveBusinessIds Adoption Pattern (for consolidated routes)

Current pattern in `forecast/seed-from-prior/route.ts` (correctly implemented):

```ts
// 1. Create service-role client at module level (for resolveBusinessIds + data reads)
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

// 2. Auth-bound client for auth + gate
const authSupabase = await createRouteHandlerClient()
const { data: { user } } = await authSupabase.auth.getUser()

// 3. Resolve dual IDs using service-role client (business_profiles may be RLS-restricted)
const ids = await resolveBusinessIds(supabase, businessId)

// 4. Access check uses ids.bizId (businesses.id)
const { data: bizAccess } = await authSupabase.from('businesses')
  .select('id').eq('id', ids.bizId)
  .or(`owner_id.eq.${user.id},assigned_coach_id.eq.${user.id}`)
  .maybeSingle()

// 5. Section-permission gate uses ids.bizId
const _sectionVerdict = await requireSectionPermission(authSupabase, user.id, ids.bizId, 'finances')
```

The consolidated routes already have the service-role `supabase` client at module level. The fix is: (a) call `resolveBusinessIds(supabase, business_id)` after parsing the request body, (b) replace raw `business_id` with `ids.bizId` in the access check and section-permission call, (c) pass `ids.bizId` to the engine (`buildConsolidation(supabase, { businessId: ids.bizId, ... })`).

**Important:** The `business_profiles` lookup at stage `fetch_year_start` uses `.eq('business_id', business_id)` with the service-role client — this should also use `ids.bizId` after the fix.

---

## Common Pitfalls

### Pitfall 1: Backfill Migration Missing `team_invites`

**What goes wrong:** Only `business_users` is patched. New invitations accepted after the migration copy the stale `team_invites.section_permissions` (which still has `financials`) into `business_users` via the invite-acceptance flow.

**How to avoid:** The migration must also update `team_invites.section_permissions`. Additionally, verify the invite-acceptance code path — does it copy section_permissions verbatim from `team_invites`, or does it use `DEFAULT_MEMBER_PERMISSIONS` from TS? If it copies verbatim, the `team_invites` backfill is critical. If it uses `DEFAULT_MEMBER_PERMISSIONS`, the `team_invites` update is cosmetic but still correct.

**Action:** Audit `src/app/api/team/invite/` accept-flow for which source wins.

### Pitfall 2: JSONB `||` Operator Overwrites Entire Object

**What goes wrong:** Using `section_permissions = '{"finances": true}'::jsonb` instead of `section_permissions || '{"finances": true}'::jsonb`. The first replaces all other keys; the second merges.

**How to avoid:** Always use `||` merge operator. The migration spec above uses it correctly.

### Pitfall 3: Consolidated Route — Passing Wrong ID to Engine

**What goes wrong:** After adding `resolveBusinessIds`, developer passes `ids.profileId` to `buildConsolidation` instead of `ids.bizId`. The engine's first query is `resolveBusinessIds(supabase, businessId)` internally, so it would double-resolve, but since `resolveBusinessIds` is bidirectional this would actually work. The real issue would be passing `ids.bizId` to the engine but `ids.profileId` to the access check.

**How to avoid:** After `resolveBusinessIds`, always use `ids.bizId` for `businesses` table queries and section-permission calls. Use `ids.profileId` only for `business_profiles`, `xero_connections`, `financial_forecasts` queries.

### Pitfall 4: Audit Script Misses Rows with Neither Key

**What goes wrong:** Script queries `WHERE section_permissions ? 'financials' AND NOT section_permissions ? 'finances'` — this catches legacy rows but misses rows that have an empty JSONB `{}` or a JSONB with neither key.

**How to avoid:** The primary query should be `WHERE NOT (section_permissions ? 'finances')`. This catches all rows missing the canonical key, regardless of whether they have `financials` or not.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| JSONB key backfill | Custom PL/pgSQL procedure | Single `UPDATE ... WHERE NOT (col ? 'key')` with `||` merge |
| Dual-ID resolution in consolidated routes | Per-route `business_profiles` OR query | `resolveBusinessIds(supabase, businessId)` from `@/lib/utils/resolve-business-ids` |
| Prod audit script boilerplate | New connection setup | Clone pattern from `scripts/verify-production-migration.ts` lines 34-36, 190-196 |
| Service-role disposition logic | Manual read of all 32 route files | Use the inventory in Section C above as the authoritative source |

---

## Environment Availability

Step 2.6: SKIPPED — Phase 66 items 1, 2, 4 involve only TypeScript code changes, SQL migrations, and documentation. Item 3 is documentation only. No new external dependencies beyond existing Supabase/tsx setup (already confirmed by the `scripts/verify-production-migration.ts` precedent running via `npx tsx`).

---

## Validation Architecture

`nyquist_validation` key absent from `.planning/config.json` — treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Item | Behavior | Test Type | Notes |
|------|----------|-----------|-------|
| 66-01 audit script | Reports correct count of affected rows | Manual (operator-run against prod) | Not a vitest test; script exit code 0/1 is the gate |
| 66-01 migration | Idempotent; `finances` key appears after applying | Migration test (Supabase preview branch) | Verify via `information_schema` or select query post-migrate |
| 66-02 consolidated routes | `resolveBusinessIds` called; access check uses `ids.bizId` | Unit/integration test — existing consolidated route tests if any | Confirm no regression for Dragon/IICT |
| 66-03 service-role disposition doc | Document exists, all 32 routes classified | Manual review | No automated test |
| 66-04 ops/admin audit doc | Document exists, enumeration complete | Manual review | No automated test |

### Wave 0 Gaps

- No new test files are needed for 66-01 (audit script is operator-run; migration verified via Supabase preview branch).
- 66-02 should have a regression test confirming the consolidated route passes `ids.bizId` to the section-permission helper and engine.
- Existing pre-failing tests in consolidated route (`pl-summary-lookup-error`, `consolidated`, `consolidated-bs` — noted in 65-02-SUMMARY as pre-existing failures) are out of scope for 66-02 unless the resolveBusinessIds addition surfaces them.

---

## Open Questions

1. **`team_invites` acceptance code path**
   - What we know: `team_invites.section_permissions` has the same stale `financials` DEFAULT.
   - What's unclear: Does the invite-acceptance route copy `team_invites.section_permissions` verbatim into `business_users`, or does it use `DEFAULT_MEMBER_PERMISSIONS` from TS?
   - Recommendation: Read `src/app/api/team/invite/` accept handler before finalizing the migration. If it copies verbatim, the `team_invites` UPDATE in the migration is blocking-critical not just cosmetic.

2. **Rows with `finances: true` that also have `financials: false`**
   - What we know: The migration idempotency clause `WHERE NOT (section_permissions ? 'finances')` skips rows that already have `finances`.
   - What's unclear: Could production have rows that were hand-edited with both keys present but conflicting values? Unlikely but possible.
   - Recommendation: The audit script should also report rows where `financials` and `finances` disagree (both present, different values) as an informational gate.

3. **`coach/clients/[id]/route.ts` content**
   - What we know: The route exists.
   - What's unclear: Whether it surfaces financial data.
   - Recommendation: Read the file during 66-04 planning or execution.

---

## Sources

### PRIMARY (HIGH confidence — direct source-code inspection)

- `supabase/migrations/00000000000000_baseline_schema.sql` line 1929 — `business_users` DEFAULT JSONB uses `"financials"` (legacy key)
- `supabase/migrations/00000000000000_baseline_schema.sql` line 5206 — `team_invites` DEFAULT JSONB also uses `"financials"`
- `supabase/migrations/00000000000000_baseline_schema.sql` lines 181-207 — `auth_get_section_permissions` function uses `finances` in hardcoded fallback
- `src/lib/permissions/requireSectionPermission.ts` — reads `permissions?.[sectionKey]` where sectionKey = `'finances'`
- `src/lib/permissions/index.ts` lines 11, 26, 57-61 — TS layer uses `finances` throughout
- `scripts/verify-production-migration.ts` — full structure documented for model
- `src/app/api/monthly-report/consolidated/route.ts` — passes `business_id` directly, no `resolveBusinessIds` call at route level
- `src/app/api/monthly-report/consolidated-bs/route.ts` — same pattern
- `src/app/api/monthly-report/consolidated-cashflow/route.ts` — same pattern
- `src/lib/utils/resolve-business-ids.ts` — signature, caching behavior, bidirectional resolution
- `src/lib/consolidation/engine.ts` lines 154, 295, 348 — engine calls `resolveBusinessIds` internally (engine data fetches are safe)
- Grep of all 32 finance routes for `SUPABASE_SERVICE_KEY` — 21 routes have service-role clients, 11 are auth-bound only
- Migration history: no post-baseline migration touches `business_users.section_permissions`

### SECONDARY (MEDIUM confidence)

- `.planning/phases/65-section-permission-api-enforcement/65-01-SECTION-KEY-VERIFICATION.md` — prior grep audit establishing `finances` as canonical
- `.planning/phases/65-section-permission-api-enforcement/65-02-SUMMARY.md` — the 32-route inventory

---

## Metadata

**Confidence breakdown:**
- Legacy-key audit (item 1): HIGH — schema default quoted literally, no post-baseline migration found, TS layer confirmed
- Consolidated-route drift (item 2): HIGH — all three routes read directly, engine internals confirmed
- Service-role audit (item 3): HIGH — grep of all 32 routes completed, per-route classification documented
- Ops/admin audit (item 4): MEDIUM — coach/client-completion and cron routes partially read; `coach/clients/[id]`, `cron/weekly-digest`, `admin/demo-client`, `admin/activity` not fully inspected

**Research date:** 2026-05-16
**Valid until:** 2026-06-15 (stable — no fast-moving dependencies; valid until Phase 65 Wave 65-04 ships)
