# Phase 21: KPI Dashboards - Research

**Researched:** 2026-04-07
**Domain:** Next.js 14 / Supabase / Xero integration / Recharts — KPI dashboard layer on existing infrastructure
**Confidence:** HIGH

---

## Summary

Phase 21 is primarily an **integration and surfacing phase**, not a greenfield build. The platform already has:
- A fully functional `business-dashboard` at `/business-dashboard` with weekly snapshot entry, QTD calculations, financial targets from the forecast wizard, and custom KPIs with targets/actuals
- A `kpi-selection` page at `/kpi-selection` backed by `business_kpis` table (with `kpi_id`, `friendly_name`, `year1_target`, `year2_target`, `year3_target`, `current_value`, `kpi_history` table for trend data)
- Recharts already installed (`recharts@^3.5.0`) and actively used in forecast wizard charts, cashflow charts, and Step8Review — import pattern and chart types are established
- Xero data already flowing through two distinct pathways: (1) monthly P&L synced per-month via `/api/Xero/sync` into `financial_metrics`, and (2) full historical P&L via `/api/Xero/sync-forecast` into `forecast_pl_lines.actual_months` JSONB — this second dataset is what powers the forecast wizard's prior-year analysis and is richly structured
- A weekly review feature at `/reviews/weekly` that captures rock progress, weekly priorities, coach discipline checklist, and manual revenue entry — it does NOT auto-pull from Xero actuals

The key gaps are: (1) no visual chart layer on top of the existing `business-dashboard` tabular data, (2) no Xero actuals fed automatically into the weekly snapshot entries, (3) the weekly review at `/reviews/weekly` is separate from the KPI dashboard at `/business-dashboard` — these need a bridge, and (4) the coach view at `/coach/dashboard` shows client activity signals but no financial KPI charts per client.

**Primary recommendation:** Extend the existing `/business-dashboard` page with Recharts visual panels showing Xero actuals vs forecast targets month-by-month, and add an auto-populate button that pulls the current month's Xero actuals into the current weekly snapshot. Minimal new infrastructure required.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | ^3.5.0 | Charts/visualization | Already installed; used in 10+ existing components |
| @supabase/supabase-js | ^2.76.1 | DB reads/writes | Project standard |
| lucide-react | ^0.309.0 | Icons | Project standard |
| date-fns | ^4.1.0 | Date math for chart axes | Already installed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| xero-node | ^13.0.0 | Xero API type definitions | Already installed; API calls use raw fetch pattern |
| zustand | ^5.0.8 | State management | If dashboard chart state needs to persist across tab changes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| recharts | tremor, visx, chart.js | recharts is already in the codebase; switching libraries would duplicate bundle and inconsistent style |

**Installation:** No new packages required. All dependencies are already installed.

**Version verification:** recharts 3.5.0 confirmed in package.json (2026-04-07).

---

## Architecture Patterns

### Recommended Project Structure
```
src/app/business-dashboard/
├── components/
│   ├── KpiChartPanel.tsx         # NEW: recharts panel for a single KPI over time
│   ├── FinancialSummaryCharts.tsx # NEW: Revenue/GP/NP actual vs forecast area/bar charts
│   ├── XeroSyncButton.tsx         # NEW: "Sync from Xero" button for current week snapshot
│   └── [existing components...]
├── hooks/
│   └── useXeroActuals.ts          # NEW: fetches forecast_pl_lines for chart data
└── [existing files...]

src/app/coach/clients/[id]/
└── kpi/                           # NEW: coach view of client KPI charts
    └── page.tsx
```

### Pattern 1: Recharts with actual_months JSONB data
**What:** Read `forecast_pl_lines.actual_months` (already populated by Xero sync) and transform to recharts `[{ month: 'Jul 2025', actual: 120000, forecast: 130000 }, ...]` shape.
**When to use:** Revenue, GP, NP trend charts — data is already in DB.
**Example:**
```typescript
// Source: existing pattern in CashflowForecastChart.tsx
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

// Transform forecast_pl_lines data
const chartData = monthKeys.map(key => ({
  month: key,          // e.g. "2025-07"
  actual: actualsByMonth[key] ?? null,
  forecast: forecastByMonth[key] ?? null,
}))

return (
  <ResponsiveContainer width="100%" height={240}>
    <AreaChart data={chartData}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="month" />
      <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
      <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
      <Area type="monotone" dataKey="forecast" stroke="#94a3b8" fill="#f1f5f9" />
      <Area type="monotone" dataKey="actual" stroke="#f97316" fill="#fed7aa" />
    </AreaChart>
  </ResponsiveContainer>
)
```

### Pattern 2: Existing `useBusinessDashboard` hook — extend, don't replace
**What:** The hook already loads `financialData`, `coreMetrics`, `kpis`, and `snapshots`. Add a new call to fetch Xero actuals from `forecast_pl_lines` and attach as `xeroActuals`.
**When to use:** Always — keeps all dashboard data loading co-located.

### Pattern 3: Multi-format business ID lookup (CRITICAL)
**What:** Use `resolveBusinessIds` and `resolveXeroBusinessId` utilities (already exist) to handle `businesses.id` vs `business_profiles.id` duality.
**When to use:** Any new API route that touches `financial_forecasts`, `forecast_pl_lines`, or `xero_connections`.
**Example:**
```typescript
// Source: existing /api/Xero/pl-summary/route.ts pattern
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import { resolveXeroBusinessId } from '@/lib/utils/resolve-xero-business-id'

const idsToTry = await resolveBusinessIds(supabase, businessId)
for (const id of idsToTry) {
  const { data } = await supabase
    .from('financial_forecasts')
    .select('id')
    .eq('business_id', id)
  if (data?.length) { /* use it */ break }
}
```

### Pattern 4: Coach view using existing `/coach/clients/[id]` route
**What:** The coach portal at `/coach` uses `CoachLayoutNew`. Client detail is at `/coach/clients/[id]`. A KPI sub-page at `/coach/clients/[id]/kpi` can reuse `useBusinessDashboard(overrideBusinessId)` — the hook already accepts an override business ID.
**When to use:** Coach-side KPI dashboard view.

### Pattern 5: Weekly review integration
**What:** `/reviews/weekly` uses `WeeklyReviewService` with `weekly_reviews` table. The `/business-dashboard` uses `weekly_metrics_snapshots` (different table). To bridge: add an "Import from weekly review" or "Sync Xero actuals" button in `/business-dashboard` that reads `financial_metrics` (populated by `/api/Xero/sync`) for the current month and populates the current week's snapshot.
**When to use:** The "weekly review integration" requirement from the roadmap.

### Anti-Patterns to Avoid
- **Building a new dashboard from scratch:** The `/business-dashboard` is already a complete weekly tracking table. Add chart panels to it, don't replace it.
- **Calling Xero directly from the client:** All Xero calls must be server-side API routes (token security). Client components call `/api/Xero/*` routes only.
- **Using `businesses.id` directly for forecast queries:** Must use `resolveBusinessIds` — dual-ID system causes silent lookup failures.
- **Fetching fresh Xero data on every page load:** Xero rate-limits at 60 calls/minute per tenant. Cache in DB (`financial_metrics` or `forecast_pl_lines`) and serve from DB. Only trigger a live Xero sync on explicit user action.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chart components | Custom SVG charts | recharts (already installed) | SSR-safe, responsive, accessible, tooltip/legend built in |
| Xero P&L parsing | Custom parser | Existing logic in `/api/Xero/sync/route.ts` and `calculatePeriodSummary()` in pl-summary | Category detection (revenue/COGS/opex) already handles edge cases like "Other Income" excluding from revenue |
| Business ID resolution | Direct `.eq('business_id', id)` | `resolveBusinessIds()` + `resolveXeroBusinessId()` | Dual-ID system; direct lookup fails ~50% of clients |
| KPI target storage | New table | `business_kpis` (already has `year1_target`, `year2_target`, `year3_target`, `current_value`) | Table exists with unique constraint `(business_id, kpi_id)` |
| Trend history | New time-series table | `kpi_history` (already exists with RLS; used by `/api/kpis` PATCH endpoint) | Records `value`, `recorded_at`, `notes` per KPI entry |
| Role differentiation | Custom middleware | `system_roles` table pattern (coach/super_admin check in coach dashboard) | Pattern already established: query `system_roles` on load to detect coach vs client |

**Key insight:** The Xero P&L data infrastructure (sync, storage, category classification, deduplication) is already production-grade. Phase 21 is about visualizing data that is already in the database.

---

## Existing Feature Inventory (CRITICAL — know before planning)

### 1. `/business-dashboard` — Already functional
- Weekly snapshot table: Revenue, GP, NP, Leads, Conversion Rate, Avg Transaction, Team Headcount, Owner Hours, Custom KPIs
- Quarter/Year toggle, editable current week, past-week lock
- QTD actuals calculated from snapshots
- Annual and quarterly targets from forecast wizard (`business_financial_goals` via `FinancialService`)
- Custom KPI rows from `business_kpis` table
- `useBusinessDashboard` hook accepts `overrideBusinessId` — usable from coach view
- **No charts** — purely tabular

### 2. `/kpi-selection` — Partially functional
- `EnhancedKPIModal` for selecting KPIs from a library
- Saves to `business_kpis` table
- Uses `user_kpis` table in page code (inconsistency vs `business_kpis` in API route — RISK)
- No visualization, no history view

### 3. `/reviews/weekly` — Separate from business-dashboard
- Rock progress, weekly priorities, discipline checklist
- Manual financial entry (revenue week target vs actual)
- No connection to `weekly_metrics_snapshots` table
- No Xero actuals auto-population
- No charts

### 4. Xero data paths
- **Path A — `/api/Xero/sync`:** Fetches current month P&L from Xero Reports API → stores in `financial_metrics` table (columns: `revenue_month`, `cogs_month`, `expenses_month`, `net_profit_month`, `gross_profit_month`, `gross_margin_percent`, `total_cash`)
- **Path B — `/api/Xero/sync-forecast`:** Syncs full historical P&L account-by-account → stores in `forecast_pl_lines.actual_months` JSONB (monthly granularity, multi-year history). This is the richest data source.
- `calculatePeriodSummary()` in pl-summary route already produces: `revenue_by_month`, `cogs_by_month`, `opex_by_month`, `seasonality_pattern`, per-line breakdowns — reuse this logic

### 5. Coach view gaps
- `/coach/dashboard` shows client activity table (last login, assessment score, open loops/issues) but no financial KPIs
- `/coach/clients/[id]` has a forecast sub-page but no KPI chart view
- `useBusinessDashboard(overrideBusinessId)` exists and works — coach just needs a page that calls it with the client's ID

### 6. `kpi_history` vs `business_kpis`
- `kpi_history` table exists (RLS fixed in Phase 3 migration). Structure: `business_id`, `kpi_id`, `value`, `recorded_at`, `notes`
- `/api/kpis` PATCH endpoint already writes to `kpi_history` on every value update
- `kpi_history` is empty in production (confirmed by Phase 3 migration comment: "kpi_history is empty")
- This means trend charts for custom KPIs will show sparse or no data initially — plan for empty-state handling

---

## Common Pitfalls

### Pitfall 1: `user_kpis` vs `business_kpis` table mismatch
**What goes wrong:** `/kpi-selection/page.tsx` reads/writes to `user_kpis` table. `/api/kpis/route.ts` reads/writes to `business_kpis`. These are different tables. A KPI "selected" via `/kpi-selection` may not appear in the dashboard.
**Why it happens:** The page was built before the API standardized on `business_kpis`.
**How to avoid:** Phase 21 should use `business_kpis` as the source of truth (matches API route). Either migrate `/kpi-selection` to use `business_kpis`, or document that `/business-dashboard` custom KPIs are the source for Phase 21.
**Warning signs:** KPIs disappear between `/kpi-selection` and `/business-dashboard`.

### Pitfall 2: Xero rate limiting on page load
**What goes wrong:** Triggering live Xero API calls (`/api/Xero/sync`) on every dashboard page load causes 429 errors, especially when a coach views multiple clients.
**Why it happens:** Xero limits 60 calls/minute per tenant, and each sync call is a multi-step operation.
**How to avoid:** Show data from DB (`forecast_pl_lines`, `financial_metrics`). Only trigger sync on explicit "Refresh from Xero" button click. Display `last_synced_at` timestamp.

### Pitfall 3: Dual business ID breaks Xero connection lookup
**What goes wrong:** Xero connection is stored with either `businesses.id` or `business_profiles.id` depending on when it was created. A direct `.eq('business_id', id)` query finds nothing for ~half of clients.
**Why it happens:** Documented in project memory as a known system-wide issue (Dual business ID system).
**How to avoid:** Always use `resolveXeroBusinessId(supabase, businessId)` before Xero API calls.

### Pitfall 4: `forecast_pl_lines` requires an active forecast to exist
**What goes wrong:** If a business has never completed the forecast wizard, there are no `forecast_pl_lines` rows. Xero actuals synced via `/api/Xero/sync-forecast` are stored against a `forecast_id`.
**Why it happens:** Actuals storage is coupled to forecasts. No forecast = no actuals rows.
**How to avoid:** Dashboard must gracefully handle zero forecast_pl_lines. Show a "Connect Xero and complete forecast setup" prompt. Use `financial_metrics` table (Path A) as fallback for recent months.

### Pitfall 5: `actual_months` keys vs `forecast_months` keys format
**What goes wrong:** Monthly data is keyed by `"YYYY-MM"` strings (e.g. `"2025-07"`). Charts need this format consistent. If any code uses `"YYYY-MM-DD"` or numeric months, lookups silently return 0.
**Why it happens:** The JSONB key format is not enforced at DB level.
**How to avoid:** Use the existing `generateFiscalMonthKeys()` utility from `fiscal-year-utils.ts` to generate chart month arrays — it produces the same `YYYY-MM` format as the stored data.

### Pitfall 6: `recharts` SSR and `dynamic` import
**What goes wrong:** Recharts uses browser APIs that break during Next.js server rendering. Components with recharts throw hydration errors if rendered server-side.
**Why it happens:** recharts uses `ResizeObserver` and DOM APIs.
**How to avoid:** Chart components must be `'use client'` and are often wrapped with `next/dynamic` with `{ ssr: false }` — check existing `CashflowForecastChart.tsx` which is already `'use client'`. Same pattern applies to new KPI chart components.

---

## Code Examples

### Existing recharts import pattern (from `CashflowForecastChart.tsx`)
```typescript
// Source: src/app/finances/forecast/components/CashflowForecastChart.tsx
'use client'

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'
```

### Existing recharts bar chart pattern (from `Step8Review.tsx`)
```typescript
// Source: src/app/finances/forecast/components/wizard-v4/steps/Step8Review.tsx
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';

// Usage:
<ResponsiveContainer width="100%" height={220}>
  <BarChart data={chartData}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="name" />
    <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
    <Tooltip />
    <Bar dataKey="value">
      {chartData.map((entry, index) => (
        <Cell key={index} fill={entry.fill} />
      ))}
    </Bar>
  </BarChart>
</ResponsiveContainer>
```

### Fetching Xero actuals for charts (pattern from `pl-summary` + `actuals-summary`)
```typescript
// Pattern: resolve business IDs, get active forecast, read actual_months
const idsToTry = await resolveBusinessIds(supabase, businessId)
for (const id of idsToTry) {
  const { data: forecasts } = await supabase
    .from('financial_forecasts')
    .select('id')
    .eq('business_id', id)
    .eq('fiscal_year', fiscalYear)
    .order('is_active', { ascending: false })
    .limit(1)
  if (forecasts?.length) {
    const { data: lines } = await supabase
      .from('forecast_pl_lines')
      .select('account_name, category, actual_months, forecast_months')
      .eq('forecast_id', forecasts[0].id)
      .eq('is_from_xero', true)
    // sum actuals by month for revenue lines
    break
  }
}
```

### Coach role detection pattern (from `coach/dashboard/page.tsx`)
```typescript
// Source: src/app/coach/dashboard/page.tsx
const { data: roleData } = await supabase
  .from('system_roles')
  .select('role')
  .eq('user_id', user.id)
  .maybeSingle()

const isSuperAdmin = roleData?.role === 'super_admin'
const isCoach = roleData?.role === 'coach' || isSuperAdmin
```

### useBusinessDashboard with override (from `useBusinessDashboard.ts`)
```typescript
// Source: src/app/business-dashboard/hooks/useBusinessDashboard.ts line 36
export function useBusinessDashboard(overrideBusinessId?: string) {
  // hook uses overrideBusinessId in place of activeBusiness.id when provided
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual KPI entry only | business_kpis with year1/2/3 targets | Phase 4-9 | Targets available for dashboard comparison |
| Single FY assumption (Jul-Jun) | Fiscal year parameterized via `fiscal-year-utils.ts` | Phase 13 | Dashboard charts must use `yearStartMonth` from business profile |
| Snapshot table only | `forecast_pl_lines.actual_months` JSONB | Phase 5 + sync-forecast | Rich monthly actuals available for chart data |
| coach/client routing manual | `system_roles` table + `/coach/*` layout | Existing | Coach views live under `/coach/` path with `CoachLayoutNew` |

**Deprecated/outdated:**
- `page-old.tsx` in `/dashboard`: Old dashboard code — ignore, replaced by current `page.tsx`
- `CashflowForecastChart 2.tsx` (note the space): Duplicate/draft file — ignore
- `weekly_metrics_snapshots` migration vs actual table name: The service uses `weekly_metrics_snapshots` but the DB migration creates it as `weekly_metrics_snapshots` — names match, no issue

---

## Open Questions

1. **What does "weekly review integration" mean concretely?**
   - What we know: There are two separate features — `/reviews/weekly` (qualitative check-in) and `/business-dashboard` (weekly metric table). Both exist independently.
   - What's unclear: Should they be merged, linked, or just share data? Does "weekly review integration" mean the KPI dashboard should be embedded in the weekly review flow, or that the weekly review triggers a metrics snapshot?
   - Recommendation: Planner should interpret as: add a "View KPI Dashboard" link from the weekly review completion screen, and add a "Sync this week's Xero actuals" button to the business dashboard — bridging them without merging.

2. **`user_kpis` vs `business_kpis` consolidation**
   - What we know: Two tables exist. `/kpi-selection` uses `user_kpis`, the API route uses `business_kpis`.
   - What's unclear: Are there production records in `user_kpis` that would be lost if we pivot?
   - Recommendation: Planner should include a task to determine which table has live data and standardize on one. Default to `business_kpis` as it has the richer schema (kpi_id unique constraint, year1/2/3 targets).

3. **Coach KPI view scope**
   - What we know: `/coach/clients/[id]` exists. `useBusinessDashboard` accepts `overrideBusinessId`.
   - What's unclear: Should coach see a read-only mirror of the client's business-dashboard, or a separate summary view?
   - Recommendation: Read-only mirror using `useBusinessDashboard(clientId)` with editing disabled — minimal new code.

---

## Environment Availability

Step 2.6: SKIPPED (no new external dependencies — all Xero calls use existing infrastructure, recharts already installed)

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no test config files found |
| Config file | none |
| Quick run command | `npm run build && npm run lint` |
| Full suite command | `npm run verify` (build + lint + smoke-test) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KPI-01 | Xero actuals display in business-dashboard charts | smoke | `npm run build` | ❌ Wave 0 |
| KPI-02 | Coach can view client KPI dashboard | smoke | `npm run build` | ❌ Wave 0 |
| KPI-03 | Weekly review links to KPI dashboard | smoke | `npm run build` | ❌ Wave 0 |
| KPI-04 | business_kpis dual-ID lookup works | manual | manual — run as coach on a client business | N/A |

### Sampling Rate
- **Per task commit:** `npm run build && npm run lint`
- **Per wave merge:** `npm run verify`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- No test infrastructure beyond build/lint/smoke exists in this project — this is the established pattern. No action required.

*(No gaps: project uses build + lint + smoke as the validation layer — established pattern across all prior phases)*

---

## Sources

### Primary (HIGH confidence)
- Direct codebase read — `src/app/business-dashboard/page.tsx`, `hooks/useBusinessDashboard.ts`, `services/weekly-metrics-service.ts` — confirmed BusinessDashboard is a full weekly tracking table, no charts
- Direct codebase read — `src/app/api/Xero/sync/route.ts`, `pl-summary/route.ts`, `sync-forecast/route.ts` — confirmed Xero P&L data paths, table names, parsing logic
- Direct codebase read — `src/app/api/kpis/route.ts` — confirmed `business_kpis` and `kpi_history` table usage
- Direct codebase read — `package.json` — recharts `^3.5.0` confirmed installed
- Direct codebase read — `supabase/migrations/20251209_create_missing_tables.sql` — confirmed `business_kpis` and `weekly_metrics_snapshots` table schemas
- Direct codebase read — `supabase/migrations/20251210_add_business_kpis_columns.sql` — confirmed `kpi_id`, `year1_target`, `year2_target`, `year3_target` columns
- Direct codebase read — `src/app/reviews/weekly/page.tsx` — confirmed weekly review is separate, no Xero auto-population, no chart
- Direct codebase read — `src/app/kpi-selection/page.tsx` — confirmed uses `user_kpis` table (not `business_kpis`)

### Secondary (MEDIUM confidence)
- `src/middleware.ts` — role-based routing: coach routes under `/coach/`, system_roles table for role detection
- `src/app/coach/dashboard/page.tsx` — confirmed coach sees client table but no KPI charts

### Tertiary (LOW confidence)
- `kpi_history` is documented as empty in production (comment in Phase 3 migration) — no live data to validate against

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — packages confirmed in package.json
- Architecture: HIGH — all patterns derived from reading active production code
- Pitfalls: HIGH — dual-ID issue is documented in project memory, Xero rate-limiting is architecture-level
- Data schema: HIGH — confirmed from migrations and API route code
- Weekly review integration: MEDIUM — requirement is ambiguous; interpretation provided

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable codebase, no fast-moving dependencies)
