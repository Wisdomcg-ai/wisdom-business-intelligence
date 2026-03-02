'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useForecastCFO } from './hooks/useForecastCFO';
import { CFOConversation } from './CFOConversation';
import { BudgetTracker } from './BudgetTracker';

interface ForecastCFOProps {
  businessId: string;
  businessName?: string;
  fiscalYear: number;
  onComplete: (forecastId: string) => void;
  onClose: () => void;
}

export function ForecastCFO({
  businessId,
  businessName,
  fiscalYear,
  onComplete,
  onClose,
}: ForecastCFOProps) {
  const cfo = useForecastCFO(fiscalYear);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch goals, prior year P&L, and team data in parallel
      const [goalsRes, plRes, teamRes] = await Promise.all([
        fetch(`/api/goals?business_id=${businessId}`),
        fetch(`/api/Xero/pl-summary?business_id=${businessId}`),
        fetch(`/api/Xero/employees?business_id=${businessId}`),
      ]);

      const [goalsData, plData, teamData] = await Promise.all([
        goalsRes.ok ? goalsRes.json() : { goals: null },
        plRes.ok ? plRes.json() : { summary: null },
        teamRes.ok ? teamRes.json() : { success: false, employees: [] },
      ]);

      // Initialize state with loaded data
      cfo.actions.initializeFromData({
        goals: goalsData.goals ? {
          revenue_target: goalsData.goals.revenue_target,
          profit_target: goalsData.goals.profit_target,
          net_profit_percent: goalsData.goals.net_profit_percent,
        } : undefined,
        priorYear: plData.summary ? {
          revenue: plData.summary.revenue,
          cogs: plData.summary.cogs,
          opex: plData.summary.opex,
        } : undefined,
        team: (teamData.employees || []).map((emp: {
          employee_id?: string;
          full_name?: string;
          first_name?: string;
          last_name?: string;
          job_title?: string;
          annual_salary?: number;
          hourly_rate?: number;
          from_xero?: boolean;
        }) => {
          let salary = emp.annual_salary || 0;
          if (!salary && emp.hourly_rate) {
            salary = emp.hourly_rate * 38 * 52; // Assume 38 hours/week
          }
          if (!salary) salary = 80000; // Default salary if none found

          return {
            id: emp.employee_id || `emp-${Date.now()}-${Math.random()}`,
            name: emp.full_name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || 'Unknown',
            position: emp.job_title || 'Team Member',
            salary,
            type: 'opex' as const,
            isFromXero: emp.from_xero ?? true,
          };
        }),
      });

    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load business data. You can still enter data manually.');
    } finally {
      setIsLoading(false);
    }
  }, [businessId, cfo.actions]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleComplete = () => {
    // TODO: Save forecast to database and return ID
    onComplete('new-forecast-id');
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-navy mx-auto mb-4" />
          <p className="text-gray-600">Loading your data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              FY{fiscalYear} Forecast Builder
            </h1>
            <p className="text-sm text-gray-500">{businessName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="flex-shrink-0 px-6 py-3 bg-amber-50 border-b border-amber-100">
            <p className="text-sm text-amber-800">{error}</p>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex min-h-0">
          {/* Left Panel - Conversation (60%) */}
          <div className="w-3/5 min-w-0 border-r border-gray-200">
            <CFOConversation
              cfo={cfo}
              fiscalYear={fiscalYear}
              businessName={businessName}
              onComplete={handleComplete}
              onClose={onClose}
            />
          </div>

          {/* Right Panel - Budget Tracker (40%) */}
          <div className="w-2/5 min-w-0">
            <BudgetTracker cfo={cfo} />
          </div>
        </div>
      </div>
    </div>
  );
}
