/**
 * Step 5 — the "As budgeted" OpEx behaviour in the UI.
 *
 * What is pinned:
 *   - the behaviour is offered in the type dropdown;
 *   - a budgeted line's workings show its Y1 total (sum of the months);
 *   - the "Months" button opens a 12-input editor whose edits update the line;
 *   - typing an annual total re-targets the months but keeps their shape;
 *   - switching away carries the budgeted Y1 total into the new behaviour;
 *   - switching into it seeds twelve months that sum to the prior-year total.
 *
 * Harness mirrors phase-51-step5-labels.test.tsx (stub state + vi.fn actions,
 * so every assertion is on the update the UI asked for).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import React from 'react';
import { Step5OpEx } from '@/app/finances/forecast/components/wizard-v4/steps/Step5OpEx';
import type { ForecastWizardState, WizardActions, OpExLine, RevenueLine } from '@/app/finances/forecast/components/wizard-v4/types';

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) window.localStorage.clear();
});

const FY_START_YEAR = 2025; // Jul 2025 → Jun 2026
const FISCAL_YEAR = FY_START_YEAR + 1;

function fyKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 12; i++) {
    const calMonth = ((7 - 1 + i) % 12) + 1;
    const year = calMonth >= 7 ? FY_START_YEAR : FY_START_YEAR + 1;
    keys.push(`${year}-${String(calMonth).padStart(2, '0')}`);
  }
  return keys;
}
const KEYS = fyKeys();
const SHAPE = [900, 950, 1000, 1200, 1500, 2100, 800, 800, 850, 900, 1000, 1000]; // 13,000

function monthly(values: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  KEYS.forEach((k, i) => { out[k] = values[i]; });
  return out;
}

function makeStubActions(): WizardActions {
  const names = [
    'goToStep', 'nextStep', 'prevStep', 'setActiveYear', 'setBusinessProfile', 'setForecastDuration', 'updateGoals',
    'setPriorYear', 'setRevenuePattern', 'setRevenueLines', 'setCOGSLines', 'updateRevenueLine', 'addRevenueLine',
    'removeRevenueLine', 'updateCOGSLine', 'addCOGSLine', 'removeCOGSLine', 'updateTeamMember', 'addTeamMember',
    'removeTeamMember', 'addNewHire', 'updateNewHire', 'removeNewHire', 'addDeparture', 'removeDeparture', 'addBonus',
    'updateBonus', 'removeBonus', 'addCommission', 'updateCommission', 'removeCommission', 'setDefaultOpExIncreasePct',
    'setOpExLines', 'updateOpExLine', 'addOpExLine', 'removeOpExLine', 'addCapExItem', 'updateCapExItem',
    'removeCapExItem', 'addInvestment', 'updateInvestment', 'removeInvestment', 'addPlannedSpend', 'updatePlannedSpend',
    'removePlannedSpend', 'addOtherExpense', 'updateOtherExpense', 'removeOtherExpense', 'initializeFromXero',
    'saveDraft', 'generateForecast',
  ] as const;
  const obj: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const n of names) obj[n] = vi.fn();
  return obj as unknown as WizardActions;
}

function makeState(opexLines: OpExLine[]): ForecastWizardState {
  const rev: Record<string, number> = {};
  for (const k of KEYS) rev[k] = 100_000;
  const revLine: RevenueLine = { id: 'rev-1', name: 'Services', year1Monthly: rev };
  return {
    wizardVersion: 10,
    businessId: 'test-business-budgeted',
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
    revenueLines: [revLine],
    cogsLines: [],
    teamMembers: [],
    newHires: [],
    departures: [],
    bonuses: [],
    commissions: [],
    defaultOpExIncreasePct: 3,
    opexLines,
    capexItems: [],
    investments: [],
    plannedSpends: [],
    subscriptions: [],
    maxVisitedStep: 1,
  } as unknown as ForecastWizardState;
}

const BUDGETED_LINE: OpExLine = {
  id: 'opex-mkt',
  name: 'Marketing',
  accountCode: '6100',
  priorYearAnnual: 12_000,
  costBehavior: 'budgeted',
  budgetedMonthly: monthly(SHAPE),
};

function renderStep5(lines: OpExLine[]) {
  const actions = makeStubActions();
  const state = makeState(lines);
  render(<Step5OpEx state={state} actions={actions} fiscalYear={FISCAL_YEAR} industry="services" businessId="test-business-budgeted" />);
  return { actions, state };
}

function rowFor(name: string): HTMLElement {
  const input = screen.getByDisplayValue(name) as HTMLInputElement;
  const row = input.closest('tr');
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

function lastUpdate(actions: WizardActions): { id: string; updates: Partial<OpExLine> } {
  const calls = (actions.updateOpExLine as unknown as ReturnType<typeof vi.fn>).mock.calls;
  const [id, updates] = calls[calls.length - 1];
  return { id, updates };
}

describe('Step 5 — As budgeted', () => {
  it('offers the behaviour and shows the budgeted year total', () => {
    renderStep5([BUDGETED_LINE]);
    const row = rowFor('Marketing');
    const select = within(row).getByRole('combobox') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toContain('budgeted');
    expect(select.value).toBe('budgeted');
    // Year total (13,000) is rendered in the workings annual input.
    expect(within(row).getByDisplayValue('13000')).toBeTruthy();
    expect(within(row).getByRole('button', { name: /edit months for marketing/i })).toBeTruthy();
  });

  it('opens a 12-month editor and edits a single month', () => {
    const { actions } = renderStep5([BUDGETED_LINE]);
    fireEvent.click(within(rowFor('Marketing')).getByRole('button', { name: /edit months for marketing/i }));
    const editor = screen.getByTestId('budget-months-opex-mkt');
    const inputs = within(editor).getAllByRole('spinbutton');
    expect(inputs).toHaveLength(12);
    fireEvent.change(within(editor).getByLabelText(`Marketing ${KEYS[0]}`), { target: { value: '1234' } });
    const { id, updates } = lastUpdate(actions);
    expect(id).toBe('opex-mkt');
    expect(updates.budgetedMonthly?.[KEYS[0]]).toBe(1234);
    expect(updates.budgetedMonthly?.[KEYS[5]]).toBe(2100); // other months untouched
  });

  it('re-targets the year to a typed annual total while keeping the monthly shape', () => {
    const { actions } = renderStep5([BUDGETED_LINE]);
    const row = rowFor('Marketing');
    fireEvent.change(within(row).getByDisplayValue('13000'), { target: { value: '26000' } });
    const { updates } = lastUpdate(actions);
    const months = updates.budgetedMonthly!;
    const sum = KEYS.reduce((s, k) => s + months[k], 0);
    expect(Math.round(sum * 100) / 100).toBe(26_000);
    expect(months[KEYS[5]]).toBeGreaterThan(months[KEYS[0]]); // December still the peak
    expect(months[KEYS[0]]).toBe(1800); // 900 × 2
  });

  it('carries the budgeted total into a fixed line when the behaviour is switched away', () => {
    const { actions } = renderStep5([BUDGETED_LINE]);
    const select = within(rowFor('Marketing')).getByRole('combobox');
    fireEvent.change(select, { target: { value: 'fixed' } });
    const { updates } = lastUpdate(actions);
    expect(updates.costBehavior).toBe('fixed');
    expect(updates.monthlyAmount).toBe(Math.round(13_000 / 12));
    expect(updates.budgetedMonthly).toBeUndefined();
  });

  it('seeds twelve months summing to the prior-year total when switched INTO budgeted', () => {
    const fixedLine: OpExLine = { id: 'opex-rent', name: 'Rent', priorYearAnnual: 24_000, costBehavior: 'fixed', monthlyAmount: 2_000 };
    const { actions } = renderStep5([fixedLine]);
    fireEvent.change(within(rowFor('Rent')).getByRole('combobox'), { target: { value: 'budgeted' } });
    const { updates } = lastUpdate(actions);
    expect(updates.costBehavior).toBe('budgeted');
    const months = updates.budgetedMonthly!;
    expect(Object.keys(months).sort()).toEqual([...KEYS].sort());
    expect(Math.round(KEYS.reduce((s, k) => s + months[k], 0) * 100) / 100).toBe(24_000);
    expect(months[KEYS[0]]).toBe(2_000); // flat when there is no prior-year monthly pattern
  });
});
