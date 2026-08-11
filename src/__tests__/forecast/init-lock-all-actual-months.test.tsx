/**
 * fix/init-lock-all-actual-months — regression tests.
 *
 * initializeFromXero must lock COMPLETED months for EVERY revenue line:
 * at the line's Xero actual when it traded, at $0 when it didn't. Before
 * this fix, a prior-year line with no YTD match (Dragon Roofing 2026-08:
 * Sales - Deposit / Sales - Referral Fee / Other Revenue in July) treated
 * the completed month as a FUTURE month and distributed forecast dollars
 * into it — the July column total exceeded the real Xero actual.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import type { PriorYearData } from '@/app/finances/forecast/components/wizard-v4/types';

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

const FY_START_YEAR = 2026; // FY2027: Jul 2026 → Jun 2027
const JUL = `${FY_START_YEAR}-07`;

function monthKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 12; i++) {
    const calMonth = ((7 - 1 + i) % 12) + 1;
    const year = calMonth >= 7 ? FY_START_YEAR : FY_START_YEAR + 1;
    keys.push(`${year}-${String(calMonth).padStart(2, '0')}`);
  }
  return keys;
}

// Prior-year byMonth for a line — flat across the PRIOR FY's months (the
// remap helper shifts them forward one year internally).
function flatPriorByMonth(total: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < 12; i++) {
    const calMonth = ((7 - 1 + i) % 12) + 1;
    const year = calMonth >= 7 ? FY_START_YEAR - 1 : FY_START_YEAR;
    out[`${year}-${String(calMonth).padStart(2, '0')}`] = total / 12;
  }
  return out;
}

function makePriorYear(): PriorYearData {
  return {
    revenue: {
      total: 1_200_000,
      byMonth: flatPriorByMonth(1_200_000),
      byLine: [
        { id: 'revenue-0', name: 'Sales - Insurance', total: 900_000, byMonth: flatPriorByMonth(900_000) },
        { id: 'revenue-1', name: 'Sales - Deposit', total: 300_000, byMonth: flatPriorByMonth(300_000) },
      ],
    },
    cogs: { total: 0, percentOfRevenue: 0, byMonth: {}, byLine: [] },
    grossProfit: { total: 1_200_000, percent: 100, byMonth: {} },
    opex: { total: 0, byMonth: {}, byLine: [] },
    seasonalityPattern: Array(12).fill(100 / 12),
  };
}

describe('initializeFromXero — completed months lock for every line', () => {
  it('locks a no-activity line at $0 in the completed month (no forecast bleed)', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'biz-lock-test', true),
    );

    act(() => {
      result.current.actions.initializeFromXero({
        priorYear: makePriorYear(),
        team: [],
        goals: {
          year1: { revenue: 2_400_000, grossProfitPct: 40, netProfitPct: 15 },
          year2: { revenue: 0, grossProfitPct: 40, netProfitPct: 15 },
          year3: { revenue: 0, grossProfitPct: 40, netProfitPct: 15 },
        },
        currentYTD: {
          // July is complete; only Sales - Insurance traded.
          revenue_by_month: { [JUL]: 100_000 },
          total_revenue: 100_000,
          months_count: 1,
          revenue_lines: [
            { account_name: 'Sales - Insurance', category: 'Revenue', total: 100_000, by_month: { [JUL]: 100_000 } },
          ],
        },
      });
    });

    const lines = result.current.state.revenueLines;
    const insurance = lines.find((l) => l.name === 'Sales - Insurance')!;
    const deposit = lines.find((l) => l.name === 'Sales - Deposit')!;

    // Matched line: July locked at its actual.
    expect(insurance.year1Monthly[JUL]).toBe(100_000);
    // Unmatched line: July locked at $0 — the old behavior distributed
    // forecast dollars into it.
    expect(deposit.year1Monthly[JUL]).toBe(0);

    // The month-column total therefore equals the Xero actual exactly.
    const julyTotal = lines.reduce((s, l) => s + (l.year1Monthly[JUL] || 0), 0);
    expect(julyTotal).toBe(100_000);

    // The deposit line's full target still lands — in FUTURE months only.
    const depositTotal = Object.values(deposit.year1Monthly).reduce((a, b) => a + b, 0);
    expect(depositTotal).toBe(Math.round(2_400_000 * (300_000 / 1_200_000)));

    // And every line covers all 12 months with no undefined holes.
    for (const key of monthKeys()) {
      expect(deposit.year1Monthly[key]).not.toBeUndefined();
    }
  });
});
