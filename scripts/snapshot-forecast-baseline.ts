/**
 * Phase 57 — Pre-deploy forecast P&L baseline snapshot.
 *
 * Captures a reference forecast's Year-1 (and Year-2/3 if present) headline
 * numbers BEFORE Phase 57 ships, so Task 16 (`task-16-jds-end-to-end-qa.md`)
 * can prove that the wizard re-flow leaves Y1 net profit unchanged within
 * `max($10, 0.05% × Y1 revenue)`.
 *
 * READ-ONLY against the database. Never INSERTs, UPDATEs, or DELETEs. Mirrors
 * the env-var pattern of `scripts/canary-forecast-save.ts` and the table-shape
 * conventions of `scripts/audit-multiple-active-forecasts.ts`.
 *
 * Numbers come from TWO independent paths so we can spot drift if the wizard
 * client math and the server materialization disagree:
 *
 *   1. `wizard_state` column on `financial_forecasts` — the wizard persists
 *      `summary.year1 / year2 / year3` here on every save (see
 *      `useForecastWizard.ts:1675-1679` and the API route at
 *      `src/app/api/forecast-wizard-v4/generate/route.ts:104`). This is the
 *      number the operator literally saw in Step 9 Review at save time.
 *
 *   2. `forecast_pl_lines` — server-materialized monthly totals. We re-derive
 *      Y1 revenue / cogs / opex / netProfit by summing rows the same way
 *      `ForecastReadService.getCategorySubtotalsForMonth()` does (5-bucket
 *      formula: `revenue - cogs - opex + other_income - other_expense`).
 *
 *      Y2 and Y3 are NOT materialized to forecast_pl_lines (only the active FY's
 *      12 months are stored), so those come ONLY from `wizard_state`. This is
 *      called out explicitly in the output JSON.
 *
 * Usage:
 *   # Default — JDS, output to phase 57 dir.
 *   npx tsx scripts/snapshot-forecast-baseline.ts --tenant=JDS
 *
 *   # Explicit output path.
 *   npx tsx scripts/snapshot-forecast-baseline.ts \
 *     --tenant=JDS \
 *     --output=.planning/phases/57-subscriptions-flow-restructure/jds-baseline-pre-phase-57.json
 *
 *   # Different tenant by name fragment (case-insensitive ILIKE match against
 *   # business_profiles.business_name and businesses.name).
 *   npx tsx scripts/snapshot-forecast-baseline.ts --tenant=Envisage
 *
 *   # Explicit business id (skips name lookup; useful when name is ambiguous).
 *   npx tsx scripts/snapshot-forecast-baseline.ts --tenant=JDS --business-id=900aa935-ae8c-4913-baf7-169260fa19ef
 */
import { config } from 'dotenv'
import path from 'node:path'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'

config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// CLI args — minimal `--key=value` form, no extra deps.
// ---------------------------------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const stripped = arg.replace(/^--/, '')
    const eqIdx = stripped.indexOf('=')
    if (eqIdx === -1) return [stripped, 'true']
    return [stripped.slice(0, eqIdx), stripped.slice(eqIdx + 1)]
  }),
) as Record<string, string>

const tenantArg = args.tenant ?? 'JDS'
const explicitBusinessId = args['business-id']

// ---------------------------------------------------------------------------
// Supabase client — service role, no session persistence.
// Honor BOTH env-var spellings (SUPABASE_SERVICE_ROLE_KEY is canonical;
// SUPABASE_SERVICE_KEY is used by older audit scripts in this folder).
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[BASELINE] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY in .env.local',
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
})

// ---------------------------------------------------------------------------
// Types — narrow shapes for the columns we actually read.
// ---------------------------------------------------------------------------

interface BusinessRow {
  id: string
  name?: string | null
  business_name?: string | null
}

interface FinancialForecastRow {
  id: string
  business_id: string
  fiscal_year: number
  name: string | null
  is_active: boolean
  is_locked: boolean | null
  forecast_duration: number | null
  forecast_start_month: string | null
  forecast_end_month: string | null
  updated_at: string
  wizard_state: WizardSummary | null
  revenue_goal: number | null
  gross_profit_goal: number | null
  net_profit_goal: number | null
}

/** What the wizard persists in `financial_forecasts.wizard_state`. */
interface YearSummary {
  revenue?: number
  cogs?: number
  grossProfit?: number
  grossProfitPct?: number
  teamCosts?: number
  opex?: number
  depreciation?: number
  investments?: number
  otherExpenses?: number
  otherIncome?: number
  xeroOtherExpense?: number
  netProfit?: number
  netProfitPct?: number
}

interface WizardSummary {
  year1?: YearSummary
  year2?: YearSummary
  year3?: YearSummary
}

interface ForecastPLLineRow {
  account_code: string | null
  account_name: string | null
  category: string | null
  is_manual: boolean | null
  forecast_months: Record<string, number> | null
}

interface SubscriptionBudgetRow {
  vendor_name: string | null
  vendor_key: string | null
  monthly_budget: number | null
  account_codes: string[] | null
  is_active: boolean | null
}

// ---------------------------------------------------------------------------
// Step 1 — Resolve tenant → business_id.
//
// Per project memory `project_dual_id`: businesses.id != business_profiles.id.
// `financial_forecasts.business_id` references business_profiles(id) (per the
// generate route at src/app/api/forecast-wizard-v4/generate/route.ts:89).
// We accept either kind of id when --business-id is passed and search BOTH
// tables when matching by name. We resolve to the business_profiles.id used
// by financial_forecasts so the forecast lookup always works.
// ---------------------------------------------------------------------------

async function resolveBusiness(): Promise<{
  businessProfileId: string
  businessName: string
}> {
  if (explicitBusinessId) {
    // Try business_profiles.id first — that's the FK target for forecasts.
    const { data: profile } = await supabase
      .from('business_profiles')
      .select('id, business_name')
      .eq('id', explicitBusinessId)
      .maybeSingle<BusinessRow>()
    if (profile) {
      return {
        businessProfileId: profile.id,
        businessName: profile.business_name ?? tenantArg,
      }
    }
    // Fall back to businesses.id — find the matching profile via name.
    const { data: business } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('id', explicitBusinessId)
      .maybeSingle<BusinessRow>()
    if (!business) {
      throw new Error(
        `[BASELINE] --business-id=${explicitBusinessId} not found in business_profiles or businesses`,
      )
    }
    // Look up the profile by matching name.
    const { data: profByName } = await supabase
      .from('business_profiles')
      .select('id, business_name')
      .ilike('business_name', business.name ?? '')
      .maybeSingle<BusinessRow>()
    if (!profByName) {
      throw new Error(
        `[BASELINE] businesses.id=${explicitBusinessId} (name="${business.name}") has no matching business_profiles row`,
      )
    }
    return {
      businessProfileId: profByName.id,
      businessName: profByName.business_name ?? business.name ?? tenantArg,
    }
  }

  // Name-based lookup — prefer business_profiles since that's the FK target.
  const namePattern = `%${tenantArg}%`

  const { data: profileMatches } = await supabase
    .from('business_profiles')
    .select('id, business_name')
    .ilike('business_name', namePattern)

  if (profileMatches && profileMatches.length === 1) {
    const m = profileMatches[0] as BusinessRow
    return { businessProfileId: m.id, businessName: m.business_name ?? tenantArg }
  }

  if (profileMatches && profileMatches.length > 1) {
    const names = (profileMatches as BusinessRow[]).map(
      (m) => `${m.id}:${m.business_name}`,
    )
    throw new Error(
      `[BASELINE] Tenant pattern "${tenantArg}" matched ${profileMatches.length} business_profiles rows. ` +
        `Pass --business-id=<id> to disambiguate. Candidates: ${names.join(', ')}`,
    )
  }

  // No business_profiles match — try businesses.name and resolve via name.
  const { data: bizMatches } = await supabase
    .from('businesses')
    .select('id, name')
    .ilike('name', namePattern)

  if (!bizMatches || bizMatches.length === 0) {
    throw new Error(
      `[BASELINE] No business_profiles or businesses row matched "${tenantArg}" (ILIKE %${tenantArg}%)`,
    )
  }

  if (bizMatches.length > 1) {
    const names = (bizMatches as BusinessRow[]).map((m) => `${m.id}:${m.name}`)
    throw new Error(
      `[BASELINE] Tenant pattern "${tenantArg}" matched ${bizMatches.length} businesses rows. ` +
        `Pass --business-id=<id> to disambiguate. Candidates: ${names.join(', ')}`,
    )
  }

  const biz = bizMatches[0] as BusinessRow
  const { data: prof } = await supabase
    .from('business_profiles')
    .select('id, business_name')
    .ilike('business_name', biz.name ?? '')
    .maybeSingle<BusinessRow>()

  if (!prof) {
    throw new Error(
      `[BASELINE] businesses.name="${biz.name}" has no matching business_profiles row by name. ` +
        `Pass --business-id=<business_profiles.id> directly.`,
    )
  }

  return {
    businessProfileId: prof.id,
    businessName: prof.business_name ?? biz.name ?? tenantArg,
  }
}

// ---------------------------------------------------------------------------
// Step 2 — Find the active forecast for that business.
//
// Per `audit-multiple-active-forecasts.ts` and the unique partial index
// `unique_active_forecast_per_fy`, exactly one row per (business, fy, type)
// is allowed to be is_active=true. We pick the latest by updated_at to be
// safe in case a tenant happens to have multiple FYs active concurrently
// (one row per fiscal year is fine).
// ---------------------------------------------------------------------------

async function loadActiveForecast(
  businessProfileId: string,
): Promise<FinancialForecastRow> {
  const { data, error } = await supabase
    .from('financial_forecasts')
    .select(
      'id, business_id, fiscal_year, name, is_active, is_locked, forecast_duration, ' +
        'forecast_start_month, forecast_end_month, updated_at, wizard_state, ' +
        'revenue_goal, gross_profit_goal, net_profit_goal',
    )
    .eq('business_id', businessProfileId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle<FinancialForecastRow>()

  if (error) {
    throw new Error(`[BASELINE] financial_forecasts query failed: ${error.message}`)
  }
  if (!data) {
    throw new Error(
      `[BASELINE] No active forecast found for business_profiles.id=${businessProfileId}`,
    )
  }
  return data
}

// ---------------------------------------------------------------------------
// Step 3 — Server-side Y1 cross-check from forecast_pl_lines.
//
// Mirrors ForecastReadService.getCategorySubtotalsForMonth — the same 5-bucket
// formula the wizard uses. We sum across all 12 forecast months to get Y1
// totals. forecast_pl_lines.category values follow the same vocabulary the
// wizard emits (revenue / cogs / opex / other_income / other_expense), but in
// practice older rows may use legacy names — we normalize defensively.
// ---------------------------------------------------------------------------

interface ServerY1 {
  revenue: number
  cogs: number
  grossProfit: number
  opex: number
  otherIncome: number
  otherExpense: number
  netProfit: number
  /** Months that had any non-zero amount across the rolled-up rows. */
  monthsCovered: number
  rowCount: number
}

function normalizeCategory(c: string | null | undefined): string {
  const v = (c ?? '').toLowerCase().trim()
  if (v === 'revenue' || v === 'sales' || v === 'income') return 'revenue'
  if (v === 'cogs' || v === 'cost_of_sales' || v === 'cost of sales') return 'cogs'
  if (v === 'other_income' || v === 'otherincome') return 'other_income'
  if (v === 'other_expense' || v === 'otherexpense' || v === 'other_expenses')
    return 'other_expense'
  // Everything else (opex, team, depreciation, investments, etc.) rolls into
  // the same bucket the wizard's net-profit formula treats as expenses-below-GP.
  // Keep `opex` as the catch-all so the formula matches Step 9 Review.
  return 'opex'
}

async function loadServerY1(
  forecastId: string,
  forecast: FinancialForecastRow,
): Promise<ServerY1> {
  const { data, error } = await supabase
    .from('forecast_pl_lines')
    .select('account_code, account_name, category, is_manual, forecast_months')
    .eq('forecast_id', forecastId)

  if (error) {
    throw new Error(`[BASELINE] forecast_pl_lines query failed: ${error.message}`)
  }

  const rows = (data ?? []) as ForecastPLLineRow[]

  // Determine the Y1 month range from the forecast's start/end month.
  // forecast_start_month and forecast_end_month are 'YYYY-MM' strings.
  // Y1 = the first 12 months of the forecast window.
  const startMonth = forecast.forecast_start_month ?? null
  const y1Months = new Set<string>()
  if (startMonth) {
    const [yStr, mStr] = startMonth.split('-')
    const startYear = Number(yStr)
    const startMon = Number(mStr) // 1-12
    if (Number.isFinite(startYear) && Number.isFinite(startMon)) {
      let y = startYear
      let m = startMon
      for (let i = 0; i < 12; i++) {
        y1Months.add(`${y}-${String(m).padStart(2, '0')}`)
        m += 1
        if (m > 12) {
          m = 1
          y += 1
        }
      }
    }
  }

  let revenue = 0
  let cogs = 0
  let opex = 0
  let otherIncome = 0
  let otherExpense = 0
  const monthsHit = new Set<string>()

  for (const r of rows) {
    const cat = normalizeCategory(r.category)
    const months = r.forecast_months ?? {}
    for (const [m, vRaw] of Object.entries(months)) {
      // If we know the Y1 window, restrict to it. Otherwise (no start month),
      // sum every month present — degrades gracefully.
      if (y1Months.size > 0 && !y1Months.has(m)) continue
      const v = Number(vRaw)
      if (!Number.isFinite(v) || v === 0) continue
      monthsHit.add(m)
      if (cat === 'revenue') revenue += v
      else if (cat === 'cogs') cogs += v
      else if (cat === 'other_income') otherIncome += v
      else if (cat === 'other_expense') otherExpense += v
      else opex += v // opex bucket = team + opex + depreciation + investments + user-one-offs
    }
  }

  const grossProfit = revenue - cogs
  // Mirror useForecastWizard.ts:1454-1462 / forecast-read-service.ts:402:
  //   netProfit = revenue - cogs - opex + other_income - other_expense
  const netProfit = revenue - cogs - opex + otherIncome - otherExpense

  return {
    revenue: Math.round(revenue),
    cogs: Math.round(cogs),
    grossProfit: Math.round(grossProfit),
    opex: Math.round(opex),
    otherIncome: Math.round(otherIncome),
    otherExpense: Math.round(otherExpense),
    netProfit: Math.round(netProfit),
    monthsCovered: monthsHit.size,
    rowCount: rows.length,
  }
}

// ---------------------------------------------------------------------------
// Step 4 — Subscription budgets sum.
//
// Mirrors the GET handler in src/app/api/subscription-budgets/route.ts:64 —
// totalAnnual = Σ(monthly_budget) × 12 across all active rows for the business.
// We also expose the count and the aggregated set of accountCodes so the QA
// step can sanity-check that Phase 57's account-code join key picks up the
// same set of accounts.
// ---------------------------------------------------------------------------

interface SubscriptionsBaseline {
  count: number
  totalMonthly: number
  totalAnnual: number
  accountCodes: string[]
  accountCodesCount: number
  vendors: Array<{ name: string; key: string | null; monthlyBudget: number }>
}

async function loadSubscriptionBudgets(
  businessProfileId: string,
): Promise<SubscriptionsBaseline> {
  const { data, error } = await supabase
    .from('subscription_budgets')
    .select('vendor_name, vendor_key, monthly_budget, account_codes, is_active')
    .eq('business_id', businessProfileId)
    .eq('is_active', true)

  if (error) {
    // subscription_budgets may not exist on every tenant pre-Phase 57. Treat
    // missing rows as a zero-row baseline — that's still a valid baseline.
    console.warn(
      `[BASELINE] subscription_budgets query warning: ${error.message} (treating as 0 rows)`,
    )
    return {
      count: 0,
      totalMonthly: 0,
      totalAnnual: 0,
      accountCodes: [],
      accountCodesCount: 0,
      vendors: [],
    }
  }

  const rows = (data ?? []) as SubscriptionBudgetRow[]
  const totalMonthly = rows.reduce(
    (sum, r) => sum + (Number(r.monthly_budget) || 0),
    0,
  )
  const accountCodeSet = new Set<string>()
  for (const r of rows) {
    for (const code of r.account_codes ?? []) {
      if (code) accountCodeSet.add(code)
    }
  }
  const accountCodes = [...accountCodeSet].sort()

  return {
    count: rows.length,
    totalMonthly: Math.round(totalMonthly * 100) / 100,
    totalAnnual: Math.round(totalMonthly * 12 * 100) / 100,
    accountCodes,
    accountCodesCount: accountCodes.length,
    vendors: rows.map((r) => ({
      name: r.vendor_name ?? '(unnamed)',
      key: r.vendor_key,
      monthlyBudget: Number(r.monthly_budget) || 0,
    })),
  }
}

// ---------------------------------------------------------------------------
// Output shape — JSON written to disk, machine-readable for Task 16's
// post-deploy variance check.
// ---------------------------------------------------------------------------

interface BaselineOutput {
  tenant: string
  businessProfileId: string
  forecastId: string
  forecastName: string | null
  fiscalYear: number
  forecastDuration: number | null
  forecastStartMonth: string | null
  forecastEndMonth: string | null
  forecastUpdatedAt: string
  capturedAt: string
  /** Numbers as the wizard saved them (the operator's Step 9 Review screen). */
  wizard: {
    y1: YearSummary
    y2: YearSummary | null
    y3: YearSummary | null
  }
  /** Independent re-derivation from forecast_pl_lines. */
  serverY1: ServerY1
  /**
   * Difference between wizard.y1 and serverY1 — a signal that drift exists
   * BEFORE Phase 57 ships. If non-trivial, baseline the wizard number (it's
   * what the operator saw) but flag the gap in the QA report.
   */
  serverVsWizardDelta: {
    revenue: number
    cogs: number
    opex: number
    netProfit: number
  }
  subscriptions: SubscriptionsBaseline
  /** Per task 16: Y1 NP must be within max($10, 0.05% × Y1 revenue). */
  varianceThreshold: {
    absolute: number
    relative: number
    applies: string
  }
  /** Notes about caveats / data drift / things QA should check. */
  notes: string[]
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main() {
  const capturedAt = new Date().toISOString()
  console.log(`[BASELINE] Phase 57 forecast baseline snapshot`)
  console.log(`[BASELINE] Run at: ${capturedAt}`)
  console.log(`[BASELINE] Tenant: ${tenantArg}`)
  if (explicitBusinessId) console.log(`[BASELINE] --business-id: ${explicitBusinessId}`)
  console.log('')

  // 1. Resolve tenant.
  const { businessProfileId, businessName } = await resolveBusiness()
  console.log(`[BASELINE] Resolved business_profile.id = ${businessProfileId}`)
  console.log(`[BASELINE] business_name = ${businessName}`)

  // 2. Active forecast.
  const forecast = await loadActiveForecast(businessProfileId)
  console.log(
    `[BASELINE] Active forecast: id=${forecast.id} name="${forecast.name}" fy=${forecast.fiscal_year} ` +
      `duration=${forecast.forecast_duration} updated_at=${forecast.updated_at}`,
  )

  // 3. Wizard summary (operator-visible numbers).
  const wizardState: WizardSummary = forecast.wizard_state ?? {}
  const y1 = wizardState.year1 ?? {}
  const y2 = wizardState.year2 ?? null
  const y3 = wizardState.year3 ?? null

  if (!wizardState.year1) {
    console.warn(
      '[BASELINE] WARNING: financial_forecasts.wizard_state.year1 is empty. The wizard ' +
        'persists summary on every save (useForecastWizard.ts:1675-1679). Empty here ' +
        'means this forecast was either created before that field existed OR was never ' +
        'saved through the wizard. Server-derived Y1 will still be captured below.',
    )
  }

  // 4. Server Y1 cross-check.
  const serverY1 = await loadServerY1(forecast.id, forecast)
  console.log(
    `[BASELINE] Server Y1 (forecast_pl_lines): revenue=$${serverY1.revenue.toLocaleString()} ` +
      `netProfit=$${serverY1.netProfit.toLocaleString()} (rows=${serverY1.rowCount}, months=${serverY1.monthsCovered})`,
  )

  // 5. Subscription budgets.
  const subscriptions = await loadSubscriptionBudgets(businessProfileId)
  console.log(
    `[BASELINE] subscription_budgets: ${subscriptions.count} active vendors, ` +
      `monthly=$${subscriptions.totalMonthly.toLocaleString()}, annual=$${subscriptions.totalAnnual.toLocaleString()}, ` +
      `${subscriptions.accountCodesCount} distinct account_codes`,
  )

  // 6. Build output.
  const wizardRevenue = Number(y1.revenue ?? 0)
  const notes: string[] = []
  if (!wizardState.year1) {
    notes.push(
      'wizard_state.year1 was empty on this forecast row — wizard summary fields are 0. ' +
        'Use serverY1 as the baseline. After re-saving via the wizard once, wizard_state will populate.',
    )
  }
  if (serverY1.monthsCovered === 0) {
    notes.push(
      'forecast_pl_lines had no in-window forecast_months for Y1 — server cross-check failed. ' +
        'Either the active forecast was never materialized or forecast_start_month is null.',
    )
  }
  if (Math.abs(serverY1.netProfit - Number(y1.netProfit ?? 0)) > 100 && wizardState.year1) {
    notes.push(
      `Server Y1 netProfit (${serverY1.netProfit}) differs from wizard.year1.netProfit ` +
        `(${y1.netProfit}) by >$100. Possible client/server formula drift OR pl_lines staleness ` +
        `(see ForecastReadService computed_at invariant). Baseline the wizard number for QA — ` +
        `that's what the operator saw — but file the gap in the QA report.`,
    )
  }
  if (subscriptions.count === 0) {
    notes.push(
      'subscription_budgets has 0 active rows — Phase 57 Step 5 will be empty for this tenant ' +
        'until the operator runs the new wizard flow. This is expected for a pre-Phase-57 baseline.',
    )
  }

  const output: BaselineOutput = {
    tenant: businessName,
    businessProfileId,
    forecastId: forecast.id,
    forecastName: forecast.name,
    fiscalYear: forecast.fiscal_year,
    forecastDuration: forecast.forecast_duration,
    forecastStartMonth: forecast.forecast_start_month,
    forecastEndMonth: forecast.forecast_end_month,
    forecastUpdatedAt: forecast.updated_at,
    capturedAt,
    wizard: { y1, y2, y3 },
    serverY1,
    serverVsWizardDelta: {
      revenue: serverY1.revenue - Number(y1.revenue ?? 0),
      cogs: serverY1.cogs - Number(y1.cogs ?? 0),
      // Wizard splits opex into team + opex + depreciation + investments + otherExpenses.
      // The serverY1.opex bucket sums all of those, so compare against the sum.
      opex:
        serverY1.opex -
        (Number(y1.teamCosts ?? 0) +
          Number(y1.opex ?? 0) +
          Number(y1.depreciation ?? 0) +
          Number(y1.investments ?? 0) +
          Number(y1.otherExpenses ?? 0)),
      netProfit: serverY1.netProfit - Number(y1.netProfit ?? 0),
    },
    subscriptions,
    varianceThreshold: {
      absolute: 10,
      relative: 0.0005,
      applies: 'Y1 NP delta must be within max(absolute, relative * y1.revenue)',
    },
    notes,
  }

  // 7. Write JSON.
  const defaultOut = path.join(
    '.planning/phases/57-subscriptions-flow-restructure',
    `${businessName.toLowerCase().replace(/\s+/g, '-')}-baseline-pre-phase-57.json`,
  )
  const outputPath = args.output ?? defaultOut
  const outputDir = path.dirname(outputPath)
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })
  writeFileSync(outputPath, JSON.stringify(output, null, 2))

  // 8. Console summary.
  console.log('')
  console.log('=== BASELINE CAPTURED ===')
  console.log(`Output: ${outputPath}`)
  console.log('')
  console.log(`Tenant: ${output.tenant}`)
  console.log(`Forecast: ${output.forecastName} (FY${output.fiscalYear}, duration=${output.forecastDuration})`)
  console.log('')
  console.log('Year-1 numbers (wizard.year1 / Step 9 Review):')
  console.log(`  Revenue:     $${(y1.revenue ?? 0).toLocaleString()}`)
  console.log(`  COGS:        $${(y1.cogs ?? 0).toLocaleString()}`)
  console.log(`  Gross Profit: $${(y1.grossProfit ?? 0).toLocaleString()}`)
  console.log(`  Team Costs:  $${(y1.teamCosts ?? 0).toLocaleString()}`)
  console.log(`  OpEx:        $${(y1.opex ?? 0).toLocaleString()}`)
  console.log(`  Net Profit:  $${(y1.netProfit ?? 0).toLocaleString()}`)
  console.log('')
  console.log('Year-1 server cross-check (forecast_pl_lines):')
  console.log(`  Revenue:     $${serverY1.revenue.toLocaleString()}`)
  console.log(`  Net Profit:  $${serverY1.netProfit.toLocaleString()}`)
  console.log(`  Δ NP vs wizard: $${output.serverVsWizardDelta.netProfit.toLocaleString()}`)
  console.log('')
  if (y2) console.log(`Year-2 NP (wizard.year2): $${(y2.netProfit ?? 0).toLocaleString()}`)
  if (y3) console.log(`Year-3 NP (wizard.year3): $${(y3.netProfit ?? 0).toLocaleString()}`)
  console.log('')
  console.log(
    `Subscriptions: ${subscriptions.count} vendors, $${subscriptions.totalAnnual.toLocaleString()}/yr ` +
      `(${subscriptions.accountCodesCount} account codes)`,
  )
  console.log('')
  const threshold = Math.max(10, 0.0005 * wizardRevenue)
  console.log(
    `Variance threshold (Task 16): max($10, 0.05% × $${wizardRevenue.toLocaleString()}) = $${threshold.toFixed(2)}`,
  )
  if (notes.length > 0) {
    console.log('')
    console.log('Notes:')
    for (const n of notes) console.log(`  - ${n}`)
  }
}

main().catch((e) => {
  console.error('[BASELINE] error:', e)
  process.exit(1)
})
