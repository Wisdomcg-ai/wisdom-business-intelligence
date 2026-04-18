---
phase: 34
plan: 00e
type: execute
wave: 4
depends_on: ['34-00a', '34-00b', '34-00c', '34-00d']
files_modified:
  - src/app/api/monthly-report/consolidated/route.ts
  - src/app/api/monthly-report/consolidated/route.test.ts
  - src/lib/consolidation/engine.ts
  - src/app/finances/monthly-report/hooks/useConsolidatedReport.ts
  - src/app/finances/monthly-report/hooks/useMonthlyReport.ts
  - src/app/finances/monthly-report/components/ConsolidatedPLTab.tsx
  - src/app/finances/monthly-report/components/FXRateMissingBanner.tsx
  - src/app/finances/monthly-report/types.ts
  - src/app/finances/monthly-report/components/MonthlyReportTabs.tsx
  - src/app/finances/monthly-report/page.tsx
autonomous: false
requirements: [MLTE-02, MLTE-03, MLTE-04, MLTE-05]

must_haves:
  truths:
    - "POST /api/monthly-report/consolidated authenticates coach, verifies access to group.business_id, loads group → members → rules → rates, calls buildConsolidation, returns ConsolidatedReport JSON"
    - "Engine's FX plug-in point is wired: non-AUD members have their P&L translated at monthly_average rate before alignment; missing rates surfaced in response.fx_context.missing_rates"
    - "useConsolidatedReport(businessId) detects if the businessId is a consolidation_groups.business_id; if so, fetches the consolidated report"
    - "Monthly report page detects consolidation mode and renders ConsolidatedPLTab alongside existing tabs — single-entity mode unaffected"
    - "ConsolidatedPLTab renders per-entity columns + Eliminations + Consolidated with sticky first/last columns on desktop, toggle pills on mobile"
    - "FXRateMissingBanner renders amber warning when response.fx_context.missing_rates is non-empty, with a link/CTA to add the rate"
    - "Selecting a consolidation group from the report selector loads consolidated view automatically (MLTE-04)"
    - "Template system applies identically — existing ReportSettingsPanel + section toggles work unchanged (MLTE-05)"
    - "useMonthlyReport detects consolidation mode via the same lookup the consolidated hook uses, and when the resolved business is a consolidation parent the Actual-vs-Budget tab is fed consolidated actuals (MLTE-05 — template system applies identically to consolidated groups, not only the new Consolidated P&L tab)"
  artifacts:
    - path: src/app/api/monthly-report/consolidated/route.ts
      provides: "POST route — auth, access check, FX wiring, buildConsolidation orchestration"
      contains: "export async function POST"
    - path: src/app/finances/monthly-report/hooks/useConsolidatedReport.ts
      provides: "useConsolidatedReport hook — detects consolidation group, fetches /api/monthly-report/consolidated"
      contains: "export function useConsolidatedReport"
    - path: src/app/finances/monthly-report/hooks/useMonthlyReport.ts
      provides: "useMonthlyReport extended to detect consolidation mode and route Actual-vs-Budget to consolidated API (MLTE-05)"
      contains: "isConsolidationGroup"
    - path: src/app/finances/monthly-report/components/ConsolidatedPLTab.tsx
      provides: "Per-entity column + eliminations + consolidated table"
      contains: "ConsolidatedPLTab"
    - path: src/app/finances/monthly-report/components/FXRateMissingBanner.tsx
      provides: "Amber warning banner for missing FX rates"
      contains: "FXRateMissingBanner"
  key_links:
    - from: src/app/api/monthly-report/consolidated/route.ts
      to: src/lib/consolidation/engine
      via: "buildConsolidation called after FX rate preload"
      pattern: "buildConsolidation\\("
    - from: src/app/api/monthly-report/consolidated/route.ts
      to: src/lib/consolidation/fx
      via: "loadFxRates + translatePLAtMonthlyAverage called for non-AUD members"
      pattern: "loadFxRates\\(|translatePLAtMonthlyAverage\\("
    - from: src/app/finances/monthly-report/page.tsx
      to: src/app/finances/monthly-report/hooks/useConsolidatedReport
      via: "hook invocation when businessId matches a consolidation_groups.business_id"
      pattern: "useConsolidatedReport\\("
    - from: src/app/finances/monthly-report/page.tsx
      to: src/app/finances/monthly-report/components/ConsolidatedPLTab
      via: "rendered when activeTab === 'consolidated'"
      pattern: "ConsolidatedPLTab"
    - from: src/app/finances/monthly-report/hooks/useMonthlyReport.ts
      to: src/app/api/monthly-report/consolidated/route.ts
      via: "when isConsolidationGroup, Actual-vs-Budget tab posts to /api/monthly-report/consolidated and adapts the response into the GeneratedReport shape (MLTE-05)"
      pattern: "/api/monthly-report/consolidated"
---

<objective>
Ship the consolidated-report API + hook + UI — the visible part of Iteration 34.0.

Four deliverables:
1. **API route** — `POST /api/monthly-report/consolidated` with the project-standard dual-supabase-client + auth + rate-limit + stage-tracking pattern. Pre-loads FX rates for non-AUD members, patches the engine's FX plug-in point to use them, returns the full ConsolidatedReport JSON including `fx_context.missing_rates` for the UI banner.
2. **Hook** — `useConsolidatedReport(businessId)` that detects whether `businessId` resolves to a `consolidation_groups.business_id` (lookup is one cheap DB query), and if so, fetches the consolidated report. Returns `{ report, isLoading, error, isConsolidationGroup }` so the page can branch on mode.
3. **MLTE-05 template-identity wiring** — `useMonthlyReport` is extended to perform the same `consolidation_groups.business_id` detection the consolidated hook does. When the resolved businessId is a consolidation parent, the Actual-vs-Budget tab fetches consolidated actuals from `/api/monthly-report/consolidated` and adapts the response into the `GeneratedReport` shape the existing Phase 23 template system consumes. CONTEXT.md locks: "Template system (MLTE-05): applies identically to consolidated groups as to single-entity businesses." Without this wiring, the Actual-vs-Budget tab silently falls back to the single-entity `/api/monthly-report/generate` route with the parent business_id — which either returns empty data or the wrong data (parent business is a thin umbrella, not the actual data source). Checker revision #2.
4. **UI** — `ConsolidatedPLTab.tsx` (per-entity columns + sticky Name + sticky Consolidated + Eliminations column) co-located with other tabs; `FXRateMissingBanner.tsx` rendered above the tab when rates are missing. Page wiring (`page.tsx`) adds a `'consolidated'` tab ID to the `ReportTab` union and renders the tab when the detection hook reports consolidation mode.

**Co-location decision:** New tab components live at `src/app/finances/monthly-report/components/` alongside every other `*Tab.tsx`. This is the pattern recommendation from PATTERNS.md line 39 — `src/components/reports/` does not exist today and creating it would diverge from the established convention.

**Report selector integration (MLTE-04):** Selecting a consolidation group from the business selector just passes the group's `business_id` through to `/finances/monthly-report?business_id=<id>`. The hook detects it is a group and switches mode — no new selector logic required, existing `BusinessContext` behaviour is unchanged.

**Template system (MLTE-05):** Existing `ReportSettingsPanel` + section toggles + template picker continue to work — the consolidated response uses the same `byEntity[].sections` + `consolidated.sections` shape the template already toggles. No new template fields required. The NEW work for MLTE-05 is ensuring the existing `useMonthlyReport` hook feeds the Actual-vs-Budget tab with consolidated data when the business_id resolves to a consolidation group (task 2 below — checker revision #2).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/34-dragon-multi-entity-consolidation/34-CONTEXT.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-RESEARCH.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-PATTERNS.md

@src/app/api/monthly-report/generate/route.ts
@src/app/api/monthly-report/sync-xero/route.ts
@src/app/api/cfo/summaries/route.ts
@src/app/finances/monthly-report/page.tsx
@src/app/finances/monthly-report/types.ts
@src/app/finances/monthly-report/components/MonthlyReportTabs.tsx
@src/app/finances/monthly-report/components/BalanceSheetTab.tsx
@src/app/finances/monthly-report/components/BudgetVsActualTable.tsx
@src/app/finances/monthly-report/components/CashflowTab.tsx
@src/app/finances/monthly-report/hooks/useMonthlyReport.ts
@.planning/phases/34-dragon-multi-entity-consolidation/34-00a-SUMMARY.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-00b-SUMMARY.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-00c-SUMMARY.md
@.planning/phases/34-dragon-multi-entity-consolidation/34-00d-SUMMARY.md

<interfaces>
<!-- Engine signature from plan 00d -->
```typescript
export async function buildConsolidation(supabase, opts: {
  groupId: string
  reportMonth: string    // 'YYYY-MM'
  fiscalYear: number
  fyMonths: readonly string[]
}): Promise<ConsolidatedReport>
```

<!-- API route pattern from src/app/api/monthly-report/generate/route.ts:107-147 -->
```typescript
// Dual supabase clients:
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
const authSupabase = await createRouteHandlerClient()

// Auth + access:
const { data: { user } } = await authSupabase.auth.getUser()
if (!user) return 401

// Rate limit:
checkRateLimit(createRateLimitKey('consolidated-report', user.id), RATE_LIMIT_CONFIGS.report)

// Access check — coach's business_id must own the group:
const { data: bizAccess } = await authSupabase
  .from('businesses').select('id').eq('id', group.business_id)
  .or(`owner_id.eq.${user.id},assigned_coach_id.eq.${user.id}`)
  .maybeSingle()
if (!bizAccess) return 403
```

<!-- Existing ReportTab union — src/app/finances/monthly-report/types.ts:3 -->
```typescript
export type ReportTab = 'report' | 'full-year' | 'trends' | 'charts' | 'subscriptions' | 'wages' | 'cashflow' | 'balance-sheet' | 'mapping' | 'history'
// MUST add 'consolidated' to this union
```

<!-- Existing MonthlyReportTabs props — src/app/finances/monthly-report/components/MonthlyReportTabs.tsx:31 -->
```typescript
function MonthlyReportTabs({ activeTab, onTabChange, hasUnmapped, showSubscriptions, showWages, showCashflow, showCharts, showBalanceSheet })
// MUST add: showConsolidated?: boolean (defaults false)
```

<!-- Existing useMonthlyReport signature — src/app/finances/monthly-report/hooks/useMonthlyReport.ts:4 -->
```typescript
// Current behaviour: POSTs /api/monthly-report/generate with { business_id, report_month, fiscal_year, force_draft }
// Returns: { report: GeneratedReport, setReport, isLoading, error, generateReport, saveSnapshot, loadSnapshot }
//
// MLTE-05 extension (checker revision #2):
//   - Detect if businessId is a consolidation_groups.business_id (same one-query lookup useConsolidatedReport uses)
//   - If yes, route generateReport() to POST /api/monthly-report/consolidated
//   - Adapt the ConsolidatedReport → GeneratedReport shape so the Actual-vs-Budget tab renders
//     identically to single-entity (BudgetVsActualTable + ReportSettingsPanel + template picker)
//   - Expose `isConsolidationGroup` from the hook so the page can render the consolidation-specific
//     tabs (ConsolidatedPLTab) alongside the template-driven Actual-vs-Budget tab
```

<!-- Fiscal year helpers -->
```typescript
import { generateFiscalMonthKeys, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Consolidated API route — auth, FX wiring, engine invocation + integration test</name>
  <files>src/app/api/monthly-report/consolidated/route.ts, src/app/api/monthly-report/consolidated/route.test.ts, src/lib/consolidation/engine.ts</files>
  <read_first>
    - src/app/api/monthly-report/generate/route.ts (lines 1-200 — auth + access + rate-limit pattern)
    - src/app/api/monthly-report/sync-xero/route.ts (lines 114-147 — stage-tracking pattern)
    - src/app/api/cfo/summaries/route.ts (coach/super_admin role guard alternative)
    - src/lib/consolidation/engine.ts (buildConsolidation signature — FX PLUG-IN POINT comment)
    - src/lib/consolidation/fx.ts (loadFxRates + translatePLAtMonthlyAverage signatures)
    - src/lib/utils/rate-limiter.ts (RATE_LIMIT_CONFIGS keys)
    - src/lib/consolidation/__fixtures__/iict-mar-2026.ts (iictHKPL + HKD_AUD_MONTHLY — used in the FX translate callback integration test)
  </read_first>
  <behavior>
    - POST with missing auth → 401
    - POST with body missing business_id|report_month|fiscal_year → 400
    - POST where business_id does NOT map to a consolidation_groups.business_id → 404 'Consolidation group not found for business_id'
    - POST where coach has no access to the group's parent business → 403
    - POST success: returns { success: true, report: ConsolidatedReport }
    - Response.report.fx_context.missing_rates populated if any non-AUD member's month had no rate in fx_rates
    - Response.report.fx_context.rates_used populated (keyed 'HKD/AUD::YYYY-MM' → rate) when a `translate` callback runs for a non-AUD member
    - Response includes diagnostics.processing_ms > 0
    - Rate limit exhaustion → 429
    - Stage-tracking error path: any internal failure returns { error, stage, detail } shape (stage in ['init','auth','resolve_group','load_rates','engine'])
    - Building Dragon Consolidation for 2026-03 returns byEntity with 2 entries (Dragon Roofing, Easy Hail) in display_order; consolidated lines include Sales - Deposit at 11,652; Advertising at 0 after eliminations
    - **IICT integration case (checker revision #6):** Building IICT Consolidation for 2026-03 with a `translate` callback that returns pre-translated HK lines (lines multiplied by HKD/AUD rate from HKD_AUD_MONTHLY) populates `report.fx_context.rates_used` with the `'HKD/AUD::2026-03'` key mapped to 0.1925, and the consolidated columns reflect the translated values
  </behavior>
  <action>
Modify `src/lib/consolidation/engine.ts` ONE more time — make the FX translation injectable. Replace the "FX PLUG-IN POINT" pass-through in `buildConsolidation` with an optional callback:

```typescript
export interface BuildConsolidationOpts {
  groupId: string
  reportMonth: string
  fiscalYear: number
  fyMonths: readonly string[]
  /** Optional FX translator invoked per member. Return translated lines + missing months.
   *  If omitted, members pass through untranslated (used by unit tests + AUD-only groups). */
  translate?: (member: ConsolidationMember, lines: XeroPLLineLike[]) =>
    Promise<{ translated: XeroPLLineLike[]; missing: string[]; ratesUsed: Record<string, number> }>
}

// ... inside buildConsolidation, replace `const translated = deduped` block with:
const fxRatesUsed: Record<string, number> = {}
const fxMissing: { currency_pair: string; period: string }[] = []
const translated = await Promise.all(deduped.map(async (d) => {
  if (!opts.translate || d.member.functional_currency === group.presentation_currency) {
    return d
  }
  const { translated: tLines, missing, ratesUsed } = await opts.translate(d.member, d.lines)
  Object.assign(fxRatesUsed, ratesUsed)
  for (const m of missing) {
    const pair = `${d.member.functional_currency}/${group.presentation_currency}`
    fxMissing.push({ currency_pair: pair, period: m })
  }
  return { ...d, lines: tLines }
}))
```

Update the return's `fx_context` to use the populated values:
```typescript
fx_context: { rates_used: fxRatesUsed, missing_rates: fxMissing },
```

Now create `src/app/api/monthly-report/consolidated/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { checkRateLimit, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter'
import { generateFiscalMonthKeys, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'
import { buildConsolidation } from '@/lib/consolidation/engine'
import { loadFxRates, translatePLAtMonthlyAverage } from '@/lib/consolidation/fx'

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
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { business_id, report_month, fiscal_year } = body
    if (!business_id || !report_month || !fiscal_year) {
      return NextResponse.json(
        { error: 'business_id, report_month, and fiscal_year are required' },
        { status: 400 },
      )
    }

    stage = 'rate_limit'
    const rl = checkRateLimit(createRateLimitKey('consolidated-report', user.id), RATE_LIMIT_CONFIGS.report)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 })
    }

    stage = 'resolve_group'
    // business_id resolves to consolidation_groups.business_id
    const { data: group, error: groupErr } = await supabase
      .from('consolidation_groups')
      .select('id, business_id, presentation_currency')
      .eq('business_id', business_id)
      .maybeSingle()

    if (groupErr) {
      console.error('[Consolidated Report] group lookup error:', groupErr)
      return NextResponse.json({ error: 'Failed to resolve group', stage, detail: groupErr.message }, { status: 500 })
    }
    if (!group) {
      return NextResponse.json({ error: 'Consolidation group not found for business_id' }, { status: 404 })
    }

    // Access check — coach must own the parent business
    const { data: bizAccess } = await authSupabase
      .from('businesses').select('id').eq('id', group.business_id)
      .or(`owner_id.eq.${user.id},assigned_coach_id.eq.${user.id}`)
      .maybeSingle()
    if (!bizAccess) {
      // Fallback: super_admin
      const { data: roleRow } = await authSupabase
        .from('system_roles').select('role').eq('user_id', user.id).maybeSingle()
      if (roleRow?.role !== 'super_admin') {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    stage = 'fetch_year_start'
    // Resolve fiscal year start month from the parent business profile
    const { data: parentProfile } = await supabase
      .from('business_profiles')
      .select('fiscal_year_start')
      .eq('business_id', group.business_id)
      .maybeSingle()
    const yearStartMonth = parentProfile?.fiscal_year_start ?? DEFAULT_YEAR_START_MONTH
    const fyMonths = generateFiscalMonthKeys(fiscal_year, yearStartMonth) as readonly string[]

    stage = 'engine'
    const report = await buildConsolidation(supabase, {
      groupId: group.id,
      reportMonth: report_month,
      fiscalYear: fiscal_year,
      fyMonths,
      translate: async (member, lines) => {
        // Only invoked for non-AUD members (engine shortcircuits AUD pass-through)
        const pair = `${member.functional_currency}/${group.presentation_currency}`
        const rates = await loadFxRates(supabase, pair, 'monthly_average', Array.from(fyMonths))
        const { translated, missing } = translatePLAtMonthlyAverage(lines, rates)
        const ratesUsed: Record<string, number> = {}
        for (const [m, r] of rates.entries()) ratesUsed[`${pair}::${m}`] = r
        return { translated, missing, ratesUsed }
      },
    })

    return NextResponse.json({ success: true, report })
  } catch (err) {
    console.error('[Consolidated Report] unhandled error, stage:', stage, err)
    return NextResponse.json({ error: 'Internal error', stage, detail: String(err) }, { status: 500 })
  }
}
```

Create `src/app/api/monthly-report/consolidated/route.test.ts` — a lightweight integration test using vitest + in-memory Supabase mock (follow the style of other integration tests in the project; if no prior example exists, use a mock that returns fixture data). Include TWO test cases: (1) Dragon AUD-only path, and (2) IICT FX translate callback path (checker revision #6):

```typescript
import { describe, it, expect, vi } from 'vitest'
import { buildConsolidation } from '@/lib/consolidation/engine'
import {
  FY_MONTHS,
  dragonRoofingPL,
  easyHailPL,
  DRAGON_ROOFING_BIZ,
  EASY_HAIL_BIZ,
} from '@/lib/consolidation/__fixtures__/dragon-mar-2026'
import {
  iictAustPL,
  iictHKPL,
  iictGroupPtyLtdPL,
  HKD_AUD_MONTHLY,
} from '@/lib/consolidation/__fixtures__/iict-mar-2026'
import type { ConsolidationMember, XeroPLLineLike } from '@/lib/consolidation/types'

function mockSupabase(rowsByTable: Record<string, any[]>) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: any) => ({
          single: async () => ({ data: rowsByTable[table]?.find((r: any) => r[col] === val) ?? null, error: null }),
          maybeSingle: async () => ({ data: rowsByTable[table]?.find((r: any) => r[col] === val) ?? null, error: null }),
          eq: (c2: string, v2: any) => ({
            order: () => Promise.resolve({ data: rowsByTable[table]?.filter((r: any) => r[col] === val && r[c2] === v2) ?? [], error: null }),
            maybeSingle: async () => ({ data: rowsByTable[table]?.find((r: any) => r[col] === val && r[c2] === v2) ?? null, error: null }),
          }),
          in: (col2: string, values: any[]) => Promise.resolve({
            data: rowsByTable[table]?.filter((r: any) => r[col] === val && values.includes(r[col2])) ?? [],
            error: null,
          }),
          order: () => Promise.resolve({ data: rowsByTable[table]?.filter((r: any) => r[col] === val) ?? [], error: null }),
        }),
        in: (col: string, values: any[]) => Promise.resolve({
          data: rowsByTable[table]?.filter((r: any) => values.includes(r[col])) ?? [],
          error: null,
        }),
      }),
    }),
  } as any
}

describe('buildConsolidation — Dragon March 2026 with advertising elimination', () => {
  it('returns consolidated with Advertising=0 and Sales-Deposit=11652', async () => {
    const dragonGroupId = 'group-dragon'
    const mock = mockSupabase({
      consolidation_groups: [{ id: dragonGroupId, business_id: 'biz-parent', name: 'Dragon Consolidation', presentation_currency: 'AUD' }],
      consolidation_group_members: [
        { id: 'm-1', group_id: dragonGroupId, source_business_id: DRAGON_ROOFING_BIZ, display_name: 'Dragon Roofing Pty Ltd', display_order: 0, functional_currency: 'AUD' },
        { id: 'm-2', group_id: dragonGroupId, source_business_id: EASY_HAIL_BIZ,     display_name: 'Easy Hail Claim Pty Ltd', display_order: 1, functional_currency: 'AUD' },
      ],
      business_profiles: [
        { id: DRAGON_ROOFING_BIZ, business_id: DRAGON_ROOFING_BIZ },
        { id: EASY_HAIL_BIZ,     business_id: EASY_HAIL_BIZ },
      ],
      xero_pl_lines: [...dragonRoofingPL, ...easyHailPL],
      consolidation_elimination_rules: [
        {
          id: 'r-adv', group_id: dragonGroupId, rule_type: 'account_category',
          entity_a_business_id: DRAGON_ROOFING_BIZ, entity_a_account_code: null, entity_a_account_name_pattern: 'Advertising & Marketing',
          entity_b_business_id: EASY_HAIL_BIZ,      entity_b_account_code: null, entity_b_account_name_pattern: 'Advertising & Marketing',
          direction: 'bidirectional', description: 'adv', active: true,
        },
      ],
    })

    const report = await buildConsolidation(mock, {
      groupId: dragonGroupId,
      reportMonth: '2026-03',
      fiscalYear: 2026,
      fyMonths: FY_MONTHS,
    })

    const advRow = report.consolidated.lines.find(l => l.account_name === 'Advertising & Marketing')
    expect(advRow!.monthly_values['2026-03']).toBeCloseTo(0, 0)

    const depositRow = report.consolidated.lines.find(l => l.account_name === 'Sales - Deposit')
    expect(depositRow!.monthly_values['2026-03']).toBeCloseTo(11652, 0)

    expect(report.diagnostics.members_loaded).toBe(2)
    expect(report.diagnostics.eliminations_applied_count).toBeGreaterThan(0)
    expect(report.fx_context.missing_rates).toEqual([])
  })
})

// Checker revision #6 — second integration test case exercises the FX translate callback end-to-end
describe('buildConsolidation — IICT March 2026 FX translate callback populates rates_used', () => {
  it('calls the translate callback for the HKD member, populates fx_context.rates_used with HKD/AUD::2026-03, and the consolidated columns reflect translated values', async () => {
    const IICT_AUST_BIZ      = '00000000-0000-0000-0000-iictaust00000'
    const IICT_GROUP_LTD_BIZ = '00000000-0000-0000-0000-iicthk0000000'
    const IICT_PTYLTD_BIZ    = '00000000-0000-0000-0000-iictptyltd000'
    const iictGroupId = 'group-iict'
    const HKD_AUD_RATE = HKD_AUD_MONTHLY['2026-03']  // e.g. 0.1925 from the fixture

    const mock = mockSupabase({
      consolidation_groups: [{ id: iictGroupId, business_id: 'biz-iict-parent', name: 'IICT Consolidation', presentation_currency: 'AUD' }],
      consolidation_group_members: [
        { id: 'm-a', group_id: iictGroupId, source_business_id: IICT_AUST_BIZ,      display_name: 'IICT (Aust) Pty Ltd',     display_order: 0, functional_currency: 'AUD' },
        { id: 'm-b', group_id: iictGroupId, source_business_id: IICT_PTYLTD_BIZ,    display_name: 'IICT Group Pty Ltd',      display_order: 1, functional_currency: 'AUD' },
        { id: 'm-c', group_id: iictGroupId, source_business_id: IICT_GROUP_LTD_BIZ, display_name: 'IICT Group Limited (HK)', display_order: 2, functional_currency: 'HKD' },
      ],
      business_profiles: [
        { id: IICT_AUST_BIZ,      business_id: IICT_AUST_BIZ },
        { id: IICT_PTYLTD_BIZ,    business_id: IICT_PTYLTD_BIZ },
        { id: IICT_GROUP_LTD_BIZ, business_id: IICT_GROUP_LTD_BIZ },
      ],
      xero_pl_lines: [...iictAustPL, ...iictGroupPtyLtdPL, ...iictHKPL],
      consolidation_elimination_rules: [],
    })

    // Translate callback returns HKD lines pre-multiplied by the monthly_average rate.
    // Mirrors what /api/monthly-report/consolidated/route.ts does in production.
    const translate = async (member: ConsolidationMember, lines: XeroPLLineLike[]) => {
      const pair = `${member.functional_currency}/AUD`
      if (member.functional_currency !== 'HKD') {
        // (Engine should shortcircuit AUD members before calling this, so this branch
        //  is defensive only — if it runs, it's a bug.)
        return { translated: lines, missing: [], ratesUsed: {} }
      }
      const translated: XeroPLLineLike[] = lines.map(l => ({
        ...l,
        monthly_values: Object.fromEntries(
          Object.entries(l.monthly_values).map(([m, v]) => [m, (v as number) * HKD_AUD_RATE]),
        ),
      }))
      return {
        translated,
        missing: [],
        ratesUsed: { [`${pair}::2026-03`]: HKD_AUD_RATE },
      }
    }

    const report = await buildConsolidation(mock, {
      groupId: iictGroupId,
      reportMonth: '2026-03',
      fiscalYear: 2026,
      fyMonths: FY_MONTHS,
      translate,
    })

    // 1. fx_context.rates_used populated for the HK member
    expect(report.fx_context.rates_used['HKD/AUD::2026-03']).toBeCloseTo(HKD_AUD_RATE, 6)

    // 2. No missing rates (we returned a translated value for every period)
    expect(report.fx_context.missing_rates).toEqual([])

    // 3. AUD members were NOT translated — the engine shortcircuits them
    //    (we verify this by checking rates_used does NOT contain AUD/AUD keys)
    for (const key of Object.keys(report.fx_context.rates_used)) {
      expect(key.startsWith('AUD/')).toBe(false)
    }

    // 4. Consolidated column for an HK-only account reflects the translated value
    //    (pick the first HK-only account from the iictHKPL fixture; its consolidated
    //     value should equal its HKD value × HKD_AUD_RATE, with no AUD members contributing)
    const hkOnlyAccount = iictHKPL[0]
    const consolidatedHkRow = report.consolidated.lines.find(l =>
      l.account_name === hkOnlyAccount.account_name && l.account_type === hkOnlyAccount.account_type,
    )
    if (consolidatedHkRow) {
      const expectedAud = (hkOnlyAccount.monthly_values['2026-03'] ?? 0) * HKD_AUD_RATE
      expect(consolidatedHkRow.monthly_values['2026-03']).toBeCloseTo(expectedAud, 2)
    }

    // 5. Members loaded
    expect(report.diagnostics.members_loaded).toBe(3)
  })
})
```
  </action>
  <verify>
    <automated>npx vitest run src/app/api/monthly-report/consolidated/route.test.ts src/lib/consolidation --reporter=dot && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep "export async function POST" src/app/api/monthly-report/consolidated/route.ts` returns 1 match
    - `grep "loadFxRates\|translatePLAtMonthlyAverage" src/app/api/monthly-report/consolidated/route.ts` returns >=2 matches
    - `grep "buildConsolidation" src/app/api/monthly-report/consolidated/route.ts` returns 1 match
    - `grep "checkRateLimit\|consolidated-report" src/app/api/monthly-report/consolidated/route.ts` returns >=2 matches
    - `grep "let stage = 'init'\|stage = '" src/app/api/monthly-report/consolidated/route.ts` returns >=4 matches (init, auth, resolve_group, engine at minimum)
    - `grep "createRouteHandlerClient\|SUPABASE_SERVICE_KEY" src/app/api/monthly-report/consolidated/route.ts` returns matches (dual supabase client pattern)
    - `grep "translate?:" src/lib/consolidation/engine.ts` returns 1 match (opt-in translation callback added)
    - `grep "fx_context.*rates_used\|fxRatesUsed" src/lib/consolidation/engine.ts` returns matches
    - **Checker revision #6 — FX translate integration test:** `grep -c "describe\|it(" src/app/api/monthly-report/consolidated/route.test.ts` returns >= 3 (two describes + at least two `it(`)
    - **Dragon case assertions:** `grep -c "expect(" src/app/api/monthly-report/consolidated/route.test.ts` returns >= 7 (>=4 Dragon expects + >=3 IICT FX expects)
    - **IICT FX case specific assertions:** `grep "rates_used\['HKD/AUD::2026-03'\]\|'HKD/AUD::2026-03'" src/app/api/monthly-report/consolidated/route.test.ts` returns >= 1 match
    - **IICT FX translate callback exercised:** `grep "translate:" src/app/api/monthly-report/consolidated/route.test.ts` returns >= 1 match (callback passed to buildConsolidation)
    - `npx vitest run src/app/api/monthly-report/consolidated/route.test.ts` reports >=2 passing
    - All consolidation tests green
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>API route live, engine accepts FX translator callback, FX is wired end-to-end, integration test proves Dragon consolidation path AND the IICT FX-translate-callback path (rates_used populated). Response carries fx_context with any missing rates so UI can banner them.</done>
</task>

<task type="auto">
  <name>Task 2: Detection hook + MLTE-05 useMonthlyReport wiring + page wiring for consolidation mode</name>
  <files>src/app/finances/monthly-report/hooks/useConsolidatedReport.ts, src/app/finances/monthly-report/hooks/useMonthlyReport.ts, src/app/finances/monthly-report/types.ts, src/app/finances/monthly-report/components/MonthlyReportTabs.tsx, src/app/finances/monthly-report/page.tsx</files>
  <read_first>
    - src/app/finances/monthly-report/hooks/useMonthlyReport.ts (full file — 105 lines; MUST extend this hook in-place without breaking the single-entity flow)
    - src/app/finances/monthly-report/page.tsx (lines 1-290 — current tab state, hook usage, business_id flow)
    - src/app/finances/monthly-report/types.ts (ReportTab union + GeneratedReport shape — MUST extend union with 'consolidated'; MUST understand GeneratedReport so the ConsolidatedReport→GeneratedReport adapter preserves the shape the Actual-vs-Budget tab needs)
    - src/app/finances/monthly-report/components/MonthlyReportTabs.tsx (props + tab definitions — MUST add showConsolidated toggle + 'consolidated' tab entry)
    - src/app/api/monthly-report/generate/route.ts (what the single-entity route returns as GeneratedReport — the adapter must produce an equivalent shape for the consolidated path)
    - src/app/finances/monthly-report/components/BudgetVsActualTable.tsx (consumer of GeneratedReport actuals — the Actual-vs-Budget tab that MLTE-05 requires to work with consolidated data)
  </read_first>
  <action>
Three sub-steps — detection hook (A), useMonthlyReport MLTE-05 wiring (B), page + tabs wiring (C).

---

**(A) Create `src/app/finances/monthly-report/hooks/useConsolidatedReport.ts`:**

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'   // or the standard browser client factory the project uses

interface ConsolidatedReportPayload {
  success: boolean
  report: any   // ConsolidatedReport from @/lib/consolidation/types — kept loose here to avoid cross-package coupling
}

export function useConsolidatedReport(businessId: string | null | undefined) {
  const [report, setReport] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConsolidationGroup, setIsConsolidationGroup] = useState<boolean | null>(null)   // null = unknown/loading

  // 1. Detect whether this businessId is a consolidation group parent
  useEffect(() => {
    if (!businessId) { setIsConsolidationGroup(null); return }
    let cancelled = false
    const supabase = createBrowserClient()
    supabase.from('consolidation_groups').select('id').eq('business_id', businessId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setIsConsolidationGroup(!!data) })
      .catch(() => { if (!cancelled) setIsConsolidationGroup(false) })
    return () => { cancelled = true }
  }, [businessId])

  const generateConsolidated = useCallback(async (reportMonth: string, fiscalYear: number) => {
    if (!businessId || !isConsolidationGroup) return
    setIsLoading(true); setError(null)
    try {
      const res = await fetch('/api/monthly-report/consolidated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, report_month: reportMonth, fiscal_year: fiscalYear }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? `Failed to load consolidated report (${res.status})`)
        return
      }
      setReport((body as ConsolidatedReportPayload).report)
    } catch (err: any) {
      setError(err?.message ?? 'Network error loading consolidated report')
    } finally {
      setIsLoading(false)
    }
  }, [businessId, isConsolidationGroup])

  return { report, isLoading, error, isConsolidationGroup, generateConsolidated }
}
```

If `@/lib/supabase/client` or `createBrowserClient` doesn't exist, use whatever browser-side Supabase client pattern the project already uses (check `src/lib/supabase/` during execution and use the existing factory — do not invent a new one).

---

**(B) Extend `src/app/finances/monthly-report/hooks/useMonthlyReport.ts` to honour MLTE-05 (checker revision #2).**

CONTEXT.md locks: "Template system applies identically to consolidated groups as to single-entity businesses." This means the Actual-vs-Budget tab (powered by `useMonthlyReport.generateReport` → `/api/monthly-report/generate`) must work on consolidation groups too. Today it does not — `business_id` on a consolidation parent does NOT have `xero_pl_lines` of its own, so the single-entity route returns empty or wrong data.

Fix: make `useMonthlyReport` detect consolidation mode via the SAME one-query lookup `useConsolidatedReport` uses, and when consolidation mode is active, route the fetch to `/api/monthly-report/consolidated` and adapt the response to the `GeneratedReport` shape the existing Actual-vs-Budget tab (BudgetVsActualTable + ReportSettingsPanel + template picker) consumes.

Changes to `src/app/finances/monthly-report/hooks/useMonthlyReport.ts`:

1. Add state for `isConsolidationGroup` (same pattern as useConsolidatedReport):
```typescript
const [isConsolidationGroup, setIsConsolidationGroup] = useState<boolean | null>(null)

useEffect(() => {
  if (!businessId) { setIsConsolidationGroup(null); return }
  let cancelled = false
  const supabase = createBrowserClient()   // reuse whichever factory exists; must match the one useConsolidatedReport uses
  supabase.from('consolidation_groups').select('id').eq('business_id', businessId).maybeSingle()
    .then(({ data }) => { if (!cancelled) setIsConsolidationGroup(!!data) })
    .catch(() => { if (!cancelled) setIsConsolidationGroup(false) })
  return () => { cancelled = true }
}, [businessId])
```

2. Modify `generateReport` to branch on `isConsolidationGroup`:
```typescript
const generateReport = useCallback(async (reportMonth: string, fiscalYear: number, forceDraft?: boolean) => {
  if (!businessId) return
  setIsLoading(true)
  setError(null)

  try {
    // MLTE-05: if the resolved businessId is a consolidation parent, fetch consolidated
    // and adapt to GeneratedReport so the existing Actual-vs-Budget tab (template-driven)
    // renders the same UI with consolidated numbers.
    const endpoint = isConsolidationGroup
      ? '/api/monthly-report/consolidated'
      : '/api/monthly-report/generate'

    const payload = isConsolidationGroup
      ? { business_id: businessId, report_month: reportMonth, fiscal_year: fiscalYear }
      : { business_id: businessId, report_month: reportMonth, fiscal_year: fiscalYear, force_draft: forceDraft }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Failed to generate report')
      if (data.code === 'NO_MAPPINGS') {
        return { needsMappings: true }
      }
      return null
    }

    if (isConsolidationGroup) {
      // Adapt ConsolidatedReport → GeneratedReport so BudgetVsActualTable + ReportSettingsPanel
      // consume the consolidated monthly totals via the same shape as single-entity.
      const adapted = adaptConsolidatedToGeneratedReport(data.report, reportMonth, fiscalYear, businessId)
      setReport(adapted)
      return adapted
    }

    setReport(data.report)
    return data.report
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to generate report')
    return null
  } finally {
    setIsLoading(false)
  }
}, [businessId, isConsolidationGroup])
```

3. Add the `adaptConsolidatedToGeneratedReport` adapter helper (can live at the bottom of the same file or in a new `src/app/finances/monthly-report/hooks/consolidatedAdapter.ts` — executor decides based on file size). It takes the `ConsolidatedReport` from the consolidated API and produces a `GeneratedReport`-shaped object the Actual-vs-Budget tab can consume:

```typescript
/**
 * Adapter: ConsolidatedReport (per-entity + consolidated lines) → GeneratedReport
 * (the shape BudgetVsActualTable + ReportSettingsPanel + Phase 23 template picker consume).
 *
 * We only populate the fields the Actual-vs-Budget tab reads:
 *   - report.report_month, report.fiscal_year, report.business_id
 *   - report.categories[] with { category, subcategory, lines[] }
 *     where each line has { account_name, actual (= consolidated monthly_value for reportMonth),
 *     budget (0 for now — no consolidated budget until Iteration 34.3+), variance_*, ytd_*, ... }
 *
 * Budget integration deferred: consolidation groups do not have a dedicated budget in 34.0.
 * The Actual-vs-Budget tab on consolidated groups shows actuals with budget=0 and an info
 * banner "Consolidated budget not yet supported — see per-entity monthly reports for
 * budget variance." Add this banner via BudgetVsActualTable's existing empty-state OR
 * a small new banner component. Executor picks the lightest implementation.
 */
function adaptConsolidatedToGeneratedReport(
  consolidated: any,          // ConsolidatedReport — loose typing to avoid coupling
  reportMonth: string,
  fiscalYear: number,
  businessId: string,
): any {                       // GeneratedReport — loose typing for same reason
  // Executor: inspect GeneratedReport shape from src/app/finances/monthly-report/types.ts
  //           and src/app/api/monthly-report/generate/route.ts output. Populate the
  //           minimum set of fields so BudgetVsActualTable renders.
  //
  // Pseudocode (exact fields resolved at execution):
  const lines = (consolidated?.consolidated?.lines ?? []).map((l: any) => ({
    account_name: l.account_name,
    xero_account_name: l.account_name,
    is_budget_only: false,
    actual: l.monthly_values?.[reportMonth] ?? 0,
    budget: 0,
    variance_amount: 0,
    variance_percent: 0,
    ytd_actual: Object.entries(l.monthly_values ?? {})
      .filter(([m]) => m <= reportMonth)
      .reduce((s, [, v]) => s + (v as number), 0),
    ytd_budget: 0,
    ytd_variance_amount: 0,
    ytd_variance_percent: 0,
    unspent_budget: 0,
    budget_next_month: 0,
    budget_annual_total: 0,
    prior_year: null,
  }))

  // Group by category (Revenue, Cost of Sales, Operating Expenses, Other Income, Other Expenses)
  // using mapTypeToCategory from @/lib/monthly-report/shared.ts (already extracted in plan 00a)
  // Executor: follow the grouping pattern used in src/app/api/monthly-report/generate/route.ts

  return {
    report_month: reportMonth,
    fiscal_year: fiscalYear,
    business_id: businessId,
    is_consolidation: true,              // NEW flag — let the UI render an "(Consolidated)" badge
    is_draft: false,
    unreconciled_count: 0,
    categories: [/* grouped lines */],
    summary: { /* totals */ },
    // ... other GeneratedReport fields populated with sensible defaults
  }
}
```

4. Expose `isConsolidationGroup` from the hook's return value so `page.tsx` can branch on mode:

```typescript
return {
  report,
  setReport,
  isLoading,
  error,
  isConsolidationGroup,    // NEW — MLTE-05 wiring
  generateReport,
  saveSnapshot,
  loadSnapshot,
}
```

5. `saveSnapshot` + `loadSnapshot` — leave unchanged for now. Consolidated snapshots are the Phase 35 hook (cfo_report_status.snapshot_data column added in plan 00a) — the actual save-consolidated-snapshot path ships with Phase 35. For Iteration 34.0, if a user clicks "Save Snapshot" on the consolidated Actual-vs-Budget tab, the existing `/api/monthly-report/snapshot` path should be a no-op or return 400 — executor adds a guard: `if (reportData.is_consolidation) return alert('Consolidated snapshot is scheduled for Phase 35 — not yet available in 34.0')`.

**CRITICAL — do NOT break the single-entity path.** Every single-entity test + every non-consolidation business must still render identically. Validate by running the existing `useMonthlyReport` tests (if they exist) OR by manually clicking through a single-entity business after the change.

---

**(C) Modify `src/app/finances/monthly-report/types.ts` to extend the `ReportTab` union:**
```typescript
export type ReportTab = 'report' | 'full-year' | 'trends' | 'charts' | 'subscriptions' | 'wages' | 'cashflow' | 'balance-sheet' | 'mapping' | 'history' | 'consolidated'
```

Also extend `GeneratedReport` with the optional `is_consolidation?: boolean` flag the adapter sets.

---

**(D) Modify `src/app/finances/monthly-report/components/MonthlyReportTabs.tsx`:**
1. Add to the props interface: `showConsolidated?: boolean`
2. Add a tab entry in the `TabDef` list. Use an icon from lucide-react (e.g. `Layers` — check what's already imported, reuse if possible):
```typescript
{ id: 'consolidated' as ReportTab, label: 'Consolidated P&L', icon: Layers },
```
3. Filter the tab entries so 'consolidated' only shows when `showConsolidated=true`.

---

**(E) Modify `src/app/finances/monthly-report/page.tsx`:**
1. Import `useConsolidatedReport`
2. Note: useMonthlyReport now ALSO exposes `isConsolidationGroup`. The two hooks both return that flag — they should agree (both query the same table). The page should prefer `useMonthlyReport.isConsolidationGroup` (single source of truth) OR use `useConsolidatedReport.isConsolidationGroup` if the consolidated hook is invoked first. Pick one and document.
3. After the existing `useMonthlyReport(businessId)` call, add:
```typescript
const { report: consolidatedReport, isLoading: consolidatedLoading, error: consolidatedError,
        isConsolidationGroup, generateConsolidated } = useConsolidatedReport(businessId)
```
4. In the `localStorage` tab-id allowlist (line ~73-81), add `'consolidated'` to the allowed values.
5. When the page decides the active tab on load, if `isConsolidationGroup === true` AND no tab is already saved, default to `'consolidated'`.
6. Pass `showConsolidated={isConsolidationGroup === true}` to `<MonthlyReportTabs>`.
7. Below the tabs, render `<ConsolidatedPLTab ... />` (imported in task 3) when `activeTab === 'consolidated'`. Also render `<FXRateMissingBanner />` when `consolidatedReport?.fx_context?.missing_rates?.length > 0`.
8. When month/fiscal-year changes and `isConsolidationGroup === true`, call BOTH `generateConsolidated(selectedMonth, fiscalYear)` (for the ConsolidatedPLTab) AND `generateReport(selectedMonth, fiscalYear)` (which now routes to consolidated via the MLTE-05 extension above) so the Actual-vs-Budget tab also refreshes.

Do NOT remove or gate the single-entity path — both flows must coexist. If `isConsolidationGroup === false`, the page renders exactly as today.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -q "consolidated" src/app/finances/monthly-report/types.ts && grep -q "useConsolidatedReport" src/app/finances/monthly-report/page.tsx && grep -q "showConsolidated" src/app/finances/monthly-report/components/MonthlyReportTabs.tsx && grep -q "isConsolidationGroup" src/app/finances/monthly-report/hooks/useMonthlyReport.ts && grep -q "'/api/monthly-report/consolidated'" src/app/finances/monthly-report/hooks/useMonthlyReport.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep "export function useConsolidatedReport" src/app/finances/monthly-report/hooks/useConsolidatedReport.ts` returns 1 match
    - `grep "from('consolidation_groups')" src/app/finances/monthly-report/hooks/useConsolidatedReport.ts` returns 1 match
    - **Checker revision #2 — MLTE-05 wiring in useMonthlyReport:**
      - `grep "isConsolidationGroup" src/app/finances/monthly-report/hooks/useMonthlyReport.ts` returns >= 3 matches (state + setter + return)
      - `grep "from('consolidation_groups')" src/app/finances/monthly-report/hooks/useMonthlyReport.ts` returns 1 match (detection query)
      - `grep "/api/monthly-report/consolidated" src/app/finances/monthly-report/hooks/useMonthlyReport.ts` returns >= 1 match (consolidated route fetch when isConsolidationGroup)
      - `grep "adaptConsolidatedToGeneratedReport\|is_consolidation" src/app/finances/monthly-report/hooks/useMonthlyReport.ts` returns >= 1 match (adapter present OR is_consolidation flag set)
    - `grep "'consolidated'" src/app/finances/monthly-report/types.ts` returns 1 match
    - `grep "showConsolidated" src/app/finances/monthly-report/components/MonthlyReportTabs.tsx` returns >=2 matches (prop + filter)
    - `grep "'consolidated'.*label\|id: 'consolidated'" src/app/finances/monthly-report/components/MonthlyReportTabs.tsx` returns >=1 match
    - `grep "useConsolidatedReport\|isConsolidationGroup" src/app/finances/monthly-report/page.tsx` returns >=3 matches
    - **Single-entity path preserved:** `grep "'/api/monthly-report/generate'" src/app/finances/monthly-report/hooks/useMonthlyReport.ts` returns >= 1 match (still used in the non-consolidation branch)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Hook detects group, fetches consolidated report. useMonthlyReport extended to route Actual-vs-Budget to consolidated API when businessId is a consolidation parent (MLTE-05). Page + tabs wire the mode. Types extended with 'consolidated' tab id. Single-entity flow untouched.</done>
</task>

<task type="auto">
  <name>Task 3: ConsolidatedPLTab + FXRateMissingBanner components</name>
  <files>src/app/finances/monthly-report/components/ConsolidatedPLTab.tsx, src/app/finances/monthly-report/components/FXRateMissingBanner.tsx</files>
  <read_first>
    - src/app/finances/monthly-report/components/BudgetVsActualTable.tsx (formatting helpers fmt() + varianceColor() — reuse verbatim)
    - src/app/finances/monthly-report/components/BalanceSheetTab.tsx (row/cell structure + AmountCell pattern — mirror)
    - src/app/finances/monthly-report/components/CashflowTab.tsx (loading/error/empty state pattern lines 27-33)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-PATTERNS.md § ConsolidatedPLTab section (sticky column requirements, mobile toggle pills)
    - .planning/phases/34-dragon-multi-entity-consolidation/34-CONTEXT.md § `### Report Layout (locked, matches user's PDFs)` (column structure per P&L row)
  </read_first>
  <action>
Create `src/app/finances/monthly-report/components/ConsolidatedPLTab.tsx`:

```typescript
'use client'

import { useState } from 'react'

interface EntityColumnVM {
  member_id: string
  business_id: string
  display_name: string
  display_order: number
  functional_currency: string
  lines: Array<{ account_type: string; account_name: string; monthly_values: Record<string, number> }>
}

interface EliminationEntryVM {
  rule_id: string
  rule_description: string
  account_type: string
  account_name: string
  amount: number
  source_entity_id: string
  source_amount: number
}

interface ConsolidatedReportVM {
  group: { id: string; name: string; presentation_currency: string }
  byEntity: EntityColumnVM[]
  eliminations: EliminationEntryVM[]
  consolidated: { lines: Array<{ account_type: string; account_name: string; monthly_values: Record<string, number> }> }
  fx_context: { rates_used: Record<string, number>; missing_rates: Array<{ currency_pair: string; period: string }> }
  diagnostics: { members_loaded: number; total_lines_processed: number; eliminations_applied_count: number; eliminations_total_amount: number; processing_ms: number }
}

function fmt(value: number | null, dash = false): string {
  if (value === null || (dash && value === 0)) return '—'
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return value < 0 ? `-$${formatted}` : `$${formatted}`
}

interface Props {
  report: ConsolidatedReportVM | null
  reportMonth: string                       // 'YYYY-MM'
  isLoading: boolean
  error: string | null
}

export default function ConsolidatedPLTab({ report, reportMonth, isLoading, error }: Props) {
  // Mobile toggle — which entity column to show (desktop shows all)
  const [activeEntityIdx, setActiveEntityIdx] = useState(0)

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Loading consolidated report…</div>
  }
  if (error) {
    return (
      <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
        <p className="text-sm text-red-800">{error}</p>
      </div>
    )
  }
  if (!report) {
    return <div className="p-8 text-center text-gray-500">Select a month to generate the consolidated report.</div>
  }

  // Eliminations aggregated by (type, name) for this reportMonth
  const elimsByKey = new Map<string, number>()
  for (const e of report.eliminations) {
    const k = `${e.account_type}::${e.account_name.toLowerCase().trim()}`
    elimsByKey.set(k, (elimsByKey.get(k) ?? 0) + e.amount)
  }

  // Build display rows: use consolidated.lines as the canonical row ordering
  const rows = report.consolidated.lines.map(l => {
    const key = `${l.account_type}::${l.account_name.toLowerCase().trim()}`
    const entityValues = report.byEntity.map(col => {
      const line = col.lines.find(el =>
        `${el.account_type}::${el.account_name.toLowerCase().trim()}` === key
      )
      return line?.monthly_values[reportMonth] ?? 0
    })
    const elim = elimsByKey.get(key) ?? 0
    const consolidatedVal = l.monthly_values[reportMonth] ?? 0
    return { accountType: l.account_type, accountName: l.account_name, entityValues, elim, consolidated: consolidatedVal }
  })

  return (
    <div className="space-y-4">
      {/* Mobile entity toggle */}
      <div className="flex gap-2 md:hidden">
        {report.byEntity.map((col, idx) => (
          <button
            key={col.member_id}
            onClick={() => setActiveEntityIdx(idx)}
            className={`px-3 py-1 text-sm rounded-full ${activeEntityIdx === idx ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            {col.display_name}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 text-left px-4 py-2 whitespace-nowrap">Account</th>
              {/* Desktop shows all entity columns; mobile shows only activeEntityIdx */}
              {report.byEntity.map((col, idx) => (
                <th
                  key={col.member_id}
                  className={`text-right px-4 py-2 whitespace-nowrap ${idx === activeEntityIdx ? '' : 'hidden md:table-cell'}`}
                >
                  {col.display_name}
                  {col.functional_currency !== report.group.presentation_currency && (
                    <span className="block text-xs text-gray-500">({col.functional_currency}→{report.group.presentation_currency})</span>
                  )}
                </th>
              ))}
              <th className="text-right px-4 py-2 whitespace-nowrap hidden md:table-cell">Eliminations</th>
              <th className="sticky right-0 z-10 bg-gray-50 text-right px-4 py-2 whitespace-nowrap font-semibold">Consolidated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b hover:bg-gray-50">
                <td className="sticky left-0 z-10 bg-white px-4 py-2 whitespace-nowrap">{r.accountName}</td>
                {r.entityValues.map((v, idx) => (
                  <td
                    key={idx}
                    className={`text-right tabular-nums px-4 py-2 ${idx === activeEntityIdx ? '' : 'hidden md:table-cell'} ${v < 0 ? 'text-red-600' : 'text-gray-900'}`}
                  >
                    {fmt(v, true)}
                  </td>
                ))}
                <td className={`text-right tabular-nums px-4 py-2 hidden md:table-cell ${r.elim < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {fmt(r.elim, true)}
                </td>
                <td className={`sticky right-0 z-10 bg-white text-right tabular-nums px-4 py-2 font-semibold ${r.consolidated < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {fmt(r.consolidated, true)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Eliminations diagnostic panel */}
      {report.eliminations.length > 0 && (
        <details className="border rounded-lg p-4 bg-gray-50">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">
            View eliminations applied ({report.diagnostics.eliminations_applied_count} entries, total {fmt(report.diagnostics.eliminations_total_amount)})
          </summary>
          <ul className="mt-3 space-y-1 text-xs text-gray-600">
            {report.eliminations.map((e, i) => (
              <li key={i}>
                <span className="font-medium">{e.rule_description}</span> — {e.account_name}: source {fmt(e.source_amount)}, elimination {fmt(e.amount)}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Diagnostics footer */}
      <div className="text-xs text-gray-500">
        Members loaded: {report.diagnostics.members_loaded} · Lines processed: {report.diagnostics.total_lines_processed} · Processing: {report.diagnostics.processing_ms}ms
      </div>
    </div>
  )
}
```

Create `src/app/finances/monthly-report/components/FXRateMissingBanner.tsx`:

```typescript
'use client'

interface Props {
  missingRates: Array<{ currency_pair: string; period: string }>
  onAddRate?: () => void   // navigate to admin FX rate entry page (plan 00f)
}

export default function FXRateMissingBanner({ missingRates, onAddRate }: Props) {
  if (missingRates.length === 0) return null

  // Group by currency_pair for readability
  const byPair = new Map<string, string[]>()
  for (const r of missingRates) {
    const arr = byPair.get(r.currency_pair) ?? []
    arr.push(r.period)
    byPair.set(r.currency_pair, arr)
  }

  return (
    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <p className="text-sm font-semibold text-amber-900">FX rate missing — translation incomplete</p>
      <ul className="mt-2 text-sm text-amber-800 space-y-1">
        {Array.from(byPair.entries()).map(([pair, months]) => (
          <li key={pair}>
            <strong>{pair}</strong>: {months.sort().join(', ')} — values shown untranslated. Add the rate to complete consolidation.
          </li>
        ))}
      </ul>
      {onAddRate && (
        <button
          onClick={onAddRate}
          className="mt-3 inline-flex items-center text-sm font-medium text-amber-900 underline hover:text-amber-950"
        >
          Enter FX rate →
        </button>
      )}
    </div>
  )
}
```

Import + use both components in `src/app/finances/monthly-report/page.tsx` (finish the task 2 wiring):
- Add imports
- Render `<FXRateMissingBanner missingRates={consolidatedReport?.fx_context?.missing_rates ?? []} onAddRate={() => router.push('/admin/consolidation')} />` above the tab content when `isConsolidationGroup === true`
- Render `<ConsolidatedPLTab report={consolidatedReport} reportMonth={selectedMonth} isLoading={consolidatedLoading} error={consolidatedError} />` when `activeTab === 'consolidated'`
  </action>
  <verify>
    <automated>npx tsc --noEmit && test -f src/app/finances/monthly-report/components/ConsolidatedPLTab.tsx && test -f src/app/finances/monthly-report/components/FXRateMissingBanner.tsx && grep -q "ConsolidatedPLTab" src/app/finances/monthly-report/page.tsx && grep -q "FXRateMissingBanner" src/app/finances/monthly-report/page.tsx</automated>
  </verify>
  <acceptance_criteria>
    - Both component files exist
    - `grep "'use client'" src/app/finances/monthly-report/components/ConsolidatedPLTab.tsx` returns 1 match
    - `grep "sticky left-0\|sticky right-0" src/app/finances/monthly-report/components/ConsolidatedPLTab.tsx` returns >=2 matches (sticky Name + sticky Consolidated)
    - `grep "bg-amber-50\|border-amber" src/app/finances/monthly-report/components/FXRateMissingBanner.tsx` returns matches (amber styling per PATTERNS.md)
    - `grep "missing_rates" src/app/finances/monthly-report/components/FXRateMissingBanner.tsx` returns matches
    - `grep "ConsolidatedPLTab\|FXRateMissingBanner" src/app/finances/monthly-report/page.tsx` returns >=2 matches
    - `grep "View eliminations applied\|eliminations_applied_count" src/app/finances/monthly-report/components/ConsolidatedPLTab.tsx` returns matches (diagnostic panel)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Two tab components shipped. ConsolidatedPLTab renders per-entity + eliminations + consolidated with sticky Name + sticky Consolidated, mobile toggle pills, and diagnostic <details> panel. FXRateMissingBanner shows amber warning grouped by currency pair.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: [CHECKPOINT] Visual verification — Dragon Consolidation P&L matches reference PDF + fixture TODOs resolved</name>
  <what-built>
- API route `POST /api/monthly-report/consolidated` live
- Engine wired with FX callback; IICT integration test exercises the callback
- Hook detects consolidation groups and fetches
- useMonthlyReport now routes Actual-vs-Budget to consolidated API when businessId is a consolidation parent (MLTE-05 wiring — checker revision #2)
- Page renders consolidated tab + FX banner + Actual-vs-Budget fed consolidated data via existing template UI
- Dragon + IICT groups seeded via plan 00d migration (confirmed in DB)
  </what-built>
  <how-to-verify>
Only Matt can verify the visual layout matches the PDF. Steps from VALIDATION.md § Manual-Only Verifications:

**Before starting the visual check — fixture completeness gate (checker revision #10):**

Before running the visual verification, ensure every `TODO_MATT_CONFIRM` marker in the fixture files has been resolved with a confirmed value:

```bash
grep -c "TODO_MATT_CONFIRM" src/lib/consolidation/__fixtures__/*.ts
```

This MUST return 0 across all fixture files. Any remaining TODO markers mean the fixture is
not yet a faithful representation of the source PDFs; confirm the missing values with Matt
before proceeding. (This check is enforced as an explicit acceptance criterion below so that
the checkpoint cannot pass while the fixture is still incomplete.)

**Dragon — should be straightforward (AUD-only, no FX):**
1. Log in as Matt (mattmalouf@wisdomcg.com.au)
2. Open the business selector and pick "Dragon Consolidation" (or whatever business was flagged is_cfo_client for Dragon parent)
3. Navigate to `/finances/monthly-report?business_id=<dragon parent id>` with month=2026-03
4. Confirm the page shows a "Consolidated P&L" tab
5. Click the tab — compare to page 6 of the Dragon Consolidated Finance Report Mar 2026 PDF:
   - 3 data columns: Dragon Roofing Pty Ltd | Easy Hail Claim Pty Ltd | DRAGON CONSOLIDATION
   - Sales - Deposit row: Easy Hail column = $11,652; Consolidated column = $11,652
   - Advertising & Marketing: Dragon -$9,015, Easy Hail +$9,015, Eliminations column shows the transfer, Consolidated = $0
   - Referral Fee rows: both sides eliminated; Consolidated = $0
   - Click "View eliminations applied" details panel — should show 3 rules fired

**MLTE-05 Actual-vs-Budget tab on Dragon Consolidation (checker revision #2):**
6. Click the default "Report" tab (Actual-vs-Budget) — this is the template-driven single-entity tab that should now work on consolidation groups too.
7. Confirm:
   - Each template section (Revenue, Cost of Sales, Operating Expenses, etc.) renders with CONSOLIDATED actuals (not empty data)
   - The Phase 23 template picker still works (switch template → layout changes appropriately)
   - Actuals match what the Consolidated P&L tab showed (e.g. Sales - Deposit = $11,652)
   - Budget column shows $0 with an info note "Consolidated budget not yet supported" (Iteration 34.0 scope)
   - Variance columns are $0 (because budget is $0) — this is expected for 34.0

**IICT — should exercise FX (has HKD member):**
8. Open the admin consolidation page `/admin/consolidation` (shipping in plan 00f — if not yet available, skip this step; plan 00f completes the FX entry UI)
9. If HKD/AUD rate for 2026-03 is missing:
   - Expected UI: amber FXRateMissingBanner reads "HKD/AUD: 2026-03 — values shown untranslated. Add the rate to complete consolidation." with an "Enter FX rate →" button
   - Consolidated values for the IICT Group Limited column should show raw HKD amounts (not $0 silent fallback)
10. If rate is present: IICT consolidation page 7 layout should match (4 columns: IICT Aust | IICT Group Pty Ltd | IICT Group Limited (HKD→AUD) | IICT CONSOLIDATION)

Type `approved` if both Dragon and IICT render correctly (or if IICT shows the expected FX warning when rate absent), AND the Actual-vs-Budget tab on Dragon Consolidation displays consolidated data (not empty), AND all `TODO_MATT_CONFIRM` markers have been resolved in the fixture files. Type `issues: <description>` if any numbers or layout differ from the PDFs.
  </how-to-verify>
  <action>See how-to-verify below — this is a human-verified checkpoint. The executor MUST not perform implementation work in this task; it gates wave progression until the verifier types `approved`.</action>
  <verify>
    <automated>bash -c 'count=$(grep -c "TODO_MATT_CONFIRM" src/lib/consolidation/__fixtures__/*.ts 2>/dev/null | awk -F: "{sum+=\$2} END {print sum+0}"); if [ "$count" != "0" ]; then echo "GATE FAILED: $count TODO_MATT_CONFIRM markers remain in fixtures (checker revision #10); resolve before approval"; exit 1; fi; echo "Fixture TODO gate passed (0 markers)"; echo "Remainder of checkpoint requires human approval"'</automated>
  </verify>
  <acceptance_criteria>
    - **Checker revision #10 — TODO_MATT_CONFIRM gate:** `grep -c "TODO_MATT_CONFIRM" src/lib/consolidation/__fixtures__/*.ts 2>/dev/null | awk -F: '{sum+=$2} END {print sum+0}'` returns `0` (all fixture TODO markers resolved)
    - Human verifier confirmed Dragon Consolidated P&L tab matches PDF page 6
    - Human verifier confirmed Actual-vs-Budget tab on Dragon Consolidation displays consolidated data (MLTE-05)
    - Human verifier confirmed IICT FX flow (banner appears when rate missing; correct translation when rate present)
  </acceptance_criteria>
  <done>Checkpoint approved by human verifier (resume-signal received matching `approved`), fixture TODO gate green, MLTE-05 Actual-vs-Budget tab verified on Dragon Consolidation.</done>
  <resume-signal>approved — or — issues: &lt;describe&gt;</resume-signal>
</task>

</tasks>

<verification>
  <commands>
    - `npx vitest run src/lib/consolidation src/app/api/monthly-report/consolidated --reporter=dot` — all tests green
    - `npx tsc --noEmit` — clean
    - `grep -c "TODO_MATT_CONFIRM" src/lib/consolidation/__fixtures__/*.ts | awk -F: '{sum+=$2} END {print sum+0}'` — returns 0 before checkpoint
    - Visual human-verify checkpoint: Dragon PDF match + MLTE-05 Actual-vs-Budget on Dragon Consolidation + IICT FX behaviour
  </commands>
</verification>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client → POST /api/monthly-report/consolidated | Untrusted JSON body — business_id, report_month, fiscal_year |
| Route handler → service-role Supabase | Bypass RLS; MUST verify access before querying |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-34-05 | Information Disclosure | POST /api/monthly-report/consolidated | mitigate | Dual-client pattern: service-role for data; authSupabase for user access check — coach must own parent business OR be super_admin |
| T-34-06 | Denial of Service | POST consolidated route | mitigate | checkRateLimit with 'consolidated-report' key + RATE_LIMIT_CONFIGS.report (shared throttle) |
| T-34-07 | Tampering | business_id / report_month / fiscal_year body inputs | mitigate | Explicit presence check returns 400; engine queries are parameterized via Supabase .eq() — no SQL string concat |
| T-34-08 | Information Disclosure | Error responses leak stage info | accept | stage + detail fields are coach-visible only (route is role-gated); helpful for debugging, no secrets exposed |
</threat_model>

<success_criteria>
- API route live with auth + rate limit + stage-tracking + FX wiring + engine invocation
- Engine FX translate callback unit-tested via the IICT integration test (fx_context.rates_used populated — checker revision #6)
- Hook detects consolidation groups and fetches
- MLTE-05 wired: useMonthlyReport routes Actual-vs-Budget to consolidated API on consolidation groups (checker revision #2)
- Page + tabs wire consolidated mode (doesn't break single-entity flow)
- ConsolidatedPLTab renders 3+ column layout with sticky Name + sticky Consolidated + Eliminations + per-entity cols
- FXRateMissingBanner surfaces missing rates with amber styling + CTA to admin rate entry
- Fixture TODO_MATT_CONFIRM gate green before checkpoint (checker revision #10)
- Human verified visual parity with Dragon + IICT PDFs (or issues captured)
</success_criteria>

<output>
After completion, create `.planning/phases/34-dragon-multi-entity-consolidation/34-00e-SUMMARY.md` summarising:
- API route test pass rate (including IICT FX translate callback test case — checker revision #6)
- Dragon visual verification outcome (PDF match? deltas?)
- MLTE-05 Actual-vs-Budget tab on Dragon Consolidation outcome (checker revision #2) — does the existing template UI render consolidated actuals correctly?
- IICT FX flow outcome (missing-rate banner appeared? rate entered via plan 00f?)
- Fixture TODO_MATT_CONFIRM gate status (checker revision #10 — should be 0 at approval)
- Any unresolved issues for plan 00f
</output>
