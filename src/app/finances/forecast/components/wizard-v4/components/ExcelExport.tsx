'use client';

import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  ForecastWizardState, formatCurrency, generateMonthKeys,
  getRevenueLineYearTotal, SUPER_RATE, calculateNewSalary,
} from '../types';
import { isTeamCost } from '../utils/opex-classifier';
import type { ForecastSummary } from '../types';

interface ExcelExportProps {
  state: ForecastWizardState;
  summary: ForecastSummary;
  fiscalYear: number;
}

type Row = (string | number)[];

export function ExcelExport({ state, summary, fiscalYear }: ExcelExportProps) {
  const { goals, forecastDuration, revenueLines, cogsLines, teamMembers, newHires,
    departures, opexLines, capexItems, investments, priorYear } = state;

  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const fy = (offset: number) => `FY${(fiscalYear + offset).toString().slice(-2)}`;

  // Get monthly revenue for a line in a given year
  const getLineMonthlyRevenue = (line: typeof revenueLines[0], yearNum: 1 | 2 | 3): Record<string, number> => {
    if (yearNum === 1) return line.year1Monthly;
    if (yearNum === 2) return line.year2Monthly || {};
    return line.year3Monthly || {};
  };

  // Calculate monthly team costs with actual hire/departure timing
  const getMonthlyTeamCosts = (yearNum: 1 | 2 | 3, monthKeys: string[]): number[] => {
    const targetFY = (state.fiscalYearStart || fiscalYear - 1) + yearNum;
    const monthlyCosts = new Array(12).fill(0);

    // Existing team — flat monthly
    for (const member of teamMembers) {
      const salary = calculateNewSalary(member.currentSalary, member.increasePct || 0);
      const annual = salary * Math.pow(1 + (member.increasePct || 0) / 100, yearNum - 1);
      const monthly = annual / 12;
      const superMonthly = member.type !== 'contractor' ? monthly * SUPER_RATE : 0;

      const departure = departures.find(d => d.teamMemberId === member.id);
      for (let i = 0; i < 12; i++) {
        if (departure) {
          const [dYear, dMonth] = departure.endMonth.split('-').map(Number);
          const depKey = `${dYear}-${String(dMonth).padStart(2, '0')}`;
          if (monthKeys[i] > depKey) continue;
        }
        monthlyCosts[i] += monthly + superMonthly;
      }
    }

    // New hires — start from hire month
    for (const hire of newHires) {
      const salary = hire.salary * Math.pow(1.03, yearNum - 1);
      const monthly = salary / 12;
      const superMonthly = hire.type !== 'contractor' ? monthly * SUPER_RATE : 0;

      for (let i = 0; i < 12; i++) {
        if (monthKeys[i] >= hire.startMonth) {
          monthlyCosts[i] += monthly + superMonthly;
        }
      }
    }

    return monthlyCosts.map(v => Math.round(v));
  };

  // Get monthly OpEx for a line
  const getMonthlyOpEx = (line: typeof opexLines[0], yearNum: number, monthlyRevenue: number[]): number[] => {
    if (line.isTeamCostOverride !== undefined ? line.isTeamCostOverride : isTeamCost(line.name)) {
      return new Array(12).fill(0);
    }
    const defaultIncrease = state.defaultOpExIncreasePct || 3;
    const growthFactor = Math.pow(1 + (line.annualIncreasePct || defaultIncrease) / 100, yearNum - 1);

    switch (line.costBehavior) {
      case 'fixed':
        return new Array(12).fill(Math.round((line.monthlyAmount || 0) * growthFactor));
      case 'variable':
        return monthlyRevenue.map(rev => Math.round(rev * (line.percentOfRevenue || 0) / 100));
      case 'seasonal': {
        const pattern = priorYear?.seasonalityPattern || Array(12).fill(8.33);
        const total = pattern.reduce((s, v) => s + v, 0);
        const annualGrowth = Math.pow(1 + (line.seasonalGrowthPct || 0) / 100, yearNum);
        const annual = line.priorYearAnnual * annualGrowth;
        return pattern.map(p => Math.round(annual * (p / total)));
      }
      case 'adhoc':
        return new Array(12).fill(Math.round((line.expectedAnnualAmount || 0) / 12));
      default:
        return new Array(12).fill(0);
    }
  };

  // Build a full monthly P&L tab for one year
  const buildPLTab = (yearNum: 1 | 2 | 3): XLSX.WorkSheet => {
    const yearOffset = yearNum - 1;
    const monthKeys = generateMonthKeys((state.fiscalYearStart || fiscalYear - 1) + yearOffset);
    const rows: Row[] = [];

    // Header
    rows.push([`P&L Forecast — ${fy(yearOffset)}`, ...months, 'TOTAL']);
    rows.push([]);

    // Revenue lines
    rows.push(['REVENUE']);
    const monthlyRevenueTotals = new Array(12).fill(0);
    revenueLines.forEach(line => {
      const monthly = getLineMonthlyRevenue(line, yearNum);
      const values = monthKeys.map((key, i) => {
        const val = monthly[key] || 0;
        monthlyRevenueTotals[i] += val;
        return val;
      });
      const total = values.reduce((a, b) => a + b, 0);
      rows.push([`  ${line.name}`, ...values, total]);
    });
    const totalRevenue = monthlyRevenueTotals.reduce((a, b) => a + b, 0);
    rows.push(['TOTAL REVENUE', ...monthlyRevenueTotals, totalRevenue]);
    rows.push([]);

    // COGS lines
    rows.push(['COST OF SALES']);
    const monthlyCogsTotals = new Array(12).fill(0);
    cogsLines.forEach(line => {
      const values = monthKeys.map((_, i) => {
        let val = 0;
        if (line.costBehavior === 'variable') {
          val = Math.round(monthlyRevenueTotals[i] * (line.percentOfRevenue || 0) / 100);
        } else {
          val = line.monthlyAmount || 0;
        }
        monthlyCogsTotals[i] += val;
        return val;
      });
      const total = values.reduce((a, b) => a + b, 0);
      rows.push([`  ${line.name}`, ...values, total]);
    });
    const totalCogs = monthlyCogsTotals.reduce((a, b) => a + b, 0);
    rows.push(['TOTAL COGS', ...monthlyCogsTotals, totalCogs]);
    rows.push([]);

    // Gross Profit
    const monthlyGP = monthlyRevenueTotals.map((rev, i) => rev - monthlyCogsTotals[i]);
    const totalGP = totalRevenue - totalCogs;
    rows.push(['GROSS PROFIT', ...monthlyGP, totalGP]);
    rows.push(['Gross Margin %', ...monthlyGP.map((gp, i) =>
      monthlyRevenueTotals[i] > 0 ? `${(gp / monthlyRevenueTotals[i] * 100).toFixed(1)}%` : ''
    ), totalRevenue > 0 ? `${(totalGP / totalRevenue * 100).toFixed(1)}%` : '']);
    rows.push([]);

    // Team Costs
    const monthlyTeam = getMonthlyTeamCosts(yearNum, monthKeys);
    const totalTeam = monthlyTeam.reduce((a, b) => a + b, 0);
    rows.push(['TEAM COSTS', ...monthlyTeam, totalTeam]);
    rows.push([]);

    // OpEx lines
    rows.push(['OPERATING EXPENSES']);
    const monthlyOpexTotals = new Array(12).fill(0);
    opexLines.forEach(line => {
      const values = getMonthlyOpEx(line, yearNum, monthlyRevenueTotals);
      if (values.every(v => v === 0)) return; // Skip team cost lines
      values.forEach((v, i) => { monthlyOpexTotals[i] += v; });
      const total = values.reduce((a, b) => a + b, 0);
      rows.push([`  ${line.name}`, ...values, total]);
    });
    const totalOpex = monthlyOpexTotals.reduce((a, b) => a + b, 0);
    rows.push(['TOTAL OPEX', ...monthlyOpexTotals, totalOpex]);
    rows.push([]);

    // Depreciation
    const annualDep = capexItems.reduce((s, item) => s + Math.round(item.cost / item.usefulLifeYears), 0);
    const monthlyDep = Math.round(annualDep / 12);
    rows.push(['DEPRECIATION', ...new Array(12).fill(monthlyDep), annualDep]);
    rows.push([]);

    // Net Profit
    const monthlyNP = monthlyGP.map((gp, i) => gp - monthlyTeam[i] - monthlyOpexTotals[i] - monthlyDep);
    const totalNP = monthlyNP.reduce((a, b) => a + b, 0);
    rows.push(['NET PROFIT', ...monthlyNP, totalNP]);
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

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 26 }, ...new Array(12).fill({ wch: 12 }), { wch: 14 }];
    return ws;
  };

  const handleExport = () => {
    const wb = XLSX.utils.book_new();

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

    if (capexItems.length > 0) {
      aRows.push([], ['CAPITAL EXPENDITURE'], ['Item', 'Cost', 'Month', 'Life']);
      capexItems.forEach(i => aRows.push([i.description, i.cost, `Month ${i.month}`, `${i.usefulLifeYears} years`]));
    }

    aRows.push([], ['TARGETS (Step 1)'], ['Year', 'Revenue', 'GP%', 'NP%']);
    [goals.year1, goals.year2, goals.year3].slice(0, forecastDuration).forEach((g, i) => {
      if (g) aRows.push([fy(i), g.revenue || 0, g.grossProfitPct ? `${g.grossProfitPct}%` : '', g.netProfitPct ? `${g.netProfitPct}%` : '']);
    });

    const wsA = XLSX.utils.aoa_to_sheet(aRows);
    wsA['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsA, 'Assumptions');

    // ── P&L Tabs (one per year, monthly) ──
    for (let yr = 1; yr <= forecastDuration; yr++) {
      const ws = buildPLTab(yr as 1 | 2 | 3);
      XLSX.utils.book_append_sheet(wb, ws, fy(yr - 1));
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

    const wsT = XLSX.utils.aoa_to_sheet(tRows);
    wsT['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsT, 'Team');

    // ── Subscriptions Tab ──
    const sRows: Row[] = [
      ['SUBSCRIPTION AUDIT'],
      [],
    ];
    const subLines = opexLines.filter(l => l.isSubscription);
    if (subLines.length > 0) {
      sRows.push(['Vendor', 'Cost Behaviour', 'Monthly', 'Annual', 'Prior Year']);
      subLines.forEach(l => {
        const monthly = l.costBehavior === 'fixed' ? (l.monthlyAmount || 0) : 0;
        sRows.push([l.name, l.costBehavior, monthly, monthly * 12, l.priorYearAnnual]);
      });
      sRows.push([]);
      const totalMonthly = subLines.reduce((s, l) => s + (l.monthlyAmount || 0), 0);
      sRows.push(['TOTAL', '', totalMonthly, totalMonthly * 12]);
    } else {
      sRows.push(['No subscription audit data available.']);
      sRows.push(['Run the Subscription Audit in Step 6 of the forecast wizard to populate this tab.']);
    }

    const wsS = XLSX.utils.aoa_to_sheet(sRows);
    wsS['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsS, 'Subscriptions');

    // Download
    const businessName = (state.businessProfile as any)?.businessName || (state.businessProfile as any)?.name || 'Forecast';
    XLSX.writeFile(wb, `${businessName} - ${fy(0)} Forecast.xlsx`);
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
