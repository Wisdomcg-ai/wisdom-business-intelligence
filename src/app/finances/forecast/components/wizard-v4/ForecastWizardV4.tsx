'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { X, Loader2, ChevronLeft, ChevronRight, Check, RefreshCw, Cloud, CloudOff, CheckCircle2, AlertCircle, Copy, Pencil, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useForecastWizard } from './useForecastWizard';
import { StepBar } from './components/StepBar';
import { YearTabs } from './components/YearTabs';
import { AICFOPanel } from './components/AICFOPanel';
import { Step1Goals } from './steps/Step1Goals';
import { Step2PriorYear } from './steps/Step2PriorYear';
import { Step3RevenueCOGS } from './steps/Step3RevenueCOGS';
import { Step4Team } from './steps/Step4Team';
import { Step5OpEx } from './steps/Step5OpEx';
import { Step6Subscriptions } from './steps/Step6Subscriptions';
import { Step6CapEx } from './steps/Step6CapEx'; // Now Step 7
import { Step8Review } from './steps/Step8Review';
import { WIZARD_STEPS, PriorYearData, TeamMember, Goals } from './types';

// Debounce helper
function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    }) as T,
    [delay]
  );
}

interface ForecastWizardV4Props {
  businessId: string;
  businessName?: string;
  fiscalYear: number;
  existingForecastId?: string | null;
  existingForecastName?: string | null;
  onComplete: (forecastId: string) => void;
  onClose: () => void;
}

export function ForecastWizardV4({
  businessId,
  businessName,
  fiscalYear,
  existingForecastId,
  existingForecastName,
  onComplete,
  onClose,
}: ForecastWizardV4Props) {
  const { state, actions, summary, wasRestoredFromStorage, clearLocalStorage } = useForecastWizard(fiscalYear - 1, businessId);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const hasLoadedRef = useRef(false);
  const [forecastId, setForecastId] = useState<string | null>(existingForecastId || null);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const isInitialLoadRef = useRef(true);
  const stateVersionRef = useRef(0);

  // Forecast naming - use existing name if editing, otherwise default
  const [forecastName, setForecastName] = useState(
    existingForecastName || `FY${fiscalYear} Forecast`
  );
  const [isEditingName, setIsEditingName] = useState(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Load initial data from APIs - only once on mount
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const loadData = async () => {
      // Check if state was restored from localStorage with meaningful data
      // If so, skip API fetching and initialization
      const hasRestoredData = (
        state.opexLines?.length > 0 ||
        state.revenueLines?.length > 0 ||
        state.teamMembers?.length > 0 ||
        state.priorYear !== null
      );

      if (hasRestoredData) {
        console.log('[ForecastWizardV4] State restored from localStorage, skipping API initialization');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Build fetch requests - include existing forecast if we're editing one
        const fetchPromises: Promise<Response>[] = [
          fetch(`/api/goals?business_id=${businessId}`),
          fetch(`/api/Xero/pl-summary?business_id=${businessId}&fiscal_year=${fiscalYear}`),
          fetch(`/api/Xero/employees?business_id=${businessId}`),
          fetch(`/api/business-profile?business_id=${businessId}`),
        ];

        // If editing an existing forecast, also fetch its saved assumptions
        if (existingForecastId) {
          fetchPromises.push(fetch(`/api/forecast/${existingForecastId}`));
        }

        const responses = await Promise.all(fetchPromises);
        const [goalsRes, plRes, teamRes, profileRes, forecastRes] = responses;

        const dataPromises: Promise<any>[] = [
          goalsRes.ok ? goalsRes.json() : Promise.resolve({ goals: null }),
          plRes.ok ? plRes.json() : Promise.resolve({ summary: null }),
          teamRes.ok ? teamRes.json() : Promise.resolve({ success: false, employees: [] }),
          profileRes.ok ? profileRes.json() : Promise.resolve({ profile: null }),
        ];

        // Add existing forecast data if we're editing
        if (existingForecastId && forecastRes?.ok) {
          dataPromises.push(forecastRes.json());
        } else {
          dataPromises.push(Promise.resolve({ forecast: null }));
        }

        const [goalsData, plData, teamData, profileData, existingForecastData] = await Promise.all(dataPromises);

        // Extract saved assumptions from existing forecast
        const savedAssumptions = existingForecastData?.forecast?.assumptions || existingForecastData?.assumptions || null;
        console.log('[ForecastWizardV4] Loaded existing forecast:', {
          hasExistingForecast: !!existingForecastId,
          hasSavedAssumptions: !!savedAssumptions,
          savedTeam: savedAssumptions?.team,
        });

        // Set business profile
        if (profileData.profile) {
          actionsRef.current.setBusinessProfile({
            industry: profileData.profile.industry,
            employeeCount: profileData.profile.employee_count,
            annualRevenue: profileData.profile.annual_revenue,
            businessModel: profileData.profile.business_model,
            profileCompleted: profileData.profile.profile_completed,
          });
        }

        // Transform data for the wizard
        // The pl-summary API returns { summary: { has_xero_data, prior_fy: {...}, current_ytd: {...} } }
        let priorFY = plData.summary?.prior_fy;
        let hasXeroData = plData.summary?.has_xero_data && priorFY;
        let currentPlData = plData;

        console.log('[ForecastWizardV4] P&L data received:', {
          hasXeroData,
          rawSummary: plData.summary,
          priorFY: priorFY ? {
            revenue: priorFY.total_revenue,
            cogs: priorFY.total_cogs,
            opex: priorFY.operating_expenses,
            seasonality: priorFY.seasonality_pattern,
            seasonalityLength: priorFY.seasonality_pattern?.length,
          } : null,
        });

        // Auto-sync Xero if no cached P&L data but connection exists
        // This ensures fresh data is available after cache clear
        if (!hasXeroData && !priorFY?.revenue_lines?.length) {
          console.log('[ForecastWizardV4] No cached P&L data, attempting auto-sync...');
          try {
            // First, get or create a forecast to sync to
            const forecastRes = await fetch(`/api/forecast?business_id=${businessId}&fiscal_year=${fiscalYear}`);
            const forecastData = await forecastRes.json();
            let targetForecastId = forecastData.forecast?.id;

            if (!targetForecastId) {
              // Create a draft forecast to sync to
              console.log('[ForecastWizardV4] Creating draft forecast for sync...');
              const createRes = await fetch('/api/forecast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  business_id: businessId,
                  fiscal_year: fiscalYear,
                  name: `FY${fiscalYear} Forecast`,
                }),
              });
              if (createRes.ok) {
                const createData = await createRes.json();
                targetForecastId = createData.forecast?.id;
              }
            }

            if (targetForecastId) {
              // Now sync the full P&L data to forecast_pl_lines
              console.log('[ForecastWizardV4] Syncing P&L data to forecast:', targetForecastId);
              const syncRes = await fetch('/api/Xero/sync-forecast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  business_id: businessId,
                  forecast_id: targetForecastId,
                }),
              });

              if (syncRes.ok) {
                console.log('[ForecastWizardV4] Auto-sync completed, re-fetching P&L data...');
                // Re-fetch P&L data after sync
                const refreshedPlRes = await fetch(`/api/Xero/pl-summary?business_id=${businessId}&fiscal_year=${fiscalYear}`);
                if (refreshedPlRes.ok) {
                  currentPlData = await refreshedPlRes.json();
                  priorFY = currentPlData.summary?.prior_fy;
                  hasXeroData = currentPlData.summary?.has_xero_data && priorFY;
                  console.log('[ForecastWizardV4] P&L data after auto-sync:', {
                    hasXeroData,
                    revenueLines: priorFY?.revenue_lines?.length || 0,
                  });
                }
              } else {
                const syncError = await syncRes.json();
                console.log('[ForecastWizardV4] Sync failed:', syncError);
              }
            }
          } catch (syncErr) {
            console.log('[ForecastWizardV4] Auto-sync failed (may not have Xero connected):', syncErr);
          }
        }

        // Determine if we have data to initialize with
        // Priority: Fresh Xero data > Saved assumptions > Goals only
        const hasFreshData = hasXeroData || teamData.employees?.length > 0 || goalsData.goals;
        const canInitialize = hasFreshData || savedAssumptions;

        if (canInitialize) {
          // Get current YTD data for Year 1 actuals (use currentPlData which may be refreshed)
          const currentYTDData = currentPlData.summary?.current_ytd;

          // Check if we actually have Xero P&L line data (not just goals/employees)
          const ytdRevenueLines = currentYTDData?.revenue_lines || [];
          const priorRevenueLines = priorFY?.revenue_lines || [];
          const hasXeroPLLines = ytdRevenueLines.length > 0 || priorRevenueLines.length > 0;

          // Build revenue lines - prefer fresh Xero data, fall back to saved assumptions
          let revenueByLine: { id: string; name: string; total: number; byMonth: Record<string, number> }[] = [];
          let cogsByLine: { id: string; name: string; total: number; byMonth: Record<string, number>; percentOfRevenue: number }[] = [];

          if (hasXeroPLLines) {
            // Use fresh Xero data - we have actual P&L lines
            const sourceRevenueLines = ytdRevenueLines.length > 0 ? ytdRevenueLines : priorRevenueLines;

            revenueByLine = sourceRevenueLines.map((line: {
              account_name: string;
              category: string;
              total: number;
              by_month: Record<string, number>;
            }, idx: number) => {
              const roundedByMonth: Record<string, number> = {};
              Object.entries(line.by_month || {}).forEach(([key, val]) => {
                roundedByMonth[key] = Math.round(val);
              });
              return {
                id: `revenue-${idx}`,
                name: line.account_name,
                total: Math.round(line.total),
                byMonth: roundedByMonth,
              };
            });

            const ytdCogsLines = currentYTDData?.cogs_lines || [];
            const priorCogsLines = priorFY?.cogs_lines || [];
            const sourceCogsLines = ytdCogsLines.length > 0 ? ytdCogsLines : priorCogsLines;

            cogsByLine = sourceCogsLines.map((line: {
              account_name: string;
              category: string;
              total: number;
              by_month: Record<string, number>;
              percent_of_revenue: number;
            }, idx: number) => {
              const roundedByMonth: Record<string, number> = {};
              Object.entries(line.by_month || {}).forEach(([key, val]) => {
                roundedByMonth[key] = Math.round(val);
              });
              return {
                id: `cogs-${idx}`,
                name: line.account_name,
                total: Math.round(line.total),
                byMonth: roundedByMonth,
                percentOfRevenue: Math.round(line.percent_of_revenue * 10) / 10,
              };
            });
          } else if (savedAssumptions) {
            // Fall back to saved assumptions when Xero data unavailable
            console.log('[ForecastWizardV4] No fresh Xero data, reconstructing from saved assumptions');

            revenueByLine = (savedAssumptions.revenue?.lines || []).map((line: {
              accountId: string;
              accountName: string;
              priorYearTotal: number;
            }, idx: number) => ({
              id: line.accountId || `revenue-${idx}`,
              name: line.accountName,
              total: Math.round(line.priorYearTotal || 0),
              byMonth: {},
            }));

            cogsByLine = (savedAssumptions.cogs?.lines || []).map((line: {
              accountId: string;
              accountName: string;
              priorYearTotal: number;
              percentOfRevenue?: number;
            }, idx: number) => ({
              id: line.accountId || `cogs-${idx}`,
              name: line.accountName,
              total: Math.round(line.priorYearTotal || 0),
              byMonth: {},
              percentOfRevenue: line.percentOfRevenue || 0,
            }));
          }

          console.log('[ForecastWizardV4] Revenue lines:', revenueByLine.length, 'COGS lines:', cogsByLine.length);

          // Round prior FY revenue by month
          const rawPriorRevenueByMonth = priorFY?.revenue_by_month || {};
          const roundedPriorRevenueByMonth: Record<string, number> = {};
          Object.entries(rawPriorRevenueByMonth).forEach(([key, val]) => {
            roundedPriorRevenueByMonth[key] = Math.round(val as number);
          });

          // Calculate totals - prefer Xero data, fall back to saved assumptions
          const totalRevenue = priorFY?.total_revenue ||
            (savedAssumptions?.revenue?.lines || []).reduce((sum: number, l: { priorYearTotal?: number }) => sum + (l.priorYearTotal || 0), 0);
          const totalCogs = priorFY?.total_cogs ||
            (savedAssumptions?.cogs?.lines || []).reduce((sum: number, l: { priorYearTotal?: number }) => sum + (l.priorYearTotal || 0), 0);
          const totalOpex = priorFY?.operating_expenses ||
            (savedAssumptions?.opex?.lines || []).reduce((sum: number, l: { priorYearTotal?: number }) => sum + (l.priorYearTotal || 0), 0);

          // Build opex lines - prefer fresh data, fall back to saved
          let opexByLine: { id: string; name: string; total: number; monthlyAvg: number; isOneOff: boolean }[] = [];
          console.log('[ForecastWizardV4] OpEx data from pl-summary:', {
            hasOpexCategories: !!priorFY?.operating_expenses_by_category,
            opexCategoriesLength: priorFY?.operating_expenses_by_category?.length || 0,
            totalOpex: priorFY?.operating_expenses,
            firstFewCategories: priorFY?.operating_expenses_by_category?.slice(0, 3),
          });
          if (priorFY?.operating_expenses_by_category?.length > 0) {
            opexByLine = priorFY.operating_expenses_by_category.map((cat: { category: string; account_name: string; total: number; monthly_average: number }, idx: number) => ({
              id: `opex-${idx}`,
              name: cat.account_name || cat.category,
              total: Math.round(cat.total),
              monthlyAvg: Math.round(cat.monthly_average || (cat.total / 12)),
              isOneOff: false,
            }));
          } else if (savedAssumptions?.opex?.lines?.length > 0) {
            opexByLine = savedAssumptions.opex.lines.map((line: {
              accountId: string;
              accountName: string;
              priorYearTotal: number;
              monthlyAmount?: number;
            }, idx: number) => ({
              id: line.accountId || `opex-${idx}`,
              name: line.accountName,
              total: Math.round(line.priorYearTotal || 0),
              monthlyAvg: Math.round(line.monthlyAmount || (line.priorYearTotal || 0) / 12),
              isOneOff: false,
            }));
          }

          const priorYear: PriorYearData = {
            revenue: {
              total: Math.round(totalRevenue),
              byMonth: roundedPriorRevenueByMonth,
              byLine: revenueByLine,
            },
            cogs: {
              total: Math.round(totalCogs),
              percentOfRevenue: totalRevenue ? Math.round((totalCogs / totalRevenue) * 1000) / 10 : 0,
              byMonth: {},
              byLine: cogsByLine,
            },
            grossProfit: {
              total: Math.round((priorFY?.gross_profit || 0) || (totalRevenue - totalCogs)),
              percent: Math.round((priorFY?.gross_margin_percent || 0) * 10) / 10 ||
                (totalRevenue ? Math.round(((totalRevenue - totalCogs) / totalRevenue) * 1000) / 10 : 0),
              byMonth: {},
            },
            opex: {
              total: Math.round(totalOpex),
              byMonth: {},
              byLine: opexByLine,
            },
            seasonalityPattern: priorFY?.seasonality_pattern?.length === 12
              ? priorFY.seasonality_pattern
              : savedAssumptions?.revenue?.seasonalityPattern?.length === 12
                ? savedAssumptions.revenue.seasonalityPattern
                : Array(12).fill(8.33),
          };

          console.log('[ForecastWizardV4] Constructed priorYear:', {
            revenueTotal: priorYear.revenue.total,
            grossProfitTotal: priorYear.grossProfit.total,
            opexTotal: priorYear.opex.total,
            opexLineCount: priorYear.opex.byLine.length,
            seasonalityPattern: priorYear.seasonalityPattern,
            source: hasFreshData ? 'xero' : 'saved_assumptions',
          });

          // Build team - prefer fresh Xero data, fall back to saved assumptions
          let team: TeamMember[] = [];
          if (teamData.employees?.length > 0) {
            team = teamData.employees.map(
              (emp: {
                employee_id?: string;
                full_name?: string;
                first_name?: string;
                last_name?: string;
                job_title?: string;
                annual_salary?: number;
                hourly_rate?: number;
                employment_type?: string;
                hours_per_week?: number;
                from_xero?: boolean;
              }) => {
                let salary = emp.annual_salary || 0;
                if (!salary && emp.hourly_rate) {
                  salary = emp.hourly_rate * (emp.hours_per_week || 38) * 52;
                }
                if (!salary) salary = 80000;

                return {
                  id: emp.employee_id || `emp-${Date.now()}-${Math.random()}`,
                  name:
                    emp.full_name ||
                    `${emp.first_name || ''} ${emp.last_name || ''}`.trim() ||
                    'Unknown',
                  role: emp.job_title || 'Team Member',
                  type: (emp.employment_type as 'full-time' | 'part-time' | 'casual' | 'contractor') || 'full-time',
                  hoursPerWeek: emp.hours_per_week || 38,
                  currentSalary: salary,
                  increasePct: 3,
                  newSalary: 0,
                  superAmount: 0,
                  isFromXero: emp.from_xero ?? true,
                };
              }
            );
          } else if (savedAssumptions?.team?.existingTeam?.length > 0) {
            // Fall back to saved existing team when Xero data unavailable
            console.log('[ForecastWizardV4] No Xero employees, reconstructing from saved assumptions');
            team = savedAssumptions.team.existingTeam.map((emp: {
              employeeId: string;
              name: string;
              role: string;
              employmentType: string;
              currentSalary: number;
              hoursPerWeek?: number;
              salaryIncreasePct?: number;
              isFromXero?: boolean;
            }) => ({
              id: emp.employeeId,
              name: emp.name,
              role: emp.role,
              type: (emp.employmentType as 'full-time' | 'part-time' | 'casual' | 'contractor') || 'full-time',
              hoursPerWeek: emp.hoursPerWeek || 38,
              currentSalary: emp.currentSalary,
              increasePct: emp.salaryIncreasePct || 3,
              newSalary: 0,
              superAmount: 0,
              isFromXero: emp.isFromXero ?? false,
            }));
          }

          const goals: Goals | undefined = goalsData.goals
            ? {
                year1: {
                  revenue: goalsData.goals.revenue_target || 0,
                  grossProfitPct: 50,
                  netProfitPct: goalsData.goals.net_profit_percent || 15,
                },
                year2: {
                  revenue: goalsData.goals.revenue_target_y2 || goalsData.goals.revenue_target * 1.2 || 0,
                  grossProfitPct: 52,
                  netProfitPct: (goalsData.goals.net_profit_percent || 15) + 2,
                },
                year3: {
                  revenue: goalsData.goals.revenue_target_y3 || goalsData.goals.revenue_target * 1.4 || 0,
                  grossProfitPct: 55,
                  netProfitPct: (goalsData.goals.net_profit_percent || 15) + 5,
                },
              }
            : undefined;

          // Pass current YTD data for proper actuals vs projections split
          // Round all YTD values to whole numbers (use currentPlData which may be refreshed)
          const rawYtdRevenueByMonth = currentPlData.summary?.current_ytd?.revenue_by_month || {};
          const roundedYtdRevenueByMonth: Record<string, number> = {};
          Object.entries(rawYtdRevenueByMonth).forEach(([key, val]) => {
            roundedYtdRevenueByMonth[key] = Math.round(val as number);
          });

          const currentYTD = currentPlData.summary?.current_ytd ? {
            revenue_by_month: roundedYtdRevenueByMonth,
            total_revenue: Math.round(currentPlData.summary.current_ytd.total_revenue || 0),
            months_count: currentPlData.summary.current_ytd.months_count || 0,
          } : undefined;

          console.log('[ForecastWizardV4] Initializing with:', {
            goalsYear1Revenue: goals?.year1?.revenue,
            ytdTotal: currentYTD?.total_revenue,
            ytdMonthsCount: currentYTD?.months_count,
            ytdMonthKeys: currentYTD?.revenue_by_month ? Object.keys(currentYTD.revenue_by_month) : [],
            priorYearRevenue: priorYear.revenue.total,
            priorYearMonthKeys: Object.keys(priorYear.revenue.byMonth),
          });

          actionsRef.current.initializeFromXero({ priorYear, team, goals, currentYTD });

          // If editing an existing forecast, restore saved user data (new hires, departures, etc.)
          if (savedAssumptions) {
            console.log('[ForecastWizardV4] Restoring saved assumptions:', savedAssumptions);

            // ALWAYS restore user's saved forecast values (year1Monthly, etc.) if they exist
            // Xero gives prior year data, but saved assumptions have user's customized forecast
            // Use setTimeout to ensure this runs AFTER initializeFromXero's setState completes
            setTimeout(() => {
              // Restore goals from saved assumptions (overrides business_goals defaults)
              if (savedAssumptions.goals) {
                console.log('[ForecastWizardV4] Restoring saved goals:', savedAssumptions.goals);
                actionsRef.current.updateGoals({
                  year1: savedAssumptions.goals.year1 || { revenue: 0, grossProfitPct: 50, netProfitPct: 15 },
                  year2: savedAssumptions.goals.year2 || { revenue: 0, grossProfitPct: 52, netProfitPct: 17 },
                  year3: savedAssumptions.goals.year3 || { revenue: 0, grossProfitPct: 55, netProfitPct: 20 },
                });
              }

              // Restore revenue lines with saved forecast values
              if (savedAssumptions.revenue?.lines?.length > 0) {
                const restoredRevenueLines = savedAssumptions.revenue.lines
                  .filter((line: { year1Monthly?: Record<string, number> }) => line.year1Monthly && Object.keys(line.year1Monthly).length > 0)
                  .map((line: {
                    accountId: string;
                    accountName: string;
                    year1Monthly?: Record<string, number>;
                    year2Quarterly?: { q1: number; q2: number; q3: number; q4: number };
                    year3Quarterly?: { q1: number; q2: number; q3: number; q4: number };
                  }) => ({
                    id: line.accountId,
                    name: line.accountName,
                    year1Monthly: line.year1Monthly || {},
                    year2Quarterly: line.year2Quarterly || { q1: 0, q2: 0, q3: 0, q4: 0 },
                    year3Quarterly: line.year3Quarterly || { q1: 0, q2: 0, q3: 0, q4: 0 },
                  }));

                if (restoredRevenueLines.length > 0) {
                  console.log('[ForecastWizardV4] Restoring saved revenue forecast:', restoredRevenueLines.length, 'lines');
                  actionsRef.current.setRevenueLines(restoredRevenueLines);
                }
              }

              // Restore COGS lines with saved settings
              if (savedAssumptions.cogs?.lines?.length > 0) {
                const restoredCOGSLines = savedAssumptions.cogs.lines.map((line: {
                  accountId: string;
                  accountName: string;
                  priorYearTotal?: number;
                  costBehavior?: 'variable' | 'fixed';
                  percentOfRevenue?: number;
                  monthlyAmount?: number;
                }) => ({
                  id: line.accountId,
                  name: line.accountName,
                  accountId: line.accountId,
                  priorYearTotal: line.priorYearTotal || 0,
                  costBehavior: line.costBehavior || 'variable',
                  percentOfRevenue: line.percentOfRevenue,
                  monthlyAmount: line.monthlyAmount,
                }));

                if (restoredCOGSLines.length > 0) {
                  console.log('[ForecastWizardV4] Restoring saved COGS forecast:', restoredCOGSLines.length, 'lines');
                  actionsRef.current.setCOGSLines(restoredCOGSLines);
                }
              }

              // Restore OpEx lines with saved settings (cost behavior, amounts, etc.)
              if (savedAssumptions.opex?.lines?.length > 0) {
                const restoredOpExLines = savedAssumptions.opex.lines.map((line: {
                  accountId: string;
                  accountName: string;
                  priorYearTotal?: number;
                  costBehavior?: 'fixed' | 'variable' | 'seasonal' | 'adhoc';
                  monthlyAmount?: number;
                  annualIncreasePct?: number;
                  percentOfRevenue?: number;
                  seasonalGrowthPct?: number;
                  seasonalTargetAmount?: number;
                  expectedAnnualAmount?: number;
                  expectedMonths?: string[];
                  isSubscription?: boolean;
                  notes?: string;
                }) => ({
                  id: line.accountId,
                  name: line.accountName,
                  accountId: line.accountId,
                  priorYearAnnual: line.priorYearTotal || 0,
                  costBehavior: line.costBehavior || 'fixed',
                  monthlyAmount: line.monthlyAmount,
                  annualIncreasePct: line.annualIncreasePct,
                  percentOfRevenue: line.percentOfRevenue,
                  seasonalGrowthPct: line.seasonalGrowthPct,
                  seasonalTargetAmount: line.seasonalTargetAmount,
                  expectedAnnualAmount: line.expectedAnnualAmount,
                  expectedMonths: line.expectedMonths,
                  isSubscription: line.isSubscription,
                  notes: line.notes,
                }));

                if (restoredOpExLines.length > 0) {
                  console.log('[ForecastWizardV4] Restoring saved OpEx forecast:', restoredOpExLines.length, 'lines');
                  actionsRef.current.setOpExLines(restoredOpExLines);
                }
              }
            }, 0);

            // Restore planned hires (new hires added by user)
            if (savedAssumptions.team?.plannedHires?.length > 0) {
              savedAssumptions.team.plannedHires.forEach((hire: {
                id?: string;
                role: string;
                employmentType: string;
                salary: number;
                hoursPerWeek?: number;
                hourlyRate?: number;
                weeksPerYear?: number;
                startMonth: string | number;
              }) => {
                // Convert startMonth to string format if it's a number
                let startMonthStr = typeof hire.startMonth === 'string'
                  ? hire.startMonth
                  : `${fiscalYear - 1}-${String(hire.startMonth + 6).padStart(2, '0')}`; // FY month to calendar

                actionsRef.current.addNewHire({
                  role: hire.role,
                  type: (hire.employmentType || 'full-time') as 'full-time' | 'part-time' | 'casual' | 'contractor',
                  salary: hire.salary,
                  hoursPerWeek: hire.hoursPerWeek || 38,
                  hourlyRate: hire.hourlyRate,
                  weeksPerYear: hire.weeksPerYear,
                  startMonth: startMonthStr,
                });
              });
            }

            // Restore departures
            if (savedAssumptions.team?.departures?.length > 0) {
              savedAssumptions.team.departures.forEach((departure: {
                id?: string;
                employeeId?: string;
                teamMemberId?: string;
                departureMonth?: number;
                endMonth?: string;
              }) => {
                const memberId = departure.teamMemberId || departure.employeeId;
                const endMonth = departure.endMonth ||
                  (departure.departureMonth ? `${fiscalYear - 1}-${String(departure.departureMonth + 6).padStart(2, '0')}` : '');

                if (memberId) {
                  actionsRef.current.addDeparture({
                    teamMemberId: memberId,
                    endMonth: endMonth,
                  });
                }
              });
            }

            // Restore bonuses
            if (savedAssumptions.team?.bonuses?.length > 0) {
              savedAssumptions.team.bonuses.forEach((bonus: {
                id?: string;
                employeeId?: string;
                teamMemberId?: string;
                amount: number;
                month: number;
              }) => {
                const memberId = bonus.teamMemberId || bonus.employeeId;
                if (memberId) {
                  actionsRef.current.addBonus({
                    teamMemberId: memberId,
                    amount: bonus.amount,
                    month: bonus.month,
                  });
                }
              });
            }

            // Restore commissions
            if (savedAssumptions.team?.commissions?.length > 0) {
              savedAssumptions.team.commissions.forEach((commission: {
                id?: string;
                employeeId?: string;
                teamMemberId?: string;
                revenueLineId: string;
                percentOfRevenue: number;
              }) => {
                const memberId = commission.teamMemberId || commission.employeeId;
                if (memberId) {
                  actionsRef.current.addCommission({
                    teamMemberId: memberId,
                    revenueLineId: commission.revenueLineId,
                    percentOfRevenue: commission.percentOfRevenue,
                    timing: 'monthly',
                  });
                }
              });
            }

            // Restore CapEx items
            if (savedAssumptions.capex?.items?.length > 0) {
              savedAssumptions.capex.items.forEach((item: {
                id?: string;
                name: string;
                amount: number;
                month: string | number;
                category?: string;
                usefulLifeYears?: number;
              }) => {
                // Convert month key back to month number
                let monthNum = 1;
                if (typeof item.month === 'number') {
                  monthNum = item.month;
                } else if (typeof item.month === 'string') {
                  const monthMatch = item.month.match(/-(\d{2})$/);
                  if (monthMatch) {
                    const m = parseInt(monthMatch[1]);
                    // Convert calendar month to FY month (July=1)
                    monthNum = m >= 7 ? m - 6 : m + 6;
                  }
                }
                actionsRef.current.addCapExItem({
                  description: item.name,
                  cost: item.amount,
                  month: monthNum,
                  usefulLifeYears: item.usefulLifeYears || 5,
                });
              });
            }
          }
        }
      } catch (err) {
        console.error('Failed to load data:', err);
        setError('Failed to load business data. You can still enter data manually.');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [businessId]);

  // Autosave functionality - save draft after 3 seconds of no changes
  const performAutoSave = useCallback(async () => {
    if (isLoading || isSaving || isAutoSaving) return;

    setIsAutoSaving(true);
    setSaveError(false);
    try {
      // Pass the current forecastId and name to update the specific forecast
      const savedId = await actions.saveDraft(forecastId, forecastName);
      if (savedId) {
        setForecastId(savedId);
        setLastSaved(new Date());
        setSaveError(false);
      }
    } catch (err) {
      console.error('Autosave failed:', err);
      setSaveError(true);
    } finally {
      setIsAutoSaving(false);
    }
  }, [actions, isLoading, isSaving, isAutoSaving, forecastId, forecastName]);

  // Focus name input when editing
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // Handle saving as a new version/scenario
  const handleSaveAsNew = async (newName: string) => {
    setIsSaving(true);
    try {
      // Create a NEW forecast by passing createNew=true to force creation
      const savedId = await actions.saveDraft(null, newName, true);
      if (savedId) {
        setForecastName(newName);
        setForecastId(savedId);
        setLastSaved(new Date());
        toast.success(`Saved as "${newName}"`);
      }
    } catch (err) {
      console.error('Save as new failed:', err);
      toast.error('Failed to save new version');
    } finally {
      setIsSaving(false);
      setShowSaveAsModal(false);
    }
  };

  const debouncedAutoSave = useDebouncedCallback(performAutoSave, 3000);

  // Track state changes and trigger autosave
  useEffect(() => {
    // Skip autosave during initial load or while still loading
    if (isLoading) {
      return;
    }

    // Skip the first few state changes during initialization
    stateVersionRef.current += 1;
    if (stateVersionRef.current < 3) {
      return;
    }

    // Trigger debounced autosave
    debouncedAutoSave();
  }, [
    isLoading,
    // Only track meaningful state changes (not navigation)
    state.goals,
    state.revenueLines,
    state.cogsLines,
    state.teamMembers,
    state.newHires,
    state.departures,
    state.bonuses,
    state.commissions,
    state.opexLines,
    state.capexItems,
    state.investments,
    state.otherExpenses,
    state.forecastDuration,
    state.revenuePattern,
    state.defaultOpExIncreasePct,
    debouncedAutoSave,
  ]);

  // Refresh data from Xero (without page reload)
  const handleRefreshFromXero = async () => {
    setIsSyncing(true);
    try {
      // First, get or create a forecast to sync to
      let forecastId: string | null = null;

      const forecastRes = await fetch(`/api/forecast?business_id=${businessId}&fiscal_year=${fiscalYear}`);
      const forecastData = await forecastRes.json();

      if (forecastData.forecast?.id) {
        forecastId = forecastData.forecast.id;
      } else {
        // No forecast exists - create a draft first
        toast.info('Creating draft forecast...');
        try {
          forecastId = await actions.saveDraft();
          if (!forecastId) {
            toast.error('Failed to create draft forecast');
            return;
          }
        } catch (err) {
          console.error('Error creating draft:', err);
          toast.error('Failed to create draft forecast');
          return;
        }
      }

      // Trigger a fresh sync from Xero
      const syncRes = await fetch('/api/Xero/sync-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forecast_id: forecastId,
          business_id: businessId,
        }),
      });

      const syncResult = await syncRes.json();

      if (syncResult.success) {
        // Re-fetch data without reloading the page
        toast.success('Syncing latest data from Xero...');

        try {
          const [plRes, teamRes] = await Promise.all([
            fetch(`/api/Xero/pl-summary?business_id=${businessId}&fiscal_year=${fiscalYear}`),
            fetch(`/api/Xero/employees?business_id=${businessId}`),
          ]);

          const [plData, teamData] = await Promise.all([
            plRes.ok ? plRes.json() : { summary: null },
            teamRes.ok ? teamRes.json() : { success: false, employees: [] },
          ]);

          // Transform and update state with new data
          const priorFY = plData.summary?.prior_fy;
          const hasXeroData = plData.summary?.has_xero_data && priorFY;

          if (hasXeroData || teamData.employees?.length > 0) {
            const currentYTDData = plData.summary?.current_ytd;
            const ytdRevenueLines = currentYTDData?.revenue_lines || [];
            const priorRevenueLines = priorFY?.revenue_lines || [];
            const sourceRevenueLines = ytdRevenueLines.length > 0 ? ytdRevenueLines : priorRevenueLines;

            const revenueByLine = sourceRevenueLines.map((line: any, idx: number) => {
              const roundedByMonth: Record<string, number> = {};
              Object.entries(line.by_month || {}).forEach(([key, val]) => {
                roundedByMonth[key] = Math.round(val as number);
              });
              return {
                id: `revenue-${idx}`,
                name: line.account_name,
                total: Math.round(line.total),
                byMonth: roundedByMonth,
              };
            });

            const ytdCogsLines = currentYTDData?.cogs_lines || [];
            const priorCogsLines = priorFY?.cogs_lines || [];
            const sourceCogsLines = ytdCogsLines.length > 0 ? ytdCogsLines : priorCogsLines;

            const cogsByLine = sourceCogsLines.map((line: any, idx: number) => {
              const roundedByMonth: Record<string, number> = {};
              Object.entries(line.by_month || {}).forEach(([key, val]) => {
                roundedByMonth[key] = Math.round(val as number);
              });
              return {
                id: `cogs-${idx}`,
                name: line.account_name,
                total: Math.round(line.total),
                byMonth: roundedByMonth,
                percentOfRevenue: Math.round(line.percent_of_revenue * 10) / 10,
              };
            });

            const rawPriorRevenueByMonth = priorFY?.revenue_by_month || {};
            const roundedPriorRevenueByMonth: Record<string, number> = {};
            Object.entries(rawPriorRevenueByMonth).forEach(([key, val]) => {
              roundedPriorRevenueByMonth[key] = Math.round(val as number);
            });

            const priorYear: PriorYearData = {
              revenue: {
                total: Math.round(priorFY?.total_revenue || 0),
                byMonth: roundedPriorRevenueByMonth,
                byLine: revenueByLine,
              },
              cogs: {
                total: Math.round(priorFY?.total_cogs || 0),
                percentOfRevenue: priorFY?.total_revenue
                  ? Math.round((priorFY.total_cogs / priorFY.total_revenue) * 1000) / 10
                  : 0,
                byMonth: {},
                byLine: cogsByLine,
              },
              grossProfit: {
                total: Math.round(priorFY?.gross_profit || 0),
                percent: Math.round((priorFY?.gross_margin_percent || 0) * 10) / 10,
                byMonth: {},
              },
              opex: {
                total: Math.round(priorFY?.operating_expenses || 0),
                byMonth: {},
                byLine: (priorFY?.operating_expenses_by_category || []).map((cat: any, idx: number) => ({
                  id: `opex-${idx}`,
                  name: cat.account_name || cat.category,
                  total: Math.round(cat.total),
                  monthlyAvg: Math.round(cat.monthly_average || (cat.total / 12)),
                  isOneOff: false,
                })),
              },
              seasonalityPattern: priorFY?.seasonality_pattern?.length === 12
                ? priorFY.seasonality_pattern
                : Array(12).fill(8.33),
            };

            const team: TeamMember[] = (teamData.employees || []).map((emp: any) => {
              let salary = emp.annual_salary || 0;
              if (!salary && emp.hourly_rate) {
                salary = emp.hourly_rate * (emp.hours_per_week || 38) * 52;
              }
              if (!salary) salary = 80000;

              return {
                id: emp.employee_id || `emp-${Date.now()}-${Math.random()}`,
                name: emp.full_name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || 'Unknown',
                role: emp.job_title || 'Team Member',
                type: (emp.employment_type as 'full-time' | 'part-time' | 'casual' | 'contractor') || 'full-time',
                hoursPerWeek: emp.hours_per_week || 38,
                currentSalary: salary,
                increasePct: 3,
                newSalary: 0,
                superAmount: 0,
                isFromXero: emp.from_xero ?? true,
              };
            });

            const rawYtdRevenueByMonth = plData.summary?.current_ytd?.revenue_by_month || {};
            const roundedYtdRevenueByMonth: Record<string, number> = {};
            Object.entries(rawYtdRevenueByMonth).forEach(([key, val]) => {
              roundedYtdRevenueByMonth[key] = Math.round(val as number);
            });

            const currentYTD = plData.summary?.current_ytd ? {
              revenue_by_month: roundedYtdRevenueByMonth,
              total_revenue: Math.round(plData.summary.current_ytd.total_revenue || 0),
              months_count: plData.summary.current_ytd.months_count || 0,
            } : undefined;

            // Update wizard state with refreshed data
            actionsRef.current.initializeFromXero({ priorYear, team, currentYTD });
            toast.success('Xero data refreshed successfully!');
          } else {
            toast.success('Sync complete - no new data found');
          }
        } catch (refetchErr) {
          console.error('Error re-fetching data:', refetchErr);
          toast.error('Sync completed but failed to refresh display. Please reload the page.');
        }
      } else if (syncRes.status === 401 || syncResult.needsReconnect) {
        toast.error(
          <div>
            <p className="font-medium">Xero connection expired</p>
            <p className="text-sm mt-1">Please reconnect from the <a href="/integrations" className="underline font-medium">Integrations page</a></p>
          </div>,
          { duration: 10000 }
        );
      } else if (syncRes.status === 404) {
        // No active connection found - try to reactivate
        console.log('[Wizard] No active connection, attempting to reactivate...');
        try {
          const reactivateRes = await fetch('/api/Xero/reactivate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ business_id: businessId }),
          });
          const reactivateResult = await reactivateRes.json();

          if (reactivateResult.success) {
            toast.success('Xero connection restored! Retrying sync...');
            // Retry the sync after reactivation
            setTimeout(() => handleRefreshFromXero(), 1000);
            return;
          } else {
            toast.error(
              <div>
                <p className="font-medium">No active Xero connection</p>
                <p className="text-sm mt-1">Please connect Xero from the <a href="/integrations" className="underline font-medium">Integrations page</a></p>
              </div>,
              { duration: 10000 }
            );
          }
        } catch (reactivateErr) {
          console.error('[Wizard] Reactivation failed:', reactivateErr);
          toast.error(
            <div>
              <p className="font-medium">No active Xero connection</p>
              <p className="text-sm mt-1">Please connect Xero from the <a href="/integrations" className="underline font-medium">Integrations page</a></p>
            </div>,
            { duration: 10000 }
          );
        }
      } else {
        toast.error('Failed to sync from Xero: ' + (syncResult.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Error refreshing from Xero:', err);
      toast.error('Failed to refresh data from Xero');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleComplete = async () => {
    setIsSaving(true);
    try {
      // Pass the current forecastId and name to update the specific forecast
      const savedForecastId = await actions.generateForecast(forecastId, forecastName);
      onComplete(savedForecastId);
    } catch (err) {
      console.error('Failed to generate forecast:', err);
      setError('Failed to generate forecast. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderStep = () => {
    switch (state.currentStep) {
      case 1:
        return <Step1Goals state={state} actions={actions} fiscalYear={fiscalYear} />;
      case 2:
        return <Step2PriorYear state={state} actions={actions} fiscalYear={fiscalYear} businessId={businessId} />;
      case 3:
        return <Step3RevenueCOGS state={state} actions={actions} fiscalYear={fiscalYear} />;
      case 4:
        return <Step4Team state={state} actions={actions} fiscalYear={fiscalYear} forecastDuration={state.forecastDuration} />;
      case 5:
        return <Step5OpEx state={state} actions={actions} fiscalYear={fiscalYear} industry={state.businessProfile?.industry} />;
      case 6:
        return <Step6Subscriptions state={state} actions={actions} fiscalYear={fiscalYear} businessId={businessId} />;
      case 7:
        return <Step6CapEx state={state} actions={actions} fiscalYear={fiscalYear} businessId={businessId} />;
      case 8:
        return <Step8Review state={state} actions={actions} summary={summary} fiscalYear={fiscalYear} />;
      default:
        return null;
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center z-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-white mx-auto mb-4" />
          <p className="text-white text-lg">Loading your business data...</p>
          <p className="text-gray-400 text-sm mt-2">Fetching goals, financials, and team information</p>
        </div>
      </div>
    );
  }

  const currentStepInfo = WIZARD_STEPS.find((s) => s.step === state.currentStep);
  const isFirstStep = state.currentStep === 1;
  const isLastStep = state.currentStep === 8;

  return (
    <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col">
      {/* Header - Clean, modern design with inline editing */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Close + Editable Title */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={onClose}
              className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close wizard"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="min-w-0 flex-1">
              {/* Editable Forecast Name */}
              <div className="flex items-center gap-2">
                {isEditingName ? (
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={forecastName}
                    onChange={(e) => setForecastName(e.target.value)}
                    onBlur={() => setIsEditingName(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setIsEditingName(false);
                      if (e.key === 'Escape') {
                        setForecastName(`FY${fiscalYear} Forecast`);
                        setIsEditingName(false);
                      }
                    }}
                    className="text-lg font-semibold text-gray-900 bg-transparent border-b-2 border-blue-500 outline-none px-1 -mx-1 min-w-[200px]"
                  />
                ) : (
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="group flex items-center gap-2 text-lg font-semibold text-gray-900 hover:text-gray-700 transition-colors"
                    title="Click to rename forecast"
                  >
                    <span className="truncate">{forecastName}</span>
                    <Pencil className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
              </div>

              {/* Subtitle with business name */}
              {businessName && (
                <p className="text-sm text-gray-500 truncate">{businessName}</p>
              )}
            </div>
          </div>

          {/* Right: Actions with Auto-save Status */}
          <div className="flex-shrink-0 flex items-center gap-2">
            {/* Auto-save status indicator - matching Goals wizard style */}
            <div className="relative group">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                isAutoSaving ? 'bg-amber-50 border-amber-200' :
                saveError ? 'bg-red-50 border-red-200' :
                lastSaved ? 'bg-green-50 border-green-200' :
                'bg-gray-50 border-gray-200'
              }`}>
                {isAutoSaving && (
                  <Loader2 className="animate-spin h-4 w-4 text-amber-600" />
                )}
                {!isAutoSaving && lastSaved && !saveError && (
                  <Cloud className="h-4 w-4 text-green-600" />
                )}
                {saveError && (
                  <CloudOff className="h-4 w-4 text-red-600" />
                )}
                {!isAutoSaving && !lastSaved && !saveError && (
                  <div className="h-2 w-2 rounded-full bg-gray-400" />
                )}
                <span className={`text-xs sm:text-sm font-medium ${
                  isAutoSaving ? 'text-amber-600' :
                  saveError ? 'text-red-600' :
                  lastSaved ? 'text-green-600' :
                  'text-gray-500'
                }`}>
                  {isAutoSaving ? 'Saving...' :
                   saveError ? 'Failed to save' :
                   lastSaved ? 'All changes saved' :
                   'Draft'}
                </span>
              </div>
              {/* Tooltip explaining auto-save */}
              <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
                <p className="font-semibold mb-1">Auto-Save Enabled</p>
                <p className="text-slate-300">Your progress is automatically saved as you make changes. Changes save 3 seconds after you stop typing.</p>
              </div>
            </div>

            {/* Manual save button - only show on error or for force sync */}
            {saveError && (
              <button
                onClick={() => performAutoSave()}
                disabled={isAutoSaving}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-brand-orange text-white hover:bg-brand-orange-600 rounded-lg transition-colors shadow-sm"
              >
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline">Retry</span>
              </button>
            )}

            <div className="w-px h-6 bg-gray-200" />

            <button
              onClick={handleRefreshFromXero}
              disabled={isSyncing}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh data from Xero"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Refresh'}</span>
            </button>

            <button
              onClick={() => setShowSaveAsModal(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Save as new scenario"
            >
              <Copy className="w-4 h-4" />
              <span className="hidden sm:inline">Save As</span>
            </button>
          </div>
        </div>
      </header>

      {/* Save As Modal */}
      {showSaveAsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Save as New Scenario</h3>
              <p className="text-sm text-gray-500 mt-1">Create a copy of this forecast with a new name</p>
            </div>
            <div className="px-6 py-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Scenario Name</label>
              <input
                type="text"
                autoFocus
                placeholder="e.g., Optimistic Case, Conservative Estimate"
                defaultValue={`${forecastName} (Copy)`}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveAsNew((e.target as HTMLInputElement).value);
                  }
                  if (e.key === 'Escape') {
                    setShowSaveAsModal(false);
                  }
                }}
                id="scenario-name-input"
              />
              <p className="text-xs text-gray-500 mt-2">
                Common scenarios: Base Case, Best Case, Worst Case, Growth Plan
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setShowSaveAsModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const input = document.getElementById('scenario-name-input') as HTMLInputElement;
                  handleSaveAsNew(input?.value || `${forecastName} (Copy)`);
                }}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Scenario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step Bar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200">
        <StepBar
          currentStep={state.currentStep}
          onStepClick={actions.goToStep}
        />
      </div>

      {/* Year Tabs - Only show for relevant steps and multi-year forecasts */}
      {[3, 4, 5].includes(state.currentStep) && state.forecastDuration > 1 && (
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6">
          <YearTabs
            activeYear={state.activeYear}
            onYearChange={actions.setActiveYear}
            fiscalYear={fiscalYear}
            forecastDuration={state.forecastDuration}
          />
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="flex-shrink-0 px-6 py-3 bg-amber-50 border-b border-amber-100">
          <p className="text-sm text-amber-800">{error}</p>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Step Title */}
        <div className="flex-shrink-0 px-6 py-4 bg-gray-50">
          <h2 className="text-xl font-semibold text-gray-900">
            Step {state.currentStep}: {currentStepInfo?.label}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {state.currentStep === 1 && "Let's confirm your financial targets for the next 3 years"}
            {state.currentStep === 2 && "Review your prior year performance to inform your forecast"}
            {state.currentStep === 3 && "Set your revenue and cost of goods targets"}
            {state.currentStep === 4 && "Plan your team costs including salaries, increases, and new hires"}
            {state.currentStep === 5 && "Classify operating expenses as Fixed, Variable, or Ad-hoc"}
            {state.currentStep === 6 && "Audit your subscriptions and identify potential savings"}
            {state.currentStep === 7 && "Plan any capital expenditures and strategic investments"}
            {state.currentStep === 8 && "Review your complete forecast before generating"}
          </p>
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-auto px-6 pb-6">
          {renderStep()}
        </div>
      </main>

      {/* Navigation Footer */}
      <footer className="flex-shrink-0 bg-white border-t border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={actions.prevStep}
            disabled={isFirstStep}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            {isLastStep ? (
              <button
                onClick={handleComplete}
                disabled={isSaving}
                className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-brand-navy rounded-lg hover:bg-brand-navy-800 transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {isSaving ? 'Generating...' : 'Generate Forecast'}
              </button>
            ) : (
              <button
                onClick={actions.nextStep}
                className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-brand-navy rounded-lg hover:bg-brand-navy-800 transition-colors"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* AI CFO Panel */}
      <AICFOPanel
        isOpen={showAIAssistant}
        onToggle={() => setShowAIAssistant(!showAIAssistant)}
        currentStep={state.currentStep}
        activeYear={state.activeYear}
        fiscalYear={fiscalYear}
        state={state}
        businessId={businessId}
      />
    </div>
  );
}
