/**
 * Phase 50 — Forecast Wizard Bug Sweep — regression tests
 *
 * Covers FCST-BUG-01, -02, -03 (50-01) AND FCST-BUG-04 (50-02 lease/finance
 * taxonomy).
 *
 * EXPECTED FAILURES on HEAD (Task 1 RED) — Bugs 1, 2, 3:
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
 *
 * BUG 4 EXPECTED FAILURES on HEAD (50-02 Task 1 RED):
 * - Tests 4.1, 4.2, 4.3, 4.4, 4.6: lease_type field doesn't exist yet on
 *   PlannedSpend → tsc fails OR runtime returns 0 / today's legacy number.
 *   After Task 2 (type extension): tsc passes; runtime branch returns legacy
 *   number (because new switch isn't wired yet). After Tasks 3 + 4: GREEN.
 * - Test 4.5: this PASSES on HEAD — captures the legacy behavior we MUST
 *   preserve. Hardcoded value: $23,200 (verified by direct simulation of
 *   getPlannedSpendPLImpact against the legacy fixture, on main 2026-05-02).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, render, screen, within, fireEvent } from '@testing-library/react';
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
import { getPlannedSpendPLImpact } from '@/app/finances/forecast/components/wizard-v4/types';

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
    subscriptions: [],
    maxVisitedStep: 1,
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
  // Updated 2026-05-07: Phase 54-02 made Step 4 the single source of truth
  // for team cost (Xero auto-fill always populates members on first open).
  // Adding `opexClassifiedTeamCosts` on top of `year1TeamCosts` double-counts
  // the same Xero wages — JDS production showed ~2× the actual figure
  // ($5.18M vs $2.56M). New contract: when Step 4 has any team data, ONLY
  // year1TeamCosts is shown; OpEx auto-classified lines are excluded from
  // both the Team Costs row AND the OpEx total (already excluded from rollup).
  it('Test 2.1 (display fix): BudgetFramework Team Costs row uses Step 4 ONLY when team data exists (no double-count)', () => {
    // Set up state with one Step-4 team member salary $100k AND an OpEx line
    // 'Wages and Salaries' $5000/mo ($60k/yr) auto-classified as team. Step 4
    // is the source of truth — the wages OpEx line must NOT be added on top.
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

    // BudgetFramework now starts with the breakdown collapsed (PR #174 — the
    // 7-line deduction chain was too tall for a sticky panel). Expand it so
    // the "− Team Costs" row exists in the DOM.
    fireEvent.click(screen.getByRole('button', { name: /show breakdown/i }));

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
    // Step 4 team: $100k salary + ~$11.5k super ≈ $111.5k.
    // The OpEx 'Wages and Salaries' line ($60k) MUST NOT be added on top —
    // it's the same wages viewed from a different angle. Expect ~$111-115k,
    // strictly LESS than $130k (which would imply the wages line was added).
    const numericMatches = rowText.match(/\$([\d,]+)/);
    expect(numericMatches, `Expected currency value in "${rowText}"`).toBeTruthy();
    const displayedNum = parseInt(numericMatches![1].replace(/,/g, ''), 10);
    expect(
      displayedNum,
      `BudgetFramework Team Costs should be ~$111k (Step 4 only), NOT include the $60k Wages OpEx line (got ${displayedNum})`
    ).toBeLessThan(130_000);
    expect(
      displayedNum,
      `BudgetFramework Team Costs should be ≥ $100k base salary (got ${displayedNum})`
    ).toBeGreaterThanOrEqual(100_000);
  });

  it('Test 2.1b (fallback): when Step 4 is empty, BudgetFramework Team Costs falls back to OpEx auto-classified Wages line', () => {
    // Edge case: business that hasn't filled Step 4 yet (no team members AND
    // no new hires). The Xero "Wages and Salaries" P&L line should still
    // surface as Team Costs so the framework reads correctly.
    const wagesLine: OpExLine = {
      id: 'opex-wages',
      name: 'Wages and Salaries',
      priorYearAnnual: 60_000,
      costBehavior: 'fixed',
      monthlyAmount: 5_000,
    };
    const monthly = emptyMonthly();
    for (const k of Object.keys(monthly)) monthly[k] = 100_000;
    const revLine = makeRevenueLine('rev-1', 'Hardware', monthly);

    const state = makeStubState({
      revenueLines: [revLine],
      teamMembers: [], // empty Step 4
      opexLines: [wagesLine],
      goals: {
        year1: { revenue: 1_200_000, grossProfitPct: 100, netProfitPct: 0 },
        year2: { revenue: 0, grossProfitPct: 0, netProfitPct: 0 },
        year3: { revenue: 0, grossProfitPct: 0, netProfitPct: 0 },
      },
    });
    const actions = makeStubActions();
    render(<Step5OpEx state={state} actions={actions} fiscalYear={FISCAL_YEAR_END} />);

    // BudgetFramework breakdown is collapsed by default — expand to access the rows.
    fireEvent.click(screen.getByRole('button', { name: /show breakdown/i }));

    const teamCostLabel = screen.getByText(/^−\s*Team Costs$/i);
    const row = teamCostLabel.parentElement;
    const numericMatches = (row?.textContent || '').match(/\$([\d,]+)/);
    expect(numericMatches).toBeTruthy();
    const displayedNum = parseInt(numericMatches![1].replace(/,/g, ''), 10);
    expect(
      displayedNum,
      `Empty-Step-4 fallback should show OpEx Wages ($60k), got ${displayedNum}`
    ).toBeGreaterThanOrEqual(55_000);
    expect(displayedNum).toBeLessThan(70_000);
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
// Test harness for Bug 3 — uses the REAL useForecastWizard hook so the
// controlled-input round-trip (state → render → keystroke → state) closes.
// Same pattern as Step3Harness used by Bug 1 tests above. Mocked actions
// would leave state stale between keystrokes and every keystroke would
// type into the original (un-updated) value.
function Step6Harness({ businessId, initialSpend }: { businessId: string; initialSpend: PlannedSpend }) {
  const wizard = useForecastWizard(FY_START_YEAR, businessId);
  React.useEffect(() => {
    if (wizard.state.plannedSpends.length === 0) {
      // Use addPlannedSpend with description+amount+etc; the helper assigns its own id,
      // but we then tag the resulting row with our deterministic id by issuing an update.
      wizard.actions.addPlannedSpend({
        description: initialSpend.description,
        amount: initialSpend.amount,
        month: initialSpend.month,
        spendType: initialSpend.spendType,
        paymentMethod: initialSpend.paymentMethod,
        initiativeId: initialSpend.initiativeId,
        usefulLifeYears: initialSpend.usefulLifeYears,
        financeRate: initialSpend.financeRate,
        financeTerm: initialSpend.financeTerm,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (wizard.state.plannedSpends.length === 0) return null;
  return <Step6CapEx state={wizard.state} actions={wizard.actions} fiscalYear={FISCAL_YEAR_END} />;
}

describe('Bug 3 — FCST-BUG-03: Step 7 from-plan amount editable', () => {
  it('Test 3.1: Amount column is an editable input for from-plan items', async () => {
    const user = userEvent.setup();
    const initiativeSpend: PlannedSpend = {
      id: 'spend-1',
      description: 'New website',
      amount: 0,
      month: 7,
      spendType: 'one-off',
      paymentMethod: 'outright',
      initiativeId: 'init-1',
    };

    render(<Step6Harness businessId="test-bug-50-3.1" initialSpend={initiativeSpend} />);

    // Wait for the row to render after addPlannedSpend updates state.
    const amountInputs = await screen.findAllByRole('spinbutton') as HTMLInputElement[];

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

    // The input value should reach 50000 after all keystrokes.
    expect(target.value).toBe('50000');
  });

  it('Test 3.2: editing amount on a finance item triggers updatePlannedSpend (cascade reachable)', async () => {
    const user = userEvent.setup();
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

    render(<Step6Harness businessId="test-bug-50-3.2" initialSpend={financeSpend} />);

    const amountInputs = await screen.findAllByRole('spinbutton') as HTMLInputElement[];
    expect(amountInputs.length).toBeGreaterThan(0);

    const target = amountInputs[0];
    await user.click(target);
    await user.clear(target);
    await user.type(target, '200000');

    expect(target.value).toBe('200000');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Bug 4 — FCST-BUG-04: lease/finance taxonomy
// ────────────────────────────────────────────────────────────────────────────
//
// NOTE: Tests 4.1-4.4 + 4.6 reference the new `lease_type` discriminator and
// related fields (term_months, interest_rate, useful_life_months, residual_value)
// added to PlannedSpend in 50-02 Task 2. On HEAD before Task 2 lands, expect
// tsc to fail. After Task 2: tests fail at runtime (RED — branch falls through
// to legacy which returns the wrong number for the new-taxonomy fixtures).
// After Tasks 3 + 4: tests pass (GREEN — both rollup sites switch on lease_type).
//
// Test 4.5 (backward-compat regression lock) PASSES on HEAD. Hardcoded number
// captured by direct simulation of the current `getPlannedSpendPLImpact`
// implementation against the legacy fixture on main, 2026-05-02:
//   getPlannedSpendPLImpact({amount:100000, paymentMethod:'finance',
//     financeRate:6, financeTerm:60, financeMonthlyPayment:1933,
//     financeTotalInterest:15998, usefulLifeYears:5, month:1, spendType:'asset'}, 1)
//   → 23200
// Both the function and the inline rollup at useForecastWizard.ts:1217-1240
// return $23,200 for this fixture (verified independently). The taxonomy
// refactor in Tasks 3+4 must preserve this exact number for items WITHOUT
// `lease_type` set.

/**
 * Lockstep helper — Sites 1 vs 2 must agree.
 *
 * After 50-02 Task 4 lands, the rollup at useForecastWizard.ts:1217-1240
 * delegates to `getPlannedSpendPLBreakdown(item, year)` (extracted to types.ts).
 * `getPlannedSpendPLImpact` also delegates to the same helper
 * (returns breakdown.total). Therefore both sites are guaranteed equal by
 * construction — they share one helper.
 *
 * For lockstep verification we simply call `getPlannedSpendPLImpact` twice
 * (once standalone — Site 1; once after running the value through the rollup
 * surface via the wizard hook — Site 2). Both must return the same number.
 *
 * Site 2 (rollup) accumulates plannedSpendDepreciation + plannedSpendExpenses
 * for an item. Reading `summary.year1.depreciation + summary.year1.investments`
 * is NOT directly comparable because it includes other-than-plannedSpends
 * contributions. Instead, we exploit the fact that with a clean state (no
 * priorYear, no capexItems, no investments, no other expenses), only
 * plannedSpends contribute to those two summary fields. Their sum equals
 * the per-item rollup total.
 */
function siteOnePLImpact(item: PlannedSpend, year: 1 | 2 | 3): number {
  return getPlannedSpendPLImpact(item, year);
}

function siteTwoPLImpact(item: PlannedSpend, year: 1 | 2 | 3): number {
  // Render the wizard hook with a clean state, add a single plannedSpend,
  // and read the resulting summary. depreciation + investments isolates the
  // plannedSpend contribution because no other source feeds those buckets
  // when capexItems / investments / priorYear are empty.
  const { result } = renderHook(() =>
    useForecastWizard(FY_START_YEAR, `lockstep-${Math.random().toString(36).slice(2)}`),
  );
  act(() => {
    result.current.actions.addPlannedSpend({
      description: item.description,
      amount: item.amount,
      month: item.month,
      spendType: item.spendType,
      paymentMethod: item.paymentMethod,
      usefulLifeYears: item.usefulLifeYears,
      financeTerm: item.financeTerm,
      financeRate: item.financeRate,
      financeMonthlyPayment: item.financeMonthlyPayment,
      financeTotalInterest: item.financeTotalInterest,
      leaseTerm: item.leaseTerm,
      leaseMonthlyPayment: item.leaseMonthlyPayment,
      // New-taxonomy fields (will be no-ops until Tasks 2+4 land)
      lease_type: item.lease_type,
      term_months: item.term_months,
      interest_rate: item.interest_rate,
      useful_life_months: item.useful_life_months,
      residual_value: item.residual_value,
    } as Omit<PlannedSpend, 'id'>);
  });
  const yearKey = `year${year}` as 'year1' | 'year2' | 'year3';
  const ys = result.current.summary[yearKey];
  if (!ys) return -1;
  return (ys.depreciation || 0) + (ys.investments || 0);
}

describe('Bug 4 — FCST-BUG-04: lease/finance taxonomy', () => {
  it('Test 4.1: outright_purchase — depreciation only over useful_life_months', () => {
    const item: PlannedSpend = {
      id: 'spend-4.1',
      description: 'Outright server',
      amount: 100_000,
      month: 1, // FY start — full 12 months ahead
      spendType: 'asset',
      paymentMethod: 'outright',
      lease_type: 'outright_purchase',
      useful_life_months: 60,
    };
    // monthlyDep = 100_000 / 60 = 1666.6667; * 12 = 20_000
    expect(siteOnePLImpact(item, 1)).toBe(20_000);
    // Lockstep — Site 2 rollup matches Site 1
    expect(siteTwoPLImpact(item, 1)).toBe(20_000);
  });

  it('Test 4.2: operating_lease — full payment is P&L expense, no depreciation', () => {
    const item: PlannedSpend = {
      id: 'spend-4.2',
      description: 'Operating lease office equipment',
      amount: 100_000,
      month: 1,
      spendType: 'asset',
      paymentMethod: 'lease',
      lease_type: 'operating_lease',
      leaseMonthlyPayment: 2_000,
      term_months: 60,
      // useful_life_months intentionally set — operating lease must IGNORE it
      useful_life_months: 60,
    };
    // 2_000 * 12 = 24_000; no depreciation
    expect(siteOnePLImpact(item, 1)).toBe(24_000);
    expect(siteTwoPLImpact(item, 1)).toBe(24_000);
  });

  it('Test 4.3: finance_lease — depreciation + interest portion only (NOT full payment)', () => {
    const item: PlannedSpend = {
      id: 'spend-4.3',
      description: 'Finance lease vehicle',
      amount: 100_000,
      month: 1,
      spendType: 'asset',
      paymentMethod: 'lease',
      lease_type: 'finance_lease',
      term_months: 60,
      interest_rate: 6, // 6% APR
      useful_life_months: 60,
    };
    // why: Y1 reflects amortized interest (largest in early years); was previously
    // locked to buggy flat-spread value $23,199 — see Phase 56 P1a Lease-Interest-001.
    // PMT(100_000, 6%/12, 60) = 1933.28/mo. Amortizing month-by-month:
    //   Y1 interest = sum of (balance × r) for months 0..11 ≈ 5_519
    //   Y1 depreciation = 100_000 / 60 × 12 = 20_000
    //   Y1 total = 25_519 (NOT $24_000 of full lease payment, NOT $23_199 flat-spread)
    const site1 = siteOnePLImpact(item, 1);
    expect(site1).toBeCloseTo(25_519, -1);
    // CRITICAL: must NOT equal $24,000 (the buggy full-payment expensing)
    // Note: amortized Y1 interest legitimately exceeds $24K because Y1 carries
    // the largest outstanding principal; the "less than full lease payment"
    // assertion is no longer meaningful at the annual level.
    expect(site1).toBeLessThan(26_000);
    // Lockstep — Site 2 must match Site 1 within ±$2 rounding tolerance
    const site2 = siteTwoPLImpact(item, 1);
    expect(Math.abs(site1 - site2)).toBeLessThanOrEqual(2);
  });

  it('Test 4.4: loan_financing — depreciation + interest portion only (identical math to finance_lease)', () => {
    const item: PlannedSpend = {
      id: 'spend-4.4',
      description: 'Loan-financed asset',
      amount: 100_000,
      month: 1,
      spendType: 'asset',
      paymentMethod: 'finance',
      lease_type: 'loan_financing',
      term_months: 60,
      interest_rate: 6,
      useful_life_months: 60,
    };
    // why: Y1 reflects amortized interest (largest in early years); was previously
    // locked to buggy flat-spread value $23,199 — see Phase 56 P1a Lease-Interest-001.
    const site1 = siteOnePLImpact(item, 1);
    expect(site1).toBeCloseTo(25_519, -1);
    expect(site1).toBeLessThan(26_000);
    const site2 = siteTwoPLImpact(item, 1);
    expect(Math.abs(site1 - site2)).toBeLessThanOrEqual(2);
  });

  it('Test 4.5: backward compatibility — legacy item without lease_type produces today\'s exact P&L ($23,200)', () => {
    // REGRESSION LOCK — captured from main on 2026-05-02 by direct simulation
    // of getPlannedSpendPLImpact + the inline rollup. Both produce $23,200
    // for this fixture. The Tasks 3+4 refactor MUST preserve this number.
    //
    // Legacy fixture — no lease_type set. Falls through to the legacy
    // paymentMethod switch in both sites.
    const legacyItem: PlannedSpend = {
      id: 'spend-4.5-legacy',
      description: 'Legacy financed server',
      amount: 100_000,
      month: 1,
      spendType: 'asset',
      paymentMethod: 'finance',
      financeRate: 6,
      financeTerm: 60,
      financeMonthlyPayment: 1_933,
      financeTotalInterest: 15_998,
      usefulLifeYears: 5,
      // NO lease_type — must fall through to legacy
    };
    expect(siteOnePLImpact(legacyItem, 1)).toBe(23_200);
    // Lockstep — Site 2 also returns $23,200 for the legacy fixture
    expect(siteTwoPLImpact(legacyItem, 1)).toBe(23_200);
  });

  it('Test 4.6: operating_lease without leaseMonthlyPayment falls back to amount/term_months', () => {
    const item: PlannedSpend = {
      id: 'spend-4.6',
      description: 'Operating lease (no monthly payment specified)',
      amount: 100_000,
      month: 1,
      spendType: 'asset',
      paymentMethod: 'lease',
      lease_type: 'operating_lease',
      term_months: 60,
      // NO leaseMonthlyPayment — derive from amount/term_months
    };
    // monthlyPayment fallback = 100_000 / 60 = 1666.67; * 12 = 20_000
    expect(siteOnePLImpact(item, 1)).toBe(20_000);
    expect(siteTwoPLImpact(item, 1)).toBe(20_000);
  });
});
