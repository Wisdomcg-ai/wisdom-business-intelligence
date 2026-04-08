# Phase 19: Monthly Reporting - Research

**Researched:** 2026-04-07
**Domain:** Monthly P&L reporting — Xero actuals vs forecast comparison, coach commentary, PDF export
**Confidence:** HIGH (full codebase inspection, no external library research required)

---

## Summary

Phase 19 is substantially more built than the roadmap implies. The monthly report page already has Xero actuals, a budget column sourced from `forecast_pl_lines.forecast_months`, variance calculation, YTD columns, prior-year column, commentary via vendor drill-down and coach notes, and PDF export via jsPDF. The `full-year` tab already blends actuals with forecast for future months and labels them `source: 'actual' | 'forecast'`.

The gap between the roadmap language and reality is a terminology mismatch. What the roadmap calls "forecast column" is what the system already calls "Budget." The `budget` column in `ReportLine` is populated directly from `forecast_pl_lines.forecast_months`. This means the core data integration (Requirement 1: Monthly P&L reads forecast monthly data) is already working. Requirement 2 (Actual vs Forecast variance) is also already working — it is the existing `variance_amount` / `variance_percent` columns.

The two gaps that genuinely need work are: (a) the commentary feature persists to the snapshot's `commentary` JSONB column but there is no dedicated persistent store separate from snapshots — coach notes typed into the UI are lost if the coach generates a fresh report without saving a snapshot first; and (b) "branded report output" — PDF export exists and is functional, but a Phase 19 deliverable may want to refine the branding (logo, header, colour) or confirm it already meets requirements.

**Primary recommendation:** Audit the four roadmap requirements against existing code before writing a single line. The planner should focus on: (1) confirming the "forecast" column terminology gap is a cosmetic/labeling issue only, (2) adding persistent coach commentary per month that survives report regeneration without requiring a manual snapshot save, and (3) verifying the PDF output is considered "branded" by the product owner.

---

## What Already Exists (Critical Pre-Plan Discovery)

### Requirement 1: Monthly P&L reads forecast monthly data
**STATUS: ALREADY IMPLEMENTED**

`/api/monthly-report/generate` (POST) fetches `forecast_pl_lines` for the active forecast and reads `forecast_months` JSONB. This data populates the `budget` column in every `ReportLine`. The column header in `BudgetVsActualTable.tsx` reads "Budget" (not "Forecast"), but the underlying data is `forecast_months`.

Key code path:
```
generate/route.ts line 239:
  .select('id, account_name, category, forecast_months')

line 381:
  const budgetMonths = budgetLine.forecast_months || {}
  const budget = budgetMonths[report_month] || 0
```

The system finds the active forecast by looking up `financial_forecasts` where `is_active = true`, then fetches all `forecast_pl_lines` for that forecast. The matching between Xero accounts and forecast lines uses three strategies: direct `forecast_pl_line_id` FK, `forecast_pl_line_name` field, and fuzzy name matching via `buildFuzzyLookup`.

### Requirement 2: Actual vs Forecast variance by line item
**STATUS: ALREADY IMPLEMENTED**

`ReportLine` has `variance_amount` and `variance_percent` fields. The table displays them with color coding (green/red). The `calcVariance()` function in the generate route handles the sign convention correctly (revenue: actual > budget = positive; expenses: budget > actual = positive).

YTD variance is also calculated: `ytd_variance_amount` and `ytd_variance_percent`.

### Requirement 3: Coach commentary per month
**STATUS: PARTIALLY IMPLEMENTED — HAS A PERSISTENCE GAP**

What exists:
- `commentary` endpoint (`/api/monthly-report/commentary` POST) fetches Xero invoices and bank transactions for the selected month, groups them by vendor for each expense account that is $500+ over budget, and returns a `VarianceCommentary` object.
- `coach_note` field in `VarianceCommentaryEntry` — coaches can type a free-text note per expense account.
- The note is editable in the `CommentaryLine` component inside `BudgetVsActualTable.tsx`.
- Commentary is **in-memory state** (`useState<VarianceCommentary>` in `page.tsx`).
- Commentary is saved to `monthly_report_snapshots.commentary` (JSONB column) only when the coach clicks "Save Draft" or "Finalise".

**The gap:** If a coach edits a note and then clicks "Generate Report" again (which they might do after changing the month), the commentary state is reset to `undefined` and their notes are lost. The auto-save on regeneration does not carry commentary forward. Notes are also lost on page reload unless a snapshot was saved first.

**No dedicated `monthly_report_commentary` DB table exists.** Notes live in the snapshot's JSONB blob. This means per-line persistent commentary (independent of snapshots) does not exist yet.

### Requirement 4: Branded monthly report output
**STATUS: ALREADY IMPLEMENTED (jsPDF)**

`MonthlyReportPDFService` in `monthly-report-pdf-service.ts` uses `jspdf` (v3.0.4) and `jspdf-autotable` (v5.0.2) to generate a multi-page PDF. It supports:
- Executive summary page (portrait)
- P&L detail tables (landscape)
- Full-year projection table
- Subscription and wages detail sections
- Multiple chart types (Revenue vs Expenses, Heatmap, Burn Rate, etc.)
- Custom layout editor (`PDFLayoutEditorModal`) that lets coaches drag/resize widgets

The PDF includes brand colours (navy, orange) and the report title. There is currently no dynamic logo injection from a business profile, but the layout is structured.

---

## Architecture Patterns

### Data Flow: Forecast → Monthly Report

```
financial_forecasts (active forecast)
  └── forecast_pl_lines.forecast_months  (JSONB: {"2026-01": 5000, "2026-02": 4800, ...})
                  ↓ matched by ID/name/fuzzy
account_mappings (xero_account_name → report_category)
  ↓
xero_pl_lines.monthly_values  (JSONB: same key format)
                  ↓
POST /api/monthly-report/generate
  → ReportLine { actual, budget (=forecast), variance_amount, ... }
  → GeneratedReport
                  ↓
BudgetVsActualTable (UI)
  Columns: Budget | Actual | Var($) | Var(%) | [YTD...] | [Prior Year]
```

### Commentary Data Flow

```
GeneratedReport (sections with expense lines)
  → page.tsx: fetchCommentary(report)
    → POST /api/monthly-report/commentary
      → Xero invoices + bank transactions for month
      → Group by vendor, sum by account code
      → Returns: { accountName: { vendor_summary, coach_note: '', is_edited: false } }
  → useState<VarianceCommentary>
  → CommentaryLine (editable coach_note)
  → "Save Draft" / "Finalise" button
    → POST /api/monthly-report/snapshot
      → monthly_report_snapshots.commentary (JSONB)
```

### Snapshot Persistence

`monthly_report_snapshots` table (Supabase, schema inferred from route):
- `business_id`, `report_month` — unique constraint (upsert key)
- `report_data` JSONB — full `GeneratedReport` object
- `summary` JSONB — summary metrics
- `commentary` JSONB — `VarianceCommentary` object (or null)
- `coach_notes` text — a separate free-text "report notes" field (not per-line)
- `status` — 'draft' | 'final'
- `is_draft` boolean

### FY Start Month: Hardcoded, Not Parameterized

**PITFALL:** `generate/route.ts` hardcodes July as FY start:
```typescript
function getFYStartMonth(fiscalYear: number): string {
  return `${fiscalYear - 1}-07`  // hardcoded July
}
```

Phase 13 added `fiscal_year_utils.ts` and parameterized the wizard, but the monthly report generate route was NOT updated. Same issue exists in `full-year/route.ts`. If a CY business (January FY start) uses monthly reporting, their YTD calculations will be wrong.

This is a known tech debt item that Phase 19 should either fix or explicitly defer.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF generation | Custom HTML-to-PDF | `jspdf` + `jspdf-autotable` (already installed) | Already integrated, layout editor built on top |
| Vendor name extraction | Custom regex | `extractVendorInfo()` from `@/lib/utils/vendor-normalization` | Already in use, handles edge cases |
| Fuzzy account name matching | Levenshtein or custom | `buildFuzzyLookup()` from `@/lib/utils/account-matching` | Already used in generate + full-year routes |
| FY date math | Custom date arithmetic | `generateFiscalMonthKeys()` / `getForecastFiscalYear()` from `@/lib/utils/fiscal-year-utils` | Phase 13 central utility, parameterized by `yearStartMonth` |
| Rate limiting | Custom in-memory | `checkRateLimit()` from `@/lib/utils/rate-limiter` | Already used in generate route |

---

## Common Pitfalls

### Pitfall 1: "Budget" vs "Forecast" Terminology Confusion
**What goes wrong:** The roadmap says "add a forecast column." The table already has a column called "Budget" which IS the forecast data. If a developer adds a NEW column called "Forecast" populated from the same source, the table will have duplicate data.
**Why it happens:** Product language uses "forecast" but the code uses "budget" as the column name because forecast data serves as the budget benchmark.
**How to avoid:** Clarify with the product owner: is the goal to (a) rename "Budget" to "Forecast" in the UI, or (b) add an additional column showing something different from the existing budget column?
**Recommendation:** The safest interpretation is a label rename in `BudgetVsActualTable.tsx` (the column header "Budget" becomes "Forecast") and confirming the data source is already correct.

### Pitfall 2: Commentary Lost on Report Regeneration
**What goes wrong:** Coach types notes for 3 expense accounts, then changes the month selector or clicks "Generate Report." Commentary state resets to `undefined`.
**Why it happens:** Commentary is React state, not persisted until explicit snapshot save. `handleMonthChange` calls `setCommentary(undefined)` by design. `handleGenerateReport` calls `fetchCommentary(result)` which overwrites state.
**How to avoid:** For Phase 19 commentary persistence: either (a) auto-save commentary to snapshot on every note edit, or (b) load persisted commentary from the existing snapshot when one exists for the selected month. Option (b) is already partially wired — `handleLoadHistorySnapshot` restores commentary from snapshot — but it only fires from the history tab, not on standard month selection.
**Fix:** In `handleMonthChange`, after clearing commentary, call `loadSnapshot(newMonth)` and restore `snapshot.commentary` if present.

### Pitfall 3: FY Start Month Hardcoded in Generate Route
**What goes wrong:** CY businesses (Jan-Dec year) get wrong YTD calculations. A business with FY starting January will show July-to-selected-month YTD instead of January-to-selected-month YTD.
**Root cause:** `getFYStartMonth()` in `generate/route.ts` always returns `${fiscalYear - 1}-07`. The `fiscal_year_utils.ts` central utility is not used.
**How to avoid:** Pass `fiscal_year_start` from `business_profiles` to the generate endpoint and use `generateFiscalMonthKeys()` for the YTD range. Same fix needed in `full-year/route.ts`.
**Phase 13 precedent:** The quarterly-summary route (Phase 17) uses `generateFiscalMonthKeys` from `fiscal-year-utils` correctly. The monthly report routes predate Phase 13 and were missed.

### Pitfall 4: Commentary Only Triggers for Expenses $500+ Over Budget
**What goes wrong:** Coach expects commentary for ALL expense lines, but only lines with `variance_amount <= -500` get commentary generated.
**Why it happens:** Intentional design in `page.tsx` fetchCommentary — filters to significant overruns only to reduce Xero API calls.
**Impact for Phase 19:** The "coach commentary per month" requirement may mean commentary on any line, not just overruns. Clarify scope before implementing.

### Pitfall 5: Dual Business ID in Forecast Lookup
**What goes wrong:** `generate/route.ts` tries both `business_profiles.id` and `businesses.id` when looking up the active forecast, because `financial_forecasts.business_id` references `business_profiles.id`, not `businesses.id`.
**Status:** Already handled in the generate route (lines 208-230). But if a new route is added for Phase 19, it MUST replicate this multi-format lookup pattern.
**Reference:** See `project_dual_id.md` memory note — this is a known architectural issue.

---

## Code Examples

### How forecast_months is read for budget column
```typescript
// Source: src/app/api/monthly-report/generate/route.ts lines 234-245
if (budgetForecast) {
  const { data: bLines } = await supabase
    .from('forecast_pl_lines')
    .select('id, account_name, category, forecast_months')
    .eq('forecast_id', budgetForecast.id)
  budgetPLLines = bLines || []
}
// ...
const budgetMonths: Record<string, number> = budgetLine.forecast_months || {}
const budget = budgetMonths[report_month] || 0
```

### How commentary is auto-generated and stored
```typescript
// Source: src/app/finances/monthly-report/page.tsx lines 321-368
// Only expense accounts $500+ over budget get commentary fetched
const fetchCommentary = useCallback(async (reportData: GeneratedReport) => {
  const expenseLines = reportData.sections
    .filter(s => expenseSections.includes(s.category))
    .flatMap(s => s.lines)
    .filter(line => line.variance_amount <= -500 && !line.is_budget_only)
  // ... POST /api/monthly-report/commentary
  // Returns: { [accountName]: { vendor_summary, coach_note: '', is_edited: false } }
}, [businessId])
```

### How commentary persists (via snapshot)
```typescript
// Source: src/app/finances/monthly-report/hooks/useMonthlyReport.ts lines 46-76
const saveSnapshot = useCallback(async (reportData, options) => {
  await fetch('/api/monthly-report/snapshot', {
    method: 'POST',
    body: JSON.stringify({
      // ...
      commentary: options?.commentary || null,  // VarianceCommentary object
    }),
  })
}, [])
```

### How to load persisted commentary on month change (fix pattern)
```typescript
// Pattern: in handleMonthChange, after clearing commentary,
// check if a snapshot exists and restore its commentary
const handleMonthChange = (month: string) => {
  setSelectedMonth(month)
  setCommentary(undefined)  // clear current
  clearSubscription()
  clearWages()
  // NEW: restore persisted commentary if snapshot exists
  loadSnapshot(month).then(snapshot => {
    if (snapshot?.commentary) {
      setCommentary(snapshot.commentary)
    }
  })
}
```

---

## Requirement Gap Analysis

| Roadmap Requirement | Current State | Gap |
|---------------------|--------------|-----|
| Monthly P&L reads forecast monthly data | DONE — `budget` column = `forecast_months` | None (or rename "Budget" → "Forecast" in header) |
| Actual vs Forecast variance by line item | DONE — `variance_amount` / `variance_percent` columns, color coded | None |
| Coach commentary per month | PARTIAL — ephemeral until snapshot saved, auto-generated for $500+ expense overruns only, coach_note editable | Persistence gap: notes lost on month change/page reload |
| Branded monthly report output | DONE — jsPDF with navy/orange branding, layout editor, multi-section | May want logo from business profile; confirm meets definition |

**Net assessment:** Phase 19 is ~80% done. The remaining 20% is:
1. Fix commentary persistence (load from snapshot on month change)
2. Clarify "forecast" vs "budget" column labeling — likely a rename
3. Potentially fix FY start month hardcoding (affects CY businesses)
4. Potentially add per-line commentary to PDF export (coach notes currently not in PDF)

---

## Environment Availability

Step 2.6: SKIPPED — Phase 19 is purely code changes. All dependencies (Supabase, Xero API, jsPDF) are already in use and confirmed working by prior phases.

---

## Validation Architecture

No test framework detected. Config `workflow.nyquist_validation` is absent, treated as enabled per rules, but this project has no test files or test configuration. Manual verification is the current pattern across all phases.

**Wave 0 Gaps:**
- No test files exist — validation is manual (consistent with project history)
- Verify approach: generate a report for a known month, check variance column = (Xero actual) - (forecast_months value), check commentary appears for $500+ expense overruns, check PDF contains coach notes if typed

---

## Sources

### Primary (HIGH confidence)
- Direct file inspection: `src/app/api/monthly-report/generate/route.ts` — full generate logic, forecast_months data flow
- Direct file inspection: `src/app/api/monthly-report/commentary/route.ts` — commentary generation, Xero transaction grouping
- Direct file inspection: `src/app/api/monthly-report/snapshot/route.ts` — persistence model, commentary JSONB column
- Direct file inspection: `src/app/finances/monthly-report/page.tsx` — state management, commentary lifecycle
- Direct file inspection: `src/app/finances/monthly-report/components/BudgetVsActualTable.tsx` — column structure, coach_note editing
- Direct file inspection: `src/app/finances/monthly-report/types.ts` — full type definitions
- Direct file inspection: `src/app/finances/monthly-report/services/monthly-report-service.ts` — utility functions

### Secondary (MEDIUM confidence)
- Inferred from `package.json`: jspdf 3.0.4, jspdf-autotable 5.0.2 — confirmed installed
- Inferred from Phase 13 work in `fiscal-year-utils.ts` and quarterly-summary route: FY parameterization pattern exists but was not applied to monthly report routes

---

## Metadata

**Confidence breakdown:**
- Existing implementation: HIGH — directly read all relevant files
- Gap analysis: HIGH — commentary lifecycle traced through full call chain
- FY hardcoding pitfall: HIGH — confirmed getFYStartMonth() uses literal `07`
- PDF capabilities: HIGH — MonthlyReportPDFService constructor and generate() read directly

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable codebase, no fast-moving dependencies)
