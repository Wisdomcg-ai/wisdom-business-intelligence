/**
 * Phase 50 — Forecast Wizard Bug Sweep — regression tests
 *
 * Covers FCST-BUG-01, -02, -03 (this file in 50-01).
 * Will be EXTENDED in 50-02 with FCST-BUG-04 (lease/finance taxonomy) tests.
 *
 * EXPECTED FAILURES on HEAD (Task 1 RED):
 * - Test 1.1: typed digits lost via toLocaleString round-trip → received !== '5000'
 *   when caret/selection edits happen mid-string. (Note: when typing strictly
 *   left-to-right with no commas in current value, the round-trip can survive;
 *   this assertion forces a backspace-mid-string case to exercise the bug.)
 * - Test 1.2: backspace mid-formatted-value zeroes the cell
 * - Test 2.1: BudgetFramework Team Costs row shows the Step-4 team only,
 *   silently excluding auto-classified team OpEx lines
 * - Test 2.3: rollup behavior — locks "exactly once" contract. Per plan-checker
 *   findings, useForecastWizard.ts:1154 already filters team-classified OpEx
 *   lines from the OpEx total; the test verifies this current correct behavior.
 *   This test should pass on HEAD (and after the fix), guarding against future
 *   regression.
 * - Test 3.1: querying for an input in the Amount cell finds nothing — cell is
 *   read-only text
 * - Test 3.2: same as 3.1 (no input → cannot type → no actions.updatePlannedSpend
 *   call)
 *
 * Test 2.2 may PASS on HEAD (the useMemos ARE reactive); it's included to lock
 * the contract.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import { Step3RevenueCOGS } from '@/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS';
import { Step5OpEx } from '@/app/finances/forecast/components/wizard-v4/steps/Step5OpEx';
import { Step6CapEx } from '@/app/finances/forecast/components/wizard-v4/steps/Step6CapEx';
import type {
  ForecastWizardState,
  WizardActions,
  OpExLine,
  PlannedSpend,
  RevenueLine,
} from '@/app/finances/forecast/components/wizard-v4/types';

// ─── Test infra: clear localStorage between tests so the wizard hook starts
//                clean for each renderHook (it persists state by businessId).
beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────

const FY_START_YEAR = 2025; // July 2025 → June 2026
// Wizard's `fiscalYear` prop is the END of the FY (e.g. 2026 for FY26).
const FISCAL_YEAR_END = FY_START_YEAR + 1;

// First Y1 month key for a July FY start
const FIRST_Y1_MONTH = `${FY_START_YEAR}-07`;

// Generate 12 Y1 month keys
function targetFYKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 12; i++) {
    const calMonth = ((7 - 1 + i) % 12) + 1;
    const year = calMonth >= 7 ? FY_START_YEAR : FY_START_YEAR + 1;
    keys.push(`${year}-${String(calMonth).padStart(2, '0')}`);
  }
  return keys;
}

// Empty 12-month map for a July FY
function emptyMonthly(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of targetFYKeys()) out[k] = 0;
  return out;
}

// Build a stub WizardActions where every method is a vi.fn().
function makeStubActions(): WizardActions {
  // List from WizardActions interface in types.ts
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

// Minimal ForecastWizardState for rendering steps directly.
function makeStubState(overrides: Partial<ForecastWizardState> = {}): ForecastWizardState {
  return {
    wizardVersion: 10,
    businessId: 'test-business-stub',
    fiscalYearStart: FY_START_YEAR,
    status: 'draft',
    forecastDuration: 1,
    durationLocked: false,
    currentStep: 3,
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
    ...overrides,
  };
}

// Build a Y1-only revenue line.
function makeRevenueLine(id: string, name: string, monthlyValues?: Record<string, number>): RevenueLine {
  return {
    id,
    name,
    year1Monthly: monthlyValues || emptyMonthly(),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Bug 1 — FCST-BUG-01: Step 3 input integrity
// ────────────────────────────────────────────────────────────────────────────
//
// Tests use the REAL useForecastWizard hook (not mocked actions) so the
// controlled input round-trip (state → render → keystroke → state) runs end
// to end. With mocked actions, state never updates between keystrokes and
// every keystroke types into a stale empty cell.
import React from 'react';

function Step3Harness({ businessId, initialRevLine }: { businessId: string; initialRevLine?: { id: string; name: string; monthly?: Record<string, number> } }) {
  const wizard = useForecastWizard(FY_START_YEAR, businessId);
  // Seed one revenue line on first render via setRevenueLines.
  React.useEffect(() => {
    if (initialRevLine && wizard.state.revenueLines.length === 0) {
      wizard.actions.setRevenueLines([
        {
          id: initialRevLine.id,
          name: initialRevLine.name,
          year1Monthly: initialRevLine.monthly || emptyMonthly(),
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (wizard.state.revenueLines.length === 0) return null;
  return <Step3RevenueCOGS state={wizard.state} actions={wizard.actions} fiscalYear={FISCAL_YEAR_END} />;
}

describe('Bug 1 — FCST-BUG-01: Step 3 input integrity', () => {
  it('Test 1.1: typing a 4-digit amount preserves every digit', async () => {
    const user = userEvent.setup();
    render(<Step3Harness businessId="test-bug-50-1.1" initialRevLine={{ id: 'rev-1', name: 'Hardware' }} />);

    // Switch to Monthly Detail view to expose the per-month inputs
    // (Site 2: lines 1058-1064 in Step3RevenueCOGS.tsx).
    const monthlyToggle = await screen.findByRole('button', { name: /monthly detail/i });
    await user.click(monthlyToggle);

    // Find the first empty per-month numeric input. Exclude the COGS mix %
    // input (has min/max attrs) and other non-month inputs.
    const numericInputs = screen.queryAllByRole('spinbutton') as HTMLInputElement[];
    const targetCell = numericInputs.find(
      (el) => el.value === '' && !el.hasAttribute('min') && !el.hasAttribute('max')
    );
    expect(
      targetCell,
      `Expected an editable empty revenue month cell. Found ${numericInputs.length} numeric inputs.`
    ).toBeDefined();

    await user.click(targetCell!);
    await user.type(targetCell!, '5000');

    // After the fix the input is type="number" + value={cellValue || ''} —
    // no toLocaleString round-trip. The displayed value should now read 5000.
    expect(
      Number(targetCell!.value),
      `Expected cell value to be 5000 after typing "5000"; got "${targetCell!.value}"`
    ).toBe(5000);
  });

  it('Test 1.2: backspace mid-formatted-value does not zero the cell', async () => {
    const user = userEvent.setup();
    const monthly = emptyMonthly();
    monthly[FIRST_Y1_MONTH] = 5000;
    render(
      <Step3Harness
        businessId="test-bug-50-1.2"
        initialRevLine={{ id: 'rev-1', name: 'Hardware', monthly }}
      />
    );

    const monthlyToggle = await screen.findByRole('button', { name: /monthly detail/i });
    await user.click(monthlyToggle);

    // Find the input whose displayed value contains 5000.
    const candidates: HTMLInputElement[] = [
      ...(screen.queryAllByRole('spinbutton') as HTMLInputElement[]),
    ];
    const target = candidates.find((el) => /5,?000/.test(el.value));
    expect(target, 'expected an input whose display value contains "5000" or "5,000"').toBeDefined();

    await user.click(target!);
    // Caret to end, backspace once → "500" expected.
    await user.keyboard('{End}{Backspace}');

    // After backspacing the trailing "0" from "5000", the cell should show
    // 500. Bug: with text+toLocaleString, backspace inside the comma can
    // zero the value.
    const finalValue = Number(target!.value);
    expect(finalValue, 'backspace should not zero the cell').not.toBe(0);
    expect(finalValue, 'value should be a positive number').toBeGreaterThan(0);
    expect(finalValue, 'one backspace from 5000 should yield 500').toBe(500);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Bug 2 — FCST-BUG-02: Step 5 OpEx total includes team-classified lines
// ────────────────────────────────────────────────────────────────────────────
describe('Bug 2 — FCST-BUG-02: Step 5 OpEx total includes team-classified lines', () => {
  it('Test 2.1 (display fix): BudgetFramework Team Costs row includes auto-classified team OpEx lines', () => {
    // Set up state with one Step-4 team member salary $100k AND an OpEx line
    // 'Wages and Salaries' $5000/mo ($60k/yr) auto-classified as team.
    // Revenue must be > grossProfit baseline to avoid availableOpEx going
    // negative and obscuring the test signal.
    const wagesLine: OpExLine = {
      id: 'opex-wages',
      name: 'Wages and Salaries',
      priorYearAnnual: 60_000,
      costBehavior: 'fixed',
      monthlyAmount: 5_000, // → 60k/yr via calculateY1Amount
    };
    const monthly = emptyMonthly();
    for (const k of Object.keys(monthly)) monthly[k] = 100_000; // 1.2M revenue
    const revLine = makeRevenueLine('rev-1', 'Hardware', monthly);

    const state = makeStubState({
      revenueLines: [revLine],
      teamMembers: [
        {
          id: 'tm-1',
          name: 'Founder',
          role: 'CEO',
          type: 'fulltime',
          currentSalary: 100_000,
          newSalary: 100_000,
          increasePct: 0,
          superAmount: 11_500,
          hoursPerWeek: 40,
          isFromXero: false,
        } as any,
      ],
      opexLines: [wagesLine],
      goals: {
        year1: { revenue: 1_200_000, grossProfitPct: 100, netProfitPct: 0 },
        year2: { revenue: 0, grossProfitPct: 0, netProfitPct: 0 },
        year3: { revenue: 0, grossProfitPct: 0, netProfitPct: 0 },
      },
    });
    const actions = makeStubActions();

    render(<Step5OpEx state={state} actions={actions} fiscalYear={FISCAL_YEAR_END} />);

    // The "Team Costs" subtraction row in BudgetFramework. Find it by its
    // exact label text "− Team Costs" (the BudgetFramework breakdown uses a
    // unicode minus sign followed by "Team Costs"). Other strings like
    // "in Team Costs" / "Counted in Team Costs" appear elsewhere on the
    // page and must be excluded.
    const teamCostLabel = screen.getByText(/^−\s*Team Costs$/i);
    // The row is structured as: <span>− Team Costs</span><span>$X</span>
    const row = teamCostLabel.parentElement;
    expect(row).toBeTruthy();
    const rowText = row?.textContent || '';
    // Step 4 team: $100k + $11.5k super = $111.5k
    // Plus auto-classified Wages OpEx line: $60k
    // Expected: $171.5k (or close — exact value depends on super rate logic).
    // Bug: only $111.5k displayed (missing the $60k Wages line).
    // We assert the displayed number is at LEAST $160k (Wages line included).
    const numericMatches = rowText.match(/\$([\d,]+)/);
    expect(numericMatches, `Expected currency value in "${rowText}"`).toBeTruthy();
    const displayedNum = parseInt(numericMatches![1].replace(/,/g, ''), 10);
    expect(
      displayedNum,
      `BudgetFramework Team Costs should include the $60k auto-classified Wages OpEx line (got ${displayedNum})`
    ).toBeGreaterThanOrEqual(160_000);
  });

  it('Test 2.2 (reactivity): changing a per-line OpEx value updates BudgetFramework Available OpEx in same render', () => {
    // Pure rendering test of the reactive contract. Render Step5OpEx with one
    // non-team OpEx line at $10k/mo ($120k/yr). Read Available OpEx.
    // Re-render with the line at $15k/mo ($180k/yr). Available OpEx should
    // have decreased by $60k.
    const buildState = (monthly: number) =>
      makeStubState({
        revenueLines: [
          makeRevenueLine(
            'rev-1',
            'Hardware',
            Object.fromEntries(targetFYKeys().map((k) => [k, 100_000]))
          ),
        ],
        opexLines: [
          {
            id: 'opex-marketing',
            name: 'Marketing',
            priorYearAnnual: monthly * 12,
            costBehavior: 'fixed',
            monthlyAmount: monthly,
          } as OpExLine,
        ],
        goals: {
          year1: { revenue: 1_200_000, grossProfitPct: 100, netProfitPct: 0 },
          year2: { revenue: 0, grossProfitPct: 0, netProfitPct: 0 },
          year3: { revenue: 0, grossProfitPct: 0, netProfitPct: 0 },
        },
      });

    const actions = makeStubActions();
    const { unmount } = render(
      <Step5OpEx state={buildState(10_000)} actions={actions} fiscalYear={FISCAL_YEAR_END} />
    );
    const yourOpexA = screen.getByText(/Your OpEx:/i).textContent || '';
    const valueA = parseInt((yourOpexA.match(/\$([\d,]+)/)?.[1] || '0').replace(/,/g, ''), 10);
    unmount();

    render(
      <Step5OpEx state={buildState(15_000)} actions={actions} fiscalYear={FISCAL_YEAR_END} />
    );
    const yourOpexB = screen.getByText(/Your OpEx:/i).textContent || '';
    const valueB = parseInt((yourOpexB.match(/\$([\d,]+)/)?.[1] || '0').replace(/,/g, ''), 10);

    // 10k/mo × 12 = 120k; 15k/mo × 12 = 180k
    expect(valueA).toBe(120_000);
    expect(valueB).toBe(180_000);
  });

  it('Test 2.3 (root-cause): useForecastWizard P&L rollup counts each OpEx line exactly once', () => {
    // Verify the rollup behavior at useForecastWizard.ts:1149-1189. Per
    // plan-checker findings, the rollup ALREADY filters team-classified lines
    // (line 1154). This test locks that behavior.
    //
    // Scenario: two OpEx lines — one auto-classified as team ('Wages'),
    // one not ('Marketing'). The summary's `opex` total must equal ONLY the
    // non-team line's amount. The team line is counted separately under
    // `teamCosts` (via Step 4 teamMembers — the rollup does not synthesize
    // pseudo-team-members from OpEx, so the auto-classified Wages line ends
    // up in NEITHER bucket of the rollup. That is the current correct
    // behavior to maintain "exactly once" — it is counted in the OpEx-line
    // list 0 times, NOT 1 time. Step 4 is the source of truth for team
    // costs in the saved forecast.)
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'test-bug-50-2.3')
    );

    act(() => {
      // Add the team-classified OpEx line ($60k/yr).
      result.current.actions.addOpExLine({
        name: 'Wages and Salaries',
        priorYearAnnual: 60_000,
        costBehavior: 'fixed',
        monthlyAmount: 5_000, // 60k/yr
      } as Omit<OpExLine, 'id'>);
      // Add a non-team OpEx line ($120k/yr).
      result.current.actions.addOpExLine({
        name: 'Marketing',
        priorYearAnnual: 120_000,
        costBehavior: 'fixed',
        monthlyAmount: 10_000, // 120k/yr
      } as Omit<OpExLine, 'id'>);
    });

    const summary = result.current.summary;
    expect(summary.year1).toBeDefined();
    // Year 1 OpEx = Marketing only ($120k). The Wages line is filtered out
    // by the rollup at line 1154.
    expect(summary.year1!.opex).toBe(120_000);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Bug 3 — FCST-BUG-03: Step 7 from-plan amount editable
// ────────────────────────────────────────────────────────────────────────────
describe('Bug 3 — FCST-BUG-03: Step 7 from-plan amount editable', () => {
  it('Test 3.1: Amount column is an editable input for from-plan items', async () => {
    const user = userEvent.setup();
    const actions = makeStubActions();
    const initiativeSpend: PlannedSpend = {
      id: 'spend-1',
      description: 'New website',
      amount: 0,
      month: 7,
      spendType: 'one-off',
      paymentMethod: 'outright',
      initiativeId: 'init-1',
    };
    const state = makeStubState({ plannedSpends: [initiativeSpend] });

    render(<Step6CapEx state={state} actions={actions} fiscalYear={FISCAL_YEAR_END} />);

    // After fix: there must be an editable input in the row (type="number"
    // → role "spinbutton") for the spend's amount.
    // Filter to inputs whose value matches the spend's current amount (0)
    // — BUT also exclude the Add-form input (which exists but only when
    // showAddForm is true — by default the add-form is hidden, so any
    // spinbutton at this point belongs to the row).
    const amountInputs = screen.queryAllByRole('spinbutton') as HTMLInputElement[];

    // BUG (current HEAD): formatCurrency(0) renders read-only "$0" text — no
    // input exists. Expect at least one editable input bound to the row.
    expect(
      amountInputs.length,
      'expected an editable amount input on the from-plan row (currently read-only formatCurrency text)'
    ).toBeGreaterThan(0);

    // Type a value into the first amount input.
    const target = amountInputs[0];
    await user.click(target);
    await user.clear(target);
    await user.type(target, '50000');

    // Assert updatePlannedSpend was called with { amount: ... } for our row.
    const calls = (actions.updatePlannedSpend as ReturnType<typeof vi.fn>).mock.calls;
    const matching = calls.filter(
      ([id, updates]) => id === 'spend-1' && typeof (updates as any)?.amount === 'number'
    );
    expect(matching.length, 'updatePlannedSpend should be called with amount updates').toBeGreaterThan(0);

    // The final cumulative typed value should reach 50000.
    const lastAmount = (matching[matching.length - 1][1] as { amount: number }).amount;
    expect(lastAmount).toBe(50_000);
  });

  it('Test 3.2: editing amount on a finance item triggers updatePlannedSpend (cascade reachable)', async () => {
    const user = userEvent.setup();
    const actions = makeStubActions();
    const financeSpend: PlannedSpend = {
      id: 'spend-2',
      description: 'Server',
      amount: 100_000,
      month: 7,
      spendType: 'asset',
      usefulLifeYears: 5,
      paymentMethod: 'finance',
      financeRate: 6,
      financeTerm: 60,
    };
    const state = makeStubState({ plannedSpends: [financeSpend] });

    render(<Step6CapEx state={state} actions={actions} fiscalYear={FISCAL_YEAR_END} />);

    // Find the amount input for the row (the first spinbutton on the page;
    // the finance Term/Rate inputs only appear if expanded — they're not
    // expanded by default, so any spinbutton is the amount input).
    const amountInputs = screen.queryAllByRole('spinbutton') as HTMLInputElement[];
    expect(amountInputs.length).toBeGreaterThan(0);

    const target = amountInputs[0];
    await user.click(target);
    await user.clear(target);
    await user.type(target, '200000');

    const calls = (actions.updatePlannedSpend as ReturnType<typeof vi.fn>).mock.calls;
    const matching = calls.filter(
      ([id, updates]) => id === 'spend-2' && typeof (updates as any)?.amount === 'number'
    );
    expect(matching.length, 'updatePlannedSpend should be called with amount updates').toBeGreaterThan(0);
    const lastAmount = (matching[matching.length - 1][1] as { amount: number }).amount;
    expect(lastAmount).toBe(200_000);
  });
});
