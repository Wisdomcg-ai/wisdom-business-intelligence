/**
 * Phase 51 — UX-S6-01: Step 6 Subscriptions sidebar with selected accounts
 *
 * Sidebar shows the names of operator-selected Xero accounts AND a per-account
 * total computed from active vendors mapped to that account. Visible only in
 * `phase === 'review'`.
 *
 * Test infra mocks fetch so Step 6 can be driven into the 'review' phase
 * deterministically. We seed the component with:
 *   - chart-of-accounts: 3 accounts (2 with isSuggested=true → preselected)
 *   - subscription-budgets GET: 2 active vendors mapped to the selected accounts
 *
 * The sidebar should:
 *   - List ONLY the selected accounts
 *   - Show per-account totals (sum of monthlyBudget across active vendors with
 *     accountCodes matching that account's code)
 *   - Update reactively when a vendor toggles isActive
 *   - Show empty state "No accounts selected." when zero are selected
 *   - NOT render in phase === 'select-accounts'
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step6Subscriptions } from '@/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions';
import type { ForecastWizardState, WizardActions } from '@/app/finances/forecast/components/wizard-v4/types';

// ────────────────────────────────────────────────────────────────────────────
// Test infra
// ────────────────────────────────────────────────────────────────────────────

const FY_START_YEAR = 2025;
const FISCAL_YEAR_END = 2026;
const BUSINESS_ID = 'biz-step6-sidebar';

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
  // Default fetch mock — overridden per test
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
    'setBusinessProfile',
    'setForecastDuration', 'updateGoals',
    'setPriorYear',
    'setRevenuePattern', 'setRevenueLines', 'setCOGSLines',
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

/**
 * Mock fetch so Step 6 mounts straight into phase='review' (xero mode).
 *
 * Sequence:
 *   1. GET /api/Xero/chart-of-accounts → 3 accounts (2 preselected via isSuggested)
 *   2. GET /api/subscription-budgets → 2 saved vendors mapped to the 2 selected accounts
 *      → component restores them and calls setPhase('review')
 *
 * The component leaves isManualMode=false because the chart-of-accounts call
 * succeeded.
 */
function setupReviewPhaseMocks(opts?: { extraVendors?: Array<{ vendorKey: string; vendorName: string; monthlyBudget: number; accountCodes: string[]; isActive?: boolean }> }) {
  const accounts = [
    { accountId: 'acc-1', accountCode: '6100', accountName: 'Software Subscriptions', accountType: 'EXPENSE', isSuggested: true },
    { accountId: 'acc-2', accountCode: '6200', accountName: 'Cloud Hosting', accountType: 'EXPENSE', isSuggested: true },
    { accountId: 'acc-3', accountCode: '6300', accountName: 'Other Expenses', accountType: 'EXPENSE', isSuggested: false },
  ];

  const baseBudgets = [
    {
      vendor_name: 'Notion',
      vendor_key: 'notion',
      frequency: 'monthly',
      monthly_budget: 50,
      last_12_months_spend: 600,
      transaction_count: 12,
      avg_transaction_amount: 50,
      last_transaction_date: '2026-04-01',
      account_codes: ['6100'],
      is_active: true,
    },
    {
      vendor_name: 'AWS',
      vendor_key: 'aws',
      frequency: 'monthly',
      monthly_budget: 200,
      last_12_months_spend: 2400,
      transaction_count: 12,
      avg_transaction_amount: 200,
      last_transaction_date: '2026-04-01',
      account_codes: ['6200'],
      is_active: true,
    },
  ];

  const extra = (opts?.extraVendors ?? []).map(v => ({
    vendor_name: v.vendorName,
    vendor_key: v.vendorKey,
    frequency: 'monthly',
    monthly_budget: v.monthlyBudget,
    last_12_months_spend: v.monthlyBudget * 12,
    transaction_count: 12,
    avg_transaction_amount: v.monthlyBudget,
    last_transaction_date: '2026-04-01',
    account_codes: v.accountCodes,
    is_active: v.isActive ?? true,
  }));

  const budgets = [...baseBudgets, ...extra];

  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (u.includes('/api/Xero/chart-of-accounts')) {
      return new Response(JSON.stringify({ accounts }), { status: 200 });
    }
    if (u.includes('/api/subscription-budgets')) {
      return new Response(JSON.stringify({ budgets }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  }));
}

async function renderStep6AtReview() {
  const state = makeStubState();
  const actions = makeStubActions();
  render(<Step6Subscriptions state={state} actions={actions} fiscalYear={FISCAL_YEAR_END} businessId={BUSINESS_ID} />);
  // Wait for phase to settle into 'review' (vendors restored)
  await waitFor(() => {
    expect(screen.getByText(/Subscription Budgets/i)).toBeInTheDocument();
  });
}

// ────────────────────────────────────────────────────────────────────────────
// UX-S6-01 — Step 6 sidebar with selected accounts
// ────────────────────────────────────────────────────────────────────────────

describe('UX-S6-01 — Step 6 sidebar with selected accounts', () => {
  it('Test 1: renders sidebar listing selected accounts with per-account vendor sums', async () => {
    setupReviewPhaseMocks();
    await renderStep6AtReview();

    // Sidebar is an <aside> → role="complementary"
    const sidebar = await screen.findByRole('complementary', { name: /selected accounts/i });
    expect(sidebar).toBeInTheDocument();

    // Selected accounts (preselected via isSuggested=true): "Software Subscriptions" and "Cloud Hosting"
    expect(within(sidebar).getByText('Software Subscriptions')).toBeInTheDocument();
    expect(within(sidebar).getByText('Cloud Hosting')).toBeInTheDocument();

    // Unselected account "Other Expenses" must NOT be in the sidebar
    expect(within(sidebar).queryByText('Other Expenses')).toBeNull();

    // Per-account totals: Notion ($50/mo) → Software Subscriptions; AWS ($200/mo) → Cloud Hosting
    expect(within(sidebar).getByText('$50')).toBeInTheDocument();
    expect(within(sidebar).getByText('$200')).toBeInTheDocument();
  });

  it('Test 2: toggling a vendor isActive=false drops its account total to $0', async () => {
    const user = userEvent.setup();
    setupReviewPhaseMocks();
    await renderStep6AtReview();

    const sidebar = await screen.findByRole('complementary', { name: /selected accounts/i });
    expect(within(sidebar).getByText('$50')).toBeInTheDocument();

    // Toggle Notion (mapped to Software Subscriptions) off via the include checkbox.
    // Find the row containing 'Notion' in the vendor table, then its checkbox.
    const notionRow = screen.getByText('Notion').closest('tr');
    expect(notionRow).not.toBeNull();
    const notionCheckbox = within(notionRow as HTMLElement).getByRole('checkbox');
    await user.click(notionCheckbox);

    // Sidebar reactively reflects: Software Subscriptions total → $0
    await waitFor(() => {
      const softwareRow = within(sidebar).getByText('Software Subscriptions').closest('li');
      expect(softwareRow).not.toBeNull();
      expect(within(softwareRow as HTMLElement).getByText('$0')).toBeInTheDocument();
    });

    // Cloud Hosting remains $200
    const cloudRow = within(sidebar).getByText('Cloud Hosting').closest('li');
    expect(within(cloudRow as HTMLElement).getByText('$200')).toBeInTheDocument();
  });

  it('Test 3: shows "No accounts selected." italic empty state when zero accounts selected', async () => {
    // Mock chart-of-accounts to return accounts with NONE preselected
    vi.stubGlobal('fetch', vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes('/api/Xero/chart-of-accounts')) {
        const accounts = [
          { accountId: 'acc-1', accountCode: '6100', accountName: 'Software', accountType: 'EXPENSE', isSuggested: false },
        ];
        return new Response(JSON.stringify({ accounts }), { status: 200 });
      }
      if (u.includes('/api/subscription-budgets')) {
        // Return a vendor so phase moves to 'review'
        const budgets = [
          {
            vendor_name: 'Slack', vendor_key: 'slack', frequency: 'monthly',
            monthly_budget: 30, last_12_months_spend: 360, transaction_count: 12,
            avg_transaction_amount: 30, last_transaction_date: '2026-04-01',
            account_codes: ['6100'], is_active: true,
          },
        ];
        return new Response(JSON.stringify({ budgets }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }));

    await renderStep6AtReview();

    const sidebar = await screen.findByRole('complementary', { name: /selected accounts/i });
    expect(within(sidebar).getByText(/no accounts selected/i)).toBeInTheDocument();
  });

  it('Test 4: sidebar is NOT rendered when phase === "select-accounts"', async () => {
    // Mock so chart-of-accounts returns accounts but NO saved budgets
    // → component stays in 'select-accounts' phase (no vendors to restore)
    vi.stubGlobal('fetch', vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes('/api/Xero/chart-of-accounts')) {
        const accounts = [
          { accountId: 'acc-1', accountCode: '6100', accountName: 'Software', accountType: 'EXPENSE', isSuggested: true },
        ];
        return new Response(JSON.stringify({ accounts }), { status: 200 });
      }
      if (u.includes('/api/subscription-budgets')) {
        return new Response(JSON.stringify({ budgets: [] }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }));

    const state = makeStubState();
    const actions = makeStubActions();
    render(<Step6Subscriptions state={state} actions={actions} fiscalYear={FISCAL_YEAR_END} businessId={BUSINESS_ID} />);

    await waitFor(() => {
      expect(screen.getByText(/Select Accounts to Analyze/i)).toBeInTheDocument();
    });

    // Sidebar should NOT exist in select-accounts phase
    expect(screen.queryByRole('complementary', { name: /selected accounts/i })).toBeNull();
  });
});
