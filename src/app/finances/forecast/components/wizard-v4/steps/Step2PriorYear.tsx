'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  FileSpreadsheet,
  ExternalLink,
  SkipForward,
  Upload,
  CheckCircle,
  XCircle,
  Loader2,
  FileCheck,
  Flag,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { ForecastWizardState, WizardActions, formatCurrency, formatPercent, PriorYearData } from '../types';
import { parsePLFile } from '../utils/parsePLFile';
import { resolvePriorYearSecondary } from '../utils/resolve-prior-year-secondaries';

interface Step2PriorYearProps {
  state: ForecastWizardState;
  actions: WizardActions;
  fiscalYear: number;
  businessId: string;
}

interface MonthlyComparison {
  month: string;
  monthLabel: string;
  priorRevenue: number;
  currentRevenue: number | null;
  priorCogs: number;
  currentCogs: number | null;
  priorGP: number;
  currentGP: number | null;
  priorNP: number;
  currentNP: number | null;
  revenueVariance: number | null;
}

interface AIInsight {
  id: string;
  headline: string;
  metricValue?: string;
  metricContext?: string;
  observation?: string;
  implication: string;
  question: string;
  category: 'positive' | 'warning' | 'neutral';
  isApproved?: boolean;
  isEdited?: boolean;
}

interface Anomaly {
  lineId: string;
  lineName: string;
  type: 'one-off' | 'unusual' | 'exclude';
  note: string;
  month?: string;
}

type AccountingPackage = 'xero' | 'myob' | 'quickbooks' | 'sage' | 'other' | null;

const ACCOUNTING_PACKAGES = [
  {
    id: 'xero' as const,
    name: 'Xero',
    logo: '/logos/xero.svg',
    instructions: [
      'Go to Reports → Profit and Loss',
      'Set date range to your prior fiscal year',
      'Click "Export" → "Excel"',
      'Upload the downloaded file below',
    ],
    exportUrl: 'https://go.xero.com/Reports/ProfitAndLoss.aspx',
  },
  {
    id: 'myob' as const,
    name: 'MYOB',
    logo: '/logos/myob.svg',
    instructions: [
      'Go to Reports → Profit & Loss [Accrual]',
      'Set the reporting period to your prior fiscal year',
      'Click "Export to Excel"',
      'Upload the downloaded file below',
    ],
    exportUrl: 'https://app.myob.com',
  },
  {
    id: 'quickbooks' as const,
    name: 'QuickBooks',
    logo: '/logos/quickbooks.svg',
    instructions: [
      'Go to Reports → Profit and Loss',
      'Set date range to "Last Fiscal Year"',
      'Click "Export" → "Export to Excel"',
      'Upload the downloaded file below',
    ],
    exportUrl: 'https://quickbooks.intuit.com',
  },
  {
    id: 'other' as const,
    name: 'Other / CSV',
    logo: null,
    instructions: [
      'Export your Profit & Loss report for the prior fiscal year',
      'Ensure it includes monthly breakdown by account',
      'Save as CSV or Excel format',
      'Upload the file below',
    ],
    exportUrl: null,
  },
];

import { getFiscalMonthLabels, DEFAULT_YEAR_START_MONTH, getCurrentFiscalYear, isNearYearEnd } from '@/lib/utils/fiscal-year-utils';
import { DataIntegrityBanner } from '@/components/data-integrity/DataIntegrityBanner';
import type { DataQuality, PerTenantQuality } from '@/lib/services/forecast-read-service';
import { ConsolidatedMembersBadge } from '../components/ConsolidatedMembersBadge';
// Phase 67-04 — reuse the monthly-report banner so wizard + report share
// identical FX-missing visuals + copy. The banner short-circuits to null
// when missing_rates is empty, so it's safe to render unconditionally.
import FXRateMissingBanner from '@/app/finances/monthly-report/components/FXRateMissingBanner';

const MONTHS = getFiscalMonthLabels(DEFAULT_YEAR_START_MONTH);

export function Step2PriorYear({ state, actions, fiscalYear, businessId }: Step2PriorYearProps) {
  const { priorYear, revenueLines, cogsLines, opexLines } = state;
  // In planning season (extended forecast), prior year is 2 back (FY2025), current is 1 back (FY2026)
  const currentFY = getCurrentFiscalYear(DEFAULT_YEAR_START_MONTH);
  const isExtended = isNearYearEnd(new Date(), DEFAULT_YEAR_START_MONTH, 3) && fiscalYear === currentFY + 1;
  const priorFY = isExtended ? currentFY - 1 : fiscalYear - 1;
  const currentYearFY = isExtended ? currentFY : fiscalYear;

  // State for import flow
  const [selectedPackage, setSelectedPackage] = useState<AccountingPackage>(null);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<PriorYearData | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // State for analysis view
  const [showDetailedView, setShowDetailedView] = useState(false);
  const [performanceTab, setPerformanceTab] = useState<'prior' | 'current'>('prior');
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [insightsLoaded, setInsightsLoaded] = useState(false);
  const [dataHash, setDataHash] = useState<string | null>(null);

  // D-44.2-03 read-path quality gate; surfaces in DataIntegrityBanner.
  const [dataQuality, setDataQuality] = useState<DataQuality>('verified')
  const [perTenantQuality, setPerTenantQuality] = useState<PerTenantQuality[]>([])

  // Phase 67-04 — FX missing-rate signaling. Surfaced only when the engine
  // path returns fx_context.missing_rates (single-tenant / all-AUD businesses
  // return undefined → banner stays hidden).
  const [missingFxRates, setMissingFxRates] = useState<{ currency_pair: string; period: string }[]>([])

  // Issue B (hotfix step2-secondaries) — pl-summary lookup_error visibility.
  // When the resolver finds a business/profile mapping but no xero_connections
  // row (dual-id desync, memory note `project_dual_id`), the API now sets
  // `summary.lookup_error`. We capture it here to (a) defeat the no_sync
  // banner suppression below, and (b) fire a one-shot toast so the operator
  // knows Xero data couldn't load. We do NOT fix the underlying dual-id
  // resolution — that's Phase 53 territory.
  const [lookupError, setLookupError] = useState<string | null>(null)
  const lookupErrorToastFiredRef = useRef(false)

  // Current YTD data from pl-summary API
  const [currentYTD, setCurrentYTD] = useState<{
    revenue_by_month: Record<string, number>;
    cogs_by_month?: Record<string, number>;
    opex_by_month?: Record<string, number>;
    total_revenue: number;
    total_cogs?: number;
    operating_expenses?: number;
    net_profit?: number;
    gross_margin_percent: number;
    net_margin_percent: number;
    months_count: number;
    run_rate_revenue?: number;
    run_rate_opex?: number;
    run_rate_net_profit?: number;
  } | null>(null);

  // Load current YTD data + sync-quality banner state.
  // Refetches on tab focus / visibility change so a sync triggered from the
  // Integrations tab (or elsewhere) updates the banner without a full reload.
  useEffect(() => {
    if (!priorYear || !businessId) return;
    loadCurrentYTD();
    const onFocus = () => { loadCurrentYTD(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') loadCurrentYTD(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priorYear, businessId, fiscalYear]);

  const loadCurrentYTD = async () => {
    try {
      const response = await fetch(`/api/Xero/pl-summary?business_id=${businessId}&fiscal_year=${fiscalYear}`);
      if (response.ok) {
        const data = await response.json();
        if (data.summary?.current_ytd) {
          setCurrentYTD(data.summary.current_ytd);
        }
        // D-44.2-03 — capture read-path quality + per-tenant breakdown.
        if (data.summary?.data_quality) setDataQuality(data.summary.data_quality);
        if (Array.isArray(data.summary?.per_tenant_quality)) {
          setPerTenantQuality(data.summary.per_tenant_quality);
        }
        // Phase 67-04 — surface missing FX rates so the operator knows when
        // a foreign-currency tenant's month was left untranslated.
        const fxMissing = Array.isArray(data.summary?.fx_context?.missing_rates)
          ? data.summary.fx_context.missing_rates
          : [];
        setMissingFxRates(fxMissing);
        // Issue B (hotfix step2-secondaries) — surface dual-id lookup
        // failures. The route returns `lookup_error: string` when the
        // resolver found a business/profile mapping but no xero_connections
        // row. Pre-hotfix: this returned `has_xero_data: false` silently
        // and the wizard treated it as "not connected". Now: capture the
        // error, defeat banner suppression, fire a one-shot toast.
        const newLookupError: string | null = data.summary?.lookup_error ?? null;
        setLookupError(newLookupError);
        if (newLookupError && !lookupErrorToastFiredRef.current) {
          lookupErrorToastFiredRef.current = true;
          toast.error("Couldn't load Xero data — please refresh or reconnect", {
            description:
              'A connection to Xero was expected but not found for this business. Try refreshing the page; if the problem persists, reconnect Xero from the Integrations tab.',
            duration: 8000,
          });
        }
      }
    } catch (error) {
      console.error('Failed to load current YTD:', error);
    }
  };

  // Generate a hash of the prior year data to detect changes
  const generateDataHash = (data: PriorYearData): string => {
    const key = `${data.revenue.total}-${data.grossProfit.total}-${data.opex.total}-${data.opex.byLine.length}`;
    return btoa(key).slice(0, 16);
  };

  // Load saved insights or generate new ones — regenerate when key data changes
  const priorYearHash = priorYear
    ? `${priorYear.revenue.total}-${priorYear.grossProfit.total}-${priorYear.opex.total}`
    : '';
  useEffect(() => {
    if (priorYear && priorYear.revenue.total > 0) {
      loadOrGenerateInsights();
    }
  }, [priorYearHash]);

  const loadOrGenerateInsights = async () => {
    if (!priorYear) return;

    setIsLoadingInsights(true);

    try {
      const response = await fetch('/api/ai/forecast-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'prior-year-insights',
          data: {
            priorYear,
            currentYTD,
            fiscalYear,
            industry: state.businessProfile?.industry || null,
          },
        }),
      });

      if (response.ok) {
        const { result } = await response.json();
        if (result?.insights?.length > 0) {
          setInsights(result.insights.slice(0, 4));
          setInsightsLoaded(true);
          setIsLoadingInsights(false);
          return;
        }
      }
    } catch (error) {
      console.warn('[Step2] AI insights failed, using fallback:', error);
    }

    // Fallback to locally-generated insights
    setInsights(generatePlaceholderInsights());
    setInsightsLoaded(true);
    setIsLoadingInsights(false);
  };

  const generatePlaceholderInsights = (): AIInsight[] => {
    if (!priorYear) return [];

    const insights: AIInsight[] = [];
    const gpPercent = priorYear.grossProfit.percent;
    const insightOI = priorYear.otherIncome?.total || 0;
    const insightOE = priorYear.otherExpenses?.total || 0;
    const netProfit = priorYear.grossProfit.total - priorYear.opex.total + insightOI - insightOE;
    const npPercent = priorYear.revenue.total > 0
      ? (netProfit / priorYear.revenue.total) * 100
      : 0;

    // Revenue insight
    const ytdPace = currentYTD
      ? currentYTD.total_revenue > (priorYear.revenue.total * (currentYTD.months_count / 12))
        ? 'ahead'
        : 'behind'
      : null;

    insights.push({
      id: '1',
      headline: 'Revenue',
      metricValue: formatCurrency(priorYear.revenue.total),
      metricContext: ytdPace ? `YTD tracking ${ytdPace}` : `FY${priorFY} total`,
      observation: `Your FY${priorFY} revenue was ${formatCurrency(priorYear.revenue.total)}.`,
      implication: currentYTD
        ? `Based on YTD performance, you're tracking ${ytdPace} of last year's pace.`
        : 'This establishes your baseline for forecasting growth.',
      question: 'What factors will drive revenue growth (or decline) in the coming year?',
      category: ytdPace === 'ahead' ? 'positive' : ytdPace === 'behind' ? 'warning' : 'neutral',
    });

    // Gross profit insight
    if (gpPercent < 40) {
      insights.push({
        id: '2',
        headline: 'Gross Margin',
        metricValue: formatPercent(gpPercent),
        metricContext: 'typical: 40-50%',
        observation: `Your gross profit margin was ${formatPercent(gpPercent)}, below the typical 40-50% range.`,
        implication: 'Lower margins mean more revenue needed for the same profit, with less buffer for unexpected costs.',
        question: 'What opportunities exist to improve pricing or reduce direct costs?',
        category: 'warning',
      });
    } else if (gpPercent > 60) {
      insights.push({
        id: '2',
        headline: 'Gross Margin',
        metricValue: formatPercent(gpPercent),
        metricContext: 'above typical',
        observation: `Your gross profit margin was ${formatPercent(gpPercent)}, which is strong.`,
        implication: 'Strong margins provide flexibility and buffer against unexpected costs.',
        question: 'Is this margin sustainable, or were there one-off factors?',
        category: 'positive',
      });
    } else {
      insights.push({
        id: '2',
        headline: 'Gross Margin',
        metricValue: formatPercent(gpPercent),
        metricContext: 'within typical range',
        observation: `Your gross profit margin was ${formatPercent(gpPercent)}, within the typical range.`,
        implication: 'Margins are healthy and provide reasonable buffer for the business.',
        question: 'Are there opportunities to improve this further?',
        category: 'neutral',
      });
    }

    // Seasonality insight
    const maxMonth = Math.max(...priorYear.seasonalityPattern);
    const minMonth = Math.min(...priorYear.seasonalityPattern);
    const peakIdx = priorYear.seasonalityPattern.indexOf(maxMonth);
    const lowIdx = priorYear.seasonalityPattern.indexOf(minMonth);
    const seasonalityVariance = maxMonth - minMonth;

    if (seasonalityVariance > 7) {
      insights.push({
        id: '3',
        headline: 'Seasonality',
        metricValue: 'Significant',
        metricContext: `${MONTHS[peakIdx]} peak, ${MONTHS[lowIdx]} low`,
        observation: `Revenue varies significantly - ${MONTHS[peakIdx]} is your peak month while ${MONTHS[lowIdx]} is slowest.`,
        implication: 'Cash flow varies significantly month-to-month, requiring reserves to cover slow periods.',
        question: 'How are you planning to manage cash during the slower months?',
        category: 'neutral',
      });
    }

    // Top expense insight
    if (priorYear.opex.byLine.length > 0) {
      const topExpense = priorYear.opex.byLine[0];
      const topExpensePct = (topExpense.total / priorYear.opex.total) * 100;

      insights.push({
        id: '4',
        headline: 'Top Expense',
        metricValue: topExpense.name,
        metricContext: `${formatPercent(topExpensePct)} of OpEx`,
        observation: `Your largest operating expense is ${topExpense.name} at ${formatCurrency(topExpense.total)}/year.`,
        implication: 'Major expense categories warrant close monitoring and may offer savings opportunities.',
        question: 'Is this expense level appropriate for current business needs?',
        category: topExpensePct > 30 ? 'warning' : 'neutral',
      });
    }

    // Net Profit insight
    insights.push({
      id: '5',
      headline: 'Net Profit',
      metricValue: formatPercent(npPercent),
      metricContext: npPercent < 10 ? 'below 10% target' : npPercent < 15 ? 'approaching target' : 'healthy',
      observation: `Your net profit margin was ${formatPercent(npPercent)}, resulting in ${formatCurrency(netProfit)} profit.`,
      implication: npPercent < 10
        ? 'Lower net margins leave less for reinvestment, owner drawings, and building reserves.'
        : 'Healthy margins support business growth and owner returns.',
      question: 'What profit target are you aiming for this year?',
      category: npPercent < 10 ? 'warning' : npPercent >= 15 ? 'positive' : 'neutral',
    });

    return insights.slice(0, 4); // Exactly 4 insights for 2x2 grid
  };

  const handleFileUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    setUploadWarnings([]);
    setUploadedFileName(file.name);

    try {
      const result = await parsePLFile(file);

      if (result.success && result.data) {
        setParsedData(result.data);
        if (result.warnings) {
          setUploadWarnings(result.warnings);
        }
      } else {
        setUploadError(result.error || 'Failed to parse file');
        setParsedData(null);
      }
    } catch (error) {
      setUploadError('An unexpected error occurred while parsing the file');
      setParsedData(null);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleConfirmParsedData = useCallback(() => {
    if (parsedData) {
      actions.setPriorYear(parsedData);
      setParsedData(null);
      setUploadedFileName(null);
    }
  }, [parsedData, actions]);

  // Hotfix (regression from PR #136): operator-controlled "Refresh from Xero".
  //
  // Background: PR #136 fixed a real bug where every wizard mount silently wiped
  // operator customizations (Steps 3/5/6) by calling the destructive
  // `setPriorYear` on the always-on Xero refresh path. The fix swapped that for
  // `setPriorYearDisplay`, which only updates `state.priorYear` totals and
  // leaves `revenueLines/cogsLines/opexLines` alone — preserving customizations
  // but also leaving the line arrays anchored to whatever Xero composition
  // existed at forecast-creation time. When Xero data drifts (late journals,
  // period close, account renames), Step 2 banners show fresh Xero while
  // Step 5 BudgetFramework / Step 6 OpEx read stale lines → silent divergence.
  //
  // Operator-controlled refresh is the visibility + recovery path: fetch fresh
  // pl-summary (same endpoint the auto-refresh uses), confirm with the operator
  // (this WILL reset their line-level customizations), then call the destructive
  // `setPriorYear` to rebuild lines from current Xero. We DO NOT remove
  // setPriorYearDisplay or revert the auto-refresh path — only adding a manual
  // override the operator can invoke when they see drift.
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshFromXero = useCallback(async () => {
    const confirmed = window.confirm(
      'Refresh will reset your line-level customizations in Steps 3, 5, and 6 to match current Xero.\n\nStep 4 (Team) and Step 5 (Subscriptions) will not be affected.\n\nContinue?'
    );
    if (!confirmed) return;

    setIsRefreshing(true);
    try {
      const plRes = await fetch(`/api/Xero/pl-summary?business_id=${businessId}&fiscal_year=${fiscalYear}`);
      if (!plRes.ok) {
        throw new Error(`pl-summary returned ${plRes.status}`);
      }
      const plData = await plRes.json();
      const freshPriorFY = plData.summary?.prior_fy;
      if (!freshPriorFY || freshPriorFY.total_revenue == null) {
        throw new Error('No prior-year P&L data available from Xero');
      }

      const totalRevenue = freshPriorFY.total_revenue;
      const totalCogs = freshPriorFY.total_cogs;
      const totalOpex = freshPriorFY.operating_expenses;

      // Mirrors freshPriorYear builder in ForecastWizardV4.tsx:255-300 (the
      // always-on refresh path). Kept inline here rather than extracted —
      // hotfix scope; we call setPriorYear (destructive) where the auto-refresh
      // calls setPriorYearDisplay. Any future schema change should update both
      // call sites in lockstep.
      //
      // Divergence note (fix/refresh-button-preserve-other-income): the
      // otherIncome/otherExpenses fall-through below intentionally diverges
      // from the always-on path's simpler cache-on-undefined branch. The
      // operator-triggered refresh runs against an already-populated
      // `state.priorYear`, so when Xero returns 0 for these secondary buckets
      // we prefer the cached value the operator can see on screen rather
      // than wiping the row. The always-on path can keep its simpler shape
      // because it runs on initial mount when the cache may itself be empty.
      const revenueByLine = (freshPriorFY.revenue_lines || []).map((line: { account_name: string; total: number; by_month?: Record<string, number> }, idx: number) => ({
        id: `revenue-${idx}`, name: line.account_name, total: line.total, byMonth: line.by_month || {},
      }));
      const cogsByLine = (freshPriorFY.cogs_lines || []).map((line: { account_name: string; total: number; by_month?: Record<string, number>; percent_of_revenue?: number }, idx: number) => ({
        id: `cogs-${idx}`, name: line.account_name, total: line.total,
        byMonth: line.by_month || {}, percentOfRevenue: line.percent_of_revenue || 0,
      }));
      const opexByLine = (freshPriorFY.operating_expenses_by_category || []).map((cat: { account_name?: string; category?: string; total: number; monthly_average?: number; account_code?: string }, idx: number) => ({
        id: `opex-${idx}`, name: cat.account_name || cat.category,
        total: cat.total, monthlyAvg: cat.monthly_average || cat.total / 12, isOneOff: false,
        account_code: cat.account_code,
      }));

      // Other Income / Other Expenses preservation (fix/refresh-button-preserve-other-income).
      // See `utils/resolve-prior-year-secondaries.ts` for the full rationale.
      // Short version: historical-pl-summary always returns these as numbers
      // (0 when classification is empty), so the prior `!== undefined && !==
      // null` guard never fell back to the cached value — a tenant where Xero
      // returned 0 (account-type miss, mid-deploy matcher change) silently
      // wiped the visible Other Income on click. The resolver trusts non-zero
      // API values, falls back to cached non-zero when the API returns 0, and
      // keeps `byMonth` in sync with `total` either way.
      const resolvedOtherIncome = resolvePriorYearSecondary({
        apiTotal: freshPriorFY.other_income,
        apiByMonth: freshPriorFY.other_income_by_month,
        cached: priorYear?.otherIncome,
      });
      const resolvedOtherExpenses = resolvePriorYearSecondary({
        apiTotal: freshPriorFY.other_expenses,
        apiByMonth: freshPriorFY.other_expenses_by_month,
        cached: priorYear?.otherExpenses,
      });

      const freshPriorYear: PriorYearData = {
        revenue: { total: totalRevenue, byMonth: freshPriorFY.revenue_by_month || {}, byLine: revenueByLine },
        cogs: {
          total: totalCogs,
          percentOfRevenue: totalRevenue ? (totalCogs / totalRevenue) * 100 : 0,
          byMonth: freshPriorFY.cogs_by_month || {},
          byLine: cogsByLine,
        },
        grossProfit: {
          total: freshPriorFY.gross_profit || (totalRevenue - totalCogs),
          percent: freshPriorFY.gross_margin_percent || (totalRevenue ? ((totalRevenue - totalCogs) / totalRevenue) * 100 : 0),
          byMonth: {},
        },
        opex: {
          total: totalOpex, byLine: opexByLine,
          byMonth: freshPriorFY.opex_by_month || {},
        },
        otherIncome: resolvedOtherIncome,
        otherExpenses: resolvedOtherExpenses,
        seasonalityPattern: freshPriorFY.seasonality_pattern?.length === 12
          ? freshPriorFY.seasonality_pattern : Array(12).fill(100 / 12),
      };

      // Destructive: rebuilds revenueLines / cogsLines / opexLines from fresh
      // Xero. This is the whole point of the operator-triggered refresh.
      actions.setPriorYear(freshPriorYear);

      toast.success('Refreshed from Xero — your customizations have been reset to match current data');
      // Reset banner dismissal — operator will see drift again only if Xero
      // drifts in the future. The just-completed refresh resolves any prior
      // drift, so any dismissal that was hiding it is no longer relevant.
      setDriftBannerDismissed(false);
    } catch (err) {
      console.error('[Step2PriorYear] Refresh from Xero failed:', err);
      toast.error('Refresh from Xero failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [businessId, fiscalYear, actions, priorYear]);

  // Hotfix Part 2 — reconciliation drift banner.
  //
  // After PR #136, the always-on Xero refresh updates `priorYear` totals but
  // leaves `revenueLines / cogsLines / opexLines` untouched (so operator
  // customizations survive a hard-refresh). The trade-off: when Xero data
  // drifts post-creation, those line arrays go stale. Because Step 5
  // BudgetFramework, Step 6 OpEx, and the rollup all derive from the line
  // arrays — not from `priorYear` — the operator sees a silent numeric
  // mismatch with no error, no banner, no warning.
  //
  // This banner makes the divergence visible. Threshold $1 lives below
  // rounding noise from the per-line `Math.round` in setPriorYear (each line
  // can contribute up to $0.50 of rounding; we'd need 3+ lines to cross $1).
  //
  // Compare the Xero-ingested totals (priorYear.{cat}.total) against the
  // prior-year line baselines stored separately from the operator-editable
  // forecast lines. Revenue baseline lives in priorYear.revenue.byLine[].total
  // (the Xero-ingested values, NOT the forecast revenueLines that operators
  // edit on Step 3). COGS uses cogsLines[].priorYearTotal and OpEx uses
  // opexLines[].priorYearAnnual — both are dedicated prior-year fields on
  // the forecast lines that hold the original Xero baseline even after
  // operator edits to forward-looking values.
  const driftAnalysis = useMemo(() => {
    if (!priorYear || priorYear.revenue.total === 0) {
      return null;
    }

    const revenueLineSum = (priorYear.revenue.byLine || []).reduce(
      (total, line) => total + (line.total || 0),
      0
    );

    const cogsLineSum = cogsLines.reduce((total, line) => {
      return total + (line.priorYearTotal || 0);
    }, 0);

    const opexLineSum = opexLines.reduce((total, line) => {
      return total + (line.priorYearAnnual || 0);
    }, 0);

    const revenueDelta = priorYear.revenue.total - revenueLineSum;
    const cogsDelta = priorYear.cogs.total - cogsLineSum;
    const opexDelta = priorYear.opex.total - opexLineSum;

    // Threshold ignores rounding noise from original ingest.
    // $7 drift on $9.9M revenue is per-line cent-rounding at capture time,
    // not real drift. Real drift (Xero updated post-creation) is typically
    // thousands of dollars.
    const driftThreshold = (xeroTotal: number) =>
      Math.max(100, Math.abs(xeroTotal) * 0.001);
    const hasRevenueDrift = Math.abs(revenueDelta) > driftThreshold(priorYear.revenue.total);
    const hasCogsDrift = Math.abs(cogsDelta) > driftThreshold(priorYear.cogs.total);
    const hasOpexDrift = Math.abs(opexDelta) > driftThreshold(priorYear.opex.total);

    return {
      hasDrift: hasRevenueDrift || hasCogsDrift || hasOpexDrift,
      revenue: { xero: priorYear.revenue.total, lines: revenueLineSum, delta: revenueDelta, drift: hasRevenueDrift },
      cogs: { xero: priorYear.cogs.total, lines: cogsLineSum, delta: cogsDelta, drift: hasCogsDrift },
      opex: { xero: priorYear.opex.total, lines: opexLineSum, delta: opexDelta, drift: hasOpexDrift },
    };
  }, [priorYear, cogsLines, opexLines]);

  // Dismissible — operator may have intentionally customized lines and accept
  // the divergence. Dismissal is per-mount (not persisted) so a fresh refresh
  // re-surfaces the warning if drift returns.
  const [driftBannerDismissed, setDriftBannerDismissed] = useState(false);

  const handleCancelParsedData = useCallback(() => {
    setParsedData(null);
    setUploadedFileName(null);
    setUploadError(null);
    setUploadWarnings([]);
  }, []);

  const addAnomaly = (lineId: string, lineName: string, type: Anomaly['type'], note: string) => {
    setAnomalies(prev => [...prev, { lineId, lineName, type, note }]);
  };

  const removeAnomaly = (lineId: string) => {
    setAnomalies(prev => prev.filter(a => a.lineId !== lineId));
  };

  // Build monthly comparison data
  const buildMonthlyComparison = (): MonthlyComparison[] => {
    if (!priorYear) return [];

    const fyStartYear = priorFY - 1; // FY2025 starts Jul 2024, so fyStartYear = 2024
    const comparison: MonthlyComparison[] = [];

    // Check if we have actual monthly data or need to derive from seasonality
    const hasMonthlyData = Object.keys(priorYear.revenue.byMonth || {}).length > 0;

    const yearStartMonth = DEFAULT_YEAR_START_MONTH;
    for (let i = 0; i < 12; i++) {
      const month = ((yearStartMonth - 1 + i) % 12) + 1;
      const year = month >= yearStartMonth ? fyStartYear : fyStartYear + 1;
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      const currentYearKey = `${year + 1}-${String(month).padStart(2, '0')}`;

      // Use actual monthly data if available, otherwise derive from seasonality pattern
      const priorRevenue = hasMonthlyData
        ? (priorYear.revenue.byMonth[monthKey] || 0)
        : Math.round(priorYear.revenue.total * (priorYear.seasonalityPattern[i] || 8.33) / 100);
      const currentRevenue = currentYTD?.revenue_by_month?.[currentYearKey] ?? null;

      // COGS by month
      const hasCogsMonthlyData = Object.keys(priorYear.cogs.byMonth || {}).length > 0;
      const priorCogs = hasCogsMonthlyData
        ? (priorYear.cogs.byMonth[monthKey] || 0)
        : (priorYear.revenue.total > 0 ? Math.round(priorRevenue * (priorYear.cogs.percentOfRevenue / 100)) : 0);
      const currentCogs = currentYTD?.cogs_by_month?.[currentYearKey] ?? null;

      // Calculate GP and NP for prior year (simplified - would need more detailed data)
      const priorGP = priorYear.grossProfit.percent;
      const priorNP = priorYear.revenue.total > 0
        ? ((priorYear.grossProfit.total - priorYear.opex.total) / priorYear.revenue.total) * 100
        : 0;

      const currentGP = currentYTD?.gross_margin_percent ?? null;
      const currentNP = currentYTD?.net_margin_percent ?? null;

      comparison.push({
        month: monthKey,
        monthLabel: MONTHS[i],
        priorRevenue,
        currentRevenue,
        priorCogs,
        currentCogs,
        priorGP,
        currentGP,
        priorNP,
        currentNP,
        revenueVariance: currentRevenue !== null && priorRevenue > 0
          ? ((currentRevenue - priorRevenue) / priorRevenue) * 100
          : null,
      });
    }

    return comparison;
  };

  // No data flow - show accounting package selection
  if (!priorYear || priorYear.revenue.total === 0) {
    const selectedPkgInfo = ACCOUNTING_PACKAGES.find(p => p.id === selectedPackage);

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Import Prior Year Data</h3>
              <p className="text-gray-600">
                To build an accurate forecast, we need to understand your business's historical performance.
                This data will be used to identify trends, seasonality, and key insights.
              </p>
            </div>
          </div>
        </div>

        {/* Package Selection */}
        {!selectedPackage && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Which accounting software do you use?</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {ACCOUNTING_PACKAGES.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPackage(pkg.id)}
                  className="flex flex-col items-center justify-center p-4 bg-white border border-gray-200 rounded-xl hover:border-brand-navy hover:bg-brand-navy/5 transition-all"
                >
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-2">
                    <span className="text-xl font-bold text-gray-400">
                      {pkg.name.charAt(0)}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{pkg.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Instructions for selected package */}
        {selectedPkgInfo && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <span className="text-lg font-bold text-gray-500">{selectedPkgInfo.name.charAt(0)}</span>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">{selectedPkgInfo.name} Export Instructions</h4>
                  <p className="text-sm text-gray-500">Follow these steps to export your P&L data</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPackage(null)}
                className="text-sm text-brand-navy hover:underline"
              >
                Change
              </button>
            </div>

            <div className="p-6">
              <ol className="space-y-3 mb-6">
                {selectedPkgInfo.instructions.map((instruction, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-brand-navy/10 text-brand-navy rounded-full flex items-center justify-center text-sm font-medium">
                      {idx + 1}
                    </span>
                    <span className="text-gray-700">{instruction}</span>
                  </li>
                ))}
              </ol>

              {selectedPkgInfo.exportUrl && (
                <a
                  href={selectedPkgInfo.exportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-brand-navy hover:underline mb-6"
                >
                  Open {selectedPkgInfo.name} Reports
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}

              {/* File Upload Area */}
              <div className="mt-6">
                {!parsedData ? (
                  <label className="block">
                    <div
                      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                        isUploading
                          ? 'border-brand-navy bg-brand-navy/5'
                          : uploadError
                            ? 'border-red-300 bg-red-50'
                            : 'border-gray-300 hover:border-brand-navy hover:bg-brand-navy/5'
                      }`}
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-10 h-10 text-brand-navy mx-auto mb-3 animate-spin" />
                          <p className="font-medium text-gray-900 mb-1">Parsing {uploadedFileName}...</p>
                          <p className="text-sm text-gray-500">Analyzing your P&L data</p>
                        </>
                      ) : uploadError ? (
                        <>
                          <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
                          <p className="font-medium text-red-700 mb-1">Failed to parse file</p>
                          <p className="text-sm text-red-600 mb-3">{uploadError}</p>
                          <p className="text-sm text-gray-500">Click to try a different file</p>
                        </>
                      ) : (
                        <>
                          <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                          <p className="font-medium text-gray-900 mb-1">Upload your P&L export</p>
                          <p className="text-sm text-gray-500">Drag & drop or click to browse (CSV, XLS, XLSX)</p>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      accept=".csv,.xls,.xlsx"
                      className="hidden"
                      disabled={isUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleFileUpload(file);
                        }
                      }}
                    />
                  </label>
                ) : (
                  // Parsed Data Preview
                  <div className="bg-green-50 border border-green-200 rounded-xl overflow-hidden">
                    <div className="px-6 py-4 bg-green-100 border-b border-green-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileCheck className="w-5 h-5 text-green-600" />
                        <div>
                          <p className="font-medium text-green-800">File parsed successfully</p>
                          <p className="text-sm text-green-600">{uploadedFileName}</p>
                        </div>
                      </div>
                      <button
                        onClick={handleCancelParsedData}
                        className="text-sm text-green-700 hover:text-green-900"
                      >
                        Upload different file
                      </button>
                    </div>

                    {uploadWarnings.length > 0 && (
                      <div className="px-6 py-3 bg-amber-50 border-b border-green-200">
                        {uploadWarnings.map((warning, idx) => (
                          <p key={idx} className="text-sm text-amber-700 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {warning}
                          </p>
                        ))}
                      </div>
                    )}

                    <div className="p-6">
                      <h4 className="text-sm font-medium text-gray-700 mb-4">Extracted Data Summary</h4>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white rounded-lg p-3 border border-green-200">
                          <p className="text-xs text-gray-500 mb-1">Total Revenue</p>
                          <p className="text-lg font-semibold text-gray-900">{formatCurrency(parsedData.revenue.total)}</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-green-200">
                          <p className="text-xs text-gray-500 mb-1">Gross Profit</p>
                          <p className="text-lg font-semibold text-green-600">{formatCurrency(parsedData.grossProfit.total)}</p>
                          <p className="text-xs text-gray-500">{formatPercent(parsedData.grossProfit.percent)} margin</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-green-200">
                          <p className="text-xs text-gray-500 mb-1">Operating Expenses</p>
                          <p className="text-lg font-semibold text-gray-900">{formatCurrency(parsedData.opex.total)}</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-green-200">
                          <p className="text-xs text-gray-500 mb-1">Net Profit</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {formatCurrency(parsedData.grossProfit.total - parsedData.opex.total)}
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-end gap-3">
                        <button
                          onClick={handleCancelParsedData}
                          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleConfirmParsedData}
                          className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Use This Data
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Skip Option */}
        <div className="flex justify-end">
          {!showSkipConfirm ? (
            <button
              onClick={() => setShowSkipConfirm(true)}
              className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm"
            >
              <SkipForward className="w-4 h-4" />
              Skip this step
            </button>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center gap-4">
              <p className="text-sm text-gray-600">
                Skipping will use industry benchmarks instead of your actual data. This reduces forecast accuracy.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSkipConfirm(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={() => actions.nextStep()}
                  className="px-3 py-1.5 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800"
                >
                  Yes, Skip
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Data loaded - show analysis view
  const monthlyData = buildMonthlyComparison();
  const otherIncome = priorYear.otherIncome?.total || 0;
  const otherExpenses = priorYear.otherExpenses?.total || 0;
  const netProfit = priorYear.grossProfit.total - priorYear.opex.total + otherIncome - otherExpenses;
  const netProfitPct = priorYear.revenue.total > 0 ? (netProfit / priorYear.revenue.total) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Phase 67 Tier B — consolidated-member badge. Renders only when >1
          active tenant; annotates non-AUD tenants with FX. Prevents the
          IICT-style "phantom mismatch" trap where the operator reconciles
          against an external report whose consolidation membership differs. */}
      <ConsolidatedMembersBadge businessId={businessId} />
      {/* Phase 67-04 — when any month's foreign-currency tenant lacks an
          fx_rates entry, the engine reports it and the cell stays untranslated.
          Banner explains the gap and links to /admin/consolidation to add the
          rate. Single-tenant / all-AUD businesses never populate this list. */}
      <FXRateMissingBanner
        missingRates={missingFxRates}
        onAddRate={() => { window.open('/admin/consolidation', '_blank'); }}
      />
      {/* D-44.2-02 — read-path data integrity banner. Renders nothing when verified.
          Suppress 'no_sync' when actuals are already loaded — the API returns
          'no_sync' if xero_connections.is_active is false or sync_jobs is in
          'running'/unknown, but xero_pl_lines may still hold last-good data.
          Telling the coach to "Connect Xero" when YTD is visibly populated is
          contradictory; partial / failed / stale still fire correctly.

          Issue B (hotfix step2-secondaries) — when pl-summary returns a
          `lookup_error` (dual-id desync, see useState comment above), DO NOT
          suppress no_sync. The cached YTD is stale relative to the live Xero
          state because we couldn't talk to the connection at all; surfacing
          the banner alongside the toast gives the operator a recovery path
          (refresh / reconnect) instead of pretending everything is fine. */}
      <DataIntegrityBanner
        quality={
          dataQuality === 'no_sync' &&
          (currentYTD?.months_count ?? 0) > 0 &&
          !lookupError
            ? 'verified'
            : dataQuality
        }
        perTenantQuality={perTenantQuality}
        lastSyncAt={perTenantQuality[0]?.last_sync_at ?? null}
      />

      {/* Reconciliation drift banner — Hotfix Part 2.
          Surfaces when priorYear totals (fresh from Xero) diverge from the
          line-array sums (stale, snapshotted at forecast creation). See the
          driftAnalysis useMemo above for source-of-truth fields per category. */}
      {driftAnalysis?.hasDrift && !driftBannerDismissed && (
        <div
          role="alert"
          aria-label="Reconciliation drift warning"
          className="bg-amber-50 border border-amber-300 rounded-xl p-4"
          data-testid="drift-banner"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">
                Your line items don&apos;t match current Xero totals.
              </p>
              <p className="text-sm text-amber-800 mt-1">
                Step 2 banners show the latest Xero figures, but the line items used in Steps 5 and 6 are based on the data when this forecast was first created. Click <span className="font-semibold">&ldquo;Refresh from Xero&rdquo;</span> above to update line items, or keep your customizations as-is.
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-amber-900">
                {driftAnalysis.revenue.drift && (
                  <li data-testid="drift-row-revenue">
                    Revenue: Xero shows {formatCurrency(driftAnalysis.revenue.xero)}, line items sum to {formatCurrency(driftAnalysis.revenue.lines)} (drift {formatCurrency(driftAnalysis.revenue.delta)})
                  </li>
                )}
                {driftAnalysis.cogs.drift && (
                  <li data-testid="drift-row-cogs">
                    Cost of Sales: Xero shows {formatCurrency(driftAnalysis.cogs.xero)}, line items sum to {formatCurrency(driftAnalysis.cogs.lines)} (drift {formatCurrency(driftAnalysis.cogs.delta)})
                  </li>
                )}
                {driftAnalysis.opex.drift && (
                  <li data-testid="drift-row-opex">
                    Operating Expenses: Xero shows {formatCurrency(driftAnalysis.opex.xero)}, line items sum to {formatCurrency(driftAnalysis.opex.lines)} (drift {formatCurrency(driftAnalysis.opex.delta)})
                  </li>
                )}
              </ul>
            </div>
            <button
              onClick={() => setDriftBannerDismissed(true)}
              className="flex-shrink-0 text-amber-700 hover:text-amber-900 transition-colors"
              aria-label="Dismiss drift warning"
              data-testid="drift-banner-dismiss"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Header with guidance */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">Review Your Starting Point</h3>
            <p className="text-sm text-gray-600 mt-1 mb-4">
              Before building your forecast, let's make sure we understand where you're coming from.
              Check the numbers look right, flag any one-off expenses that shouldn't repeat, and review the insights.
            </p>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Check numbers are correct</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <Flag className="w-4 h-4 text-amber-500" />
                <span>Flag one-off expenses</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <Sparkles className="w-4 h-4 text-purple-500" />
                <span>Review insights, then confirm</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Refresh from Xero — operator-controlled override.
          Hotfix (regression from PR #136): the always-on refresh now preserves
          customizations, so when Xero data drifts the line arrays go stale.
          This button lets the operator deliberately reset customizations and
          re-pull from current Xero. See handleRefreshFromXero comments above. */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-gray-500">
          Showing prior-year totals from Xero. Line items in Steps 3, 5, and 6 are kept as you customized them.
        </span>
        <button
          onClick={handleRefreshFromXero}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isRefreshing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {isRefreshing ? 'Refreshing…' : 'Refresh from Xero'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500 mb-1">Revenue</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(priorYear.revenue.total)}</p>
          {currentYTD && (
            <p className="text-xs text-gray-500 mt-1">
              YTD: {formatCurrency(currentYTD.total_revenue)}
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500 mb-1">Cost of Sales</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(priorYear.cogs.total)}</p>
          <p className="text-xs text-gray-500 mt-1">
            {formatPercent(priorYear.cogs.percentOfRevenue)} of revenue
          </p>
          {currentYTD?.total_cogs != null && (
            <p className="text-xs text-gray-500">
              YTD: {formatCurrency(currentYTD.total_cogs)}
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500 mb-1">Gross Profit</p>
          <p className="text-2xl font-bold text-green-600">{formatPercent(priorYear.grossProfit.percent)}</p>
          <p className="text-xs text-gray-500 mt-1">{formatCurrency(priorYear.grossProfit.total)}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500 mb-1">Net Profit</p>
          <p className={`text-2xl font-bold ${netProfitPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatPercent(netProfitPct)}
          </p>
          <p className="text-xs text-gray-500 mt-1">{formatCurrency(netProfit)}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500 mb-1">Operating Expenses</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(priorYear.opex.total)}</p>
          <p className="text-xs text-gray-500 mt-1">
            {formatPercent((priorYear.opex.total / priorYear.revenue.total) * 100)} of revenue
          </p>
        </div>
      </div>

      {/* Monthly P&L Performance — Tabbed View */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Monthly Performance</h3>
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setPerformanceTab('prior')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                performanceTab === 'prior'
                  ? 'border-brand-orange text-brand-orange'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Prior Year (FY{priorFY})
            </button>
            <button
              onClick={() => setPerformanceTab('current')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                performanceTab === 'current'
                  ? 'border-brand-orange text-brand-orange'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Current Year (FY{currentYearFY} YTD)
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase" style={{ minWidth: '140px' }}>Metric</th>
                {MONTHS.map((month) => (
                  <th key={month} className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase" style={{ minWidth: '80px' }}>
                    {month}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase" style={{ minWidth: '100px' }}>Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {performanceTab === 'prior' ? (
                <>
                  {/* Prior Year Revenue */}
                  <tr>
                    <td className="px-4 py-2 text-sm font-medium text-gray-700">Revenue</td>
                    {monthlyData.map((m, idx) => (
                      <td key={idx} className="px-3 py-2 text-sm text-gray-900 text-right">
                        {m.priorRevenue > 0 ? formatCurrency(m.priorRevenue) : '-'}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                      {formatCurrency(priorYear.revenue.total)}
                    </td>
                  </tr>
                  {/* Prior Year COGS */}
                  <tr className="bg-gray-50">
                    <td className="px-4 py-2 text-sm font-medium text-gray-700">Cost of Sales</td>
                    {monthlyData.map((m, idx) => (
                      <td key={idx} className="px-3 py-2 text-sm text-gray-900 text-right">
                        {m.priorCogs > 0 ? formatCurrency(m.priorCogs) : '-'}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                      {formatCurrency(priorYear.cogs.total)}
                    </td>
                  </tr>
                  {/* Prior Year Gross Profit */}
                  <tr className="border-t-2 border-gray-300">
                    <td className="px-4 py-2 text-sm font-semibold text-green-700">Gross Profit</td>
                    {monthlyData.map((m, idx) => {
                      const gp = m.priorRevenue - m.priorCogs;
                      return (
                        <td key={idx} className="px-3 py-2 text-sm font-medium text-green-700 text-right">
                          {gp !== 0 ? formatCurrency(gp) : '-'}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-sm font-bold text-green-700 text-right">
                      {formatCurrency(priorYear.grossProfit.total)} <span className="font-normal text-gray-500 text-xs">({formatPercent(priorYear.grossProfit.percent)})</span>
                    </td>
                  </tr>
                  {/* Prior Year OpEx */}
                  <tr className="bg-gray-50">
                    <td className="px-4 py-2 text-sm font-medium text-gray-700">Operating Expenses</td>
                    {monthlyData.map((m, idx) => {
                      const opex = (priorYear.opex.byMonth[m.month] || 0);
                      return (
                        <td key={idx} className="px-3 py-2 text-sm text-gray-900 text-right">
                          {opex > 0 ? formatCurrency(opex) : '-'}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                      {formatCurrency(priorYear.opex.total)}
                    </td>
                  </tr>
                  {/* Prior Year Other Income */}
                  {otherIncome > 0 && (
                    <tr>
                      <td className="px-4 py-2 text-sm font-medium text-gray-700">Other Income</td>
                      {monthlyData.map((m, idx) => {
                        const val = priorYear.otherIncome?.byMonth[m.month] || 0;
                        return (
                          <td key={idx} className="px-3 py-2 text-sm text-gray-900 text-right">
                            {val > 0 ? formatCurrency(val) : '-'}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                        {formatCurrency(otherIncome)}
                      </td>
                    </tr>
                  )}
                  {/* Prior Year Other Expenses */}
                  {otherExpenses > 0 && (
                    <tr className="bg-gray-50">
                      <td className="px-4 py-2 text-sm font-medium text-gray-700">Other Expenses</td>
                      {monthlyData.map((m, idx) => {
                        const val = priorYear.otherExpenses?.byMonth[m.month] || 0;
                        return (
                          <td key={idx} className="px-3 py-2 text-sm text-gray-900 text-right">
                            {val > 0 ? formatCurrency(val) : '-'}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                        {formatCurrency(otherExpenses)}
                      </td>
                    </tr>
                  )}
                  {/* Prior Year Net Profit */}
                  <tr className="border-t-2 border-gray-300">
                    <td className="px-4 py-2 text-sm font-semibold text-gray-900">Net Profit</td>
                    {monthlyData.map((m, idx) => {
                      const gp = m.priorRevenue - m.priorCogs;
                      const opex = (priorYear.opex.byMonth[m.month] || 0);
                      const oi = (priorYear.otherIncome?.byMonth[m.month] || 0);
                      const oe = (priorYear.otherExpenses?.byMonth[m.month] || 0);
                      const np = gp - opex + oi - oe;
                      return (
                        <td key={idx} className={`px-3 py-2 text-sm font-medium text-right ${np >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {(m.priorRevenue > 0 || np !== 0) ? formatCurrency(np) : '-'}
                        </td>
                      );
                    })}
                    <td className={`px-4 py-2 text-sm font-bold text-right ${netProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {formatCurrency(netProfit)} <span className="font-normal text-gray-500 text-xs">({formatPercent(netProfitPct)})</span>
                    </td>
                  </tr>
                </>
              ) : (
                <>
                  {/* Current Year Revenue */}
                  <tr>
                    <td className="px-4 py-2 text-sm font-medium text-gray-700">Revenue</td>
                    {monthlyData.map((m, idx) => {
                      const val = currentYTD?.revenue_by_month?.[m.month.replace(/^\d{4}/, String(currentYearFY - 1 + (parseInt(m.month.split('-')[1]) < 7 ? 1 : 0)))] ?? null;
                      return (
                        <td key={idx} className="px-3 py-2 text-sm text-right">
                          {val !== null ? <span className="text-gray-900">{formatCurrency(val)}</span> : <span className="text-gray-300">&mdash;</span>}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                      {currentYTD ? formatCurrency(currentYTD.total_revenue) : '-'}
                    </td>
                  </tr>
                  {/* Current Year COGS */}
                  <tr className="bg-gray-50">
                    <td className="px-4 py-2 text-sm font-medium text-gray-700">Cost of Sales</td>
                    {monthlyData.map((m, idx) => {
                      const currentMonthKey = m.month.replace(/^\d{4}/, String(currentYearFY - 1 + (parseInt(m.month.split('-')[1]) < 7 ? 1 : 0)));
                      const val = currentYTD?.cogs_by_month?.[currentMonthKey] ?? null;
                      return (
                        <td key={idx} className="px-3 py-2 text-sm text-right">
                          {val !== null ? <span className="text-gray-900">{formatCurrency(val)}</span> : <span className="text-gray-300">&mdash;</span>}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                      {currentYTD?.total_cogs != null ? formatCurrency(currentYTD.total_cogs) : '-'}
                    </td>
                  </tr>
                  {/* Current Year Gross Profit */}
                  <tr className="border-t-2 border-gray-300">
                    <td className="px-4 py-2 text-sm font-semibold text-green-700">Gross Profit</td>
                    {monthlyData.map((m, idx) => {
                      const currentMonthKey = m.month.replace(/^\d{4}/, String(currentYearFY - 1 + (parseInt(m.month.split('-')[1]) < 7 ? 1 : 0)));
                      const rev = currentYTD?.revenue_by_month?.[currentMonthKey] ?? null;
                      const cogs = currentYTD?.cogs_by_month?.[currentMonthKey] ?? null;
                      const gp = rev !== null && cogs !== null ? rev - cogs : null;
                      return (
                        <td key={idx} className="px-3 py-2 text-sm font-medium text-right">
                          {gp !== null ? <span className="text-green-700">{formatCurrency(gp)}</span> : <span className="text-gray-300">&mdash;</span>}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-sm font-bold text-green-700 text-right">
                      {currentYTD ? (
                        <>{formatCurrency((currentYTD.total_revenue || 0) - (currentYTD.total_cogs || 0))} <span className="font-normal text-gray-500 text-xs">({formatPercent(currentYTD.gross_margin_percent || 0)})</span></>
                      ) : '-'}
                    </td>
                  </tr>
                  {/* Current Year OpEx */}
                  <tr className="bg-gray-50">
                    <td className="px-4 py-2 text-sm font-medium text-gray-700">Operating Expenses</td>
                    {monthlyData.map((m, idx) => {
                      const currentMonthKey = m.month.replace(/^\d{4}/, String(currentYearFY - 1 + (parseInt(m.month.split('-')[1]) < 7 ? 1 : 0)));
                      const val = (currentYTD as any)?.opex_by_month?.[currentMonthKey] ?? null;
                      return (
                        <td key={idx} className="px-3 py-2 text-sm text-right">
                          {val !== null ? <span className="text-gray-900">{formatCurrency(val)}</span> : <span className="text-gray-300">&mdash;</span>}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                      {(currentYTD as any)?.operating_expenses != null ? formatCurrency((currentYTD as any).operating_expenses) : '-'}
                    </td>
                  </tr>
                  {/* Current Year Net Profit */}
                  <tr className="border-t-2 border-gray-300">
                    <td className="px-4 py-2 text-sm font-semibold text-gray-900">Net Profit</td>
                    {monthlyData.map((m, idx) => {
                      const currentMonthKey = m.month.replace(/^\d{4}/, String(currentYearFY - 1 + (parseInt(m.month.split('-')[1]) < 7 ? 1 : 0)));
                      const rev = currentYTD?.revenue_by_month?.[currentMonthKey] ?? null;
                      const cogs = currentYTD?.cogs_by_month?.[currentMonthKey] ?? null;
                      const opex = (currentYTD as any)?.opex_by_month?.[currentMonthKey] ?? null;
                      const np = rev !== null ? (rev - (cogs || 0) - (opex || 0)) : null;
                      return (
                        <td key={idx} className={`px-3 py-2 text-sm font-medium text-right`}>
                          {np !== null ? <span className={np >= 0 ? 'text-green-700' : 'text-red-600'}>{formatCurrency(np)}</span> : <span className="text-gray-300">&mdash;</span>}
                        </td>
                      );
                    })}
                    <td className={`px-4 py-2 text-sm font-bold text-right ${(currentYTD?.net_margin_percent || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {currentYTD ? (
                        <>{formatCurrency((currentYTD as any)?.net_profit || ((currentYTD.total_revenue || 0) - (currentYTD.total_cogs || 0) - ((currentYTD as any)?.operating_expenses || 0)))} <span className="font-normal text-gray-500 text-xs">({formatPercent(currentYTD.net_margin_percent || 0)})</span></>
                      ) : '-'}
                    </td>
                  </tr>
                  {/* Run Rate */}
                  {currentYTD && currentYTD.months_count > 0 && (
                    <tr className="bg-blue-50 border-t-2 border-blue-200">
                      <td className="px-4 py-2 text-sm font-semibold text-blue-700">Annualised Run Rate</td>
                      <td colSpan={12} className="px-3 py-2 text-sm text-blue-700 text-center">
                        Based on {currentYTD.months_count} months of actuals
                      </td>
                      <td className="px-4 py-2 text-sm font-bold text-blue-700 text-right">
                        {formatCurrency((currentYTD as any)?.run_rate_revenue || (currentYTD.total_revenue / currentYTD.months_count * 12))}
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Seasonality Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Revenue Seasonality</h3>
        <p className="text-sm text-gray-500 mb-4">
          This pattern will be used to distribute your forecast revenue across the year.
        </p>

        {(() => {
          const maxPct = Math.max(...priorYear.seasonalityPattern);
          const totalRevenue = priorYear.revenue.total;
          const yAxisMax = Math.ceil((maxPct / 100) * totalRevenue / 25000) * 25000;

          return (
            <div className="flex items-end gap-1" style={{ height: '160px' }}>
              {priorYear.seasonalityPattern.map((pct, idx) => {
                const monthValue = (pct / 100) * totalRevenue;
                const heightPx = Math.max(4, (monthValue / yAxisMax) * 160);
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center justify-end">
                    <div
                      className="w-full bg-brand-navy/80 rounded-t transition-all hover:bg-brand-navy cursor-pointer group relative"
                      style={{ height: `${heightPx}px` }}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                        {formatCurrency(monthValue)} ({pct.toFixed(1)}%)
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">{MONTHS[idx]}</div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        <div className="mt-4 flex justify-between text-sm text-gray-500">
          <div>
            Peak: <span className="font-medium text-gray-900">{MONTHS[priorYear.seasonalityPattern.indexOf(Math.max(...priorYear.seasonalityPattern))]}</span>
          </div>
          <div>
            Low: <span className="font-medium text-gray-900">{MONTHS[priorYear.seasonalityPattern.indexOf(Math.min(...priorYear.seasonalityPattern))]}</span>
          </div>
        </div>
      </div>

      {/* AI Insights Section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-gray-900">Key Insights</h3>
          </div>
          {isLoadingInsights && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analyzing...</span>
            </div>
          )}
        </div>

        <div className="p-4">
          {insights.length === 0 && !isLoadingInsights ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No insights available.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
              {insights.map((insight) => {
                const categoryStyles = {
                  positive: {
                    border: 'border-green-200',
                    headerBg: 'bg-green-50',
                    icon: '✅',
                    iconBg: 'bg-green-100',
                    metricColor: 'text-green-700',
                  },
                  warning: {
                    border: 'border-amber-200',
                    headerBg: 'bg-amber-50',
                    icon: '⚠️',
                    iconBg: 'bg-amber-100',
                    metricColor: 'text-amber-700',
                  },
                  neutral: {
                    border: 'border-gray-200',
                    headerBg: 'bg-gray-50',
                    icon: 'ℹ️',
                    iconBg: 'bg-gray-100',
                    metricColor: 'text-gray-700',
                  },
                };
                const styles = categoryStyles[insight.category];

                return (
                  <div
                    key={insight.id}
                    className={`rounded-xl border ${styles.border} overflow-hidden flex flex-col`}
                  >
                    {/* Header with metric */}
                    <div className={`px-4 py-3 ${styles.headerBg} border-b ${styles.border}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-base">{styles.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900">
                              {insight.headline}
                            </span>
                            {insight.metricValue && (
                              <span className={`text-lg font-bold ${styles.metricColor}`}>
                                {insight.metricValue}
                              </span>
                            )}
                          </div>
                          {insight.metricContext && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {insight.metricContext}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="px-4 py-3 bg-white flex-1 flex flex-col">
                      {/* Observation (if present) */}
                      {insight.observation && (
                        <div className="flex items-start gap-2 mb-2">
                          <span className="text-sm mt-0.5">🔍</span>
                          <p className="text-sm text-gray-700 leading-snug">
                            {insight.observation}
                          </p>
                        </div>
                      )}

                      {/* Implication */}
                      <div className="flex items-start gap-2 mb-3">
                        <span className="text-sm mt-0.5">💡</span>
                        <p className="text-sm text-gray-600 leading-snug">
                          {insight.implication}
                        </p>
                      </div>

                      {/* Question */}
                      <div className="flex items-start gap-2 mt-auto pt-2 border-t border-gray-100">
                        <span className="text-sm mt-0.5">❓</span>
                        <p className="text-sm text-gray-700 font-medium italic leading-snug">
                          {insight.question}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
          <p className="text-xs text-gray-500 italic">
            These insights are for discussion purposes only and do not constitute financial advice.
          </p>
        </div>
      </div>

      {/* Top Expenses */}
      {priorYear.opex.byLine.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Top Operating Expenses</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Annual Total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">% of OpEx</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monthly Avg</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-20">Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {priorYear.opex.byLine.slice(0, 10).map((line) => {
                  const hasAnomaly = anomalies.some(a => a.lineId === line.id);
                  return (
                    <tr key={line.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{line.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(line.total)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 text-right">
                        {formatPercent((line.total / priorYear.opex.total) * 100)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 text-right">{formatCurrency(line.monthlyAvg)}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => {
                            if (hasAnomaly) {
                              removeAnomaly(line.id);
                            } else {
                              addAnomaly(line.id, line.name, 'one-off', 'Contains one-off expense');
                            }
                          }}
                          className={`p-1.5 rounded transition-colors ${
                            hasAnomaly
                              ? 'bg-amber-100 text-amber-600'
                              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                          }`}
                          title={hasAnomaly ? 'Remove flag' : 'Flag as containing one-off expense'}
                        >
                          <Flag className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Flagged Anomalies Summary */}
      {anomalies.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h4 className="text-sm font-medium text-amber-800 mb-2">Flagged Items ({anomalies.length})</h4>
          <ul className="text-sm text-amber-700 space-y-1">
            {anomalies.map((a) => (
              <li key={a.lineId} className="flex items-center gap-2">
                <Flag className="w-3 h-3" />
                <span>{a.lineName}</span>
                <span className="text-amber-600">- {a.note}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-600 mt-2">
            Flagged items will be normalized when calculating your forecast baseline.
          </p>
        </div>
      )}

      {/* Baseline confirmation note */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-gray-900">
              This data will be used as your forecasting baseline
            </p>
            <p className="text-sm text-gray-500 mt-1">
              The data, patterns, and any flagged anomalies above will inform your FY{fiscalYear} forecast.
              Click "Continue" to proceed to the next step.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
