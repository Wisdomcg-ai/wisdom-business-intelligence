'use client';

// Step6Subscriptions.tsx
//
// Phase 57 (T05, B3) — this component now renders at currentStep === 5
// (was step 6 pre-Phase-57). The file name is retained for git-history
// continuity. See WIZARD_STEPS in ../types.ts for the canonical step
// numbering and ForecastWizardV4.tsx renderStep() for the switch.

import React, { useState, useEffect, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  Search, CreditCard, AlertCircle, CheckCircle, Loader2, RefreshCw,
  ChevronDown, ChevronRight, Save, DollarSign, Calendar, TrendingUp,
  Plus, Trash2, PenLine, AlertTriangle
} from 'lucide-react';
import { ForecastWizardState, WizardActions, formatCurrency } from '../types';

interface Step6SubscriptionsProps {
  state: ForecastWizardState;
  actions: WizardActions;
  fiscalYear: number;
  businessId: string;
}

/**
 * Phase 57 T12 (B4) — Imperative handle exposed via forwardRef so the
 * StepBar (T13/B5) can synchronously flush pending subscription-budget
 * saves before navigating away. Without this, an autosave debounce in
 * flight could fire AFTER the operator has jumped to another step,
 * landing on a stale URL or racing with another step's save.
 *
 * Usage (T13/B5):
 *   const stepRef = useRef<Step6SubscriptionsHandle>(null);
 *   <Step6Subscriptions ref={stepRef} ... />
 *   // before goToStep:
 *   await stepRef.current?.flushPendingSaves();
 */
export interface Step6SubscriptionsHandle {
  /**
   * Cancels any pending debounced autosave timer and immediately POSTs the
   * current vendor list to /api/subscription-budgets. Resolves once the
   * network call returns. No-op when nothing is pending or no active
   * vendors exist; does NOT reject on save errors (the component's existing
   * error UI handles that). The promise resolves either way so callers
   * can `await` without worrying about uncaught rejections from a transient
   * network issue.
   */
  flushPendingSaves: () => Promise<void>;
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
  // Phase 51 (UX-S6-01): which Xero account codes this vendor is associated with.
  // Used to compute per-account totals in the sidebar. Optional for back-compat
  // with vendors restored from saved-state that may not have this populated yet.
  accountCodes?: string[];
  // Phase 51 (UX-S6-03): manual-entry metadata. Optional + ignored by the
  // existing P&L summary path (Phase 51 is presentation-only persistence; future
  // phases may consume these for cashflow timing).
  category?: string;
  startMonth?: string;
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

// Phase 51 (UX-S6-03): manual-entry category options.
// Kept narrow on purpose — the operator wants a small fixed list, not free-text.
// Future expansion can pull from a shared categories module if needed.
const MANUAL_CATEGORY_OPTIONS = ['Software', 'Marketing', 'Operations', 'Other'] as const;

interface ManualVendorInput {
  name: string;
  frequency: VendorBudget['frequency'];
  monthlyBudget: number;
  startMonth?: string;
  category?: string;
}

function createManualVendor(input: ManualVendorInput): VendorBudget {
  const { name, frequency, monthlyBudget, startMonth, category } = input;
  return {
    vendorName: name,
    vendorKey: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    suggestedFrequency: frequency,
    frequency,
    confidence: 'medium',
    totalAmount: 0,
    avgAmount: monthlyBudget,
    transactionCount: 0,
    priorFYAmount: 0,
    priorFYCount: 0,
    currentFYAmount: 0,
    currentFYCount: 0,
    firstTransaction: '',
    lastTransaction: '',
    monthsSpan: 0,
    suggestedMonthlyBudget: monthlyBudget,
    monthlyBudget,
    transactions: [],
    isExpanded: false,
    isActive: true,
    startMonth,
    category,
  };
}

/**
 * Phase 51 (UX-S6-02): merge incoming vendor list with previous, preserving
 * operator-edited `isActive` and `monthlyBudget` for vendors with the same
 * `vendorKey`. New vendors are added with their incoming defaults; previously-
 * present vendors that don't appear in `incoming` (e.g. account no longer
 * selected) are dropped.
 *
 * Exported for unit testing — see phase-51-step6-re-analyze.test.tsx.
 */
export function mergeByVendorKey(prev: VendorBudget[], incoming: VendorBudget[]): VendorBudget[] {
  const prevByKey = new Map(prev.map(v => [v.vendorKey, v]));
  return incoming.map(newV => {
    const existing = prevByKey.get(newV.vendorKey);
    if (!existing) return newV;
    return { ...newV, isActive: existing.isActive, monthlyBudget: existing.monthlyBudget };
  });
}

/**
 * Phase 51 (UX-S6-03): build a 24-month list of FY month keys for the
 * "Start month" dropdown. Spans Y1 + Y2 so operators can plan ahead.
 */
function buildStartMonthOptions(fiscalYearStart: number): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Y1 starts in July of fiscalYearStart, runs 24 months.
  for (let i = 0; i < 24; i++) {
    const calMonth = ((7 - 1 + i) % 12) + 1;
    const yearOffset = Math.floor((7 - 1 + i) / 12);
    const year = fiscalYearStart + yearOffset;
    const value = `${year}-${String(calMonth).padStart(2, '0')}`;
    const label = `${monthNames[calMonth - 1]} ${year}`;
    options.push({ value, label });
  }
  return options;
}

// Phase 57 T12 (B4): forwardRef so T13/B5's StepBar can call flushPendingSaves
// before navigating away. Inner function signature unchanged from pre-T12.
export const Step6Subscriptions = forwardRef<Step6SubscriptionsHandle, Step6SubscriptionsProps>(
function Step6Subscriptions({ state, actions, fiscalYear, businessId }, ref) {
  const [phase, setPhase] = useState<Phase>('select-accounts');
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [vendors, setVendors] = useState<VendorBudget[]>([]);
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isManualMode, setIsManualMode] = useState(false);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const startMonthOptions = useMemo(
    () => buildStartMonthOptions(state.fiscalYearStart ?? fiscalYear - 1),
    [state.fiscalYearStart, fiscalYear],
  );
  const defaultStartMonth = startMonthOptions[0]?.value ?? '';
  const [newVendor, setNewVendor] = useState({
    name: '',
    frequency: 'monthly' as VendorBudget['frequency'],
    monthlyBudget: 0,
    startMonth: defaultStartMonth,
    category: MANUAL_CATEGORY_OPTIONS[0] as string,
  });

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

      if (!response.ok) {
        if (response.status === 404) {
          // No Xero connection — switch to manual entry mode
          setIsManualMode(true);
          setPhase('review');
          // Try loading any existing manual budgets from DB
          await loadExistingBudgets();
          return;
        } else if (response.status === 401) {
          setError('Your Xero connection has expired. Please reconnect Xero in Settings.');
        } else {
          setError('Unable to load accounts from Xero right now. You can skip this step and come back later.');
        }
        return;
      }

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

      // Check for previously saved subscription budgets — if they exist, restore them
      try {
        const budgetRes = await fetch(`/api/subscription-budgets?business_id=${businessId}`);
        if (budgetRes.ok) {
          const budgetData = await budgetRes.json();
          if (budgetData.budgets && budgetData.budgets.length > 0) {
            const existingVendors: VendorBudget[] = budgetData.budgets.map((b: any) => ({
              vendorName: b.vendor_name,
              vendorKey: b.vendor_key,
              suggestedFrequency: b.frequency || 'monthly',
              frequency: b.frequency || 'monthly',
              confidence: 'high' as const,
              monthlyBudget: b.monthly_budget || 0,
              priorFYAmount: b.last_12_months_spend || 0,
              priorFYCount: b.transaction_count || 0,
              currentFYAmount: 0,
              currentFYCount: 0,
              totalAmount: b.last_12_months_spend || 0,
              transactionCount: b.transaction_count || 0,
              avgAmount: b.avg_transaction_amount || 0,
              firstTransaction: '',
              lastTransaction: b.last_transaction_date || '',
              transactions: [],
              monthsSpan: 12,
              accountCodes: b.account_codes || [],
              isActive: b.is_active !== false,
            }));
            setVendors(existingVendors);
            setPhase('review');
            console.log('[Subscriptions] Restored', existingVendors.length, 'saved budgets');
          }
        }
      } catch (budgetErr) {
        console.warn('[Subscriptions] Could not load saved budgets:', budgetErr);
      }
    } catch (err) {
      console.error('Error loading accounts:', err);
      // Network error — also fall back to manual mode
      setIsManualMode(true);
      setPhase('review');
      await loadExistingBudgets();
    } finally {
      setIsLoading(false);
    }
  };

  const loadExistingBudgets = async () => {
    try {
      const response = await fetch(`/api/subscription-budgets?business_id=${businessId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.budgets && data.budgets.length > 0) {
          const existingVendors: VendorBudget[] = data.budgets.map((b: any) => ({
            vendorName: b.vendor_name,
            vendorKey: b.vendor_key,
            suggestedFrequency: b.frequency || 'monthly',
            frequency: b.frequency || 'monthly',
            confidence: 'medium',
            totalAmount: b.last_12_months_spend || 0,
            avgAmount: b.avg_transaction_amount || b.monthly_budget || 0,
            transactionCount: b.transaction_count || 0,
            priorFYAmount: 0,
            priorFYCount: 0,
            currentFYAmount: 0,
            currentFYCount: 0,
            firstTransaction: '',
            lastTransaction: b.last_transaction_date || '',
            monthsSpan: 0,
            suggestedMonthlyBudget: b.monthly_budget,
            monthlyBudget: b.monthly_budget,
            transactions: [],
            isExpanded: false,
            isActive: b.is_active !== false,
          }));
          setVendors(existingVendors);
        }
      }
    } catch (err) {
      console.error('Error loading existing budgets:', err);
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

      // Transform vendor data. Phase 51 (UX-S6-01): tag each vendor with the
      // account codes that were just analyzed so the sidebar can compute
      // per-account totals. The API doesn't currently return per-vendor account
      // codes, so we attach the entire selected-account-code list to every
      // vendor; account totals on the sidebar therefore reflect "this vendor
      // contributes to all selected accounts" — fine for the UX-S6-01 sidebar
      // sum semantics (sum across vendors mapped to that account).
      const analyzedAccountCodes = selectedAccounts.map(acc => acc.accountCode);
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
        accountCodes: v.accountCodes ?? analyzedAccountCodes,
      }));

      // Phase 51 (UX-S6-02): merge with existing vendor list so operator's
      // isActive toggles + monthlyBudget edits are preserved across
      // re-analyze. New vendors take their incoming defaults.
      setVendors(prev => mergeByVendorKey(prev, vendorBudgets));
      setSummary(data.summary);
      setPhase('review');

      // Auto-save budgets immediately after analysis
      if (vendorBudgets.length > 0) {
        saveSubscriptionBudgets(vendorBudgets);
      }

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

  const removeVendor = (vendorKey: string) => {
    setVendors(prev => prev.filter(v => v.vendorKey !== vendorKey));
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

  const addManualVendor = () => {
    if (!newVendor.name.trim() || newVendor.monthlyBudget <= 0) return;

    // Check for duplicate vendor key
    const vendorKey = newVendor.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (vendors.some(v => v.vendorKey === vendorKey)) {
      setError(`"${newVendor.name}" already exists. Edit the existing entry instead.`);
      return;
    }

    const vendor = createManualVendor({
      name: newVendor.name.trim(),
      frequency: newVendor.frequency,
      monthlyBudget: newVendor.monthlyBudget,
      startMonth: newVendor.startMonth,
      category: newVendor.category,
    });
    setVendors(prev => [...prev, vendor]);
    setNewVendor({
      name: '',
      frequency: 'monthly',
      monthlyBudget: 0,
      startMonth: defaultStartMonth,
      category: MANUAL_CATEGORY_OPTIONS[0],
    });
    setShowAddVendor(false);
    setError(null);
  };

  const saveSubscriptionBudgets = useCallback(async (vendorsToSave?: VendorBudget[]) => {
    const vendorList = vendorsToSave || vendors;
    const activeVendors = vendorList.filter(v => v.isActive);
    if (activeVendors.length === 0) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
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
            lastTransactionDate: v.lastTransaction || null,
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
  }, [vendors, businessId, summary]);

  // Auto-save: debounce vendor changes while in review phase
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAutoSavedInitial = useRef(false);

  useEffect(() => {
    if (phase !== 'review' || vendors.length === 0) return;

    // Skip the initial render — analyzeSubscriptions handles that save (Xero mode)
    // In manual mode, we still want to save after the first change
    if (!hasAutoSavedInitial.current && !isManualMode) {
      hasAutoSavedInitial.current = true;
      return;
    }
    hasAutoSavedInitial.current = true;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      saveSubscriptionBudgets();
    }, 1500);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [vendors, phase, saveSubscriptionBudgets, isManualMode]);

  // Phase 57 T12 (B4) — flushPendingSaves exposed via ref for T13/B5's
  // clickable nav. Cancels the in-flight debounce timer and immediately
  // POSTs the current vendor list. Resolves once the network call returns
  // (or immediately if there's nothing to save). Never rejects — the
  // component's existing error UI surfaces failures; rejecting here would
  // break callers that just want to await before navigation.
  useImperativeHandle(ref, () => ({
    flushPendingSaves: async () => {
      // Cancel any pending debounced save.
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      // No vendors to save (initial render, or all excluded) → no-op.
      if (vendors.length === 0) return;
      const activeCount = vendors.filter(v => v.isActive).length;
      if (activeCount === 0) return;
      try {
        await saveSubscriptionBudgets();
      } catch (err) {
        // saveSubscriptionBudgets handles UI error state itself; swallow here
        // so the caller's `await flushPendingSaves()` never rejects.
        console.warn('[Step6Subscriptions T12] flushPendingSaves error (non-fatal):', err);
      }
    },
  }), [saveSubscriptionBudgets, vendors]);

  // Phase 57 T12 (B4) — Gap warning banner.
  //
  // Surfaces the case where the operator's vendor budgets are materially
  // below historical spend on the analyzed accounts — a "did you forget a
  // vendor?" hint. CONTEXT.md (line 30) specifies a 15% threshold:
  //   show warning when Σ(activeVendor.monthlyBudget × 12) < 0.85 × historical
  //
  // Historical source: summary.priorFYTotal (FULL prior-FY spend on all
  // analyzed accounts, before any vendor exclusions). We use prior-FY
  // total — not last-12-months totalAmount — because operators set
  // budgets relative to a complete fiscal year of data.
  //
  // Gating:
  //   - Only render in 'review' phase, post-analysis.
  //   - Only when historicalAccountTotal > 0 (avoid divide-by-zero noise).
  //   - Manual mode has no historical context → don't render.
  //   - Threshold is strict (> 15%) to avoid false alarms on small budgets.
  const gapWarning = useMemo(() => {
    if (isManualMode) return null;
    if (phase !== 'review') return null;
    const historical = summary?.priorFYTotal ?? 0;
    if (historical <= 0) return null;
    const vendorAnnual = totals.annualBudget;
    if (vendorAnnual >= historical * 0.85) return null;
    const gap = historical - vendorAnnual;
    const gapPct = (gap / historical) * 100;
    return { historical, vendorAnnual, gap, gapPct };
  }, [isManualMode, phase, summary?.priorFYTotal, totals.annualBudget]);

  const selectedAccountCount = accounts.filter(acc => acc.isSelected).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-brand-navy" />
        <span className="ml-3 text-gray-600">Loading subscriptions...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Phase Indicator — Xero mode only */}
      {!isManualMode && (
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
      )}

      {/* Manual Mode Header */}
      {isManualMode && (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <PenLine className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Manual Subscription Entry</h3>
              <p className="text-sm text-slate-400 mt-0.5">
                Add your recurring software and service subscriptions below. Connect Xero later for automatic analysis.
              </p>
            </div>
          </div>
        </div>
      )}

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

      {/* Phase 1: Account Selection — Xero mode only */}
      {phase === 'select-accounts' && !isManualMode && (
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

      {/* Phase 2: Analyzing — Xero mode only */}
      {phase === 'analyzing' && !isManualMode && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-12 h-12 animate-spin text-brand-navy mb-4" />
          <p className="text-gray-600 font-medium">Analyzing transactions from Xero...</p>
          <p className="text-sm text-gray-500 mt-1">Fetching invoices and bank transactions...</p>
        </div>
      )}

      {/* Phase 3: Review & Budget (Xero mode) OR Manual entry mode */}
      {phase === 'review' && (
        <div className="flex gap-6 items-start">
          {/* Phase 51 (UX-S6-01): persistent sidebar showing selected accounts
              + per-account vendor totals. Only shown in xero mode (manual mode
              has no Xero accounts to summarize). */}
          {!isManualMode && (
            <aside aria-label="Selected Accounts" className="w-64 shrink-0 border border-gray-200 rounded-xl p-4 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Selected Accounts</h3>
              {accounts.filter(a => a.isSelected).length === 0 ? (
                <p className="text-xs text-gray-500 italic">No accounts selected.</p>
              ) : (
                <ul className="space-y-2">
                  {accounts.filter(a => a.isSelected).map(account => {
                    const total = vendors
                      .filter(v => v.isActive && v.accountCodes?.includes(account.accountCode))
                      .reduce((sum, v) => sum + (v.monthlyBudget || 0), 0);
                    return (
                      <li key={account.accountId} className="flex justify-between gap-2 text-sm">
                        <span className="truncate text-gray-700" title={account.accountName}>{account.accountName}</span>
                        <span className="font-medium text-gray-900 tabular-nums">{formatCurrency(total)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>
          )}
          <div className="flex-1 min-w-0 space-y-6">
          {/* Summary Cards */}
          <div className={`grid ${isManualMode ? 'grid-cols-3' : 'grid-cols-5'} gap-4`}>
            {!isManualMode && (
              <>
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
              </>
            )}

            <div className="bg-gradient-to-br from-cyan-600 to-blue-700 rounded-xl p-4 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-cyan-200" />
                <p className="text-xs text-cyan-200 uppercase tracking-wide">Monthly Budget</p>
              </div>
              <p className="text-2xl font-bold text-white tabular-nums">{formatCurrency(totals.monthlyBudget)}</p>
              <p className="text-sm text-cyan-100">{totals.vendorCount} active vendor{totals.vendorCount !== 1 ? 's' : ''}</p>
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

          {/* Phase 57 T12 (B4) — Gap warning banner.
              Shown when active vendor budgets are < 85% of historical
              prior-FY spend on the analyzed accounts. Soft hint, not a
              blocker — operator may have intentionally cut subscriptions
              and the forecast trusts their budget per CONTEXT.md (line 32). */}
          {gapWarning && (
            <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900">
                    Your vendor budgets are {gapWarning.gapPct.toFixed(0)}% below historical spend
                  </p>
                  <p className="text-xs text-amber-800 mt-1">
                    Historical: {formatCurrency(gapWarning.historical)}/yr.
                    Your budget: {formatCurrency(gapWarning.vendorAnnual)}/yr.
                    Gap: {formatCurrency(gapWarning.gap)}/yr.
                  </p>
                  <p className="text-xs text-amber-800 mt-1">
                    If you&apos;ve intentionally cut subscriptions, this is fine — the forecast uses your budget.
                    If you&apos;ve missed a vendor, add it before continuing.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* P&L Reconciliation Check — Xero mode only */}
          {!isManualMode && summary?.reconciliation && (
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
                  {isManualMode
                    ? 'Add and manage your recurring subscriptions and services'
                    : 'Review and adjust monthly budgets for each vendor'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Phase 51 (UX-S6-03): always visible in review phase, not just manual mode */}
                {phase === 'review' && (
                  <button
                    onClick={() => setShowAddVendor(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand-navy rounded-lg hover:bg-brand-navy-800 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Subscription
                  </button>
                )}
                {/* Phase 51 (UX-S6-02): renamed from "Re-analyze" → "Change selected accounts".
                    Vendor toggles are now preserved across re-analyze via mergeByVendorKey. */}
                {!isManualMode && (
                  <button
                    onClick={() => setPhase('select-accounts')}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Change selected accounts
                  </button>
                )}
                {isSaving ? (
                  <span className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </span>
                ) : saveSuccess ? (
                  <span className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    Saved
                  </span>
                ) : vendors.length > 0 ? (
                  <span className="flex items-center gap-2 text-sm text-gray-400">
                    <Save className="w-4 h-4" />
                    Auto-saved
                  </span>
                ) : null}
              </div>
            </div>

            {/* Add Vendor Form — Phase 51 (UX-S6-03): visible in xero mode too,
                with explicit labelled fields for start month + category. */}
            {showAddVendor && (
              <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
                <div className="grid grid-cols-12 gap-3">
                  <label className="col-span-5 flex flex-col gap-1 text-xs font-medium text-gray-700">
                    Vendor name
                    <input
                      type="text"
                      value={newVendor.name}
                      onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
                      placeholder="Vendor name (e.g., Microsoft 365)"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy font-normal"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && addManualVendor()}
                    />
                  </label>
                  <label className="col-span-3 flex flex-col gap-1 text-xs font-medium text-gray-700">
                    Frequency
                    <select
                      value={newVendor.frequency}
                      onChange={(e) => setNewVendor({ ...newVendor, frequency: e.target.value as VendorBudget['frequency'] })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy font-normal"
                    >
                      {FREQUENCY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-gray-700">
                    Monthly amount
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        value={newVendor.monthlyBudget || ''}
                        onChange={(e) => setNewVendor({ ...newVendor, monthlyBudget: parseFloat(e.target.value) || 0 })}
                        placeholder="Monthly"
                        className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-navy font-normal"
                        onKeyDown={(e) => e.key === 'Enter' && addManualVendor()}
                      />
                    </div>
                  </label>
                  <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-gray-700">
                    Start month
                    <select
                      value={newVendor.startMonth}
                      onChange={(e) => setNewVendor({ ...newVendor, startMonth: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy font-normal"
                    >
                      {startMonthOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="col-span-3 flex flex-col gap-1 text-xs font-medium text-gray-700">
                    Category
                    <select
                      value={newVendor.category}
                      onChange={(e) => setNewVendor({ ...newVendor, category: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy font-normal"
                    >
                      {MANUAL_CATEGORY_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </label>
                  <div className="col-span-9 flex justify-end gap-2 mt-1">
                    <button
                      onClick={() => {
                        setShowAddVendor(false);
                        setNewVendor({
                          name: '',
                          frequency: 'monthly',
                          monthlyBudget: 0,
                          startMonth: defaultStartMonth,
                          category: MANUAL_CATEGORY_OPTIONS[0],
                        });
                      }}
                      className="px-3 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={addManualVendor}
                      disabled={!newVendor.name.trim() || newVendor.monthlyBudget <= 0}
                      className="px-4 py-2 bg-brand-navy text-white text-sm font-medium rounded-lg hover:bg-brand-navy-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {!isManualMode && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8"></th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Frequency</th>
                    {!isManualMode && (
                      <>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Prior FY</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">FY YTD</th>
                      </>
                    )}
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-36">Monthly Budget</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Annual Budget</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-20">
                      {isManualMode ? '' : 'Include'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {vendors.map((vendor) => (
                    <React.Fragment key={vendor.vendorKey}>
                      <tr
                        className={`hover:bg-gray-50 ${!vendor.isActive ? 'opacity-50' : ''}`}
                      >
                        {!isManualMode && (
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
                        )}
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{vendor.vendorName}</div>
                          {!isManualMode && (
                            <div className="text-xs text-gray-500">
                              {vendor.transactionCount} payment{vendor.transactionCount !== 1 ? 's' : ''}
                              {vendor.confidence === 'high' && (
                                <span className="ml-2 text-green-600">High confidence</span>
                              )}
                            </div>
                          )}
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
                        {!isManualMode && (
                          <>
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
                          </>
                        )}
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
                          {isManualMode ? (
                            <button
                              onClick={() => removeVendor(vendor.vendorKey)}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                              title="Remove"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <input
                              type="checkbox"
                              checked={vendor.isActive}
                              onChange={() => toggleVendorActive(vendor.vendorKey)}
                              className="w-4 h-4 text-brand-navy rounded focus:ring-brand-navy cursor-pointer"
                            />
                          )}
                        </td>
                      </tr>

                      {/* Expanded Transaction Details — Xero mode only */}
                      {!isManualMode && vendor.isExpanded && (
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
                      <td colSpan={isManualMode ? 5 : 8} className="px-4 py-8 text-center">
                        {isManualMode ? (
                          <div className="space-y-3">
                            <CreditCard className="w-10 h-10 text-gray-300 mx-auto" />
                            <p className="text-sm text-gray-500">No subscriptions added yet.</p>
                            <button
                              onClick={() => setShowAddVendor(true)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-brand-navy bg-brand-navy/5 rounded-lg hover:bg-brand-navy/10 transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                              Add your first subscription
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">No vendors found in the selected accounts.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* Totals Footer */}
                {vendors.length > 0 && (
                  <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                    <tr>
                      <td colSpan={isManualMode ? 2 : 3} className="px-4 py-3 text-sm font-semibold text-gray-900">
                        TOTAL ({totals.vendorCount} vendor{totals.vendorCount !== 1 ? 's' : ''})
                        {totals.excludedCount > 0 && (
                          <span className="font-normal text-gray-500 ml-2">
                            ({totals.excludedCount} excluded)
                          </span>
                        )}
                      </td>
                      {!isManualMode && (
                        <>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                            {formatCurrency(totals.priorFY)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular-nums">
                            {formatCurrency(totals.currentFY)}
                          </td>
                        </>
                      )}
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

            {/* Quick Add Inline — Manual mode, when vendors already exist */}
            {isManualMode && vendors.length > 0 && !showAddVendor && (
              <div className="px-6 py-3 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setShowAddVendor(true)}
                  className="flex items-center gap-1.5 text-sm text-brand-navy hover:text-brand-navy-800 font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add another subscription
                </button>
              </div>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  );
});

// Phase 57 T12 (B4): preserve named display in DevTools after the forwardRef wrap.
Step6Subscriptions.displayName = 'Step6Subscriptions';
