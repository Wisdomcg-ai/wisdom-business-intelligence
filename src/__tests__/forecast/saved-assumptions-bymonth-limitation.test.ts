/**
 * Regression test — Step 2 prior-year monthly round-trip.
 *
 * History:
 *   PR #138 documented (didn't fix) that the saved-assumptions reconstruction
 *   fallback in `ForecastWizardV4.tsx` shipped `byMonth: {}` for revenue/cogs/
 *   opex because the assumptions schema lacked monthly priorYear data. When
 *   the always-on Xero refresh failed silently, Step 2 fell back to
 *   seasonality-synthesized values and the operator saw flat fake numbers
 *   instead of actual prior-year monthly figures.
 *
 * Fix (this branch — fix/step2-byMonth-priorYear-restore):
 *   Schema extended with `ForecastAssumptions.priorYearByMonth` —
 *   category-level snapshot of revenue/cogs/opex/otherIncome/otherExpenses
 *   monthly figures. `buildAssumptions` populates it from `state.priorYear`
 *   at save time; the reconstruction fallback in `ForecastWizardV4.tsx`
 *   reads from it on restore.
 *
 * What this test locks in:
 *   1. CONTRACT — `buildAssumptions` writes a `priorYearByMonth` snapshot
 *      whose category-level byMonth maps exactly mirror what state.priorYear
 *      held at save time. Round-trip preservation.
 *   2. BACKWARD COMPAT — old saved forecasts (no `priorYearByMonth`) still
 *      load without crashing. Already covered by the absence-of-field path
 *      in ForecastWizardV4.tsx; we assert here that the new field is OPTIONAL
 *      so omitting it is a valid persisted shape.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import type { PriorYearData } from '@/app/finances/forecast/components/wizard-v4/types';

const FY_START_YEAR = 2025; // FY26

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

const REVENUE_BY_MONTH = {
  '2024-07': 100_000, '2024-08': 110_000, '2024-09': 120_000,
  '2024-10': 130_000, '2024-11': 140_000, '2024-12': 150_000,
  '2025-01':  90_000, '2025-02':  95_000, '2025-03': 105_000,
  '2025-04':  85_000, '2025-05':  80_000, '2025-06':  95_000,
};

const COGS_BY_MONTH = {
  '2024-07': 40_000, '2024-08': 44_000, '2024-09': 48_000,
  '2024-10': 52_000, '2024-11': 56_000, '2024-12': 60_000,
  '2025-01': 36_000, '2025-02': 38_000, '2025-03': 42_000,
  '2025-04': 34_000, '2025-05': 32_000, '2025-06': 38_000,
};

const OPEX_BY_MONTH = {
  '2024-07': 30_000, '2024-08': 30_000, '2024-09': 30_000,
  '2024-10': 30_000, '2024-11': 30_000, '2024-12': 30_000,
  '2025-01': 30_000, '2025-02': 30_000, '2025-03': 30_000,
  '2025-04': 30_000, '2025-05': 30_000, '2025-06': 30_000,
};

const OTHER_INCOME_BY_MONTH = {
  '2024-07': 1_000, '2024-08': 1_000, '2024-09': 1_000,
  '2024-10': 1_000, '2024-11': 1_000, '2024-12': 1_000,
  '2025-01': 1_000, '2025-02': 1_000, '2025-03': 1_000,
  '2025-04': 1_000, '2025-05': 1_000, '2025-06': 1_000,
};

function makePriorYearWithMonthly(): PriorYearData {
  const totalRevenue = Object.values(REVENUE_BY_MONTH).reduce((a, b) => a + b, 0);
  const totalCogs = Object.values(COGS_BY_MONTH).reduce((a, b) => a + b, 0);
  const totalOpex = Object.values(OPEX_BY_MONTH).reduce((a, b) => a + b, 0);
  const totalOtherIncome = Object.values(OTHER_INCOME_BY_MONTH).reduce((a, b) => a + b, 0);
  return {
    revenue: {
      total: totalRevenue,
      byMonth: REVENUE_BY_MONTH,
      byLine: [
        { id: 'rev-1', name: 'Sales', total: totalRevenue, byMonth: REVENUE_BY_MONTH },
      ],
    },
    cogs: {
      total: totalCogs,
      percentOfRevenue: (totalCogs / totalRevenue) * 100,
      byMonth: COGS_BY_MONTH,
      byLine: [
        { id: 'cogs-1', name: 'Cost of Sales', total: totalCogs, percentOfRevenue: 40 },
      ],
    },
    grossProfit: { total: totalRevenue - totalCogs, percent: 60, byMonth: {} },
    opex: {
      total: totalOpex,
      byMonth: OPEX_BY_MONTH,
      byLine: [
        { id: 'opex-1', name: 'Rent', total: totalOpex, monthlyAvg: 30_000, isOneOff: false },
      ],
    },
    otherIncome: {
      total: totalOtherIncome,
      byMonth: OTHER_INCOME_BY_MONTH,
    },
    seasonalityPattern: Array(12).fill(100 / 12),
  };
}

describe('Step 2 prior-year monthly — round-trips through save+restore', () => {
  it('persists category-level byMonth in priorYearByMonth snapshot (revenue, cogs, opex)', async () => {
    // Spy on fetch — capture saveDraft request body, which contains the
    // assumptions JSON exactly as it lands in financial_forecasts.assumptions.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        new Response(JSON.stringify({ forecastId: 'fake-id' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'test-priorYearByMonth-roundtrip'),
    );

    // 1) Initialize priorYear with full monthly history (as a Xero refresh
    //    would deliver after a Step 2 import).
    act(() => {
      result.current.actions.setPriorYear(makePriorYearWithMonthly());
    });

    // 2) Save the draft — the request body IS the persisted shape.
    await act(async () => {
      await result.current.actions.saveDraft();
    });

    const generateCall = fetchSpy.mock.calls.find(
      (call) => String(call[0]).includes('/api/forecast-wizard-v4/generate'),
    );
    expect(generateCall, 'expected saveDraft to POST to forecast-wizard-v4/generate').toBeDefined();
    const requestInit = generateCall![1] as RequestInit | undefined;
    expect(requestInit?.body).toBeDefined();
    const body = JSON.parse(String(requestInit!.body));
    const assumptions = body.assumptions;

    // 3) The new snapshot field must be present and carry the actual
    //    category-level monthly history.
    expect(assumptions.priorYearByMonth).toBeDefined();
    expect(assumptions.priorYearByMonth.revenue).toEqual(REVENUE_BY_MONTH);
    expect(assumptions.priorYearByMonth.cogs).toEqual(COGS_BY_MONTH);
    expect(assumptions.priorYearByMonth.opex).toEqual(OPEX_BY_MONTH);

    // Spot-check the FY25 example value the operator-visible bug surfaced
    // (Step 2's monthly comparison table for the 2024-07 column).
    expect(assumptions.priorYearByMonth.revenue['2024-07']).toBe(100_000);
    expect(assumptions.priorYearByMonth.cogs['2024-07']).toBe(40_000);
    expect(assumptions.priorYearByMonth.opex['2024-07']).toBe(30_000);

    // 4) otherIncome present at save time → snapshotted with total + byMonth.
    expect(assumptions.priorYearByMonth.otherIncome).toBeDefined();
    expect(assumptions.priorYearByMonth.otherIncome.total).toBe(12_000);
    expect(assumptions.priorYearByMonth.otherIncome.byMonth).toEqual(OTHER_INCOME_BY_MONTH);

    // 5) otherExpenses absent on the source priorYear → snapshot omits it
    //    (round-trips the "no Other Expenses at all" distinction so the
    //    restore path doesn't synthesize a phantom $0 section).
    expect(assumptions.priorYearByMonth.otherExpenses).toBeUndefined();

    // 6) Sanity: scalar priorYearTotal still present per-line (back-compat
    //    with consumers that read totals from per-line shapes).
    for (const line of assumptions.revenue.lines) {
      expect(typeof line.priorYearTotal).toBe('number');
    }
    expect(assumptions.revenue.seasonalityPattern).toHaveLength(12);
  });

  it('omits priorYearByMonth when state.priorYear is null (no priorYear loaded yet)', async () => {
    // Backward-compat path: a draft saved before priorYear was ever populated
    // (e.g., user starts a wizard but Xero has no data yet) must NOT emit a
    // bogus empty snapshot — the field stays absent so reconstruction falls
    // through to the legacy empty-byMonth path.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        new Response(JSON.stringify({ forecastId: 'fake-id' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'test-priorYearByMonth-null'),
    );

    // No setPriorYear call — state.priorYear stays null.
    await act(async () => {
      await result.current.actions.saveDraft();
    });

    const generateCall = fetchSpy.mock.calls.find(
      (call) => String(call[0]).includes('/api/forecast-wizard-v4/generate'),
    );
    expect(generateCall).toBeDefined();
    const body = JSON.parse(String((generateCall![1] as RequestInit).body));
    expect(body.assumptions.priorYearByMonth).toBeUndefined();
  });
});
