/**
 * Xero P&L Summary API Route
 * Fetches and summarizes historical P&L data for the forecast wizard
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import type { HistoricalPLSummary, PeriodSummary, OpExCategory } from '@/app/finances/forecast/types';

// Helper to get fiscal year boundaries (Australian FY: Jul-Jun)
function getFiscalYearBoundaries(fiscalYear: number) {
  // FY26 = July 2025 to June 2026
  const startYear = fiscalYear - 1;
  return {
    start: `${startYear}-07-01`,
    end: `${fiscalYear}-06-30`,
    startMonth: `${startYear}-07`,
    endMonth: `${fiscalYear}-06`,
  };
}

// Helper to get prior fiscal year
function getPriorFiscalYear(fiscalYear: number) {
  return getFiscalYearBoundaries(fiscalYear - 1);
}

// Helper to get current YTD boundaries
function getCurrentYTDBoundaries(fiscalYear: number) {
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-11
  const currentYear = now.getFullYear();

  // Determine if we're in the fiscal year
  const fyStart = getFiscalYearBoundaries(fiscalYear);
  const fyStartDate = new Date(fyStart.start);

  // If before FY start, no YTD data
  if (now < fyStartDate) {
    return null;
  }

  // Calculate months in YTD
  const lastCompleteMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastCompleteYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const lastCompleteMonthStr = `${lastCompleteYear}-${String(lastCompleteMonth + 1).padStart(2, '0')}`;

  return {
    startMonth: fyStart.startMonth,
    endMonth: lastCompleteMonthStr,
  };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('business_id');
    const fiscalYearParam = searchParams.get('fiscal_year');

    if (!businessId) {
      return NextResponse.json({ error: 'business_id is required' }, { status: 400 });
    }

    const fiscalYear = fiscalYearParam ? parseInt(fiscalYearParam) : new Date().getFullYear() + 1;
    console.log('[Xero P&L Summary] Fetching for business:', businessId, 'fiscal_year:', fiscalYear);

    // Check Xero connection
    const { data: xeroConnection, error: xeroError } = await supabase
      .from('xero_connections')
      .select('id, is_active')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .maybeSingle();

    console.log('[Xero P&L Summary] Xero connection:', xeroConnection ? 'found' : 'not found', xeroError?.message || '');

    if (!xeroConnection) {
      console.log('[Xero P&L Summary] No active Xero connection');
      return NextResponse.json({
        summary: {
          has_xero_data: false,
        } as HistoricalPLSummary
      });
    }

    // Get forecast for this business/fiscal year to find P&L lines
    // First try active, then any forecast
    let { data: forecasts, error: forecastError } = await supabase
      .from('financial_forecasts')
      .select('id, is_active')
      .eq('business_id', businessId)
      .eq('fiscal_year', fiscalYear)
      .order('is_active', { ascending: false }) // Active first
      .order('updated_at', { ascending: false })
      .limit(1);

    let forecast = forecasts?.[0] || null;
    console.log('[Xero P&L Summary] Forecast query result:', {
      businessId,
      fiscalYear,
      found: !!forecast,
      forecastId: forecast?.id,
      isActive: forecast?.is_active,
      error: forecastError?.message
    });

    // If no forecast found, try without fiscal_year filter (might be stored differently)
    if (!forecast) {
      const { data: anyForecasts } = await supabase
        .from('financial_forecasts')
        .select('id, fiscal_year, is_active')
        .eq('business_id', businessId)
        .order('updated_at', { ascending: false })
        .limit(5);
      console.log('[Xero P&L Summary] All forecasts for business:', anyForecasts);
    }

    if (!forecast) {
      console.log('[Xero P&L Summary] No active forecast for fiscal year', fiscalYear);
      return NextResponse.json({
        summary: {
          has_xero_data: false,
        } as HistoricalPLSummary
      });
    }

    // Fetch P&L lines
    const { data: plLines, error: plError } = await supabase
      .from('forecast_pl_lines')
      .select('*')
      .eq('forecast_id', forecast.id)
      .eq('is_from_xero', true);

    console.log('[Xero P&L Summary] P&L lines from Xero:', plLines?.length || 0, plError?.message || '');

    if (plError || !plLines || plLines.length === 0) {
      console.log('[Xero P&L Summary] No P&L lines found from Xero');
      return NextResponse.json({
        summary: {
          has_xero_data: false,
        } as HistoricalPLSummary
      });
    }

    // Calculate prior FY summary
    const priorFY = getPriorFiscalYear(fiscalYear);
    const priorFYSummary = calculatePeriodSummary(plLines, priorFY.startMonth, priorFY.endMonth, `FY${fiscalYear - 1}`);

    // Calculate current YTD summary
    const ytdBoundaries = getCurrentYTDBoundaries(fiscalYear);
    let currentYTD = null;

    if (ytdBoundaries) {
      const ytdSummary = calculatePeriodSummary(plLines, ytdBoundaries.startMonth, ytdBoundaries.endMonth, `FY${fiscalYear} YTD`);

      if (ytdSummary && ytdSummary.months_count > 0) {
        // Calculate run rates
        const annualizationFactor = 12 / ytdSummary.months_count;
        const runRateRevenue = ytdSummary.total_revenue * annualizationFactor;
        const runRateOpex = ytdSummary.operating_expenses * annualizationFactor;
        const runRateNetProfit = ytdSummary.net_profit * annualizationFactor;

        // Calculate variance vs prior
        const revenueVsPrior = priorFYSummary && priorFYSummary.total_revenue > 0
          ? ((runRateRevenue - priorFYSummary.total_revenue) / priorFYSummary.total_revenue) * 100
          : 0;
        const opexVsPrior = priorFYSummary && priorFYSummary.operating_expenses > 0
          ? ((runRateOpex - priorFYSummary.operating_expenses) / priorFYSummary.operating_expenses) * 100
          : 0;

        currentYTD = {
          ...ytdSummary,
          run_rate_revenue: runRateRevenue,
          run_rate_opex: runRateOpex,
          run_rate_net_profit: runRateNetProfit,
          revenue_vs_prior_percent: revenueVsPrior,
          opex_vs_prior_percent: opexVsPrior,
        };
      }
    }

    const summary: HistoricalPLSummary = {
      has_xero_data: true,
      prior_fy: priorFYSummary || undefined,
      current_ytd: currentYTD || undefined,
    };

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('[Xero P&L Summary] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function calculatePeriodSummary(
  plLines: any[],
  startMonth: string,
  endMonth: string,
  periodLabel: string
): PeriodSummary | null {
  // Generate month keys in range
  const monthKeys: string[] = [];
  let current = new Date(startMonth + '-01');
  const end = new Date(endMonth + '-01');

  while (current <= end) {
    monthKeys.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`);
    current.setMonth(current.getMonth() + 1);
  }

  if (monthKeys.length === 0) return null;

  // Categorize lines and sum actuals
  let totalRevenue = 0;
  let totalCogs = 0;
  let totalOpex = 0;
  const opexByCategory: Record<string, { total: number; account_name: string }> = {};

  for (const line of plLines) {
    const actuals = line.actual_months || {};
    let lineTotal = 0;

    for (const monthKey of monthKeys) {
      lineTotal += actuals[monthKey] || 0;
    }

    const category = (line.category || '').toLowerCase();

    if (category === 'revenue' || category === 'income') {
      totalRevenue += lineTotal;
    } else if (category === 'cost of sales' || category === 'cogs' || category === 'direct costs') {
      totalCogs += lineTotal;
    } else if (category === 'operating expenses' || category === 'expense' || category === 'overhead') {
      totalOpex += lineTotal;

      // Track by account for top categories
      const accountName = line.account_name || 'Other';
      if (!opexByCategory[accountName]) {
        opexByCategory[accountName] = { total: 0, account_name: accountName };
      }
      opexByCategory[accountName].total += lineTotal;
    }
  }

  // Sort OpEx categories by total
  const opexCategories: OpExCategory[] = Object.values(opexByCategory)
    .sort((a, b) => b.total - a.total)
    .map(cat => ({
      category: cat.account_name,
      account_name: cat.account_name,
      total: cat.total,
      monthly_average: cat.total / monthKeys.length,
    }));

  const grossProfit = totalRevenue - totalCogs;
  const netProfit = grossProfit - totalOpex;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  return {
    period_label: periodLabel,
    start_month: startMonth,
    end_month: endMonth,
    months_count: monthKeys.length,
    total_revenue: totalRevenue,
    total_cogs: totalCogs,
    gross_profit: grossProfit,
    gross_margin_percent: grossMargin,
    operating_expenses: totalOpex,
    operating_expenses_by_category: opexCategories,
    net_profit: netProfit,
    net_margin_percent: netMargin,
  };
}
