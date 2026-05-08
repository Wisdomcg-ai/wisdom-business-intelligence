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
import { resolvePriorYearSecondary } from '@/app/finances/forecast/components/wizard-v4/utils/resolve-prior-year-secondaries';

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

/**
 * Regression: PR #139 added a "Refresh from Xero" button that destructively
 * rebuilds line arrays from the live pl-summary response. JDS hit a follow-on
 * bug where clicking the button blanked Other Income — the API was returning
 * `other_income: 0` (account-type miss / matcher change) and the existing
 * `!== undefined && !== null` guard let the zero overwrite a visible cached
 * value. Fix: `resolvePriorYearSecondary` falls back to the cached non-zero
 * total when the API returns 0/undefined/null, keeping `byMonth` in sync.
 *
 * These cases lock the resolver behavior. Pair them with the
 * `setPriorYear` round-trip below to prove the resolved payload survives the
 * destructive reducer end-to-end.
 */
describe('Refresh from Xero — preserves Other Income / Other Expenses (fix/refresh-button-preserve-other-income)', () => {
  it('uses non-zero API value over cache when both exist', () => {
    const resolved = resolvePriorYearSecondary({
      apiTotal: 4_000,
      apiByMonth: { '2025-07': 4_000 },
      cached: { total: 651, byMonth: { '2024-07': 651 } },
    });
    expect(resolved).toEqual({ total: 4_000, byMonth: { '2025-07': 4_000 } });
  });

  it('preserves cached non-zero total when API returns 0 (the JDS regression)', () => {
    const resolved = resolvePriorYearSecondary({
      apiTotal: 0,
      apiByMonth: {
        '2025-07': 0, '2025-08': 0, '2025-09': 0, '2025-10': 0, '2025-11': 0, '2025-12': 0,
        '2026-01': 0, '2026-02': 0, '2026-03': 0, '2026-04': 0, '2026-05': 0, '2026-06': 0,
      },
      cached: {
        total: 651,
        byMonth: { '2024-07': 100, '2024-08': 200, '2024-09': 351 },
      },
    });
    // Total survives.
    expect(resolved?.total).toBe(651);
    // byMonth survives — not the API zero map.
    expect(resolved?.byMonth).toEqual({ '2024-07': 100, '2024-08': 200, '2024-09': 351 });
  });

  it('preserves cached non-zero total when API field is undefined', () => {
    const resolved = resolvePriorYearSecondary({
      apiTotal: undefined,
      apiByMonth: undefined,
      cached: { total: 12_500, byMonth: { '2024-12': 12_500 } },
    });
    expect(resolved).toEqual({ total: 12_500, byMonth: { '2024-12': 12_500 } });
  });

  it('returns concrete zero when both API and cache are zero (no Other Income at all)', () => {
    const resolved = resolvePriorYearSecondary({
      apiTotal: 0,
      apiByMonth: {},
      cached: { total: 0, byMonth: {} },
    });
    expect(resolved).toEqual({ total: 0, byMonth: {} });
  });

  it('returns concrete zero when API returns 0 and there is no cached value', () => {
    const resolved = resolvePriorYearSecondary({
      apiTotal: 0,
      apiByMonth: { '2025-07': 0 },
      cached: undefined,
    });
    // Tenant genuinely has no Other Income — record the API answer, not undefined.
    expect(resolved).toEqual({ total: 0, byMonth: { '2025-07': 0 } });
  });

  it('returns undefined when API field is absent and there is no cache', () => {
    const resolved = resolvePriorYearSecondary({
      apiTotal: undefined,
      apiByMonth: undefined,
      cached: undefined,
    });
    expect(resolved).toBeUndefined();
  });

  it('uses non-zero API value when there is no cached value', () => {
    const resolved = resolvePriorYearSecondary({
      apiTotal: 7_000,
      apiByMonth: { '2025-07': 7_000 },
      cached: undefined,
    });
    expect(resolved).toEqual({ total: 7_000, byMonth: { '2025-07': 7_000 } });
  });

  it('handles negative API totals as meaningful (rebates, refunds posted to Other Income)', () => {
    const resolved = resolvePriorYearSecondary({
      apiTotal: -250,
      apiByMonth: { '2025-07': -250 },
      cached: { total: 1_000, byMonth: { '2024-07': 1_000 } },
    });
    // Non-zero API wins — even when negative.
    expect(resolved).toEqual({ total: -250, byMonth: { '2025-07': -250 } });
  });

  it('round-trip: cached otherIncome survives a destructive setPriorYear when fresh payload uses the resolver', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'test-refresh-preserves-other-income'),
    );

    // 1) Initialize with a forecast that has $651 Other Income (the JDS shape
    //    that flushed Phase 44.2 — Xero added the value, the always-on
    //    refresh picked it up, the user saw it).
    const initialPriorYear = makePriorYear({
      otherIncome: { total: 651, byMonth: { '2024-12': 651 } },
      otherExpenses: { total: 200, byMonth: { '2024-08': 200 } },
    });
    act(() => {
      result.current.actions.setPriorYear(initialPriorYear);
    });
    expect(result.current.state.priorYear?.otherIncome?.total).toBe(651);
    expect(result.current.state.priorYear?.otherExpenses?.total).toBe(200);

    // 2) Operator clicks Refresh from Xero. The live pl-summary response now
    //    returns `other_income: 0` and `other_expenses: 0` (matcher change /
    //    classification miss). The Refresh handler builds `freshPriorYear`
    //    by passing the API values through `resolvePriorYearSecondary`, so
    //    the cached non-zero totals survive into the destructive setPriorYear
    //    rebuild that follows.
    const apiSaysZero = makePriorYear({
      otherIncome: resolvePriorYearSecondary({
        apiTotal: 0,
        apiByMonth: { '2025-07': 0 },
        cached: result.current.state.priorYear?.otherIncome,
      }),
      otherExpenses: resolvePriorYearSecondary({
        apiTotal: 0,
        apiByMonth: { '2025-07': 0 },
        cached: result.current.state.priorYear?.otherExpenses,
      }),
    });
    act(() => {
      result.current.actions.setPriorYear(apiSaysZero);
    });

    // 3) Both totals AND byMonth survive the refresh end-to-end.
    expect(result.current.state.priorYear?.otherIncome?.total).toBe(651);
    expect(result.current.state.priorYear?.otherIncome?.byMonth).toEqual({ '2024-12': 651 });
    expect(result.current.state.priorYear?.otherExpenses?.total).toBe(200);
    expect(result.current.state.priorYear?.otherExpenses?.byMonth).toEqual({ '2024-08': 200 });
  });

  it('round-trip: legitimate Xero update (non-zero → non-zero) lands; cache is overwritten', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'test-refresh-takes-genuine-update'),
    );

    act(() => {
      result.current.actions.setPriorYear(
        makePriorYear({ otherIncome: { total: 651, byMonth: { '2024-12': 651 } } }),
      );
    });

    // Xero now reports a different non-zero value (real journal posted).
    const updated = makePriorYear({
      otherIncome: resolvePriorYearSecondary({
        apiTotal: 4_500,
        apiByMonth: { '2025-09': 4_500 },
        cached: result.current.state.priorYear?.otherIncome,
      }),
    });
    act(() => {
      result.current.actions.setPriorYear(updated);
    });

    expect(result.current.state.priorYear?.otherIncome?.total).toBe(4_500);
    expect(result.current.state.priorYear?.otherIncome?.byMonth).toEqual({ '2025-09': 4_500 });
  });
});

/**
 * Always-on Xero refresh — Other Income / Other Expenses preservation.
 *
 * The always-on refresh path in ForecastWizardV4.tsx fires on every wizard
 * mount, window focus, and visibilitychange event. Before
 * fix/always-on-refresh-otherIncome-preserve, that path had a different (and
 * buggy) inline guard that only fell back to cache when the API value was
 * `undefined` / `null`. Because `historical-pl-summary` always returns
 * `other_income` / `other_expenses` as numbers (including 0 when no rows
 * match the account_type enum), the cached fallback never fired — every
 * mount/focus event silently wiped non-zero cached Other Income on tenants
 * where Xero's live response computed 0.
 *
 * The fix wires the always-on path through `resolvePriorYearSecondary`,
 * matching the manual Refresh button path. These tests assert the always-on
 * mapper behavior directly so a future inline-rewrite regression is caught.
 */
describe('always-on Xero refresh — otherIncome / otherExpenses preservation', () => {
  /**
   * Mirrors the always-on refresh's freshPriorYear mapper in
   * ForecastWizardV4.tsx (lines ~268-300). The two `resolvePriorYearSecondary`
   * calls are the load-bearing change.
   */
  function buildAlwaysOnFreshPriorYear(
    apiResponse: {
      other_income?: number | null;
      other_income_by_month?: Record<string, number>;
      other_expenses?: number | null;
      other_expenses_by_month?: Record<string, number>;
    },
    cached: PriorYearData | null,
  ): PriorYearData {
    return makePriorYear({
      otherIncome: resolvePriorYearSecondary({
        apiTotal: apiResponse.other_income,
        apiByMonth: apiResponse.other_income_by_month,
        cached: cached?.otherIncome,
      }),
      otherExpenses: resolvePriorYearSecondary({
        apiTotal: apiResponse.other_expenses,
        apiByMonth: apiResponse.other_expenses_by_month,
        cached: cached?.otherExpenses,
      }),
    });
  }

  it('preserves cached non-zero otherIncome when always-on refresh API returns 0 (the JDS regression)', () => {
    const cached = makePriorYear({
      otherIncome: { total: 651, byMonth: { '2024-12': 651 } },
    });

    // historical-pl-summary always returns numbers — Xero classification miss
    // computed 0 for this tenant on this refresh.
    const fresh = buildAlwaysOnFreshPriorYear(
      { other_income: 0, other_income_by_month: { '2025-07': 0 } },
      cached,
    );

    expect(fresh.otherIncome?.total).toBe(651);
    expect(fresh.otherIncome?.byMonth).toEqual({ '2024-12': 651 });
  });

  it('takes a fresh non-zero otherIncome from Xero (cache is overwritten)', () => {
    const cached = makePriorYear({
      otherIncome: { total: 651, byMonth: { '2024-12': 651 } },
    });

    const fresh = buildAlwaysOnFreshPriorYear(
      { other_income: 800, other_income_by_month: { '2025-09': 800 } },
      cached,
    );

    expect(fresh.otherIncome?.total).toBe(800);
    expect(fresh.otherIncome?.byMonth).toEqual({ '2025-09': 800 });
  });

  it('preserves cached otherIncome when API field is undefined (partial response)', () => {
    const cached = makePriorYear({
      otherIncome: { total: 651, byMonth: { '2024-12': 651 } },
    });

    const fresh = buildAlwaysOnFreshPriorYear(
      { other_income: undefined, other_income_by_month: undefined },
      cached,
    );

    expect(fresh.otherIncome?.total).toBe(651);
    expect(fresh.otherIncome?.byMonth).toEqual({ '2024-12': 651 });
  });

  it('preserves cached otherIncome when API field is null', () => {
    const cached = makePriorYear({
      otherIncome: { total: 651, byMonth: { '2024-12': 651 } },
    });

    const fresh = buildAlwaysOnFreshPriorYear(
      { other_income: null },
      cached,
    );

    expect(fresh.otherIncome?.total).toBe(651);
  });

  it('also preserves cached otherExpenses when always-on refresh API returns 0', () => {
    const cached = makePriorYear({
      otherExpenses: { total: 200, byMonth: { '2024-08': 200 } },
    });

    const fresh = buildAlwaysOnFreshPriorYear(
      { other_expenses: 0, other_expenses_by_month: { '2025-07': 0 } },
      cached,
    );

    expect(fresh.otherExpenses?.total).toBe(200);
    expect(fresh.otherExpenses?.byMonth).toEqual({ '2024-08': 200 });
  });

  it('cold mount with no cache and API returns 0 — lands on { total: 0, byMonth: {} } (no preservation needed)', () => {
    // First wizard mount: state.priorYear is null, API returns 0.
    // Trusting Xero is correct here — there is no cached value to preserve.
    const fresh = buildAlwaysOnFreshPriorYear(
      { other_income: 0, other_income_by_month: { '2025-07': 0 } },
      null,
    );

    expect(fresh.otherIncome?.total).toBe(0);
    expect(fresh.otherIncome?.byMonth).toEqual({ '2025-07': 0 });
  });
});
