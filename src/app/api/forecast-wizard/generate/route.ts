/**
 * Forecast Wizard Generate API
 *
 * Called when the wizard completes to generate and save the forecast.
 * Takes the wizard decisions and context, generates P&L lines, and saves to DB.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import type {
  WizardContext,
  ForecastDecision,
  PLLine,
  ForecastEmployee
} from '@/app/finances/forecast/types';

interface GenerateRequest {
  businessId: string;
  fiscalYear: number;
  context: WizardContext;
  decisions: ForecastDecision[];
  yearsSelected: number[];
}

/**
 * Generate month keys for a fiscal year
 */
function generateMonthKeys(fiscalYear: number, yearType: 'FY' | 'CY' = 'FY'): string[] {
  const months: string[] = [];

  if (yearType === 'FY') {
    // Financial Year: Jul (fiscalYear-1) to Jun (fiscalYear)
    for (let m = 7; m <= 12; m++) {
      months.push(`${fiscalYear - 1}-${String(m).padStart(2, '0')}`);
    }
    for (let m = 1; m <= 6; m++) {
      months.push(`${fiscalYear}-${String(m).padStart(2, '0')}`);
    }
  } else {
    // Calendar Year: Jan to Dec
    for (let m = 1; m <= 12; m++) {
      months.push(`${fiscalYear}-${String(m).padStart(2, '0')}`);
    }
  }

  return months;
}

/**
 * Distribute an annual amount across months using a specified pattern
 */
function distributeAnnualAmount(
  annualAmount: number,
  months: string[],
  pattern: 'even' | 'seasonal' = 'even',
  startMonth?: string
): { [key: string]: number } {
  const result: { [key: string]: number } = {};

  // Find start index if startMonth is specified
  const startIndex = startMonth
    ? months.findIndex(m => m >= startMonth)
    : 0;

  const activeMonths = months.slice(startIndex >= 0 ? startIndex : 0);
  const monthlyAmount = annualAmount / activeMonths.length;

  // Initialize all months to 0
  months.forEach(m => { result[m] = 0; });

  // Distribute to active months
  activeMonths.forEach(m => {
    result[m] = Math.round(monthlyAmount * 100) / 100;
  });

  return result;
}

/**
 * Generate P&L lines from wizard decisions
 */
function generatePLLines(
  context: WizardContext,
  decisions: ForecastDecision[],
  months: string[]
): PLLine[] {
  const lines: PLLine[] = [];
  const yearType = context.goals?.year_type || 'FY';

  // 1. Revenue line based on target
  const revenueTarget = context.goals?.revenue_target || 0;
  if (revenueTarget > 0) {
    lines.push({
      account_name: 'Sales Revenue',
      account_code: '4000',
      category: 'Revenue',
      account_type: 'REVENUE',
      actual_months: {},
      forecast_months: distributeAnnualAmount(revenueTarget, months, 'even'),
      forecast_method: {
        method: 'straight_line',
        base_amount: revenueTarget / 12
      },
      sort_order: 1
    });
  }

  // 2. COGS based on historical ratio or default
  let cogsRatio = 0.35; // Default 35%
  if (context.historical_pl?.prior_fy) {
    const priorRev = context.historical_pl.prior_fy.total_revenue;
    const priorCogs = context.historical_pl.prior_fy.total_cogs;
    if (priorRev > 0) {
      cogsRatio = priorCogs / priorRev;
    }
  }

  const cogsAmount = revenueTarget * cogsRatio;
  if (cogsAmount > 0) {
    lines.push({
      account_name: 'Cost of Goods Sold',
      account_code: '5000',
      category: 'Cost of Sales',
      account_type: 'COGS',
      actual_months: {},
      forecast_months: distributeAnnualAmount(cogsAmount, months, 'even'),
      forecast_method: {
        method: 'driver_based',
        driver_percentage: cogsRatio
      },
      sort_order: 100
    });
  }

  // 3. Team costs from current team
  const cogsTeam = (context.current_team || []).filter(e => e.classification === 'cogs');
  const opexTeam = (context.current_team || []).filter(e => e.classification === 'opex');

  // COGS Wages
  const cogsWagesTotal = cogsTeam.reduce((sum, e) => sum + ((e.annual_salary || 0) * 1.12), 0);
  if (cogsWagesTotal > 0) {
    lines.push({
      account_name: 'Wages - Direct',
      account_code: '5100',
      category: 'Cost of Sales',
      account_type: 'COGS',
      actual_months: {},
      forecast_months: distributeAnnualAmount(cogsWagesTotal, months, 'even'),
      forecast_method: {
        method: 'straight_line',
        base_amount: cogsWagesTotal / 12
      },
      is_from_payroll: true,
      sort_order: 110
    });
  }

  // OpEx Wages
  const opexWagesTotal = opexTeam.reduce((sum, e) => sum + ((e.annual_salary || 0) * 1.12), 0);
  if (opexWagesTotal > 0) {
    lines.push({
      account_name: 'Wages - Admin',
      account_code: '6100',
      category: 'Operating Expenses',
      account_type: 'EXPENSE',
      actual_months: {},
      forecast_months: distributeAnnualAmount(opexWagesTotal, months, 'even'),
      forecast_method: {
        method: 'straight_line',
        base_amount: opexWagesTotal / 12
      },
      is_from_payroll: true,
      sort_order: 200
    });
  }

  // 4. Planned hires from decisions
  const hireDecisions = decisions.filter(d => d.decision_type === 'new_hire');
  hireDecisions.forEach((hire, index) => {
    const salary = (hire.decision_data?.annual_salary as number) || 80000;
    const salaryWithSuper = salary * 1.12;
    const classification = (hire.decision_data?.classification as string) || 'opex';
    const startMonth = (hire.decision_data?.start_month as string) || months[0];
    const role = (hire.decision_data?.role as string) || 'New Hire';

    // Convert month name to month key if needed
    let startMonthKey = startMonth;
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                        'july', 'august', 'september', 'october', 'november', 'december'];
    const monthIndex = monthNames.indexOf(startMonth.toLowerCase());
    if (monthIndex !== -1) {
      // Determine year based on FY or CY and month
      const fyStartYear = context.fiscal_year - 1;
      const year = monthIndex >= 6 ? fyStartYear : context.fiscal_year; // Jul-Dec vs Jan-Jun for FY
      startMonthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    }

    lines.push({
      account_name: `Wages - ${role}`,
      account_code: classification === 'cogs' ? `510${index + 1}` : `610${index + 1}`,
      category: classification === 'cogs' ? 'Cost of Sales' : 'Operating Expenses',
      account_type: classification === 'cogs' ? 'COGS' : 'EXPENSE',
      actual_months: {},
      forecast_months: distributeAnnualAmount(salaryWithSuper, months, 'even', startMonthKey),
      forecast_method: {
        method: 'straight_line',
        base_amount: salaryWithSuper / 12
      },
      is_from_payroll: true,
      notes: hire.user_reasoning,
      sort_order: classification === 'cogs' ? 120 + index : 210 + index
    });
  });

  // 5. Operating expenses from historical data or decisions
  let baseOpex = 0;
  let opexAdjustment = 1.0;

  if (context.historical_pl?.prior_fy) {
    baseOpex = context.historical_pl.prior_fy.operating_expenses;
  }

  // Apply cost adjustments from decisions
  const costDecisions = decisions.filter(d => d.decision_type === 'cost_changed');
  costDecisions.forEach(d => {
    const adjustment = (d.decision_data?.adjustment_percent as number) || 0;
    opexAdjustment *= (1 + adjustment / 100);
  });

  // Exclude wages from historical OpEx (we calculated those separately)
  const historicalTeamCost = (opexWagesTotal + cogsWagesTotal) * 0.9; // Rough estimate
  const nonWageOpex = Math.max(0, (baseOpex * opexAdjustment) - historicalTeamCost);

  if (nonWageOpex > 0) {
    // Add top expense categories from historical data
    const categories = context.historical_pl?.prior_fy?.operating_expenses_by_category || [];
    const wageCategories = ['wages', 'salary', 'payroll', 'super'];

    categories
      .filter(cat => !wageCategories.some(w => cat.account_name.toLowerCase().includes(w)))
      .slice(0, 10)
      .forEach((cat, index) => {
        const adjustedAmount = cat.total * opexAdjustment;
        lines.push({
          account_name: cat.account_name,
          category: 'Operating Expenses',
          account_type: 'EXPENSE',
          actual_months: {},
          forecast_months: distributeAnnualAmount(adjustedAmount, months, 'even'),
          forecast_method: {
            method: 'seasonal_pattern',
            percentage_increase: opexAdjustment - 1,
            base_amount: cat.monthly_average
          },
          is_from_xero: true,
          sort_order: 300 + index
        });
      });
  }

  // 6. Investments from decisions
  const investmentDecisions = decisions.filter(d => d.decision_type === 'investment');
  investmentDecisions.forEach((inv, index) => {
    const amount = (inv.decision_data?.amount as number) || 0;
    const description = (inv.decision_data?.description as string) || 'Investment';
    const type = (inv.decision_data?.type as string) || 'opex';

    if (amount > 0) {
      lines.push({
        account_name: type === 'capex' ? `Capital Investment - ${description}` : `Strategic Investment - ${description}`,
        category: type === 'capex' ? 'Other Expenses' : 'Operating Expenses',
        account_type: 'EXPENSE',
        actual_months: {},
        forecast_months: distributeAnnualAmount(amount, months, 'even'),
        forecast_method: {
          method: 'manual'
        },
        notes: inv.user_reasoning,
        sort_order: 400 + index
      });
    }
  });

  return lines;
}

/**
 * Generate employee records from team data and decisions
 */
function generateEmployees(
  context: WizardContext,
  decisions: ForecastDecision[]
): Partial<ForecastEmployee>[] {
  const employees: Partial<ForecastEmployee>[] = [];

  // Add existing team
  (context.current_team || []).forEach(emp => {
    employees.push({
      employee_name: emp.full_name,
      position: emp.job_title,
      classification: emp.classification || 'opex',
      annual_salary: emp.annual_salary,
      start_date: emp.start_date,
      is_active: emp.is_active
    });
  });

  // Add planned hires
  const hireDecisions = decisions.filter(d => d.decision_type === 'new_hire');
  hireDecisions.forEach(hire => {
    const role = (hire.decision_data?.role as string) || 'New Hire';
    const salary = (hire.decision_data?.annual_salary as number) || 80000;
    const classification = (hire.decision_data?.classification as 'opex' | 'cogs') || 'opex';
    const startMonth = (hire.decision_data?.start_month as string) || '';

    employees.push({
      employee_name: role,
      position: role,
      classification,
      annual_salary: salary,
      start_date: startMonth,
      is_active: true
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

    const body: GenerateRequest = await request.json();
    const { businessId, fiscalYear, context, decisions, yearsSelected } = body;

    if (!businessId || !fiscalYear) {
      return NextResponse.json(
        { error: 'businessId and fiscalYear are required' },
        { status: 400 }
      );
    }

    // Get or create forecast
    const { data: existingForecast } = await supabase
      .from('financial_forecasts')
      .select('*')
      .eq('business_id', businessId)
      .eq('fiscal_year', fiscalYear)
      .limit(1);

    let forecastId: string;
    const yearType = context?.goals?.year_type || 'FY';

    if (existingForecast && existingForecast.length > 0) {
      forecastId = existingForecast[0].id;

      // Update forecast with wizard data
      await supabase
        .from('financial_forecasts')
        .update({
          revenue_goal: context?.goals?.revenue_target,
          gross_profit_goal: context?.goals?.gross_profit_target,
          net_profit_goal: context?.goals?.profit_target,
          goal_source: 'goals_wizard',
          is_completed: true,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', forecastId);
    } else {
      // Create new forecast
      const fyStart = yearType === 'FY' ? fiscalYear - 1 : fiscalYear;
      const newForecast = {
        business_id: businessId,
        user_id: user.id,
        name: `${yearType}${fiscalYear} Financial Forecast`,
        fiscal_year: fiscalYear,
        year_type: yearType,
        actual_start_month: yearType === 'FY' ? `${fyStart}-07` : `${fiscalYear}-01`,
        actual_end_month: yearType === 'FY' ? `${fyStart}-07` : `${fiscalYear}-01`,
        forecast_start_month: yearType === 'FY' ? `${fyStart}-07` : `${fiscalYear}-01`,
        forecast_end_month: yearType === 'FY' ? `${fiscalYear}-06` : `${fiscalYear}-12`,
        revenue_goal: context?.goals?.revenue_target,
        gross_profit_goal: context?.goals?.gross_profit_target,
        net_profit_goal: context?.goals?.profit_target,
        goal_source: 'goals_wizard',
        is_completed: true,
        completed_at: new Date().toISOString()
      };

      const { data: created, error: createError } = await supabase
        .from('financial_forecasts')
        .insert([newForecast])
        .select()
        .single();

      if (createError || !created) {
        console.error('[Generate] Error creating forecast:', createError);
        return NextResponse.json(
          { error: 'Failed to create forecast' },
          { status: 500 }
        );
      }

      forecastId = created.id;
    }

    // Generate P&L lines
    const months = generateMonthKeys(fiscalYear, yearType);
    const plLines = generatePLLines(context, decisions, months);

    // Delete existing P&L lines and insert new ones
    await supabase
      .from('forecast_pl_lines')
      .delete()
      .eq('forecast_id', forecastId);

    if (plLines.length > 0) {
      const linesToInsert = plLines.map(line => ({
        ...line,
        forecast_id: forecastId
      }));

      const { error: insertError } = await supabase
        .from('forecast_pl_lines')
        .insert(linesToInsert);

      if (insertError) {
        console.error('[Generate] Error inserting P&L lines:', insertError);
      }
    }

    // Generate employees
    const employees = generateEmployees(context, decisions);

    // Delete existing employees and insert new ones
    await supabase
      .from('forecast_employees')
      .delete()
      .eq('forecast_id', forecastId);

    if (employees.length > 0) {
      const employeesToInsert = employees.map(emp => ({
        ...emp,
        forecast_id: forecastId
      }));

      const { error: empError } = await supabase
        .from('forecast_employees')
        .insert(employeesToInsert);

      if (empError) {
        console.error('[Generate] Error inserting employees:', empError);
      }
    }

    // Save decisions to database (optional - for audit trail)
    if (decisions.length > 0) {
      const decisionsToInsert = decisions.map(d => ({
        forecast_id: forecastId,
        user_id: user.id,
        business_id: businessId,
        decision_type: d.decision_type,
        decision_data: d.decision_data,
        user_reasoning: d.user_reasoning,
        created_at: d.created_at || new Date().toISOString()
      }));

      // Try to insert - table might not exist yet
      try {
        await supabase
          .from('forecast_decisions')
          .insert(decisionsToInsert);
      } catch (e) {
        console.warn('[Generate] forecast_decisions table may not exist:', e);
      }
    }

    // Log completion
    console.log('[Generate] Forecast generated successfully:', {
      forecastId,
      fiscalYear,
      plLinesCount: plLines.length,
      employeesCount: employees.length,
      decisionsCount: decisions.length
    });

    return NextResponse.json({
      success: true,
      forecastId,
      summary: {
        plLinesCount: plLines.length,
        employeesCount: employees.length,
        decisionsCount: decisions.length,
        yearsSelected
      }
    });

  } catch (error) {
    console.error('[Generate API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
