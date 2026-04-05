'use client';

import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ForecastWizardState, formatCurrency } from '../types';
import type { ForecastSummary } from '../types';

interface ExcelExportProps {
  state: ForecastWizardState;
  summary: ForecastSummary;
  fiscalYear: number;
}

export function ExcelExport({ state, summary, fiscalYear }: ExcelExportProps) {
  const { goals, forecastDuration, revenueLines, cogsLines, teamMembers, newHires, departures, opexLines, capexItems } = state;

  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    const fy = (offset: number) => `FY${(fiscalYear + offset).toString().slice(-2)}`;

    // ── Sheet 1: P&L Summary ──
    const plRows: (string | number)[][] = [
      ['P&L Summary', fy(0), '', fy(1), '', fy(2), ''],
      ['', '$', '%', '$', '%', '$', '%'],
    ];

    const years = [summary.year1, summary.year2, summary.year3].slice(0, forecastDuration);
    const addRow = (label: string, field: keyof typeof summary.year1, pctField?: keyof typeof summary.year1) => {
      const row: (string | number)[] = [label];
      years.forEach(y => {
        if (!y) return;
        row.push(y[field] as number);
        row.push(pctField && y.revenue > 0 ? `${((y[pctField] as number)).toFixed(1)}%` : '');
      });
      plRows.push(row);
    };

    addRow('Revenue', 'revenue');
    addRow('Cost of Sales', 'cogs');
    addRow('Gross Profit', 'grossProfit', 'grossProfitPct');
    addRow('Team Costs', 'teamCosts');
    addRow('Operating Expenses', 'opex');
    addRow('Depreciation', 'depreciation');
    addRow('Other Expenses', 'otherExpenses');
    addRow('Net Profit', 'netProfit', 'netProfitPct');

    plRows.push([]);
    plRows.push(['Goals (from Step 1)']);
    const goalYears = [goals.year1, goals.year2, goals.year3].slice(0, forecastDuration);
    plRows.push(['Revenue Target', ...goalYears.flatMap(g => [g?.revenue || 0, ''])]);
    plRows.push(['GP% Target', ...goalYears.flatMap(g => ['', g?.grossProfitPct ? `${g.grossProfitPct}%` : ''])]);
    plRows.push(['NP% Target', ...goalYears.flatMap(g => ['', g?.netProfitPct ? `${g.netProfitPct}%` : ''])]);

    const ws1 = XLSX.utils.aoa_to_sheet(plRows);
    ws1['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'P&L Summary');

    // ── Sheet 2: Detail ──
    const detailRows: (string | number)[][] = [
      ['Revenue Lines'],
      ['Line', 'Prior Year', ...Array(forecastDuration).flatMap((_, i) => [`${fy(i)} Forecast`])],
    ];
    revenueLines.forEach(line => {
      const y1 = Object.values(line.year1Monthly).reduce((a, b) => a + b, 0);
      const y2 = line.year2Quarterly.q1 + line.year2Quarterly.q2 + line.year2Quarterly.q3 + line.year2Quarterly.q4;
      const y3 = line.year3Quarterly.q1 + line.year3Quarterly.q2 + line.year3Quarterly.q3 + line.year3Quarterly.q4;
      const vals = [y1, y2, y3].slice(0, forecastDuration);
      const priorLine = state.priorYear?.revenue.byLine.find(l => l.id === line.id);
      detailRows.push([line.name, priorLine?.total || 0, ...vals]);
    });

    detailRows.push([]);
    detailRows.push(['COGS Lines']);
    detailRows.push(['Line', 'Type', 'Value', 'Annual']);
    cogsLines.forEach(line => {
      const annual = line.costBehavior === 'fixed' ? (line.monthlyAmount || 0) * 12 : (summary.year1.revenue * (line.percentOfRevenue || 0)) / 100;
      detailRows.push([
        line.name,
        line.costBehavior,
        line.costBehavior === 'variable' ? `${line.percentOfRevenue || 0}%` : `$${line.monthlyAmount || 0}/mo`,
        annual,
      ]);
    });

    detailRows.push([]);
    detailRows.push(['Team Members']);
    detailRows.push(['Name', 'Role', 'Type', 'Salary', 'Super', 'Total Cost']);
    teamMembers.forEach(m => {
      detailRows.push([m.name, m.role, m.type, m.currentSalary, m.superAmount, m.newSalary + m.superAmount]);
    });
    if (newHires.length > 0) {
      detailRows.push([]);
      detailRows.push(['Planned Hires']);
      newHires.forEach(h => {
        detailRows.push([h.role, '', h.type, h.salary, h.superAmount, h.salary + h.superAmount, `Start: ${h.startMonth}`]);
      });
    }

    detailRows.push([]);
    detailRows.push(['Operating Expenses']);
    detailRows.push(['Line', 'Behaviour', 'Value', 'Prior Year']);
    opexLines.forEach(line => {
      let value = '';
      if (line.costBehavior === 'fixed') value = `$${line.monthlyAmount || 0}/mo`;
      else if (line.costBehavior === 'variable') value = `${line.percentOfRevenue || 0}%`;
      else if (line.costBehavior === 'seasonal') value = `${line.seasonalGrowthPct || 0}% growth`;
      else value = `$${line.expectedAnnualAmount || 0}/yr`;
      detailRows.push([line.name, line.costBehavior, value, line.priorYearAnnual]);
    });

    const ws2 = XLSX.utils.aoa_to_sheet(detailRows);
    ws2['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Detail');

    // ── Sheet 3: Key Assumptions ──
    const assumptionRows: (string | number)[][] = [
      ['Key Assumptions'],
      [],
      ['Revenue Growth'],
    ];
    revenueLines.forEach(line => {
      const priorLine = state.priorYear?.revenue.byLine.find(l => l.id === line.id);
      const prior = priorLine?.total || 0;
      const forecast = Object.values(line.year1Monthly).reduce((a, b) => a + b, 0);
      const growth = prior > 0 ? ((forecast - prior) / prior * 100).toFixed(1) : 'N/A';
      assumptionRows.push([line.name, `${growth}% growth`, `Prior: $${prior.toLocaleString()}`, `Forecast: $${forecast.toLocaleString()}`]);
    });

    assumptionRows.push([]);
    assumptionRows.push(['Team Changes']);
    assumptionRows.push([`Existing team: ${teamMembers.length} people`]);
    if (newHires.length > 0) assumptionRows.push([`Planned hires: ${newHires.length}`, ...newHires.map(h => `${h.role} (${h.startMonth})`)]);
    if (departures.length > 0) assumptionRows.push([`Departures: ${departures.length}`]);

    assumptionRows.push([]);
    assumptionRows.push(['OpEx Assumptions']);
    assumptionRows.push([`Default annual increase: ${state.defaultOpExIncreasePct || 3}%`]);
    assumptionRows.push([`Total OpEx lines: ${opexLines.length}`]);
    const fixedCount = opexLines.filter(l => l.costBehavior === 'fixed').length;
    const variableCount = opexLines.filter(l => l.costBehavior === 'variable').length;
    assumptionRows.push([`Fixed: ${fixedCount}`, `Variable: ${variableCount}`, `Other: ${opexLines.length - fixedCount - variableCount}`]);

    if (capexItems.length > 0) {
      assumptionRows.push([]);
      assumptionRows.push(['Capital Expenditure']);
      capexItems.forEach(item => {
        assumptionRows.push([item.description, `$${item.cost.toLocaleString()}`, `Month ${item.month}`, `${item.usefulLifeYears}yr life`]);
      });
    }

    assumptionRows.push([]);
    assumptionRows.push([`Forecast Duration: ${forecastDuration} year${forecastDuration > 1 ? 's' : ''}`]);
    assumptionRows.push([`Fiscal Year: FY${fiscalYear}`]);
    assumptionRows.push([`Generated: ${new Date().toLocaleDateString()}`]);

    const ws3 = XLSX.utils.aoa_to_sheet(assumptionRows);
    ws3['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Key Assumptions');

    // Download
    const businessName = (state.businessProfile as any)?.businessName || (state.businessProfile as any)?.name || 'Forecast';
    XLSX.writeFile(wb, `${businessName} - FY${fiscalYear} Forecast.xlsx`);
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
