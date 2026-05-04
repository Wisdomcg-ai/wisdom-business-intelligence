/**
 * Phase 51 — UX-S6-02: Step 6 re-analyze preserves vendor toggles
 *
 * Today's bug: `analyzeSubscriptions` calls `setVendors(vendorBudgets)` which
 * REPLACES the array, wiping operator's `isActive` toggles and `monthlyBudget`
 * edits when re-analyzing the same accounts.
 *
 * Fix: a `mergeByVendorKey(prev, incoming)` helper that:
 *   - For each incoming vendor, looks up the existing vendor by `vendorKey`
 *   - If found, preserves the existing `isActive` and `monthlyBudget`
 *   - If not found (new vendor), uses the incoming vendor as-is
 *
 * Test 1 (UI integration):
 *   - Render Step 6 in 'review' with 2 vendors → toggle v1 off → click
 *     "Change selected accounts" button → phase transitions to 'select-accounts'
 *     and vendors state is UNCHANGED (v1 still isActive=false).
 *
 * Tests 2 & 3 (unit on mergeByVendorKey):
 *   - Test 2: previous = [v1(off), v2(on)]; incoming = [v1, v2, v3]
 *             → merged = [v1(off, prev monthlyBudget), v2(on, prev monthlyBudget), v3(default)]
 *   - Test 3: previous = [v1(off), v2(on)]; incoming = [v1] (v2 dropped because account no longer selected)
 *             → merged = [v1(off, prev monthlyBudget)]
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step6Subscriptions, mergeByVendorKey } from '@/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions';
import type { ForecastWizardState, WizardActions } from '@/app/finances/forecast/components/wizard-v4/types';

const FY_START_YEAR = 2025;
const FISCAL_YEAR_END = 2026;
const BUSINESS_ID = 'biz-step6-reanalyze';

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeStubState(): ForecastWizardState {
  return {
    wizardVersion: 10,
    businessId: BUSINESS_ID,
    fiscalYearStart: FY_START_YEAR,
    status: 'draft',
    forecastDuration: 1,
    durationLocked: false,
    currentStep: 6,
    activeYear: 1,
    businessProfile: null,
    goals: {
      year1: { revenue: 0, grossProfitPct: 50, netProfitPct: 15 },
      year2: { revenue: 0, grossProfitPct: 52, netProfitPct: 17 },
      year3: { revenue: 0, grossProfitPct: 55, netProfitPct: 20 },
    },
    priorYear: null,
    currentYTD: null,
    revenuePattern: 'seasonal',
    revenueLines: [],
    cogsLines: [],
    teamMembers: [],
    newHires: [],
    departures: [],
    bonuses: [],
    commissions: [],
    defaultOpExIncreasePct: 3,
    opexLines: [],
    capexItems: [],
    investments: [],
    plannedSpends: [],
    otherExpenses: [],
  };
}

function makeStubActions(): WizardActions {
  const names = [
    'goToStep', 'nextStep', 'prevStep', 'setActiveYear',
    'setBusinessProfile', 'setForecastDuration', 'updateGoals',
    'setPriorYear', 'setRevenuePattern', 'setRevenueLines', 'setCOGSLines',
    'updateRevenueLine', 'addRevenueLine', 'removeRevenueLine',
    'updateCOGSLine', 'addCOGSLine', 'removeCOGSLine',
    'updateTeamMember', 'addTeamMember', 'removeTeamMember',
    'addNewHire', 'updateNewHire', 'removeNewHire',
    'addDeparture', 'removeDeparture',
    'addBonus', 'updateBonus', 'removeBonus',
    'addCommission', 'updateCommission', 'removeCommission',
    'setDefaultOpExIncreasePct', 'setOpExLines',
    'updateOpExLine', 'addOpExLine', 'removeOpExLine',
    'addCapExItem', 'updateCapExItem', 'removeCapExItem',
    'addInvestment', 'updateInvestment', 'removeInvestment',
    'addPlannedSpend', 'updatePlannedSpend', 'removePlannedSpend',
    'addOtherExpense', 'updateOtherExpense', 'removeOtherExpense',
    'initializeFromXero', 'saveDraft', 'generateForecast',
  ] as const;
  const obj: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const n of names) obj[n] = vi.fn();
  return obj as unknown as WizardActions;
}

function makeBudget(opts: { vendorKey: string; vendorName: string; monthlyBudget: number; isActive?: boolean; accountCodes?: string[] }) {
  return {
    vendor_name: opts.vendorName,
    vendor_key: opts.vendorKey,
    frequency: 'monthly',
    monthly_budget: opts.monthlyBudget,
    last_12_months_spend: opts.monthlyBudget * 12,
    transaction_count: 12,
    avg_transaction_amount: opts.monthlyBudget,
    last_transaction_date: '2026-04-01',
    account_codes: opts.accountCodes ?? ['6100'],
    is_active: opts.isActive ?? true,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// UX-S6-02 — Step 6 re-analyze preserves vendor toggles
// ────────────────────────────────────────────────────────────────────────────

describe('UX-S6-02 — Step 6 re-analyze preserves vendor toggles', () => {
  it('Test 1: clicking "Change selected accounts" preserves vendor isActive toggles', async () => {
    const user = userEvent.setup();

    vi.stubGlobal('fetch', vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes('/api/Xero/chart-of-accounts')) {
        const accounts = [
          { accountId: 'acc-1', accountCode: '6100', accountName: 'Software', accountType: 'EXPENSE', isSuggested: true },
        ];
        return new Response(JSON.stringify({ accounts }), { status: 200 });
      }
      if (u.includes('/api/subscription-budgets')) {
        const budgets = [
          makeBudget({ vendorKey: 'notion', vendorName: 'Notion', monthlyBudget: 50 }),
          makeBudget({ vendorKey: 'aws', vendorName: 'AWS', monthlyBudget: 200 }),
        ];
        return new Response(JSON.stringify({ budgets }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }));

    const state = makeStubState();
    const actions = makeStubActions();
    render(<Step6Subscriptions state={state} actions={actions} fiscalYear={FISCAL_YEAR_END} businessId={BUSINESS_ID} />);

    await waitFor(() => {
      expect(screen.getByText(/Subscription Budgets/i)).toBeInTheDocument();
    });

    // Toggle Notion off
    const notionRow = screen.getByText('Notion').closest('tr') as HTMLElement;
    const notionCheckbox = within(notionRow).getByRole('checkbox') as HTMLInputElement;
    expect(notionCheckbox.checked).toBe(true);
    await user.click(notionCheckbox);
    expect(notionCheckbox.checked).toBe(false);

    // Click "Change selected accounts" (renamed from "Re-analyze")
    const changeBtn = screen.getByRole('button', { name: /change selected accounts/i });
    await user.click(changeBtn);

    // Now in 'select-accounts' phase
    await waitFor(() => {
      expect(screen.getByText(/Select Accounts to Analyze/i)).toBeInTheDocument();
    });

    // Vendor row not visible in this phase, but the state must be preserved.
    // We assert by going back: click "Analyze Subscriptions" again with the same selection.
    // Setup the analyze endpoint to return the same 2 vendors.
    vi.stubGlobal('fetch', vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      if (u.includes('/api/Xero/subscription-transactions')) {
        return new Response(JSON.stringify({
          vendors: [
            { vendorName: 'Notion', vendorKey: 'notion', suggestedFrequency: 'monthly', confidence: 'high', totalAmount: 600, avgAmount: 50, transactionCount: 12, priorFYAmount: 600, priorFYCount: 12, currentFYAmount: 0, currentFYCount: 0, firstTransaction: '2025-07-01', lastTransaction: '2026-04-01', monthsSpan: 12, suggestedMonthlyBudget: 50, transactions: [] },
            { vendorName: 'AWS', vendorKey: 'aws', suggestedFrequency: 'monthly', confidence: 'high', totalAmount: 2400, avgAmount: 200, transactionCount: 12, priorFYAmount: 2400, priorFYCount: 12, currentFYAmount: 0, currentFYCount: 0, firstTransaction: '2025-07-01', lastTransaction: '2026-04-01', monthsSpan: 12, suggestedMonthlyBudget: 200, transactions: [] },
          ],
          summary: { totalVendors: 2, totalTransactions: 24, totalAmount: 3000, priorFYTotal: 3000, currentFYTotal: 0, suggestedMonthlyTotal: 250, suggestedAnnualTotal: 3000, dateRange: { from: '2025-07-01', to: '2026-04-01', priorFY: { from: '2025-07-01', to: '2026-06-30' }, currentFY: { from: '2026-07-01', to: '2026-04-01' } }, accountsAnalyzed: ['6100'] },
        }), { status: 200 });
      }
      if (u.includes('/api/subscription-budgets')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }));

    const analyzeBtn = screen.getByRole('button', { name: /analyze subscriptions/i });
    await user.click(analyzeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Subscription Budgets/i)).toBeInTheDocument();
    });

    // Re-find Notion row; checkbox should still be unchecked (preserved)
    await waitFor(() => {
      const notionRow2 = screen.getByText('Notion').closest('tr') as HTMLElement;
      const notionCheckbox2 = within(notionRow2).getByRole('checkbox') as HTMLInputElement;
      expect(notionCheckbox2.checked).toBe(false);
    });
  });

  it('Test 2: mergeByVendorKey preserves isActive + monthlyBudget for matching vendorKeys, adds new vendors', () => {
    const prev = [
      { vendorKey: 'notion', vendorName: 'Notion', isActive: false, monthlyBudget: 75, frequency: 'monthly' as const, suggestedFrequency: 'monthly' as const, confidence: 'high' as const, totalAmount: 600, avgAmount: 50, transactionCount: 12, priorFYAmount: 600, priorFYCount: 12, currentFYAmount: 0, currentFYCount: 0, firstTransaction: '', lastTransaction: '', monthsSpan: 12, suggestedMonthlyBudget: 50, transactions: [], isExpanded: false },
      { vendorKey: 'aws', vendorName: 'AWS', isActive: true, monthlyBudget: 200, frequency: 'monthly' as const, suggestedFrequency: 'monthly' as const, confidence: 'high' as const, totalAmount: 2400, avgAmount: 200, transactionCount: 12, priorFYAmount: 2400, priorFYCount: 12, currentFYAmount: 0, currentFYCount: 0, firstTransaction: '', lastTransaction: '', monthsSpan: 12, suggestedMonthlyBudget: 200, transactions: [], isExpanded: false },
    ];

    const incoming = [
      { vendorKey: 'notion', vendorName: 'Notion', isActive: true, monthlyBudget: 50, frequency: 'monthly' as const, suggestedFrequency: 'monthly' as const, confidence: 'high' as const, totalAmount: 600, avgAmount: 50, transactionCount: 12, priorFYAmount: 600, priorFYCount: 12, currentFYAmount: 0, currentFYCount: 0, firstTransaction: '', lastTransaction: '', monthsSpan: 12, suggestedMonthlyBudget: 50, transactions: [], isExpanded: false },
      { vendorKey: 'aws', vendorName: 'AWS', isActive: true, monthlyBudget: 200, frequency: 'monthly' as const, suggestedFrequency: 'monthly' as const, confidence: 'high' as const, totalAmount: 2400, avgAmount: 200, transactionCount: 12, priorFYAmount: 2400, priorFYCount: 12, currentFYAmount: 0, currentFYCount: 0, firstTransaction: '', lastTransaction: '', monthsSpan: 12, suggestedMonthlyBudget: 200, transactions: [], isExpanded: false },
      { vendorKey: 'slack', vendorName: 'Slack', isActive: true, monthlyBudget: 30, frequency: 'monthly' as const, suggestedFrequency: 'monthly' as const, confidence: 'medium' as const, totalAmount: 360, avgAmount: 30, transactionCount: 12, priorFYAmount: 360, priorFYCount: 12, currentFYAmount: 0, currentFYCount: 0, firstTransaction: '', lastTransaction: '', monthsSpan: 12, suggestedMonthlyBudget: 30, transactions: [], isExpanded: false },
    ];

    const merged = mergeByVendorKey(prev, incoming);

    expect(merged).toHaveLength(3);

    const notion = merged.find(v => v.vendorKey === 'notion')!;
    expect(notion.isActive).toBe(false); // preserved from prev
    expect(notion.monthlyBudget).toBe(75); // preserved from prev

    const aws = merged.find(v => v.vendorKey === 'aws')!;
    expect(aws.isActive).toBe(true);
    expect(aws.monthlyBudget).toBe(200);

    const slack = merged.find(v => v.vendorKey === 'slack')!;
    expect(slack.isActive).toBe(true); // default for new
    expect(slack.monthlyBudget).toBe(30); // from incoming
  });

  it('Test 3: mergeByVendorKey drops vendors not in incoming (account no longer selected) and preserves remaining', () => {
    const prev = [
      { vendorKey: 'notion', vendorName: 'Notion', isActive: false, monthlyBudget: 75, frequency: 'monthly' as const, suggestedFrequency: 'monthly' as const, confidence: 'high' as const, totalAmount: 600, avgAmount: 50, transactionCount: 12, priorFYAmount: 600, priorFYCount: 12, currentFYAmount: 0, currentFYCount: 0, firstTransaction: '', lastTransaction: '', monthsSpan: 12, suggestedMonthlyBudget: 50, transactions: [], isExpanded: false },
      { vendorKey: 'aws', vendorName: 'AWS', isActive: true, monthlyBudget: 200, frequency: 'monthly' as const, suggestedFrequency: 'monthly' as const, confidence: 'high' as const, totalAmount: 2400, avgAmount: 200, transactionCount: 12, priorFYAmount: 2400, priorFYCount: 12, currentFYAmount: 0, currentFYCount: 0, firstTransaction: '', lastTransaction: '', monthsSpan: 12, suggestedMonthlyBudget: 200, transactions: [], isExpanded: false },
    ];

    // AWS account no longer selected → only Notion comes back
    const incoming = [
      { vendorKey: 'notion', vendorName: 'Notion', isActive: true, monthlyBudget: 50, frequency: 'monthly' as const, suggestedFrequency: 'monthly' as const, confidence: 'high' as const, totalAmount: 600, avgAmount: 50, transactionCount: 12, priorFYAmount: 600, priorFYCount: 12, currentFYAmount: 0, currentFYCount: 0, firstTransaction: '', lastTransaction: '', monthsSpan: 12, suggestedMonthlyBudget: 50, transactions: [], isExpanded: false },
    ];

    const merged = mergeByVendorKey(prev, incoming);

    expect(merged).toHaveLength(1);
    expect(merged[0].vendorKey).toBe('notion');
    expect(merged[0].isActive).toBe(false); // preserved
    expect(merged[0].monthlyBudget).toBe(75); // preserved
  });
});
