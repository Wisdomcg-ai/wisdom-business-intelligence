---
phase: 34
plan: 02a
type: execute
wave: 7
depends_on: ['34-01a']
files_modified:
  - src/lib/consolidation/cashflow.ts
  - src/lib/consolidation/cashflow.test.ts
  - src/app/api/monthly-report/consolidated-cashflow/route.ts
  - src/app/finances/monthly-report/components/ConsolidatedCashflowTab.tsx
  - src/app/finances/monthly-report/hooks/useConsolidatedCashflow.ts
  - src/app/finances/monthly-report/types.ts
  - src/app/finances/monthly-report/components/MonthlyReportTabs.tsx
  - src/app/finances/monthly-report/page.tsx
autonomous: false
requirements: [MLTE-02, MLTE-03, MLTE-04, MLTE-05]

must_haves:
  truths:
    - "buildConsolidatedCashflow(supabase, groupId, opts) calls generateCashflowForecast from src/lib/cashflow/engine.ts per member in parallel, then aggregates the per-member outputs into a combined 12-month forecast"
    - "Combined opening bank balance = Σ member opening bank balances (each non-AUD member's opening balance translated at closing-spot)"
    - "Combined closing bank balance = combined opening + Σ combined monthly cash movements"
    - "Monthly cash movements aggregate: for each month, combined = Σ member monthly cash movements (non-AUD members translated at monthly_average rate)"
    - "API /api/monthly-report/consolidated-cashflow returns the combined forecast + per-member breakdowns + any missing FX rates"
    - "ConsolidatedCashflowTab renders the combined 12-month cashflow table matching the user's IICT + Dragon PDF layout (aggregated view, no per-entity drill-down columns in V1)"
    - "Existing single-entity cashflow tab + engine behaviour unchanged (this plan imports generateCashflowForecast rather than modifying it)"
  artifacts:
    - path: src/lib/consolidation/cashflow.ts
      provides: "buildConsolidatedCashflow, combineMemberForecasts"
      contains: "export async function buildConsolidatedCashflow"
    - path: src/app/api/monthly-report/consolidated-cashflow/route.ts
      provides: "POST route for consolidated cashflow"
      contains: "export async function POST"
    - path: src/app/finances/monthly-report/components/ConsolidatedCashflowTab.tsx
      provides: "Tab rendering combined 12-month cashflow"
      contains: "ConsolidatedCashflowTab"
  key_links:
    - from: src/lib/consolidation/cashflow.ts
      to: src/lib/cashflow/engine
      via: "generateCashflowForecast invoked per member"
      pattern: "generateCashflowForecast"
    - from: src/lib/consolidation/cashflow.ts
      to: src/lib/consolidation/fx
      via: "translatePLAtMonthlyAverage for monthly cash movements; translateBSAtClosingSpot for opening/closing balances"
      pattern: "translatePLAtMonthlyAverage\\|translateBSAtClosingSpot"
---

<objective>
Iteration 34.2 — Consolidated Cashflow.

Final iteration of Phase 34. Aggregates per-member `src/lib/cashflow/engine.ts` outputs into a combined 12-month forecast. Does NOT reimplement cashflow math — wraps the existing engine.

Deliverables:
1. **Consolidation cashflow module** — `src/lib/consolidation/cashflow.ts` loops members, calls `generateCashflowForecast` once per member with the member's assumptions + PL + payroll (loaded per-member just like Iteration 34.0 loads PL), translates non-AUD outputs (opening balance at closing-spot; monthly movements at monthly-average), combines into a single 12-month table.
2. **API + UI** — `POST /api/monthly-report/consolidated-cashflow` + `ConsolidatedCashflowTab.tsx` + hook + page wiring.
3. **No intercompany cashflow eliminations in V1** — per RESEARCH.md line 858, intercompany loan cash movements appear in Financing activities and are left as-is for 34.2. This is acceptable because the CONTEXT.md cashflow format is aggregated (not per-entity column) — loans cancel at the aggregate level anyway.

**Reuse discipline:** DO NOT fork or modify `src/lib/cashflow/engine.ts`. This plan imports and orchestrates. If the cashflow engine's signature requires options this plan can't provide (e.g. forecast_id per member), adapt here by constructing those options from member-scoped data — do not invent parallel engines.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/34-dragon-multi-entity-consolidation/34-CONTEXT.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-RESEARCH.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-PATTERNS.md

@.planning/phases/34-dragon-multi-entity-consolidation/34-01a-SUMMARY.md

@src/lib/cashflow/engine.ts
@src/app/api/monthly-report/consolidated/route.ts
@src/app/finances/monthly-report/components/CashflowTab.tsx
@src/lib/consolidation/fx.ts

<interfaces>
<!-- Cashflow engine entry point — inspect at execution: -->
<!-- src/lib/cashflow/engine.ts exports generateCashflowForecast(...) returning CashflowForecastData -->
<!-- CashflowForecastData shape (inspect for exact fields): -->
```typescript
interface CashflowForecastMonth {
  month: string                 // 'YYYY-MM'
  cash_in: number
  cash_out: number
  net_movement: number
  opening_balance: number
  closing_balance: number
  // ...additional breakdown fields per existing engine
}

interface CashflowForecastData {
  months: CashflowForecastMonth[]
  opening_balance: number       // overall FY opening
  closing_balance: number       // overall FY closing
  // ...metadata
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Consolidated cashflow module + tests</name>
  <files>src/lib/consolidation/cashflow.ts, src/lib/consolidation/cashflow.test.ts</files>
  <read_first>
    - src/lib/cashflow/engine.ts (understand generateCashflowForecast signature, inputs, return shape)
    - src/lib/cashflow/engine.test.ts (existing test fixture style)
    - src/app/finances/monthly-report/components/CashflowTab.tsx (reveals how forecast is loaded currently — mirror the data-loading pattern for per-member)
    - src/app/finances/monthly-report/hooks/useMonthlyReport.ts and related hooks (how single-entity forecast/assumptions are loaded)
    - src/lib/consolidation/fx.ts (translateBSAtClosingSpot for opening balance; translatePLAtMonthlyAverage can be repurposed for monthly movements by treating the cashflow month map as a "monthly_values" field)
  </read_first>
  <behavior>
    - buildConsolidatedCashflow invokes generateCashflowForecast once per member (Promise.all parallel)
    - AUD-only group: combined opening_balance = Σ member opening_balance; combined months[i].net_movement = Σ member months[i].net_movement
    - HKD member: opening_balance translated at closing-spot rate for the FY start date; monthly cash_in/cash_out/net_movement translated at monthly-average rate per month
    - Missing closing-spot rate for opening balance → error (same behaviour as BS: cannot produce cashflow with untranslated balance)
    - Missing monthly-average rate for a month → value passes through untranslated (same as P&L path) + month flagged in response.fx_context.missing_rates
    - Aggregation function `combineMemberForecasts(forecasts, options)` is pure — can be unit-tested without Supabase
    - Combined forecast months.length === 12 (FY) and months array is ordered by month ascending
  </behavior>
  <action>
Create `src/lib/consolidation/cashflow.ts`:

```typescript
/**
 * Consolidated Cashflow Forecast (Iteration 34.2).
 *
 * Aggregates per-member cashflow forecasts produced by src/lib/cashflow/engine.ts
 * into a single combined 12-month forecast. Non-AUD members have their outputs
 * translated: opening balance at closing-spot, monthly movements at monthly-average.
 *
 * No intercompany cashflow eliminations in V1 — intercompany loans appear in Financing
 * activities and cancel at the aggregate level per RESEARCH.md.
 */

import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids'
import { generateCashflowForecast } from '@/lib/cashflow/engine'
// NOTE: the import path + export name may differ; inspect src/lib/cashflow/engine.ts at execution and adapt.
import { loadFxRates, loadClosingSpotRate, translatePLAtMonthlyAverage } from './fx'
import type { ConsolidationGroup, ConsolidationMember } from './types'

export interface ConsolidatedCashflowMonth {
  month: string
  cash_in: number
  cash_out: number
  net_movement: number
  opening_balance: number
  closing_balance: number
}

export interface ConsolidatedCashflow {
  group: { id: string; name: string; presentation_currency: string }
  fiscalYear: number
  months: ConsolidatedCashflowMonth[]
  opening_balance: number
  closing_balance: number
  byMember: Array<{
    member_id: string
    business_id: string
    display_name: string
    functional_currency: string
    months: ConsolidatedCashflowMonth[]
    opening_balance: number
    closing_balance: number
  }>
  fx_context: {
    rates_used: Record<string, number>
    missing_rates: Array<{ currency_pair: string; period: string }>
  }
  diagnostics: { members_loaded: number; processing_ms: number }
}

export interface BuildConsolidatedCashflowOpts {
  groupId: string
  fiscalYear: number
  fyMonths: readonly string[]
  fyStartDate: string                         // 'YYYY-MM-DD' — for closing-spot opening balance lookup
}

/**
 * Per-member cashflow forecast loader — loads the inputs the engine needs for ONE member.
 *
 * Signature of generateCashflowForecast (verified against src/lib/cashflow/engine.ts:292-299):
 *   generateCashflowForecast(
 *     plLines: PLLine[],
 *     payrollSummary: PayrollSummary | null,
 *     assumptions: CashflowAssumptions,
 *     forecast: FinancialForecast,
 *     plannedSpends: PlannedSpendItem[] = [],
 *     options: CashflowEngineOptions = {},   // { settings, xeroAccounts, capexByMonth }
 *   ): CashflowForecastData
 *
 * This loader returns the 6 required positional arguments in a structured object so
 * buildConsolidatedCashflow can spread them into the engine call. Mirror the
 * data-loading pattern used by src/app/finances/forecast/hooks/useCashflowForecast.ts
 * lines 200-241 (the canonical caller). Do NOT re-invent — copy the queries verbatim
 * scoped to the member's business_id.
 *
 * Checker revision #3: replaced `{} as any` stub with concrete signature wiring.
 */
interface MemberCashflowInputs {
  plLines: import('@/app/finances/forecast/types').PLLine[]
  payrollSummary: import('@/app/finances/forecast/types').PayrollSummary | null
  assumptions: import('@/app/finances/forecast/types').CashflowAssumptions
  forecast: import('@/app/finances/forecast/types').FinancialForecast
  plannedSpends: any[]               // PlannedSpendItem[] — shape defined locally in engine.ts:260; re-exported via useCashflowForecast for app usage
  options: {
    settings: import('@/lib/cashflow/account-resolution').AccountResolutionSettings | null
    xeroAccounts: import('@/lib/cashflow/account-resolution').XeroAccountRef[]
    capexByMonth: Record<string, number>
  }
}

async function loadMemberCashflowInputs(
  supabase: any,
  memberBusinessId: string,
): Promise<MemberCashflowInputs> {
  const ids = await resolveBusinessIds(supabase, memberBusinessId)

  // 1. Active forecast row for this member (there should be exactly one active forecast per business)
  const { data: forecast, error: fErr } = await supabase
    .from('financial_forecasts')
    .select('*')
    .in('business_id', ids.all)
    .eq('is_active', true)
    .maybeSingle()
  if (fErr || !forecast) {
    throw new Error(`[Consolidated Cashflow] No active forecast for member ${memberBusinessId}: ${fErr?.message ?? 'not found'}`)
  }

  // 2. Forecast P&L lines
  const { data: plLines, error: pErr } = await supabase
    .from('forecast_pl_lines')
    .select('*')
    .eq('forecast_id', forecast.id)
  if (pErr) throw new Error(`[Consolidated Cashflow] Failed to load plLines for ${memberBusinessId}: ${pErr.message}`)

  // 3. Cashflow assumptions — single row per forecast; fall back to getDefaultCashflowAssumptions() when absent
  const { data: assumptionsRow } = await supabase
    .from('forecast_assumptions')
    .select('*')
    .eq('forecast_id', forecast.id)
    .maybeSingle()
  // If the member has never saved assumptions, use the project's defaults
  const assumptions = assumptionsRow ?? (await import('@/lib/cashflow/engine')).getDefaultCashflowAssumptions()

  // 4. Payroll summary — optional; null when the member has no team members
  const { data: payrollRow } = await supabase
    .from('forecast_payroll_summary')     // verify exact table name at execution; falls back to null if absent
    .select('*')
    .eq('forecast_id', forecast.id)
    .maybeSingle()
  const payrollSummary: any = payrollRow ?? null

  // 5. Planned spends (capex + one-offs)
  const { data: plannedSpends } = await supabase
    .from('forecast_planned_spends')      // verify table name at execution
    .select('*')
    .eq('forecast_id', forecast.id)

  // 6. Xero accounts lookup for Calxa-standard settings (optional Phase 28.2 integration)
  const { data: xeroAccounts } = await supabase
    .from('xero_accounts')
    .select('*')
    .in('business_id', ids.all)

  // 7. CapEx by month — per business, per-month cash outflow for fixed assets (optional)
  // Pattern mirrors useCashflowForecast.ts:188-208 which calls /api/cashflow/capex
  // Skipped here — server-side context has direct DB access; inline query follows the route's logic
  const capexByMonth: Record<string, number> = {}     // executor: port the /api/cashflow/capex query inline OR fetch via internal call

  // 8. Calxa-standard account-resolution settings (optional Phase 28.2)
  const { data: settingsRow } = await supabase
    .from('cashflow_settings')             // verify at execution
    .select('*')
    .in('business_id', ids.all)
    .maybeSingle()

  return {
    plLines: (plLines ?? []) as any,
    payrollSummary,
    assumptions: assumptions as any,
    forecast: forecast as any,
    plannedSpends: (plannedSpends ?? []) as any,
    options: {
      settings: (settingsRow ?? null) as any,
      xeroAccounts: (xeroAccounts ?? []) as any,
      capexByMonth,
    },
  }
}

export async function buildConsolidatedCashflow(
  supabase: any,
  opts: BuildConsolidatedCashflowOpts,
): Promise<ConsolidatedCashflow> {
  const startedAt = Date.now()

  const { data: group } = await supabase
    .from('consolidation_groups').select('*').eq('id', opts.groupId).single()
  if (!group) throw new Error(`[Consolidated Cashflow] Group not found: ${opts.groupId}`)

  const { data: members } = await supabase
    .from('consolidation_group_members').select('*').eq('group_id', opts.groupId).order('display_order')
  const memberList = (members ?? []) as ConsolidationMember[]

  // Pre-load FX rates needed for all non-AUD members
  const ratesUsed: Record<string, number> = {}
  const missingRates: Array<{ currency_pair: string; period: string }> = []

  const memberForecasts = await Promise.all(memberList.map(async (m) => {
    const inputs = await loadMemberCashflowInputs(supabase, m.source_business_id)
    // generateCashflowForecast signature (engine.ts:292-299):
    //   (plLines, payrollSummary, assumptions, forecast, plannedSpends, options) → CashflowForecastData
    const raw = generateCashflowForecast(
      inputs.plLines,
      inputs.payrollSummary,
      inputs.assumptions,
      inputs.forecast,
      inputs.plannedSpends,
      inputs.options,
    )

    // Normalize the engine's output into ConsolidatedCashflowMonth shape for this plan
    const rawMonths: ConsolidatedCashflowMonth[] = (raw.months ?? []).map((x: any) => ({
      month: x.month,
      cash_in: x.cash_in ?? 0,
      cash_out: x.cash_out ?? 0,
      net_movement: x.net_movement ?? 0,
      opening_balance: x.opening_balance ?? 0,
      closing_balance: x.closing_balance ?? 0,
    }))
    const rawOpening = raw.opening_balance ?? 0
    const rawClosing = raw.closing_balance ?? 0

    if (m.functional_currency === group.presentation_currency) {
      return {
        member_id: m.id, business_id: m.source_business_id, display_name: m.display_name,
        functional_currency: m.functional_currency,
        months: rawMonths, opening_balance: rawOpening, closing_balance: rawClosing,
      }
    }

    // Non-AUD member — translate opening balance at closing-spot (as of FY start)
    const pair = `${m.functional_currency}/${group.presentation_currency}`
    const openingRate = await loadClosingSpotRate(supabase, pair, opts.fyStartDate)
    if (openingRate === null) {
      throw new Error(`[Consolidated Cashflow] Missing closing-spot rate for ${pair} on ${opts.fyStartDate} — cannot translate opening balance. Add via /admin/consolidation.`)
    }
    ratesUsed[`${pair}::opening`] = openingRate

    const monthlyRates = await loadFxRates(supabase, pair, 'monthly_average', opts.fyMonths as string[])
    for (const [m2, r] of monthlyRates.entries()) ratesUsed[`${pair}::${m2}`] = r

    // Re-use translatePLAtMonthlyAverage by shaping cash_in/cash_out/net_movement as monthly_values maps
    // (pragmatic reuse — the translator is math-agnostic to account_type)
    const translatedMonths: ConsolidatedCashflowMonth[] = rawMonths.map(rm => {
      const rate = monthlyRates.get(rm.month)
      if (rate === undefined) {
        missingRates.push({ currency_pair: pair, period: rm.month })
        return rm   // pass-through untranslated per FX contract
      }
      return {
        month: rm.month,
        cash_in: rm.cash_in * rate,
        cash_out: rm.cash_out * rate,
        net_movement: rm.net_movement * rate,
        // Running balances recomputed after translation using the opening rate for t=0 + monthly deltas:
        opening_balance: 0,    // filled in combine pass below
        closing_balance: 0,
      }
    })

    // Re-thread opening/closing balances after translation
    const translatedOpening = rawOpening * openingRate
    let running = translatedOpening
    const threadedMonths = translatedMonths.map(tm => {
      const open = running
      const close = open + tm.net_movement
      running = close
      return { ...tm, opening_balance: open, closing_balance: close }
    })
    const translatedClosing = running

    return {
      member_id: m.id, business_id: m.source_business_id, display_name: m.display_name,
      functional_currency: m.functional_currency,
      months: threadedMonths, opening_balance: translatedOpening, closing_balance: translatedClosing,
    }
  }))

  // Combine per-member → combined totals (sum per month)
  const combinedMonths: ConsolidatedCashflowMonth[] = opts.fyMonths.map(mk => ({
    month: mk, cash_in: 0, cash_out: 0, net_movement: 0, opening_balance: 0, closing_balance: 0,
  }))
  let combinedOpening = 0
  for (const mf of memberForecasts) {
    combinedOpening += mf.opening_balance
    for (const m of mf.months) {
      const idx = combinedMonths.findIndex(cm => cm.month === m.month)
      if (idx === -1) continue
      combinedMonths[idx].cash_in += m.cash_in
      combinedMonths[idx].cash_out += m.cash_out
      combinedMonths[idx].net_movement += m.net_movement
    }
  }
  // Re-thread combined opening/closing across the 12-month sequence
  let running = combinedOpening
  for (const cm of combinedMonths) {
    cm.opening_balance = running
    cm.closing_balance = running + cm.net_movement
    running = cm.closing_balance
  }
  const combinedClosing = running

  return {
    group: { id: group.id, name: group.name, presentation_currency: group.presentation_currency },
    fiscalYear: opts.fiscalYear,
    months: combinedMonths,
    opening_balance: combinedOpening,
    closing_balance: combinedClosing,
    byMember: memberForecasts,
    fx_context: { rates_used: ratesUsed, missing_rates: missingRates },
    diagnostics: { members_loaded: memberList.length, processing_ms: Date.now() - startedAt },
  }
}

/**
 * Pure combine helper — exposed for unit testing.
 */
export function combineMemberForecasts(
  members: Array<{ opening_balance: number; months: ConsolidatedCashflowMonth[] }>,
  fyMonths: readonly string[],
): { opening_balance: number; closing_balance: number; months: ConsolidatedCashflowMonth[] } {
  const combinedMonths: ConsolidatedCashflowMonth[] = fyMonths.map(mk => ({
    month: mk, cash_in: 0, cash_out: 0, net_movement: 0, opening_balance: 0, closing_balance: 0,
  }))
  let combinedOpening = 0
  for (const mf of members) {
    combinedOpening += mf.opening_balance
    for (const m of mf.months) {
      const idx = combinedMonths.findIndex(cm => cm.month === m.month)
      if (idx === -1) continue
      combinedMonths[idx].cash_in += m.cash_in
      combinedMonths[idx].cash_out += m.cash_out
      combinedMonths[idx].net_movement += m.net_movement
    }
  }
  let running = combinedOpening
  for (const cm of combinedMonths) {
    cm.opening_balance = running
    cm.closing_balance = running + cm.net_movement
    running = cm.closing_balance
  }
  return { opening_balance: combinedOpening, closing_balance: running, months: combinedMonths }
}
```

Create `src/lib/consolidation/cashflow.test.ts` — focused on `combineMemberForecasts` (pure function, no Supabase):

```typescript
import { describe, it, expect } from 'vitest'
import { combineMemberForecasts } from './cashflow'

const FY = ['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'] as const

function memberForecast(opening: number, monthlyNet: number): any {
  return {
    opening_balance: opening,
    months: FY.map(m => ({ month: m, cash_in: 0, cash_out: 0, net_movement: monthlyNet, opening_balance: 0, closing_balance: 0 })),
  }
}

describe('combineMemberForecasts', () => {
  it('sums opening balances across members', () => {
    const result = combineMemberForecasts([memberForecast(1000, 0), memberForecast(500, 0)], FY)
    expect(result.opening_balance).toBe(1500)
  })

  it('threads closing balances from combined opening + cumulative net', () => {
    const result = combineMemberForecasts([memberForecast(0, 100)], FY)
    expect(result.months[0].opening_balance).toBe(0)
    expect(result.months[0].closing_balance).toBe(100)
    expect(result.months[11].closing_balance).toBe(1200)   // 100 × 12 months
    expect(result.closing_balance).toBe(1200)
  })

  it('sums monthly movements across members per month', () => {
    const result = combineMemberForecasts([memberForecast(0, 100), memberForecast(0, 50)], FY)
    for (const m of result.months) {
      expect(m.net_movement).toBe(150)
    }
    expect(result.closing_balance).toBe(150 * 12)
  })
})
```
  </action>
  <verify>
    <automated>npx vitest run src/lib/consolidation/cashflow.test.ts --reporter=dot && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep "export async function buildConsolidatedCashflow\|export function combineMemberForecasts" src/lib/consolidation/cashflow.ts` returns 2 matches
    - `grep "generateCashflowForecast" src/lib/consolidation/cashflow.ts` returns >=1 match
    - `grep "translatePLAtMonthlyAverage\|loadClosingSpotRate\|loadFxRates" src/lib/consolidation/cashflow.ts` returns >=2 matches
    - `grep "resolveBusinessIds" src/lib/consolidation/cashflow.ts` returns >=1 match
    - **Checker revision #3 — loader is NOT a stub:** `grep "{} as any" src/lib/consolidation/cashflow.ts` returns 0 matches (stub placeholder removed)
    - **Engine call wires all 6 positional args:** `grep "inputs.plLines\|inputs.payrollSummary\|inputs.assumptions\|inputs.forecast\|inputs.plannedSpends\|inputs.options" src/lib/consolidation/cashflow.ts` returns >=6 matches
    - **Loader queries the 4 required tables:** `grep "financial_forecasts\|forecast_pl_lines\|forecast_assumptions" src/lib/consolidation/cashflow.ts` returns >=3 matches
    - `npx vitest run src/lib/consolidation/cashflow.test.ts` reports >=3 passing tests
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Cashflow consolidation module aggregates per-member forecasts, re-threads opening/closing across the combined FY sequence, handles HKD translation at closing-spot (opening) + monthly-average (movements). combineMemberForecasts pure helper unit-tested.</done>
</task>

<task type="auto">
  <name>Task 2: API route + hook + tab + page wiring</name>
  <files>src/app/api/monthly-report/consolidated-cashflow/route.ts, src/app/finances/monthly-report/hooks/useConsolidatedCashflow.ts, src/app/finances/monthly-report/components/ConsolidatedCashflowTab.tsx, src/app/finances/monthly-report/types.ts, src/app/finances/monthly-report/components/MonthlyReportTabs.tsx, src/app/finances/monthly-report/page.tsx</files>
  <read_first>
    - src/app/api/monthly-report/consolidated-bs/route.ts (from plan 01a — near-identical auth + stage tracking structure to clone)
    - src/app/finances/monthly-report/components/CashflowTab.tsx (single-entity cashflow UI — mirror table layout)
    - src/app/finances/monthly-report/hooks/useConsolidatedReport.ts + useConsolidatedBalanceSheet.ts (hook patterns)
    - src/lib/consolidation/cashflow.ts (from task 1)
  </read_first>
  <action>
1. Create `src/app/api/monthly-report/consolidated-cashflow/route.ts` — mirror the consolidated-bs route structure:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { checkRateLimit, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter'
import { generateFiscalMonthKeys, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'
import { buildConsolidatedCashflow } from '@/lib/consolidation/cashflow'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

export async function POST(request: NextRequest) {
  let stage = 'init'
  try {
    stage = 'auth'
    const authSupabase = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authSupabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { business_id, fiscal_year } = body
    if (!business_id || !fiscal_year) {
      return NextResponse.json({ error: 'business_id and fiscal_year are required' }, { status: 400 })
    }

    stage = 'rate_limit'
    const rl = checkRateLimit(createRateLimitKey('consolidated-cashflow', user.id), RATE_LIMIT_CONFIGS.report)
    if (!rl.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

    stage = 'resolve_group'
    const { data: group } = await supabase
      .from('consolidation_groups').select('id, business_id').eq('business_id', business_id).maybeSingle()
    if (!group) return NextResponse.json({ error: 'Consolidation group not found' }, { status: 404 })

    // Access check (same pattern as other consolidated routes)
    const { data: bizAccess } = await authSupabase
      .from('businesses').select('id').eq('id', group.business_id)
      .or(`owner_id.eq.${user.id},assigned_coach_id.eq.${user.id}`).maybeSingle()
    if (!bizAccess) {
      const { data: roleRow } = await authSupabase.from('system_roles').select('role').eq('user_id', user.id).maybeSingle()
      if (roleRow?.role !== 'super_admin') return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    stage = 'fetch_fy'
    const { data: parentProfile } = await supabase
      .from('business_profiles').select('fiscal_year_start').eq('business_id', group.business_id).maybeSingle()
    const yearStartMonth = parentProfile?.fiscal_year_start ?? DEFAULT_YEAR_START_MONTH
    const fyMonths = generateFiscalMonthKeys(fiscal_year, yearStartMonth) as readonly string[]
    const fyStartDate = `${fyMonths[0]}-01`

    stage = 'engine'
    const report = await buildConsolidatedCashflow(supabase, {
      groupId: group.id,
      fiscalYear: fiscal_year,
      fyMonths,
      fyStartDate,
    })
    return NextResponse.json({ success: true, report })
  } catch (err) {
    console.error('[Consolidated Cashflow] unhandled error, stage:', stage, err)
    return NextResponse.json({ error: 'Internal error', stage, detail: String(err) }, { status: 500 })
  }
}
```

2. Create `src/app/finances/monthly-report/hooks/useConsolidatedCashflow.ts` — clone useConsolidatedBalanceSheet shape, POST to `/api/monthly-report/consolidated-cashflow` with `{ business_id, fiscal_year }`.

3. Create `src/app/finances/monthly-report/components/ConsolidatedCashflowTab.tsx` — aggregated 12-month table (matching user's PDF aggregated cashflow layout):

```typescript
'use client'
// Renders a single combined 12-month table with columns:
// Month | Cash In | Cash Out | Net Movement | Opening Balance | Closing Balance
// Plus an optional "By member" breakdown at the bottom (collapsible <details>).
// Reuse fmt() helper; reuse the single-entity CashflowTab.tsx structure as reference.
```

4. Extend `src/app/finances/monthly-report/types.ts` with `'cashflow-consolidated'` in the ReportTab union.

5. Extend `src/app/finances/monthly-report/components/MonthlyReportTabs.tsx` with a new entry + `showConsolidatedCashflow?: boolean` prop.

6. Wire into `src/app/finances/monthly-report/page.tsx`:
   - Import + invoke `useConsolidatedCashflow(businessId)`
   - Render `<ConsolidatedCashflowTab .../>` when `activeTab === 'cashflow-consolidated'`
   - Pass `showConsolidatedCashflow={isConsolidationGroup === true}` to MonthlyReportTabs
   - Fetch when tab becomes active (pass `fiscalYear`)
  </action>
  <verify>
    <automated>npx tsc --noEmit && test -f src/app/api/monthly-report/consolidated-cashflow/route.ts && test -f src/app/finances/monthly-report/components/ConsolidatedCashflowTab.tsx && grep -q "'cashflow-consolidated'" src/app/finances/monthly-report/types.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep "export async function POST" src/app/api/monthly-report/consolidated-cashflow/route.ts` returns 1 match
    - `grep "buildConsolidatedCashflow" src/app/api/monthly-report/consolidated-cashflow/route.ts` returns 1 match
    - `grep "export function useConsolidatedCashflow" src/app/finances/monthly-report/hooks/useConsolidatedCashflow.ts` returns 1 match
    - `grep "'cashflow-consolidated'" src/app/finances/monthly-report/types.ts` returns 1 match
    - `grep "showConsolidatedCashflow\|ConsolidatedCashflowTab" src/app/finances/monthly-report/page.tsx` returns >=2 matches
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Full Iteration 34.2 surface wired: API + hook + tab + page. Single-entity cashflow tab + single-entity cashflow engine unchanged.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: [CHECKPOINT] End-to-end consolidated cashflow — Dragon + IICT 12-month forecast matches PDFs</name>
  <what-built>
- buildConsolidatedCashflow engine
- /api/monthly-report/consolidated-cashflow route
- ConsolidatedCashflowTab + hook + page wiring
- Phase 34 now complete (P&L + BS + Cashflow consolidation all shipped)
  </what-built>
  <how-to-verify>
1. Ensure HKD/AUD closing_spot rate for FY start date + monthly_average rates for each month in the reporting FY are entered via /admin/consolidation (or confirm Dragon AUD-only case works first).
2. Open /finances/monthly-report?business_id=&lt;dragon parent id&gt;&fiscal_year=2026
3. Click Consolidated Cashflow tab
4. Compare to Dragon Consolidated Cashflow PDF:
   - 12-month table
   - Combined opening balance = Dragon Roofing opening + Easy Hail opening
   - Monthly net movements sum across both members
   - Closing balance threads correctly month-to-month
5. Repeat for IICT; verify HKD translation:
   - Opening balance reflects HKD × closing_spot rate at FY start
   - Monthly movements reflect HKD × monthly_average rate per month
   - If any month's monthly_average is missing, FXRateMissingBanner shows on the tab

Confirm Phase 34 is complete: all three iterations delivered, all 5 MLTE requirements met, both Dragon and IICT consolidations usable day-to-day.

Type `approved` if cashflow output matches PDFs (within reasonable tolerance — $10 on combined totals). Type `issues: <description>` if anything blocks.
  </how-to-verify>
  <action>See how-to-verify below — this is a human-verified checkpoint. The executor MUST not perform implementation work in this task; it gates wave progression until the verifier types `approved`.</action>
  <verify>
    <automated>echo "Checkpoint requires human approval — no automated verification possible"</automated>
  </verify>
  <done>Checkpoint approved by human verifier (resume-signal received matching `approved`).</done>
  <resume-signal>approved — or — issues: &lt;describe&gt;</resume-signal>
</task>

</tasks>

<verification>
  <commands>
    - `npx vitest run --reporter=dot` — full suite green
    - `npx tsc --noEmit` — clean
    - Human-verify checkpoint: Dragon + IICT cashflow match PDFs
  </commands>
</verification>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client → POST /api/monthly-report/consolidated-cashflow | Untrusted body — business_id, fiscal_year |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-34-16 | Information Disclosure | POST /api/monthly-report/consolidated-cashflow | mitigate | Dual-client pattern + coach/super_admin guard (inherited from Iteration 34.0/34.1 routes) |
| T-34-17 | Denial of Service | Cashflow engine per member | mitigate | Existing checkRateLimit 'consolidated-cashflow' key; per-member forecast generation is bounded (12 months × N members) — capped by group member count (max ~5 in production) |
| T-34-18 | Integrity | Running-balance threading after FX | mitigate | combineMemberForecasts explicitly re-threads opening→closing in a unit-tested pure function; no silent mutation of per-month arrays |
</threat_model>

<success_criteria>
- Consolidated cashflow engine + pure combine helper + tests green
- API + hook + tab + page wired
- Dragon + IICT 12-month cashflow human-verified against PDFs
- Phase 34 COMPLETE — Iteration 34.0 + 34.1 + 34.2 all shipped
- 5 MLTE requirements satisfied: groups defined (MLTE-01), per-entity layout delivered (MLTE-02), account-type alignment with $0 fillers (MLTE-03), selector auto-loads consolidated view (MLTE-04), template system unchanged (MLTE-05)
</success_criteria>

<output>
After completion, create `.planning/phases/34-dragon-multi-entity-consolidation/34-02a-SUMMARY.md` + a phase-level `.planning/phases/34-dragon-multi-entity-consolidation/34-PHASE-SUMMARY.md` noting:
- Total files shipped across the phase
- Migrations applied
- All 5 MLTE requirements with evidence link to the verifying test/PDF page
- Deferred items (goodwill, minority interest, cross-FY consolidation, elim-rule UI — already documented in CONTEXT.md deferred list)
- Ready for Phase 35 (approval workflow can now snapshot consolidated reports via cfo_report_status.snapshot_data)
</output>
