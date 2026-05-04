/**
 * Phase 51-03 — UX-S3-03: Step 3 per-line seasonality override
 *
 * Verifies that operators can override seasonality on a per-revenue-line and
 * per-fixed-COGS-line basis, and that the override propagates correctly through
 * BOTH the Step 3 display AND the rollup engine in useForecastWizard.ts.
 *
 * The Phase 50 Bug 4 lockstep risk: if the override is read by the display but
 * not by the rollup, monthly numbers in Step 9 Review and downstream cashflow
 * views will silently disagree with what the operator sees in Step 3. This
 * suite locks display + rollup in lockstep.
 *
 * Uses the real-hook test harness pattern (Step3Harness) — NOT vi.fn() stubs —
 * so seasonality writes round-trip through state correctly.
 *
 * EXPECTED FAILURES ON HEAD (Task 1 RED commit) — 8 failing:
 *   - Test 1: edit-seasonality button for Hardware (revenue) — FAILS (button doesn't exist)
 *   - Test 2: edit-seasonality button for Subscriptions (fixed COGS) — FAILS
 *   - Test 4: 12-month modal opens — FAILS (modal doesn't exist)
 *   - Test 5: save sets line.seasonalityPattern — FAILS (no save mechanism)
 *   - Test 6: display monthly distribution shifts — FAILS (no override field read)
 *   - Test 7: rollup monthly distribution shifts (LOCKSTEP) — FAILS
 *   - Test 8: annual total preserved — FAILS (test must open modal to set override; modal absent on HEAD)
 *   - Test 9: reset clears override — FAILS
 *
 * EXPECTED PASSES ON HEAD (lock current behavior) — 3 passing:
 *   - Test 3: variable COGS row HIDES button — passes by accident (no button anywhere)
 *   - Test 10: backward-compat regression lock (setPriorYear path) — baseline captured
 *             2026-05-04 from origin/main commit aba03f8. Distribution numbers MUST be
 *             bit-identical after Tasks 2+3 migrate inline seasonality reads.
 *   - Test 10b: backward-compat regression lock (Step 3 handleMixChange path) — same baseline.
 *
 * GREEN expectation after Task 5: 11/11 passing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import { Step3RevenueCOGS } from '@/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS';
import type { Goals, PriorYearData, RevenueLine, COGSLine } from '@/app/finances/forecast/components/wizard-v4/types';

// ─── Test infra ─────────────────────────────────────────────────────────────

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

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

const DEFAULT_GOALS: Goals = {
  year1: { revenue: 120_000, grossProfitPct: 50, netProfitPct: 15 },
  year2: { revenue: 0, grossProfitPct: 50, netProfitPct: 15 },
  year3: { revenue: 0, grossProfitPct: 50, netProfitPct: 15 },
};

// Front-loaded business seasonality (heavy Q1) — used so override-vs-business
// deltas are observable in tests.
const FRONT_LOADED_SEASONALITY = [25, 15, 10, 8, 7, 6, 6, 6, 5, 4, 4, 4]; // sums to 100

function makePriorYear(seasonality: number[]): PriorYearData {
  const total = 100_000;
  const byMonth: Record<string, number> = {};
  targetFYKeys().forEach((k, idx) => {
    byMonth[k] = Math.round(total * (seasonality[idx] / 100));
  });
  return {
    revenue: { total, byMonth, byLine: [] },
    cogs: { total: 0, percentOfRevenue: 0, byMonth: {}, byLine: [] },
    grossProfit: { total, percent: 100, byMonth: {} },
    opex: { total: 0, byMonth: {}, byLine: [] },
    seasonalityPattern: seasonality,
  };
}

interface HarnessProps {
  businessId: string;
  initialGoals?: Goals;
  initialPriorYear?: PriorYearData;
  initialRevLines?: Array<{ id: string; name: string; monthly?: Record<string, number>; seasonalityPattern?: number[] }>;
  initialCogsLines?: Array<{
    id: string;
    name: string;
    costBehavior: 'fixed' | 'variable';
    monthlyAmount?: number;
    percentOfRevenue?: number;
    seasonalityPattern?: number[];
  }>;
  /** Optional ref-callback that receives wizard state + actions on every render. */
  onWizard?: (wizard: ReturnType<typeof useForecastWizard>) => void;
}

/**
 * Real-hook test harness. Seeds goals + priorYear + revenue/COGS lines on
 * mount and exposes the wizard via onWizard callback for state assertions.
 */
function Step3Harness({
  businessId,
  initialGoals = DEFAULT_GOALS,
  initialPriorYear,
  initialRevLines,
  initialCogsLines,
  onWizard,
}: HarnessProps) {
  const wizard = useForecastWizard(FY_START_YEAR, businessId);
  const [seeded, setSeeded] = React.useState(false);

  React.useEffect(() => {
    if (seeded) return;
    if (initialGoals) wizard.actions.updateGoals(initialGoals);
    if (initialPriorYear) wizard.actions.setPriorYear(initialPriorYear);
    if (initialRevLines) {
      wizard.actions.setRevenueLines(
        initialRevLines.map((l) => ({
          id: l.id,
          name: l.name,
          year1Monthly: l.monthly || emptyMonthly(),
          ...(l.seasonalityPattern ? { seasonalityPattern: l.seasonalityPattern } : {}),
        }) as RevenueLine),
      );
    }
    if (initialCogsLines) {
      wizard.actions.setCOGSLines(
        initialCogsLines.map((l) => ({
          id: l.id,
          name: l.name,
          costBehavior: l.costBehavior,
          monthlyAmount: l.monthlyAmount,
          percentOfRevenue: l.percentOfRevenue,
          ...(l.seasonalityPattern ? { seasonalityPattern: l.seasonalityPattern } : {}),
        }) as COGSLine),
      );
    }
    setSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (onWizard) onWizard(wizard);
  if (!seeded) return null;
  return <Step3RevenueCOGS state={wizard.state} actions={wizard.actions} fiscalYear={FISCAL_YEAR_END} />;
}

// ────────────────────────────────────────────────────────────────────────────
// UX-S3-03 — Step 3 per-line seasonality override
// ────────────────────────────────────────────────────────────────────────────

describe('UX-S3-03 — Step 3 per-line seasonality override', () => {
  it('Test 1: edit-seasonality button is visible for revenue lines', async () => {
    render(
      <Step3Harness
        businessId="test-51-03-1"
        initialPriorYear={makePriorYear(FRONT_LOADED_SEASONALITY)}
        initialRevLines={[{ id: 'rev-1', name: 'Hardware' }]}
      />,
    );

    // The button exposes itself via aria-label `Edit seasonality for <line.name>`
    const button = await screen.findByLabelText(/Edit seasonality for Hardware/i);
    expect(button).toBeInTheDocument();
  });

  it('Test 2: edit-seasonality button is visible for FIXED COGS lines', async () => {
    render(
      <Step3Harness
        businessId="test-51-03-2"
        initialPriorYear={makePriorYear(FRONT_LOADED_SEASONALITY)}
        initialRevLines={[{ id: 'rev-1', name: 'Hardware' }]}
        initialCogsLines={[
          { id: 'cogs-1', name: 'Subscriptions', costBehavior: 'fixed', monthlyAmount: 1000 },
        ]}
      />,
    );

    const button = await screen.findByLabelText(/Edit seasonality for Subscriptions/i);
    expect(button).toBeInTheDocument();
  });

  it('Test 3: edit-seasonality button is HIDDEN for VARIABLE COGS lines (operator decision)', async () => {
    render(
      <Step3Harness
        businessId="test-51-03-3"
        initialPriorYear={makePriorYear(FRONT_LOADED_SEASONALITY)}
        initialRevLines={[{ id: 'rev-1', name: 'Hardware' }]}
        initialCogsLines={[
          { id: 'cogs-1', name: 'Materials', costBehavior: 'variable', percentOfRevenue: 30 },
        ]}
      />,
    );

    // Wait for revenue button to confirm render (in GREEN) — for RED, just probe.
    // The variable-COGS row must NEVER render an edit-seasonality button.
    // queryBy returns null when not found (no throw).
    const variableButton = screen.queryByLabelText(/Edit seasonality for Materials/i);
    expect(variableButton).toBeNull();
  });

  it('Test 4: clicking the button opens a 12-month modal editor', async () => {
    const user = userEvent.setup();
    render(
      <Step3Harness
        businessId="test-51-03-4"
        initialPriorYear={makePriorYear(FRONT_LOADED_SEASONALITY)}
        initialRevLines={[{ id: 'rev-1', name: 'Hardware' }]}
      />,
    );

    const button = await screen.findByLabelText(/Edit seasonality for Hardware/i);
    await user.click(button);

    // After click, modal should render 12 inputs labeled `Seasonality month <Jul|Aug|...>`
    const monthLabels = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    for (const label of monthLabels) {
      const input = await screen.findByLabelText(new RegExp(`Seasonality month ${label}`, 'i'));
      expect(input).toBeInTheDocument();
    }
  });

  it('Test 5: save sets line.seasonalityPattern with the typed values', async () => {
    const user = userEvent.setup();
    let wizardRef: ReturnType<typeof useForecastWizard> | null = null;
    render(
      <Step3Harness
        businessId="test-51-03-5"
        initialPriorYear={makePriorYear(FRONT_LOADED_SEASONALITY)}
        initialRevLines={[{ id: 'rev-1', name: 'Hardware' }]}
        onWizard={(w) => { wizardRef = w; }}
      />,
    );

    const button = await screen.findByLabelText(/Edit seasonality for Hardware/i);
    await user.click(button);

    // Type a heavy front-load pattern: [50, 30, 10, 5, 1, 1, 1, 1, 1, 0, 0, 0] (sums 100)
    const pattern = [50, 30, 10, 5, 1, 1, 1, 1, 1, 0, 0, 0];
    const monthLabels = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    for (let i = 0; i < 12; i++) {
      const input = await screen.findByLabelText(new RegExp(`Seasonality month ${monthLabels[i]}`, 'i')) as HTMLInputElement;
      await user.click(input);
      await user.clear(input);
      if (pattern[i] > 0) await user.type(input, String(pattern[i]));
    }

    // Save button (text "Save")
    const saveButton = await screen.findByRole('button', { name: /^save$/i });
    await user.click(saveButton);

    // Assert state was updated
    const line = wizardRef?.state.revenueLines.find((l) => l.id === 'rev-1');
    expect(line?.seasonalityPattern).toBeDefined();
    if (line?.seasonalityPattern) {
      // Within ±1 per cell (number input rounds)
      for (let i = 0; i < 12; i++) {
        expect(Math.abs(line.seasonalityPattern[i] - pattern[i])).toBeLessThanOrEqual(1);
      }
    }
  });

  it('Test 6: override changes Step 3 display monthly distribution', async () => {
    const user = userEvent.setup();
    let wizardRef: ReturnType<typeof useForecastWizard> | null = null;
    render(
      <Step3Harness
        businessId="test-51-03-6"
        initialPriorYear={makePriorYear(FRONT_LOADED_SEASONALITY)}
        initialRevLines={[{ id: 'rev-1', name: 'Hardware' }]}
        onWizard={(w) => { wizardRef = w; }}
      />,
    );

    // Open the modal and save the heavy front-load pattern.
    const button = await screen.findByLabelText(/Edit seasonality for Hardware/i);
    await user.click(button);
    const pattern = [50, 30, 10, 5, 1, 1, 1, 1, 1, 0, 0, 0];
    const monthLabels = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    for (let i = 0; i < 12; i++) {
      const input = await screen.findByLabelText(new RegExp(`Seasonality month ${monthLabels[i]}`, 'i')) as HTMLInputElement;
      await user.click(input);
      await user.clear(input);
      if (pattern[i] > 0) await user.type(input, String(pattern[i]));
    }
    const saveButton = await screen.findByRole('button', { name: /^save$/i });
    await user.click(saveButton);

    // After save, trigger a redistribution by committing 100% mix on Hardware.
    const percentInput = await screen.findByLabelText(/Percent split for Hardware/i) as HTMLInputElement;
    await user.click(percentInput);
    await user.clear(percentInput);
    await user.type(percentInput, '100');
    await user.tab();

    // Read the resulting distribution. Y1 goal = $120k, Jul allocation should
    // honor the override (50%) → ~$60,000 (NOT 25% × $120k = $30k from business).
    const line = wizardRef?.state.revenueLines.find((l) => l.id === 'rev-1');
    expect(line).toBeDefined();
    const jul = line?.year1Monthly['2025-07'] ?? 0;
    expect(Math.abs(jul - 60_000)).toBeLessThanOrEqual(10);
  });

  it('Test 7: override changes useForecastWizard ROLLUP monthly distribution (LOCKSTEP)', async () => {
    const user = userEvent.setup();
    let wizardRef: ReturnType<typeof useForecastWizard> | null = null;
    render(
      <Step3Harness
        businessId="test-51-03-7"
        initialPriorYear={makePriorYear(FRONT_LOADED_SEASONALITY)}
        initialRevLines={[{ id: 'rev-1', name: 'Hardware' }]}
        onWizard={(w) => { wizardRef = w; }}
      />,
    );

    // Same setup as Test 6.
    const button = await screen.findByLabelText(/Edit seasonality for Hardware/i);
    await user.click(button);
    const pattern = [50, 30, 10, 5, 1, 1, 1, 1, 1, 0, 0, 0];
    const monthLabels = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    for (let i = 0; i < 12; i++) {
      const input = await screen.findByLabelText(new RegExp(`Seasonality month ${monthLabels[i]}`, 'i')) as HTMLInputElement;
      await user.click(input);
      await user.clear(input);
      if (pattern[i] > 0) await user.type(input, String(pattern[i]));
    }
    const saveButton = await screen.findByRole('button', { name: /^save$/i });
    await user.click(saveButton);

    const percentInput = await screen.findByLabelText(/Percent split for Hardware/i) as HTMLInputElement;
    await user.click(percentInput);
    await user.clear(percentInput);
    await user.type(percentInput, '100');
    await user.tab();

    // Lockstep assertion — both display state AND summary rollup must reflect
    // the per-line override. Today's summary aggregates monthly, so if the
    // override has been applied to year1Monthly (Tasks 2+3 + 5), the summary
    // total must equal the sum of the new distribution.
    //
    // The decisive lockstep check is per-month: the rollup contribution for
    // Jul must be ~$60k. We read the line's year1Monthly directly (which is
    // exactly what the rollup sums) AND assert summary.year1.revenue equals
    // sum of all monthly cells (proving the rollup didn't ignore the new
    // distribution).
    const line = wizardRef?.state.revenueLines.find((l) => l.id === 'rev-1');
    const jul = line?.year1Monthly['2025-07'] ?? 0;
    expect(Math.abs(jul - 60_000)).toBeLessThanOrEqual(10);

    const monthlyTotal = Object.values(line?.year1Monthly ?? {}).reduce((a, b) => a + b, 0);
    const summaryRevenue = wizardRef?.summary.year1?.revenue ?? 0;
    expect(summaryRevenue).toBe(monthlyTotal);
    // And summary.year1.revenue should be approximately $120k (annual unchanged)
    expect(Math.abs(summaryRevenue - 120_000)).toBeLessThanOrEqual(12);
  });

  it('Test 8: annual total UNCHANGED after override applied', async () => {
    const user = userEvent.setup();
    let wizardRef: ReturnType<typeof useForecastWizard> | null = null;
    render(
      <Step3Harness
        businessId="test-51-03-8"
        initialPriorYear={makePriorYear(FRONT_LOADED_SEASONALITY)}
        initialRevLines={[{ id: 'rev-1', name: 'Hardware' }]}
        onWizard={(w) => { wizardRef = w; }}
      />,
    );

    // Establish baseline: commit 100% mix without override → Y1 total = goal = $120k
    const percentInput = await screen.findByLabelText(/Percent split for Hardware/i) as HTMLInputElement;
    await user.click(percentInput);
    await user.clear(percentInput);
    await user.type(percentInput, '100');
    await user.tab();

    const beforeLine = wizardRef?.state.revenueLines.find((l) => l.id === 'rev-1');
    const beforeTotal = Object.values(beforeLine?.year1Monthly ?? {}).reduce((a, b) => a + b, 0);
    expect(Math.abs(beforeTotal - 120_000)).toBeLessThanOrEqual(12);

    // Now apply the override and re-commit mix → Y1 total still $120k
    const button = await screen.findByLabelText(/Edit seasonality for Hardware/i);
    await user.click(button);
    const pattern = [50, 30, 10, 5, 1, 1, 1, 1, 1, 0, 0, 0];
    const monthLabels = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    for (let i = 0; i < 12; i++) {
      const input = await screen.findByLabelText(new RegExp(`Seasonality month ${monthLabels[i]}`, 'i')) as HTMLInputElement;
      await user.click(input);
      await user.clear(input);
      if (pattern[i] > 0) await user.type(input, String(pattern[i]));
    }
    const saveButton = await screen.findByRole('button', { name: /^save$/i });
    await user.click(saveButton);

    await user.click(percentInput);
    await user.clear(percentInput);
    await user.type(percentInput, '100');
    await user.tab();

    const afterLine = wizardRef?.state.revenueLines.find((l) => l.id === 'rev-1');
    const afterTotal = Object.values(afterLine?.year1Monthly ?? {}).reduce((a, b) => a + b, 0);
    expect(Math.abs(afterTotal - 120_000)).toBeLessThanOrEqual(12);
  });

  it('Test 9: reset clears the override (seasonalityPattern → undefined)', async () => {
    const user = userEvent.setup();
    let wizardRef: ReturnType<typeof useForecastWizard> | null = null;
    render(
      <Step3Harness
        businessId="test-51-03-9"
        initialPriorYear={makePriorYear(FRONT_LOADED_SEASONALITY)}
        initialRevLines={[
          {
            id: 'rev-1',
            name: 'Hardware',
            seasonalityPattern: [50, 30, 10, 5, 1, 1, 1, 1, 1, 0, 0, 0],
          },
        ]}
        onWizard={(w) => { wizardRef = w; }}
      />,
    );

    // Confirm the line starts with an override
    const before = wizardRef?.state.revenueLines.find((l) => l.id === 'rev-1');
    expect(before?.seasonalityPattern).toBeDefined();

    // Open modal → click Reset
    const button = await screen.findByLabelText(/Edit seasonality for Hardware/i);
    await user.click(button);
    const resetButton = await screen.findByRole('button', { name: /reset to business seasonality/i });
    await user.click(resetButton);

    const after = wizardRef?.state.revenueLines.find((l) => l.id === 'rev-1');
    expect(after?.seasonalityPattern).toBeUndefined();
  });

  it('Test 10: BACKWARD-COMPAT REGRESSION LOCK — load forecast with no overrides; numbers bit-identical to HEAD', async () => {
    // Baseline captured 2026-05-04 from origin/main commit aba03f8 — DO NOT EDIT
    // without re-capturing. Regression-locks the current setPriorYear monthly
    // distribution path (which is one of the 5 inline seasonality reads in
    // useForecastWizard.ts that Task 3 will migrate). Tasks 2+3 must produce
    // bit-identical numbers; Tasks 4+5 must not change behavior when no line
    // has seasonalityPattern set.
    const EXPECTED_DEFAULT_LINE_MONTHLY: Record<string, number> = {
      '2025-07': 25000,
      '2025-08': 15000,
      '2025-09': 10000,
      '2025-10': 8000,
      '2025-11': 7000,
      '2025-12': 6000,
      '2026-01': 6000,
      '2026-02': 6000,
      '2026-03': 5000,
      '2026-04': 4000,
      '2026-05': 4000,
      '2026-06': 4000,
    };
    // Total: 100,000 (matches priorYear.revenue.total)

    let wizardRef: ReturnType<typeof useForecastWizard> | null = null;
    render(
      <Step3Harness
        businessId="test-51-03-10-baseline"
        initialPriorYear={makePriorYear(FRONT_LOADED_SEASONALITY)}
        // NOTE: no initialRevLines — let setPriorYear create the default
        // "Sales Revenue" line with seasonal distribution (the path that hits
        // useForecastWizard.ts:305 inline read).
        onWizard={(w) => { wizardRef = w; }}
      />,
    );

    // Allow setPriorYear effect to settle
    await new Promise((r) => setTimeout(r, 50));

    const lines = wizardRef?.state.revenueLines ?? [];
    expect(lines.length).toBe(1);
    expect(lines[0].name).toBe('Sales Revenue');

    // Bit-identical assertion: every month must match the captured baseline.
    for (const [key, expected] of Object.entries(EXPECTED_DEFAULT_LINE_MONTHLY)) {
      expect(lines[0].year1Monthly[key]).toBe(expected);
    }

    // And the per-line summary contribution must match the captured total.
    const total = Object.values(lines[0].year1Monthly).reduce((a, b) => a + b, 0);
    expect(total).toBe(100_000);
    expect(wizardRef?.summary.year1?.revenue).toBe(100_000);
  });

  it('Test 10b: BACKWARD-COMPAT (Step 3 handleMixChange path) — bit-identical to HEAD', async () => {
    // Baseline captured 2026-05-04 from origin/main commit aba03f8 — DO NOT EDIT
    // without re-capturing. Regression-locks the Step3RevenueCOGS.tsx
    // handleMixChange seasonality path (one of 6 inline reads Task 2 will migrate).
    // Hardware line, $120k goal, 100% mix → distribution must match captured numbers.
    const EXPECTED_AFTER_MIX_100: Record<string, number> = {
      '2025-07': 30000,
      '2025-08': 18000,
      '2025-09': 12000,
      '2025-10': 9600,
      '2025-11': 8400,
      '2025-12': 7200,
      '2026-01': 7200,
      '2026-02': 7200,
      '2026-03': 6000,
      '2026-04': 4800,
      '2026-05': 4800,
      '2026-06': 4800,
    };
    // Total: 120,000 (matches goals.year1.revenue × 100% mix)

    const user = userEvent.setup();
    let wizardRef: ReturnType<typeof useForecastWizard> | null = null;
    render(
      <Step3Harness
        businessId="test-51-03-10b-baseline"
        initialPriorYear={makePriorYear(FRONT_LOADED_SEASONALITY)}
        initialRevLines={[{ id: 'rev-1', name: 'Hardware' }]}
        onWizard={(w) => { wizardRef = w; }}
      />,
    );

    const percentInput = await screen.findByLabelText(/Percent split for Hardware/i) as HTMLInputElement;
    await user.click(percentInput);
    await user.clear(percentInput);
    await user.type(percentInput, '100');
    await user.tab();

    const line = wizardRef?.state.revenueLines.find((l) => l.id === 'rev-1');
    expect(line).toBeDefined();
    for (const [key, expected] of Object.entries(EXPECTED_AFTER_MIX_100)) {
      expect(line?.year1Monthly[key]).toBe(expected);
    }
    const total = Object.values(line?.year1Monthly ?? {}).reduce((a, b) => a + b, 0);
    expect(total).toBe(120_000);
  });
});

// Suppress unused warning — `within` is documented as a useful helper for
// future tests that need scoped queries inside the modal.
void within;
