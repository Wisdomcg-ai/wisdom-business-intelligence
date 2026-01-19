'use client';

import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Lightbulb } from 'lucide-react';
import { ForecastWizardState, WizardActions, ForecastSummary, ForecastDuration, YearlySummary, formatCurrency, formatPercent } from '../types';

interface Step8ReviewProps {
  state: ForecastWizardState;
  actions: WizardActions;
  summary: ForecastSummary;
  fiscalYear: number;
}

// Helper to safely get year summary
const getYearSummary = (summary: ForecastSummary, yearNum: 1 | 2 | 3): YearlySummary | undefined => {
  if (yearNum === 1) return summary.year1;
  if (yearNum === 2) return summary.year2;
  return summary.year3;
};

// Default empty summary for calculations
const emptySummary: YearlySummary = {
  revenue: 0,
  cogs: 0,
  grossProfit: 0,
  grossProfitPct: 0,
  teamCosts: 0,
  opex: 0,
  depreciation: 0,
  otherExpenses: 0,
  netProfit: 0,
  netProfitPct: 0,
};

export function Step8Review({ state, actions, summary, fiscalYear }: Step8ReviewProps) {
  const { goals, forecastDuration } = state;

  const getVariance = (actual: number, target: number) => actual - target;
  const getVarianceStatus = (actual: number, target: number, higherIsBetter = true) => {
    const diff = actual - target;
    if (Math.abs(diff) < 0.5) return 'on-track';
    if (higherIsBetter) return diff > 0 ? 'above' : 'below';
    return diff < 0 ? 'above' : 'below';
  };

  const statusColors = {
    'on-track': 'text-green-600 bg-green-100',
    above: 'text-green-600 bg-green-100',
    below: 'text-red-600 bg-red-100',
  };

  const statusIcons = {
    'on-track': <CheckCircle className="w-4 h-4" />,
    above: <TrendingUp className="w-4 h-4" />,
    below: <TrendingDown className="w-4 h-4" />,
  };

  // Get summaries safely
  const year1 = summary.year1;
  const year2 = summary.year2 || emptySummary;
  const year3 = summary.year3 || emptySummary;

  // Generate AI insights
  const insights: { type: 'warning' | 'success' | 'info'; message: string }[] = [];

  // Check Year 1 net profit
  if (year1.netProfitPct < goals.year1.netProfitPct - 2) {
    const gap = goals.year1.netProfitPct - year1.netProfitPct;
    const revenueGap = Math.round((gap / 100) * year1.revenue);
    insights.push({
      type: 'warning',
      message: `Year 1 net profit (${formatPercent(year1.netProfitPct)}) is ${formatPercent(gap)} below your ${formatPercent(goals.year1.netProfitPct)} target. You'd need to reduce costs by ${formatCurrency(revenueGap)} or increase revenue.`,
    });
  }

  // Check team costs as % of revenue
  const teamPct = (year1.teamCosts / year1.revenue) * 100;
  if (teamPct > 35) {
    insights.push({
      type: 'warning',
      message: `Team costs are ${formatPercent(teamPct)} of revenue. Consider if new hires align with revenue growth or can be delayed.`,
    });
  }

  // Check gross profit trend
  if (year1.grossProfitPct >= goals.year1.grossProfitPct) {
    insights.push({
      type: 'success',
      message: `Gross profit margin (${formatPercent(year1.grossProfitPct)}) meets or exceeds your ${formatPercent(goals.year1.grossProfitPct)} target.`,
    });
  }

  // Growth trajectory - only for multi-year forecasts
  if (forecastDuration >= 2 && summary.year2 && year1.revenue > 0) {
    const y1y2Growth = ((year2.revenue - year1.revenue) / year1.revenue) * 100;
    if (forecastDuration >= 3 && summary.year3 && year2.revenue > 0) {
      const y2y3Growth = ((year3.revenue - year2.revenue) / year2.revenue) * 100;
      if (y1y2Growth > 0 && y2y3Growth > 0) {
        insights.push({
          type: 'info',
          message: `Strong growth trajectory: ${formatPercent(y1y2Growth)} Y1→Y2, ${formatPercent(y2y3Growth)} Y2→Y3. Net profit improves from ${formatPercent(year1.netProfitPct)} to ${formatPercent(year3.netProfitPct)}.`,
        });
      }
    } else if (y1y2Growth > 0) {
      insights.push({
        type: 'info',
        message: `Planned growth of ${formatPercent(y1y2Growth)} from Y1→Y2. Net profit moves from ${formatPercent(year1.netProfitPct)} to ${formatPercent(year2.netProfitPct)}.`,
      });
    }
  }

  // Calculate totals based on duration
  const totalRevenue = year1.revenue + (forecastDuration >= 2 ? year2.revenue : 0) + (forecastDuration >= 3 ? year3.revenue : 0);
  const totalCogs = year1.cogs + (forecastDuration >= 2 ? year2.cogs : 0) + (forecastDuration >= 3 ? year3.cogs : 0);
  const totalGrossProfit = year1.grossProfit + (forecastDuration >= 2 ? year2.grossProfit : 0) + (forecastDuration >= 3 ? year3.grossProfit : 0);
  const totalTeamCosts = year1.teamCosts + (forecastDuration >= 2 ? year2.teamCosts : 0) + (forecastDuration >= 3 ? year3.teamCosts : 0);
  const totalOpex = year1.opex + (forecastDuration >= 2 ? year2.opex : 0) + (forecastDuration >= 3 ? year3.opex : 0);
  const totalDepreciation = year1.depreciation + (forecastDuration >= 2 ? year2.depreciation : 0) + (forecastDuration >= 3 ? year3.depreciation : 0);
  const totalOtherExpenses = year1.otherExpenses + (forecastDuration >= 2 ? year2.otherExpenses : 0) + (forecastDuration >= 3 ? year3.otherExpenses : 0);
  const totalNetProfit = year1.netProfit + (forecastDuration >= 2 ? year2.netProfit : 0) + (forecastDuration >= 3 ? year3.netProfit : 0);

  const durationLabel = forecastDuration === 1 ? '1-Year' : forecastDuration === 2 ? '2-Year' : '3-Year';

  return (
    <div className="space-y-6">
      {/* Summary Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-900">{durationLabel} Forecast Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-48">
                  Category
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  FY{fiscalYear}
                </th>
                {forecastDuration >= 2 && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    FY{fiscalYear + 1}
                  </th>
                )}
                {forecastDuration >= 3 && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    FY{fiscalYear + 2}
                  </th>
                )}
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{durationLabel} Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* Revenue */}
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">Revenue</td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right">
                  {formatCurrency(year1.revenue)}
                </td>
                {forecastDuration >= 2 && (
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">
                    {formatCurrency(year2.revenue)}
                  </td>
                )}
                {forecastDuration >= 3 && (
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">
                    {formatCurrency(year3.revenue)}
                  </td>
                )}
                <td className="px-4 py-3 text-sm text-gray-900 text-right font-semibold">
                  {formatCurrency(totalRevenue)}
                </td>
              </tr>

              {/* COGS */}
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-600">COGS</td>
                <td className="px-4 py-3 text-sm text-gray-600 text-right">
                  ({formatCurrency(year1.cogs)})
                </td>
                {forecastDuration >= 2 && (
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">
                    ({formatCurrency(year2.cogs)})
                  </td>
                )}
                {forecastDuration >= 3 && (
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">
                    ({formatCurrency(year3.cogs)})
                  </td>
                )}
                <td className="px-4 py-3 text-sm text-gray-600 text-right">
                  ({formatCurrency(totalCogs)})
                </td>
              </tr>

              {/* Gross Profit */}
              <tr className="bg-green-50 hover:bg-green-100">
                <td className="px-4 py-3 text-sm font-semibold text-green-800">Gross Profit</td>
                <td className="px-4 py-3 text-sm text-green-800 text-right">
                  {formatCurrency(year1.grossProfit)}
                  <span className="text-xs text-green-600 ml-1">
                    ({formatPercent(year1.grossProfitPct)})
                  </span>
                </td>
                {forecastDuration >= 2 && (
                  <td className="px-4 py-3 text-sm text-green-800 text-right">
                    {formatCurrency(year2.grossProfit)}
                    <span className="text-xs text-green-600 ml-1">
                      ({formatPercent(year2.grossProfitPct)})
                    </span>
                  </td>
                )}
                {forecastDuration >= 3 && (
                  <td className="px-4 py-3 text-sm text-green-800 text-right">
                    {formatCurrency(year3.grossProfit)}
                    <span className="text-xs text-green-600 ml-1">
                      ({formatPercent(year3.grossProfitPct)})
                    </span>
                  </td>
                )}
                <td className="px-4 py-3 text-sm font-semibold text-green-800 text-right">
                  {formatCurrency(totalGrossProfit)}
                </td>
              </tr>

              {/* Team Costs */}
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-600">Team Costs</td>
                <td className="px-4 py-3 text-sm text-gray-600 text-right">
                  ({formatCurrency(year1.teamCosts)})
                </td>
                {forecastDuration >= 2 && (
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">
                    ({formatCurrency(year2.teamCosts)})
                  </td>
                )}
                {forecastDuration >= 3 && (
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">
                    ({formatCurrency(year3.teamCosts)})
                  </td>
                )}
                <td className="px-4 py-3 text-sm text-gray-600 text-right">
                  ({formatCurrency(totalTeamCosts)})
                </td>
              </tr>

              {/* Operating Expenses */}
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-600">Operating Expenses</td>
                <td className="px-4 py-3 text-sm text-gray-600 text-right">
                  ({formatCurrency(year1.opex)})
                </td>
                {forecastDuration >= 2 && (
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">
                    ({formatCurrency(year2.opex)})
                  </td>
                )}
                {forecastDuration >= 3 && (
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">
                    ({formatCurrency(year3.opex)})
                  </td>
                )}
                <td className="px-4 py-3 text-sm text-gray-600 text-right">
                  ({formatCurrency(totalOpex)})
                </td>
              </tr>

              {/* Depreciation */}
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-600">Depreciation</td>
                <td className="px-4 py-3 text-sm text-gray-600 text-right">
                  ({formatCurrency(year1.depreciation)})
                </td>
                {forecastDuration >= 2 && (
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">
                    ({formatCurrency(year2.depreciation)})
                  </td>
                )}
                {forecastDuration >= 3 && (
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">
                    ({formatCurrency(year3.depreciation)})
                  </td>
                )}
                <td className="px-4 py-3 text-sm text-gray-600 text-right">
                  ({formatCurrency(totalDepreciation)})
                </td>
              </tr>

              {/* Other Expenses */}
              <tr className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-600">Other Expenses</td>
                <td className="px-4 py-3 text-sm text-gray-600 text-right">
                  ({formatCurrency(year1.otherExpenses)})
                </td>
                {forecastDuration >= 2 && (
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">
                    ({formatCurrency(year2.otherExpenses)})
                  </td>
                )}
                {forecastDuration >= 3 && (
                  <td className="px-4 py-3 text-sm text-gray-600 text-right">
                    ({formatCurrency(year3.otherExpenses)})
                  </td>
                )}
                <td className="px-4 py-3 text-sm text-gray-600 text-right">
                  ({formatCurrency(totalOtherExpenses)})
                </td>
              </tr>

              {/* Net Profit */}
              <tr className="bg-brand-navy text-white">
                <td className="px-4 py-4 text-sm font-bold">Net Profit</td>
                <td className="px-4 py-4 text-sm text-right font-bold">
                  {formatCurrency(year1.netProfit)}
                  <span className="text-xs text-white/70 ml-1">
                    ({formatPercent(year1.netProfitPct)})
                  </span>
                </td>
                {forecastDuration >= 2 && (
                  <td className="px-4 py-4 text-sm text-right font-bold">
                    {formatCurrency(year2.netProfit)}
                    <span className="text-xs text-white/70 ml-1">
                      ({formatPercent(year2.netProfitPct)})
                    </span>
                  </td>
                )}
                {forecastDuration >= 3 && (
                  <td className="px-4 py-4 text-sm text-right font-bold">
                    {formatCurrency(year3.netProfit)}
                    <span className="text-xs text-white/70 ml-1">
                      ({formatPercent(year3.netProfitPct)})
                    </span>
                  </td>
                )}
                <td className="px-4 py-4 text-sm text-right font-bold">
                  {formatCurrency(totalNetProfit)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Goals Variance */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Goals Variance - Year 1</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Revenue</p>
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-gray-900">
                  {formatCurrency(year1.revenue)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    statusColors[getVarianceStatus(year1.revenue, goals.year1.revenue)]
                  }`}
                >
                  {statusIcons[getVarianceStatus(year1.revenue, goals.year1.revenue)]}
                  {getVarianceStatus(year1.revenue, goals.year1.revenue) === 'on-track'
                    ? 'On Track'
                    : getVariance(year1.revenue, goals.year1.revenue) >= 0
                    ? 'Above'
                    : 'Below'}
                </span>
              </div>
              <p className="text-xs text-gray-500">Target: {formatCurrency(goals.year1.revenue)}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-gray-500">Gross Profit %</p>
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-gray-900">
                  {formatPercent(year1.grossProfitPct)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    statusColors[getVarianceStatus(year1.grossProfitPct, goals.year1.grossProfitPct)]
                  }`}
                >
                  {statusIcons[getVarianceStatus(year1.grossProfitPct, goals.year1.grossProfitPct)]}
                  {getVarianceStatus(year1.grossProfitPct, goals.year1.grossProfitPct) === 'on-track'
                    ? 'On Track'
                    : getVariance(year1.grossProfitPct, goals.year1.grossProfitPct) >= 0
                    ? 'Above'
                    : 'Below'}
                </span>
              </div>
              <p className="text-xs text-gray-500">Target: {formatPercent(goals.year1.grossProfitPct)}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-gray-500">Net Profit %</p>
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-gray-900">
                  {formatPercent(year1.netProfitPct)}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    statusColors[getVarianceStatus(year1.netProfitPct, goals.year1.netProfitPct)]
                  }`}
                >
                  {statusIcons[getVarianceStatus(year1.netProfitPct, goals.year1.netProfitPct)]}
                  {getVarianceStatus(year1.netProfitPct, goals.year1.netProfitPct) === 'on-track'
                    ? 'On Track'
                    : getVariance(year1.netProfitPct, goals.year1.netProfitPct) >= 0
                    ? 'Above'
                    : 'Below'}
                </span>
              </div>
              <p className="text-xs text-gray-500">Target: {formatPercent(goals.year1.netProfitPct)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* AI Insights */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          <h3 className="text-lg font-semibold text-gray-900">AI Analysis & Suggestions</h3>
        </div>
        <div className="p-6 space-y-4">
          {insights.map((insight, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 p-4 rounded-lg ${
                insight.type === 'warning'
                  ? 'bg-amber-50 border border-amber-200'
                  : insight.type === 'success'
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-blue-50 border border-blue-200'
              }`}
            >
              {insight.type === 'warning' ? (
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              ) : insight.type === 'success' ? (
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <Lightbulb className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              )}
              <p
                className={`text-sm ${
                  insight.type === 'warning'
                    ? 'text-amber-800'
                    : insight.type === 'success'
                    ? 'text-green-800'
                    : 'text-blue-800'
                }`}
              >
                {insight.message}
              </p>
            </div>
          ))}

          {insights.length === 0 && (
            <div className="text-center py-4 text-gray-500">
              <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p>Your forecast looks well-balanced! Click "Generate Forecast" to finalize.</p>
            </div>
          )}
        </div>
      </div>

      {/* Ready to Generate */}
      <div className="bg-gradient-to-r from-brand-navy to-brand-navy-800 rounded-xl p-6 text-white text-center">
        <h3 className="text-xl font-bold mb-2">Ready to Generate Your Forecast?</h3>
        <p className="text-white/80 mb-4">
          Review the summary above. Once you're happy, click the "Generate Forecast" button to create your
          complete FY{fiscalYear}{forecastDuration >= 2 ? `-FY${fiscalYear + forecastDuration - 1}` : ''} financial forecast.
        </p>
        <p className="text-sm text-white/60">
          You can always come back and adjust your forecast later.
        </p>
      </div>
    </div>
  );
}
