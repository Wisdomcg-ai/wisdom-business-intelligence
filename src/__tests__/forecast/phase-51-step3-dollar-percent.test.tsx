/**
 * Phase 51-01 — UX-S3-01: Step 3 Revenue $/% bidirectional parity
 *
 * Verifies that the new "$ for the year" input column on Step 3 revenue lines
 * round-trips with the existing "% Split" column:
 *   - Type $50,000 with goals.year1.revenue=200000 → % shows 25
 *   - Type 30% → $ shows 60,000
 *   - Both round-trip cleanly without keystroke loss / flicker
 *   - Existing % column behaviour preserved
 *   - Older saved forecasts (no $ column ever touched) render identically
 *
 * Uses the real-hook test harness pattern (Step3Harness) — NOT vi.fn() stubs —
 * per RESEARCH.md anti-pattern #2: stubbed actions never update state between
 * keystrokes, so a controlled-input round-trip test would not detect the bug.
 *
 * RED on HEAD (Task 1): the $ input column does not exist yet, so
 * `findByLabelText(/Annual dollars for/i)` will throw.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import { Step3RevenueCOGS } from '@/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS';
import type { Goals } from '@/app/finances/forecast/components/wizard-v4/types';

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
  year1: { revenue: 200_000, grossProfitPct: 50, netProfitPct: 15 },
  year2: { revenue: 0, grossProfitPct: 52, netProfitPct: 17 },
  year3: { revenue: 0, grossProfitPct: 55, netProfitPct: 20 },
};

interface HarnessProps {
  businessId: string;
  initialGoals?: Goals;
  initialRevLines?: Array<{ id: string; name: string; monthly?: Record<string, number> }>;
}

/**
 * Real-hook test harness — extends the Step3Harness pattern from
 * wizard-v4-bug-fixes.test.tsx:174-191 to also accept initialGoals so we can
 * seed goals.year1.revenue before rendering the step. The seeding useEffect
 * runs once on mount.
 */
function Step3Harness({ businessId, initialGoals = DEFAULT_GOALS, initialRevLines }: HarnessProps) {
  const wizard = useForecastWizard(FY_START_YEAR, businessId);
  const [seeded, setSeeded] = React.useState(false);

  React.useEffect(() => {
    if (seeded) return;
    if (initialRevLines && wizard.state.revenueLines.length === 0) {
      wizard.actions.setRevenueLines(
        initialRevLines.map((l) => ({
          id: l.id,
          name: l.name,
          year1Monthly: l.monthly || emptyMonthly(),
        })),
      );
    }
    if (initialGoals) {
      wizard.actions.updateGoals(initialGoals);
    }
    setSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!seeded || wizard.state.revenueLines.length === 0) return null;
  return <Step3RevenueCOGS state={wizard.state} actions={wizard.actions} fiscalYear={FISCAL_YEAR_END} />;
}

// ────────────────────────────────────────────────────────────────────────────
// UX-S3-01 — Step 3 $/% bidirectional parity
// ────────────────────────────────────────────────────────────────────────────

describe('UX-S3-01 — Step 3 $/% bidirectional parity', () => {
  it('Test 1: typing $50,000 in the $ column updates the % column to 25 (goals.year1.revenue=200000)', async () => {
    const user = userEvent.setup();
    render(
      <Step3Harness
        businessId="test-51-01-1"
        initialRevLines={[{ id: 'rev-1', name: 'Hardware' }]}
      />,
    );

    const dollarInput = (await screen.findByLabelText(/Annual dollars for Hardware/i)) as HTMLInputElement;
    const percentInput = (await screen.findByLabelText(/Percent split for Hardware/i)) as HTMLInputElement;

    await user.click(dollarInput);
    await user.clear(dollarInput);
    await user.type(dollarInput, '50000');
    await user.tab(); // blur → commit

    // After commit, % should reflect 50000 / 200000 = 25%
    expect(percentInput.value).toBe('25');
  });

  it('Test 2: typing 30 in the % column updates the $ column to 60,000', async () => {
    const user = userEvent.setup();
    render(
      <Step3Harness
        businessId="test-51-01-2"
        initialRevLines={[{ id: 'rev-1', name: 'Hardware' }]}
      />,
    );

    const dollarInput = (await screen.findByLabelText(/Annual dollars for Hardware/i)) as HTMLInputElement;
    const percentInput = (await screen.findByLabelText(/Percent split for Hardware/i)) as HTMLInputElement;

    await user.click(percentInput);
    await user.clear(percentInput);
    await user.type(percentInput, '30');
    await user.tab(); // blur → commit

    // After commit, $ should reflect 30% × 200000 = 60000
    expect(Number(dollarInput.value)).toBe(60_000);
  });

  it('Test 3: round-trip — type $40000, then 20%, then $80000 — final state is $80000 / 40%', async () => {
    const user = userEvent.setup();
    render(
      <Step3Harness
        businessId="test-51-01-3"
        initialRevLines={[{ id: 'rev-1', name: 'Hardware' }]}
      />,
    );

    const dollarInput = (await screen.findByLabelText(/Annual dollars for Hardware/i)) as HTMLInputElement;
    const percentInput = (await screen.findByLabelText(/Percent split for Hardware/i)) as HTMLInputElement;

    // Step A: type $40000 → % becomes 20
    await user.click(dollarInput);
    await user.clear(dollarInput);
    await user.type(dollarInput, '40000');
    await user.tab();
    expect(percentInput.value).toBe('20');

    // Step B: type 20 in % (no change, but verify no flicker on commit)
    await user.click(percentInput);
    await user.clear(percentInput);
    await user.type(percentInput, '20');
    await user.tab();
    expect(Number(dollarInput.value)).toBe(40_000);

    // Step C: type $80000 → % becomes 40
    await user.click(dollarInput);
    await user.clear(dollarInput);
    await user.type(dollarInput, '80000');
    await user.tab();
    expect(percentInput.value).toBe('40');
    expect(Number(dollarInput.value)).toBe(80_000);
  });

  it('Test 4: while typing in $ mid-keystroke (not yet blurred), % stays at last committed value (no flicker)', async () => {
    const user = userEvent.setup();
    render(
      <Step3Harness
        businessId="test-51-01-4"
        initialRevLines={[{ id: 'rev-1', name: 'Hardware' }]}
      />,
    );

    const dollarInput = (await screen.findByLabelText(/Annual dollars for Hardware/i)) as HTMLInputElement;
    const percentInput = (await screen.findByLabelText(/Percent split for Hardware/i)) as HTMLInputElement;

    // First commit a known baseline so % has a value to "stick" to.
    await user.click(dollarInput);
    await user.clear(dollarInput);
    await user.type(dollarInput, '40000');
    await user.tab();
    expect(percentInput.value).toBe('20');

    // Now start typing in $ but DO NOT blur. Mid-edit, % should NOT update —
    // it should stay at "20" (the last committed value) until $ blurs.
    await user.click(dollarInput);
    await user.clear(dollarInput);
    await user.type(dollarInput, '5000');
    // No tab/blur yet. % must still read "20".
    expect(percentInput.value).toBe('20');
    // The $ display reflects the in-progress typed value
    expect(dollarInput.value).toBe('5000');
  });

  it('Test 5: backward-compat — load a forecast with no $-column edits ever made; line totals unchanged from baseline', async () => {
    // Seed an existing line with explicit monthly values that sum to 50000.
    // The seeded monthly distribution (50000 across the year) must remain
    // unchanged after the page renders. The $ input value should reflect
    // that 50000 line total (derived from year1Monthly), and % should reflect
    // 50000/200000 = 25.
    const monthly = emptyMonthly();
    const keys = targetFYKeys();
    // Distribute 50000 evenly: ~4166.67 per month
    keys.forEach((k) => {
      monthly[k] = Math.round(50_000 / 12);
    });

    render(
      <Step3Harness
        businessId="test-51-01-5"
        initialRevLines={[{ id: 'rev-1', name: 'Hardware', monthly }]}
      />,
    );

    const dollarInput = (await screen.findByLabelText(/Annual dollars for Hardware/i)) as HTMLInputElement;
    const percentInput = (await screen.findByLabelText(/Percent split for Hardware/i)) as HTMLInputElement;

    // The committed $ display should round-trip the original line total
    // (within rounding tolerance — the seeded monthly values sum to ~49,996
    // due to integer rounding of 50000/12).
    const seededTotal = Object.values(monthly).reduce((a, b) => a + b, 0);
    expect(Number(dollarInput.value)).toBe(seededTotal);

    // % should reflect seededTotal / 200000 (rounded). For ~49,996 → 25%.
    expect(percentInput.value).toBe('25');
  });
});
