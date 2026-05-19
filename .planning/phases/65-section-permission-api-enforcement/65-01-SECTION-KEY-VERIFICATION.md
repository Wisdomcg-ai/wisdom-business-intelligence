# Section-key spelling — verification record

**Date:** 2026-05-15
**Decision:** The canonical section key for finance-gated routes is `finances` (singular noun, no trailing l).

## Evidence

### DB baseline default JSONB

```
181:CREATE OR REPLACE FUNCTION "public"."auth_get_section_permissions"("check_business_id" "uuid") RETURNS "jsonb"
...
191:      THEN '{"dashboard":true,"weekly_reviews":true,"forecasts":true,"finances":true,"team":true,"settings":true}'::JSONB
...
202:        '{"dashboard":true,"weekly_reviews":true,"forecasts":true,"finances":false,"team":false,"settings":false}'::JSONB
...
1929:    "section_permissions" "jsonb" DEFAULT '{"goals": true, "actions": true, "roadmap": true, "messages": true, "documents": true, "financials": true, "business_profile": true, "quarterly_review": true}'::"jsonb",
```

Observation: The baseline migration's DEFAULT clause on the `business_users` table (line 1929) uses `financials` (legacy). This is a stale default — it reflects an older key naming convention. The `auth_get_section_permissions` Postgres function (lines 191, 202) already uses `finances` in its hard-coded fallback JSONB, showing the DB itself partially migrated. The `business_users.section_permissions` column DEFAULT is stale.

### TS layer (authoritative for new rows)

```
src/lib/permissions/index.ts:11:  finances: true,
src/lib/permissions/index.ts:23:// Default permissions for new team members (finances disabled)
src/lib/permissions/index.ts:26:  finances: false,
src/lib/permissions/index.ts:58:  'FINANCES': 'finances',
src/lib/permissions/index.ts:59:  'Financial Forecast': 'finances',
src/lib/permissions/index.ts:60:  'Budget vs Actual': 'finances',
src/lib/permissions/index.ts:61:  '13-Week Rolling Cashflow': 'finances',
```

Observation: `src/lib/permissions/index.ts` defines `DEFAULT_MEMBER_PERMISSIONS` with key `finances` (line 26: `finances: false`). `FULL_PERMISSIONS` uses `finances: true` (line 11). The `SECTION_PERMISSION_MAP` maps 'Financial Forecast', 'Budget vs Actual', '13-Week Rolling Cashflow', and 'FINANCES' all to the key `'finances'`. Every team invite written through the TS layer uses the `DEFAULT_MEMBER_PERMISSIONS` shape — so every row created via the invite flow has `finances`, not `financials`.

### UI sidebar

```
src/app/settings/team/page.tsx:60:  | 'finances'           // Forecast, Budget, Cashflow
src/app/settings/team/page.tsx:76:  finances: boolean
src/app/settings/team/page.tsx:109:    id: 'finances',
src/app/settings/team/page.tsx:143:  finances: false,  // Financial data is sensitive - disabled by default
src/app/settings/team/page.tsx:943:  business_plan: true, finances: true, business_engines: true,
src/app/settings/team/page.tsx:958:  business_plan: false, finances: false, business_engines: false,
src/components/layout/sidebar-layout.tsx:110:  { label: 'Financial Forecast', href: '/finances/forecast', icon: TrendingUp },
src/components/layout/sidebar-layout.tsx:111:  { label: 'Monthly Report', href: '/finances/monthly-report', icon: BarChart3 },
src/components/layout/sidebar-layout.tsx:112:  { label: 'Cashflow Forecast', href: '/finances/cashflow', icon: Banknote },
```

Observation: `SECTION_PERMISSION_MAP` maps 'Financial Forecast', 'Budget vs Actual', '13-Week Rolling Cashflow', 'FINANCES' all to the key `'finances'`. The `SectionPermissions` TypeScript type in `src/app/settings/team/page.tsx` declares `finances: boolean`. The sidebar filters on `finances`. No application code reads `financials` as a permission key.

### SECTION_PERMISSION_MAP FINANCES entry

```
  // Finances section (all-or-nothing)
  'FINANCES': 'finances',
  'Financial Forecast': 'finances',
  'Budget vs Actual': 'finances',
  '13-Week Rolling Cashflow': 'finances',
```

Observation: The canonical TS key is unambiguously `'finances'`.

## Decision

Wave 65-01 helper checks `section_permissions['finances']` for finance routes. **Not** `'financials'`.

Rationale:
- Every production write path uses `'finances'` (team/invite via `DEFAULT_MEMBER_PERMISSIONS`).
- Every UI read path uses `'finances'` (sidebar + permissions map + `SectionPermissions` type).
- The `auth_get_section_permissions` Postgres function already uses `'finances'` in its hard-coded fallback JSON.
- The DB default JSONB on `business_users` still has `'financials'` from the baseline migration but no application code reads that key as a permission check. If a `business_users` row was created via raw SQL (never via team/invite), it MIGHT have only `'financials'` — those rows are treated as "missing the `finances` key" by the helper, which the helper's "missing key defaults to `true`" rule covers (least-surprise; existing behavior is allow unless explicitly denied).

## Out of scope for this plan
- Cleaning up the baseline default JSONB (would need a migration; deferred to Phase 66+).
- Renaming `'finances'` to `'financials'` or vice versa anywhere.
- Backfilling rows that have `'financials'` but not `'finances'` key.
