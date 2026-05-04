/**
 * Phase 51 Plan 04a — UX-S4-02: Step 4 PT/casual hours-or-FTE mode toggle
 *
 * PartTimeSalaryInput today only supports hours-per-week. This plan extends it
 * with a Hours/FTE toggle. New optional `hoursMode?: 'hours' | 'fte'` field on
 * TeamMember + NewHire defaults to undefined → behaves as 'hours' (back-compat).
 *
 * STANDARD_HOURS = 38 (Step4Team.tsx:62). %FTE input shows round(hours/38 * 100).
 * Switching FTE input from 53% to 60% → hoursPerWeek = round(38 * 0.6) = 23,
 * salary pro-rates via existing PartTimeSalaryInput math.
 *
 * Toggling mode alone (without changing the value) MUST NOT mutate salary or
 * hours — only switch the displayed input.
 *
 * RED expectations on HEAD before Task 4 lands:
 *   - No "Hours mode" / "FTE mode" toggle → all four tests fail at the
 *     screen.findByRole('button', { name: /Hours mode|FTE mode/ }) lookup.
 *
 * GREEN after Task 4:
 *   - Hours mode default; %FTE toggle shows 53 for hoursPerWeek=20.
 *   - Setting %FTE to 60 calls updateTeamMember with hoursMode='fte' and
 *     hoursPerWeek=23.
 *   - Backward-compat: undefined hoursMode renders identically to 'hours' mode.
 */

import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import { Step4Team } from '@/app/finances/forecast/components/wizard-v4/steps/Step4Team';
import type {
  TeamMember,
  ForecastWizardState,
} from '@/app/finances/forecast/components/wizard-v4/types';

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

const FY_START_YEAR = 2025;
const FISCAL_YEAR_END = FY_START_YEAR + 1;
const STANDARD_HOURS = 38;

type SeedMember = Omit<TeamMember, 'id' | 'newSalary' | 'superAmount'>;

function Step4Harness({
  businessId,
  initialMembers,
  onState,
}: {
  businessId: string;
  initialMembers?: SeedMember[];
  onState?: (state: ForecastWizardState) => void;
}) {
  const wizard = useForecastWizard(FY_START_YEAR, businessId);
  const seededRef = React.useRef(false);
  React.useEffect(() => {
    if (!seededRef.current && initialMembers && wizard.state.teamMembers.length === 0) {
      seededRef.current = true;
      initialMembers.forEach((m) => wizard.actions.addTeamMember(m));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
    onState?.(wizard.state);
  }, [wizard.state, onState]);
  if (wizard.state.teamMembers.length === 0) return null;
  return (
    <Step4Team state={wizard.state} actions={wizard.actions} fiscalYear={FISCAL_YEAR_END} />
  );
}

function makePartTimer(overrides: Partial<SeedMember> = {}): SeedMember {
  return {
    name: 'Pat PartTime',
    role: 'Designer',
    type: 'part-time',
    hoursPerWeek: 20,
    currentSalary: 60_000, // 50% FTE → effective 53% by hours/STANDARD_HOURS
    increasePct: 0,
    isFromXero: false,
    ...overrides,
  };
}

// Locate the PartTimeSalaryInput container for the only seeded part-time row.
// PartTimeSalaryInput renders one CurrencyInput (salary) + one NumberInput (hours)
// + new toggle buttons. Find the salary input by its display value, then walk up
// to the wrapping div.
function findPartTimeContainer(): HTMLElement {
  // The currency input shows "60,000" (default makePartTimer salary)
  const salaryInputs = screen.getAllByRole('textbox') as HTMLInputElement[];
  const salary = salaryInputs.find((el) => /60,?000/.test(el.value));
  expect(salary, 'expected to find the seeded part-time salary input').toBeDefined();
  // The PartTimeSalaryInput wraps in a `div.w-28` per current implementation.
  const container = salary!.closest('div.w-28') as HTMLElement | null;
  expect(container, 'expected the PartTimeSalaryInput w-28 wrapper').not.toBeNull();
  return container as HTMLElement;
}

describe('UX-S4-02 — Step 4 PT/casual hours-or-FTE mode', () => {
  it('Test 1: defaults to Hours mode and displays hoursPerWeek (20) when hoursMode is undefined', async () => {
    render(
      <Step4Harness
        businessId="test-51-04a-pt-1"
        initialMembers={[makePartTimer({ hoursPerWeek: 20, currentSalary: 60_000 })]}
      />
    );

    // Hours mode toggle button must exist
    const hoursToggle = await screen.findByRole('button', { name: /^Hours mode$/i });
    const fteToggle = await screen.findByRole('button', { name: /^FTE mode$/i });
    expect(hoursToggle).toBeInTheDocument();
    expect(fteToggle).toBeInTheDocument();

    // In Hours mode the numeric input shows "20" (hoursPerWeek)
    const container = findPartTimeContainer();
    const numericInput = within(container).getByRole('spinbutton') as HTMLInputElement;
    expect(numericInput.value).toBe('20');
  });

  it('Test 2: clicking %FTE toggle switches mode; input now shows the %FTE (53 for 20/38)', async () => {
    const user = userEvent.setup();
    render(
      <Step4Harness
        businessId="test-51-04a-pt-2"
        initialMembers={[makePartTimer({ hoursPerWeek: 20, currentSalary: 60_000 })]}
      />
    );

    const fteToggle = await screen.findByRole('button', { name: /^FTE mode$/i });
    await user.click(fteToggle);

    // After mode switch the numeric input shows %FTE = round(20/38 * 100) = 53.
    const container = findPartTimeContainer();
    const numericInput = within(container).getByRole('spinbutton') as HTMLInputElement;
    expect(numericInput.value).toBe('53');
  });

  it('Test 3: typing 60 in FTE input persists hoursMode=fte AND hoursPerWeek=round(38*0.6)=23', async () => {
    const user = userEvent.setup();
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="test-51-04a-pt-3"
        initialMembers={[makePartTimer({ hoursPerWeek: 20, currentSalary: 60_000 })]}
        onState={(s) => {
          latestState = s;
        }}
      />
    );

    // Switch to FTE mode
    const fteToggle = await screen.findByRole('button', { name: /^FTE mode$/i });
    await user.click(fteToggle);

    // Type 60 into the FTE input
    const container = findPartTimeContainer();
    const numericInput = within(container).getByRole('spinbutton') as HTMLInputElement;
    await user.click(numericInput);
    await user.clear(numericInput);
    await user.type(numericInput, '60');
    // Blur to commit (NumberInput commits on blur)
    numericInput.blur();

    // Wait one microtask for state to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(latestState).not.toBeNull();
    const member = latestState!.teamMembers[0];
    expect(member.hoursMode).toBe('fte');
    // round(38 * 0.6) = round(22.8) = 23
    expect(member.hoursPerWeek).toBe(23);
    // Salary should pro-rate: existing PartTimeSalaryInput math is
    // newSalary = round(salary * (newHours / oldHours)) where oldHours was 20.
    // That gives: round(60000 * (23 / 20)) = round(69000) = 69_000.
    expect(member.currentSalary).toBeGreaterThanOrEqual(68_500);
    expect(member.currentSalary).toBeLessThanOrEqual(69_500);
  });

  it('Test 4: backward-compat — member with hoursMode=undefined renders identically to Hours mode', async () => {
    render(
      <Step4Harness
        businessId="test-51-04a-pt-4"
        // Explicitly do NOT set hoursMode — must default to 'hours' behaviour.
        initialMembers={[makePartTimer({ hoursPerWeek: 19, currentSalary: 60_000 })]}
      />
    );

    // Toggles render
    const hoursToggle = await screen.findByRole('button', { name: /^Hours mode$/i });
    expect(hoursToggle).toBeInTheDocument();

    // Default is Hours mode → numeric input shows "19" (hoursPerWeek), not the
    // %FTE = round(19/38*100) = 50.
    const container = findPartTimeContainer();
    const numericInput = within(container).getByRole('spinbutton') as HTMLInputElement;
    expect(numericInput.value).toBe('19');
  });
});
