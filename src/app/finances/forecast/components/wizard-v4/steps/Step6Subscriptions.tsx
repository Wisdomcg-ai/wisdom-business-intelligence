'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, CreditCard, AlertCircle, CheckCircle, Loader2, RefreshCw,
  ChevronDown, ChevronRight, Save, DollarSign, Calendar, TrendingUp
} from 'lucide-react';
import { ForecastWizardState, WizardActions, formatCurrency } from '../types';

interface Step6SubscriptionsProps {
  state: ForecastWizardState;
  actions: WizardActions;
  fiscalYear: number;
  businessId: string;
}

interface AccountOption {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  isSelected: boolean;
  isSuggested: boolean;
}

interface RecentTransaction {
  date: string;
  description: string;
  amount: number;
  source: 'invoice' | 'bank' | 'journal';
  period?: 'prior_fy' | 'current_fy';
}

interface VendorBudget {
  vendorName: string;
  vendorKey: string;
  suggestedFrequency: 'monthly' | 'quarterly' | 'annual' | 'ad-hoc';
  frequency: 'monthly' | 'quarterly' | 'annual' | 'ad-hoc';
  confidence: 'high' | 'medium' | 'low';
  totalAmount: number;
  avgAmount: number;
  transactionCount: number;
  // FY breakdown
  priorFYAmount: number;
  priorFYCount: number;
  currentFYAmount: number;
  currentFYCount: number;
  firstTransaction: string;
  lastTransaction: string;
  monthsSpan: number;
  suggestedMonthlyBudget: number;
  monthlyBudget: number;
  transactions: RecentTransaction[];
  isExpanded: boolean;
  isActive: boolean;
}

interface ReconciliationPeriod {
  analyzed: number;
  actual: number | null;
  variance: number | null;
  variancePercent: number | null;
  isReconciled: boolean;
}

interface AnalysisSummary {
  totalVendors: number;
  totalTransactions: number;
  totalAmount: number;
  priorFYTotal: number;
  currentFYTotal: number;
  suggestedMonthlyTotal: number;
  suggestedAnnualTotal: number;
  dateRange: {
    from: string;
    to: string;
    priorFY: { from: string; to: string };
    currentFY: { from: string; to: string };
  };
  accountsAnalyzed: string[];
  reconciliation?: {
    priorFY: ReconciliationPeriod;
    currentFY: ReconciliationPeriod;
  };
}

type Phase = 'select-accounts' | 'analyzing' | 'review';

const FREQUENCY_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
  { value: 'ad-hoc', label: 'Ad-hoc' },
];

const FREQUENCY_COLORS: Record<string, string> = {
  monthly: 'bg-green-100 text-green-700 border-green-200',
  quarterly: 'bg-purple-100 text-purple-700 border-purple-200',
  annual: 'bg-blue-100 text-blue-700 border-blue-200',
  'ad-hoc': 'bg-gray-100 text-gray-600 border-gray-200',
};

export function Step6Subscriptions({ state, actions, fiscalYear, businessId }: Step6SubscriptionsProps) {
  const [phase, setPhase] = useState<Phase>('select-accounts');
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [vendors, setVendors] = useState<VendorBudget[]>([]);
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Calculate current FY context
  const today = new Date();
  const currentMonth = today.getMonth(); // 0-11
  const fyStartMonth = 6; // July (0-indexed)
  const monthsElapsed = currentMonth >= fyStartMonth
    ? currentMonth - fyStartMonth + 1
    : 12 - fyStartMonth + currentMonth + 1;
  const monthsRemaining = 12 - monthsElapsed;

  // Calculate totals
  const totals = useMemo(() => {
    const activeVendors = vendors.filter(v => v.isActive);
    const totalHistorical = activeVendors.reduce((sum, v) => sum + v.totalAmount, 0);
    const totalPriorFY = activeVendors.reduce((sum, v) => sum + v.priorFYAmount, 0);
    const totalCurrentFY = activeVendors.reduce((sum, v) => sum + v.currentFYAmount, 0);
    const totalMonthlyBudget = activeVendors.reduce((sum, v) => sum + v.monthlyBudget, 0);
    const totalAnnualBudget = totalMonthlyBudget * 12;
    const remainingFYBudget = totalMonthlyBudget * monthsRemaining;

    return {
      historical: totalHistorical,
      priorFY: totalPriorFY,
      currentFY: totalCurrentFY,
      monthlyBudget: totalMonthlyBudget,
      annualBudget: totalAnnualBudget,
      remainingFY: remainingFYBudget,
      vendorCount: activeVendors.length,
      excludedCount: vendors.length - activeVendors.length,
    };
  }, [vendors, monthsRemaining]);

  // Load accounts on mount
  useEffect(() => {
    loadAccounts();
  }, [businessId]);

  const loadAccounts = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/Xero/chart-of-accounts?business_id=${businessId}&filter=subscription`);
      if (!response.ok) throw new Error('Failed to load accounts');

      const data = await response.json();

      const accountList: AccountOption[] = (data.accounts || []).map((acc: {
        accountId: string;
        accountCode: string;
        accountName: string;
        accountType: string;
        isSuggested: boolean;
      }) => ({
        accountId: acc.accountId,
        accountCode: acc.accountCode,
        accountName: acc.accountName,
        accountType: acc.accountType,
        isSelected: acc.isSuggested,
        isSuggested: acc.isSuggested,
      }));

      setAccounts(accountList);

      if (accountList.length === 0) {
        setError('No expense accounts found in your Xero Chart of Accounts.');
      }
    } catch (err) {
      console.error('Error loading accounts:', err);
      setError('Failed to load expense accounts from Xero.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAccountSelection = (accountId: string) => {
    setAccounts(prev => prev.map(acc =>
      acc.accountId === accountId ? { ...acc, isSelected: !acc.isSelected } : acc
    ));
  };

  const analyzeSubscriptions = async () => {
    const selectedAccounts = accounts.filter(acc => acc.isSelected);
    if (selectedAccounts.length === 0) {
      setError('Please select at least one account to analyze');
      return;
    }

    setPhase('analyzing');
    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch('/api/Xero/subscription-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          account_codes: selectedAccounts.map(acc => acc.accountCode),
        }),
      });

      if (!response.ok) throw new Error('Failed to analyze subscriptions');

      const data = await response.json();

      // Transform vendor data
      const vendorBudgets: VendorBudget[] = (data.vendors || []).map((v: any) => ({
        vendorName: v.vendorName,
        vendorKey: v.vendorKey,
        suggestedFrequency: v.suggestedFrequency,
        frequency: v.suggestedFrequency,
        confidence: v.confidence,
        totalAmount: v.totalAmount,
        avgAmount: v.avgAmount,
        transactionCount: v.transactionCount,
        // FY breakdown
        priorFYAmount: v.priorFYAmount || 0,
        priorFYCount: v.priorFYCount || 0,
        currentFYAmount: v.currentFYAmount || 0,
        currentFYCount: v.currentFYCount || 0,
        firstTransaction: v.firstTransaction,
        lastTransaction: v.lastTransaction,
        monthsSpan: v.monthsSpan,
        suggestedMonthlyBudget: v.suggestedMonthlyBudget,
        monthlyBudget: v.suggestedMonthlyBudget,
        transactions: v.transactions || [],
        isExpanded: false,
        isActive: true,
      }));

      setVendors(vendorBudgets);
      setSummary(data.summary);
      setPhase('review');

      if (vendorBudgets.length === 0) {
        setError(`Analyzed ${data.summary?.totalTransactions || 0} transactions but found no vendors. Check if transactions are coded to different accounts.`);
      }
    } catch (err) {
      console.error('Error analyzing subscriptions:', err);
      setError('Failed to analyze subscriptions. Please try again.');
      setPhase('select-accounts');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateVendor = (vendorKey: string, updates: Partial<VendorBudget>) => {
    setVendors(prev => prev.map(v =>
      v.vendorKey === vendorKey ? { ...v, ...updates } : v
    ));
  };

  const toggleVendorExpanded = (vendorKey: string) => {
    setVendors(prev => prev.map(v =>
      v.vendorKey === vendorKey ? { ...v, isExpanded: !v.isExpanded } : v
    ));
  };

  const toggleVendorActive = (vendorKey: string) => {
    setVendors(prev => prev.map(v =>
      v.vendorKey === vendorKey ? { ...v, isActive: !v.isActive } : v
    ));
  };

  const handleFrequencyChange = (vendorKey: string, newFrequency: VendorBudget['frequency']) => {
    setVendors(prev => prev.map(v => {
      if (v.vendorKey !== vendorKey) return v;

      // Recalculate monthly budget based on new frequency
      let newMonthlyBudget = v.monthlyBudget;
      if (newFrequency === 'annual') {
        newMonthlyBudget = v.totalAmount / 12;
      } else if (newFrequency === 'monthly') {
        newMonthlyBudget = v.avgAmount;
      } else if (newFrequency === 'quarterly') {
        newMonthlyBudget = v.avgAmount / 3;
      }

      return { ...v, frequency: newFrequency, monthlyBudget: Math.round(newMonthlyBudget * 100) / 100 };
    }));
  };

  const handleMonthlyBudgetChange = (vendorKey: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    updateVendor(vendorKey, { monthlyBudget: numValue });
  };

  const saveSubscriptionBudgets = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      const activeVendors = vendors.filter(v => v.isActive);

      const response = await fetch('/api/subscription-budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          budgets: activeVendors.map(v => ({
            vendorName: v.vendorName,
            vendorKey: v.vendorKey,
            frequency: v.frequency,
            monthlyBudget: v.monthlyBudget,
            last12MonthsSpend: v.totalAmount,
            transactionCount: v.transactionCount,
            avgTransactionAmount: v.avgAmount,
            lastTransactionDate: v.lastTransaction,
            accountCodes: summary?.accountsAnalyzed || [],
            isActive: true,
          })),
        }),
      });

      if (!response.ok) throw new Error('Failed to save budgets');

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving budgets:', err);
      setError('Failed to save subscription budgets. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedAccountCount = accounts.filter(acc => acc.isSelected).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-brand-navy" />
        <span className="ml-3 text-gray-600">Loading expense accounts from Xero...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Phase Indicator */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-4 shadow-lg">
        <div className="flex items-center justify-between">
          {[
            { step: 1, label: 'Select Accounts', phase: 'select-accounts' },
            { step: 2, label: 'Analyze', phase: 'analyzing' },
            { step: 3, label: 'Review & Budget', phase: 'review' },
          ].map((item, idx) => {
            const isActive = phase === item.phase;
            const isPast = (phase === 'analyzing' && item.step === 1) ||
                          (phase === 'review' && item.step <= 2);
            return (
              <div key={item.step} className="flex items-center">
                <div className={`flex items-center gap-2 ${idx > 0 ? 'ml-2' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    isActive
                      ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30'
                      : isPast
                        ? 'bg-emerald-500 text-white'
                        : 'bg-white/10 text-slate-400'
                  }`}>
                    {isPast && !isActive ? '✓' : item.step}
                  </div>
                  <span className={`text-sm font-medium ${
                    isActive ? 'text-white' : isPast ? 'text-slate-300' : 'text-slate-500'
                  }`}>
                    {item.label}
                  </span>
                </div>
                {idx < 2 && (
                  <div className={`w-16 h-0.5 mx-3 ${isPast || isActive ? 'bg-emerald-500' : 'bg-white/10'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm flex items-start gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          <span>Subscription budgets saved successfully!</span>
        </div>
      )}

      {/* Phase 1: Account Selection */}
      {phase === 'select-accounts' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Select Accounts to Analyze</h3>
            <p className="text-sm text-gray-500 mt-1">
              Select expense accounts that contain subscription/SaaS payments.
            </p>
          </div>

          {accounts.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-gray-500">No subscription-related accounts found.</p>
              <button
                onClick={loadAccounts}
                className="mt-4 px-4 py-2 text-sm text-brand-navy hover:bg-gray-50 rounded-lg inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                {accounts.map((account) => (
                  <label
                    key={account.accountId}
                    className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={account.isSelected}
                      onChange={() => toggleAccountSelection(account.accountId)}
                      className="w-4 h-4 text-brand-navy rounded focus:ring-brand-navy"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{account.accountName}</span>
                        {account.isSuggested && (
                          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                            Suggested
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">Code: {account.accountCode}</span>
                    </div>
                  </label>
                ))}
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  {selectedAccountCount} account{selectedAccountCount !== 1 ? 's' : ''} selected
                </div>
                <button
                  onClick={analyzeSubscriptions}
                  disabled={selectedAccountCount === 0}
                  className="px-4 py-2 bg-brand-navy text-white text-sm font-medium rounded-lg hover:bg-brand-navy-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Search className="w-4 h-4" />
                  Analyze Subscriptions
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Phase 2: Analyzing */}
      {phase === 'analyzing' && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-12 h-12 animate-spin text-brand-navy mb-4" />
          <p className="text-gray-600 font-medium">Analyzing transactions from Xero...</p>
          <p className="text-sm text-gray-500 mt-1">Fetching invoices and bank transactions...</p>
        </div>
      )}

      {/* Phase 3: Review & Budget */}
      {phase === 'review' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-5 gap-4">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 border border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-slate-400" />
                <p className="text-xs text-slate-400 uppercase tracking-wide">Prior FY (Full)</p>
              </div>
              <p className="text-2xl font-bold text-white tabular-nums">{formatCurrency(totals.priorFY)}</p>
              <p className="text-sm text-slate-400">{summary?.dateRange?.priorFY ? `${summary.dateRange.priorFY.from} - ${summary.dateRange.priorFY.to}` : 'Jul-Jun'}</p>
            </div>

            <div className="bg-gradient-to-br from-indigo-700 to-indigo-800 rounded-xl p-4 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-indigo-200" />
                <p className="text-xs text-indigo-200 uppercase tracking-wide">Current FY YTD</p>
              </div>
              <p className="text-2xl font-bold text-white tabular-nums">{formatCurrency(totals.currentFY)}</p>
              <p className="text-sm text-indigo-100">{monthsElapsed} months elapsed</p>
            </div>

            <div className="bg-gradient-to-br from-cyan-600 to-blue-700 rounded-xl p-4 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-cyan-200" />
                <p className="text-xs text-cyan-200 uppercase tracking-wide">Monthly Budget</p>
              </div>
              <p className="text-2xl font-bold text-white tabular-nums">{formatCurrency(totals.monthlyBudget)}</p>
              <p className="text-sm text-cyan-100">{totals.vendorCount} active vendors</p>
            </div>

            <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl p-4 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="w-5 h-5 text-emerald-200" />
                <p className="text-xs text-emerald-200 uppercase tracking-wide">Annual Budget</p>
              </div>
              <p className="text-2xl font-bold text-white tabular-nums">{formatCurrency(totals.annualBudget)}</p>
              <p className="text-sm text-emerald-100">{formatCurrency(totals.monthlyBudget)} x 12</p>
            </div>

            <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-4 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-5 h-5 text-purple-200" />
                <p className="text-xs text-purple-200 uppercase tracking-wide">Remaining FY</p>
              </div>
              <p className="text-2xl font-bold text-white tabular-nums">{formatCurrency(totals.remainingFY)}</p>
              <p className="text-sm text-purple-100">{monthsRemaining} months left</p>
            </div>
          </div>

          {/* P&L Reconciliation Check */}
          {summary?.reconciliation && (
            <div className={`rounded-xl p-4 border ${
              summary.reconciliation.priorFY.isReconciled && summary.reconciliation.currentFY.isReconciled
                ? 'bg-green-50 border-green-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-start gap-3">
                {summary.reconciliation.priorFY.isReconciled && summary.reconciliation.currentFY.isReconciled ? (
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`font-medium ${
                    summary.reconciliation.priorFY.isReconciled && summary.reconciliation.currentFY.isReconciled
                      ? 'text-green-800'
                      : 'text-amber-800'
                  }`}>
                    P&L Reconciliation Check
                  </p>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    {/* Prior FY Reconciliation */}
                    <div className={`rounded-lg p-3 ${
                      summary.reconciliation.priorFY.isReconciled
                        ? 'bg-green-100/50'
                        : 'bg-amber-100/50'
                    }`}>
                      <p className="text-xs font-medium text-gray-600 uppercase mb-2">Prior FY (Jul {fiscalYear - 2} - Jun {fiscalYear - 1})</p>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Transactions Analyzed:</span>
                          <span className="font-medium">{formatCurrency(summary.reconciliation.priorFY.analyzed)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Xero P&L Actual:</span>
                          <span className="font-medium">
                            {summary.reconciliation.priorFY.actual !== null
                              ? formatCurrency(summary.reconciliation.priorFY.actual)
                              : 'N/A'}
                          </span>
                        </div>
                        {summary.reconciliation.priorFY.variance !== null && (
                          <div className="flex justify-between pt-1 border-t border-gray-200">
                            <span className="text-gray-600">Variance:</span>
                            <span className={`font-medium ${
                              Math.abs(summary.reconciliation.priorFY.variance) < 100
                                ? 'text-green-600'
                                : 'text-amber-600'
                            }`}>
                              {summary.reconciliation.priorFY.variance >= 0 ? '+' : ''}
                              {formatCurrency(summary.reconciliation.priorFY.variance)}
                              {summary.reconciliation.priorFY.variancePercent !== null && (
                                <span className="text-xs ml-1">
                                  ({summary.reconciliation.priorFY.variancePercent >= 0 ? '+' : ''}
                                  {summary.reconciliation.priorFY.variancePercent.toFixed(1)}%)
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Current FY Reconciliation */}
                    <div className={`rounded-lg p-3 ${
                      summary.reconciliation.currentFY.isReconciled
                        ? 'bg-green-100/50'
                        : 'bg-amber-100/50'
                    }`}>
                      <p className="text-xs font-medium text-gray-600 uppercase mb-2">Current FY YTD (Jul {fiscalYear - 1} - Today)</p>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Transactions Analyzed:</span>
                          <span className="font-medium">{formatCurrency(summary.reconciliation.currentFY.analyzed)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Xero P&L Actual:</span>
                          <span className="font-medium">
                            {summary.reconciliation.currentFY.actual !== null
                              ? formatCurrency(summary.reconciliation.currentFY.actual)
                              : 'N/A'}
                          </span>
                        </div>
                        {summary.reconciliation.currentFY.variance !== null && (
                          <div className="flex justify-between pt-1 border-t border-gray-200">
                            <span className="text-gray-600">Variance:</span>
                            <span className={`font-medium ${
                              Math.abs(summary.reconciliation.currentFY.variance) < 100
                                ? 'text-green-600'
                                : 'text-amber-600'
                            }`}>
                              {summary.reconciliation.currentFY.variance >= 0 ? '+' : ''}
                              {formatCurrency(summary.reconciliation.currentFY.variance)}
                              {summary.reconciliation.currentFY.variancePercent !== null && (
                                <span className="text-xs ml-1">
                                  ({summary.reconciliation.currentFY.variancePercent >= 0 ? '+' : ''}
                                  {summary.reconciliation.currentFY.variancePercent.toFixed(1)}%)
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {(!summary.reconciliation.priorFY.isReconciled || !summary.reconciliation.currentFY.isReconciled) && (
                    <p className="text-xs text-amber-700 mt-3">
                      Note: Variance may be due to journal entries, manual adjustments, or transactions not yet coded to these accounts.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Vendor Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Subscription Budgets</h3>
                <p className="text-sm text-gray-500">
                  Review and adjust monthly budgets for each vendor
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPhase('select-accounts')}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Re-analyze
                </button>
                <button
                  onClick={saveSubscriptionBudgets}
                  disabled={isSaving || vendors.filter(v => v.isActive).length === 0}
                  className="px-4 py-2 bg-brand-navy text-white text-sm font-medium rounded-lg hover:bg-brand-navy-800 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save Budgets
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8"></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Frequency</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Prior FY</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">FY YTD</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-36">Monthly Budget</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Annual Budget</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-20">Include</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {vendors.map((vendor) => (
                    <React.Fragment key={vendor.vendorKey}>
                      <tr
                        className={`hover:bg-gray-50 ${!vendor.isActive ? 'opacity-50' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleVendorExpanded(vendor.vendorKey)}
                            className="p-1 hover:bg-gray-200 rounded"
                          >
                            {vendor.isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{vendor.vendorName}</div>
                          <div className="text-xs text-gray-500">
                            {vendor.transactionCount} payment{vendor.transactionCount !== 1 ? 's' : ''}
                            {vendor.confidence === 'high' && (
                              <span className="ml-2 text-green-600">High confidence</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <select
                            value={vendor.frequency}
                            onChange={(e) => handleFrequencyChange(vendor.vendorKey, e.target.value as VendorBudget['frequency'])}
                            disabled={!vendor.isActive}
                            className={`px-2 py-1 text-xs font-medium rounded border ${FREQUENCY_COLORS[vendor.frequency]} focus:outline-none focus:ring-2 focus:ring-brand-navy cursor-pointer`}
                          >
                            {FREQUENCY_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600 tabular-nums">
                          {formatCurrency(vendor.priorFYAmount)}
                          {vendor.priorFYCount > 0 && (
                            <span className="text-xs text-gray-400 ml-1">({vendor.priorFYCount})</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600 tabular-nums">
                          {formatCurrency(vendor.currentFYAmount)}
                          {vendor.currentFYCount > 0 && (
                            <span className="text-xs text-gray-400 ml-1">({vendor.currentFYCount})</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                            <input
                              type="number"
                              value={vendor.monthlyBudget}
                              onChange={(e) => handleMonthlyBudgetChange(vendor.vendorKey, e.target.value)}
                              disabled={!vendor.isActive}
                              className="w-full pl-7 pr-3 py-1.5 text-sm text-right border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:bg-gray-100 tabular-nums"
                              step="0.01"
                              min="0"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900 tabular-nums">
                          {formatCurrency(vendor.monthlyBudget * 12)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={vendor.isActive}
                            onChange={() => toggleVendorActive(vendor.vendorKey)}
                            className="w-4 h-4 text-brand-navy rounded focus:ring-brand-navy cursor-pointer"
                          />
                        </td>
                      </tr>

                      {/* Expanded Transaction Details */}
                      {vendor.isExpanded && (
                        <tr className="bg-gray-50">
                          <td colSpan={8} className="px-4 py-3">
                            <div className="ml-8 space-y-4">
                              {/* Current FY Transactions */}
                              {vendor.transactions.filter(t => t.period === 'current_fy').length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-indigo-700 uppercase mb-2">
                                    Current FY YTD ({vendor.transactions.filter(t => t.period === 'current_fy').length} transactions - {formatCurrency(vendor.currentFYAmount)})
                                  </p>
                                  <div className="max-h-48 overflow-y-auto border border-indigo-200 rounded-lg bg-indigo-50/50">
                                    <table className="w-full text-sm">
                                      <thead className="bg-indigo-100 sticky top-0">
                                        <tr>
                                          <th className="px-3 py-1.5 text-left text-xs font-medium text-indigo-700">Date</th>
                                          <th className="px-3 py-1.5 text-left text-xs font-medium text-indigo-700">Description</th>
                                          <th className="px-3 py-1.5 text-center text-xs font-medium text-indigo-700">Source</th>
                                          <th className="px-3 py-1.5 text-right text-xs font-medium text-indigo-700">Amount</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-indigo-100">
                                        {vendor.transactions.filter(t => t.period === 'current_fy').map((txn, idx) => (
                                          <tr key={idx} className="hover:bg-indigo-100/50">
                                            <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{txn.date}</td>
                                            <td className="px-3 py-1.5 text-gray-700 truncate max-w-xs">{txn.description}</td>
                                            <td className="px-3 py-1.5 text-center">
                                              <span className={`px-1.5 py-0.5 text-xs rounded ${
                                                txn.source === 'invoice' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                              }`}>
                                                {txn.source}
                                              </span>
                                            </td>
                                            <td className="px-3 py-1.5 text-right font-medium text-gray-900 tabular-nums">{formatCurrency(txn.amount)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Prior FY Transactions */}
                              {vendor.transactions.filter(t => t.period === 'prior_fy').length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-slate-600 uppercase mb-2">
                                    Prior FY ({vendor.transactions.filter(t => t.period === 'prior_fy').length} transactions - {formatCurrency(vendor.priorFYAmount)})
                                  </p>
                                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg bg-slate-50/50">
                                    <table className="w-full text-sm">
                                      <thead className="bg-slate-100 sticky top-0">
                                        <tr>
                                          <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600">Date</th>
                                          <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600">Description</th>
                                          <th className="px-3 py-1.5 text-center text-xs font-medium text-slate-600">Source</th>
                                          <th className="px-3 py-1.5 text-right text-xs font-medium text-slate-600">Amount</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {vendor.transactions.filter(t => t.period === 'prior_fy').map((txn, idx) => (
                                          <tr key={idx} className="hover:bg-slate-100/50">
                                            <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{txn.date}</td>
                                            <td className="px-3 py-1.5 text-gray-700 truncate max-w-xs">{txn.description}</td>
                                            <td className="px-3 py-1.5 text-center">
                                              <span className={`px-1.5 py-0.5 text-xs rounded ${
                                                txn.source === 'invoice' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                              }`}>
                                                {txn.source}
                                              </span>
                                            </td>
                                            <td className="px-3 py-1.5 text-right font-medium text-gray-900 tabular-nums">{formatCurrency(txn.amount)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {vendor.transactions.length === 0 && (
                                <p className="text-sm text-gray-500">No transaction details available</p>
                              )}

                              <div className="pt-2 text-xs text-gray-500 border-t border-gray-200">
                                First: {vendor.firstTransaction} | Last: {vendor.lastTransaction} | Span: {vendor.monthsSpan} months
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}

                  {vendors.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                        No vendors found in the selected accounts.
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* Totals Footer */}
                {vendors.length > 0 && (
                  <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-900">
                        TOTAL ({totals.vendorCount} vendor{totals.vendorCount !== 1 ? 's' : ''})
                        {totals.excludedCount > 0 && (
                          <span className="font-normal text-gray-500 ml-2">
                            ({totals.excludedCount} excluded)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                        {formatCurrency(totals.priorFY)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                        {formatCurrency(totals.currentFY)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                        {formatCurrency(totals.monthlyBudget)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-brand-navy tabular-nums">
                        {formatCurrency(totals.annualBudget)}
                      </td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
