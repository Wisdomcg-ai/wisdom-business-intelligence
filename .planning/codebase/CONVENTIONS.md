# Coding Conventions

**Analysis Date:** 2026-05-30

---

## TypeScript Strictness

**Config:** `tsconfig.json` has `"strict": true` but `"noUnusedLocals": false` and `"noUnusedParameters": false` — catching type errors but allowing dead code to accumulate silently.

**`as any` proliferation:** 490+ occurrences in `src/app/api/`, 86+ in `src/lib/`. The overwhelming majority (413 of the 490 in API routes) appear on Sentry calls:
```typescript
// Most common pattern — the `as any` is a workaround for Sentry SDK type defs
Sentry.captureException(err, { tags: { route: 'Xero/pl-summary' }, extra: { context: "..." } } as any)
```
The remaining non-Sentry `as any` casts (e.g. `(forecast as any).business_id`, `xeroData.Accounts as any[]`) are genuine type holes where the DB query return type is not properly narrowed.

**For a fork:** Eliminate the Sentry `as any` pattern by declaring a typed helper for Sentry captures (e.g. `captureRoute(err, route, context)`) and narrowing the DB row types with generated types from Supabase.

---

## File and Directory Naming

**API routes:** `src/app/api/` uses mostly `kebab-case` for directory names (e.g. `forecast-wizard-v4`, `chart-of-accounts-full`).

**Critical inconsistency — uppercase `Xero` directory:**
- All Xero-related routes live at `src/app/api/Xero/` (capital X)
- All other API route dirs are lowercase: `src/app/api/cron/`, `src/app/api/forecast/`
- This is a filesystem-level inconsistency. On case-sensitive Linux (Vercel) this works; on macOS it is invisible. A fork should rename to `src/app/api/xero/`.

**Lib files:** `src/lib/` subdirectories use `kebab-case` consistently (`src/lib/xero/`, `src/lib/utils/`, `src/lib/supabase/`).

**Components:** PascalCase (`Navigation.tsx`, `DashboardWrapper.tsx`).

**Test files:** `kebab-case` naming mirroring the phase that added them (e.g. `phase-53-token-manager-sentry.test.ts`, `cron-refresh-xero-tokens.test.ts`). Tests co-located in `src/__tests__/` (not co-located with source), with subdirectories by domain: `api/`, `xero/`, `forecast/`, `services/`, `migrations/`.

---

## Query Parameter Naming Inconsistency

Different routes use different formats for the same concept:

| Route | Param name |
|-------|-----------|
| `src/app/api/Xero/pl-summary/route.ts` | `business_id` (snake_case) |
| `src/app/api/goals/route.ts` | `business_id` (snake_case) |
| `src/app/api/kpis/route.ts` | `businessId` (camelCase) |
| `src/app/api/annual-plan/route.ts` | `user_id` (snake_case, not business-scoped at all) |

**For a fork:** Standardize on `business_id` (snake_case) across all API routes, matching DB column naming.

---

## Route Handler Pattern

**Standard pattern** (used by ~80% of routes):

```typescript
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient()  // RLS-bound, cookie-auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const businessId = searchParams.get('business_id')
    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
    }

    const hasAccess = await verifyBusinessAccess(user.id, businessId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // ... business logic using supabase (RLS-bound) or supabaseAdmin ...

    return NextResponse.json({ data })
  } catch (error: any) {
    Sentry.captureException(error, { tags: { route: '...' }, extra: { context: '...' } } as any)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**Cron route pattern** (fail-closed auth gate):

```typescript
// Tighter form (correct — used in refresh-xero-tokens):
const cronSecret = process.env.CRON_SECRET
const authHeader = req.headers.get('authorization')
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// Looser form (incorrect — used in sync-all-xero, reconciliation-watch, weekly-digest, daily-health-report):
if (auth !== `Bearer ${process.env.CRON_SECRET}`) {  // passes when both are undefined!
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```
The looser form is a known security issue (SEC-02). `cron/sync-all-xero`, `cron/reconciliation-watch`, `cron/weekly-digest`, and `cron/daily-health-report` all use the loose form. Only `cron/refresh-xero-tokens` uses the safe form.

---

## Supabase Client Usage

Three distinct client types exist; usage should follow strict rules:

### 1. `createRouteHandlerClient()` — `src/lib/supabase/server.ts`
- Returns an RLS-bound cookie-auth client (publishable key)
- Use for: auth checks (`supabase.auth.getUser()`), user-scoped reads where RLS is intentional
- **Never** use for admin operations (insert, delete, update across tenant boundaries)

### 2. `createServiceRoleClient()` — `src/lib/supabase/admin.ts`
- Returns service-role client that **bypasses RLS** (`cache: 'no-store'`)
- Use for: admin operations, cron jobs, `verifyBusinessAccess`, cross-tenant writes
- Correct usage in: `src/app/api/cron/refresh-xero-tokens/route.ts`, `src/lib/utils/verify-business-access.ts`

### 3. Inline `createClient()` (anti-pattern — module-level)
Many routes instantiate their own service-role client at module scope, bypassing `createServiceRoleClient()`:

```typescript
// Anti-pattern — found in 15+ route files including:
// src/app/api/kpis/route.ts
// src/app/api/Xero/connection-health/route.ts
// src/app/api/monthly-report/templates/route.ts
// src/app/api/forecast/cashflow/settings/route.ts
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  getSupabaseSecretKey()
)
```
Module-level clients in serverless functions can memoize stale connection state across warm invocations (documented in `src/app/api/Xero/employees/route.ts` comments — the employees route had this bug and removed the module-level client as a result). The correct fix is to call `createServiceRoleClient()` per-request.

**For a fork:** Replace all inline `createClient(...serviceKey...)` with `createServiceRoleClient()`, called inside each handler function (not at module scope).

---

## Authentication Check Patterns

### Standard pattern (correct)
```typescript
const supabase = await createRouteHandlerClient()
const { data: { user }, error: authError } = await supabase.auth.getUser()
if (authError || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

### Missing auth — `src/app/api/Xero/employees/route.ts`
This route has NO `supabase.auth.getUser()` call. It uses the service-role client directly and trusts the caller-supplied `business_id` query param. Anyone with the endpoint URL can enumerate Xero employees for any business by guessing IDs.

### Missing auth — `src/app/api/monthly-report/templates/route.ts`
No auth check at all (GET, POST, PUT, DELETE). Uses a module-level service-role client. Any unauthenticated caller can read, create, update, or delete report templates for any `business_id`.

### Inconsistent access control — `src/app/api/goals/route.ts`
Uses an inline ad-hoc access check (direct `business_users`, `businesses`, and `auth_is_super_admin` queries) rather than `verifyBusinessAccess`. The logic is partially equivalent but does not handle all the dual-ID cases that `verifyBusinessAccess` covers.

### Inconsistent access control — `src/app/api/kpis/route.ts`
Defines its own local `verifyBusinessAccess` function (lines 15–35) that differs from the canonical `src/lib/utils/verify-business-access.ts` version:
- Local version checks `business_profiles.user_id` — which is not how access is granted (access is via `business_users` membership or owner/coach assignment on `businesses`)
- The canonical version checks `businesses.owner_id`, `businesses.assigned_coach_id`, `business_users.user_id`, and `system_roles.role = 'super_admin'`

---

## `verifyBusinessAccess` — Two Competing Definitions

This is the highest-priority convention problem:

| Location | Auth logic |
|----------|-----------|
| `src/lib/utils/verify-business-access.ts` | Checks `businesses.owner_id`, `businesses.assigned_coach_id`, `business_users` membership, `system_roles.super_admin`. Also handles dual-ID fallback. |
| `src/app/api/kpis/route.ts` (local, lines 15–35) | Only checks `businesses.owner_id/coach_id` OR `business_profiles.user_id`. Missing `business_users`, missing `super_admin`. Wrong on dual-ID. |

**For a fork:** Delete the local definition in `kpis/route.ts`. All routes must import from `src/lib/utils/verify-business-access.ts`.

---

## Dual-ID Resolution

Three different resolution strategies are in use:

### 1. `resolveBusinessIds()` — `src/lib/utils/resolve-business-ids.ts`
- Bidirectional: accepts either `businesses.id` or `business_profiles.id`, returns `{ bizId, profileId, all }`
- Has a **module-level `Map` cache** — stale across warm Lambda invocations
- Used by: `forecast/cashflow/*`, `forecast/[id]/recompute`, `forecast-wizard-v4/generate`, `forecast/dashboard-actuals`

### 2. `resolveXeroBusinessId()` — `src/lib/utils/resolve-xero-business-id.ts`
- Xero-specific: resolves to the correct `business_id` for `xero_connections` rows
- 3-path lookup (direct → businesses.id → business_profiles.id)
- Used by: all `src/app/api/Xero/*` routes that need a connection

### 3. Ad-hoc inline resolution
- `goals/route.ts`: manual profile lookup then fallback array `[profileId, businessId]`
- `Xero/employees/route.ts`: 4-step try chain (direct, profile→biz, biz→profile, scan all)
- `annual-plan/route.ts`: queries `business_profiles` by `user_id` (not `business_id`) — a different axis

Inconsistent resolution means some routes still fail for tenants where `business_id` was stored as `business_profiles.id` in one table and `businesses.id` in another.

---

## Error Handling Patterns

### Normal routes — caught at top level
```typescript
} catch (error: any) {
  Sentry.captureException(error, { tags: { route: 'forecast/...' }, extra: { context: '...' } } as any)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
```
This pattern is broadly consistent in newer routes.

### Silent swallowing
`src/app/api/goals/route.ts` (lines 81–83): the outer `catch` block returns `{ goals: null }` with **status 200** rather than a 500:
```typescript
} catch (err) {
  Sentry.captureException(err, ...)
  return NextResponse.json({ goals: null })  // ← 200 OK even on DB error
}
```
The caller gets a 200 with null data and cannot distinguish "no goals" from "server errored". This pattern appears in several legacy routes.

### `cron/sync-all-xero` vs `cron/refresh-xero-tokens`
`sync-all-xero` wraps aggregate errors with Sentry; per-business failures within `runSyncForAllBusinesses` are handled at the orchestrator level. Both patterns are consistent with their scope.

---

## Logging Conventions

**Server-side:** Sentry is the authoritative logging mechanism. `console.log`/`console.error` appear in 175+ places in API routes — mostly debugging traces never removed from production. Several are wrapped in `if (process.env.NODE_ENV !== 'production')` guards; most are not.

Notable unguarded `console.log` in production paths:
- `src/app/api/forecast/cashflow/sync-balances/route.ts` (lines 244–248)
- `src/app/api/strategic-initiatives/route.ts` (lines 82–107)
- `src/app/api/auth/logout/route.ts` (line 18)
- `src/app/api/Xero/subscription-transactions/route.ts` (many lines)

**Client-side:** `src/lib/error-logger.ts` writes to `client_error_logs` Supabase table. Used for autosave errors, RLS errors, network errors.

**Sentry tag convention:** `{ tags: { route: 'Xero/pl-summary' }, extra: { context: "[Route Label] Error description" } }`. The `route` tag is the URL path fragment; the `context` is a freeform label. This convention is applied broadly but not universally.

---

## Section Permission Gate Pattern (Phase 65)

Several routes implement a two-stage section-permission gate:
```typescript
const _sectionVerdict = await requireSectionPermission(supabase, user.id, businessId, 'finances')
const _sectionBlocked = enforceSectionPermission(_sectionVerdict, 'finances', 'api/Xero/pl-summary', user.id, businessId)
if (_sectionBlocked) return _sectionBlocked
```
This uses environment variable `SECTION_PERMISSION_ENFORCE` as a kill-switch (LOG_ONLY default, ENFORCE when set). Applied to: `Xero/pl-summary`, `forecast/quarterly-summary`, `forecast/seed-from-prior`, `forecast/cashflow/settings`. Not applied to all finance-related routes — inconsistent coverage.

---

## Notable Anti-Patterns Summary

| Anti-pattern | Location | Impact |
|---|---|---|
| Module-level service-role `createClient` | 15+ route files | Stale fetch memoization across warm instances |
| Duplicate local `verifyBusinessAccess` | `src/app/api/kpis/route.ts` lines 15–35 | Wrong access logic; missing super_admin, missing `business_users` |
| No auth check | `src/app/api/Xero/employees/route.ts`, `src/app/api/monthly-report/templates/route.ts` | Unauthenticated access to tenant data |
| Loose cron auth | `cron/sync-all-xero`, `cron/reconciliation-watch`, `cron/weekly-digest`, `cron/daily-health-report` | SEC-02: undefined secret passes auth |
| `uppercase /Xero/` dir | `src/app/api/Xero/` | Case-sensitivity risk; breaks import consistency |
| `as any` on Sentry calls (413 occurrences) | All API routes | Masks type errors; maintenance noise |
| Module-level `Map` cache | `src/lib/utils/resolve-business-ids.ts` line 21 | Cross-request cache pollution in serverless |
| Silent 200 on DB error | `src/app/api/goals/route.ts` line 83 | Caller cannot distinguish "no data" from "error" |
| `console.log` in production | Multiple routes | Noisy logs; potential data leakage |
| `kpi-definitions-legacy.ts` | `src/lib/kpi-definitions-legacy.ts` | Dead file, not imported anywhere |
| `helpers-backup.ts` | `src/lib/supabase/helpers-backup.ts` | Dead backup file, no imports |

---

## What a Fork Should Standardize

1. **Client instantiation:** Always use `createRouteHandlerClient()` (cookie-auth) or `createServiceRoleClient()` (admin). Never inline `createClient(url, secretKey)` at module scope.
2. **Access control:** Import and call `verifyBusinessAccess` from `src/lib/utils/verify-business-access.ts`. Delete the local copy in `kpis/route.ts`.
3. **Cron auth:** Use the fail-closed form: `const secret = process.env.CRON_SECRET; if (!secret || header !== 'Bearer ' + secret)`.
4. **Query params:** Standardize on `business_id` (snake_case) everywhere.
5. **Sentry calls:** Create a typed helper to eliminate `as any`; keep tag shape `{ route, invariant?, connection_id? }`.
6. **Directory casing:** Rename `src/app/api/Xero/` → `src/app/api/xero/`.
7. **Error responses:** Never return `{ status: 200, body: { error: ... } }`. Always use the correct HTTP status code.
8. **Auth coverage:** Add `supabase.auth.getUser()` to `employees/route.ts` and `monthly-report/templates/route.ts`.

---

*Convention analysis: 2026-05-30*
