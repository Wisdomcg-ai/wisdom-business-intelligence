/**
 * DataPanel - Left panel of the 3-panel wizard layout
 *
 * Displays:
 * - Xero connection status and sync indicator
 * - Historical P&L data (prior year + current YTD)
 * - Team summary
 * - Strategic initiatives
 */

'use client';

import { useState } from 'react';
import {
  Database,
  Users,
  Target,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Building2,
  DollarSign,
} from 'lucide-react';
import { XeroSyncIndicator } from '@/components/XeroSyncIndicator';
import {
  WizardContext,
  HistoricalPLSummary,
  StrategicInitiative,
  XeroEmployee,
} from '@/app/finances/forecast/types';

interface DataPanelProps {
  context: WizardContext | null;
  isLoading?: boolean;
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string | number;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  icon,
  defaultOpen = true,
  badge,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-500">{icon}</span>
          <span className="font-medium text-gray-900">{title}</span>
          {badge !== undefined && (
            <span className="ml-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
              {badge}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString()}`;
}

function TrendIndicator({ value }: { value: number }) {
  if (Math.abs(value) < 0.5) {
    return (
      <span className="flex items-center text-gray-500 text-xs">
        <Minus className="w-3 h-3 mr-0.5" />
        Flat
      </span>
    );
  }
  if (value > 0) {
    return (
      <span className="flex items-center text-green-600 text-xs">
        <TrendingUp className="w-3 h-3 mr-0.5" />
        +{value.toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="flex items-center text-red-600 text-xs">
      <TrendingDown className="w-3 h-3 mr-0.5" />
      {value.toFixed(1)}%
    </span>
  );
}

function FinancialSummary({ pl }: { pl: HistoricalPLSummary }) {
  return (
    <div className="space-y-4">
      {/* Prior Year */}
      {pl.prior_fy && (
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-xs font-medium text-gray-500 mb-2">
            {pl.prior_fy.period_label}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-gray-500 text-xs">Revenue</div>
              <div className="font-medium">{formatCurrency(pl.prior_fy.total_revenue)}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs">Net Profit</div>
              <div className="font-medium">{formatCurrency(pl.prior_fy.net_profit)}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs">Gross Margin</div>
              <div className="font-medium">{pl.prior_fy.gross_margin_percent.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs">Net Margin</div>
              <div className="font-medium">{pl.prior_fy.net_margin_percent.toFixed(1)}%</div>
            </div>
          </div>

          {/* Top OpEx Categories */}
          {pl.prior_fy.operating_expenses_by_category?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="text-xs font-medium text-gray-500 mb-2">Top Expenses</div>
              <div className="space-y-1">
                {pl.prior_fy.operating_expenses_by_category.slice(0, 4).map((cat, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-gray-600 truncate max-w-[60%]">{cat.account_name}</span>
                    <span className="text-gray-900 font-medium">{formatCurrency(cat.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Current YTD */}
      {pl.current_ytd && pl.current_ytd.months_count > 0 && (
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-blue-700">
              {pl.current_ytd.period_label}
            </div>
            <div className="text-xs text-blue-600">
              {pl.current_ytd.months_count} months
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-blue-600 text-xs">YTD Revenue</div>
              <div className="font-medium text-blue-900">
                {formatCurrency(pl.current_ytd.total_revenue)}
              </div>
            </div>
            <div>
              <div className="text-blue-600 text-xs">Run Rate</div>
              <div className="font-medium text-blue-900">
                {formatCurrency(pl.current_ytd.run_rate_revenue)}
              </div>
            </div>
          </div>

          {/* Variance indicators */}
          {pl.prior_fy && (
            <div className="mt-2 pt-2 border-t border-blue-200 flex gap-4">
              <div className="flex items-center gap-1">
                <span className="text-xs text-blue-600">Rev:</span>
                <TrendIndicator value={pl.current_ytd.revenue_vs_prior_percent} />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-blue-600">OpEx:</span>
                <TrendIndicator value={pl.current_ytd.opex_vs_prior_percent} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TeamSummary({ team }: { team: XeroEmployee[] }) {
  const totalWages = team.reduce((sum, e) => sum + (e.annual_salary || 0), 0);
  const cogsTeam = team.filter(e => e.classification === 'cogs');
  const opexTeam = team.filter(e => e.classification === 'opex');
  const unclassified = team.filter(e => !e.classification);

  return (
    <div className="space-y-3">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-gray-900">{team.length}</div>
          <div className="text-xs text-gray-500">Total</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-orange-700">{cogsTeam.length}</div>
          <div className="text-xs text-orange-600">COGS</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-purple-700">{opexTeam.length}</div>
          <div className="text-xs text-purple-600">OpEx</div>
        </div>
      </div>

      {/* Total wages */}
      <div className="flex justify-between items-center py-2 border-y border-gray-100">
        <span className="text-sm text-gray-600">Annual Wages</span>
        <span className="font-medium">{formatCurrency(totalWages)}</span>
      </div>

      {/* Team list */}
      <div className="max-h-[200px] overflow-y-auto space-y-1">
        {team.slice(0, 10).map((emp, i) => (
          <div
            key={emp.employee_id || i}
            className="flex items-center justify-between text-sm py-1"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  emp.classification === 'cogs'
                    ? 'bg-orange-500'
                    : emp.classification === 'opex'
                    ? 'bg-purple-500'
                    : 'bg-gray-300'
                }`}
              />
              <span className="truncate text-gray-700">{emp.full_name}</span>
            </div>
            <span className="text-gray-500 text-xs ml-2 flex-shrink-0">
              {emp.annual_salary ? formatCurrency(emp.annual_salary) : '-'}
            </span>
          </div>
        ))}
        {team.length > 10 && (
          <div className="text-xs text-gray-400 text-center pt-1">
            +{team.length - 10} more
          </div>
        )}
      </div>

      {unclassified.length > 0 && (
        <div className="text-xs text-amber-600 bg-amber-50 rounded p-2">
          {unclassified.length} team member(s) need classification
        </div>
      )}
    </div>
  );
}

function InitiativesList({ initiatives }: { initiatives: StrategicInitiative[] }) {
  const byQuarter = initiatives.reduce((acc, init) => {
    const q = init.quarter_assigned || 'Unassigned';
    if (!acc[q]) acc[q] = [];
    acc[q].push(init);
    return acc;
  }, {} as Record<string, StrategicInitiative[]>);

  const quarters = ['Q1', 'Q2', 'Q3', 'Q4', 'Unassigned'];

  return (
    <div className="space-y-3 max-h-[250px] overflow-y-auto">
      {quarters.map(q => {
        const items = byQuarter[q] || [];
        if (items.length === 0) return null;

        return (
          <div key={q}>
            <div className="text-xs font-medium text-gray-500 mb-1">{q}</div>
            <div className="space-y-1">
              {items.map(init => (
                <div
                  key={init.id}
                  className="flex items-start gap-2 p-2 bg-gray-50 rounded text-sm"
                >
                  <div
                    className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      init.status === 'completed'
                        ? 'bg-green-500'
                        : init.status === 'in_progress'
                        ? 'bg-blue-500'
                        : 'bg-gray-300'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-gray-900 truncate">{init.title}</div>
                    {init.category && (
                      <div className="text-xs text-gray-500 capitalize">
                        {init.category.replace('_', ' ')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {initiatives.length === 0 && (
        <div className="text-sm text-gray-400 text-center py-4">
          No initiatives in annual plan
        </div>
      )}
    </div>
  );
}

export function DataPanel({ context, isLoading }: DataPanelProps) {
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading data...</div>
      </div>
    );
  }

  if (!context) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-400 text-sm">No data available</div>
      </div>
    );
  }

  const hasXeroData = context.xero_connected && context.historical_pl?.has_xero_data;
  const team = context.current_team || [];
  const initiatives = context.strategic_initiatives || [];

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400" />
            <span className="font-medium text-gray-900">
              {context.business_name || 'Your Business'}
            </span>
          </div>
          <span className="text-xs text-gray-500">FY{context.fiscal_year}</span>
        </div>

        {/* Xero sync indicator */}
        <div className="mt-2">
          <XeroSyncIndicator businessId={context.business_id} compact />
        </div>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Targets */}
        {context.goals?.revenue_target && (
          <CollapsibleSection
            title="Targets"
            icon={<Target className="w-4 h-4" />}
            defaultOpen={true}
          >
            <div className="space-y-2">
              {/* Year Type indicator */}
              {context.goals.year_type && (
                <div className="flex justify-between items-center pb-2 mb-2 border-b border-gray-100">
                  <span className="text-xs text-gray-500">Year Type</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                    context.goals.year_type === 'CY'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}>
                    {context.goals.year_type === 'CY' ? 'Calendar Year (Jan-Dec)' : 'Financial Year (Jul-Jun)'}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Year 1 Revenue</span>
                <span className="font-medium text-green-700">
                  {formatCurrency(context.goals.revenue_target)}
                </span>
              </div>
              {context.goals.profit_target && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Year 1 Profit</span>
                  <span className="font-medium">
                    {formatCurrency(context.goals.profit_target)}
                  </span>
                </div>
              )}
              {context.goals.gross_margin_percent && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Target Margin</span>
                  <span className="font-medium">{context.goals.gross_margin_percent}%</span>
                </div>
              )}

              {/* Multi-year goals if set */}
              {context.goals.revenue_year2 && (
                <div className="pt-2 mt-2 border-t border-gray-100 space-y-2">
                  <div className="text-xs font-medium text-gray-500">Multi-Year Goals</div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Year 2 Revenue</span>
                    <span className="font-medium text-blue-600">
                      {formatCurrency(context.goals.revenue_year2)}
                    </span>
                  </div>
                  {context.goals.revenue_year3 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Year 3 Revenue</span>
                      <span className="font-medium text-blue-600">
                        {formatCurrency(context.goals.revenue_year3)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* Financial Data */}
        {hasXeroData && context.historical_pl && (
          <CollapsibleSection
            title="Historical Data"
            icon={<Database className="w-4 h-4" />}
            defaultOpen={true}
          >
            <FinancialSummary pl={context.historical_pl} />
          </CollapsibleSection>
        )}

        {/* Team */}
        <CollapsibleSection
          title="Team"
          icon={<Users className="w-4 h-4" />}
          badge={team.length > 0 ? team.length : undefined}
          defaultOpen={team.length > 0}
        >
          {team.length > 0 ? (
            <TeamSummary team={team} />
          ) : (
            <div className="text-sm text-gray-400 text-center py-4">
              No team data available
            </div>
          )}
        </CollapsibleSection>

        {/* Strategic Initiatives */}
        <CollapsibleSection
          title="Initiatives"
          icon={<Target className="w-4 h-4" />}
          badge={initiatives.length > 0 ? initiatives.length : undefined}
          defaultOpen={initiatives.length > 0}
        >
          <InitiativesList initiatives={initiatives} />
        </CollapsibleSection>
      </div>
    </div>
  );
}
