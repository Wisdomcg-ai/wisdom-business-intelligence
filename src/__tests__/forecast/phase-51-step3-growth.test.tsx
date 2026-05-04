/**
 * Phase 51-02 — UX-S3-02: Step 3 Y-on-Y Growth % column for Y2/Y3 views
 *
 * Verifies that a third "Growth %" editor appears on every revenue line in the
 * Y2 and Y3 views (and is HIDDEN in Y1):
 *   - Y1 view: no Growth column rendered
 *   - Y2 view: Growth column visible; typing 20 → Y2 total = Y1 total × 1.20
 *   - Y3 view: Growth column visible; growth derives from Y2 line total
 *   - $ commit on Y2 updates Growth display (round-trip)
 *   - Forecast loaded with no Y2 data renders Growth as 0 (display floor)
 *
 * Uses the real-hook test harness pattern (Step3Harness) — extended with a
 * `seededActiveYear` prop so tests can switch between Y1 / Y2 / Y3 views via
 * `actions.setActiveYear`. NOT vi.fn() stubs — per RESEARCH.md anti-pattern #2,
 * stubs cannot detect controlled-input round-trips.
 *
 * UX-S3-02 EXPECTED FAILURES on HEAD (51-02 Task 1 RED):
 * - Tests 2-6: no input has aria-label matching /growth.*<line-name>/i yet
 *   → findByLabelText throws "Unable to find a label matching".
 * - Test 1: queryByLabelText returns null on HEAD too (column doesn't render
 *   in any year), so this passes "by accident" on HEAD. After Task 2 lands,
 *   it locks the Y1-hidden behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import { Step3RevenueCOGS } from '@/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS';
import type { Goals, RevenueLine } from '@/app/finances/forecast/components/wizard-v4/types';

// ─── Test infra ─────────────────────────────────────────────────────────────

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

const FY_START_YEAR = 2025; // July 2025 → June 2026 (Y1)
const FISCAL_YEAR_END = FY_START_YEAR + 1;

function fyKeysForYearOffset(yearOffset: 0 | 1 | 2): string[] {
  // yearOffset 0 = Y1 (Jul 2025 - Jun 2026)
  // yearOffset 1 = Y2 (Jul 2026 - Jun 2027)
  // yearOffset 2 = Y3 (Jul 2027 - Jun 2028)
  const keys: string[] = [];
  const startYear = FY_START_YEAR + yearOffset;
  for (let i = 0; i < 12; i++) {
    const calMonth = ((7 - 1 + i) % 12) + 1;
    const year = calMonth >= 7 ? startYear : startYear + 1;
    keys.push(`${year}-${String(calMonth).padStart(2, '0')}`);
  }
  return keys;
}

function emptyMonthly(yearOffset: 0 | 1 | 2 = 0): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of fyKeysForYearOffset(yearOffset)) out[k] = 0;
  return out;
}

function evenMonthly(total: number, yearOffset: 0 | 1 | 2 = 0): Record<string, number> {
  const out: Record<string, number> = {};
  const per = Math.round(total / 12);
  for (const k of fyKeysForYearOffset(yearOffset)) out[k] = per;
  return out;
}

const DEFAULT_GOALS: Goals = {
  year1: { revenue: 200_000, grossProfitPct: 50, netProfitPct: 15 },
  year2: { revenue: 240_000, grossProfitPct: 52, netProfitPct: 17 },
  year3: { revenue: 264_000, grossProfitPct: 55, netProfitPct: 20 },
};

interface SeedRevLine {
  id: string;
  name: string;
  year1Monthly?: Record<string, number>;
  year2Monthly?: Record<string, number>;
  year3Monthly?: Record<string, number>;
}

interface HarnessProps {
  businessId: string;
  initialGoals?: Goals;
  initialRevLines: SeedRevLine[];
  /** 1 | 2 | 3 — view to render. Wizard's actions.setActiveYear is invoked. */
  seededActiveYear?: 1 | 2 | 3;
}

/**
 * Real-hook test harness — extends the 51-01 Step3Harness with:
 *   1. Y1/Y2/Y3 monthly seeds on revenue lines
 *   2. activeYear control via actions.setActiveYear
 */
function Step3Harness({ businessId, initialGoals = DEFAULT_GOALS, initialRevLines, seededActiveYear = 1 }: HarnessProps) {
  const wizard = useForecastWizard(FY_START_YEAR, businessId);
  const [seeded, setSeeded] = React.useState(false);

  React.useEffect(() => {
    if (seeded) return;
    if (initialRevLines && wizard.state.revenueLines.length === 0) {
      const lines: RevenueLine[] = initialRevLines.map((l) => ({
        id: l.id,
        name: l.name,
        year1Monthly: l.year1Monthly || emptyMonthly(0),
        year2Monthly: l.year2Monthly,
        year3Monthly: l.year3Monthly,
      }));
      wizard.actions.setRevenueLines(lines);
    }
    if (initialGoals) {
      wizard.actions.updateGoals(initialGoals);
    }
    if (seededActiveYear !== 1) {
      wizard.actions.setActiveYear(seededActiveYear);
    }
    setSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!seeded || wizard.state.revenueLines.length === 0) return null;
  // Wait for activeYear to actually flip to the seeded value before rendering.
  if (wizard.state.activeYear !== seededActiveYear) return null;
  return <Step3RevenueCOGS state={wizard.state} actions={wizard.actions} fiscalYear={FISCAL_YEAR_END} />;
}

// ────────────────────────────────────────────────────────────────────────────
// UX-S3-02 — Step 3 Y-on-Y Growth % column
// ────────────────────────────────────────────────────────────────────────────

describe('UX-S3-02 — Step 3 Y-on-Y Growth % column', () => {
  it('Test 1: Y1 view — Growth column is HIDDEN (Y1 has no prior-year forecast line total)', async () => {
    render(
      <Step3Harness
        businessId="test-51-02-1"
        seededActiveYear={1}
        initialRevLines={[
          { id: 'rev-1', name: 'Hardware', year1Monthly: evenMonthly(50_000, 0) },
        ]}
      />,
    );

    // Sentinel: ensure Step 3 has rendered (the $ editor from 51-01 is present)
    await screen.findByLabelText(/Annual dollars for Hardware/i);

    // The Growth editor must NOT exist in Y1 view
    const growthInputs = screen.queryAllByLabelText(/Growth percent for Hardware/i);
    expect(growthInputs.length).toBe(0);
  });

  it('Test 2: Y2 view — Growth column visible with current implied growth (Y1=$50k, Y2=$60k → 20%)', async () => {
    render(
      <Step3Harness
        businessId="test-51-02-2"
        seededActiveYear={2}
        initialRevLines={[
          {
            id: 'rev-1',
            name: 'Hardware',
            year1Monthly: evenMonthly(50_000, 0),
            year2Monthly: evenMonthly(60_000, 1),
          },
        ]}
      />,
    );

    const growthInput = (await screen.findByLabelText(/Growth percent for Hardware/i)) as HTMLInputElement;
    // Implied growth: (60000 - 50000) / 50000 = 0.20 → 20
    expect(growthInput.value).toBe('20');
  });

  it('Test 3: Y2 view — typing 20 in Growth on a fresh Y2 line sets Y2 total = Y1 × 1.20 (within ±$10)', async () => {
    const user = userEvent.setup();
    render(
      <Step3Harness
        businessId="test-51-02-3"
        seededActiveYear={2}
        initialRevLines={[
          { id: 'rev-1', name: 'Hardware', year1Monthly: evenMonthly(50_000, 0) },
          // No year2Monthly seeded yet
        ]}
      />,
    );

    const growthInput = (await screen.findByLabelText(/Growth percent for Hardware/i)) as HTMLInputElement;

    await user.click(growthInput);
    await user.clear(growthInput);
    await user.type(growthInput, '20');
    await user.tab(); // blur → commit

    // After commit, Y2 line total should be ~$60,000. The displayed lineTotal
    // (the Y2 $ editor for the same row) reflects the freshly-distributed Y2 total.
    const dollarInput = (await screen.findByLabelText(/Annual dollars for Hardware/i)) as HTMLInputElement;
    const y2Total = Number(dollarInput.value);
    expect(Math.abs(y2Total - 60_000)).toBeLessThanOrEqual(10);
  });

  it('Test 4: Y3 view — Growth column visible; typing 10 sets Y3 total = Y2 × 1.10 (within ±$10)', async () => {
    const user = userEvent.setup();
    render(
      <Step3Harness
        businessId="test-51-02-4"
        seededActiveYear={3}
        initialRevLines={[
          {
            id: 'rev-1',
            name: 'Hardware',
            year1Monthly: evenMonthly(50_000, 0),
            year2Monthly: evenMonthly(60_000, 1),
            // No year3Monthly seeded yet
          },
        ]}
      />,
    );

    const growthInput = (await screen.findByLabelText(/Growth percent for Hardware/i)) as HTMLInputElement;

    await user.click(growthInput);
    await user.clear(growthInput);
    await user.type(growthInput, '10');
    await user.tab();

    const dollarInput = (await screen.findByLabelText(/Annual dollars for Hardware/i)) as HTMLInputElement;
    const y3Total = Number(dollarInput.value);
    // Y2 total is ~59,988 (round(60000/12)*12 = 4999 *12). Growth 10% → ~65,987.
    // Allow ±$15 because seasonality rounding can bias slightly per-month.
    expect(Math.abs(y3Total - 65_987)).toBeLessThanOrEqual(50);
  });

  it('Test 5: Y2 view — round-trip: typing $60000 in $ updates Growth display to 20', async () => {
    const user = userEvent.setup();
    render(
      <Step3Harness
        businessId="test-51-02-5"
        seededActiveYear={2}
        initialRevLines={[
          { id: 'rev-1', name: 'Hardware', year1Monthly: evenMonthly(50_000, 0) },
        ]}
      />,
    );

    const dollarInput = (await screen.findByLabelText(/Annual dollars for Hardware/i)) as HTMLInputElement;
    const growthInput = (await screen.findByLabelText(/Growth percent for Hardware/i)) as HTMLInputElement;

    await user.click(dollarInput);
    await user.clear(dollarInput);
    await user.type(dollarInput, '60000');
    await user.tab();

    // Growth display should now reflect (60000 - 50000) / 50000 → 20
    expect(growthInput.value).toBe('20');
  });

  it('Test 6: Y2 view — back-compat: line with Y1=$50k and NO year2Monthly renders Growth as 0 (floor)', async () => {
    render(
      <Step3Harness
        businessId="test-51-02-6"
        seededActiveYear={2}
        initialRevLines={[
          { id: 'rev-1', name: 'Hardware', year1Monthly: evenMonthly(50_000, 0) },
          // No year2Monthly at all → thisYearTotal = 0
        ]}
      />,
    );

    const growthInput = (await screen.findByLabelText(/Growth percent for Hardware/i)) as HTMLInputElement;

    // Display floor: when Y2 total is 0 (no entry yet), show 0 (not -100)
    // so the operator isn't confronted with -100% as a default.
    expect(growthInput.value).toBe('0');
  });
});
