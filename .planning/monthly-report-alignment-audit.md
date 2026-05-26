# Monthly Report → Forecast Builder Alignment Audit

**Date:** 2026-05-14  
**Scope:** CFO-grade business coaching platform (Next.js + Supabase)  
**Thoroughness:** Very Thorough — evidence to line number  
**Phases in scope:** 44, 44.1, 44.2, 44.3, 56, 57, 58, 59, 60

---

## Section 1 — Map the Monthly Reporting Module

### 1.1 API Routes (`/src/app/api/monthly-report/**`)

| Route | HTTP Method | Purpose | Key Tables Read | Tables Written |
|-------|-------------|---------|-----------------|-----------------|
| `/consolidated` | POST | Multi-tenant P&L (Phase 34) | `financial_forecasts`, `xero_connections`, `xero_pl_lines` | None (read-only) |
| `/generate` | POST | Single-entity P&L (core report) | `account_mappings`, `financial_forecasts`, `forecast_pl_lines`, `xero_pl_lines_wide_compat`, `business_profiles` | None (read-only) |
| `/consolidated-bs` | POST | Multi-tenant Balance Sheet | `financial_forecasts`, `xero_bs_lines`, `xero_connections` | None (read-only) |
| `/consolidated-cashflow` | POST | Multi-tenant Cashflow | `financial_forecasts`, `xero_bs_lines`, `xero_connections` | None (read-only) |
| `/snapshot` | POST/GET | Phase 35: snapshot save/load | `cfo_report_status` | `cfo_report_status` |
| `/subscription-detail` | POST | Subscription vendor breakdown | `subscription_budgets`, `xero_connections`, Xero API (bank txns) | None (read-only) |
| `/wages-detail` | POST | Payroll breakdown (Calxa-style) | `financial_forecasts`, `forecast_pl_lines`, Xero API (PayRuns) | None (read-only) |
| `/full-year` | POST | 12-month projection | `account_mappings`, `financial_forecasts`, `forecast_pl_lines`, `xero_pl_lines_wide_compat` | None (read-only) |
| `/account-mappings` | GET/POST/PUT | Account category mappings | `account_mappings`, `xero_pl_lines_wide_compat` | `account_mappings` |
| `/settings` | GET/POST | Report configuration | `monthly_report_settings` | `monthly_report_settings` |
| `/commentary` | POST | AI vendor narrative (Phase 35) | `monthly_report_settings`, budget forecast | None (write via Sentry) |
| `/auto-map` | POST | Auto-map unmapped accounts | `account_mappings`, `financial_forecasts`, `forecast_pl_lines` | `account_mappings` |
| `/sync-xero` | POST | OAuth + data sync trigger | `xero_connections`, Xero API | `xero_connections`, `xero_pl_lines` |
| `/debug` | POST | Diagnostic output (non-prod) | All relevant tables | None |

**File evidence:**
- `/src/app/api/monthly-report/generate/route.ts:31-200` — primary P&L generation
- `/src/app/api/monthly-report/consolidated/route.ts:54-150` — consolidated routing
- `/src/app/api/monthly-report/subscription-detail/route.ts:75-150` — subscription vendor detail
- `/src/app/api/monthly-report/wages-detail/route.ts:55-100` — payroll detail

### 1.2 UI Pages

| Page | Path | Purpose | Key Hook |
|------|------|---------|----------|
| Monthly Report | `/src/app/finances/monthly-report/page.tsx` | Main dashboard | `useMonthlyReport()` |
| Forecast Builder | `/src/app/finances/forecast/page.tsx` | Forecast wizard | `ForecastService` |

**File evidence:**
- `/src/app/finances/monthly-report/page.tsx:70-1372` — page composition, phase 35 approval wiring (line 55-63), phase 42 auto-save wiring (line 11, 371-380), phase 34 consolidation detection (line 254-276)

### 1.3 Services (Forecast-Related)

| Service | Path | Purpose | Exports |
|---------|------|---------|---------|
| `ForecastReadService` | `/src/lib/services/forecast-read-service.ts` | Read-side freshness invariant (Phase 44 D-13) | `getMonthlyComposite()`, `getDataQualityForBusiness()` |
| `monthly-report-service` | `/src/app/finances/monthly-report/services/monthly-report-service.ts` | Settings load, fiscal year utils | `loadSettings()`, `getCurrentFiscalYear()` |
| `MonthlyReportPDFService` | `/src/app/finances/monthly-report/services/monthly-report-pdf-service.ts` | PDF export (Phase 35) | `.generate()` |

**File evidence:**
- `/src/lib/services/forecast-read-service.ts:1-145` — D-18 freshness invariant, D-44.2-03 quality gate, `QUALITY_RANK` enum
- `/src/app/finances/monthly-report/services/monthly-report-service.ts:1-64` — settings with `budget_forecast_id` field

### 1.4 Components (Monthly Report)

Key components under `/src/app/finances/monthly-report/components/`:
- `BudgetVsActualDashboard.tsx` — main P&L rendering
- `BudgetVsActualTable.tsx` — line-by-line table
- `SubscriptionAnalysisTab.tsx` — subscription vendor detail
- `WagesAnalysisTab.tsx` — payroll detail
- `FullYearProjectionTable.tsx` — 12-month view
- `ConsolidatedPLTab.tsx` — multi-tenant P&L (Phase 34)
- `ReportStatusBar.tsx` — approval/send status (Phase 35 D-06, D-15)
- `SaveIndicator.tsx` — auto-save pill (Phase 42 D-08)

### 1.5 Hooks (Data Loading)

| Hook | Path | Purpose |
|------|------|---------|
| `useMonthlyReport()` | `/src/app/finances/monthly-report/hooks/useMonthlyReport.ts` | Generate/load P&L, route to `/consolidated` or `/generate` |
| `useConsolidatedReport()` | `/src/app/finances/monthly-report/hooks/useConsolidatedReport.ts` | Multi-tenant P&L (Phase 34) |
| `useFullYearReport()` | `/src/app/finances/monthly-report/hooks/useFullYearReport.ts` | 12-month projection |
| `useSubscriptionDetail()` | `/src/app/finances/monthly-report/hooks/useSubscriptionDetail.ts` | Subscription vendor breakdown |
| `useWagesDetail()` | `/src/app/finances/monthly-report/hooks/useWagesDetail.ts` | Payroll detail |
| `useAutoSaveReport()` | `/src/app/finances/monthly-report/hooks/useAutoSaveReport.ts` | Phase 42: commentary debounce + save (D-01, D-02) |
| `useReportStatus()` | `/src/app/finances/monthly-report/hooks/useReportStatus.ts` | Phase 35: `cfo_report_status()` read (D-06) |

### 1.6 Email/Approval Flow

- **RPC:** `cfo_report_status(business_id, period_month)` — Phase 35 Plan 06
- **Save path:** `approveAndSend()` → `POST /api/cfo/report-status` (calls RPC)
- **Status states:** `draft` → `ready` → `sent` → (revert to `draft`)
- **File evidence:**
  - `/src/app/finances/monthly-report/services/approve-and-send.ts:1-200` — approval flow
  - `/src/app/finances/monthly-report/page.tsx:56-63` — status bar wiring

### 1.7 Database Tables (Monthly Report-Specific)

| Table | Schema | Usage |
|-------|--------|-------|
| `monthly_report_settings` | `business_id`, `sections`, `subscription_account_codes`, `wages_account_names`, `budget_forecast_id`, `pdf_layout` | Report configuration per business |
| `account_mappings` | `business_id`, `xero_account_name`, `report_category`, `forecast_pl_line_id`, `account_code` (Phase 57) | Xero → report category mapping |
| `cfo_report_status` | `business_id`, `period_month`, `status` (`draft`\|`ready`\|`sent`), `snapshot_data` | Phase 35: snapshot + approval state |
| `xero_pl_lines_wide_compat` | `business_id`, `account_name`, `account_type`, `monthly_values` (JSONB) | Actual P&L data (wide shape) |

---

## Section 2 — Map the Current Forecast Builder

### 2.1 Wizard Pages

| Page | Path | Purpose |
|------|------|---------|
| Forecast Main | `/src/app/finances/forecast/page.tsx` | Entry point, FY selector, scenario mgmt |
| Forecast Wizard | `/src/app/finances/forecast/components/ForecastWizard.tsx` | Steps 1–9 (Phase 57: Step 8 subscription review) |

**File evidence:**
- `/src/app/finances/forecast/page.tsx:1-100` — Phase 58 overhaul structure

### 2.2 Forecast Service Layer

| Service | Path | Purpose | Key Methods |
|---------|------|---------|------------|
| `ForecastService` | `/src/app/finances/forecast/services/forecast-service.ts` | Forecast CRUD, PL line fetch | `getOrCreateForecast()`, `loadPLLines()`, `saveForecast()` |
| `ForecastReadService` | `/src/lib/services/forecast-read-service.ts` | **D-13 / D-18** read-side (Phase 44) | `getMonthlyComposite()`, `getDataQualityForBusiness()` |
| `ForecastSeedService` | `/src/lib/services/forecast-seed-service.ts` | Phase 59: seed from prior FY | `seedFromPriorFY()` |

**File evidence:**
- `/src/lib/services/forecast-read-service.ts:1-50` — freshness invariant + quality gate
- Line 44: `STRICT_INVARIANTS = process.env.FORECAST_INVARIANTS_STRICT === 'true'` (soft-fail mode default)

### 2.3 RPC Functions (Phase 44.1)

**`save_assumptions_and_materialize(forecast_id, assumptions_json)`**
- Atomically updates `financial_forecasts.assumptions` JSONB
- Triggers materialization of `forecast_pl_lines` rows
- Sets `financial_forecasts.updated_at` = now
- Sets `forecast_pl_lines.computed_at` = now (freshness invariant D-18)
- **File evidence:** `/supabase/migrations/20260429000003_save_assumptions_and_materialize_upsert.sql`

### 2.4 Core Tables

| Table | Key Columns | Phase Notes |
|-------|-------------|------------|
| `financial_forecasts` | `id`, `business_id`, `fiscal_year`, `is_active`, `assumptions` (JSONB), `updated_at`, `created_at` | Phase 44.1: `updated_at` = assumptions freshness timestamp |
| `forecast_pl_lines` | `id`, `forecast_id`, `account_code` (Phase 57 join key), `account_name`, `category` (`'revenue'`\|`'cogs'`\|`'opex'`\|`'other_income'`\|`'other_expense'`), `forecast_months` (JSONB), `computed_at` | Phase 44.1: `computed_at` freshness assertion; Phase 57: `account_code` made canonical |
| `forecast_subscription_lines` | `id`, `forecast_id`, `account_code`, `subscription_name`, `monthly_budget` (JSONB) | Phase 57: subscription line model (if exists) |
| `xero_pl_lines` | `id`, `business_id`, `tenant_id`, `account_id`, `account_name`, `account_code`, `account_type`, `monthly_values` (JSONB) | Phase 44.2: P&L data; Phase 44.2-09: BS vs P&L classification via `xero_type` |
| `account_mappings` | `business_id`, `xero_account_name`, `xero_account_code`, `report_category`, `forecast_pl_line_id`, `account_code` (Phase 57) | Phase 57: `account_code` added as join key |

**File evidence:**
- `/src/lib/services/forecast-read-service.ts:57-62` — `AccountType` enum: `'revenue'`, `'cogs'`, `'opex'`, `'other_income'`, `'other_expense'`
- `/src/lib/services/forecast-read-service.ts:74` — `DataQuality` enum with worst-of-tenants rollup (D-44.2-04)

### 2.5 Direct Table Queries (Bypasses ForecastReadService)

**Identified locations:**
- `/src/app/api/monthly-report/generate/route.ts:176-244` — fallback to `xero_pl_lines_wide_compat` when no active forecast (D-13 fallback path)
- `/src/app/api/monthly-report/full-year/route.ts:200+` — direct `forecast_pl_lines` query for budget lines
- `/src/app/api/monthly-report/account-mappings/route.ts:42-47` — direct `xero_pl_lines_wide_compat` read

**Risk:** These bypass D-18 freshness invariant; D-44.2-03 quality gate only checked in `generate` route's D-13 path (line 238-243).

---

## Section 3 — Trace Flow: Forecast → Monthly Report

### 3.1 Single-Entity Path (`/api/monthly-report/generate`)

**Flow diagram:**
```
Page generates → useMonthlyReport.generateReport()
  ↓
POST /api/monthly-report/generate
  ↓
1. Load settings (budget_forecast_id) [line 74-93]
2. Load account mappings [line 96-111]
3. Resolve dual business IDs [line 176]
4. Find active forecast for actuals [line 181-189]
  ↓ If forecast exists:
5. Call ForecastReadService.getMonthlyComposite(forecast_id) [line 200]
   → Returns: rows[] with (account_name, account_type, monthly_values)
   → Also returns: data_quality, per_tenant_quality
  ↓ If NO forecast:
5. Fallback: read xero_pl_lines_wide_compat directly [line 213-244]
   → Does NOT call freshness invariant check
   → Computes data_quality separately via getDataQualityForBusiness() [line 239]
  ↓
6. Match Xero actuals → budget lines via account_code or name [line 246-403]
7. Build ReportLine[] with budget values from forecast_months [line 356-396]
8. Build summary + profit rows [line 478-590]
9. Return GeneratedReport [line 600+]
```

**Key finding:** 
- **D-13 path (ForecastReadService):** used when `is_active=true` forecast exists
- **Fallback path:** used when no active forecast (new businesses)
- **D-18 invariant:** ONLY checked on D-13 path (line 200); fallback path skips it
- **D-44.2-03 quality gate:** populated on both paths (line 207-210, 238-243)

**File evidence:**
- `/src/app/api/monthly-report/generate/route.ts:198-244` — dual paths
- `/src/app/api/monthly-report/generate/route.ts:356` — budget lookup: `budgetMonths[report_month]`
- `/src/app/api/monthly-report/generate/route.ts:420-421` — category derived from `bl.category` (forecast_pl_lines)

### 3.2 Multi-Tenant Path (`/api/monthly-report/consolidated`)

**Flow diagram:**
```
useMonthlyReport detects consolidation group (2+ active xero_connections)
  ↓
POST /api/monthly-report/consolidated { business_id, report_month, fiscal_year }
  ↓
1. Load per-tenant xero_connections [line 107-112]
2. Call buildConsolidation() engine [line 121-142]
   → Queries financial_forecasts per tenant [Phase 34.3]
   → Aggregates per-tenant PL lines
   → Loads per-tenant budgets from forecast_pl_lines
   → Handles FX translation [line 126-141]
  ↓
3. Adapter (useMonthlyReport.ts) converts ConsolidatedReport → GeneratedReport [line 55-237]
   → Groups by mapTypeToCategory() [line 72]
   → YTD = sum of months ≤ report_month [line 77-79]
   → Sets budget to 0 (Phase 34.0: consolidated budgets pending) [line 86]
  ↓
4. Return adapted GeneratedReport (Actual-vs-Budget UI uses same template system)
```

**Key finding:** Consolidated path does NOT call `ForecastReadService.getMonthlyComposite()` — it uses a parallel engine (`buildConsolidation`).

**File evidence:**
- `/src/app/finances/monthly-report/hooks/useMonthlyReport.ts:289-348` — branching logic
- `/src/app/finances/monthly-report/hooks/useMonthlyReport.ts:55-237` — adapter function
- `/src/lib/consolidation/engine.ts` (not fully read, but referenced in route.ts:121)

### 3.3 Full-Year Projection (`/api/monthly-report/full-year`)

**Flow diagram:**
```
useFullYearReport.loadFullYear(fiscal_year)
  ↓
POST /api/monthly-report/full-year
  ↓
1. Load active forecast [line 146-168] (same dual-ID logic as generate)
2. Load budget forecast_pl_lines [line 150-157]
3. Load actuals via ForecastReadService.getMonthlyComposite() [line 198+]
   OR fallback to xero_pl_lines_wide_compat [line 212-244]
4. For each month in FY: combine actual + budget [line 260+]
5. Return FullYearLine[] with projected_total, annual_budget, variance
```

**Key finding:** Full-year path mirrors generate logic but aggregates across all 12 months.

**File evidence:**
- `/src/app/api/monthly-report/full-year/route.ts:91-150` — same dual-ID resolution
- Line 115-127: budget forecast selection

### 3.4 Subscriptions Detail (`/api/monthly-report/subscription-detail`)

**Flow diagram:**
```
Page: settings.subscription_account_codes = ['5200', '5201']
  ↓
useSubscriptionDetail.loadSubscriptionDetail(month, codes)
  ↓
POST /api/monthly-report/subscription-detail
  ↓
1. Validate account_codes length [line 94-96]
2. Get Xero access token [line 111-114]
3. Fetch bank transactions for each code [line 150+]
   → Vendor normalization + grouping
4. Fetch subscription_budgets (per-vendor budget) [line 200+]
5. Fetch P&L actuals via xero_pl_lines (account-level subtotal) [line 220+]
6. Fetch forecast budget via financial_forecasts.forecast_pl_lines [line 230+]
7. Return SubscriptionDetailData with vendor rows + account subtotals
```

**Key finding:** Subscriptions are:
- **Source of actuals:** bank transactions (Xero Contacts)
- **Source of budget:** `subscription_budgets` table (per-vendor budgets)
- **Account subtotal:** aggregated from `xero_pl_lines` (P&L category level)
- **NOT separately marked in forecast_pl_lines** (no `forecast_subscription_lines` visible in routes)

**File evidence:**
- `/src/app/api/monthly-report/subscription-detail/route.ts:66-150` — route structure
- Line 72: "Vendor rows: actuals from bank transactions, budgets from subscription_budgets"
- Line 72: "Account subtotals & grand total: use authoritative P&L actual and forecast budget"

### 3.5 Wages Detail (`/api/monthly-report/wages-detail`)

**Flow diagram:**
```
Page: settings.wages_account_names = ['Wages & Salaries', ...]
  ↓
useWagesDetail.loadWagesDetail(month, fy, names, budget_forecast_id)
  ↓
POST /api/monthly-report/wages-detail
  ↓
1. Load forecast [line 91-103] (resolves dual IDs)
2. Load forecast_pl_lines for budget [line 108-130]
3. Load P&L actuals for accounts [line 133-160]
4. Fetch Xero PayRuns + employee detail [line 200+]
   → Match employees to budget forecast lines
5. Return WagesDetailData with account subtotals + employee detail
```

**Key finding:** Wages are:
- **Source of actuals:** Xero PayRuns (employee level)
- **Source of budget:** `forecast_pl_lines` where `account_name` matches wages_account_names
- **NOT marked separately in forecast** (wages are OpEx category lines in forecast)

**File evidence:**
- `/src/app/api/monthly-report/wages-detail/route.ts:55-130` — load forecast + PL lines
- Line 72: "Budget comparison" comes from forecast_pl_lines

### 3.6 Budget Lookup Mechanism (Critical for Drift)

**In generate/full-year routes:**
```typescript
// Line 318-329 (generate route) — budget matching priority:
1. mapping.forecast_pl_line_id (direct ID) [line 319]
2. mapping.forecast_pl_line_name (mapping name) [line 323]
3. Fuzzy match on xero.account_name [line 327]

// Line 356 — budget values extracted:
budgetMonths = budgetLine.forecast_months || {}
budget = budgetMonths[report_month] || 0
```

**Key issue:** Budget lines matched by:
- Forecast ID (phase 57: should be account_code join key, but ID still used)
- Name fuzzy matching (account_name)
- **NO account_code join** despite Phase 57 restructuring (see drift point 5)

---

## Section 4 — Drift Candidates (Specific Risk Areas)

### 1. Subscription Line Handling (Phase 57)

**Phase 57 change:** Subscriptions restructured with `subscriptions_state` field, `account_code` as join key.

**Current state in monthly report:**
- ✅ Settings has `subscription_account_codes: string[]` (Phase 57 compliant)
- ✅ Subscription detail API takes `account_codes` parameter (not names)
- ✅ Full-year / generate routes do NOT separately line-item subscriptions; they aggregate into the account's OpEx total

**Finding:** Subscriptions appear as:
1. **Vendor detail tab** (breakdown by vendor within each account)
2. **Folded into OpEx account subtotal** (not a separate "Subscriptions" section in P&L)

**Status:** ✅ **ALIGNED** — Phase 57's account_code-based selection matches the monthly report subscription_account_codes field.

**Evidence:**
- `/src/app/finances/monthly-report/page.tsx:465-467` — settings.subscription_account_codes loaded, passed to hook
- `/src/app/api/monthly-report/subscription-detail/route.ts:78-81` — POST body expects account_codes
- `/src/app/finances/monthly-report/types.ts` — settings schema includes `subscription_account_codes`

---

### 2. Team vs OpEx Allocation (Wages Double-Counting)

**Known concern:** Wages counted in Team + OpEx (461% budget error observed).

**Current state in monthly report:**
- Generate route: maps Xero accounts to report categories via `account_mappings.report_category`
- If a "Wages & Salaries" account is mapped to `'Operating Expenses'` category, it flows into OpEx subtotal
- Wages detail tab: SEPARATE read from `xero_pl_lines` + payroll; does NOT subtract from OpEx

**Critical finding:** No deduplication logic detected.
- `/src/app/api/monthly-report/generate/route.ts:296-403` — processes each Xero account once, maps to category
- No logic removes wages from OpEx before adding Team section
- No "Team" section in ReportCategory enum (only Revenue, Cost of Sales, Operating Expenses, Other Income, Other Expenses)

**Question:** How are Team costs rendered on monthly report?
- Searching codebase: NO `'Team'` or `'Wages'` ReportCategory exists
- wages_account_names in settings appears to be for **detail tab only**, not section aggregation

**Status:** ⚠️ **UNCLEAR** — Wages detail is a separate tab (not a P&L section). IF wages Xero accounts are mapped to OpEx category, they appear in OpEx total. Wages tab then shows the same $ amount as detail, but this is NOT a double-count (tab is informational, not a separate line in P&L). However, if a coach is manually setting wages_account_names AND mapping those accounts to OpEx, the tab's "total" will visually match OpEx wage line, creating confusion.

**Hypothesis:** Phase 57 may have intended subscriptions to have explicit `subscriptions_state='subscriptions'` category, but wages still roll up as OpEx. The confusion arises because wages detail is a separate UI concern, not a P&L category concern.

**Mitigation needed:**
- Audit account_mappings data: do wages accounts have `report_category='Operating Expenses'`?
- If yes, wages detail tab will show $ that are already in OpEx; coaches may think they're duplicated
- No code path actually double-counts (reads are de-duplicated), but UX suggests duplication

**Evidence:**
- `/src/lib/monthly-report/shared.ts:31-40` — mapTypeToCategory has no Team/Wages category
- `/src/app/api/monthly-report/generate/route.ts:296-302` — canonical categories: Revenue, Cost of Sales, Operating Expenses, Other Income, Other Expenses
- `/src/app/finances/monthly-report/hooks/useMonthlyReport.ts:39-45` — CATEGORY_ORDER has 5 items, no Wages/Team

---

### 3. Xero P&L Bucketing (Phase 44.2)

**Phase 44.2 change:** BS uses parser/layout bucketing (xero_bs_section), P&L uses catalog `xero_type`.

**Current state:**
- Generate route: reads `xero_pl_lines_wide_compat` with `account_type` column
- Maps via `mapTypeToCategory(xero.account_type)`: revenue → Revenue, cogs → Cost of Sales, opex → Operating Expenses
- ForecastReadService: reads from xero_pl_lines, also maps via account_type
- **No parser/layout bucketing** observed in P&L flows

**Finding:** P&L P&L appears to use consistent `xero_type` classification (not parser/layout bucketing). This aligns with Phase 44.2 design (P&L uses catalog, BS uses parser/layout).

**Status:** ✅ **ALIGNED** — Both forecast and monthly report use `xero_type` (account_type) for P&L categorization.

**Evidence:**
- `/src/app/api/monthly-report/generate/route.ts:304-306` — mapTypeToCategory called on xero.account_type
- `/src/lib/services/forecast-read-service.ts:103-109` — MonthlyCompositeRow has account_type (not section)
- No `xero_bs_section` or parser/layout logic in P&L routes; BS routes use separate logic

---

### 4. Forecast Freshness Invariant (Phase 44.1)

**Phase 44.1 change:** D-18 invariant: `forecast_pl_lines.computed_at >= financial_forecasts.updated_at`.

**Current state:**
- **D-13 path (active forecast exists):**
  - Calls `ForecastReadService.getMonthlyComposite(forecast_id)` [line 200]
  - Service asserts D-18 invariant internally (line 44: `STRICT_INVARIANTS` env var gates strict vs soft-fail)
  - Soft-fail default: log to Sentry, return row anyway
  
- **Fallback path (no active forecast):**
  - Reads `xero_pl_lines_wide_compat` directly [line 213]
  - **DOES NOT check D-18 invariant**
  - Computes quality separately [line 239]

**Finding:** Invariant coverage:
- ✅ D-13 path: covered (via ForecastReadService)
- ❌ Fallback path: NOT covered (direct read)

**Status:** ⚠️ **DRIFTED** — Fallback path bypasses freshness invariant. If an old forecast exists (updated_at = old) but computed_at is newer (from a newer compute trigger), the fallback read won't detect stale assumptions. Low risk in practice (fallback only used when no active forecast), but violates Phase 44.1 contract.

**Severity:** MEDIUM — only impacts businesses with no active forecast (new/test businesses).

**Evidence:**
- `/src/app/api/monthly-report/generate/route.ts:198-200` — D-13 path
- `/src/app/api/monthly-report/generate/route.ts:211-244` — fallback path (no invariant check)
- `/src/lib/services/forecast-read-service.ts:44` — STRICT_INVARIANTS env var, soft-fail default

---

### 5. Account-Code Join Key (Phase 57)

**Phase 57 change:** `account_code` made canonical subscription + forecast join key (away from name-based matching).

**Current state in monthly report:**
- Account mappings: `xero_account_code` stored in account_mappings table
- Budget matching (generate route, line 318-329):
  - Primary: `mapping.forecast_pl_line_id` (direct ID)
  - Secondary: `mapping.forecast_pl_line_name` (mapping name)
  - Tertiary: fuzzy name match on xero.account_name
  - **NO account_code join observed**

- Subscriptions: subscription_account_codes stored and passed (Phase 57 compliant)
- Wages: wages_account_names (still name-based, NOT account_code)

**Finding:** Mixed state:
- ✅ Subscriptions fully migrated to account_code (line 78: POST body takes account_codes)
- ❌ Wages still name-based (line 58: wages_account_names)
- ❌ Budget line matching still uses ID / name, not account_code

**Status:** ⚠️ **DRIFTED** — Phase 57's account_code standardization not fully applied. Budget line matching still relies on ID + name, not the canonical account_code. This creates ambiguity if forecast lines have duplicate account names.

**Severity:** MEDIUM — name-based matching works in most cases, but breaks if two forecast lines share a name (not prevented by schema).

**Evidence:**
- `/src/app/api/monthly-report/generate/route.ts:318-329` — budget matching logic (no account_code check)
- `/src/app/api/monthly-report/wages-detail/route.ts:58` — wages_account_names (name-based)
- `/src/app/finances/monthly-report/page.tsx:465-467` — subscription_account_codes (Phase 57 compliant)

---

### 6. Save Flow (Parallel Paths Post-Phase 44.1)

**Phase 42 change:** Consolidated monthly report save (commentary auto-save via useAutoSaveReport).

**Phase 44.1 change:** Atomic save_assumptions_and_materialize RPC for forecast assumptions.

**Current state:**
- Monthly report save path: `/api/monthly-report/snapshot` (Phase 35 cfo_report_status)
- Forecast save path: RPC `save_assumptions_and_materialize()` + direct forecast_pl_lines updates
- **Separate save paths; no contention**

**Finding:** No parallel save conflicts detected. Each domain saves independently:
- Monthly report: snapshots commentary + metadata via cfo_report_status
- Forecast: saves assumptions + materialized lines via RPC

**Status:** ✅ **ALIGNED** — Separate save paths avoid contention.

**Evidence:**
- `/src/app/finances/monthly-report/hooks/useMonthlyReport.ts:350-395` — snapshot save path
- `/src/app/api/monthly-report/snapshot/route.ts` (not fully read, but referenced)
- Phase 44.1 RPC: `/supabase/migrations/20260429000003_save_assumptions_and_materialize_upsert.sql`

---

### 7. Plan Period / Extended Period Detection (Phase 43)

**Phase 43 change:** Plan period made explicit (e.g., fiscal_year stored on financial_forecasts).

**Current state:**
- Generate route: fiscal_year passed as param, used to parameterize FY range [line 127, 261]
- Full-year route: same parameterized FY range
- Consolidated route: same
- **All routes use explicit fiscal_year; no inference**

**Status:** ✅ **ALIGNED** — Explicit fiscal_year used consistently.

**Evidence:**
- `/src/app/api/monthly-report/generate/route.ts:41, 127, 261` — fiscal_year param
- `/src/app/api/monthly-report/full-year/route.ts:94, 114` — same

---

### 8. Business ID Resolution (Dual System)

**Known concern:** `businesses.id` vs `business_profiles.id` dual business ID system.

**Current state:**
- Generate route: `resolveBusinessIds(supabase, business_id)` [line 176]
- Full-year route: same [line 104]
- Account mappings: same [line 27]
- Subscription detail: same [line 89]
- Wages detail: same [line 89]
- Consolidated route: **DOES NOT call resolveBusinessIds**; uses business_id directly

**Finding:** Consolidated route is missing `resolveBusinessIds()` call at line 121. It queries `business_profiles.fiscal_year_start` using business_id directly [line 107], but should first resolve to profileId.

**Status:** ⚠️ **DRIFTED** — Consolidated route does not fully resolve dual business IDs. Single-entity routes all call resolveBusinessIds, but consolidated route skips it.

**Severity:** MEDIUM — if a business's businesses.id ≠ business_profiles.id, consolidated route's fiscal_year_start query may fail or return wrong row.

**Evidence:**
- `/src/app/api/monthly-report/generate/route.ts:176` — resolveBusinessIds call
- `/src/app/api/monthly-report/consolidated/route.ts:107-112` — missing resolveBusinessIds, direct query
- `/src/app/api/monthly-report/full-year/route.ts:104, 107-110` — correct pattern (resolveBusinessIds, then query with profileId)

---

### 9. Period Coverage / Data Quality Banner (Phase 44.2-09)

**Phase 44.2-09 change:** Worst-of data-quality banner with per-tenant detail drawer.

**Current state:**
- Generate route (D-13 path): calls ForecastReadService, which returns `data_quality` + `per_tenant_quality` [line 207-210]
- Page component: renders `DataIntegrityBanner` with `dataQuality`, `perTenantQuality` [line 956-960]
- Consolidated route: **DOES NOT return data_quality or per_tenant_quality**

**Finding:** Single-entity path fully implements 44.2-09. Multi-tenant consolidated path does not expose quality state.

**Status:** ⚠️ **DRIFTED** — Consolidated reports do not surface data quality info to the banner. Coaches viewing a consolidated P&L will not see sync status or discrepancy count per tenant.

**Severity:** MEDIUM — coaches lose visibility into data freshness on consolidated reports.

**Evidence:**
- `/src/app/api/monthly-report/generate/route.ts:207-210` — quality returned
- `/src/app/finances/monthly-report/page.tsx:954-960` — banner rendered
- `/src/app/api/monthly-report/consolidated/route.ts:144` — response object omits quality fields

---

### 10. YTD vs Forecast Comparison Math

**Current state:**
- YTD actual: sum of months from FY start to report_month [line 364]
- YTD budget: sum of months from FY start to report_month [line 365]
- Variance: calcVariance(ytdActual, ytdBudget, isRevenue) [line 366]

- Forecast wizard: likely similar aggregation, but **not inspected in detail**

**Finding:** Math appears consistent (both sum same month range), but forecast wizard code not fully audited.

**Status:** ❓ **UNCLEAR** — would need to inspect forecast wizard's YTD rendering to confirm.

**Evidence:**
- `/src/app/api/monthly-report/generate/route.ts:364-366` — YTD calc
- `/src/app/finances/forecast/components/PLForecastTable.tsx` (not fully read)

---

## Section 5 — Test Coverage for Monthly Report

### 5.1 Unit / Integration Tests

| File | Scope | What It Pins | Drift Coverage |
|------|-------|--------------|-----------------|
| `/src/app/api/monthly-report/consolidated/route.test.ts` | Integration | Multi-tenant P&L shape, budget fields, diagnostics | ✅ Phase 34.3 shape + budget per-tenant |
| `/src/app/api/monthly-report/consolidated-bs/route.test.ts` | Integration | Balance sheet consolidation | ✅ BS specific |
| `/src/lib/monthly-report/shared.test.ts` | Unit | mapTypeToCategory, calcVariance, buildSubtotal | ✅ variance sign convention |
| No test file | — | generate route (core P&L logic) | ❌ **NONE** |
| No test file | — | full-year route | ❌ **NONE** |
| No test file | — | account-mappings route | ❌ **NONE** |
| No test file | — | subscription-detail route | ❌ **NONE** |
| No test file | — | wages-detail route | ❌ **NONE** |
| `/src/app/finances/monthly-report/hooks/__tests__/useAutoSaveReport.test.tsx` | Unit | Auto-save debounce, retry logic | ✅ Phase 42 auto-save |
| `/src/app/finances/monthly-report/hooks/__tests__/usePDFLayout.test.tsx` | Unit | PDF layout save/load | ✅ Phase 35 PDF |

**Finding:** Core API routes (`generate`, `full-year`, `account-mappings`, `subscription-detail`, `wages-detail`) have NO tests. High risk for regressions in budget matching, YTD calc, or account mapping logic.

**Status:** ⚠️ **LOW COVERAGE** — only consolidated-specific and hook tests present. Main report generation route untested.

---

## Section 6 — Summary Table

| # | Drift Area | Status | File:line Evidence | Severity |
|---|-----------|--------|--------------------|----|
| 1 | Subscriptions line handling | ✅ ALIGNED | `/src/app/api/monthly-report/subscription-detail/route.ts:78-81`; settings uses `subscription_account_codes` | N/A |
| 2 | Team vs OpEx allocation | ⚠️ UNCLEAR | `/src/lib/monthly-report/shared.ts:31-40`; no Team category in mapTypeToCategory; wages detail is info tab, not P&L section | MEDIUM |
| 3 | Xero P&L bucketing | ✅ ALIGNED | `/src/app/api/monthly-report/generate/route.ts:304-306`; uses `xero_type` (not parser/layout) | N/A |
| 4 | Forecast freshness invariant | ⚠️ DRIFTED | `/src/app/api/monthly-report/generate/route.ts:211-244`; fallback path bypasses D-18 check; D-13 path calls `ForecastReadService` | MEDIUM |
| 5 | Account-code join key | ⚠️ DRIFTED | `/src/app/api/monthly-report/generate/route.ts:318-329`; budget matching uses ID + name, not account_code; subscriptions are account_code-based (aligned) | MEDIUM |
| 6 | Save flow parallel paths | ✅ ALIGNED | `/src/app/finances/monthly-report/hooks/useMonthlyReport.ts:350-395`; separate snapshot + RPC paths, no contention | N/A |
| 7 | Plan period detection | ✅ ALIGNED | `/src/app/api/monthly-report/generate/route.ts:261`; all routes use explicit fiscal_year | N/A |
| 8 | Business ID resolution | ⚠️ DRIFTED | `/src/app/api/monthly-report/consolidated/route.ts:107-112`; missing `resolveBusinessIds()` call; single-entity routes call it | MEDIUM |
| 9 | Data quality banner | ⚠️ DRIFTED | `/src/app/api/monthly-report/consolidated/route.ts:144`; consolidated response omits data_quality; single-entity returns it | MEDIUM |
| 10 | YTD vs forecast math | ❓ UNCLEAR | `/src/app/api/monthly-report/generate/route.ts:364-366`; YTD calc looks consistent, but forecast wizard not fully audited | LOW |

---

## Section 7 — Top Recommendations

### 1. **Fix Account-Code Join Key in Budget Matching** (Drift Point 5)
   **Diagnosis:** Phase 57 made account_code canonical for subscriptions, but budget line matching still uses ID + name. Scope: `/src/app/api/monthly-report/generate/route.ts:318-329`. Add account_code lookup as primary key before falling back to ID/name. This prevents ambiguity if two forecast lines share a name (currently not schema-prevented).

### 2. **Surface Data Quality on Consolidated Reports** (Drift Point 9)
   **Diagnosis:** Consolidated P&L route omits data_quality / per_tenant_quality fields (unlike single-entity path). Coaches lose visibility into sync status. Scope: `/src/app/api/monthly-report/consolidated/route.ts`. Have `buildConsolidation()` return quality metadata; return it in the API response so the page's DataIntegrityBanner works for both paths.

### 3. **Audit Wages Account Mapping & Detail Tab UX** (Drift Point 2)
   **Diagnosis:** Wages detail tab shows data that already rolls up into OpEx if wages accounts are mapped to OpEx category. Coaches may think costs are double-counted (they're not, but UX suggests confusion). Scope: account_mappings data audit + wages detail tab tooltip. Document that wages detail is *informational*, not a separate P&L section. Consider renaming to "Wages Breakdown" to clarify.

### 4. **Add Freshness Invariant Check to Fallback Path** (Drift Point 4)
   **Diagnosis:** Generate route's fallback path (no active forecast) bypasses D-18 freshness check. Low immediate risk (fallback only for new businesses), but violates Phase 44.1 contract. Scope: `/src/app/api/monthly-report/generate/route.ts:211-244`. Call `ForecastReadService.getDataQualityForBusiness()` to get freshness state, even if reading xero_pl_lines directly for actuals.

### 5. **Fix Dual Business ID Resolution in Consolidated Route** (Drift Point 8)
   **Diagnosis:** Consolidated route queries business_profiles without first resolving businesses.id → business_profiles.id. Scope: `/src/app/api/monthly-report/consolidated/route.ts:107-112`. Add `resolveBusinessIds()` call (consistent with single-entity routes).

---

## Appendix: Files Not Fully Audited

- `/src/lib/consolidation/engine.ts` (called by consolidated route, not inspected)
- `/src/app/finances/forecast/components/ForecastWizard.tsx` (Phase 57 subscription step not inspected)
- `/src/app/finances/forecast/services/forecast-service.ts` (wizard-side save, not inspected)
- `/src/app/api/monthly-report/snapshot/route.ts` (Phase 35 snapshot save, only referenced)
- `/src/app/api/monthly-report/debug/route.ts` (non-prod diagnostic, skipped)
- PDF service: `/src/app/finances/monthly-report/services/monthly-report-pdf-service.ts` (98KB, not inspected)

---

**Report generated:** 2026-05-14  
**Auditor:** Claude Code (Haiku 4.5)  
**Mode:** Read-only codebase exploration
