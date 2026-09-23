'use client';

import { Download } from 'lucide-react';
import {
  ForecastWizardState, formatCurrency, generateMonthKeys,
  getRevenueLineYearTotal, SUPER_RATE, calculateNewSalary,
} from '../types';
import { shouldExcludeFromOpEx } from '../useForecastWizard';
import { getFiscalMonthLabels, DEFAULT_YEAR_START_MONTH } from '@/lib/utils/fiscal-year-utils';
import { getPlannedSpendPLBreakdown } from '../types';
import type { ForecastSummary } from '../types';
import type { ForecastAssumptions } from '../types/assumptions';
import { convertAssumptionsToPLLines } from '@/app/finances/forecast/services/assumptions-to-pl-lines';

interface ExcelExportProps {
  state: ForecastWizardState;
  summary: ForecastSummary;
  fiscalYear: number;
  /** The canonical assumptions payload — the same input Generate materialises. */
  buildAssumptions: () => ForecastAssumptions;
}

type Row = (string | number)[];

interface SheetSpec {
  name: string;
  rows: Row[];
  colWidths: number[];
}

/**
 * Build and download an .xlsx workbook from array-of-arrays sheet specs.
 * Uses exceljs (dynamically imported so it stays out of the initial bundle),
 * replacing the removed `xlsx` library. Column widths are in character units,
 * matching the old `!cols` { wch } values one-to-one.
 */
async function downloadXlsx(sheets: SheetSpec[], filename: string): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name);
    spec.rows.forEach((r) => ws.addRow(r));
    spec.colWidths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
  }
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExcelExport({ state, summary, fiscalYear, buildAssumptions }: ExcelExportProps) {
  const { goals, forecastDuration, revenueLines, cogsLines, teamMembers, newHires,
    departures, opexLines, capexItems, plannedSpends, investments, priorYear } = state;

  const months = getFiscalMonthLabels(DEFAULT_YEAR_START_MONTH);
  const fy = (offset: number) => `FY${(fiscalYear + offset).toString().slice(-2)}`;

  /** Every month the forecast covers, across all of its years. */
  const monthKeysAll = Array.from({ length: forecastDuration }, (_, i) =>
    generateMonthKeys((state.fiscalYearStart || fiscalYear - 1) + i),
  ).flat();




  // Build a full monthly P&L tab for one year
  /**
   * Build one year's P&L sheet from the SAME lines the server stores.
   *
   * This tab used to re-derive the entire P&L — its own team loop, its own OpEx
   * growth, its own depreciation — and had drifted: net profit was
   * `gp − team − opex − dep`, omitting subscriptions, investments and the Xero
   * other income/expense buckets; new hires were escalated at a hardcoded 3%
   * instead of their own rate; seasonal OpEx carried an off-by-one the summary
   * had already fixed. This is the spreadsheet CFO-only clients receive, so a
   * second opinion about their numbers is the one thing it must not be.
   *
   * It now runs `convertAssumptionsToPLLines` over the canonical assumptions —
   * byte-identical to what Generate materialises into forecast_pl_lines — so the
   * sheet and the stored budget cannot disagree.
   */
  const buildPLTab = (yearNum: 1 | 2 | 3): { rows: Row[]; colWidths: number[] } => {
    const yearOffset = yearNum - 1;
    const monthKeys = generateMonthKeys((state.fiscalYearStart || fiscalYear - 1) + yearOffset);
    const rows: Row[] = [];

    const assumptions = buildAssumptions();
    const plLines = convertAssumptionsToPLLines({
      assumptions,
      forecastStartMonth: monthKeysAll[0],
      forecastEndMonth: monthKeysAll[monthKeysAll.length - 1],
      fiscalYear,
      forecastDuration,
      existingLines: [],
    });

    const monthsOf = (line: { forecast_months?: Record<string, number> | null }) =>
      monthKeys.map(k => Math.round(line.forecast_months?.[k] ?? 0));
    const inCategory = (...names: string[]) => {
      const want = new Set(names.map(n => n.toLowerCase()));
      return plLines.filter(l => want.has((l.category || '').trim().toLowerCase()));
    };
    const sumInto = (target: number[], values: number[]) => {
      values.forEach((v, i) => { target[i] += v; });
    };
    const total = (values: number[]) => values.reduce((a, b) => a + b, 0);

    /** Emit a titled section and return its monthly totals. */
    const section = (title: string, lines: ReturnType<typeof inCategory>, totalLabel: string) => {
      rows.push([title]);
      const totals = new Array(12).fill(0);
      for (const line of lines) {
        const values = monthsOf(line);
        if (values.every(v => v === 0)) continue;
        sumInto(totals, values);
        rows.push([`  ${line.account_name}`, ...values, total(values)]);
      }
      rows.push([totalLabel, ...totals, total(totals)]);
      rows.push([]);
      return totals;
    };

    rows.push([`P&L Forecast — ${fy(yearOffset)}`, ...months, 'TOTAL']);
    rows.push([]);

    const monthlyRevenueTotals = section('REVENUE', inCategory('Revenue'), 'TOTAL REVENUE');
    const totalRevenue = total(monthlyRevenueTotals);

    const monthlyCogsTotals = section('COST OF SALES', inCategory('Cost of Sales'), 'TOTAL COGS');

    const monthlyGP = monthlyRevenueTotals.map((r, i) => r - monthlyCogsTotals[i]);
    const totalGP = total(monthlyGP);
    rows.push(['GROSS PROFIT', ...monthlyGP, totalGP]);
    rows.push(['GP %', ...monthlyGP.map((gp, i) =>
      monthlyRevenueTotals[i] > 0 ? `${(gp / monthlyRevenueTotals[i] * 100).toFixed(1)}%` : ''
    ), totalRevenue > 0 ? `${(totalGP / totalRevenue * 100).toFixed(1)}%` : '']);
    rows.push([]);

    // Everything that is not income and not cost of sales is an expense.
    //
    // Matching on 'Operating Expenses' alone would DROP the Xero other-expenses
    // bucket, which the materialiser files under its own 'Other Expenses'
    // category — the exact class of silent omission this rewrite exists to end.
    // Defining the expense side by exclusion also means a category added later
    // shows up as a cost rather than vanishing, which is the safe direction to
    // be wrong in. Same rule as checkSummaryParity.
    const expenseLines = plLines.filter(l => {
      const c = (l.category || '').trim().toLowerCase();
      return c !== 'revenue' && c !== 'other income' && c !== 'cost of sales' && c !== 'cogs';
    });
    const monthlyOpexTotals = section('OPERATING EXPENSES', expenseLines, 'TOTAL OPERATING EXPENSES');

    // Other income is added, not subtracted — it is filed under a revenue-like
    // category by the materialiser and must not inflate the expense side.
    const otherIncomeLines = inCategory('Other Income');
    const monthlyOtherIncome = new Array(12).fill(0);
    if (otherIncomeLines.length > 0) {
      for (const line of otherIncomeLines) sumInto(monthlyOtherIncome, monthsOf(line));
      rows.push(['OTHER INCOME', ...monthlyOtherIncome, total(monthlyOtherIncome)]);
      rows.push([]);
    }

    const monthlyNP = monthlyGP.map((gp, i) => gp - monthlyOpexTotals[i] + monthlyOtherIncome[i]);
    const totalNP = total(monthlyNP);
    rows.push(['NET PROFIT (before tax)', ...monthlyNP, totalNP]);
    rows.push(['Net Margin %', ...monthlyNP.map((np, i) =>
      monthlyRevenueTotals[i] > 0 ? `${(np / monthlyRevenueTotals[i] * 100).toFixed(1)}%` : ''
    ), totalRevenue > 0 ? `${(totalNP / totalRevenue * 100).toFixed(1)}%` : '']);

    // Goals comparison
    rows.push([]);
    const yearGoals = yearNum === 1 ? goals.year1 : yearNum === 2 ? goals.year2 : goals.year3;
    if (yearGoals) {
      rows.push(['TARGETS (Step 1)']);
      rows.push([`  Revenue Target`, '', '', '', '', '', '', '', '', '', '', '', yearGoals.revenue || 0]);
      rows.push([`  GP% Target`, '', '', '', '', '', '', '', '', '', '', '', yearGoals.grossProfitPct ? `${yearGoals.grossProfitPct}%` : '']);
      rows.push([`  NP% Target`, '', '', '', '', '', '', '', '', '', '', '', yearGoals.netProfitPct ? `${yearGoals.netProfitPct}%` : '']);
    }

    // Prior year comparison (Y1 only)
    if (yearNum === 1 && priorYear) {
      rows.push([]);
      rows.push(['PRIOR YEAR ACTUALS']);
      const priorMonthKeys = generateMonthKeys((state.fiscalYearStart || fiscalYear - 1) - 1);
      const priorRevByMonth = priorMonthKeys.map(key => priorYear.revenue.byMonth?.[key] || 0);
      rows.push(['  Revenue', ...priorRevByMonth, priorYear.revenue.total]);
      const priorCogsByMonth = priorMonthKeys.map(key => priorYear.cogs.byMonth?.[key] || 0);
      rows.push(['  COGS', ...priorCogsByMonth, priorYear.cogs.total]);
      const priorGP = priorRevByMonth.map((r, i) => r - priorCogsByMonth[i]);
      rows.push(['  Gross Profit', ...priorGP, priorYear.revenue.total - priorYear.cogs.total]);
      const priorOpexByMonth = priorMonthKeys.map(key => priorYear.opex.byMonth?.[key] || 0);
      rows.push(['  OpEx', ...priorOpexByMonth, priorYear.opex.total]);
    }

    return { rows, colWidths: [26, ...new Array(12).fill(12), 14] };
  };

  const handleExport = async () => {
    const sheets: SheetSpec[] = [];

    // ── Assumptions Tab ──
    const aRows: Row[] = [
      ['FORECAST ASSUMPTIONS'],
      [],
      ['Overview'],
      [`Duration: ${forecastDuration} year${forecastDuration > 1 ? 's' : ''} (${fy(0)}${forecastDuration > 1 ? `-${fy(forecastDuration - 1)}` : ''})`],
      [`Industry: ${state.businessProfile?.industry || 'Not set'}`],
      [`Generated: ${new Date().toLocaleDateString()}`],
      [],
      ['REVENUE ASSUMPTIONS'],
      ['Line', 'Prior Year', 'Y1 Forecast', 'Y1 Growth', 'Y2 Growth', 'Y3 Growth'],
    ];
    revenueLines.forEach(line => {
      const prior = priorYear?.revenue.byLine.find(l => l.id === line.id)?.total || 0;
      const y1 = getRevenueLineYearTotal(line, 1);
      const y2 = getRevenueLineYearTotal(line, 2);
      const y3 = getRevenueLineYearTotal(line, 3);
      aRows.push([
        line.name,
        prior,
        y1,
        prior > 0 ? `${((y1 / prior - 1) * 100).toFixed(1)}%` : '',
        y1 > 0 && y2 > 0 ? `${((y2 / y1 - 1) * 100).toFixed(1)}%` : '',
        y2 > 0 && y3 > 0 ? `${((y3 / y2 - 1) * 100).toFixed(1)}%` : '',
      ]);
    });

    aRows.push([], ['COST OF SALES'], ['Line', 'Type', 'Value', 'Annual']);
    cogsLines.forEach(line => {
      const annual = line.costBehavior === 'fixed'
        ? (line.monthlyAmount || 0) * 12
        : (summary.year1.revenue * (line.percentOfRevenue || 0)) / 100;
      aRows.push([line.name, line.costBehavior,
        line.costBehavior === 'variable' ? `${line.percentOfRevenue || 0}%` : `$${line.monthlyAmount || 0}/mo`,
        annual]);
    });

    aRows.push([], ['TEAM ASSUMPTIONS']);
    aRows.push([`Current team: ${teamMembers.length}`]);
    if (newHires.length > 0) aRows.push([`Planned hires: ${newHires.length}`, ...newHires.map(h => `${h.role} (${h.startMonth})`)]);
    if (departures.length > 0) aRows.push([`Departures: ${departures.length}`]);

    aRows.push([], ['OPERATING EXPENSES']);
    aRows.push([`Default increase: ${state.defaultOpExIncreasePct || 3}%/year`]);
    const fixed = opexLines.filter(l => l.costBehavior === 'fixed').length;
    const variable = opexLines.filter(l => l.costBehavior === 'variable').length;
    aRows.push([`Fixed: ${fixed}`, `Variable: ${variable}`, `Other: ${opexLines.length - fixed - variable}`]);

    if ((plannedSpends?.length ?? 0) > 0) {
      // Name the financing choice explicitly — lease vs purchase is the decision
      // the client makes at budget prep, and it changes the P&L, so the schedule
      // has to say which one was assumed.
      aRows.push([], ['CAPITAL EXPENDITURE'], ['Item', 'Amount', 'Month', 'Financing', 'Y1 Depreciation', 'Y1 Expense']);
      plannedSpends.forEach(i => {
        const b = getPlannedSpendPLBreakdown(i, 1);
        aRows.push([
          i.description,
          i.amount,
          `Month ${i.month}`,
          (i.lease_type || i.paymentMethod || 'outright').replace(/_/g, ' '),
          b.depreciation,
          b.expenses,
        ]);
      });
    } else if (capexItems.length > 0) {
      aRows.push([], ['CAPITAL EXPENDITURE'], ['Item', 'Cost', 'Month', 'Life']);
      capexItems.forEach(i => aRows.push([i.description, i.cost, `Month ${i.month}`, `${i.usefulLifeYears} years`]));
    }

    aRows.push([], ['TARGETS (Step 1)'], ['Year', 'Revenue', 'GP%', 'NP%']);
    [goals.year1, goals.year2, goals.year3].slice(0, forecastDuration).forEach((g, i) => {
      if (g) aRows.push([fy(i), g.revenue || 0, g.grossProfitPct ? `${g.grossProfitPct}%` : '', g.netProfitPct ? `${g.netProfitPct}%` : '']);
    });

    sheets.push({ name: 'Assumptions', rows: aRows, colWidths: [24, 14, 14, 14, 14, 14] });

    // ── P&L Tabs (one per year, monthly) ──
    for (let yr = 1; yr <= forecastDuration; yr++) {
      const { rows: plRows, colWidths } = buildPLTab(yr as 1 | 2 | 3);
      sheets.push({ name: fy(yr - 1), rows: plRows, colWidths });
    }

    // ── Team Tab ──
    const tRows: Row[] = [
      ['TEAM ROSTER'],
      [],
      ['Name', 'Role', 'Type', 'Hours/wk', 'Salary', 'Increase %', 'New Salary', 'Super', 'Total Cost', 'Status'],
    ];
    teamMembers.forEach(m => {
      const departure = departures.find(d => d.teamMemberId === m.id);
      tRows.push([
        m.name, m.role, m.type, m.hoursPerWeek,
        m.currentSalary, m.increasePct, m.newSalary, m.superAmount,
        m.newSalary + m.superAmount,
        departure ? `Departs ${departure.endMonth}` : 'Active',
      ]);
    });
    if (newHires.length > 0) {
      tRows.push([]);
      tRows.push(['PLANNED HIRES']);
      tRows.push(['Role', '', 'Type', 'Hours/wk', 'Salary', '', '', 'Super', 'Total Cost', 'Start']);
      newHires.forEach(h => {
        tRows.push([h.role, '', h.type, h.hoursPerWeek, h.salary, '', '', h.superAmount, h.salary + h.superAmount, h.startMonth]);
      });
    }
    tRows.push([]);
    const yearSums = [1, 2, 3].slice(0, forecastDuration).map(yr => {
      const yearSummary = yr === 1 ? summary.year1 : yr === 2 ? summary.year2 : summary.year3;
      return yearSummary?.teamCosts || 0;
    });
    tRows.push(['TOTAL TEAM COST', '', '', '', ...yearSums.map((s, i) => `${fy(i)}: $${s.toLocaleString()}`)]);

    sheets.push({ name: 'Team', rows: tRows, colWidths: [22, 18, 12, 10, 12, 10, 12, 12, 14, 16] });

    // ── Subscriptions Tab ──
    // Phase 57 T15: read from state.subscriptions (VendorBudget[]) — the new
    // post-Phase-57 source of truth. Pre-Phase-57 this filtered opexLines by
    // the dead `isSubscription` flag and produced an empty tab on every
    // forecast. Y2/Y3 grow with state.defaultOpExIncreasePct (CONTEXT.md line
    // 34: "subscriptions Y2/Y3 grow with state.defaultOpExIncreasePct").
    const sRows: Row[] = [
      ['SUBSCRIPTION AUDIT'],
      [],
    ];
    const activeSubs = (state.subscriptions || []).filter(v => v.isActive);
    const subGrowthPct = state.defaultOpExIncreasePct ?? 3;
    const subGrowthFactor = (year: 2 | 3) => Math.pow(1 + subGrowthPct / 100, year - 1);
    if (activeSubs.length > 0) {
      sRows.push([
        'Vendor', 'Category', 'Frequency', 'Account Codes',
        'Monthly Budget', `Annual ${fy(0)}`, `Annual ${fy(1)}`, `Annual ${fy(2)}`,
      ]);
      let totalMonthly = 0;
      let totalY1 = 0;
      let totalY2 = 0;
      let totalY3 = 0;
      activeSubs.forEach(v => {
        const monthly = v.monthlyBudget || 0;
        const annualY1 = monthly * 12;
        const annualY2 = annualY1 * subGrowthFactor(2);
        const annualY3 = annualY1 * subGrowthFactor(3);
        totalMonthly += monthly;
        totalY1 += annualY1;
        totalY2 += annualY2;
        totalY3 += annualY3;
        sRows.push([
          v.vendorName,
          v.category ?? '',
          v.frequency,
          (v.accountCodes ?? []).join(', '),
          Math.round(monthly),
          Math.round(annualY1),
          Math.round(annualY2),
          Math.round(annualY3),
        ]);
      });
      sRows.push([]);
      sRows.push([
        'TOTAL', '', '', '',
        Math.round(totalMonthly),
        Math.round(totalY1),
        Math.round(totalY2),
        Math.round(totalY3),
      ]);
      sRows.push([]);
      sRows.push([`Y2/Y3 growth applied: ${subGrowthPct}%/year (state.defaultOpExIncreasePct)`]);
    } else {
      sRows.push(['No subscription audit data available.']);
      sRows.push(['Run the Subscription Audit in Step 5 of the forecast wizard to populate this tab.']);
    }

    sheets.push({
      name: 'Subscriptions',
      rows: sRows,
      colWidths: [28, 18, 12, 18, 14, 14, 14, 14],
    });

    // Download
    const businessName = (state.businessProfile as any)?.businessName || (state.businessProfile as any)?.name || 'Forecast';
    await downloadXlsx(sheets, `${businessName} - ${fy(0)} Forecast.xlsx`);
  };

  return (
    <button
      onClick={handleExport}
      className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
    >
      <Download className="w-4 h-4" />
      Export to Excel
    </button>
  );
}
