/**
 * Forecast Wizard V4 Generate API
 *
 * Saves the forecast with full assumptions in JSONB format.
 * Supports scenario planning through the assumptions structure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import type { ForecastAssumptions } from '@/app/finances/forecast/components/wizard-v4/types/assumptions';

interface GenerateV4Request {
  businessId: string;
  fiscalYear: number;
  forecastDuration: 1 | 2 | 3;
  forecastId?: string; // Optional - if provided, update this specific forecast
  forecastName?: string; // Optional - custom name for the forecast
  createNew?: boolean; // If true, always create a new forecast (for "Save As" feature)
  isDraft?: boolean; // If true, save as draft (don't mark complete, avoids trigger)
  assumptions: ForecastAssumptions;
  summary: {
    year1: YearlySummary;
    year2?: YearlySummary;
    year3?: YearlySummary;
  };
}

interface YearlySummary {
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossProfitPct: number;
  teamCosts: number;
  opex: number;
  depreciation: number;
  otherExpenses: number;
  netProfit: number;
  netProfitPct: number;
}

/**
 * Generate month keys for a fiscal year (July to June)
 */
function generateMonthKeys(fiscalYear: number): string[] {
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const month = ((6 + i) % 12) + 1; // Start from July (7)
    const year = month >= 7 ? fiscalYear - 1 : fiscalYear;
    months.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return months;
}

/**
 * Distribute an annual amount across months using seasonality pattern
 */
function distributeWithSeasonality(
  annualAmount: number,
  seasonalityPattern: number[],
  months: string[]
): { [key: string]: number } {
  const result: { [key: string]: number } = {};
  const sum = seasonalityPattern.reduce((a, b) => a + b, 0);

  months.forEach((m, i) => {
    const percentage = (seasonalityPattern[i] || 8.33) / sum;
    result[m] = Math.round(annualAmount * percentage * 100) / 100;
  });

  return result;
}

/**
 * Convert wizard assumptions to P&L lines
 */
function generatePLLines(
  assumptions: ForecastAssumptions,
  summary: GenerateV4Request['summary'],
  fiscalYear: number
) {
  const months = generateMonthKeys(fiscalYear);
  const lines: any[] = [];
  let sortOrder = 1;

  // 1. Revenue lines
  assumptions.revenue.lines.forEach((line) => {
    const annualAmount = line.priorYearTotal * (1 + (line.growthPct || 0) / 100);
    lines.push({
      account_name: line.accountName,
      account_code: line.accountId,
      category: 'Revenue',
      account_type: 'REVENUE',
      actual_months: {},
      forecast_months: distributeWithSeasonality(annualAmount, assumptions.revenue.seasonalityPattern, months),
      forecast_method: {
        method: line.growthType === 'percentage' ? 'growth_rate' : 'fixed_growth',
        growth_pct: line.growthPct,
        fixed_growth: line.fixedGrowthAmount,
        seasonality_source: assumptions.revenue.seasonalitySource,
      },
      is_from_xero: true,
      sort_order: sortOrder++,
    });
  });

  // If no revenue lines, create a summary revenue line
  if (assumptions.revenue.lines.length === 0 && summary.year1.revenue > 0) {
    lines.push({
      account_name: 'Sales Revenue',
      account_code: '4000',
      category: 'Revenue',
      account_type: 'REVENUE',
      actual_months: {},
      forecast_months: distributeWithSeasonality(summary.year1.revenue, assumptions.revenue.seasonalityPattern, months),
      forecast_method: { method: 'straight_line' },
      sort_order: sortOrder++,
    });
  }

  // 2. COGS lines
  const totalRevenue = summary.year1.revenue;
  assumptions.cogs.lines.forEach((line) => {
    let annualAmount: number;
    if (line.costBehavior === 'variable') {
      annualAmount = totalRevenue * ((line.percentOfRevenue || 0) / 100);
    } else {
      annualAmount = (line.monthlyAmount || 0) * 12;
    }

    lines.push({
      account_name: line.accountName,
      account_code: line.accountId,
      category: 'Cost of Sales',
      account_type: 'COGS',
      actual_months: {},
      forecast_months: line.costBehavior === 'variable'
        ? distributeWithSeasonality(annualAmount, assumptions.revenue.seasonalityPattern, months)
        : distributeEvenly(annualAmount, months),
      forecast_method: {
        method: line.costBehavior === 'variable' ? 'driver_based' : 'straight_line',
        driver_percentage: line.percentOfRevenue,
        cost_behavior: line.costBehavior,
      },
      is_from_xero: true,
      sort_order: 100 + sortOrder++,
    });
  });

  // 3. Team costs (wages lines)
  const totalTeamCost = summary.year1.teamCosts;
  if (totalTeamCost > 0) {
    lines.push({
      account_name: 'Salaries & Wages',
      account_code: '6100',
      category: 'Operating Expenses',
      account_type: 'EXPENSE',
      actual_months: {},
      forecast_months: distributeEvenly(totalTeamCost, months),
      forecast_method: {
        method: 'straight_line',
        base_amount: totalTeamCost / 12,
        includes_super: true,
      },
      is_from_payroll: true,
      sort_order: 200,
    });
  }

  // 4. OpEx lines
  assumptions.opex.lines.forEach((line) => {
    let annualAmount: number;
    let distribution: { [key: string]: number };

    switch (line.costBehavior) {
      case 'fixed':
        annualAmount = (line.monthlyAmount || 0) * 12;
        distribution = distributeEvenly(annualAmount, months);
        break;
      case 'variable':
        annualAmount = totalRevenue * ((line.percentOfRevenue || 0) / 100);
        distribution = distributeWithSeasonality(annualAmount, assumptions.revenue.seasonalityPattern, months);
        break;
      case 'adhoc':
        annualAmount = line.expectedAnnualAmount || 0;
        distribution = line.expectedMonths?.length
          ? distributeToSpecificMonths(annualAmount, line.expectedMonths, months)
          : distributeEvenly(annualAmount, months);
        break;
      default:
        annualAmount = line.priorYearTotal;
        distribution = distributeEvenly(annualAmount, months);
    }

    lines.push({
      account_name: line.accountName,
      account_code: line.accountId,
      category: 'Operating Expenses',
      account_type: 'EXPENSE',
      actual_months: {},
      forecast_months: distribution,
      forecast_method: {
        method: line.costBehavior === 'variable' ? 'driver_based' : 'straight_line',
        cost_behavior: line.costBehavior,
        driver_percentage: line.percentOfRevenue,
        annual_increase_pct: line.annualIncreasePct,
        is_subscription: line.isSubscription,
      },
      is_from_xero: true,
      sort_order: 300 + sortOrder++,
    });
  });

  // 5. CapEx items
  assumptions.capex.items.forEach((item, idx) => {
    const monthDistribution: { [key: string]: number } = {};
    months.forEach(m => { monthDistribution[m] = 0; });
    if (months.includes(item.month)) {
      monthDistribution[item.month] = item.amount;
    }

    lines.push({
      account_name: `CapEx - ${item.name}`,
      account_code: `CAPEX-${idx + 1}`,
      category: 'Capital Expenditure',
      account_type: 'CAPEX',
      actual_months: {},
      forecast_months: monthDistribution,
      forecast_method: {
        method: 'one_time',
        category: item.category,
      },
      sort_order: 400 + idx,
    });
  });

  return lines;
}

/**
 * Distribute amount evenly across all months
 */
function distributeEvenly(annualAmount: number, months: string[]): { [key: string]: number } {
  const result: { [key: string]: number } = {};
  const monthlyAmount = Math.round((annualAmount / months.length) * 100) / 100;
  months.forEach(m => { result[m] = monthlyAmount; });
  return result;
}

/**
 * Distribute amount to specific months only
 */
function distributeToSpecificMonths(
  totalAmount: number,
  targetMonths: string[],
  allMonths: string[]
): { [key: string]: number } {
  const result: { [key: string]: number } = {};
  allMonths.forEach(m => { result[m] = 0; });

  const validTargets = targetMonths.filter(m => allMonths.includes(m));
  if (validTargets.length === 0) return result;

  const perMonth = Math.round((totalAmount / validTargets.length) * 100) / 100;
  validTargets.forEach(m => { result[m] = perMonth; });

  return result;
}

/**
 * Generate employee records from team assumptions
 */
function generateEmployees(assumptions: ForecastAssumptions) {
  const employees: any[] = [];

  // Existing team
  assumptions.team.existingTeam.forEach(member => {
    if (!member.includeInForecast) return;

    employees.push({
      employee_name: member.name,
      position: member.role,
      classification: 'opex', // Could be enhanced to detect COGS vs OpEx
      annual_salary: member.currentSalary * (1 + member.salaryIncreasePct / 100),
      is_active: true,
      is_from_xero: member.isFromXero,
    });
  });

  // Planned hires
  assumptions.team.plannedHires.forEach(hire => {
    employees.push({
      employee_name: hire.role,
      position: hire.role,
      classification: 'opex',
      annual_salary: hire.salary,
      start_date: hire.startMonth,
      is_active: true,
      is_from_xero: false,
    });
  });

  return employees;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: GenerateV4Request = await request.json();
    const { businessId, fiscalYear, forecastDuration, forecastId: providedForecastId, forecastName, createNew, isDraft, assumptions, summary } = body;

    if (!businessId || !fiscalYear || !assumptions) {
      return NextResponse.json(
        { error: 'businessId, fiscalYear, and assumptions are required' },
        { status: 400 }
      );
    }

    // Check for existing forecast - either by provided ID or find the active one
    // Skip this check if createNew is true (for "Save As" feature)
    let existingForecastId: string | null = null;

    if (!createNew) {
      if (providedForecastId) {
        // If a specific forecast ID is provided, use that
        const { data: specificForecast } = await supabase
          .from('financial_forecasts')
          .select('id')
          .eq('id', providedForecastId)
          .single();

        if (specificForecast) {
          existingForecastId = specificForecast.id;
        }
      } else {
        // Otherwise, look for an existing active forecast for this business/fiscal year
        const { data: existingForecast } = await supabase
          .from('financial_forecasts')
          .select('id')
          .eq('business_id', businessId)
          .eq('fiscal_year', fiscalYear)
          .eq('is_active', true)
          .limit(1);

        if (existingForecast && existingForecast.length > 0) {
          existingForecastId = existingForecast[0].id;
        }
      }
    }

    let forecastId: string;
    const fyStart = fiscalYear - 1;

    // Prepare forecast data
    // Note: forecast_duration is stored in assumptions.forecastDuration since the column may not exist
    // isDraft=true means autosave (don't mark complete to avoid triggering notification)
    const forecastData: Record<string, unknown> = {
      business_id: businessId,
      user_id: user.id,
      name: forecastName || `FY${fiscalYear} Financial Forecast`,
      fiscal_year: fiscalYear,
      year_type: 'FY',
      actual_start_month: `${fyStart}-07`,
      actual_end_month: `${fyStart}-07`,
      forecast_start_month: `${fyStart}-07`,
      forecast_end_month: `${fiscalYear}-06`,
      revenue_goal: summary.year1.revenue,
      gross_profit_goal: summary.year1.grossProfit,
      net_profit_goal: summary.year1.netProfit,
      goal_source: 'wizard_v4',
      assumptions: { ...assumptions, forecastDuration },
      updated_at: new Date().toISOString(),
    };

    // Only mark as complete if not a draft save (avoids triggering broken notification)
    if (!isDraft) {
      forecastData.is_completed = true;
      forecastData.completed_at = new Date().toISOString();
    }

    if (existingForecastId) {
      forecastId = existingForecastId;

      // Update existing forecast
      const { error: updateError } = await supabase
        .from('financial_forecasts')
        .update(forecastData)
        .eq('id', forecastId);

      if (updateError) {
        console.error('[GenerateV4] Error updating forecast:', updateError);
        return NextResponse.json({ error: 'Failed to update forecast' }, { status: 500 });
      }
    } else {
      // Create new forecast
      const { data: created, error: createError } = await supabase
        .from('financial_forecasts')
        .insert([forecastData])
        .select('id')
        .single();

      if (createError || !created) {
        console.error('[GenerateV4] Error creating forecast:', createError);
        return NextResponse.json({ error: 'Failed to create forecast' }, { status: 500 });
      }

      forecastId = created.id;
    }

    // Generate and save P&L lines
    const plLines = generatePLLines(assumptions, summary, fiscalYear);

    // Delete existing P&L lines
    await supabase
      .from('forecast_pl_lines')
      .delete()
      .eq('forecast_id', forecastId);

    // Insert new P&L lines
    if (plLines.length > 0) {
      const linesToInsert = plLines.map(line => ({
        ...line,
        forecast_id: forecastId,
      }));

      const { error: insertError } = await supabase
        .from('forecast_pl_lines')
        .insert(linesToInsert);

      if (insertError) {
        console.error('[GenerateV4] Error inserting P&L lines:', insertError);
      }
    }

    // Generate and save employees
    const employees = generateEmployees(assumptions);

    // Delete existing employees
    await supabase
      .from('forecast_employees')
      .delete()
      .eq('forecast_id', forecastId);

    // Insert new employees
    if (employees.length > 0) {
      const employeesToInsert = employees.map(emp => ({
        ...emp,
        forecast_id: forecastId,
      }));

      const { error: empError } = await supabase
        .from('forecast_employees')
        .insert(employeesToInsert);

      if (empError) {
        console.error('[GenerateV4] Error inserting employees:', empError);
      }
    }

    // Save subscription audit if present
    if (assumptions.subscriptions) {
      // Store subscription audit in a separate record for tracking
      try {
        await supabase
          .from('subscription_audits')
          .upsert({
            forecast_id: forecastId,
            business_id: businessId,
            audited_at: assumptions.subscriptions.auditedAt,
            accounts_included: assumptions.subscriptions.accountsIncluded,
            vendor_count: assumptions.subscriptions.vendorCount,
            total_annual: assumptions.subscriptions.totalAnnual,
            essential_annual: assumptions.subscriptions.essentialAnnual,
            review_annual: assumptions.subscriptions.reviewAnnual,
            reduce_annual: assumptions.subscriptions.reduceAnnual,
            cancel_annual: assumptions.subscriptions.cancelAnnual,
            potential_savings: assumptions.subscriptions.potentialSavings,
            cost_per_employee: assumptions.subscriptions.costPerEmployee,
          });
      } catch (e) {
        // Table might not exist yet - that's ok
        console.warn('[GenerateV4] subscription_audits table may not exist:', e);
      }
    }

    console.log('[GenerateV4] Forecast generated successfully:', {
      forecastId,
      fiscalYear,
      forecastDuration,
      plLinesCount: plLines.length,
      employeesCount: employees.length,
      hasSubscriptionAudit: !!assumptions.subscriptions,
    });

    return NextResponse.json({
      success: true,
      forecastId,
      summary: {
        plLinesCount: plLines.length,
        employeesCount: employees.length,
        forecastDuration,
      },
    });

  } catch (error) {
    console.error('[GenerateV4 API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
