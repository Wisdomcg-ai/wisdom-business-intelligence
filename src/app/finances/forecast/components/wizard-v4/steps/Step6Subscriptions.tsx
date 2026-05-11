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
  // Phase 63: calendar month (1-12) the annual sub renews. Null for monthly /
  // quarterly / ad-hoc. Drives native-rhythm display ($X/yr (Mar)) and
  // (later) cashflow burst.
  renewalMonth?: number | null;
  // Phase 64: per-account prior-FY $ split. Sidebar uses exact splits so a
  // vendor whose transactions span multiple accounts doesn't get full-amount
  // attributed to each. {} or undefined for legacy rows → sidebar falls back
  // to even-split of accountCodes.
  accountSplits?: Record<string, number>;
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

// Phase 63: short month labels used by the "annual lumps" breakdown in the
// summary card. Indexed 0-11 (Jan-Dec); callers convert from 1-12 by
// subtracting 1.
const MONTH_ABBREVS_LOCAL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

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

/**
 * Phase 61 (B3): tighten the default-on account selection.
 *
 * The chart-of-accounts API marks accounts as `isSuggested` using a
 * permissive name match (any account whose name contains "subscription",
 * "software", "hosting", etc.). On businesses with internal dev cost
 * accounts (e.g. "Software Development - PK Costs"), this sweeps up
 * accounts that hold contractor / labor payments — which then surface in
 * Step 5 as "subscriptions" alongside the real SaaS vendors. JDS 2026-05-12
 * showed the failure mode: top vendor "Cohaptic LLC" at $107k/yr is a
 * contractor, not a subscription, but they were paid through the "Software
 * Development" account that the suggester marked as on by default.
 *
 * This local blocklist runs AFTER the server suggestion and de-selects
 * (but does NOT hide) accounts whose names match the blocklist. The
 * operator can still manually re-select them in the chart picker.
 */
function looksLikeContractorAccount(accountName: string): boolean {
  const n = (accountName || '').toLowerCase();
  // Order matters only for readability — any match wins.
  const blocklist = [
    /\bdevelopment\b/,           // "Software Development - PK Costs"
    /\bcontractor/,              // "Contractor Costs"
    /\blabou?r\b/,               // "Labour Costs" / "Labor Costs"
    /\bdept\b.*\bcosts?\b/,      // "Software Development Dept AH Costs"
    /\bpurchases\b(?!.*software)/, // "Purchases - Hardware" (keep "Purchases - Software")
  ];
  return blocklist.some(re => re.test(n));
}

/**
 * Phase 60 + 61: detect whether the loaded vendor list has a degraded
 * account_codes shape that breaks per-account attribution + lazy-fetch.
 *
 * Two cases are flagged:
 *   (a) Any vendor row with empty account_codes — pre-PR-#165 save-race
 *       data; vendors saved before that fix never persisted any codes.
 *   (b) Every vendor row shares the IDENTICAL set of account_codes — the
 *       pre-PR-#168 shape where the analyze API copied the full
 *       selected-account list onto every vendor. Sidebar then shows the
 *       SAME total next to every account.
 *
 * Either case → operator should re-run subscription analyze. The amber
 * banner at the top of Step 5 surfaces this state and offers a CTA.
 */
function isAccountCodesShapeDegraded(vendors: VendorBudget[]): boolean {
  if (vendors.length === 0) return false;
  // Case (a) — any empty array
  if (vendors.some(v => !v.accountCodes || v.accountCodes.length === 0)) {
    return true;
  }
  // Case (b) — every vendor shares the same (non-empty) codes. Sort each
  // vendor's codes so order doesn't fool the comparison, then count
  // distinct serialized forms.
  const distinctShapes = new Set<string>();
  for (const v of vendors) {
    const sorted = [...(v.accountCodes ?? [])].sort();
    distinctShapes.add(sorted.join(','));
    if (distinctShapes.size > 1) return false; // diversity proven, healthy
  }
  // Only flag as degraded if there are multiple vendors but only one shape.
  return vendors.length > 1 && distinctShapes.size === 1;
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
  // Phase 60: track whether vendors were loaded from existing subscription_budgets
  // (vs freshly analyzed in this session). Drives the "Confirm subscriptions"
  // banner — only show it when the operator hasn't yet acknowledged the pre-loaded
  // list for the current FY.
  const [restoredFromExistingBudgets, setRestoredFromExistingBudgets] = useState(false);
  const [subscriptionsConfirmed, setSubscriptionsConfirmed] = useState(false);
  const [hasBrokenAccountCodes, setHasBrokenAccountCodes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isManualMode, setIsManualMode] = useState(false);
  const [showAddVendor, setShowAddVendor] = useState(false);

  // Hotfix: per-vendor lazy-load state for restored vendors that have
  // transactionCount > 0 but transactions: [] (the DB doesn't persist the
  // detail array — see /api/subscription-budgets schema). When the operator
  // expands such a vendor, we fetch from /api/Xero/subscription-transactions
  // and merge into the vendor object. Result is cached on vendor.transactions
  // so subsequent expand/collapse is instant.
  const [loadingTxnKeys, setLoadingTxnKeys] = useState<Set<string>>(new Set());
  const [txnFetchErrorKeys, setTxnFetchErrorKeys] = useState<Set<string>>(new Set());
  const startMonthOptions = useMemo(
    () => buildStartMonthOptions(state.fiscalYearStart ?? fiscalYear - 1),
    [state.fiscalYearStart, fiscalYear],
  );
  const defaultStartMonth = startMonthOptions[0]?.value ?? '';
  const [newVendor, setNewVendor] = useState({
    name: '',
    frequency: 'monthly' as VendorBudget['frequency'],
    // Phase 63: single amount field interpreted in the chosen frequency's
    // unit. UI converts → monthlyBudget on submit.
    amount: 0,
    monthlyBudget: 0,
    startMonth: defaultStartMonth,
    category: MANUAL_CATEGORY_OPTIONS[0] as string,
    // Phase 63: capture renewal month for annual subs.
    renewalMonth: null as number | null,
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

    // Phase 63: split monthly-recurring vs annual-one-off totals so the
    // summary card can show both honestly. Annual subs are smoothed into
    // monthlyBudget for P&L purposes — here we surface them as lumps.
    const monthlyVendors = activeVendors.filter(v => v.frequency !== 'annual');
    const annualVendors = activeVendors.filter(v => v.frequency === 'annual');
    const monthlyRecurring = monthlyVendors.reduce((sum, v) => sum + v.monthlyBudget, 0);
    const annualLumps = annualVendors
      .map(v => ({
        vendorKey: v.vendorKey,
        vendorName: v.vendorName,
        amount: v.monthlyBudget * 12,
        renewalMonth: v.renewalMonth ?? 1, // fallback to Jan if missing
      }))
      .sort((a, b) => a.renewalMonth - b.renewalMonth || b.amount - a.amount);
    const annualLumpsTotal = annualLumps.reduce((s, l) => s + l.amount, 0);

    return {
      historical: totalHistorical,
      priorFY: totalPriorFY,
      currentFY: totalCurrentFY,
      monthlyBudget: totalMonthlyBudget,
      annualBudget: totalAnnualBudget,
      remainingFY: remainingFYBudget,
      vendorCount: activeVendors.length,
      excludedCount: vendors.length - activeVendors.length,
      monthlyRecurring,
      annualLumps,
      annualLumpsTotal,
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
        // Phase 61 (B3): the API marks accounts as `isSuggested` based on
        // name-matching against subscription keywords. That sweep is too
        // permissive on businesses with software dev expense accounts —
        // "Software Development - PK Costs" looked like a subscription
        // account but actually contains contractor payments (JDS 2026-05-12:
        // top vendor "Cohaptic LLC" at $107k/yr was a contractor swept up
        // by these accounts). Filter the default-on selection against a
        // tighter blocklist so coaches don't have to manually un-tick the
        // dev / contractor / labor accounts every time.
        isSelected: acc.isSuggested && !looksLikeContractorAccount(acc.accountName),
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
              // Phase 61 (B2): restore from persisted column (default 0
              // for legacy rows that predate the column).
              currentFYAmount: b.current_fy_spend || 0,
              currentFYCount: 0,
              totalAmount: b.last_12_months_spend || 0,
              transactionCount: b.transaction_count || 0,
              avgAmount: b.avg_transaction_amount || 0,
              firstTransaction: '',
              lastTransaction: b.last_transaction_date || '',
              transactions: [],
              monthsSpan: 12,
              accountCodes: b.account_codes || [],
              // Phase 63: restore renewal month for annual subs.
              renewalMonth: b.renewal_month ?? null,
              // Phase 64: restore per-account spend split.
              accountSplits: (b.account_splits as Record<string, number> | null) ?? {},
              isActive: b.is_active !== false,
            }));
            setVendors(existingVendors);
            setPhase('review');
            setRestoredFromExistingBudgets(true);
            // Detect "broken" restoration. Two distinct degraded shapes both
            // break per-account attribution + lazy-fetch:
            //   (a) Phase 60: any row with empty account_codes (legacy /
            //       PR #165-era save-race rows)
            //   (b) Phase 61 (B1): every row carries the IDENTICAL set of
            //       account_codes — the pre-PR-#168 "attach full selected
            //       list to every vendor" shape. Sidebar shows same total
            //       next to every account; lazy-fetch loads transactions
            //       from every selected account, not just the vendor's own.
            setHasBrokenAccountCodes(isAccountCodesShapeDegraded(existingVendors));
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
            priorFYAmount: b.last_12_months_spend || 0,
            priorFYCount: 0,
            // Phase 61 (B2): restore persisted current-FY YTD spend.
            currentFYAmount: b.current_fy_spend || 0,
            currentFYCount: 0,
            firstTransaction: '',
            lastTransaction: b.last_transaction_date || '',
            monthsSpan: 0,
            suggestedMonthlyBudget: b.monthly_budget,
            monthlyBudget: b.monthly_budget,
            transactions: [],
            isExpanded: false,
            isActive: b.is_active !== false,
            accountCodes: b.account_codes || [],
            // Phase 63: restore renewal month for annual subs.
            renewalMonth: b.renewal_month ?? null,
            // Phase 64: restore per-account spend split.
            accountSplits: (b.account_splits as Record<string, number> | null) ?? {},
          }));
          setVendors(existingVendors);
          // Phase 60/61: track restoration + detect either degraded shape
          // (empty account_codes OR all-vendors-share-identical-codes).
          setRestoredFromExistingBudgets(true);
          setHasBrokenAccountCodes(isAccountCodesShapeDegraded(existingVendors));
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
        // Phase 63: pulled from analyze API for annual subs.
        renewalMonth: v.renewalMonth ?? null,
        // Phase 64: per-account prior-FY $ amounts from the analyze step.
        accountSplits: v.accountSplits ?? {},
      }));

      // Phase 51 (UX-S6-02): merge with existing vendor list so operator's
      // isActive toggles + monthlyBudget edits are preserved across
      // re-analyze. New vendors take their incoming defaults.
      setVendors(prev => mergeByVendorKey(prev, vendorBudgets));
      setSummary(data.summary);
      setPhase('review');
      // Phase 60: a fresh analyze run produces vendors with correct accountCodes
      // (post-PR-#165 save path persists them per-vendor), so clear both flags.
      // The "Confirm subscriptions" banner is only for restored-from-DB vendors
      // that the operator hasn't acknowledged yet.
      setRestoredFromExistingBudgets(false);
      setHasBrokenAccountCodes(false);
      setSubscriptionsConfirmed(false);

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
    // Capture the vendor *before* the state update so we know whether we need
    // to lazy-fetch transactions. We use the post-toggle expanded state to
    // decide: only fetch when the operator is expanding (not collapsing).
    const target = vendors.find(v => v.vendorKey === vendorKey);
    const willExpand = target ? !target.isExpanded : false;

    setVendors(prev => prev.map(v =>
      v.vendorKey === vendorKey ? { ...v, isExpanded: !v.isExpanded } : v
    ));

    // Hotfix: lazy-fetch per-vendor transactions when expanding a restored
    // vendor that has count > 0 but no detail array. Skip in manual mode
    // (manual vendors never have Xero transactions). Skip if already loading
    // or already fetched (transactions populated).
    if (
      !target ||
      !willExpand ||
      isManualMode ||
      target.transactionCount <= 0 ||
      target.transactions.length > 0 ||
      loadingTxnKeys.has(vendorKey)
    ) {
      return;
    }

    const accountCodes = target.accountCodes && target.accountCodes.length > 0
      ? target.accountCodes
      : null;
    if (!accountCodes) {
      // No account codes recorded on the vendor — can't scope a fetch. This
      // happens for older saved budgets that predate Phase 51 (UX-S6-01).
      // Surface the failure so the operator knows expand won't help.
      setTxnFetchErrorKeys(prev => {
        const next = new Set(prev);
        next.add(vendorKey);
        return next;
      });
      return;
    }

    void fetchVendorTransactions(target.vendorKey, target.vendorName, accountCodes);
  };

  // Hotfix: pulls transactions for a single vendor by re-running the
  // existing analyze endpoint against just that vendor's account codes.
  // Match the response on vendorKey (preferred) or vendorName (fallback)
  // and merge the transactions[] into the local vendor record.
  const fetchVendorTransactions = async (
    vendorKey: string,
    vendorName: string,
    accountCodes: string[],
  ) => {
    setLoadingTxnKeys(prev => {
      const next = new Set(prev);
      next.add(vendorKey);
      return next;
    });
    setTxnFetchErrorKeys(prev => {
      if (!prev.has(vendorKey)) return prev;
      const next = new Set(prev);
      next.delete(vendorKey);
      return next;
    });

    try {
      const response = await fetch('/api/Xero/subscription-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          account_codes: accountCodes,
        }),
      });

      if (!response.ok) {
        throw new Error(`Fetch failed with status ${response.status}`);
      }

      const data = await response.json();
      const matchedVendor = (data.vendors || []).find(
        (v: any) => v.vendorKey === vendorKey || v.vendorName === vendorName,
      );

      if (!matchedVendor || !Array.isArray(matchedVendor.transactions)) {
        // Endpoint returned but no matching vendor/transactions — treat as
        // an error so the operator gets a retry option rather than the old
        // silent "No transaction details available" footer.
        throw new Error('No matching vendor in response');
      }

      const fetchedTransactions: RecentTransaction[] = matchedVendor.transactions.map((t: any) => ({
        date: t.date,
        description: t.description,
        amount: t.amount,
        source: t.source,
        period: t.period,
      }));

      setVendors(prev => prev.map(v => {
        if (v.vendorKey !== vendorKey) return v;
        // Preserve the operator's edits to monthlyBudget/isActive/etc — only
        // patch fields that were missing because the DB doesn't persist them.
        return {
          ...v,
          transactions: fetchedTransactions,
          firstTransaction: v.firstTransaction || matchedVendor.firstTransaction || '',
          monthsSpan: v.monthsSpan > 0 ? v.monthsSpan : (matchedVendor.monthsSpan || 0),
          // Backfill FY counts/amounts when missing — useful for the per-FY
          // panel headers (e.g. "Current FY YTD (12 transactions - $1,234)").
          priorFYAmount: v.priorFYAmount || matchedVendor.priorFYAmount || 0,
          priorFYCount: v.priorFYCount || matchedVendor.priorFYCount || 0,
          currentFYAmount: v.currentFYAmount || matchedVendor.currentFYAmount || 0,
          currentFYCount: v.currentFYCount || matchedVendor.currentFYCount || 0,
        };
      }));
    } catch (err) {
      console.error('[Subscriptions] Lazy-fetch transactions failed for', vendorKey, err);
      setTxnFetchErrorKeys(prev => {
        const next = new Set(prev);
        next.add(vendorKey);
        return next;
      });
    } finally {
      setLoadingTxnKeys(prev => {
        if (!prev.has(vendorKey)) return prev;
        const next = new Set(prev);
        next.delete(vendorKey);
        return next;
      });
    }
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

  // Phase 63: when a vendor is annual, the per-row input shows the annual
  // amount. Internally we still persist `monthlyBudget` (smoothed annual / 12)
  // so downstream math (rollups, sidebar attribution) stays the same — but
  // the operator sees and edits the number in its native rhythm.
  const handleAnnualBudgetChange = (vendorKey: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    updateVendor(vendorKey, { monthlyBudget: numValue / 12 });
  };

  const handleRenewalMonthChange = (vendorKey: string, monthString: string) => {
    const month = parseInt(monthString, 10);
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      updateVendor(vendorKey, { renewalMonth: month });
    }
  };

  const addManualVendor = () => {
    if (!newVendor.name.trim() || newVendor.amount <= 0) return;

    // Phase 63: convert the entered amount from its native rhythm into the
    // canonical smoothed monthlyBudget. P&L math everywhere downstream uses
    // monthlyBudget; the operator never has to do this conversion themselves.
    const monthlyBudget =
      newVendor.frequency === 'annual'
        ? newVendor.amount / 12
        : newVendor.frequency === 'quarterly'
          ? newVendor.amount / 3
          : newVendor.amount;

    // Check for duplicate vendor key
    const vendorKey = newVendor.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (vendors.some(v => v.vendorKey === vendorKey)) {
      setError(`"${newVendor.name}" already exists. Edit the existing entry instead.`);
      return;
    }

    const vendor = createManualVendor({
      name: newVendor.name.trim(),
      frequency: newVendor.frequency,
      monthlyBudget,
      startMonth: newVendor.startMonth,
      category: newVendor.category,
    });
    // Stamp renewalMonth for annual subs (createManualVendor doesn't know
    // about this field; we patch it on after).
    vendor.renewalMonth = newVendor.frequency === 'annual' ? newVendor.renewalMonth : null;
    setVendors(prev => [...prev, vendor]);
    setNewVendor({
      name: '',
      frequency: 'monthly',
      amount: 0,
      monthlyBudget: 0,
      startMonth: defaultStartMonth,
      category: MANUAL_CATEGORY_OPTIONS[0],
      renewalMonth: null,
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
            // Phase 61 (B2): persist current-FY YTD spend so it survives a
            // page refresh. Without this, restoring from DB always shows $0.
            currentFySpend: v.currentFYAmount,
            transactionCount: v.transactionCount,
            avgTransactionAmount: v.avgAmount,
            lastTransactionDate: v.lastTransaction || null,
            // Per-vendor accountCodes from the vendor object (set at analyze
            // time, line 486). Previously read from `summary?.accountsAnalyzed`,
            // which suffered a React state-flush race when saveSubscriptionBudgets
            // ran immediately after analyzeSubscriptions's setSummary — the
            // closure still saw `summary = null` and wrote `[]` for every row,
            // breaking the lazy-fetch transaction expand later.
            accountCodes: v.accountCodes || [],
            // Phase 63: persist renewalMonth so native-rhythm display
            // survives a page refresh.
            renewalMonth: v.renewalMonth ?? null,
            // Phase 64: persist per-account spend split.
            accountSplits: v.accountSplits ?? {},
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

  // Mirror component-local `vendors` → wizard `state.subscriptions` so the
  // BudgetFramework on Step 6 (OpEx) subtracts a fresh subscription total
  // instead of the one-time mount-fetch snapshot from useForecastWizard.
  // Without this, edits/analysis here never reach the OpEx ceiling math,
  // which silently overstates "Available OpEx" by the unsaved delta.
  useEffect(() => {
    if (phase !== 'review') return;
    actions.setSubscriptions(vendors);
  }, [vendors, phase, actions]);

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
              {/* Per-operator request 2026-05-12: drop per-account dollar
                  totals from the sidebar. They were a source of confusion
                  (multi-account vendors made the attribution math hard to
                  trust). Sidebar now just shows the selected accounts +
                  an Edit button to revise selection. The full attribution
                  data still flows through accountSplits — just isn't
                  surfaced here. */}
              {accounts.filter(a => a.isSelected).length === 0 ? (
                <p className="text-xs text-gray-500 italic">No accounts selected.</p>
              ) : (
                <ul className="space-y-1.5">
                  {accounts.filter(a => a.isSelected).map(account => (
                    <li key={account.accountId} className="text-sm text-gray-700 truncate" title={account.accountName}>
                      {account.accountName}
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => setPhase('select-accounts')}
                className="mt-4 w-full text-xs px-2 py-1.5 border border-gray-300 rounded text-gray-700 hover:bg-white"
              >
                Edit selected accounts
              </button>
            </aside>
          )}
          <div className="flex-1 min-w-0 space-y-6">
          {/* Phase 60 — broken-account-codes banner (60-01).
              Shown when restored budgets have empty account_codes arrays,
              which breaks lazy-fetch of transactions on vendor expand.
              Single CTA points the operator at the existing re-analyze flow. */}
          {hasBrokenAccountCodes && !isManualMode && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-900">
                  Transaction details are unavailable for some vendors
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  These subscriptions were saved before the 2026-05-11 fix and have
                  empty account codes. Expanding a vendor will show an error instead
                  of transactions. Re-run subscription analysis to restore.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setRestoredFromExistingBudgets(false);
                    setHasBrokenAccountCodes(false);
                    setSubscriptionsConfirmed(false);
                    setPhase('select-accounts');
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-md"
                >
                  <RefreshCw className="w-4 h-4" />
                  Re-run subscription analysis
                </button>
              </div>
            </div>
          )}

          {/* Phase 60 — confirm subscriptions banner (60-02).
              Shown only when vendors were RESTORED from subscription_budgets
              (not freshly analyzed this session) AND the operator hasn't yet
              acknowledged the pre-loaded list. The banner reminds them the
              list came from a previous forecast and invites explicit confirm. */}
          {restoredFromExistingBudgets && !subscriptionsConfirmed && !isManualMode && (
            <div className="rounded-lg border border-brand-navy/20 bg-brand-navy/5 p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-brand-navy flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-brand-navy">
                  Loaded {vendors.length} {vendors.length === 1 ? 'subscription' : 'subscriptions'} from your previous forecast
                </p>
                <p className="mt-1 text-sm text-gray-700">
                  Review the vendor list, mark any as inactive that no longer apply,
                  then confirm. You can also re-run analysis if you want to pick up
                  new vendors from Xero.
                </p>
                <button
                  type="button"
                  onClick={() => setSubscriptionsConfirmed(true)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand-navy hover:bg-brand-navy-800 rounded-md"
                >
                  <CheckCircle className="w-4 h-4" />
                  Confirm subscriptions for FY{fiscalYear}
                </button>
              </div>
            </div>
          )}
          {restoredFromExistingBudgets && subscriptionsConfirmed && !isManualMode && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-green-800">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span>Subscriptions confirmed for FY{fiscalYear} ({vendors.filter(v => v.isActive).length} active)</span>
              </div>
              <button
                type="button"
                onClick={() => setSubscriptionsConfirmed(false)}
                className="text-xs text-green-700 hover:text-green-900 underline"
              >
                Unconfirm
              </button>
            </div>
          )}

          {/* Phase 62 (62-02): single honest summary line replacing the
              5-card grid. The old grid showed Prior FY, Current FY YTD,
              Monthly Budget, Annual Budget, Remaining FY — too many big
              numbers, mixing historical (analyze) and forward-looking
              (budget) without explaining which is which. The new single
              line shows the one number that matters (total annual
              subscription budget) with the monthly-recurring vs annual-
              one-offs breakdown explicit. */}
          <div className="rounded-xl p-5 bg-gradient-to-br from-brand-navy to-brand-navy-800 text-white">
            <p className="text-xs uppercase tracking-wide text-white/70 mb-1">
              Total subscription budget
            </p>
            <p className="text-3xl font-bold tabular-nums">
              {formatCurrency(totals.annualBudget)}<span className="text-base font-normal text-white/80 ml-1">/yr</span>
            </p>
            <p className="mt-2 text-sm text-white/90">
              {formatCurrency(totals.monthlyRecurring)}/mo every month
              {totals.annualLumps.length > 0 && (
                <> + <strong>{formatCurrency(totals.annualLumpsTotal)}</strong> in {totals.annualLumps.length} annual renewal{totals.annualLumps.length !== 1 ? 's' : ''}</>
              )}
            </p>
            {totals.annualLumps.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/80">
                {totals.annualLumps.slice(0, 6).map(lump => (
                  <span key={lump.vendorKey}>
                    {MONTH_ABBREVS_LOCAL[lump.renewalMonth - 1]}: {formatCurrency(lump.amount)} <span className="text-white/60">({lump.vendorName})</span>
                  </span>
                ))}
                {totals.annualLumps.length > 6 && (
                  <span className="text-white/60">+ {totals.annualLumps.length - 6} more</span>
                )}
              </div>
            )}
            <p className="mt-3 text-xs text-white/60">
              {totals.vendorCount} active vendor{totals.vendorCount !== 1 ? 's' : ''}
              {/* Phase 64: use absolute date windows instead of "prior FY" /
                  "current FY YTD" — operators planning a future FY found
                  the FY-relative labels confusing (which FY?). */}
              {!isManualMode && summary?.dateRange?.priorFY && (
                <> · {summary.dateRange.priorFY.from} – {summary.dateRange.priorFY.to}: <strong>{formatCurrency(totals.priorFY)}</strong> actual</>
              )}
              {!isManualMode && summary?.dateRange?.currentFY && totals.currentFY > 0 && (
                <> · {summary.dateRange.currentFY.from} – {summary.dateRange.currentFY.to}: <strong>{formatCurrency(totals.currentFY)}</strong> YTD</>
              )}
            </p>
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

          {/* Phase 62: replace the old P&L Reconciliation panel with a single
              honest sentence. The old panel surfaced a "Transactions Analyzed
              vs Xero P&L Actual" variance the operator could never reconcile
              (the two metrics measure different things — recurring vendors
              vs total account spend). Coaches reported it as confusing noise.
              The new sentence directs them at the correct next step (OpEx)
              for non-recurring spend instead of waving a red flag. */}
          {!isManualMode && summary?.reconciliation && (() => {
            const priorActual = summary.reconciliation.priorFY.actual ?? 0
            const priorRecurring = totals.priorFY
            const nonRecurringAnnual = Math.max(0, priorActual - priorRecurring)
            const nonRecurringMonthly = nonRecurringAnnual / 12
            // Only render the note if there's a meaningful gap. Below ~$100/mo
            // of unclassified spend isn't actionable and adds visual noise.
            if (nonRecurringMonthly < 100) return null
            return (
              <div className="rounded-lg bg-blue-50/40 border border-blue-100 px-4 py-3 text-sm text-gray-700">
                We identified <strong>{totals.vendorCount}</strong> recurring vendors totalling{' '}
                <strong>{formatCurrency(totals.monthlyBudget)}/mo</strong>. The other{' '}
                <strong>~{formatCurrency(nonRecurringMonthly)}/mo</strong> of spending in these
                accounts (one-offs, ad-hoc purchases, journal entries) won&apos;t be in this
                forecast — budget them under OpEx in Step 6.
              </div>
            )
          })()}

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
                  {/* Phase 63 (63-04): single amount input labelled by
                      frequency. The operator enters "$1,200/yr" for an
                      annual sub directly — no monthly/annual mental math. */}
                  <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-gray-700">
                    Amount {newVendor.frequency === 'annual' ? '($/yr)' : newVendor.frequency === 'quarterly' ? '($/qtr)' : '($/mo)'}
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        value={newVendor.amount || ''}
                        onChange={(e) => setNewVendor({ ...newVendor, amount: parseFloat(e.target.value) || 0 })}
                        placeholder={newVendor.frequency === 'annual' ? 'Annual' : newVendor.frequency === 'quarterly' ? 'Quarterly' : 'Monthly'}
                        className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-navy font-normal"
                        onKeyDown={(e) => e.key === 'Enter' && addManualVendor()}
                      />
                    </div>
                  </label>
                  {newVendor.frequency === 'annual' ? (
                    <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-gray-700">
                      Renewal month
                      <select
                        value={newVendor.renewalMonth ?? ''}
                        onChange={(e) => setNewVendor({ ...newVendor, renewalMonth: e.target.value ? parseInt(e.target.value, 10) : null })}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy font-normal"
                      >
                        <option value="">— Select —</option>
                        {MONTH_ABBREVS_LOCAL.map((m, i) => (
                          <option key={m} value={i + 1}>{m}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
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
                  )}
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
                          amount: 0,
                          monthlyBudget: 0,
                          startMonth: defaultStartMonth,
                          category: MANUAL_CATEGORY_OPTIONS[0],
                          renewalMonth: null,
                        });
                      }}
                      className="px-3 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={addManualVendor}
                      disabled={
                        !newVendor.name.trim() ||
                        newVendor.amount <= 0 ||
                        (newVendor.frequency === 'annual' && !newVendor.renewalMonth)
                      }
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
                          {/* Phase 63: render in native rhythm. Annual subs
                              show as "$X/yr" with a renewal-month dropdown
                              alongside; all others stay as "$X/mo". */}
                          {vendor.frequency === 'annual' ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <div className="relative flex-1 max-w-[110px]">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                                <input
                                  type="number"
                                  value={(vendor.monthlyBudget * 12).toFixed(2)}
                                  onChange={(e) => handleAnnualBudgetChange(vendor.vendorKey, e.target.value)}
                                  disabled={!vendor.isActive}
                                  className="w-full pl-7 pr-9 py-1.5 text-sm text-right border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:bg-gray-100 tabular-nums"
                                  step="0.01"
                                  min="0"
                                  title="Annual cost — smoothed to monthly for forecasting"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">/yr</span>
                              </div>
                              <select
                                value={vendor.renewalMonth ?? ''}
                                onChange={(e) => handleRenewalMonthChange(vendor.vendorKey, e.target.value)}
                                disabled={!vendor.isActive}
                                className="text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:bg-gray-100"
                                title="Renewal month"
                              >
                                {!vendor.renewalMonth && <option value="">—</option>}
                                {MONTH_ABBREVS_LOCAL.map((m, i) => (
                                  <option key={m} value={i + 1}>{m}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                              <input
                                type="number"
                                value={vendor.monthlyBudget}
                                onChange={(e) => handleMonthlyBudgetChange(vendor.vendorKey, e.target.value)}
                                disabled={!vendor.isActive}
                                className="w-full pl-7 pr-9 py-1.5 text-sm text-right border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:bg-gray-100 tabular-nums"
                                step="0.01"
                                min="0"
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">/mo</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900 tabular-nums">
                          {formatCurrency(vendor.monthlyBudget * 12)}
                          {vendor.frequency === 'annual' && vendor.renewalMonth && (
                            <span className="block text-xs text-gray-400 mt-0.5">paid {MONTH_ABBREVS_LOCAL[vendor.renewalMonth - 1]}</span>
                          )}
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

                              {/* Hotfix: per-vendor lazy-load states. */}
                              {vendor.transactions.length === 0 && loadingTxnKeys.has(vendor.vendorKey) && (
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Loading transactions...
                                </div>
                              )}

                              {vendor.transactions.length === 0
                                && !loadingTxnKeys.has(vendor.vendorKey)
                                && txnFetchErrorKeys.has(vendor.vendorKey) && (
                                <div className="rounded border border-red-200 bg-red-50 p-3">
                                  <p className="text-sm text-red-800">
                                    {(!vendor.accountCodes || vendor.accountCodes.length === 0)
                                      ? <>Account codes missing for this vendor — can&apos;t load transactions until subscription analysis is re-run.</>
                                      : <>Failed to load transactions for this vendor.</>}
                                  </p>
                                  <div className="mt-2 flex items-center gap-2">
                                    {vendor.accountCodes && vendor.accountCodes.length > 0 ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          void fetchVendorTransactions(vendor.vendorKey, vendor.vendorName, vendor.accountCodes!);
                                        }}
                                        className="text-xs px-2 py-1 bg-white border border-red-300 text-red-700 rounded hover:bg-red-50"
                                      >
                                        Try again
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setRestoredFromExistingBudgets(false);
                                          setHasBrokenAccountCodes(false);
                                          setSubscriptionsConfirmed(false);
                                          setPhase('select-accounts');
                                        }}
                                        className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-amber-600 text-white rounded hover:bg-amber-700"
                                      >
                                        <RefreshCw className="w-3 h-3" />
                                        Re-run subscription analysis
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}

                              {vendor.transactions.length === 0
                                && !loadingTxnKeys.has(vendor.vendorKey)
                                && !txnFetchErrorKeys.has(vendor.vendorKey) && (
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
