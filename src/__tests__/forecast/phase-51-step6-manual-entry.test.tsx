/**
 * Phase 51 — UX-S6-03: Step 6 manual subscription entry
 *
 * Today the "+ Add Subscription" button is gated behind `isManualMode` (the
 * no-Xero fallback). Operators with Xero connected can't manually add a
 * subscription that doesn't appear in Xero (e.g., a planned new tool).
 *
 * Fix: change the gate from `isManualMode &&` to `phase === 'review' &&`.
 * The button is then visible in xero mode too.
 *
 * The Add Subscription form gains two new fields per operator scope:
 *   - Start month (dropdown)
 *   - Category (dropdown — Software / Marketing / Operations / Other)
 *
 * Manual entries appear alongside auto-detected vendors in the same table.
 *
 * Tests:
 *   - Test 1: button visible in xero mode (phase='review', isManualMode=false) (RED today)
 *   - Test 2: clicking opens form; filling fields + submit adds vendor to list
 *   - Test 3: button NOT visible in 'select-accounts' phase
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step6Subscriptions } from '@/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions';
import type { ForecastWizardState, WizardActions } from '@/app/finances/forecast/components/wizard-v4/types';

const FY_START_YEAR = 2025;
const FISCAL_YEAR_END = 2026;
const BUSINESS_ID = 'biz-step6-manual';

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
    subscriptions: [],
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

function setupXeroReviewMocks() {
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const u = String(url);
    if (u.includes('/api/Xero/chart-of-accounts')) {
      const accounts = [
        { accountId: 'acc-1', accountCode: '6100', accountName: 'Software', accountType: 'EXPENSE', isSuggested: true },
      ];
      return new Response(JSON.stringify({ accounts }), { status: 200 });
    }
    if (u.includes('/api/subscription-budgets')) {
      // Return one auto-detected vendor so we land in 'review'
      const budgets = [
        {
          vendor_name: 'Notion', vendor_key: 'notion', frequency: 'monthly',
          monthly_budget: 50, last_12_months_spend: 600, transaction_count: 12,
          avg_transaction_amount: 50, last_transaction_date: '2026-04-01',
          account_codes: ['6100'], is_active: true,
        },
      ];
      return new Response(JSON.stringify({ budgets }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// UX-S6-03 — Step 6 manual subscription entry
// ────────────────────────────────────────────────────────────────────────────

describe('UX-S6-03 — Step 6 manual subscription entry', () => {
  it('Test 1: "+ Add Subscription" button is visible in xero mode (phase="review", isManualMode=false)', async () => {
    setupXeroReviewMocks();
    const state = makeStubState();
    const actions = makeStubActions();
    render(<Step6Subscriptions state={state} actions={actions} fiscalYear={FISCAL_YEAR_END} businessId={BUSINESS_ID} />);

    await waitFor(() => {
      expect(screen.getByText(/Subscription Budgets/i)).toBeInTheDocument();
    });

    // Confirm we are NOT in manual mode (Xero header is the gradient panel; manual mode would render "Manual Subscription Entry")
    expect(screen.queryByText(/Manual Subscription Entry/i)).toBeNull();

    // Button should be visible
    const addBtn = screen.getByRole('button', { name: /add subscription/i });
    expect(addBtn).toBeInTheDocument();
  });

  it('Test 2: clicking the button opens the form; filling fields and submitting adds the vendor', async () => {
    const user = userEvent.setup();
    setupXeroReviewMocks();
    const state = makeStubState();
    const actions = makeStubActions();
    render(<Step6Subscriptions state={state} actions={actions} fiscalYear={FISCAL_YEAR_END} businessId={BUSINESS_ID} />);

    await waitFor(() => {
      expect(screen.getByText(/Subscription Budgets/i)).toBeInTheDocument();
    });

    const addBtn = screen.getByRole('button', { name: /add subscription/i });
    await user.click(addBtn);

    // Form fields
    const nameInput = await screen.findByPlaceholderText(/vendor name/i);
    await user.type(nameInput, 'Stripe');

    const monthlyInput = screen.getByPlaceholderText(/monthly/i);
    await user.clear(monthlyInput);
    await user.type(monthlyInput, '50');

    // Frequency selector — monthly is default; explicit select
    const freqSelect = screen.getByLabelText(/frequency/i);
    await user.selectOptions(freqSelect, 'monthly');

    // Start month dropdown — pick August 2026
    const startMonthSelect = screen.getByLabelText(/start month/i);
    await user.selectOptions(startMonthSelect, '2026-08');

    // Category dropdown — pick Software
    const categorySelect = screen.getByLabelText(/category/i);
    await user.selectOptions(categorySelect, 'Software');

    // Submit
    const submitBtn = screen.getByRole('button', { name: /^add$/i });
    await user.click(submitBtn);

    // Vendor appears in the list with name "Stripe" alongside Notion
    await waitFor(() => {
      expect(screen.getByText('Stripe')).toBeInTheDocument();
    });
    // Notion still there too
    expect(screen.getByText('Notion')).toBeInTheDocument();

    // The Stripe row should reflect the entered monthly amount in the monthly budget input
    const stripeRow = screen.getByText('Stripe').closest('tr') as HTMLElement;
    const stripeMonthly = within(stripeRow).getByRole('spinbutton') as HTMLInputElement;
    expect(Number(stripeMonthly.value)).toBe(50);
  });

  it('Test 3: button NOT visible in "select-accounts" phase', async () => {
    // Setup: chart returns accounts, budgets is empty → stays in 'select-accounts'
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

    expect(screen.queryByRole('button', { name: /add subscription/i })).toBeNull();
  });
});
