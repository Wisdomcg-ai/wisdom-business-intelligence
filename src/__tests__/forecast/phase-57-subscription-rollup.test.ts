/**
 * Phase 57 T07 (B2) — Subscription rollup math
 *
 * Verifies that the wizard summary's `subscriptions` field is computed as
 *   Y1 = Σ(active vendor monthlyBudget × 12)
 *   YN = Y1 × (1 + state.defaultOpExIncreasePct / 100)^(N-1)
 *
 * AND that `subscriptions` is subtracted from `netProfit`.
 *
 * Critical: the growth factor is parameterized by `state.defaultOpExIncreasePct`
 * — these tests run with BOTH 3% and 5% to catch a hard-coded 1.03.
 *
 * Critical: `state.subscriptions === []` must produce `summary.year1.subscriptions === 0`
 * and leave the rest of the rollup identical to pre-Phase-57. This is the
 * legacy-forecast invariant that makes T07 safe to ship in B2 before B3 swaps
 * the wizard step bindings.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import type { VendorBudget } from '@/app/finances/forecast/components/wizard-v4/types';

const FY_START_YEAR = 2025;

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

function makeVendor(overrides: Partial<VendorBudget> & Pick<VendorBudget, 'vendorKey'>): VendorBudget {
  return {
    vendorName: overrides.vendorName ?? overrides.vendorKey,
    frequency: 'monthly',
    monthlyBudget: 0,
    isActive: true,
    accountCodes: [],
    ...overrides,
  };
}

describe('Phase 57 T07 — subscription rollup', () => {
  it('Y1 subscriptions = Σ(active vendor monthly × 12) — inactive vendors excluded', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'phase57-rollup-y1'),
    );

    act(() => {
      result.current.actions.setSubscriptions([
        makeVendor({ vendorKey: 'a', monthlyBudget: 100, isActive: true,  accountCodes: ['5100'] }),
        makeVendor({ vendorKey: 'b', monthlyBudget: 200, isActive: true,  accountCodes: ['5200'] }),
        makeVendor({ vendorKey: 'c', monthlyBudget: 50,  isActive: false, accountCodes: ['5300'] }),
      ]);
    });

    // (100 + 200) × 12 = 3600. Vendor c excluded (isActive=false).
    expect(result.current.summary.year1.subscriptions).toBe(3600);
  });

  it('Y2 subscriptions = Y1 × (1 + state.defaultOpExIncreasePct / 100) — at default 3%', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'phase57-rollup-y2-default'),
    );

    act(() => {
      // defaultOpExIncreasePct defaults to 3 in initial state.
      result.current.actions.setSubscriptions([
        makeVendor({ vendorKey: 'a', monthlyBudget: 300, isActive: true }),
      ]);
    });

    // Y1 = 300 × 12 = 3600. Y2 = 3600 × 1.03 = 3708.
    expect(result.current.summary.year1.subscriptions).toBe(3600);
    expect(result.current.summary.year2?.subscriptions).toBe(3708);
  });

  it('Y2 subscriptions tracks state.defaultOpExIncreasePct override (5%) — no hard-coded 1.03', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'phase57-rollup-y2-override'),
    );

    act(() => {
      result.current.actions.setDefaultOpExIncreasePct(5);
      result.current.actions.setSubscriptions([
        makeVendor({ vendorKey: 'a', monthlyBudget: 300, isActive: true }),
      ]);
    });

    // Y1 = 3600. Y2 with pct=5 = 3600 × 1.05 = 3780. (NOT 3708 from hard-coded 1.03.)
    expect(result.current.summary.year1.subscriptions).toBe(3600);
    expect(result.current.summary.year2?.subscriptions).toBe(3780);
  });

  it('Y3 subscriptions = Y1 × (1 + pct/100)^2 — verified at 3% and 5%', () => {
    const { result: r3 } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'phase57-rollup-y3-3pct'),
    );
    act(() => {
      r3.current.actions.setSubscriptions([
        makeVendor({ vendorKey: 'a', monthlyBudget: 300, isActive: true }),
      ]);
    });
    // 3600 × 1.03^2 = 3818.88 → rounded to 3819
    expect(r3.current.summary.year3?.subscriptions).toBe(3819);

    const { result: r5 } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'phase57-rollup-y3-5pct'),
    );
    act(() => {
      r5.current.actions.setDefaultOpExIncreasePct(5);
      r5.current.actions.setSubscriptions([
        makeVendor({ vendorKey: 'a', monthlyBudget: 300, isActive: true }),
      ]);
    });
    // 3600 × 1.05^2 = 3969 (exact)
    expect(r5.current.summary.year3?.subscriptions).toBe(3969);
  });

  it('subscriptions field is rounded (integer)', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'phase57-rollup-rounding'),
    );

    act(() => {
      // monthlyBudget that produces a non-integer Y1 sum when × 12
      result.current.actions.setSubscriptions([
        makeVendor({ vendorKey: 'a', monthlyBudget: 100.7, isActive: true }),
      ]);
    });

    const value = result.current.summary.year1.subscriptions;
    expect(Number.isInteger(value)).toBe(true);
  });

  it('netProfit subtracts subscriptions', () => {
    // Pin the math: with no revenue/cogs/team/opex, netProfit should be the
    // negative of subscriptions (modulo Xero other_income/expense which are
    // 0 in a fresh forecast).
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'phase57-rollup-netprofit'),
    );

    act(() => {
      result.current.actions.setSubscriptions([
        makeVendor({ vendorKey: 'a', monthlyBudget: 500, isActive: true }),
      ]);
    });

    const y1 = result.current.summary.year1;
    expect(y1.subscriptions).toBe(6000); // 500 × 12

    // netProfit = grossProfit − teamCosts − subscriptions − opex − ...
    //           = 0 − 0 − 6000 − 0 − ... = −6000
    expect(y1.netProfit).toBe(-6000);
  });

  it('empty subscriptions produces 0 — no crash, no behavior change (LEGACY INVARIANT)', () => {
    // CRITICAL: This test locks the legacy-forecast invariant. Existing
    // forecasts loaded from localStorage have state.subscriptions === [];
    // the rollup MUST produce subscriptions === 0 and leave netProfit
    // identical to pre-Phase-57. This is what makes B2 safe to ship before
    // B3 swaps the wizard step bindings.
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'phase57-rollup-empty'),
    );

    // Don't call setSubscriptions at all — state.subscriptions stays as the
    // initial [] (post-B1 foundation).
    const y1 = result.current.summary.year1;
    expect(y1.subscriptions).toBe(0);
    expect(y1.netProfit).toBe(0); // No revenue, no cost, no subs → 0
  });

  it('inactive subscriptions do NOT contribute to subscriptions total', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'phase57-rollup-inactive'),
    );

    act(() => {
      result.current.actions.setSubscriptions([
        makeVendor({ vendorKey: 'a', monthlyBudget: 100, isActive: false }),
        makeVendor({ vendorKey: 'b', monthlyBudget: 100, isActive: false }),
      ]);
    });

    expect(result.current.summary.year1.subscriptions).toBe(0);
  });
});
