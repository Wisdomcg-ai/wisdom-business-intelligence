/**
 * Hotfix regression test — hard-refresh must NOT wipe operator customizations.
 *
 * Bug (HIGH severity, ship blocker):
 *   Phase 44.2 made `ForecastWizardV4.tsx` call `setPriorYear(freshPriorYear)`
 *   unconditionally on every wizard mount. `setPriorYear` is destructive — it
 *   rebuilds revenueLines / cogsLines / opexLines from the API-derived defaults
 *   on every call. Net effect: every hard-refresh silently wiped operator
 *   customizations on Steps 3 (revenue splits/seasonality), 5 (COGS
 *   costBehavior), and 6 (OpEx monthlyAmount/accountCode overrides).
 *
 * Fix:
 *   Split the action into two: `setPriorYear` (full init — for first-time
 *   setup paths only) and `setPriorYearDisplay` (display-only — for the
 *   always-on Xero refresh path that runs every mount). The always-on refresh
 *   in `ForecastWizardV4.tsx` now calls the display-only variant, so operator
 *   customizations survive a hard-refresh.
 *
 * This test exercises the hook directly (not the wizard component) and
 * regression-locks the contract: calling `setPriorYearDisplay` must update
 * `priorYear` only, leaving `revenueLines`, `cogsLines`, and `opexLines`
 * byte-for-byte unchanged.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import type {
  PriorYearData,
  RevenueLine,
  COGSLine,
  OpExLine,
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
      byMonth: { '2024-07': 80000, '2024-08': 85000, '2024-09': 90000 },
      byLine: [
        { id: 'rev-orig-1', name: 'Sales Revenue', total: 1_000_000, byMonth: {} },
      ],
    },
    cogs: {
      total: 400_000,
      percentOfRevenue: 40,
      byMonth: { '2024-07': 32000 },
      byLine: [
        { id: 'cogs-orig-1', name: 'Cost of Sales', total: 400_000, percentOfRevenue: 40 },
      ],
    },
    grossProfit: { total: 600_000, percent: 60, byMonth: {} },
    opex: {
      total: 300_000,
      byMonth: { '2024-07': 25000 },
      byLine: [
        { id: 'opex-orig-1', name: 'Rent', total: 120_000, monthlyAvg: 10_000, isOneOff: false },
        { id: 'opex-orig-2', name: 'Software', total: 60_000, monthlyAvg: 5_000, isOneOff: false },
      ],
    },
    seasonalityPattern: Array(12).fill(100 / 12),
    ...overrides,
  };
}

describe('setPriorYearDisplay — operator customizations survive hard-refresh', () => {
  it('updates priorYear without touching revenueLines / cogsLines / opexLines', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'test-hard-refresh-preserve'),
    );

    // 1) Initialize via setPriorYear (first-time setup path).
    act(() => {
      result.current.actions.setPriorYear(makePriorYear());
    });

    // 2) Operator customizes Steps 3, 5, 6 (rename lines, split, override
    //    costBehavior, override monthlyAmount, exclude an accountCode, etc.).
    const customizedRevenueLines: RevenueLine[] = [
      {
        id: 'rev-custom-A',
        name: 'Operator-renamed Product A',
        year1Monthly: { '2025-07': 50000, '2025-08': 55000 },
        year2Monthly: {},
        year3Monthly: {},
      },
      {
        id: 'rev-custom-B',
        name: 'Operator-added Product B (split)',
        year1Monthly: { '2025-07': 30000 },
        year2Monthly: {},
        year3Monthly: {},
      },
    ];
    const customizedCogsLines: COGSLine[] = [
      {
        id: 'cogs-custom-1',
        name: 'Cost of Sales (operator-switched to fixed)',
        accountId: 'cogs-acct-1',
        priorYearTotal: 400_000,
        costBehavior: 'fixed' as const,
        monthlyAmount: 33_333,
      },
    ];
    const customizedOpexLines: OpExLine[] = [
      {
        id: 'opex-custom-1',
        name: 'Rent (operator-overridden)',
        accountId: 'opex-acct-1',
        accountCode: '6020',
        priorYearAnnual: 120_000,
        costBehavior: 'fixed' as const,
        monthlyAmount: 12_500, // Operator override (not the API-derived 10_000)
        annualIncreasePct: 5,
      },
    ];

    act(() => {
      result.current.actions.setRevenueLines(customizedRevenueLines);
      result.current.actions.setCOGSLines(customizedCogsLines);
      result.current.actions.setOpExLines(customizedOpexLines);
    });

    // Snapshot the customized lines BEFORE the refresh.
    const beforeRevenueLines = result.current.state.revenueLines;
    const beforeCogsLines = result.current.state.cogsLines;
    const beforeOpexLines = result.current.state.opexLines;

    expect(beforeRevenueLines).toEqual(customizedRevenueLines);
    expect(beforeCogsLines).toEqual(customizedCogsLines);
    expect(beforeOpexLines).toEqual(customizedOpexLines);

    // 3) Simulate a hard-refresh: the always-on Xero refresh path now calls
    //    setPriorYearDisplay with fresh API data (revenue/cogs/opex byMonth
    //    updated, otherIncome appearing — but byLine names that DIFFER from
    //    the operator's customized splits, exactly the case that used to wipe
    //    operator work).
    const freshPriorYear: PriorYearData = makePriorYear({
      revenue: {
        total: 1_010_000, // Slightly different fresh total
        byMonth: { '2024-07': 81000, '2024-08': 86000, '2024-09': 91000, '2024-10': 90000 },
        byLine: [
          // Different shape from operator's customizations — used to overwrite!
          { id: 'rev-fresh-X', name: 'Auto-detected Product X', total: 600_000, byMonth: {} },
          { id: 'rev-fresh-Y', name: 'Auto-detected Product Y', total: 410_000, byMonth: {} },
        ],
      },
      otherIncome: { total: 651, byMonth: { '2024-07': 651 } }, // newly present
    });

    act(() => {
      result.current.actions.setPriorYearDisplay(freshPriorYear);
    });

    // 4) Assertions:
    //    (a) priorYear field WAS updated with fresh data.
    expect(result.current.state.priorYear).toEqual(freshPriorYear);
    expect(result.current.state.priorYear?.revenue.total).toBe(1_010_000);
    expect(result.current.state.priorYear?.otherIncome?.total).toBe(651);

    //    (b) revenueLines / cogsLines / opexLines are byte-for-byte UNCHANGED.
    expect(result.current.state.revenueLines).toBe(beforeRevenueLines);
    expect(result.current.state.cogsLines).toBe(beforeCogsLines);
    expect(result.current.state.opexLines).toBe(beforeOpexLines);

    //    (c) Spot-check the customizations explicitly (defense-in-depth).
    expect(result.current.state.revenueLines.map((l) => l.name)).toEqual([
      'Operator-renamed Product A',
      'Operator-added Product B (split)',
    ]);
    expect(result.current.state.cogsLines[0].costBehavior).toBe('fixed');
    expect(result.current.state.cogsLines[0].monthlyAmount).toBe(33_333);
    expect(result.current.state.opexLines[0].monthlyAmount).toBe(12_500);
    expect(result.current.state.opexLines[0].accountCode).toBe('6020');
    expect(result.current.state.opexLines[0].annualIncreasePct).toBe(5);
  });

  it('multiple successive setPriorYearDisplay calls do not regenerate lines', () => {
    // Simulates several hard-refreshes in a row — every refresh must keep
    // operator customizations.
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'test-hard-refresh-multi'),
    );

    act(() => {
      result.current.actions.setPriorYear(makePriorYear());
    });

    const opCustomLines: RevenueLine[] = [
      {
        id: 'rev-keep-me',
        name: 'Operator Custom Line',
        year1Monthly: { '2025-07': 99999 },
        year2Monthly: {},
        year3Monthly: {},
      },
    ];
    act(() => {
      result.current.actions.setRevenueLines(opCustomLines);
    });

    const snapshotBefore = result.current.state.revenueLines;

    // 5 successive display refreshes (5 hard-refreshes).
    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.actions.setPriorYearDisplay(
          makePriorYear({ revenue: { ...makePriorYear().revenue, total: 1_000_000 + i } }),
        );
      });
    }

    expect(result.current.state.revenueLines).toBe(snapshotBefore);
    expect(result.current.state.revenueLines[0].name).toBe('Operator Custom Line');
    expect(result.current.state.revenueLines[0].year1Monthly['2025-07']).toBe(99999);
  });

  it('setPriorYear (full init) still rebuilds lines — first-time setup path unchanged', () => {
    // Regression-lock the OTHER path: when called from Step2PriorYear
    // (operator confirms parsed data) or from the saved-forecast fallback in
    // ForecastWizardV4, setPriorYear must continue to rebuild lines.
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'test-set-prior-year-still-inits'),
    );

    expect(result.current.state.revenueLines).toEqual([]);

    act(() => {
      result.current.actions.setPriorYear(makePriorYear());
    });

    // setPriorYear DOES create at least one revenue line from the fresh
    // priorYear data (this is the first-time-setup contract).
    expect(result.current.state.revenueLines.length).toBeGreaterThan(0);
    expect(result.current.state.cogsLines.length).toBeGreaterThan(0);
    expect(result.current.state.opexLines.length).toBeGreaterThan(0);
  });
});
