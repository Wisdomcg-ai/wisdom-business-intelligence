/**
 * Phase 51 Plan 04b — UX-S4-03: Step 4 pay frequency selector
 *
 * Pure persistence plan — adds an optional `payFrequency` field to TeamMember
 * and NewHire (per-employee selector) and an optional `defaultPayFrequency` to
 * the wizard state (business-level default). Surface both in Step 4.
 *
 * No rollup math change. Annual salary is unchanged regardless of frequency.
 * Phase 52 wires this field to Xero auto-fill (PayrollCalendar) + cashflow
 * timing — not this plan.
 *
 * UX-S4-03 EXPECTED FAILURES on HEAD (51-04b Task 1 RED):
 *   - Tests 1, 6: dropdown labels don't exist → findByLabelText throws
 *   - Test 5: TypeScript fails at runtime if payFrequency not on TeamMember
 *   - Test 7: TypeScript fails if defaultPayFrequency not on ForecastWizardState
 *   - Tests 2, 3, 4, 8: dropdown doesn't render → assertions can't run
 *   - Test 9: passes today by accident (no field → no math change). After
 *     the field is added, this test is the regression-lock that confirms the
 *     summary still does not consume payFrequency.
 *   - Test 10: backward-compat lock — same idea as Test 9.
 */

import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import { Step4Team } from '@/app/finances/forecast/components/wizard-v4/steps/Step4Team';
import type {
  TeamMember,
  ForecastWizardState,
  PayFrequency,
} from '@/app/finances/forecast/components/wizard-v4/types';

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

const FY_START_YEAR = 2025;
const FISCAL_YEAR_END = FY_START_YEAR + 1;

type SeedMember = Omit<TeamMember, 'id' | 'newSalary' | 'superAmount'>;

// ────────────────────────────────────────────────────────────────────────────
// Step 4 real-hook test harness — extended from 51-04a's pattern with the
// ability to seed `state.defaultPayFrequency` and per-row `payFrequency`
// overrides via the real wizard actions.
// ────────────────────────────────────────────────────────────────────────────
function Step4Harness({
  businessId,
  initialMembers,
  initialDefaultPayFrequency,
  onState,
  onSummary,
}: {
  businessId: string;
  initialMembers?: SeedMember[];
  initialDefaultPayFrequency?: PayFrequency;
  onState?: (state: ForecastWizardState) => void;
  onSummary?: (summary: ReturnType<typeof useForecastWizard>['summary']) => void;
}) {
  const wizard = useForecastWizard(FY_START_YEAR, businessId);
  const seededRef = React.useRef(false);
  React.useEffect(() => {
    if (!seededRef.current && initialMembers && wizard.state.teamMembers.length === 0) {
      seededRef.current = true;
      initialMembers.forEach((m) => wizard.actions.addTeamMember(m));
      // Apply per-row payFrequency overrides AFTER addTeamMember so the action
      // can stamp defaults; we then patch via updateTeamMember.
      initialMembers.forEach((m, idx) => {
        if (m.payFrequency !== undefined) {
          // We don't have ids yet on `m` (Omit'd); apply by index from the
          // freshly-seeded state. The setTimeout(0) defers until after the
          // state mutation flushes.
          setTimeout(() => {
            const member = wizard.state.teamMembers[idx];
            if (member) {
              wizard.actions.updateTeamMember(member.id, { payFrequency: m.payFrequency });
            }
          }, 0);
        }
      });
      if (initialDefaultPayFrequency !== undefined) {
        wizard.actions.setDefaultPayFrequency(initialDefaultPayFrequency);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    onState?.(wizard.state);
  }, [wizard.state, onState]);
  React.useEffect(() => {
    onSummary?.(wizard.summary);
  }, [wizard.summary, onSummary]);

  if (wizard.state.teamMembers.length === 0) return null;
  return (
    <Step4Team state={wizard.state} actions={wizard.actions} fiscalYear={FISCAL_YEAR_END} />
  );
}

function makeMember(overrides: Partial<SeedMember> = {}): SeedMember {
  return {
    name: 'Alice',
    role: 'Engineer',
    type: 'full-time',
    hoursPerWeek: 38,
    currentSalary: 100_000,
    increasePct: 0,
    isFromXero: false,
    ...overrides,
  };
}

describe('UX-S4-03 — Step 4 pay frequency selector', () => {
  it('Test 1: per-row pay-frequency dropdown is rendered for a TeamMember', async () => {
    render(
      <Step4Harness
        businessId="test-51-04b-pf-1"
        initialMembers={[makeMember({ name: 'Alice' })]}
      />
    );
    const dropdown = await screen.findByLabelText(/pay frequency for alice/i);
    expect(dropdown.tagName.toLowerCase()).toBe('select');
  });

  it('Test 2: defaults to monthly when payFrequency unset and no business default', async () => {
    render(
      <Step4Harness
        businessId="test-51-04b-pf-2"
        initialMembers={[makeMember({ name: 'Alice' })]}
      />
    );
    const dropdown = (await screen.findByLabelText(/pay frequency for alice/i)) as HTMLSelectElement;
    expect(dropdown.value).toBe('monthly');
  });

  it('Test 3: per-row dropdown inherits business default when row has no own payFrequency', async () => {
    render(
      <Step4Harness
        businessId="test-51-04b-pf-3"
        initialMembers={[makeMember({ name: 'Alice' })]}
        initialDefaultPayFrequency="fortnightly"
      />
    );
    const dropdown = (await screen.findByLabelText(/pay frequency for alice/i)) as HTMLSelectElement;
    // Wait one tick for setDefaultPayFrequency effect to flush
    await new Promise((r) => setTimeout(r, 20));
    const after = (await screen.findByLabelText(/pay frequency for alice/i)) as HTMLSelectElement;
    expect(after.value).toBe('fortnightly');
    // (Variable `dropdown` retained for documentation; same node.)
    expect(dropdown).toBe(after);
  });

  it('Test 4: per-row override wins over business default', async () => {
    render(
      <Step4Harness
        businessId="test-51-04b-pf-4"
        initialMembers={[makeMember({ name: 'Alice', payFrequency: 'weekly' })]}
        initialDefaultPayFrequency="fortnightly"
      />
    );
    // Wait for defaults + per-row override to flush
    await new Promise((r) => setTimeout(r, 30));
    const dropdown = (await screen.findByLabelText(/pay frequency for alice/i)) as HTMLSelectElement;
    expect(dropdown.value).toBe('weekly');
  });

  it('Test 5: setting per-row dropdown persists payFrequency to the team member', async () => {
    const user = userEvent.setup();
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="test-51-04b-pf-5"
        initialMembers={[makeMember({ name: 'Alice' })]}
        onState={(s) => {
          latestState = s;
        }}
      />
    );
    const dropdown = (await screen.findByLabelText(/pay frequency for alice/i)) as HTMLSelectElement;
    await user.selectOptions(dropdown, 'fortnightly');
    await new Promise((r) => setTimeout(r, 10));
    expect(latestState).not.toBeNull();
    expect(latestState!.teamMembers[0].payFrequency).toBe('fortnightly');
  });

  it('Test 6: business-default selector is rendered at the top of the team section', async () => {
    render(
      <Step4Harness
        businessId="test-51-04b-pf-6"
        initialMembers={[makeMember({ name: 'Alice' })]}
      />
    );
    const dropdown = await screen.findByLabelText(/^default pay frequency$/i);
    expect(dropdown.tagName.toLowerCase()).toBe('select');
  });

  it('Test 7: setting the business-default dropdown persists to state.defaultPayFrequency', async () => {
    const user = userEvent.setup();
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="test-51-04b-pf-7"
        initialMembers={[makeMember({ name: 'Alice' })]}
        onState={(s) => {
          latestState = s;
        }}
      />
    );
    const dropdown = (await screen.findByLabelText(/^default pay frequency$/i)) as HTMLSelectElement;
    await user.selectOptions(dropdown, 'fortnightly');
    await new Promise((r) => setTimeout(r, 10));
    expect(latestState).not.toBeNull();
    expect(latestState!.defaultPayFrequency).toBe('fortnightly');
  });

  it('Test 8: setting business default does NOT mutate per-row payFrequency (display-only inheritance)', async () => {
    const user = userEvent.setup();
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="test-51-04b-pf-8"
        initialMembers={[makeMember({ name: 'Alice' })]}
        onState={(s) => {
          latestState = s;
        }}
      />
    );

    // Set business default to 'weekly' — Alice's own payFrequency must remain undefined.
    const businessDefault = (await screen.findByLabelText(/^default pay frequency$/i)) as HTMLSelectElement;
    await user.selectOptions(businessDefault, 'weekly');
    await new Promise((r) => setTimeout(r, 10));

    expect(latestState).not.toBeNull();
    expect(latestState!.defaultPayFrequency).toBe('weekly');
    expect(latestState!.teamMembers[0].payFrequency).toBeUndefined();

    // Alice's row dropdown displays 'weekly' (inherited)
    let aliceDropdown = (await screen.findByLabelText(/pay frequency for alice/i)) as HTMLSelectElement;
    expect(aliceDropdown.value).toBe('weekly');

    // Switch business default to 'fortnightly' — Alice still undefined, display tracks default.
    await user.selectOptions(businessDefault, 'fortnightly');
    await new Promise((r) => setTimeout(r, 10));
    expect(latestState!.teamMembers[0].payFrequency).toBeUndefined();
    aliceDropdown = (await screen.findByLabelText(/pay frequency for alice/i)) as HTMLSelectElement;
    expect(aliceDropdown.value).toBe('fortnightly');
  });

  it('Test 9: NO rollup math change — annual teamCosts unchanged when payFrequency changes', async () => {
    const user = userEvent.setup();
    let latestSummary: ReturnType<typeof useForecastWizard>['summary'] | null = null;
    render(
      <Step4Harness
        businessId="test-51-04b-pf-9"
        initialMembers={[makeMember({ name: 'Alice', currentSalary: 100_000 })]}
        onSummary={(s) => {
          latestSummary = s;
        }}
      />
    );

    // Capture BEFORE
    await screen.findByLabelText(/pay frequency for alice/i);
    await new Promise((r) => setTimeout(r, 20));
    expect(latestSummary).not.toBeNull();
    const before = latestSummary!.year1.teamCosts;

    // Change Alice's pay frequency to 'weekly'
    const aliceDropdown = (await screen.findByLabelText(/pay frequency for alice/i)) as HTMLSelectElement;
    await user.selectOptions(aliceDropdown, 'weekly');
    await new Promise((r) => setTimeout(r, 20));

    const after = latestSummary!.year1.teamCosts;
    expect(after).toBe(before);

    // Also try the business-level default — must not change rollup either.
    const businessDefault = (await screen.findByLabelText(/^default pay frequency$/i)) as HTMLSelectElement;
    await user.selectOptions(businessDefault, 'fortnightly');
    await new Promise((r) => setTimeout(r, 20));
    const afterBusinessDefault = latestSummary!.year1.teamCosts;
    expect(afterBusinessDefault).toBe(before);
  });

  it('Test 10: backward-compat — TeamMember with payFrequency=undefined renders monthly with no state mutation', async () => {
    let latestState: ForecastWizardState | null = null;
    render(
      <Step4Harness
        businessId="test-51-04b-pf-10"
        initialMembers={[makeMember({ name: 'Alice' })]}
        onState={(s) => {
          latestState = s;
        }}
      />
    );

    const dropdown = (await screen.findByLabelText(/pay frequency for alice/i)) as HTMLSelectElement;
    expect(dropdown.value).toBe('monthly');
    // Render did NOT mutate the row — payFrequency is still undefined on the
    // canonical state.
    await new Promise((r) => setTimeout(r, 10));
    expect(latestState).not.toBeNull();
    expect(latestState!.teamMembers[0].payFrequency).toBeUndefined();
    expect(latestState!.defaultPayFrequency).toBeUndefined();
  });
});
