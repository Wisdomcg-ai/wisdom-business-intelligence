/**
 * Phase 57 T10 (B4) — BudgetFramework subscriptions line + parity
 *
 * Verifies the math behind BudgetFramework's per-year breakdown:
 *   availableOpEx = grossProfit − teamCosts − subscriptions − targetProfit
 *   impliedNetProfit = grossProfit − teamCosts − subscriptions − opex
 *
 * AND that subscriptionsByYear honors `state.defaultOpExIncreasePct`
 * (parameterized growth — NOT hard-coded 1.03):
 *   y1 = Σ(active vendor monthly × 12)
 *   y2 = y1 × (1 + defaultOpExIncreasePct/100)
 *   y3 = y1 × (1 + defaultOpExIncreasePct/100)^2
 *
 * Also verifies BudgetTracker parity — its `availableForExpenses` formula
 * subtracts subscriptions identically.
 *
 * Why pure-function tests: the BudgetFramework component is internal to
 * Step5OpEx.tsx (not exported). We replicate its `calculateYearBudget` and
 * subscriptionsByYear computations here — if Step5OpEx changes, mirror the
 * change here. These tests are the spec.
 */

import { describe, it, expect } from 'vitest';

// ─── Mirror Step5OpEx subscriptionsByYear computation ──────────────────────

function subscriptionsByYear(opts: {
  subscriptions: { monthlyBudget: number; isActive: boolean }[];
  defaultOpExIncreasePct: number;
}): { y1: number; y2: number; y3: number } {
  const activeSubs = opts.subscriptions.filter(v => v.isActive);
  const y1 = activeSubs.reduce((sum, v) => sum + (v.monthlyBudget || 0) * 12, 0);
  const growthFactor = 1 + opts.defaultOpExIncreasePct / 100;
  return {
    y1,
    y2: y1 * growthFactor,
    y3: y1 * Math.pow(growthFactor, 2),
  };
}

// ─── Mirror Step5OpEx BudgetFramework.calculateYearBudget ──────────────────

function calculateYearBudget(opts: {
  year: 1 | 2 | 3;
  revenue: number;
  cogs: number;
  year1TeamCosts: number;
  netProfitPct: number;
  subs: { y1: number; y2: number; y3: number };
}) {
  const { year, revenue, cogs, year1TeamCosts, netProfitPct, subs } = opts;
  const grossProfit = revenue - cogs;
  const teamCosts = year === 1
    ? year1TeamCosts
    : year === 2
      ? Math.round(year1TeamCosts * 1.03)
      : Math.round(year1TeamCosts * 1.03 * 1.03);
  const subscriptions = year === 1 ? subs.y1 : year === 2 ? subs.y2 : subs.y3;
  const targetProfit = revenue * (netProfitPct / 100);
  const availableOpEx = grossProfit - teamCosts - subscriptions - targetProfit;
  return { revenue, cogs, grossProfit, teamCosts, subscriptions, targetProfit, availableOpEx };
}

describe('Phase 57 T10 — subscriptionsByYear parameterized growth', () => {
  it('y1 = Σ(active vendor monthly × 12); inactive vendors excluded', () => {
    const result = subscriptionsByYear({
      subscriptions: [
        { monthlyBudget: 100, isActive: true },
        { monthlyBudget: 200, isActive: true },
        { monthlyBudget: 999, isActive: false }, // excluded
      ],
      defaultOpExIncreasePct: 3,
    });
    expect(result.y1).toBe(3600);
  });

  it('honors operator-overridden defaultOpExIncreasePct = 5', () => {
    const result = subscriptionsByYear({
      subscriptions: [{ monthlyBudget: 1_000, isActive: true }],
      defaultOpExIncreasePct: 5,
    });
    // y1 = 12_000; y2 = 12_000 × 1.05 = 12_600; y3 = 12_000 × 1.05² = 13_230.
    expect(result.y1).toBe(12_000);
    expect(result.y2).toBeCloseTo(12_600, 5);
    expect(result.y3).toBeCloseTo(13_230, 5);
  });

  it('honors default 3% when operator has not overridden', () => {
    const result = subscriptionsByYear({
      subscriptions: [{ monthlyBudget: 1_000, isActive: true }],
      defaultOpExIncreasePct: 3,
    });
    // y1 = 12_000; y2 = 12_000 × 1.03 = 12_360; y3 = 12_000 × 1.03² = 12_730.8.
    expect(result.y1).toBe(12_000);
    expect(result.y2).toBeCloseTo(12_360, 5);
    expect(result.y3).toBeCloseTo(12_730.8, 5);
  });

  it('returns all-zero when state.subscriptions is empty (legacy forecasts)', () => {
    const result = subscriptionsByYear({
      subscriptions: [],
      defaultOpExIncreasePct: 3,
    });
    expect(result).toEqual({ y1: 0, y2: 0, y3: 0 });
  });

  it('returns all-zero when all vendors are inactive', () => {
    const result = subscriptionsByYear({
      subscriptions: [
        { monthlyBudget: 500, isActive: false },
        { monthlyBudget: 1_000, isActive: false },
      ],
      defaultOpExIncreasePct: 3,
    });
    expect(result).toEqual({ y1: 0, y2: 0, y3: 0 });
  });
});

describe('Phase 57 T10 — BudgetFramework calculateYearBudget', () => {
  const baseSubs = subscriptionsByYear({
    subscriptions: [{ monthlyBudget: 1_000, isActive: true }],
    defaultOpExIncreasePct: 3,
  });
  const noSubs = subscriptionsByYear({ subscriptions: [], defaultOpExIncreasePct: 3 });

  it('Y1 availableOpEx subtracts subscriptions', () => {
    // Revenue 1M, COGS 400k, GP 600k, team 250k, subs 12k, target 15% = 150k.
    // availableOpEx = 600 - 250 - 12 - 150 = 188k.
    const y1 = calculateYearBudget({
      year: 1, revenue: 1_000_000, cogs: 400_000, year1TeamCosts: 250_000,
      netProfitPct: 15, subs: baseSubs,
    });
    expect(y1.subscriptions).toBe(12_000);
    expect(y1.availableOpEx).toBe(188_000);
  });

  it('legacy forecast (no subs) availableOpEx unchanged from pre-Phase-57', () => {
    // Same params but subs = 0 → availableOpEx should be 600 - 250 - 0 - 150 = 200k.
    const y1 = calculateYearBudget({
      year: 1, revenue: 1_000_000, cogs: 400_000, year1TeamCosts: 250_000,
      netProfitPct: 15, subs: noSubs,
    });
    expect(y1.subscriptions).toBe(0);
    expect(y1.availableOpEx).toBe(200_000);
  });

  it('Y2 / Y3 use grown subscriptions, NOT hard-coded 1.03', () => {
    // Force a 5% override and check y2/y3 follow.
    const subs = subscriptionsByYear({
      subscriptions: [{ monthlyBudget: 1_000, isActive: true }],
      defaultOpExIncreasePct: 5,
    });
    const y2 = calculateYearBudget({
      year: 2, revenue: 1_000_000, cogs: 400_000, year1TeamCosts: 250_000,
      netProfitPct: 15, subs,
    });
    expect(y2.subscriptions).toBeCloseTo(12_600, 5);

    const y3 = calculateYearBudget({
      year: 3, revenue: 1_000_000, cogs: 400_000, year1TeamCosts: 250_000,
      netProfitPct: 15, subs,
    });
    expect(y3.subscriptions).toBeCloseTo(13_230, 5);
  });

  it('availableOpEx decreases by exactly Σ(subs) vs no-subs baseline', () => {
    const baseline = calculateYearBudget({
      year: 1, revenue: 1_000_000, cogs: 400_000, year1TeamCosts: 250_000,
      netProfitPct: 15, subs: noSubs,
    });
    const withSubs = calculateYearBudget({
      year: 1, revenue: 1_000_000, cogs: 400_000, year1TeamCosts: 250_000,
      netProfitPct: 15, subs: baseSubs,
    });
    expect(baseline.availableOpEx - withSubs.availableOpEx).toBe(baseSubs.y1);
  });
});

// ─── Mirror BudgetTracker availableForExpenses formula ─────────────────────

function budgetTrackerAvailable(opts: {
  revenue: number;
  cogs: number;
  teamCosts: number;
  subscriptions: number;
  targetProfit: number;
}): number {
  return opts.revenue - opts.cogs - opts.teamCosts - opts.subscriptions - opts.targetProfit;
}

describe('Phase 57 T10 — BudgetTracker parity (R5)', () => {
  it('availableForExpenses subtracts subscriptions identically to BudgetFramework', () => {
    const subs = 12_000;
    // BudgetFramework's availableOpEx (subscriptions inside grossProfit deduction).
    const fwGP = 1_000_000 - 400_000;
    const fwAvailable = fwGP - 250_000 - subs - 150_000;
    // BudgetTracker's availableForExpenses (subscriptions inside revenue deduction).
    const trAvailable = budgetTrackerAvailable({
      revenue: 1_000_000, cogs: 400_000, teamCosts: 250_000,
      subscriptions: subs, targetProfit: 150_000,
    });
    // Algebraically identical: revenue − cogs − team − subs − target
    //                       = (revenue − cogs) − team − subs − target
    //                       = grossProfit − team − subs − target.
    expect(trAvailable).toBe(fwAvailable);
  });

  it('legacy forecast: subscriptions = 0 → availableForExpenses unchanged from pre-Phase-57', () => {
    const trAvailable = budgetTrackerAvailable({
      revenue: 1_000_000, cogs: 400_000, teamCosts: 250_000,
      subscriptions: 0, targetProfit: 150_000,
    });
    expect(trAvailable).toBe(200_000);
  });
});
