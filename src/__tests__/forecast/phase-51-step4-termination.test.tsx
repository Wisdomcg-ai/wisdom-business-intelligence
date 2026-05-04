/**
 * Phase 51 Plan 04a — UX-S4-01: Step 4 end-employee termination flow
 *
 * Operator decision encoded here: ONLY the "ends on date X" mode is supported.
 * The "remove from FY entirely" alternative is dropped. Termination is purely
 * forward-looking — salary continues through the chosen end month, then drops
 * to zero from the following month onward.
 *
 * Reuses existing addDeparture rollup math at useForecastWizard.ts:1083-1115.
 * No rollup change in this plan.
 *
 * RED expectations on HEAD before Task 3 lands:
 *   - No element with aria-label `End employee {name}` exists → all four tests
 *     fail at the findByRole('button', { name: /^End employee / }) lookup.
 *
 * GREEN after Task 3:
 *   - End employee button rendered per non-departed row.
 *   - Modal opens, MonthPicker selects end month, Confirm dispatches
 *     addDeparture, summary.year1.teamCosts pro-rates correctly.
 *   - Cancel closes the modal without mutating state.
 *   - Already-departed members do NOT show the button (single-departure model).
 */

import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import { Step4Team } from '@/app/finances/forecast/components/wizard-v4/steps/Step4Team';
import type {
  TeamMember,
  ForecastWizardState,
} from '@/app/finances/forecast/components/wizard-v4/types';
import { SUPER_RATE } from '@/app/finances/forecast/components/wizard-v4/types';

// Clear localStorage between tests so wizard hook always starts clean
beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

const FY_START_YEAR = 2025; // FY July 2025 → June 2026
const FISCAL_YEAR_END = FY_START_YEAR + 1; // Step4Team prop convention: FY end year (2026)

// ────────────────────────────────────────────────────────────────────────────
// Step 4 real-hook test harness — modeled on Step3Harness in
// wizard-v4-bug-fixes.test.tsx:174-191. Seeds initial team members through the
// real useForecastWizard actions so the controlled-input round-trip closes
// (state → render → click → state → re-render).
// ────────────────────────────────────────────────────────────────────────────
type SeedMember = Omit<TeamMember, 'id' | 'newSalary' | 'superAmount'>;

function Step4Harness({
  businessId,
  initialMembers,
  initialDepartures,
  onState,
}: {
  businessId: string;
  initialMembers?: SeedMember[];
  initialDepartures?: Array<{ teamMemberId: string; endMonth: string }>;
  // Optional readout — receives the latest state so tests can assert summary
  // values without re-rendering the harness.
  onState?: (state: ForecastWizardState, summary: ReturnType<typeof useForecastWizard>['summary']) => void;
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

  // Seed departures by teamMemberId once members exist (one-shot)
  const departuresSeededRef = React.useRef(false);
  React.useEffect(() => {
    if (
      !departuresSeededRef.current &&
      initialDepartures &&
      initialDepartures.length > 0 &&
      wizard.state.teamMembers.length === initialMembers?.length
    ) {
      departuresSeededRef.current = true;
      initialDepartures.forEach((d) => {
        const member = wizard.state.teamMembers.find((m) => m.name === d.teamMemberId);
        if (member) {
          wizard.actions.addDeparture({ teamMemberId: member.id, endMonth: d.endMonth });
        }
      });
    }
  }, [wizard.state.teamMembers, initialDepartures, initialMembers, wizard.actions]);

  React.useEffect(() => {
    onState?.(wizard.state, wizard.summary);
  }, [wizard.state, wizard.summary, onState]);

  if (wizard.state.teamMembers.length === 0) return null;
  return (
    <Step4Team state={wizard.state} actions={wizard.actions} fiscalYear={FISCAL_YEAR_END} />
  );
}

function makeMember(overrides: Partial<SeedMember> = {}): SeedMember {
  return {
    name: 'Alice Tester',
    role: 'Engineer',
    type: 'full-time',
    hoursPerWeek: 38,
    currentSalary: 120_000,
    increasePct: 0,
    isFromXero: false,
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────────────
describe('UX-S4-01 — Step 4 end-employee termination flow', () => {
  it('Test 1: clicking End employee → picking Dec 2025 → Confirm pro-rates salary to 6 months in FY26', async () => {
    const user = userEvent.setup();
    let latestSummary: ReturnType<typeof useForecastWizard>['summary'] | null = null;
    render(
      <Step4Harness
        businessId="test-51-04a-term-1"
        initialMembers={[makeMember({ name: 'Alice Tester', currentSalary: 120_000 })]}
        onState={(_state, summary) => {
          latestSummary = summary;
        }}
      />
    );

    // Click the explicit "End employee Alice Tester" button.
    const endBtn = await screen.findByRole('button', { name: /^End employee Alice Tester$/i });
    await user.click(endBtn);

    // Modal opens — find the MonthPicker trigger inside the termination overlay.
    // The overlay header reads "End Alice Tester".
    const modalHeader = await screen.findByText(/^End Alice Tester$/);
    const modal = modalHeader.closest('div')!;
    expect(modal).toBeTruthy();

    // The overlay has a MonthPicker. Open it and select Dec 2025.
    // MonthPicker trigger has placeholder "Select end month" inside the modal.
    const pickerTrigger = within(modal.parentElement as HTMLElement).getByRole('button', {
      name: /select end month|jun \d{4}|dec \d{4}|jul \d{4}/i,
    });
    await user.click(pickerTrigger);

    // Click "Dec" — visible after the picker opens (selectedYear defaults to 2025
    // because Step4Team passes minYear=2025, and the default pendingEndMonth is
    // `${fiscalYear - 1}-12` = "2025-12").
    const decButton = await screen.findByRole('button', { name: /^Dec$/ });
    await user.click(decButton);

    // Confirm
    const confirmBtn = await screen.findByRole('button', { name: /^Confirm$/ });
    await user.click(confirmBtn);

    // After confirm: summary.year1.teamCosts should equal salary*6/12 + super*6/12.
    // For salary=$120,000, super = 120k * 12% = $14,400 → annual cost $134,400.
    // Pro-rated to 6 months (Jul, Aug, Sep, Oct, Nov, Dec) → $67,200.
    expect(latestSummary).not.toBeNull();
    const teamCosts = latestSummary!.year1!.teamCosts;
    // Allow ±$1 rounding tolerance from calculateSuper rounding.
    expect(teamCosts).toBeGreaterThanOrEqual(67_199);
    expect(teamCosts).toBeLessThanOrEqual(67_201);

    // Sanity: salary contribution alone (no super) is $60,000 — captured in
    // the rollup as the proRataSalary slice. Verify by isolating: super = 12% of
    // pro-rated salary, so total - super = salary slice.
    const expectedSalarySlice = 60_000;
    const expectedSuperSlice = Math.round(expectedSalarySlice * SUPER_RATE);
    expect(teamCosts).toBe(expectedSalarySlice + expectedSuperSlice);
  });

  it('Test 2: End employee button has accessible name including the member name', async () => {
    render(
      <Step4Harness
        businessId="test-51-04a-term-2"
        initialMembers={[makeMember({ name: 'Bob Owner', currentSalary: 100_000 })]}
      />
    );

    // The button must be discoverable by aria-label containing the member name —
    // not just generic "End employee" — so screen readers identify which row.
    const btn = await screen.findByRole('button', { name: /^End employee Bob Owner$/i });
    expect(btn).toBeInTheDocument();
  });

  it('Test 3: Cancel closes the termination modal WITHOUT creating a Departure', async () => {
    const user = userEvent.setup();
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="test-51-04a-term-3"
        initialMembers={[makeMember({ name: 'Carol Manager', currentSalary: 90_000 })]}
        onState={(s) => {
          latestState = s;
        }}
      />
    );

    const endBtn = await screen.findByRole('button', { name: /^End employee Carol Manager$/i });
    await user.click(endBtn);

    // Modal open — find Cancel button.
    const cancelBtn = await screen.findByRole('button', { name: /^Cancel$/i });
    await user.click(cancelBtn);

    // Modal closed — header gone.
    expect(screen.queryByText(/^End Carol Manager$/)).not.toBeInTheDocument();

    // No departure was created.
    expect(latestState).not.toBeNull();
    expect(latestState!.departures).toHaveLength(0);
  });

  it('Test 4: already-departed member does NOT show the End employee button (single-departure model)', async () => {
    render(
      <Step4Harness
        businessId="test-51-04a-term-4"
        initialMembers={[
          makeMember({ name: 'Dave Departed', currentSalary: 100_000 }),
          makeMember({ name: 'Eve Active', currentSalary: 100_000 }),
        ]}
        // Seed a departure on Dave by name (harness resolves to id once members exist)
        initialDepartures={[{ teamMemberId: 'Dave Departed', endMonth: '2025-10' }]}
      />
    );

    // Wait for Eve's button to appear (proves render is settled).
    await screen.findByRole('button', { name: /^End employee Eve Active$/i });

    // Dave is departed — no End employee button for him.
    expect(
      screen.queryByRole('button', { name: /^End employee Dave Departed$/i })
    ).not.toBeInTheDocument();
  });
});
