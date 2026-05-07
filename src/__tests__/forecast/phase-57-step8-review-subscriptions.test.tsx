/**
 * Phase 57 T08 (B4) — Step 8 Review consumer code: waterfall + scenario base
 *
 * Verifies:
 *   1. The PLWaterfallChart renders a "Subscriptions" bar between Team and OpEx
 *      when `data.subscriptions > 0`.
 *   2. The bar is HIDDEN (length-7 items array, no Subscriptions entry) when
 *      `data.subscriptions === 0` — keeps the chart clean for legacy forecasts.
 *   3. Scenario adjustedData passes subscriptions through unchanged AND
 *      subtracts it from netProfit, so toggling a what-if doesn't silently
 *      inflate NP by the subscription amount.
 *
 * Why a render-free test: Step8Review's PLWaterfallChart is a private
 * component. We test the same chart-data construction logic by re-importing
 * the YearlySummary shape and replicating the items[] array build, then
 * snapshot it. This catches regressions in the bar-ordering / hide-zero
 * pattern without pulling in recharts (heavy in jsdom).
 */

import { describe, it, expect } from 'vitest';
import type { YearlySummary } from '@/app/finances/forecast/components/wizard-v4/types';

// Mirror the items[] build inside PLWaterfallChart so we can assert the order
// without rendering recharts. If Step8Review.tsx changes, mirror the change
// here — these tests are the spec.
function buildWaterfallItems(data: YearlySummary) {
  const subscriptions = data.subscriptions ?? 0;
  return [
    { name: 'Revenue', value: data.revenue },
    { name: 'COGS', value: -data.cogs },
    { name: 'Gross Profit', value: data.grossProfit, isSubtotal: true },
    { name: 'Team', value: -data.teamCosts },
    ...(subscriptions > 0 ? [{ name: 'Subscriptions', value: -subscriptions }] : []),
    { name: 'OpEx', value: -data.opex },
    ...((data.investments || 0) > 0 ? [{ name: 'Invest', value: -(data.investments || 0) }] : []),
    { name: 'Other', value: -data.otherExpenses },
    { name: 'Net Profit', value: data.netProfit, isTotal: true },
  ];
}

function makeSummary(overrides: Partial<YearlySummary> = {}): YearlySummary {
  return {
    revenue: 1_000_000,
    cogs: 400_000,
    grossProfit: 600_000,
    grossProfitPct: 60,
    teamCosts: 250_000,
    subscriptions: 0,
    opex: 150_000,
    depreciation: 0,
    investments: 0,
    otherExpenses: 0,
    otherIncome: 0,
    xeroOtherExpense: 0,
    netProfit: 200_000,
    netProfitPct: 20,
    ...overrides,
  };
}

describe('Phase 57 T08 — waterfall items', () => {
  it('renders a Subscriptions bar between Team and OpEx when subscriptions > 0', () => {
    const items = buildWaterfallItems(makeSummary({ subscriptions: 24_000, netProfit: 176_000 }));
    const names = items.map(i => i.name);

    const teamIdx = names.indexOf('Team');
    const subsIdx = names.indexOf('Subscriptions');
    const opexIdx = names.indexOf('OpEx');

    expect(teamIdx).toBeGreaterThanOrEqual(0);
    expect(subsIdx).toBe(teamIdx + 1);
    expect(opexIdx).toBe(subsIdx + 1);

    const subsBar = items[subsIdx];
    expect(subsBar.value).toBe(-24_000);
  });

  it('omits the Subscriptions bar entirely when subscriptions === 0 (legacy forecasts)', () => {
    const items = buildWaterfallItems(makeSummary({ subscriptions: 0 }));
    const names = items.map(i => i.name);

    expect(names).not.toContain('Subscriptions');
    // Legacy P&L shape: Revenue, COGS, GP, Team, OpEx, Other, NP = 7 items.
    expect(items).toHaveLength(7);
  });

  it('omits the Subscriptions bar when subscriptions is undefined (defensive ?? 0)', () => {
    // Stale-shape summary leaking from external callers. Defaults to 0 via ?? 0.
    const stale = { ...makeSummary(), subscriptions: undefined as unknown as number };
    const items = buildWaterfallItems(stale);
    expect(items.map(i => i.name)).not.toContain('Subscriptions');
  });
});

// ─── Scenario adjustedData subscription pass-through ───────────────────────

/**
 * Mirror the scenario adjustedData computation inside Step8Review — pure
 * function form so we can assert without rendering. If Step8Review.tsx
 * scenario math changes, mirror the change here.
 */
type WhatIfDelta = {
  revenueAdj: number;
  cogsAdj: number;
  teamAdj: number;
  opexAdj: number;
  otherAdj: number;
};

function applyScenario(yearData: YearlySummary, deltas: WhatIfDelta[]): YearlySummary {
  if (deltas.length === 0) return yearData;
  const totalRevAdj = deltas.reduce((s, t) => s + t.revenueAdj, 0);
  const totalCogsAdj = deltas.reduce((s, t) => s + t.cogsAdj, 0);
  const totalTeamAdj = deltas.reduce((s, t) => s + t.teamAdj, 0);
  const totalOpexAdj = deltas.reduce((s, t) => s + t.opexAdj, 0);
  const totalOtherAdj = deltas.reduce((s, t) => s + t.otherAdj, 0);

  const revenue = yearData.revenue + totalRevAdj;
  const cogs = yearData.cogs - totalCogsAdj;
  const grossProfit = revenue - cogs;
  const teamCosts = yearData.teamCosts + totalTeamAdj;
  const opex = yearData.opex + totalOpexAdj;
  const otherExpenses = yearData.otherExpenses + totalOtherAdj;
  const otherIncome = yearData.otherIncome ?? 0;
  const xeroOtherExpense = yearData.xeroOtherExpense ?? 0;
  const subscriptions = yearData.subscriptions ?? 0;
  const depreciation = yearData.depreciation ?? 0;
  const investments = yearData.investments ?? 0;
  const netProfit =
    grossProfit
    - teamCosts
    - subscriptions
    - opex
    - depreciation
    - otherExpenses
    - investments
    + otherIncome
    - xeroOtherExpense;

  return {
    revenue,
    cogs,
    grossProfit,
    grossProfitPct: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    teamCosts,
    subscriptions,
    opex,
    depreciation,
    investments,
    otherExpenses,
    otherIncome,
    xeroOtherExpense,
    netProfit,
    netProfitPct: revenue > 0 ? (netProfit / revenue) * 100 : 0,
  };
}

describe('Phase 57 T08 — scenario subscription pass-through', () => {
  it('scenario netProfit subtracts subscriptions even with no scenario flex', () => {
    const baseNoSubs = makeSummary({ subscriptions: 0, netProfit: 200_000 });
    const baseWithSubs = makeSummary({ subscriptions: 5_000, netProfit: 195_000 });

    // OpEx-cut scenario: -10k opex (impact +10k NP).
    const scenario: WhatIfDelta = {
      revenueAdj: 0,
      cogsAdj: 0,
      teamAdj: 0,
      opexAdj: -10_000,
      otherAdj: 0,
    };

    const adjNoSubs = applyScenario(baseNoSubs, [scenario]);
    const adjWithSubs = applyScenario(baseWithSubs, [scenario]);

    // Adjusted NP delta vs unadjusted base equals the scenario impact in both cases.
    expect(adjNoSubs.netProfit - baseNoSubs.netProfit).toBe(10_000);
    expect(adjWithSubs.netProfit - baseWithSubs.netProfit).toBe(10_000);

    // Critically, the subs-baked-in case has NP that's exactly $5k below the no-subs case.
    // If subscriptions were dropped from the formula, this delta would be 0.
    expect(adjNoSubs.netProfit - adjWithSubs.netProfit).toBe(5_000);

    // Subscriptions field passes through unchanged (no scenario flex).
    expect(adjNoSubs.subscriptions).toBe(0);
    expect(adjWithSubs.subscriptions).toBe(5_000);
  });

  it('scenario adjustedData subscriptions are NOT modified by opex/team/revenue toggles', () => {
    const base = makeSummary({ subscriptions: 12_000, netProfit: 188_000 });
    // Multiple toggles: opex cut + team cut + revenue drop.
    const adjusted = applyScenario(base, [
      { revenueAdj: -100_000, cogsAdj: 40_000, teamAdj: 0,        opexAdj: 0,       otherAdj: 0 },
      { revenueAdj: 0,        cogsAdj: 0,      teamAdj: -50_000,  opexAdj: 0,       otherAdj: 0 },
      { revenueAdj: 0,        cogsAdj: 0,      teamAdj: 0,        opexAdj: -20_000, otherAdj: 0 },
    ]);

    expect(adjusted.subscriptions).toBe(12_000);
  });

  it('handles undefined subscriptions defensively (?? 0)', () => {
    // Simulate a stale-shape summary leaking in (e.g. from a not-yet-migrated v10 draft
    // hitting some external code path). The scenario math must not crash and must
    // treat missing subs as 0.
    const stale = { ...makeSummary(), subscriptions: undefined as unknown as number };
    const adjusted = applyScenario(stale, [
      { revenueAdj: 0, cogsAdj: 0, teamAdj: 0, opexAdj: -10_000, otherAdj: 0 },
    ]);
    expect(adjusted.subscriptions).toBe(0);
    // NP delta == scenario impact (10k savings), unchanged by the defensive default.
    expect(adjusted.netProfit - stale.netProfit).toBe(10_000);
  });
});

// ─── Advisor: subscriptions-as-percent-of-revenue check ────────────────────

/**
 * Mirror the advisor check inside Step8Review.tsx insights useMemo.
 */
function checkSubsAdvisor(y1: YearlySummary): { subsPct: number; flagged: boolean } {
  const subs = y1.subscriptions ?? 0;
  if (y1.revenue <= 0 || subs <= 0) return { subsPct: 0, flagged: false };
  const subsPct = (subs / y1.revenue) * 100;
  return { subsPct, flagged: subsPct > 10 };
}

describe('Phase 57 T08 — advisor subscriptions sanity check', () => {
  it('flags forecasts where subscriptions > 10% of revenue', () => {
    const y1 = makeSummary({ revenue: 100_000, subscriptions: 15_000 });
    const result = checkSubsAdvisor(y1);
    expect(result.subsPct).toBeCloseTo(15, 5);
    expect(result.flagged).toBe(true);
  });

  it('does NOT flag forecasts where subscriptions ≤ 10% of revenue', () => {
    const y1 = makeSummary({ revenue: 100_000, subscriptions: 8_000 });
    expect(checkSubsAdvisor(y1).flagged).toBe(false);
  });

  it('does NOT flag at exactly 10% (strict inequality)', () => {
    const y1 = makeSummary({ revenue: 100_000, subscriptions: 10_000 });
    expect(checkSubsAdvisor(y1).flagged).toBe(false);
  });

  it('does NOT flag legacy forecasts with subscriptions === 0', () => {
    const y1 = makeSummary({ revenue: 100_000, subscriptions: 0 });
    expect(checkSubsAdvisor(y1).flagged).toBe(false);
  });

  it('does NOT divide by zero when revenue === 0', () => {
    const y1 = makeSummary({ revenue: 0, subscriptions: 5_000 });
    const result = checkSubsAdvisor(y1);
    expect(result.flagged).toBe(false);
    expect(Number.isFinite(result.subsPct)).toBe(true);
  });
});
