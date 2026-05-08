/**
 * Hotfix regression test — Xero reconciliation drift detection.
 *
 * Bug (HIGH severity): PR #136 fixed customization-wipe by swapping
 * `setPriorYear` → `setPriorYearDisplay` on the always-on Xero refresh path.
 * `setPriorYearDisplay` only updates `state.priorYear` (totals/banners) and
 * deliberately leaves `revenueLines/cogsLines/opexLines` alone. When Xero
 * data drifts after creation (late journals, period close, account renames),
 * Step 2 banners show fresh Xero while Step 5 BudgetFramework / Step 6 OpEx
 * read the stale line arrays → silent reconciliation gap.
 *
 * Fix: a drift banner in Step 2 surfaces the divergence, plus a manual
 * "Refresh from Xero" button that calls the destructive `setPriorYear` on
 * operator demand.
 *
 * This test exercises the underlying state transitions that the banner's
 * useMemo observes — the banner condition is a pure function of
 * (priorYear, revenueLines, cogsLines, opexLines), so locking the state shape
 * here regression-locks the banner's "shows drift" behavior without booting
 * the full component tree.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import type {
  PriorYearData,
} from '@/app/finances/forecast/components/wizard-v4/types';

const FY_START_YEAR = 2025; // FY26 (July 2025 → June 2026)

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

function makePriorYear(overrides: Partial<PriorYearData> = {}): PriorYearData {
  return {
    revenue: {
      total: 1_000_000,
      byMonth: {},
      byLine: [
        { id: 'rev-1', name: 'Sales Revenue', total: 1_000_000, byMonth: { '2025-07': 1_000_000 } },
      ],
    },
    cogs: {
      total: 400_000,
      percentOfRevenue: 40,
      byMonth: {},
      byLine: [
        { id: 'cogs-1', name: 'Cost of Sales', total: 400_000, percentOfRevenue: 40 },
      ],
    },
    grossProfit: { total: 600_000, percent: 60, byMonth: {} },
    opex: {
      total: 300_000,
      byMonth: {},
      byLine: [
        { id: 'opex-1', name: 'Rent', total: 120_000, monthlyAvg: 10_000, isOneOff: false },
        { id: 'opex-2', name: 'Software', total: 180_000, monthlyAvg: 15_000, isOneOff: false },
      ],
    },
    seasonalityPattern: Array(12).fill(100 / 12),
    ...overrides,
  };
}

/**
 * Mirrors the banner's useMemo in Step2PriorYear.tsx. Kept inline here so the
 * test asserts on the same fields/threshold the banner observes — if the
 * banner logic changes, this test must change too.
 */
function computeDrift(state: {
  priorYear: PriorYearData | null;
  revenueLines: ReadonlyArray<{ year1Monthly?: Record<string, number> }>;
  cogsLines: ReadonlyArray<{ priorYearTotal?: number }>;
  opexLines: ReadonlyArray<{ priorYearAnnual?: number }>;
}) {
  if (!state.priorYear || state.priorYear.revenue.total === 0) return null;

  const revenueLineSum = state.revenueLines.reduce((total, line) => {
    const monthly = Object.values(line.year1Monthly || {}).reduce((s, v) => s + (v || 0), 0);
    return total + monthly;
  }, 0);

  const cogsLineSum = state.cogsLines.reduce(
    (total, line) => total + (line.priorYearTotal || 0),
    0,
  );

  const opexLineSum = state.opexLines.reduce(
    (total, line) => total + (line.priorYearAnnual || 0),
    0,
  );

  const revenueDelta = state.priorYear.revenue.total - revenueLineSum;
  const cogsDelta = state.priorYear.cogs.total - cogsLineSum;
  const opexDelta = state.priorYear.opex.total - opexLineSum;

  const T = 1; // $1 threshold — below per-line rounding noise.

  return {
    revenueDrift: Math.abs(revenueDelta) > T,
    cogsDrift: Math.abs(cogsDelta) > T,
    opexDrift: Math.abs(opexDelta) > T,
    hasDrift: Math.abs(revenueDelta) > T || Math.abs(cogsDelta) > T || Math.abs(opexDelta) > T,
    revenue: { xero: state.priorYear.revenue.total, lines: revenueLineSum, delta: revenueDelta },
    cogs: { xero: state.priorYear.cogs.total, lines: cogsLineSum, delta: cogsDelta },
    opex: { xero: state.priorYear.opex.total, lines: opexLineSum, delta: opexDelta },
  };
}

describe('Xero reconciliation drift — detection + recovery', () => {
  it('flags drift when priorYear totals diverge from line-array sums (the PR #136 regression mode)', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'test-drift-detection'),
    );

    // 1) Initialize from a known-good Xero snapshot — lines match priorYear.
    act(() => {
      result.current.actions.setPriorYear(makePriorYear());
    });

    // Sanity: starts in sync.
    const initialDrift = computeDrift({
      priorYear: result.current.state.priorYear,
      revenueLines: result.current.state.revenueLines,
      cogsLines: result.current.state.cogsLines,
      opexLines: result.current.state.opexLines,
    });
    expect(initialDrift?.hasDrift).toBe(false);

    // 2) Simulate the PR #136 regression: Xero data drifts (revenue $1M →
    //    $900K, opex $300K → $250K, cogs unchanged), the always-on refresh
    //    runs `setPriorYearDisplay` with the new totals — line arrays go
    //    stale by exactly the drift amount.
    const driftedPriorYear = makePriorYear({
      revenue: {
        total: 900_000,
        byMonth: {},
        byLine: [
          { id: 'rev-1', name: 'Sales Revenue', total: 900_000, byMonth: {} },
        ],
      },
      opex: {
        total: 250_000,
        byMonth: {},
        byLine: [
          { id: 'opex-1', name: 'Rent', total: 100_000, monthlyAvg: 8_333, isOneOff: false },
          { id: 'opex-2', name: 'Software', total: 150_000, monthlyAvg: 12_500, isOneOff: false },
        ],
      },
    });

    act(() => {
      result.current.actions.setPriorYearDisplay(driftedPriorYear);
    });

    // 3) Banner condition now fires.
    const drift = computeDrift({
      priorYear: result.current.state.priorYear,
      revenueLines: result.current.state.revenueLines,
      cogsLines: result.current.state.cogsLines,
      opexLines: result.current.state.opexLines,
    });

    expect(drift?.hasDrift).toBe(true);
    expect(drift?.revenueDrift).toBe(true);
    expect(drift?.opexDrift).toBe(true);
    expect(drift?.cogsDrift).toBe(false); // COGS didn't drift in the scenario.

    // Specific divergences — these are the numbers the banner shows the operator.
    expect(drift?.revenue.xero).toBe(900_000);
    expect(drift?.revenue.lines).toBe(1_000_000); // stale
    expect(drift?.revenue.delta).toBe(-100_000);

    expect(drift?.opex.xero).toBe(250_000);
    expect(drift?.opex.lines).toBe(300_000); // stale
    expect(drift?.opex.delta).toBe(-50_000);
  });

  it('clears drift when operator triggers Refresh from Xero (setPriorYear rebuilds lines)', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'test-drift-recovery'),
    );

    // 1) Initialize.
    act(() => {
      result.current.actions.setPriorYear(makePriorYear());
    });

    // 2) Drift via setPriorYearDisplay.
    const driftedPriorYear = makePriorYear({
      revenue: {
        total: 900_000,
        byMonth: {},
        byLine: [
          { id: 'rev-1', name: 'Sales Revenue', total: 900_000, byMonth: { '2025-07': 900_000 } },
        ],
      },
    });
    act(() => {
      result.current.actions.setPriorYearDisplay(driftedPriorYear);
    });

    expect(
      computeDrift({
        priorYear: result.current.state.priorYear,
        revenueLines: result.current.state.revenueLines,
        cogsLines: result.current.state.cogsLines,
        opexLines: result.current.state.opexLines,
      })?.hasDrift,
    ).toBe(true);

    // 3) Operator clicks "Refresh from Xero" — which calls the destructive
    //    setPriorYear with the same fresh payload. Lines rebuild from
    //    priorYear.byLine, drift collapses.
    act(() => {
      result.current.actions.setPriorYear(driftedPriorYear);
    });

    const drift = computeDrift({
      priorYear: result.current.state.priorYear,
      revenueLines: result.current.state.revenueLines,
      cogsLines: result.current.state.cogsLines,
      opexLines: result.current.state.opexLines,
    });

    expect(drift?.hasDrift).toBe(false);
    expect(drift?.revenue.lines).toBe(900_000); // matches priorYear now
    expect(drift?.revenue.delta).toBe(0);
  });

  it('ignores sub-$1 rounding noise (per-line Math.round in setPriorYear)', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'test-drift-rounding'),
    );

    // Build a payload that rounds: total $1,000,001 split across one line
    // whose by_month rounds back to $1,000,000 (delta = $1, at the threshold).
    const payload = makePriorYear({
      revenue: {
        total: 1_000_001,
        byMonth: {},
        byLine: [
          { id: 'rev-1', name: 'Sales', total: 1_000_000, byMonth: { '2025-07': 1_000_000 } },
        ],
      },
    });

    act(() => {
      result.current.actions.setPriorYear(payload);
    });

    const drift = computeDrift({
      priorYear: result.current.state.priorYear,
      revenueLines: result.current.state.revenueLines,
      cogsLines: result.current.state.cogsLines,
      opexLines: result.current.state.opexLines,
    });

    // $1 delta is exactly at threshold (>$1 fires; ==$1 does not).
    // This documents the threshold; if it changes, this test is the canary.
    expect(drift?.revenueDrift).toBe(false);
    expect(Math.abs(drift?.revenue.delta ?? 0)).toBeLessThanOrEqual(1);
  });
});
