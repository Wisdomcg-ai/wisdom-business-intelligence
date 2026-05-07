/**
 * Hotfix regression test — Issue A from `step2-hard-refresh-data-loss.md`.
 *
 * Bug (MEDIUM severity, display-only):
 *   When a saved forecast loads but Xero pl-summary is unavailable, the
 *   fallback at `ForecastWizardV4.tsx:373-451` reconstructs `priorYear` from
 *   saved assumptions but ships `byMonth: {}` for revenue/cogs/opex. On next
 *   load, `Step2PriorYear.buildMonthlyComparison` sees empty byMonth and
 *   falls back to seasonality-derived synthetic monthly columns instead of
 *   actual prior-year monthly history.
 *
 * Investigation finding (THIS test locks in):
 *   The assumptions JSON shape (`ForecastAssumptions`, see
 *   `wizard-v4/types/assumptions.ts`) does NOT carry per-line priorYear
 *   monthly data. `RevenueLineAssumption.priorYearTotal`,
 *   `COGSLineAssumption.priorYearTotal`, and `OpExLineAssumption.
 *   priorYearTotal` are scalars. There is no `priorYearMonthly` /
 *   `priorYearByMonth` field on any of them.
 *
 *   `buildAssumptions` (useForecastWizard.ts) only persists `priorYearTotal`
 *   plus a 12-element `seasonalityPattern` — NOT monthly history.
 *
 *   Therefore the saved-assumptions fallback in `ForecastWizardV4.tsx`
 *   CANNOT populate `byMonth` from saved assumptions without first extending
 *   the schema. That's a bigger change deferred per the hotfix spec. This
 *   test:
 *     (a) regression-locks the contract: assert that the assumptions JSON
 *         persisted by saveDraft does NOT carry monthly priorYear data;
 *     (b) when the schema is extended in a follow-up, this test will fail
 *         loudly, signaling that the documented limitation in
 *         ForecastWizardV4 (~lines 364-446) needs to be updated to populate
 *         byMonth from the new field.
 *
 * Approach: spy on `fetch` so `saveDraft` ships its built assumptions to a
 * captured request body — that body IS the on-disk shape (verbatim what
 * lands in `financial_forecasts.assumptions`).
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

function makePriorYearWithMonthly(): PriorYearData {
  return {
    revenue: {
      total: 1_200_000,
      byMonth: {
        '2024-07': 100_000, '2024-08': 100_000, '2024-09': 100_000,
        '2024-10': 100_000, '2024-11': 100_000, '2024-12': 100_000,
        '2025-01': 100_000, '2025-02': 100_000, '2025-03': 100_000,
        '2025-04': 100_000, '2025-05': 100_000, '2025-06': 100_000,
      },
      byLine: [
        {
          id: 'rev-1',
          name: 'Sales',
          total: 1_200_000,
          // Per-line monthly priorYear data the operator has at runtime
          // (delivered by Xero refresh / Step 2 import).
          byMonth: {
            '2024-07': 100_000, '2024-08': 100_000, '2024-09': 100_000,
            '2024-10': 100_000, '2024-11': 100_000, '2024-12': 100_000,
            '2025-01': 100_000, '2025-02': 100_000, '2025-03': 100_000,
            '2025-04': 100_000, '2025-05': 100_000, '2025-06': 100_000,
          },
        },
      ],
    },
    cogs: {
      total: 480_000,
      percentOfRevenue: 40,
      byMonth: { '2024-07': 40_000, '2024-08': 40_000 },
      byLine: [
        { id: 'cogs-1', name: 'Cost of Sales', total: 480_000, percentOfRevenue: 40 },
      ],
    },
    grossProfit: { total: 720_000, percent: 60, byMonth: {} },
    opex: {
      total: 360_000,
      byMonth: { '2024-07': 30_000, '2024-08': 30_000 },
      byLine: [
        { id: 'opex-1', name: 'Rent', total: 120_000, monthlyAvg: 10_000, isOneOff: false },
      ],
    },
    seasonalityPattern: Array(12).fill(100 / 12),
  };
}

describe('Issue A — saved-assumptions fallback ships empty byMonth (documented limitation)', () => {
  it('contract: persisted assumptions JSON does NOT carry per-line priorYear monthly history', async () => {
    // Spy on fetch — capture the saveDraft request body, which contains the
    // assumptions JSON exactly as it lands in financial_forecasts.assumptions.
    // Return a fresh Response per call so consumers can re-read the body.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        new Response(JSON.stringify({ forecastId: 'fake-id' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'test-assumptions-bymonth-limitation'),
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

    // Locate the saveDraft request among any other fetches the hook may
    // have triggered (account-codes refresh, etc.).
    const generateCall = fetchSpy.mock.calls.find(
      (call) => String(call[0]).includes('/api/forecast-wizard-v4/generate'),
    );
    expect(generateCall, 'expected saveDraft to POST to forecast-wizard-v4/generate').toBeDefined();
    const requestInit = generateCall![1] as RequestInit | undefined;
    expect(requestInit?.body).toBeDefined();
    const body = JSON.parse(String(requestInit!.body));
    const assumptions = body.assumptions;

    // 3) Contract assertion — locks in the documented limitation. None of
    //    the per-line shapes carries `priorYearMonthly` /
    //    `priorYearByMonth` / `byMonth`. (year1Monthly etc. — the FORECAST
    //    monthly values — are unrelated and may be present.)
    for (const line of assumptions.revenue.lines) {
      expect(line).not.toHaveProperty('priorYearMonthly');
      expect(line).not.toHaveProperty('priorYearByMonth');
      expect(line).not.toHaveProperty('byMonth');
    }
    for (const line of assumptions.cogs.lines) {
      expect(line).not.toHaveProperty('priorYearMonthly');
      expect(line).not.toHaveProperty('priorYearByMonth');
      expect(line).not.toHaveProperty('byMonth');
    }
    for (const line of assumptions.opex.lines) {
      expect(line).not.toHaveProperty('priorYearMonthly');
      expect(line).not.toHaveProperty('priorYearByMonth');
      expect(line).not.toHaveProperty('byMonth');
    }

    // 4) Sanity: the schema DOES carry priorYearTotal (scalar) and a
    //    top-level seasonalityPattern. These are what the fallback
    //    currently has to work with — and why byMonth is empty.
    for (const line of assumptions.revenue.lines) {
      expect(typeof line.priorYearTotal).toBe('number');
    }
    expect(assumptions.revenue.seasonalityPattern).toHaveLength(12);
  });

  /**
   * When the assumptions schema is extended to persist per-line monthly
   * priorYear data, this test will fail. At that point, update the fallback
   * in `ForecastWizardV4.tsx` (the documented block at ~lines 364-446) to
   * populate `byMonth` from the new field, and update this test's name +
   * assertions to reflect the new contract.
   *
   * Until then, the empty `byMonth: {}` in the fallback is INTENTIONAL.
   */
});
