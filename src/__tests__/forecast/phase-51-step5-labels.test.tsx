/**
 * Phase 51 plan 51-05 — Step 5 OpEx behavior labels + tooltip + simpler layout
 *
 * Covers:
 *   - UX-S5-01 — relabel the existing 4-way costBehavior dropdown with
 *     operator-friendly text + add an info-icon tooltip explaining each option
 *   - UX-S5-02 — clearer column headers (explicit "Year total" + "Monthly avg")
 *
 * Operator decision encoded:
 *   - The existing 4-way costBehavior dropdown STAYS (no $/% toggle replacement)
 *   - Only the displayed text on each <option> changes; values remain
 *     'fixed' | 'variable' | 'seasonal' | 'adhoc'
 *
 * RED expectations on HEAD:
 *   - UX-S5-01 Tests 1, 2, 3 — fail (labels still read "Fixed/Variable/...";
 *     no info-icon button)
 *   - UX-S5-02 Tests 4, 5 — fail (no "Year total" / "Monthly avg" column
 *     headers — current headers say "Annual" + "Monthly")
 *   - back-compat Test 6 — passes today; locked as a regression guard so the
 *     implementation can't accidentally change the math
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, renderHook, act } from '@testing-library/react';
import React from 'react';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import { Step5OpEx } from '@/app/finances/forecast/components/wizard-v4/steps/Step5OpEx';
import type {
  ForecastWizardState,
  WizardActions,
  OpExLine,
  RevenueLine,
} from '@/app/finances/forecast/components/wizard-v4/types';

// ─── Test infra: clear localStorage between tests so the wizard hook starts
//                clean for each renderHook (it persists state by businessId).
beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

// ─── Helpers (mirrors patterns in wizard-v4-bug-fixes.test.tsx) ────────────

const FY_START_YEAR = 2025; // July 2025 → June 2026
const FISCAL_YEAR_END = FY_START_YEAR + 1;

function targetFYKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 12; i++) {
    const calMonth = ((7 - 1 + i) % 12) + 1;
    const year = calMonth >= 7 ? FY_START_YEAR : FY_START_YEAR + 1;
    keys.push(`${year}-${String(calMonth).padStart(2, '0')}`);
  }
  return keys;
}

function emptyMonthly(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of targetFYKeys()) out[k] = 0;
  return out;
}

function makeRevenueLine(id: string, name: string, monthlyValues?: Record<string, number>): RevenueLine {
  return {
    id,
    name,
    year1Monthly: monthlyValues || emptyMonthly(),
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

function makeStubState(overrides: Partial<ForecastWizardState> = {}): ForecastWizardState {
  return {
    wizardVersion: 10,
    businessId: 'test-business-stub-51-05',
    fiscalYearStart: FY_START_YEAR,
    status: 'draft',
    forecastDuration: 1,
    durationLocked: false,
    currentStep: 5,
    activeYear: 1,
    businessProfile: null,
    goals: {
      year1: { revenue: 1_200_000, grossProfitPct: 100, netProfitPct: 0 },
      year2: { revenue: 0, grossProfitPct: 0, netProfitPct: 0 },
      year3: { revenue: 0, grossProfitPct: 0, netProfitPct: 0 },
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

// Build a baseline Step5 fixture: 1 revenue line at $100k/mo + 1 fixed OpEx
// line at $1000/mo (so Year total = $12,000 — used by Test 5 and Test 6).
function buildStep5Fixture(opexOverrides: Partial<OpExLine> = {}) {
  const monthly = emptyMonthly();
  for (const k of Object.keys(monthly)) monthly[k] = 100_000;
  const revLine = makeRevenueLine('rev-1', 'Hardware', monthly);

  const opexLine: OpExLine = {
    id: 'opex-rent',
    name: 'Rent',
    priorYearAnnual: 12_000,
    costBehavior: 'fixed',
    monthlyAmount: 1_000,
    ...opexOverrides,
  };

  return makeStubState({
    revenueLines: [revLine],
    opexLines: [opexLine],
  });
}

// ────────────────────────────────────────────────────────────────────────────
// UX-S5-01 — relabel the costBehavior dropdown + info-icon tooltip
// ────────────────────────────────────────────────────────────────────────────
describe('UX-S5-01 — Step 5 OpEx behavior labels + info tooltip', () => {
  it('Test 1: a fixed-cost row\'s dropdown selected option text reads "$ per month"', () => {
    const state = buildStep5Fixture({ costBehavior: 'fixed' });
    const actions = makeStubActions();
    render(<Step5OpEx state={state} actions={actions} fiscalYear={FISCAL_YEAR_END} />);

    // Locate the Type column dropdown for the Rent row.
    const select = screen
      .getAllByRole('combobox')
      .find((el) => (el as HTMLSelectElement).value === 'fixed') as HTMLSelectElement | undefined;
    expect(select, 'Expected a <select> with current value "fixed"').toBeDefined();

    // The DOM text of the currently-selected <option>.
    const selectedOption = Array.from(select!.options).find((opt) => opt.selected);
    expect(selectedOption?.textContent?.trim()).toBe('$ per month');
  });

  it('Test 2: all 4 dropdown options use the new operator-facing labels', () => {
    const state = buildStep5Fixture({ costBehavior: 'fixed' });
    const actions = makeStubActions();
    render(<Step5OpEx state={state} actions={actions} fiscalYear={FISCAL_YEAR_END} />);

    const select = screen
      .getAllByRole('combobox')
      .find((el) => (el as HTMLSelectElement).value === 'fixed') as HTMLSelectElement | undefined;
    expect(select).toBeDefined();

    const optionsByValue = Object.fromEntries(
      Array.from(select!.options).map((o) => [o.value, o.textContent?.trim()])
    );

    expect(optionsByValue['fixed']).toBe('$ per month');
    expect(optionsByValue['variable']).toBe('% of revenue');
    expect(optionsByValue['seasonal']).toBe('$ with annual increase');
    expect(optionsByValue['adhoc']).toBe('Custom per-month');
  });

  it('Test 3: an info-icon button is rendered with the explainer for all 4 options', () => {
    const state = buildStep5Fixture({ costBehavior: 'fixed' });
    const actions = makeStubActions();
    render(<Step5OpEx state={state} actions={actions} fiscalYear={FISCAL_YEAR_END} />);

    // Find the info-icon button by its accessible label.
    const infoButton = screen.getByRole('button', {
      name: /what does each option mean\?/i,
    });
    expect(infoButton).toBeTruthy();

    // The explainer must mention all 4 option labels (delivered via the
    // button's title attribute or text content).
    const explainer =
      (infoButton.getAttribute('title') || '') +
      ' ' +
      (infoButton.textContent || '');

    expect(explainer).toMatch(/\$ per month/i);
    expect(explainer).toMatch(/% of revenue/i);
    expect(explainer).toMatch(/\$ with annual increase/i);
    expect(explainer).toMatch(/custom per-month/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// UX-S5-02 — explicit "Year total" + "Monthly avg" column headers
// ────────────────────────────────────────────────────────────────────────────
describe('UX-S5-02 — Step 5 OpEx layout (Year total + Monthly avg headers)', () => {
  it('Test 4: rendered table exposes column headers "Year total" and "Monthly avg"', () => {
    const state = buildStep5Fixture({ costBehavior: 'fixed' });
    const actions = makeStubActions();
    render(<Step5OpEx state={state} actions={actions} fiscalYear={FISCAL_YEAR_END} />);

    const yearTotalHeader = screen.getByRole('columnheader', { name: /year total/i });
    const monthlyAvgHeader = screen.getByRole('columnheader', { name: /monthly avg/i });

    expect(yearTotalHeader).toBeTruthy();
    expect(monthlyAvgHeader).toBeTruthy();
  });

  it('Test 5: Year total + Monthly avg cells under those headers show $12,000 and $1,000', () => {
    const state = buildStep5Fixture({ costBehavior: 'fixed', monthlyAmount: 1_000 });
    const actions = makeStubActions();
    render(<Step5OpEx state={state} actions={actions} fiscalYear={FISCAL_YEAR_END} />);

    // Resolve the Monthly avg + Year total column indices, accounting for
    // rowSpan=2 cells in the primary header row.
    // Header row 1: [Expense (rs=2), FY{x} Actual (rs=2), Type (rs=2),
    //                Workings (colSpan=2 or 3), FY Forecast (rs=2), (action rs=2)]
    // Header row 2: [Monthly avg, Year total]   (Y1)
    //               [Increase, Monthly avg, Year total]  (Y2/Y3)
    const monthlyAvgHeader = screen.getByRole('columnheader', { name: /monthly avg/i });
    const yearTotalHeader = screen.getByRole('columnheader', { name: /year total/i });
    const subHeaderRow = monthlyAvgHeader.closest('tr');
    expect(subHeaderRow).toBeTruthy();

    // Map sub-header cells back to absolute column indices. The first 3
    // primary-row cells (Expense, FY{x} Actual, Type) take indices 0, 1, 2;
    // sub-header cells follow at index 3 onward.
    const subHeaderCells = Array.from(subHeaderRow!.querySelectorAll('th'));
    const baseColumnOffset = 3; // Expense + FY Actual + Type
    const monthlyAvgIdx =
      baseColumnOffset + subHeaderCells.indexOf(monthlyAvgHeader as HTMLTableCellElement);
    const yearTotalIdx =
      baseColumnOffset + subHeaderCells.indexOf(yearTotalHeader as HTMLTableCellElement);

    // Find the Rent body row.
    const table = subHeaderRow!.closest('table');
    expect(table).toBeTruthy();
    const tbody = table!.querySelector('tbody');
    expect(tbody).toBeTruthy();
    const rentRow = Array.from(tbody!.querySelectorAll('tr')).find((tr) =>
      Array.from(tr.querySelectorAll('input')).some(
        (i) => (i as HTMLInputElement).value === 'Rent'
      )
    );
    expect(rentRow, 'expected to find a body row containing the Rent name input').toBeTruthy();

    // Combine textContent + any <input> value within the cell so we can
    // assert against editable rows (the Monthly avg + Year total cells in Y1
    // render <input type="number"> with the numeric value, not text).
    const cellContent = (cell: HTMLTableCellElement | undefined): string => {
      if (!cell) return '';
      const text = cell.textContent || '';
      const inputs = Array.from(cell.querySelectorAll('input')) as HTMLInputElement[];
      const inputVals = inputs.map((i) => Number(i.value)).filter((n) => !isNaN(n) && n > 0);
      const inputText = inputVals.map((n) => `$${n.toLocaleString()}`).join(' ');
      return `${text} ${inputText}`.trim();
    };
    const bodyCells = Array.from(rentRow!.querySelectorAll('td')) as HTMLTableCellElement[];
    const monthlyAvgCellText = cellContent(bodyCells[monthlyAvgIdx]);
    const yearTotalCellText = cellContent(bodyCells[yearTotalIdx]);

    expect(monthlyAvgCellText).toMatch(/\$1,000/);
    expect(yearTotalCellText).toMatch(/\$12,000/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Back-compat — math + state shape unchanged after relabel
// ────────────────────────────────────────────────────────────────────────────
describe('Back-compat — Phase 51-05 must not change OpEx math or state shape', () => {
  it('Test 6: a costBehavior=fixed line with $1000/mo still produces $12,000 Y1 OpEx in summary', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'test-51-05-back-compat')
    );

    act(() => {
      result.current.actions.addOpExLine({
        name: 'Rent',
        priorYearAnnual: 12_000,
        costBehavior: 'fixed',
        monthlyAmount: 1_000, // → 12k/yr
      } as Omit<OpExLine, 'id'>);
    });

    // Summary path: useForecastWizard.ts:1018-1290 — `summary.year1.opex`.
    const summary = result.current.summary;
    expect(summary.year1).toBeDefined();
    expect(summary.year1!.opex).toBe(12_000);

    // Underlying state shape unchanged — costBehavior value still 'fixed'.
    const renderedLine = result.current.state.opexLines[0];
    expect(renderedLine.costBehavior).toBe('fixed');
  });
});
