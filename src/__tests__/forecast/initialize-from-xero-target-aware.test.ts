// Phase 44.3 — Forecast Step 3 Year-1 Target Wiring (REQ FCST-01..06)
//
// Behavioural contract for the bug fix in
//   src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts:763-770
// where the byLine branch of `initializeFromXero` ignores `targetRevenue`
// and copies prior-year monthlies verbatim.
//
// EXPECTED FAILURES ON HEAD (Task 1 red state):
//   - Tests 1, 2, 3, 5, 6: assertion errors comparing target-scaled expected
//     vs prior-year-verbatim received.
//   - Test 4: PASSES on main (legacy verbatim copy is incidentally what the
//     bug branch does — Test 4 verifies the fallback path stays correct).
//   - All tests: tsc error on `currentYTD.revenue_lines` until Task 2 ships
//     the type extension on `WizardActions.initializeFromXero` arg.
//
// NOTE: Wizard currently assumes yearStartMonth=7 (July FY) via
// `generateMonthKeys` default. Non-July FY support is a pre-existing latent
// issue tracked separately (see PLAN-CHECK §C). All fixtures here use July FY.

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import type { PriorYearData, Goals } from '@/app/finances/forecast/components/wizard-v4/types';
import type { PLLineItem } from '@/app/finances/forecast/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

const FY_START_YEAR = 2025; // Calendar year FY begins (July 2025 → June 2026)

// Generate 12 target-FY month keys (e.g. '2025-07' .. '2026-06')
function targetFYKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 12; i++) {
    const calMonth = ((7 - 1 + i) % 12) + 1;
    const year = calMonth >= 7 ? FY_START_YEAR : FY_START_YEAR + 1;
    keys.push(`${year}-${String(calMonth).padStart(2, '0')}`);
  }
  return keys;
}

// Generate 12 prior-FY month keys (e.g. '2024-07' .. '2025-06')
function priorFYKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 12; i++) {
    const calMonth = ((7 - 1 + i) % 12) + 1;
    const year = calMonth >= 7 ? FY_START_YEAR - 1 : FY_START_YEAR;
    keys.push(`${year}-${String(calMonth).padStart(2, '0')}`);
  }
  return keys;
}

// Build a 12-month MonthlyData map keyed by prior-FY months from a values array
function makePriorMonthly(values: number[]): Record<string, number> {
  const keys = priorFYKeys();
  const out: Record<string, number> = {};
  for (let i = 0; i < 12; i++) {
    out[keys[i]] = values[i] ?? 0;
  }
  return out;
}

// Build a minimal-but-typed PriorYearData with the supplied revenue lines.
function makePriorYear(
  revenueLines: Array<{ id: string; name: string; total: number; monthly: number[] }>
): PriorYearData {
  const totalRevenue = revenueLines.reduce((s, l) => s + l.total, 0);
  const aggregateByMonth: Record<string, number> = {};
  const keys = priorFYKeys();
  for (const k of keys) aggregateByMonth[k] = 0;
  for (const line of revenueLines) {
    for (let i = 0; i < 12; i++) {
      aggregateByMonth[keys[i]] += line.monthly[i] ?? 0;
    }
  }
  // Seasonality: 12 even shares (8.33%) — the per-line distribution math uses
  // each line's own byMonth, NOT this aggregate, so the value here is not
  // load-bearing for these tests.
  const seasonalityPattern = Array(12).fill(8.33);
  return {
    revenue: {
      total: totalRevenue,
      byMonth: aggregateByMonth,
      byLine: revenueLines.map((l) => ({
        id: l.id,
        name: l.name,
        total: l.total,
        byMonth: makePriorMonthly(l.monthly),
      })),
    },
    cogs: { total: 0, percentOfRevenue: 0, byMonth: {}, byLine: [] },
    grossProfit: { total: totalRevenue, percent: 100, byMonth: aggregateByMonth },
    opex: { total: 0, byMonth: {}, byLine: [] },
    seasonalityPattern,
  };
}

// Hook init helper — renderHook with the (fiscalYearStart, businessId) signature.
function renderWizard(testId: string) {
  return renderHook(() => useForecastWizard(FY_START_YEAR, `test-business-${testId}`));
}

// Sum a Record<string, number>
function sum(map: Record<string, number>): number {
  return Object.values(map).reduce((s, v) => s + v, 0);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('initializeFromXero — target-aware (Phase 44.3 / FCST-01..05)', () => {
  // ── TEST 1 (FCST-03 + FCST-01): stable mix, no YTD, growth target ────────
  it('Test 1: stable mix, no YTD, growth target — scales each line by prior-year share', async () => {
    // Hardware $400k (peaks early, even months 50k 30k 30k 30k 30k 30k 50k 30k 30k 30k 30k 30k = 410k... use clean fixture)
    // Use clean monthly fixtures whose totals match line.total exactly.
    const hardwareMonthly = [50_000, 30_000, 30_000, 30_000, 30_000, 30_000, 50_000, 30_000, 30_000, 30_000, 30_000, 30_000]; // sum 400k
    const serviceMonthly = [40_000, 50_000, 50_000, 50_000, 50_000, 50_000, 60_000, 50_000, 50_000, 50_000, 50_000, 50_000]; // sum 600k
    expect(hardwareMonthly.reduce((a, b) => a + b, 0)).toBe(400_000);
    expect(serviceMonthly.reduce((a, b) => a + b, 0)).toBe(600_000);

    const priorYear = makePriorYear([
      { id: 'h', name: 'Hardware', total: 400_000, monthly: hardwareMonthly },
      { id: 's', name: 'Service', total: 600_000, monthly: serviceMonthly },
    ]);
    const goals: Goals = {
      year1: { revenue: 1_200_000, grossProfitPct: 50, netProfitPct: 15 },
    };

    const { result } = renderWizard('1');

    await act(async () => {
      result.current.actions.initializeFromXero({
        priorYear,
        team: [],
        goals,
        currentYTD: undefined,
      });
    });

    const hardwareLine = result.current.state.revenueLines.find((r) => r.name === 'Hardware');
    const serviceLine = result.current.state.revenueLines.find((r) => r.name === 'Service');
    expect(hardwareLine).toBeDefined();
    expect(serviceLine).toBeDefined();

    // Hardware annual = lineShare(0.4) * target(1_200_000) = 480_000
    expect(sum(hardwareLine!.year1Monthly)).toBe(480_000);
    // Service annual = lineShare(0.6) * target(1_200_000) = 720_000
    expect(sum(serviceLine!.year1Monthly)).toBe(720_000);
    // Grand total
    const grand = result.current.state.revenueLines.reduce((s, l) => s + sum(l.year1Monthly), 0);
    expect(grand).toBe(1_200_000);

    // Line-specific seasonality check: Hardware first-month value should equal
    // round(480_000 * (50_000 / 400_000)) = round(60_000) = 60_000.
    const targetKeys = targetFYKeys();
    expect(hardwareLine!.year1Monthly[targetKeys[0]]).toBe(60_000);
    // Service first-month value = round(720_000 * (40_000 / 600_000)) = 48_000.
    expect(serviceLine!.year1Monthly[targetKeys[0]]).toBe(48_000);
  });

  // ── TEST 2 (FCST-02): stable mix, partial YTD, growth target ────────────
  it('Test 2: stable mix, partial YTD — locks completed months exactly + scales future to remaining target', async () => {
    const hardwareMonthly = [50_000, 30_000, 30_000, 30_000, 30_000, 30_000, 50_000, 30_000, 30_000, 30_000, 30_000, 30_000]; // 400k
    const serviceMonthly = [40_000, 50_000, 50_000, 50_000, 50_000, 50_000, 60_000, 50_000, 50_000, 50_000, 50_000, 50_000]; // 600k

    const priorYear = makePriorYear([
      { id: 'h', name: 'Hardware', total: 400_000, monthly: hardwareMonthly },
      { id: 's', name: 'Service', total: 600_000, monthly: serviceMonthly },
    ]);
    const goals: Goals = {
      year1: { revenue: 1_200_000, grossProfitPct: 50, netProfitPct: 15 },
    };

    // 2 completed months at start of FY (target FY keys)
    const ytdHardware: PLLineItem = {
      account_name: 'Hardware',
      category: 'Revenue',
      total: 110_000,
      by_month: { '2025-07': 50_000, '2025-08': 60_000 },
      percent_of_revenue: 100,
    };
    const ytdService: PLLineItem = {
      account_name: 'Service',
      category: 'Revenue',
      total: 170_000,
      by_month: { '2025-07': 80_000, '2025-08': 90_000 },
      percent_of_revenue: 100,
    };

    const { result } = renderWizard('2');

    await act(async () => {
      result.current.actions.initializeFromXero({
        priorYear,
        team: [],
        goals,
        currentYTD: {
          revenue_by_month: { '2025-07': 130_000, '2025-08': 150_000 },
          total_revenue: 280_000,
          months_count: 2,
          revenue_lines: [ytdHardware, ytdService],
        },
      });
    });

    const hardwareLine = result.current.state.revenueLines.find((r) => r.name === 'Hardware')!;
    const serviceLine = result.current.state.revenueLines.find((r) => r.name === 'Service')!;

    // YTD lock — completed months exactly match YTD per-line values.
    expect(hardwareLine.year1Monthly['2025-07']).toBe(50_000);
    expect(hardwareLine.year1Monthly['2025-08']).toBe(60_000);
    expect(serviceLine.year1Monthly['2025-07']).toBe(80_000);
    expect(serviceLine.year1Monthly['2025-08']).toBe(90_000);

    // Hardware annual still sums to 480k (target preserved).
    expect(sum(hardwareLine.year1Monthly)).toBe(480_000);
    // Service annual still sums to 720k.
    expect(sum(serviceLine.year1Monthly)).toBe(720_000);

    // Future months for Hardware distribute (480_000 - 110_000) = 370_000
    // by Hardware's prior-year future-month seasonality.
    const futureKeys = targetFYKeys().slice(2); // months 3..12
    const hardwareFutureSum = futureKeys.reduce((s, k) => s + (hardwareLine.year1Monthly[k] || 0), 0);
    expect(hardwareFutureSum).toBe(370_000);
  });

  // ── TEST 3 (FCST-04): new line in YTD not in prior year ─────────────────
  it('Test 3: new line in YTD not in prior year — appended as fresh line with YTD months + zero future', async () => {
    const hardwareMonthly = [50_000, 30_000, 30_000, 30_000, 30_000, 30_000, 50_000, 30_000, 30_000, 30_000, 30_000, 30_000];
    const serviceMonthly = [40_000, 50_000, 50_000, 50_000, 50_000, 50_000, 60_000, 50_000, 50_000, 50_000, 50_000, 50_000];

    const priorYear = makePriorYear([
      { id: 'h', name: 'Hardware', total: 400_000, monthly: hardwareMonthly },
      { id: 's', name: 'Service', total: 600_000, monthly: serviceMonthly },
    ]);
    const goals: Goals = {
      year1: { revenue: 1_200_000, grossProfitPct: 50, netProfitPct: 15 },
    };

    const ytdHardware: PLLineItem = {
      account_name: 'Hardware',
      category: 'Revenue',
      total: 110_000,
      by_month: { '2025-07': 50_000, '2025-08': 60_000 },
      percent_of_revenue: 100,
    };
    const ytdService: PLLineItem = {
      account_name: 'Service',
      category: 'Revenue',
      total: 170_000,
      by_month: { '2025-07': 80_000, '2025-08': 90_000 },
      percent_of_revenue: 100,
    };
    const ytdSubscriptions: PLLineItem = {
      account_name: 'Subscriptions',
      category: 'Revenue',
      total: 50_000,
      by_month: { '2025-07': 25_000, '2025-08': 25_000 },
      percent_of_revenue: 100,
    };

    const { result } = renderWizard('3');

    await act(async () => {
      result.current.actions.initializeFromXero({
        priorYear,
        team: [],
        goals,
        currentYTD: {
          revenue_by_month: { '2025-07': 155_000, '2025-08': 175_000 },
          total_revenue: 330_000,
          months_count: 2,
          revenue_lines: [ytdHardware, ytdService, ytdSubscriptions],
        },
      });
    });

    const subsLine = result.current.state.revenueLines.find((r) => r.name === 'Subscriptions');
    expect(subsLine).toBeDefined();

    // YTD months populated.
    expect(subsLine!.year1Monthly['2025-07']).toBe(25_000);
    expect(subsLine!.year1Monthly['2025-08']).toBe(25_000);

    // Future months = 0
    const futureKeys = targetFYKeys().slice(2);
    for (const k of futureKeys) {
      expect(subsLine!.year1Monthly[k] ?? 0).toBe(0);
    }

    // Total annual for Subscriptions = 50k (only the YTD).
    expect(sum(subsLine!.year1Monthly)).toBe(50_000);

    // Hardware + Service still scale to per-line targets — Subscriptions does
    // NOT consume any of the $1.2M target.
    const hw = result.current.state.revenueLines.find((r) => r.name === 'Hardware')!;
    const sv = result.current.state.revenueLines.find((r) => r.name === 'Service')!;
    expect(sum(hw.year1Monthly)).toBe(480_000);
    expect(sum(sv.year1Monthly)).toBe(720_000);
  });

  // ── TEST 4 (FCST-05): target=0 fallback — legacy verbatim copy ──────────
  it('Test 4: target=0 fallback — verbatim prior-year copy (legacy behaviour)', async () => {
    const hardwareMonthly = [50_000, 30_000, 30_000, 30_000, 30_000, 30_000, 50_000, 30_000, 30_000, 30_000, 30_000, 30_000];
    const serviceMonthly = [40_000, 50_000, 50_000, 50_000, 50_000, 50_000, 60_000, 50_000, 50_000, 50_000, 50_000, 50_000];

    const priorYear = makePriorYear([
      { id: 'h', name: 'Hardware', total: 400_000, monthly: hardwareMonthly },
      { id: 's', name: 'Service', total: 600_000, monthly: serviceMonthly },
    ]);
    // Target is 0 — exercises the fallback path.
    const goals: Goals = {
      year1: { revenue: 0, grossProfitPct: 50, netProfitPct: 15 },
    };

    const { result } = renderWizard('4');

    await act(async () => {
      result.current.actions.initializeFromXero({
        priorYear,
        team: [],
        goals,
        currentYTD: undefined,
      });
    });

    const hardwareLine = result.current.state.revenueLines.find((r) => r.name === 'Hardware')!;
    const serviceLine = result.current.state.revenueLines.find((r) => r.name === 'Service')!;

    // Sum equals prior-year totals (NOT scaled to anything).
    expect(sum(hardwareLine.year1Monthly)).toBe(400_000);
    expect(sum(serviceLine.year1Monthly)).toBe(600_000);

    // Per-month equals remap of prior-year monthly. First month for Hardware
    // is 50_000 (the prior-year July value moved to target FY July).
    const targetKeys = targetFYKeys();
    expect(hardwareLine.year1Monthly[targetKeys[0]]).toBe(50_000);
    expect(serviceLine.year1Monthly[targetKeys[0]]).toBe(40_000);
  });

  // ── TEST 5 (FCST-04): line-name match is case-insensitive trim ──────────
  it('Test 5: line-name match is case-insensitive trim — no fuzzy/substring matching', async () => {
    const hardwareMonthly = [50_000, 30_000, 30_000, 30_000, 30_000, 30_000, 50_000, 30_000, 30_000, 30_000, 30_000, 30_000]; // 400k
    const serviceMonthly = [50_000, 50_000, 50_000, 50_000, 50_000, 50_000, 50_000, 50_000, 50_000, 50_000, 50_000, 50_000]; // 600k

    const priorYear = makePriorYear([
      { id: 'h', name: 'Hardware Sales', total: 400_000, monthly: hardwareMonthly },
      { id: 's', name: 'Service', total: 600_000, monthly: serviceMonthly },
    ]);

    // Target = prior-year total (1.0×) so lineYearTarget == prior-year per-line totals.
    const goals: Goals = {
      year1: { revenue: 1_000_000, grossProfitPct: 50, netProfitPct: 15 },
    };

    // YTD line: same name but different casing + surrounding whitespace.
    const ytdHardwareMessyCase: PLLineItem = {
      account_name: '  hardware sales  ',
      category: 'Revenue',
      total: 50_000,
      by_month: { '2025-07': 50_000 },
      percent_of_revenue: 100,
    };
    // YTD line that is SIMILAR but not equal — must NOT fuzzy-match Hardware Sales.
    const ytdHardwareRenewals: PLLineItem = {
      account_name: 'Hardware Renewals',
      category: 'Revenue',
      total: 10_000,
      by_month: { '2025-07': 10_000 },
      percent_of_revenue: 100,
    };

    const { result } = renderWizard('5');

    await act(async () => {
      result.current.actions.initializeFromXero({
        priorYear,
        team: [],
        goals,
        currentYTD: {
          revenue_by_month: { '2025-07': 60_000 },
          total_revenue: 60_000,
          months_count: 1,
          revenue_lines: [ytdHardwareMessyCase, ytdHardwareRenewals],
        },
      });
    });

    // Trim+lowercase match succeeds — the YTD value is locked into existing
    // 'Hardware Sales' line, NOT appended as a new line.
    const hardwareSalesLine = result.current.state.revenueLines.find((r) => r.name === 'Hardware Sales')!;
    expect(hardwareSalesLine).toBeDefined();
    expect(hardwareSalesLine.year1Monthly['2025-07']).toBe(50_000);

    // 'Hardware Renewals' has NO prior-year equivalent → appended as new line.
    const renewalsLine = result.current.state.revenueLines.find((r) => r.name === 'Hardware Renewals');
    expect(renewalsLine).toBeDefined();
    expect(renewalsLine!.year1Monthly['2025-07']).toBe(10_000);

    // We should NOT see a SECOND 'hardware sales' line appended (i.e. no
    // duplicate from a missed match).
    const matches = result.current.state.revenueLines.filter(
      (r) => r.name.trim().toLowerCase() === 'hardware sales'
    );
    expect(matches).toHaveLength(1);

    // revenueLines count = 2 prior-year + 1 new (Renewals) = 3
    expect(result.current.state.revenueLines).toHaveLength(3);
  });

  // ── TEST 6 (rounding residue): per-line annual sum exactness ─────────────
  it('Test 6: rounding residue absorbed in last future month — per-line annual matches Math.round(lineYearTarget) exactly', async () => {
    // Deliberately non-divisible totals + non-round target.
    // Hardware split: 333_333 = 11*27_778 + 1*27_775 = 305_558 + 27_775 = 333_333.
    const hwMonthly = [
      27_778, 27_778, 27_778, 27_778, 27_778, 27_778, 27_778, 27_778, 27_778, 27_778, 27_778, 27_775,
    ];
    const hwSum = hwMonthly.reduce((a, b) => a + b, 0);
    expect(hwSum).toBe(333_333);

    // Service split: 666_667 = 7*55_556 + 5*55_555 = 388_892 + 277_775 = 666_667.
    const svMonthly = [
      55_556, 55_556, 55_556, 55_556, 55_556, 55_556, 55_556, 55_555, 55_555, 55_555, 55_555, 55_555,
    ];
    const svSum = svMonthly.reduce((a, b) => a + b, 0);
    expect(svSum).toBe(666_667);

    const priorYear = makePriorYear([
      { id: 'h', name: 'Hardware', total: 333_333, monthly: hwMonthly },
      { id: 's', name: 'Service', total: 666_667, monthly: svMonthly },
    ]);
    // Total = 1_000_000; target = 1_000_001 (1 dollar off, deliberately non-round).
    const goals: Goals = {
      year1: { revenue: 1_000_001, grossProfitPct: 50, netProfitPct: 15 },
    };

    const { result } = renderWizard('6');

    await act(async () => {
      result.current.actions.initializeFromXero({
        priorYear,
        team: [],
        goals,
        currentYTD: undefined,
      });
    });

    const hardwareLine = result.current.state.revenueLines.find((r) => r.name === 'Hardware')!;
    const serviceLine = result.current.state.revenueLines.find((r) => r.name === 'Service')!;

    // Mirror the implementation's rounding order to avoid false-fail:
    // expectedTotal = Math.round(targetRevenue * lineShare)
    const hwExpected = Math.round(1_000_001 * (333_333 / 1_000_000));
    const svExpected = Math.round(1_000_001 * (666_667 / 1_000_000));

    expect(sum(hardwareLine.year1Monthly)).toBe(hwExpected);
    expect(sum(serviceLine.year1Monthly)).toBe(svExpected);
  });
});
