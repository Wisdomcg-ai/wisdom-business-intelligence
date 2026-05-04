/**
 * Phase 51-00 — Shared helpers (TDD RED → GREEN)
 *
 * Tests for two helpers that downstream Phase 51 plans (51-01, 51-03, 51-05)
 * all depend on:
 *   - useEditableValue: generalised pending-state hook (origin: PR #82)
 *   - getEffectiveSeasonality + getRevenueLineMonthlyDistribution:
 *     lockstep helpers for per-line seasonality + monthly distribution
 *
 * Math-neutral by construction: nothing in the production wizard imports these
 * helpers yet (51-01 / 51-03 wire them up).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useEditableValue,
} from '@/app/finances/forecast/components/wizard-v4/hooks/useEditableValue';
import {
  getEffectiveSeasonality,
  getRevenueLineMonthlyDistribution,
} from '@/app/finances/forecast/components/wizard-v4/utils/line-distribution';
import type { MonthlyData } from '@/app/finances/forecast/components/wizard-v4/types';

// ─── Test infra ────────────────────────────────────────────────────────────
beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

// July FY start, 12 month keys: 2025-07 .. 2026-06
const FY_START_YEAR = 2025;
function targetFYKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 12; i++) {
    const calMonth = ((7 - 1 + i) % 12) + 1;
    const year = calMonth >= 7 ? FY_START_YEAR : FY_START_YEAR + 1;
    keys.push(`${year}-${String(calMonth).padStart(2, '0')}`);
  }
  return keys;
}
function emptyMonthly(): MonthlyData {
  const out: MonthlyData = {};
  for (const k of targetFYKeys()) out[k] = 0;
  return out;
}

// Synthesise a ChangeEvent / KeyboardEvent shape sufficient for the hook.
function changeEvent(value: string) {
  return { target: { value } } as unknown as React.ChangeEvent<HTMLInputElement>;
}
function keyEvent(key: string, blurFn = vi.fn()) {
  return {
    key,
    target: { blur: blurFn } as unknown as HTMLInputElement,
  } as unknown as React.KeyboardEvent<HTMLInputElement>;
}

// ─── useEditableValue ──────────────────────────────────────────────────────
describe('useEditableValue', () => {
  it('A — display equals stringified committedValue when no edit in progress', () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useEditableValue(42, commit));
    expect(result.current.display).toBe('42');
    expect(result.current.isPending).toBe(false);
  });

  it('B — onChange updates display to typed string and sets isPending=true (no commit yet)', () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useEditableValue(42, commit));
    act(() => {
      result.current.onChange(changeEvent('123'));
    });
    expect(result.current.display).toBe('123');
    expect(result.current.isPending).toBe(true);
    expect(commit).not.toHaveBeenCalled();
  });

  it('C — onBlur parses display, calls commit with parsed number, clears pending state', () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useEditableValue(42, commit));
    act(() => {
      result.current.onChange(changeEvent('123'));
    });
    act(() => {
      result.current.onBlur();
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(123);
    expect(result.current.isPending).toBe(false);
    // After blur, display reverts to formatted committedValue (still 42 because
    // the test commit is a vi.fn() — the parent didn't actually update state).
    expect(result.current.display).toBe('42');
  });

  it('D — onKeyDown with Enter triggers blur on the input element', () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useEditableValue(42, commit));
    const blur = vi.fn();
    act(() => {
      result.current.onKeyDown(keyEvent('Enter', blur));
    });
    expect(blur).toHaveBeenCalledTimes(1);
    // Non-Enter keys do nothing
    const blur2 = vi.fn();
    act(() => {
      result.current.onKeyDown(keyEvent('a', blur2));
    });
    expect(blur2).not.toHaveBeenCalled();
  });
});

// ─── line-distribution helpers ─────────────────────────────────────────────
describe('line-distribution helpers', () => {
  describe('getEffectiveSeasonality', () => {
    it('E — returns businessSeasonality when line.seasonalityPattern is undefined', () => {
      const business = [10, 5, 5, 10, 10, 10, 5, 5, 10, 10, 10, 10];
      const result = getEffectiveSeasonality({}, business);
      expect(result).toEqual(business);
    });

    it('F — returns line pattern (NOT business) when line.seasonalityPattern is set', () => {
      const business = [10, 5, 5, 10, 10, 10, 5, 5, 10, 10, 10, 10];
      const linePattern = [50, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0];
      const result = getEffectiveSeasonality({ seasonalityPattern: linePattern }, business);
      expect(result).toEqual(linePattern);
      expect(result).not.toEqual(business);
    });

    it('G — returns Array(12).fill(8.33) fallback when both undefined', () => {
      const result = getEffectiveSeasonality({}, undefined);
      expect(result).toHaveLength(12);
      result.forEach((v) => expect(v).toBeCloseTo(8.33, 2));
    });
  });

  describe('getRevenueLineMonthlyDistribution', () => {
    const monthKeys = targetFYKeys();
    const noActuals = (_k: string) => false;

    it('H — no actuals, even seasonality, annualTarget=120000 → each month ≈ 10000', () => {
      const line = { id: 'r1', year1Monthly: emptyMonthly() };
      const evenSeason = Array(12).fill(8.33);
      const out = getRevenueLineMonthlyDistribution(
        line,
        120000,
        evenSeason,
        monthKeys,
        noActuals,
      );
      const total = monthKeys.reduce((s, k) => s + (out[k] || 0), 0);
      // Even split → each month within ±2 of 10000
      monthKeys.forEach((k) => {
        expect(out[k]).toBeGreaterThanOrEqual(9998);
        expect(out[k]).toBeLessThanOrEqual(10002);
      });
      // Total within rounding tolerance of 120000
      expect(Math.abs(total - 120000)).toBeLessThanOrEqual(12);
    });

    it('I — first 3 months locked as actuals (sum=30000), annualTarget=120000 → first 3 unchanged, remaining 9 sum ≈ 90000', () => {
      const monthly: MonthlyData = emptyMonthly();
      monthly[monthKeys[0]] = 10000;
      monthly[monthKeys[1]] = 10000;
      monthly[monthKeys[2]] = 10000;
      const line = { id: 'r1', year1Monthly: monthly };
      const evenSeason = Array(12).fill(8.33);
      const lockedKeys = new Set([monthKeys[0], monthKeys[1], monthKeys[2]]);
      const isActual = (k: string) => lockedKeys.has(k);

      const out = getRevenueLineMonthlyDistribution(
        line,
        120000,
        evenSeason,
        monthKeys,
        isActual,
      );

      // Locked months unchanged
      expect(out[monthKeys[0]]).toBe(10000);
      expect(out[monthKeys[1]]).toBe(10000);
      expect(out[monthKeys[2]]).toBe(10000);
      // Remaining 9 months sum to ~90000 (within rounding)
      let remaining = 0;
      for (let i = 3; i < 12; i++) remaining += out[monthKeys[i]] || 0;
      expect(Math.abs(remaining - 90000)).toBeLessThanOrEqual(9);
    });

    it('J — line has its own seasonalityPattern (50% in month 0, ~4.5% × 11) → month 0 ≈ 50% of annualTarget when no actuals', () => {
      const linePattern = [50, ...Array(11).fill((100 - 50) / 11)]; // 50, then 11 × ~4.545
      const line = { id: 'r1', year1Monthly: emptyMonthly(), seasonalityPattern: linePattern };
      const businessSeason = Array(12).fill(8.33); // would give ~10000 each month
      const out = getRevenueLineMonthlyDistribution(
        line,
        120000,
        businessSeason,
        monthKeys,
        noActuals,
      );
      // Month 0 should be ~50% of 120000 = 60000 (NOT 10000 like business seasonality)
      expect(out[monthKeys[0]]).toBeGreaterThanOrEqual(59000);
      expect(out[monthKeys[0]]).toBeLessThanOrEqual(61000);
      // Each remaining month should be ~4.545% of 120000 ≈ 5454
      for (let i = 1; i < 12; i++) {
        expect(out[monthKeys[i]]).toBeGreaterThanOrEqual(5300);
        expect(out[monthKeys[i]]).toBeLessThanOrEqual(5600);
      }
    });
  });
});
