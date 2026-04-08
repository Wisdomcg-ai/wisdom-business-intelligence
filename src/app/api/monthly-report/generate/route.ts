import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { buildFuzzyLookup } from '@/lib/utils/account-matching'
import { checkRateLimit, createRateLimitKey, RATE_LIMIT_CONFIGS } from '@/lib/utils/rate-limiter'
import { generateFiscalMonthKeys, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

interface ReportLine {
  account_name: string
  xero_account_name?: string | null
  is_budget_only: boolean
  actual: number
  budget: number
  variance_amount: number
  variance_percent: number
  ytd_actual: number
  ytd_budget: number
  ytd_variance_amount: number
  ytd_variance_percent: number
  unspent_budget: number
  budget_next_month: number
  budget_annual_total: number
  prior_year: number | null
}

// Map xero account_type to report_category
function mapTypeToCategory(accountType: string): string {
  switch ((accountType || '').toLowerCase()) {
    case 'revenue': return 'Revenue'
    case 'cogs': return 'Cost of Sales'
    case 'opex': return 'Operating Expenses'
    case 'other_income': return 'Other Income'
    case 'other_expense': return 'Other Expenses'
    default: return 'Other Expenses'
  }
}

// Calculate variance with correct sign convention
// Revenue: favorable = actual > budget (positive)
// Expenses: favorable = budget > actual (positive)
function calcVariance(actual: number, budget: number, isRevenue: boolean): { amount: number; percent: number } {
  const amount = isRevenue ? actual - budget : budget - actual
  const percent = budget !== 0 ? (amount / Math.abs(budget)) * 100 : 0
  return { amount, percent }
}

// Build a subtotal line from an array of report lines
function buildSubtotal(lines: ReportLine[], label: string): ReportLine {
  return {
    account_name: label,
    xero_account_name: null,
    is_budget_only: false,
    actual: lines.reduce((s, l) => s + l.actual, 0),
    budget: lines.reduce((s, l) => s + l.budget, 0),
    variance_amount: lines.reduce((s, l) => s + l.variance_amount, 0),
    variance_percent: 0, // Recalculated below
    ytd_actual: lines.reduce((s, l) => s + l.ytd_actual, 0),
    ytd_budget: lines.reduce((s, l) => s + l.ytd_budget, 0),
    ytd_variance_amount: lines.reduce((s, l) => s + l.ytd_variance_amount, 0),
    ytd_variance_percent: 0,
    unspent_budget: lines.reduce((s, l) => s + l.unspent_budget, 0),
    budget_next_month: lines.reduce((s, l) => s + l.budget_next_month, 0),
    budget_annual_total: lines.reduce((s, l) => s + l.budget_annual_total, 0),
    prior_year: lines.some(l => l.prior_year !== null) ? lines.reduce((s, l) => s + (l.prior_year || 0), 0) : null,
  }
}

// Get an array of month keys from start to end inclusive
function getMonthRange(start: string, end: string): string[] {
  const months: string[] = []
  const [startY, startM] = start.split('-').map(Number)
  const [endY, endM] = end.split('-').map(Number)
  let y = startY
  let m = startM
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

// Get the next month key
function getNextMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (m === 12) return `${y + 1}-01`
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

// Get the prior year month key
function getPriorYearMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return `${y - 1}-${String(m).padStart(2, '0')}`
}

/**
 * POST /api/monthly-report/generate
 * Generates a Budget vs Actual report for a given month
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const authSupabase = await createRouteHandlerClient()
    const { data: { user }, error: authError } = await authSupabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { business_id, report_month, fiscal_year, force_draft } = body

    if (!business_id || !report_month || !fiscal_year) {
      return NextResponse.json(
        { error: 'business_id, report_month, and fiscal_year are required' },
        { status: 400 }
      )
    }

    // Rate limit: 20 reports per hour per user
    const rateLimit = checkRateLimit(
      createRateLimitKey('report-generate', user.id),
      RATE_LIMIT_CONFIGS.report
    )
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429 }
      )
    }

    // Verify user owns or coaches this business
    const { data: bizAccess } = await authSupabase
      .from('businesses')
      .select('id')
      .eq('id', business_id)
      .or(`owner_id.eq.${user.id},assigned_coach_id.eq.${user.id}`)
      .maybeSingle()
    if (!bizAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // 1. Load settings
    const { data: settingsRow } = await supabase
      .from('monthly_report_settings')
      .select('*')
      .eq('business_id', business_id)
      .maybeSingle()

    const settings = settingsRow || {
      business_id,
      sections: {
        revenue_detail: true, cogs_detail: true, opex_detail: true,
        payroll_detail: false, subscription_detail: false,
        balance_sheet: false, cashflow: false, trend_charts: true,
      },
      show_prior_year: true,
      show_ytd: true,
      show_unspent_budget: true,
      show_budget_next_month: true,
      show_budget_annual_total: true,
      budget_forecast_id: null,
    }

    // 2. Load account mappings
    const { data: mappings, error: mappingsErr } = await supabase
      .from('account_mappings')
      .select('*')
      .eq('business_id', business_id)

    if (mappingsErr) {
      console.error('[Report Generate] Error loading mappings:', mappingsErr)
      return NextResponse.json({ error: 'Failed to load account mappings' }, { status: 500 })
    }

    if (!mappings || mappings.length === 0) {
      return NextResponse.json(
        { error: 'No account mappings found. Please set up account mappings first.', code: 'NO_MAPPINGS' },
        { status: 400 }
      )
    }

    // 3. Determine budget forecast
    // financial_forecasts.business_id references business_profiles.id, not businesses.id
    // So we need to resolve the profile ID first
    let budgetForecast: any = null
    let budgetPLLines: any[] = []
    let budgetForecastName: string | undefined

    // Always fetch fiscal_year_start for parameterized FY range calculation
    const { data: profile } = await supabase
      .from('business_profiles')
      .select('id, fiscal_year_start')
      .eq('business_id', business_id)
      .maybeSingle()

    const yearStartMonth: number = profile?.fiscal_year_start ?? DEFAULT_YEAR_START_MONTH

    if (settings.budget_forecast_id) {
      const { data: fc } = await supabase
        .from('financial_forecasts')
        .select('id, name')
        .eq('id', settings.budget_forecast_id)
        .single()
      budgetForecast = fc
    } else {
      // Try both profile ID and direct business_id to handle both FK patterns
      const idsToTry = profile?.id ? [profile.id, business_id] : [business_id]

      for (const id of idsToTry) {
        const { data: fc } = await supabase
          .from('financial_forecasts')
          .select('id, name')
          .eq('business_id', id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (fc) {
          budgetForecast = fc
          break
        }
      }
    }

    const hasBudget = !!budgetForecast
    if (budgetForecast) {
      budgetForecastName = budgetForecast.name
      const { data: bLines } = await supabase
        .from('forecast_pl_lines')
        .select('id, account_name, category, forecast_months')
        .eq('forecast_id', budgetForecast.id)
      budgetPLLines = bLines || []
    }

    // 4. Load xero_pl_lines (actuals) — deduplicate by account_name
    //    Duplicate rows can occur if sync-xero and sync-all race against each other
    const { data: rawXeroLines, error: xeroErr } = await supabase
      .from('xero_pl_lines')
      .select('account_name, account_type, section, monthly_values')
      .eq('business_id', business_id)

    if (xeroErr) {
      console.error('[Report Generate] Error loading xero_pl_lines:', xeroErr)
      return NextResponse.json({ error: 'Failed to load Xero actuals' }, { status: 500 })
    }

    // Deduplicate: keep one row per account_name (merge monthly_values if needed)
    const xeroDedup = new Map<string, { account_name: string; account_type: string; section: string; monthly_values: Record<string, number> }>()
    for (const row of (rawXeroLines || [])) {
      const existing = xeroDedup.get(row.account_name)
      if (existing) {
        // Merge monthly_values — later values overwrite earlier ones
        existing.monthly_values = { ...existing.monthly_values, ...row.monthly_values }
      } else {
        xeroDedup.set(row.account_name, { ...row })
      }
    }
    const xeroLines = Array.from(xeroDedup.values())

    if (rawXeroLines && rawXeroLines.length !== xeroLines.length) {
      console.warn(`[Report Generate] Deduplicated xero_pl_lines: ${rawXeroLines.length} rows → ${xeroLines.length} unique accounts`)
    }

    // 5. Build lookup maps
    const mappingByXeroName = new Map<string, any>()
    for (const m of mappings) {
      mappingByXeroName.set(m.xero_account_name, m)
    }

    // Budget lines lookup by various keys
    const budgetById = new Map<string, any>()
    for (const bl of budgetPLLines) {
      budgetById.set(bl.id, bl)
    }
    // Fuzzy lookup handles "Wages & Salaries" vs "Salaries & Wages" etc.
    const findBudgetByName = buildFuzzyLookup(budgetPLLines, (bl) => bl.account_name)

    // FY range — parameterized by business fiscal_year_start
    const allFYMonths = generateFiscalMonthKeys(fiscal_year, yearStartMonth)
    const fyStart = allFYMonths[0]
    const fyEnd = allFYMonths[allFYMonths.length - 1]
    const ytdMonths = getMonthRange(fyStart, report_month)
    const priorYearMonth = getPriorYearMonth(report_month)
    const nextMonth = getNextMonth(report_month)

    console.log('[Report Generate] Data loaded:', {
      xeroLines: xeroLines?.length || 0,
      budgetPLLines: budgetPLLines.length,
      mappings: mappings.length,
      mappingsWithForecastLink: mappings.filter((m: any) => m.forecast_pl_line_id).length,
      report_month,
      fiscal_year,
      yearStartMonth,
      fyStart,
      fyEnd,
      sampleXeroMonths: xeroLines?.[0]?.monthly_values ? Object.keys(xeroLines[0].monthly_values).slice(0, 5) : [],
      sampleBudgetMonths: budgetPLLines[0]?.forecast_months ? Object.keys(budgetPLLines[0].forecast_months).slice(0, 5) : [],
    })

    // Track which budget lines were matched (for budget-only section later)
    const matchedBudgetLineIds = new Set<string>()
    // Also track matched budget line names (lowercase) — handles duplicate forecast lines
    // with the same name but different IDs
    const matchedBudgetLineNames = new Set<string>()
    // Track which budget lines have already had their budget values assigned to a Xero line.
    // This prevents the same forecast line's budget from being counted multiple times when
    // multiple Xero accounts fuzzy-match to the same forecast line.
    const claimedBudgetLineIds = new Set<string>()
    const matchLog: { xero: string; budget: string | null; method: string; budgetClaimed: boolean }[] = []

    // 6. Process each Xero actual line
    const categoryLines: Record<string, ReportLine[]> = {
      'Revenue': [],
      'Cost of Sales': [],
      'Operating Expenses': [],
      'Other Income': [],
      'Other Expenses': [],
    }

    for (const xero of (xeroLines || [])) {
      const mapping = mappingByXeroName.get(xero.account_name)
      const category = mapping?.report_category || mapTypeToCategory(xero.account_type)
      const isRevenue = category === 'Revenue' || category === 'Other Income'
      const monthlyValues: Record<string, number> = xero.monthly_values || {}

      // Non-cash items — show actuals only, no budget
      const lowerName = xero.account_name.toLowerCase()
      const excludeFromBudget = lowerName.includes('depreciation') || lowerName.includes('amortisation') || lowerName.includes('amortization')

      // Find matching budget line (tries: direct ID → mapping name → fuzzy name match)
      let budgetLine: any = null
      let matchMethod = 'none'
      if (!excludeFromBudget) {
        if (mapping?.forecast_pl_line_id) {
          budgetLine = budgetById.get(mapping.forecast_pl_line_id)
          if (budgetLine) matchMethod = 'forecast_pl_line_id'
        }
        if (!budgetLine && mapping?.forecast_pl_line_name) {
          budgetLine = findBudgetByName(mapping.forecast_pl_line_name)
          if (budgetLine) matchMethod = 'forecast_pl_line_name'
        }
        if (!budgetLine) {
          budgetLine = findBudgetByName(xero.account_name)
          if (budgetLine) matchMethod = 'name_fallback'
        }
      }

      if (budgetLine) {
        matchedBudgetLineIds.add(budgetLine.id)
        matchedBudgetLineNames.add(budgetLine.account_name.toLowerCase())
      }

      // Prevent double-counting: if this budget line's values were already assigned
      // to another Xero account, this Xero line gets actuals only (budget = 0).
      const budgetAlreadyClaimed = budgetLine && claimedBudgetLineIds.has(budgetLine.id)
      if (budgetLine && !budgetAlreadyClaimed) {
        claimedBudgetLineIds.add(budgetLine.id)
      }

      matchLog.push({
        xero: xero.account_name,
        budget: budgetLine?.account_name || null,
        method: matchMethod,
        budgetClaimed: !budgetAlreadyClaimed,
      })

      if (budgetAlreadyClaimed) {
        console.warn(`[Report Generate] Budget line "${budgetLine.account_name}" already claimed — skipping budget for Xero account "${xero.account_name}"`)
      }

      // Only use budget values if this is the first Xero account to claim this budget line
      const budgetMonths: Record<string, number> = (budgetLine && !budgetAlreadyClaimed) ? (budgetLine.forecast_months || {}) : {}

      // Monthly values
      const actual = monthlyValues[report_month] || 0
      const budget = budgetMonths[report_month] || 0
      const { amount: varAmt, percent: varPct } = calcVariance(actual, budget, isRevenue)

      // YTD
      const ytdActual = ytdMonths.reduce((s, m) => s + (monthlyValues[m] || 0), 0)
      const ytdBudget = ytdMonths.reduce((s, m) => s + (budgetMonths[m] || 0), 0)
      const { amount: ytdVarAmt, percent: ytdVarPct } = calcVariance(ytdActual, ytdBudget, isRevenue)

      // Annual total (full FY from budget)
      const budgetAnnualTotal = allFYMonths.reduce((s, m) => s + (budgetMonths[m] || 0), 0)

      // Unspent budget
      const unspentBudget = budgetAnnualTotal - ytdActual

      // Budget next month
      const budgetNextMonth = budgetMonths[nextMonth] || 0

      // Prior year
      const priorYear = monthlyValues[priorYearMonth] !== undefined ? (monthlyValues[priorYearMonth] || 0) : null

      const line: ReportLine = {
        account_name: xero.account_name,
        xero_account_name: xero.account_name,
        is_budget_only: false,
        actual,
        budget,
        variance_amount: varAmt,
        variance_percent: varPct,
        ytd_actual: ytdActual,
        ytd_budget: ytdBudget,
        ytd_variance_amount: ytdVarAmt,
        ytd_variance_percent: ytdVarPct,
        unspent_budget: unspentBudget,
        budget_next_month: budgetNextMonth,
        budget_annual_total: budgetAnnualTotal,
        prior_year: priorYear,
      }

      if (categoryLines[category]) {
        categoryLines[category].push(line)
      } else {
        categoryLines['Operating Expenses'].push(line)
      }
    }

    // 7. Add budget-only lines (forecast lines with no matching Xero actual)
    // Also track by name to prevent duplicate forecast lines (same name, different ID)
    // from adding budget values twice.
    const addedBudgetOnlyNames = new Set<string>()
    if (hasBudget) {
      for (const bl of budgetPLLines) {
        if (matchedBudgetLineIds.has(bl.id)) continue

        // Skip if a forecast line with this same name was already matched to a Xero account
        // or already added as budget-only (handles duplicate forecast_pl_lines rows)
        const blNameLower = bl.account_name.toLowerCase()
        if (matchedBudgetLineNames.has(blNameLower)) continue
        if (addedBudgetOnlyNames.has(blNameLower)) continue
        addedBudgetOnlyNames.add(blNameLower)

        const budgetMonths: Record<string, number> = bl.forecast_months || {}
        const category = bl.category || 'Operating Expenses'
        const isRevenue = category === 'Revenue' || category === 'Other Income'

        const budget = budgetMonths[report_month] || 0
        const ytdBudget = ytdMonths.reduce((s, m) => s + (budgetMonths[m] || 0), 0)
        const budgetAnnualTotal = allFYMonths.reduce((s, m) => s + (budgetMonths[m] || 0), 0)
        const budgetNextMonth = budgetMonths[nextMonth] || 0

        // Skip lines with zero budget everywhere
        if (budgetAnnualTotal === 0 && budget === 0) continue

        const { amount: varAmt, percent: varPct } = calcVariance(0, budget, isRevenue)
        const { amount: ytdVarAmt, percent: ytdVarPct } = calcVariance(0, ytdBudget, isRevenue)

        const line: ReportLine = {
          account_name: bl.account_name,
          xero_account_name: null,
          is_budget_only: true,
          actual: 0,
          budget,
          variance_amount: varAmt,
          variance_percent: varPct,
          ytd_actual: 0,
          ytd_budget: ytdBudget,
          ytd_variance_amount: ytdVarAmt,
          ytd_variance_percent: ytdVarPct,
          unspent_budget: budgetAnnualTotal,
          budget_next_month: budgetNextMonth,
          budget_annual_total: budgetAnnualTotal,
          prior_year: null,
        }

        if (categoryLines[category]) {
          categoryLines[category].push(line)
        } else {
          categoryLines['Operating Expenses'].push(line)
        }
      }
    }

    // 8. Build sections with subtotals
    const sectionOrder = ['Revenue', 'Cost of Sales', 'Operating Expenses', 'Other Income', 'Other Expenses']
    const sections = sectionOrder
      .filter(cat => categoryLines[cat] && categoryLines[cat].length > 0)
      .map(cat => {
        const lines = categoryLines[cat].sort((a, b) => a.account_name.localeCompare(b.account_name))
        const isRev = cat === 'Revenue' || cat === 'Other Income'
        const subtotal = buildSubtotal(lines, `Total ${cat}`)
        // Calculate subtotal variance percent
        subtotal.variance_percent = subtotal.budget !== 0
          ? (subtotal.variance_amount / Math.abs(subtotal.budget)) * 100 : 0
        subtotal.ytd_variance_percent = subtotal.ytd_budget !== 0
          ? (subtotal.ytd_variance_amount / Math.abs(subtotal.ytd_budget)) * 100 : 0

        return { category: cat, lines, subtotal }
      })

    // 9. Compute Gross Profit and Net Profit rows
    const revSection = sections.find(s => s.category === 'Revenue')
    const cogsSection = sections.find(s => s.category === 'Cost of Sales')
    const opexSection = sections.find(s => s.category === 'Operating Expenses')
    const otherIncSection = sections.find(s => s.category === 'Other Income')
    const otherExpSection = sections.find(s => s.category === 'Other Expenses')

    const revActual = (revSection?.subtotal.actual || 0) + (otherIncSection?.subtotal.actual || 0)
    const revBudget = (revSection?.subtotal.budget || 0) + (otherIncSection?.subtotal.budget || 0)
    const cogsActual = cogsSection?.subtotal.actual || 0
    const cogsBudget = cogsSection?.subtotal.budget || 0
    const opexActual = (opexSection?.subtotal.actual || 0) + (otherExpSection?.subtotal.actual || 0)
    const opexBudget = (opexSection?.subtotal.budget || 0) + (otherExpSection?.subtotal.budget || 0)

    const gpActual = revActual - cogsActual
    const gpBudget = revBudget - cogsBudget
    const npActual = gpActual - opexActual
    const npBudget = gpBudget - opexBudget

    // YTD versions
    const revYtdActual = (revSection?.subtotal.ytd_actual || 0) + (otherIncSection?.subtotal.ytd_actual || 0)
    const revYtdBudget = (revSection?.subtotal.ytd_budget || 0) + (otherIncSection?.subtotal.ytd_budget || 0)
    const cogsYtdActual = cogsSection?.subtotal.ytd_actual || 0
    const cogsYtdBudget = cogsSection?.subtotal.ytd_budget || 0
    const opexYtdActual = (opexSection?.subtotal.ytd_actual || 0) + (otherExpSection?.subtotal.ytd_actual || 0)
    const opexYtdBudget = (opexSection?.subtotal.ytd_budget || 0) + (otherExpSection?.subtotal.ytd_budget || 0)

    const gpYtdActual = revYtdActual - cogsYtdActual
    const gpYtdBudget = revYtdBudget - cogsYtdBudget
    const npYtdActual = gpYtdActual - opexYtdActual
    const npYtdBudget = gpYtdBudget - opexYtdBudget

    // Annual totals
    const revAnnual = (revSection?.subtotal.budget_annual_total || 0) + (otherIncSection?.subtotal.budget_annual_total || 0)
    const cogsAnnual = cogsSection?.subtotal.budget_annual_total || 0
    const opexAnnual = (opexSection?.subtotal.budget_annual_total || 0) + (otherExpSection?.subtotal.budget_annual_total || 0)

    // Prior year for profit rows
    const revPriorYear = (revSection?.subtotal.prior_year ?? 0) + (otherIncSection?.subtotal.prior_year ?? 0)
    const cogsPriorYear = cogsSection?.subtotal.prior_year ?? 0
    const opexPriorYear = (opexSection?.subtotal.prior_year ?? 0) + (otherExpSection?.subtotal.prior_year ?? 0)
    const hasPriorYearData = [revSection, cogsSection, opexSection, otherIncSection, otherExpSection]
      .some(s => s?.subtotal.prior_year !== null && s?.subtotal.prior_year !== undefined)
    const gpPriorYear = hasPriorYearData ? revPriorYear - cogsPriorYear : null
    const npPriorYear = hasPriorYearData ? revPriorYear - cogsPriorYear - opexPriorYear : null

    const gpRow: ReportLine = {
      account_name: 'Gross Profit',
      is_budget_only: false,
      actual: gpActual,
      budget: gpBudget,
      variance_amount: gpActual - gpBudget,
      variance_percent: gpBudget !== 0 ? ((gpActual - gpBudget) / Math.abs(gpBudget)) * 100 : 0,
      ytd_actual: gpYtdActual,
      ytd_budget: gpYtdBudget,
      ytd_variance_amount: gpYtdActual - gpYtdBudget,
      ytd_variance_percent: gpYtdBudget !== 0 ? ((gpYtdActual - gpYtdBudget) / Math.abs(gpYtdBudget)) * 100 : 0,
      unspent_budget: (revAnnual - cogsAnnual) - gpYtdActual,
      budget_next_month: (revSection?.subtotal.budget_next_month || 0) - (cogsSection?.subtotal.budget_next_month || 0),
      budget_annual_total: revAnnual - cogsAnnual,
      prior_year: gpPriorYear,
    }

    const npRow: ReportLine = {
      account_name: 'Net Profit',
      is_budget_only: false,
      actual: npActual,
      budget: npBudget,
      variance_amount: npActual - npBudget,
      variance_percent: npBudget !== 0 ? ((npActual - npBudget) / Math.abs(npBudget)) * 100 : 0,
      ytd_actual: npYtdActual,
      ytd_budget: npYtdBudget,
      ytd_variance_amount: npYtdActual - npYtdBudget,
      ytd_variance_percent: npYtdBudget !== 0 ? ((npYtdActual - npYtdBudget) / Math.abs(npYtdBudget)) * 100 : 0,
      unspent_budget: (revAnnual - cogsAnnual - opexAnnual) - npYtdActual,
      budget_next_month: (revSection?.subtotal.budget_next_month || 0) - (cogsSection?.subtotal.budget_next_month || 0) - (opexSection?.subtotal.budget_next_month || 0),
      budget_annual_total: revAnnual - cogsAnnual - opexAnnual,
      prior_year: npPriorYear,
    }

    // 10. Build summary
    const summary = {
      revenue: {
        actual: revActual,
        budget: revBudget,
        variance: revActual - revBudget,
        variance_percent: revBudget !== 0 ? ((revActual - revBudget) / Math.abs(revBudget)) * 100 : 0,
      },
      cogs: {
        actual: cogsActual,
        budget: cogsBudget,
        variance: cogsBudget - cogsActual,
        variance_percent: cogsBudget !== 0 ? ((cogsBudget - cogsActual) / Math.abs(cogsBudget)) * 100 : 0,
      },
      gross_profit: {
        actual: gpActual,
        budget: gpBudget,
        variance: gpActual - gpBudget,
        gp_percent: revActual !== 0 ? (gpActual / revActual) * 100 : 0,
      },
      opex: {
        actual: opexActual,
        budget: opexBudget,
        variance: opexBudget - opexActual,
        variance_percent: opexBudget !== 0 ? ((opexBudget - opexActual) / Math.abs(opexBudget)) * 100 : 0,
      },
      net_profit: {
        actual: npActual,
        budget: npBudget,
        variance: npActual - npBudget,
        np_percent: revActual !== 0 ? (npActual / revActual) * 100 : 0,
      },
    }

    // Debug: log match results
    const matched = matchLog.filter(m => m.method !== 'none')
    const unmatched = matchLog.filter(m => m.method === 'none')
    const duplicateBudgetMatches = matchLog.filter(m => m.method !== 'none' && !m.budgetClaimed)
    const unmatchedBudgetLines = budgetPLLines.filter(bl => !matchedBudgetLineIds.has(bl.id))
    const skippedByName = unmatchedBudgetLines.filter(bl => matchedBudgetLineNames.has(bl.account_name.toLowerCase()))
    const skippedByDupName = unmatchedBudgetLines.filter(bl => !matchedBudgetLineNames.has(bl.account_name.toLowerCase()) && addedBudgetOnlyNames.has(bl.account_name.toLowerCase()) === false)

    console.log('[Report Generate] Matching results:', {
      xeroAccountsTotal: matchLog.length,
      matchedToBudget: matched.length,
      unmatchedXero: unmatched.length,
      unmatchedBudgetLines: unmatchedBudgetLines.length,
      budgetDuplicatesBlocked: duplicateBudgetMatches.length,
      budgetOnlySkippedByName: skippedByName.length,
      budgetOnlyAdded: addedBudgetOnlyNames.size,
      matchMethods: {
        forecast_pl_line_id: matched.filter(m => m.method === 'forecast_pl_line_id').length,
        forecast_pl_line_name: matched.filter(m => m.method === 'forecast_pl_line_name').length,
        name_fallback: matched.filter(m => m.method === 'name_fallback').length,
      },
      budgetOnlySkippedNames: skippedByName.map(bl => bl.account_name),
      unmatchedXeroSample: unmatched.slice(0, 10).map(m => m.xero),
      unmatchedBudgetSample: unmatchedBudgetLines.filter(bl => !matchedBudgetLineNames.has(bl.account_name.toLowerCase())).slice(0, 10).map((bl: any) => bl.account_name),
    })

    const report = {
      business_id,
      report_month,
      fiscal_year,
      settings,
      sections,
      summary,
      gross_profit_row: gpRow,
      net_profit_row: npRow,
      is_draft: force_draft || false,
      unreconciled_count: 0,
      has_budget: hasBudget,
      budget_forecast_name: budgetForecastName,
    }

    return NextResponse.json({
      success: true,
      report,
      _debug: {
        xero_accounts: matchLog.length,
        budget_lines: budgetPLLines.length,
        matched: matched.length,
        unmatched_xero: unmatched.map(m => m.xero),
        unmatched_budget: unmatchedBudgetLines.map((bl: any) => bl.account_name),
        match_detail: matchLog,
      }
    })

  } catch (error) {
    console.error('[Report Generate] Error:', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
