'use client';

import { useState, useCallback, useEffect } from 'react';
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
  Sparkles
} from 'lucide-react';
import { ForecastWizardState, WizardActions, formatCurrency, formatPercent, PriorYearData } from '../types';
import { parsePLFile } from '../utils/parsePLFile';

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

const MONTHS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

export function Step2PriorYear({ state, actions, fiscalYear, businessId }: Step2PriorYearProps) {
  const { priorYear } = state;
  const priorFY = fiscalYear - 1;

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
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [insightsLoaded, setInsightsLoaded] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [dataHash, setDataHash] = useState<string | null>(null);

  // Current YTD data (would come from API in real implementation)
  const [currentYTD, setCurrentYTD] = useState<{
    revenue_by_month: Record<string, number>;
    total_revenue: number;
    gross_margin_percent: number;
    net_margin_percent: number;
    months_count: number;
  } | null>(null);

  // Load current YTD data
  useEffect(() => {
    if (priorYear && businessId) {
      loadCurrentYTD();
    }
  }, [priorYear, businessId]);

  const loadCurrentYTD = async () => {
    try {
      const response = await fetch(`/api/Xero/pl-summary?business_id=${businessId}&fiscal_year=${fiscalYear}`);
      if (response.ok) {
        const data = await response.json();
        if (data.summary?.current_ytd) {
          setCurrentYTD(data.summary.current_ytd);
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

  // Load saved insights or generate new ones
  useEffect(() => {
    if (priorYear && priorYear.revenue.total > 0 && !insightsLoaded) {
      loadOrGenerateInsights();
    }
  }, [priorYear, insightsLoaded]);

  const loadOrGenerateInsights = async () => {
    if (!priorYear) return;

    setIsLoadingInsights(true);
    const currentHash = generateDataHash(priorYear);

    try {
      // First, try to load saved insights
      const loadResponse = await fetch(
        `/api/ai/forecast-insights?business_id=${businessId}&fiscal_year=${fiscalYear}`
      );

      if (loadResponse.ok) {
        const savedData = await loadResponse.json();

        // Check if we have saved insights and data hasn't changed
        if (savedData.insights && savedData.insights.length > 0 && savedData.dataHash === currentHash) {
          setInsights(savedData.insights.slice(0, 4)); // Limit to 4 for 2x2 grid
          setDataHash(currentHash);
          setInsightsLoaded(true);
          setIsLoadingInsights(false);
          return;
        }
      }

      // No saved insights or data changed - generate new ones
      await generateAndSaveInsights(currentHash);
    } catch (error) {
      console.error('Failed to load insights:', error);
      // Fall back to placeholder insights
      setInsights(generatePlaceholderInsights());
      setInsightsLoaded(true);
    } finally {
      setIsLoadingInsights(false);
    }
  };

  const generateAndSaveInsights = async (hash: string) => {
    try {
      const response = await fetch('/api/ai/forecast-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          fiscal_year: fiscalYear,
          prior_year: priorYear,
          current_ytd: currentYTD,
          save: true, // Tell API to save the insights
          dataHash: hash,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const newInsights = (data.insights || generatePlaceholderInsights()).slice(0, 4);
        setInsights(newInsights);
        setDataHash(hash);
      } else {
        // Generate placeholder insights if API fails
        setInsights(generatePlaceholderInsights().slice(0, 4));
      }
    } catch (error) {
      console.error('Failed to generate AI insights:', error);
      setInsights(generatePlaceholderInsights().slice(0, 4));
    } finally {
      setInsightsLoaded(true);
    }
  };

  const generatePlaceholderInsights = (): AIInsight[] => {
    if (!priorYear) return [];

    const insights: AIInsight[] = [];
    const gpPercent = priorYear.grossProfit.percent;
    const netProfit = priorYear.grossProfit.total - priorYear.opex.total;
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

    const fyStartYear = fiscalYear - 2; // For FY25, prior year starts Jul 2023
    const comparison: MonthlyComparison[] = [];

    for (let i = 0; i < 12; i++) {
      const month = ((6 + i) % 12) + 1; // Jul=7, Aug=8, ..., Jun=6
      const year = month >= 7 ? fyStartYear : fyStartYear + 1;
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      const currentYearKey = `${year + 1}-${String(month).padStart(2, '0')}`;

      const priorRevenue = priorYear.revenue.byMonth[monthKey] || 0;
      const currentRevenue = currentYTD?.revenue_by_month?.[currentYearKey] ?? null;

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
  const netProfit = priorYear.grossProfit.total - priorYear.opex.total;
  const netProfitPct = priorYear.revenue.total > 0 ? (netProfit / priorYear.revenue.total) * 100 : 0;

  return (
    <div className="space-y-6">
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

      {/* Monthly Comparison Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Monthly Performance</h3>
          <button
            onClick={() => setShowDetailedView(!showDetailedView)}
            className="flex items-center gap-1 text-sm text-brand-navy hover:underline"
          >
            {showDetailedView ? 'Show Summary' : 'Show Details'}
            {showDetailedView ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metric</th>
                {MONTHS.map((month, idx) => (
                  <th key={month} className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase w-20">
                    {month}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* Prior Year Revenue */}
              <tr className="bg-gray-50">
                <td className="px-4 py-2 text-sm font-medium text-gray-700">FY{priorFY} Revenue</td>
                {monthlyData.map((m, idx) => (
                  <td key={idx} className="px-3 py-2 text-sm text-gray-900 text-right">
                    {m.priorRevenue > 0 ? formatCurrency(m.priorRevenue) : '-'}
                  </td>
                ))}
                <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                  {formatCurrency(priorYear.revenue.total)}
                </td>
              </tr>

              {/* Current YTD Revenue */}
              {currentYTD && (
                <tr>
                  <td className="px-4 py-2 text-sm font-medium text-gray-700">FY{fiscalYear} YTD</td>
                  {monthlyData.map((m, idx) => (
                    <td key={idx} className="px-3 py-2 text-sm text-right">
                      {m.currentRevenue !== null ? (
                        <span className="text-gray-900">{formatCurrency(m.currentRevenue)}</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                    {formatCurrency(currentYTD.total_revenue)}
                  </td>
                </tr>
              )}

              {/* Variance Row */}
              {currentYTD && (
                <tr className="bg-gray-50">
                  <td className="px-4 py-2 text-sm font-medium text-gray-700">YoY Variance</td>
                  {monthlyData.map((m, idx) => (
                    <td key={idx} className="px-3 py-2 text-sm text-right">
                      {m.revenueVariance !== null ? (
                        <span className={m.revenueVariance >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {m.revenueVariance >= 0 ? '+' : ''}{m.revenueVariance.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-sm font-semibold text-right">
                    {/* Calculate total variance */}
                  </td>
                </tr>
              )}

              {/* GP% Row */}
              {showDetailedView && (
                <tr>
                  <td className="px-4 py-2 text-sm font-medium text-gray-700">Gross Profit %</td>
                  {monthlyData.map((m, idx) => (
                    <td key={idx} className="px-3 py-2 text-sm text-gray-600 text-right">
                      {formatPercent(m.priorGP)}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                    {formatPercent(priorYear.grossProfit.percent)}
                  </td>
                </tr>
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

      {/* Confirmation */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 w-4 h-4 text-brand-navy rounded focus:ring-brand-navy"
          />
          <div>
            <p className="font-medium text-gray-900">
              This analysis looks correct - use as my forecasting baseline
            </p>
            <p className="text-sm text-gray-500 mt-1">
              The data, patterns, and any flagged anomalies above will be used to inform your FY{fiscalYear} forecast.
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
