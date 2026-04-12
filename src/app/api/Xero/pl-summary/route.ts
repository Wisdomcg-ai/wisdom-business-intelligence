/**
 * Xero P&L Summary API Route
 * Fetches and summarizes historical P&L data for the forecast wizard
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { resolveBusinessIds } from '@/lib/utils/resolve-business-ids';
import { resolveXeroBusinessId } from '@/lib/utils/resolve-xero-business-id';
import { verifyBusinessAccess } from '@/lib/utils/verify-business-access';
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
  // Use Australian Eastern Time for date calculations
  // This ensures we correctly identify completed months in AU context
  const nowUTC = new Date();

  // Convert to Australian Eastern Time (AEDT = UTC+11, AEST = UTC+10)
  // Use UTC+11 (AEDT) during daylight saving (Oct-Apr), UTC+10 (AEST) otherwise
  const utcMonth = nowUTC.getUTCMonth();
  const isDaylightSaving = utcMonth >= 9 || utcMonth <= 3; // Oct-Apr
  const australiaOffsetHours = isDaylightSaving ? 11 : 10;

  const australiaTime = new Date(nowUTC.getTime() + australiaOffsetHours * 60 * 60 * 1000);
  const currentMonth = australiaTime.getUTCMonth(); // 0-11
  const currentYear = australiaTime.getUTCFullYear();
  const currentDay = australiaTime.getUTCDate();

  console.log('[Xero P&L Summary] Date calculation:', {
    serverUTC: nowUTC.toISOString(),
    australiaTime: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`,
    currentMonth: currentMonth + 1,
    currentYear,
    isDaylightSaving,
  });

  // Determine if we're in the fiscal year
  const fyStart = getFiscalYearBoundaries(fiscalYear);
  const fyStartDate = new Date(fyStart.start);

  // If before FY start, no YTD data
  if (australiaTime < fyStartDate) {
    console.log('[Xero P&L Summary] Before FY start, no YTD data');
    return null;
  }

  // Calculate last complete month
  // If we're on or after the 1st of a month, the previous month is complete
  // This means if today is Jan 1, December is the last complete month
  let lastCompleteMonth: number;
  let lastCompleteYear: number;

  if (currentMonth === 0) {
    // January -> December of previous year
    lastCompleteMonth = 11; // December (0-indexed)
    lastCompleteYear = currentYear - 1;
  } else {
    // Any other month -> previous month of same year
    lastCompleteMonth = currentMonth - 1;
    lastCompleteYear = currentYear;
  }

  const lastCompleteMonthStr = `${lastCompleteYear}-${String(lastCompleteMonth + 1).padStart(2, '0')}`;

  console.log('[Xero P&L Summary] YTD boundaries:', {
    startMonth: fyStart.startMonth,
    endMonth: lastCompleteMonthStr,
    lastCompleteMonth: lastCompleteMonth + 1,
    lastCompleteYear,
  });

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

    // Verify user has access to this business
    const hasAccess = await verifyBusinessAccess(user.id, businessId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const fiscalYear = fiscalYearParam ? parseInt(fiscalYearParam) : new Date().getFullYear() + 1;
    console.log('[Xero P&L Summary] Fetching for business:', businessId, 'fiscal_year:', fiscalYear);

    // Check Xero connection (resolves businesses.id vs business_profiles.id)
    const { connection: xeroConnection } = await resolveXeroBusinessId(supabase, businessId);

    console.log('[Xero P&L Summary] Xero connection:', xeroConnection ? 'found' : 'not found');

    if (!xeroConnection) {
      console.log('[Xero P&L Summary] No active Xero connection');
      return NextResponse.json({
        summary: {
          has_xero_data: false,
        } as HistoricalPLSummary
      });
    }

    // Get ALL forecasts for this business/fiscal year to find P&L lines
    // Resolve business_profiles.id from businesses.id
    const ids = await resolveBusinessIds(supabase, businessId);
    let forecasts: any[] | null = null;
    let forecastError: any = null;
    {
      const { data: fcs, error: err } = await supabase
        .from('financial_forecasts')
        .select('id, is_active')
        .in('business_id', ids.all)
        .eq('fiscal_year', fiscalYear)
        .order('is_active', { ascending: false })
        .order('updated_at', { ascending: false });
      if (fcs && fcs.length > 0) { forecasts = fcs; }
      if (err) forecastError = err;
    }

    console.log('[Xero P&L Summary] Forecasts for business/FY:', {
      businessId,
      fiscalYear,
      count: forecasts?.length || 0,
      forecastIds: forecasts?.map(f => f.id),
      error: forecastError?.message
    });

    // If no forecasts found, try without fiscal_year filter
    if (!forecasts || forecasts.length === 0) {
      const { data: anyForecasts } = await supabase
        .from('financial_forecasts')
        .select('id, fiscal_year, is_active')
        .in('business_id', ids.all)
        .order('updated_at', { ascending: false })
        .limit(5);
      if (anyForecasts && anyForecasts.length > 0) {
        console.log('[Xero P&L Summary] All forecasts for business:', anyForecasts);
      }
    }

    if (!forecasts || forecasts.length === 0) {
      console.log('[Xero P&L Summary] No forecasts for fiscal year', fiscalYear);
      return NextResponse.json({
        summary: {
          has_xero_data: false,
        } as HistoricalPLSummary
      });
    }

    // Fetch P&L lines from ALL forecasts for this business/fiscal year
    // This ensures we find Xero data even if it was synced to a different forecast
    const forecastIds = forecasts.map(f => f.id);
    const { data: plLines, error: plError } = await supabase
      .from('forecast_pl_lines')
      .select('*')
      .in('forecast_id', forecastIds)
      .eq('is_from_xero', true);

    console.log('[Xero P&L Summary] P&L lines from Xero (across all forecasts):', plLines?.length || 0, plError?.message || '');

    if (plError || !plLines || plLines.length === 0) {
      console.log('[Xero P&L Summary] No P&L lines found from Xero');
      return NextResponse.json({
        summary: {
          has_xero_data: false,
        } as HistoricalPLSummary
      });
    }

    // Deduplicate P&L lines - if same account exists in multiple forecasts,
    // prefer the one from the most recent/active forecast (first in forecastIds array)
    const seenAccounts = new Set<string>();
    const forecastPriority = new Map(forecastIds.map((id, idx) => [id, idx]));

    // Sort by forecast priority (lower index = higher priority)
    const sortedLines = [...plLines].sort((a, b) => {
      const priorityA = forecastPriority.get(a.forecast_id) ?? 999;
      const priorityB = forecastPriority.get(b.forecast_id) ?? 999;
      return priorityA - priorityB;
    });

    // Keep only the first occurrence of each account
    const dedupedLines = sortedLines.filter(line => {
      const key = `${line.account_name}|${line.category}`;
      if (seenAccounts.has(key)) return false;
      seenAccounts.add(key);
      return true;
    });

    console.log('[Xero P&L Summary] After deduplication:', dedupedLines.length, 'lines (was', plLines.length, ')');

    // Calculate prior FY summary
    const priorFY = getPriorFiscalYear(fiscalYear);
    console.log('[Xero P&L Summary] Prior FY boundaries:', priorFY);

    // Log sample of P&L lines to debug
    if (dedupedLines.length > 0) {
      const sampleLine = dedupedLines[0];
      console.log('[Xero P&L Summary] Sample P&L line:', {
        category: sampleLine.category,
        account_name: sampleLine.account_name,
        has_actual_months: !!sampleLine.actual_months,
        actual_months_keys: sampleLine.actual_months ? Object.keys(sampleLine.actual_months).slice(0, 5) : [],
      });
    }

    // Determine if this is an extended forecast (planning season: within 3 months of current FY end)
    // In that case, prior year = FY BEFORE current (complete), and YTD = current FY actuals
    const nowDate = new Date();
    const currentCalMonth = nowDate.getMonth() + 1;
    const currentCalYear = nowDate.getFullYear();
    // Current FY: for yearStartMonth=7, Apr 2026 is in FY2026
    const currentFYNum = currentCalMonth >= 7 ? currentCalYear + 1 : currentCalYear;
    const isExtendedForecast = fiscalYear === currentFYNum + 1;

    let priorFYBounds: ReturnType<typeof getFiscalYearBoundaries>;
    let ytdFiscalYear: number;

    if (isExtendedForecast) {
      // Extended: prior = FY before current (complete 12 months), YTD = current FY
      priorFYBounds = getFiscalYearBoundaries(currentFYNum - 1);
      ytdFiscalYear = currentFYNum;
      console.log('[Xero P&L Summary] Extended forecast detected — prior FY:', currentFYNum - 1, 'YTD from FY:', currentFYNum);
    } else {
      priorFYBounds = priorFY;
      ytdFiscalYear = fiscalYear;
    }

    const priorFYSummary = calculatePeriodSummary(dedupedLines, priorFYBounds.startMonth, priorFYBounds.endMonth, `FY${isExtendedForecast ? currentFYNum - 1 : fiscalYear - 1}`);

    // Calculate current YTD summary
    const ytdBoundaries = getCurrentYTDBoundaries(ytdFiscalYear);
    let currentYTD = null;

    if (ytdBoundaries) {
      const ytdSummary = calculatePeriodSummary(dedupedLines, ytdBoundaries.startMonth, ytdBoundaries.endMonth, `FY${fiscalYear} YTD`);

      console.log('[Xero P&L Summary] YTD summary result:', ytdSummary ? {
        months_count: ytdSummary.months_count,
        total_revenue: ytdSummary.total_revenue,
        revenue_months: Object.entries(ytdSummary.revenue_by_month || {})
          .filter(([_, v]) => v > 0)
          .map(([k, v]) => `${k}: ${v}`),
      } : 'null');

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

  // Track revenue, COGS, and OpEx by month for P&L analysis
  const revenueByMonth: Record<string, number> = {};
  const cogsByMonth: Record<string, number> = {};
  const opexByMonth: Record<string, number> = {};
  for (const monthKey of monthKeys) {
    revenueByMonth[monthKey] = 0;
    cogsByMonth[monthKey] = 0;
    opexByMonth[monthKey] = 0;
  }

  // Log unique categories for debugging
  const uniqueCategories = [...new Set(plLines.map(l => l.category || 'null'))];
  console.log('[Xero P&L Summary] Unique categories in P&L lines:', uniqueCategories);

  // Log a few lines to debug actual_months structure
  if (plLines.length > 0) {
    console.log(`[Xero P&L Summary] ${periodLabel} - Checking actual_months structure for first 2 lines:`);
    plLines.slice(0, 2).forEach((l, i) => {
      console.log(`  Line ${i}: "${l.account_name}" (${l.category})`, {
        actual_months_keys: Object.keys(l.actual_months || {}),
        monthKeys_expected: monthKeys.slice(0, 3),
        sample_values: Object.entries(l.actual_months || {}).slice(0, 3),
      });
    });
  }

  for (const line of plLines) {
    const actuals = line.actual_months || {};
    let lineTotal = 0;
    const category = (line.category || '').toLowerCase();

    // Determine category flags — order matters: check COGS before revenue
    // because "cost of sales" contains "sales" which would false-match revenue
    const isOtherIncome = category.includes('other income');

    const isCogs = category.includes('cost of sales') ||
                   category.includes('cogs') ||
                   category.includes('direct cost') ||
                   category.includes('cost of goods');

    // IMPORTANT: Exclude "other income" AND COGS from revenue calculation
    // "cost of sales" contains "sales" which would otherwise match
    const isRevenue = !isOtherIncome && !isCogs && (
                      category.includes('revenue') ||
                      category.includes('income') ||
                      category.includes('sales') ||
                      category.includes('trading income'));

    // Determine if this is OpEx (also exclude "other expense")
    const isOtherExpense = category.includes('other expense');
    const isOpex = !isOtherExpense && !isCogs && (
                   category.includes('operating') ||
                   category.includes('expense') ||
                   category.includes('overhead') ||
                   category.includes('administrative') ||
                   category.includes('admin'));

    for (const monthKey of monthKeys) {
      const monthValue = actuals[monthKey] || 0;
      lineTotal += monthValue;

      // Track revenue, COGS, and OpEx by month
      if (isRevenue) {
        revenueByMonth[monthKey] = (revenueByMonth[monthKey] || 0) + monthValue;
      } else if (isCogs) {
        cogsByMonth[monthKey] = (cogsByMonth[monthKey] || 0) + monthValue;
      } else if (isOpex) {
        opexByMonth[monthKey] = (opexByMonth[monthKey] || 0) + monthValue;
      }
    }

    if (isRevenue) {
      totalRevenue += lineTotal;
    } else if (isCogs) {
      totalCogs += lineTotal;
    } else if (isOpex) {
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

  // Log category detection results - detailed breakdown for debugging
  console.log('[Xero P&L Summary] Category totals:', {
    totalRevenue,
    totalCogs,
    totalOpex,
    revenueByMonth: Object.entries(revenueByMonth).filter(([_, v]) => v > 0).length + ' months with data',
  });

  // Build detailed revenue and COGS lines for Step 3
  const revenueLines = plLines.filter(l => {
    const cat = (l.category || '').toLowerCase();
    const isOtherIncome = cat.includes('other income');
    const isCogs = cat.includes('cost of sales') || cat.includes('cogs') || cat.includes('direct cost') || cat.includes('cost of goods');
    return !isOtherIncome && !isCogs && (cat.includes('revenue') || cat.includes('income') || cat.includes('sales') || cat.includes('trading income'));
  });
  const cogsLines = plLines.filter(l => {
    const cat = (l.category || '').toLowerCase();
    return cat.includes('cost of sales') || cat.includes('cogs') || cat.includes('direct cost') || cat.includes('cost of goods');
  });
  const otherIncomeLines = plLines.filter(l => (l.category || '').toLowerCase().includes('other income'));

  console.log('[Xero P&L Summary] Revenue lines:', revenueLines.map(l => ({
    name: l.account_name,
    category: l.category,
  })));
  console.log('[Xero P&L Summary] COGS lines:', cogsLines.map(l => ({
    name: l.account_name,
    category: l.category,
  })));
  console.log('[Xero P&L Summary] Other Income lines (excluded from revenue):', otherIncomeLines.map(l => ({
    name: l.account_name,
    category: l.category,
  })));

  // Build revenue lines with totals
  const revenueLineItems = revenueLines.map(l => {
    let lineTotal = 0;
    const monthlyValues: Record<string, number> = {};
    for (const monthKey of monthKeys) {
      const value = (l.actual_months || {})[monthKey] || 0;
      lineTotal += value;
      monthlyValues[monthKey] = value;
    }
    return {
      account_name: l.account_name,
      category: l.category,
      total: lineTotal,
      by_month: monthlyValues,
    };
  }).filter(l => l.total !== 0);

  // Build COGS lines with totals
  const cogsLineItems = cogsLines.map(l => {
    let lineTotal = 0;
    const monthlyValues: Record<string, number> = {};
    for (const monthKey of monthKeys) {
      const value = (l.actual_months || {})[monthKey] || 0;
      lineTotal += value;
      monthlyValues[monthKey] = value;
    }
    return {
      account_name: l.account_name,
      category: l.category,
      total: lineTotal,
      by_month: monthlyValues,
      percent_of_revenue: totalRevenue > 0 ? (lineTotal / totalRevenue) * 100 : 0,
    };
  }).filter(l => l.total !== 0);

  // Calculate seasonality pattern (percentage of annual revenue per month)
  // Order months in FY order: Jul, Aug, Sep, Oct, Nov, Dec, Jan, Feb, Mar, Apr, May, Jun
  // Use slice() to avoid mutating the original monthKeys array
  const fyMonthOrder = [...monthKeys].sort((a, b) => {
    const [yearA, monthA] = a.split('-').map(Number);
    const [yearB, monthB] = b.split('-').map(Number);
    // Convert to FY index (Jul=0, Aug=1, ..., Jun=11)
    const fyIndexA = monthA >= 7 ? monthA - 7 : monthA + 5;
    const fyIndexB = monthB >= 7 ? monthB - 7 : monthB + 5;
    // Also consider year for multi-year spans
    const sortKeyA = yearA * 12 + fyIndexA;
    const sortKeyB = yearB * 12 + fyIndexB;
    return sortKeyA - sortKeyB;
  });

  const seasonalityPattern: number[] = fyMonthOrder.map(monthKey => {
    if (totalRevenue <= 0) return 8.33; // Default even distribution
    return ((revenueByMonth[monthKey] || 0) / totalRevenue) * 100;
  });

  console.log('[Xero P&L Summary] Seasonality:', {
    fyMonthOrder: fyMonthOrder.slice(0, 3),
    pattern: seasonalityPattern.slice(0, 3),
    totalPatternSum: seasonalityPattern.reduce((a, b) => a + b, 0).toFixed(1),
  });

  // Ensure we have exactly 12 months
  while (seasonalityPattern.length < 12) {
    seasonalityPattern.push(8.33);
  }

  // Log opex categories for debugging
  console.log(`[Xero P&L Summary] ${periodLabel} OpEx categories:`, opexCategories.length, 'categories, top 5:',
    opexCategories.slice(0, 5).map(c => ({ name: c.account_name, total: c.total })));

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
    revenue_by_month: revenueByMonth,
    cogs_by_month: cogsByMonth,
    opex_by_month: opexByMonth,
    seasonality_pattern: seasonalityPattern.slice(0, 12),
    revenue_lines: revenueLineItems,
    cogs_lines: cogsLineItems,
  };
}
