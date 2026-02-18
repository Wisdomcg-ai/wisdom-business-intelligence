import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildFuzzyLookup } from '@/lib/utils/account-matching'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// ===== Helper functions (shared logic with generate route) =====

function getFYStartMonth(fiscalYear: number): string {
  return `${fiscalYear - 1}-07`
}

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

interface FullYearMonthData {
  month: string
  actual: number
  budget: number
  source: 'actual' | 'forecast'
}

interface FullYearLine {
  account_name: string
  category: string
  months: FullYearMonthData[]
  projected_total: number
  annual_budget: number
  variance_amount: number
  variance_percent: number
}

function buildFullYearSubtotal(lines: FullYearLine[], label: string, category: string, allMonths: string[]): FullYearLine {
  const months: FullYearMonthData[] = allMonths.map((m, i) => ({
    month: m,
    actual: lines.reduce((s, l) => s + l.months[i].actual, 0),
    budget: lines.reduce((s, l) => s + l.months[i].budget, 0),
    source: lines.length > 0 ? lines[0].months[i].source : 'forecast' as const,
  }))

  const projectedTotal = lines.reduce((s, l) => s + l.projected_total, 0)
  const annualBudget = lines.reduce((s, l) => s + l.annual_budget, 0)
  const varianceAmount = projectedTotal - annualBudget
  const variancePercent = annualBudget !== 0 ? (varianceAmount / Math.abs(annualBudget)) * 100 : 0

  return {
    account_name: label,
    category,
    months,
    projected_total: projectedTotal,
    annual_budget: annualBudget,
    variance_amount: varianceAmount,
    variance_percent: variancePercent,
  }
}

/**
 * POST /api/monthly-report/full-year
 * Generates a 12-month full year projection report
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { business_id, fiscal_year } = body

    if (!business_id || !fiscal_year) {
      return NextResponse.json(
        { error: 'business_id and fiscal_year are required' },
        { status: 400 }
      )
    }

    // FY range: Jul (FY-1) to Jun (FY)
    const fyStart = getFYStartMonth(fiscal_year)
    const fyEnd = `${fiscal_year}-06`
    const allFYMonths = getMonthRange(fyStart, fyEnd)

    // Determine the last actual month (current month or earlier)
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    // Last actual month is the lesser of current month and FY end
    const lastActualMonth = currentMonth <= fyEnd ? currentMonth : fyEnd

    // 1. Load settings to determine budget forecast
    const { data: settingsRow } = await supabase
      .from('monthly_report_settings')
      .select('*')
      .eq('business_id', business_id)
      .maybeSingle()

    // 2. Load account mappings
    const { data: mappings, error: mappingsErr } = await supabase
      .from('account_mappings')
      .select('*')
      .eq('business_id', business_id)

    if (mappingsErr) {
      console.error('[Full Year] Error loading mappings:', mappingsErr)
      return NextResponse.json({ error: 'Failed to load account mappings', detail: mappingsErr.message }, { status: 500 })
    }

    // 3. Load budget forecast
    let budgetForecast: any = null
    let budgetPLLines: any[] = []

    if (settingsRow?.budget_forecast_id) {
      const { data: fc } = await supabase
        .from('financial_forecasts')
        .select('id, name')
        .eq('id', settingsRow.budget_forecast_id)
        .single()
      budgetForecast = fc
    } else {
      const { data: fc } = await supabase
        .from('financial_forecasts')
        .select('id, name')
        .eq('business_id', business_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      budgetForecast = fc
    }

    if (budgetForecast) {
      const { data: bLines } = await supabase
        .from('forecast_pl_lines')
        .select('id, account_name, category, forecast_months')
        .eq('forecast_id', budgetForecast.id)
      budgetPLLines = bLines || []
    }

    // 4. Load xero_pl_lines (actuals)
    const { data: xeroLines, error: xeroErr } = await supabase
      .from('xero_pl_lines')
      .select('account_name, account_type, section, monthly_values')
      .eq('business_id', business_id)

    if (xeroErr) {
      console.error('[Full Year] Error loading xero_pl_lines:', xeroErr)
      // If the table doesn't exist yet, treat as empty (no actuals synced)
    }

    // 5. Build lookup maps
    const mappingByXeroName = new Map<string, any>()
    for (const m of (mappings || [])) {
      mappingByXeroName.set(m.xero_account_name, m)
    }

    const budgetById = new Map<string, any>()
    for (const bl of budgetPLLines) {
      budgetById.set(bl.id, bl)
    }
    const findBudgetByName = buildFuzzyLookup(budgetPLLines, (bl) => bl.account_name)

    const matchedBudgetLineIds = new Set<string>()

    // 6. Process each Xero line into full-year format
    const categoryLines: Record<string, FullYearLine[]> = {
      'Revenue': [],
      'Cost of Sales': [],
      'Operating Expenses': [],
      'Other Income': [],
      'Other Expenses': [],
    }

    for (const xero of (xeroLines || [])) {
      const mapping = mappingByXeroName.get(xero.account_name)
      const category = mapping?.report_category || mapTypeToCategory(xero.account_type)
      const monthlyValues: Record<string, number> = xero.monthly_values || {}

      // Find matching budget line
      let budgetLine: any = null
      if (mapping?.forecast_pl_line_id) {
        budgetLine = budgetById.get(mapping.forecast_pl_line_id)
      }
      if (!budgetLine && mapping?.forecast_pl_line_name) {
        budgetLine = findBudgetByName(mapping.forecast_pl_line_name)
      }
      if (!budgetLine) {
        budgetLine = findBudgetByName(xero.account_name)
      }

      if (budgetLine) matchedBudgetLineIds.add(budgetLine.id)
      const budgetMonths: Record<string, number> = budgetLine?.forecast_months || {}

      // Build 12 month entries
      const months: FullYearMonthData[] = allFYMonths.map(m => {
        const isActualMonth = m <= lastActualMonth && m >= fyStart
        return {
          month: m,
          actual: isActualMonth ? (monthlyValues[m] || 0) : 0,
          budget: budgetMonths[m] || 0,
          source: isActualMonth ? 'actual' as const : 'forecast' as const,
        }
      })

      // Projected total = actuals for past months + budget for future months
      const projectedTotal = months.reduce((s, md) =>
        s + (md.source === 'actual' ? md.actual : md.budget), 0)
      const annualBudget = months.reduce((s, md) => s + md.budget, 0)
      const isRevenue = category === 'Revenue' || category === 'Other Income'
      const varianceAmount = isRevenue
        ? projectedTotal - annualBudget
        : annualBudget - projectedTotal
      const variancePercent = annualBudget !== 0
        ? (varianceAmount / Math.abs(annualBudget)) * 100 : 0

      const line: FullYearLine = {
        account_name: xero.account_name,
        category,
        months,
        projected_total: projectedTotal,
        annual_budget: annualBudget,
        variance_amount: varianceAmount,
        variance_percent: variancePercent,
      }

      if (categoryLines[category]) {
        categoryLines[category].push(line)
      } else {
        categoryLines['Operating Expenses'].push(line)
      }
    }

    // 7. Add budget-only lines
    for (const bl of budgetPLLines) {
      if (matchedBudgetLineIds.has(bl.id)) continue

      const budgetMonths: Record<string, number> = bl.forecast_months || {}
      const category = bl.category || 'Operating Expenses'
      const isRevenue = category === 'Revenue' || category === 'Other Income'

      const annualBudget = allFYMonths.reduce((s, m) => s + (budgetMonths[m] || 0), 0)
      if (annualBudget === 0) continue

      const months: FullYearMonthData[] = allFYMonths.map(m => ({
        month: m,
        actual: 0,
        budget: budgetMonths[m] || 0,
        source: (m <= lastActualMonth ? 'actual' : 'forecast') as 'actual' | 'forecast',
      }))

      // For budget-only, projected = budget for future months (0 actuals for past)
      const projectedTotal = months.reduce((s, md) =>
        s + (md.source === 'actual' ? 0 : md.budget), 0)
      const varianceAmount = isRevenue
        ? projectedTotal - annualBudget
        : annualBudget - projectedTotal
      const variancePercent = annualBudget !== 0
        ? (varianceAmount / Math.abs(annualBudget)) * 100 : 0

      const line: FullYearLine = {
        account_name: bl.account_name,
        category,
        months,
        projected_total: projectedTotal,
        annual_budget: annualBudget,
        variance_amount: varianceAmount,
        variance_percent: variancePercent,
      }

      if (categoryLines[category]) {
        categoryLines[category].push(line)
      } else {
        categoryLines['Operating Expenses'].push(line)
      }
    }

    // 8. Build sections
    const sectionOrder = ['Revenue', 'Cost of Sales', 'Operating Expenses', 'Other Income', 'Other Expenses']
    const sections = sectionOrder
      .filter(cat => categoryLines[cat] && categoryLines[cat].length > 0)
      .map(cat => {
        const lines = categoryLines[cat].sort((a, b) => a.account_name.localeCompare(b.account_name))
        const subtotal = buildFullYearSubtotal(lines, `Total ${cat}`, cat, allFYMonths)

        // Recalculate variance with correct sign convention for expense subtotals
        const isRevenue = cat === 'Revenue' || cat === 'Other Income'
        subtotal.variance_amount = isRevenue
          ? subtotal.projected_total - subtotal.annual_budget
          : subtotal.annual_budget - subtotal.projected_total
        subtotal.variance_percent = subtotal.annual_budget !== 0
          ? (subtotal.variance_amount / Math.abs(subtotal.annual_budget)) * 100 : 0

        return { category: cat, lines, subtotal }
      })

    // 9. Compute GP and NP rows
    const revSection = sections.find(s => s.category === 'Revenue')
    const cogsSection = sections.find(s => s.category === 'Cost of Sales')
    const opexSection = sections.find(s => s.category === 'Operating Expenses')
    const otherIncSection = sections.find(s => s.category === 'Other Income')
    const otherExpSection = sections.find(s => s.category === 'Other Expenses')

    const gpMonths: FullYearMonthData[] = allFYMonths.map((m, i) => {
      const revActual = (revSection?.subtotal.months[i].actual || 0) + (otherIncSection?.subtotal.months[i].actual || 0)
      const revBudget = (revSection?.subtotal.months[i].budget || 0) + (otherIncSection?.subtotal.months[i].budget || 0)
      const cogsActual = cogsSection?.subtotal.months[i].actual || 0
      const cogsBudget = cogsSection?.subtotal.months[i].budget || 0
      const source = revSection?.subtotal.months[i].source || 'forecast' as const
      return {
        month: m,
        actual: revActual - cogsActual,
        budget: revBudget - cogsBudget,
        source,
      }
    })

    const gpProjected = gpMonths.reduce((s, md) =>
      s + (md.source === 'actual' ? md.actual : md.budget), 0)
    const gpAnnualBudget = gpMonths.reduce((s, md) => s + md.budget, 0)

    const grossProfit: FullYearLine = {
      account_name: 'Gross Profit',
      category: 'Gross Profit',
      months: gpMonths,
      projected_total: gpProjected,
      annual_budget: gpAnnualBudget,
      variance_amount: gpProjected - gpAnnualBudget,
      variance_percent: gpAnnualBudget !== 0 ? ((gpProjected - gpAnnualBudget) / Math.abs(gpAnnualBudget)) * 100 : 0,
    }

    const npMonths: FullYearMonthData[] = allFYMonths.map((m, i) => {
      const gpActual = gpMonths[i].actual
      const gpBudget = gpMonths[i].budget
      const opexActual = (opexSection?.subtotal.months[i].actual || 0) + (otherExpSection?.subtotal.months[i].actual || 0)
      const opexBudget = (opexSection?.subtotal.months[i].budget || 0) + (otherExpSection?.subtotal.months[i].budget || 0)
      return {
        month: m,
        actual: gpActual - opexActual,
        budget: gpBudget - opexBudget,
        source: gpMonths[i].source,
      }
    })

    const npProjected = npMonths.reduce((s, md) =>
      s + (md.source === 'actual' ? md.actual : md.budget), 0)
    const npAnnualBudget = npMonths.reduce((s, md) => s + md.budget, 0)

    const netProfit: FullYearLine = {
      account_name: 'Net Profit',
      category: 'Net Profit',
      months: npMonths,
      projected_total: npProjected,
      annual_budget: npAnnualBudget,
      variance_amount: npProjected - npAnnualBudget,
      variance_percent: npAnnualBudget !== 0 ? ((npProjected - npAnnualBudget) / Math.abs(npAnnualBudget)) * 100 : 0,
    }

    const report = {
      business_id,
      fiscal_year,
      last_actual_month: lastActualMonth,
      sections,
      gross_profit: grossProfit,
      net_profit: netProfit,
    }

    return NextResponse.json({ success: true, report })

  } catch (error) {
    console.error('[Full Year] Error:', error)
    return NextResponse.json({ error: 'Failed to generate full year projection' }, { status: 500 })
  }
}
