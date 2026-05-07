/**
 * Phase 57 T07 (B2) — Double-count prevention via accountCode exclusion
 *
 * Verifies that the OpEx accumulator skips lines whose `accountCode` appears
 * in any active subscription's `accountCodes`. This prevents the pre-Phase-57
 * double-count where the same Xero software account contributed to BOTH
 * `opex` (via Step 6 OpEx) AND `subscription_budgets` (via Step 5).
 *
 * Critical: per plan-check Blocker 2, NO name fallback. Lines with
 * `accountCode === undefined` (legacy v10 drafts) fall through and contribute
 * to opex — the T11 "Refresh from Xero" banner is the operator-facing
 * mitigation. This test locks that documented behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import type { OpExLine, VendorBudget } from '@/app/finances/forecast/components/wizard-v4/types';

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

describe('Phase 57 T07 — double-count prevention', () => {
  it('OpEx skips lines whose accountCode is in coveredAccountCodes', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'phase57-doublecount-covered'),
    );

    act(() => {
      result.current.actions.setSubscriptions([
        makeVendor({ vendorKey: 'sw', monthlyBudget: 200, accountCodes: ['5100'] }),
      ]);
      // Covered: accountCode 5100 → 200/mo × 12 = 2400/yr OpEx contribution should be SKIPPED.
      result.current.actions.addOpExLine({
        name: 'Software',
        priorYearAnnual: 2400,
        costBehavior: 'fixed',
        monthlyAmount: 200,
        accountCode: '5100',
      } as Omit<OpExLine, 'id'>);
      // Not covered: accountCode 5200 → 100/mo × 12 = 1200/yr should contribute to opex.
      result.current.actions.addOpExLine({
        name: 'Marketing',
        priorYearAnnual: 1200,
        costBehavior: 'fixed',
        monthlyAmount: 100,
        accountCode: '5200',
      } as Omit<OpExLine, 'id'>);
    });

    const y1 = result.current.summary.year1;
    // OpEx ONLY counts the Marketing line — Software is excluded because its
    // accountCode is covered by Step 5 Subscriptions.
    expect(y1.opex).toBe(1200);
    // Subscriptions = 200 × 12 = 2400.
    expect(y1.subscriptions).toBe(2400);
    // Total spend on the two accounts = 1200 + 2400 = 3600 (NOT 1200 + 2400 + 2400 = 6000 double-count).
  });

  it('Falls through to no-exclusion when OpExLine.accountCode is undefined (legacy R6)', () => {
    // Documented behavior per PLAN.md risk register R6: legacy v10 drafts
    // where opexLines lack `accountCode` will continue to double-count
    // software spend until the operator clicks the T11 "Refresh from Xero"
    // banner. This test locks that contract.
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'phase57-doublecount-legacy'),
    );

    act(() => {
      result.current.actions.setSubscriptions([
        makeVendor({ vendorKey: 'sw', monthlyBudget: 200, accountCodes: ['5100'] }),
      ]);
      // Legacy line — no accountCode. Falls through to opex contribution.
      result.current.actions.addOpExLine({
        name: 'Software',
        priorYearAnnual: 2400,
        costBehavior: 'fixed',
        monthlyAmount: 200,
        // accountCode intentionally undefined (legacy)
      } as Omit<OpExLine, 'id'>);
    });

    const y1 = result.current.summary.year1;
    // Legacy line contributes its full 2400 to opex (no exclusion possible).
    expect(y1.opex).toBe(2400);
    // Subscriptions also includes its 2400.
    expect(y1.subscriptions).toBe(2400);
    // Bottom-line: 4800 — DOUBLE-COUNT until the operator refreshes from Xero.
    // This is the documented R6 trade-off.
  });

  it('Falls through to no-exclusion when subscription has empty accountCodes', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'phase57-doublecount-empty-codes'),
    );

    act(() => {
      result.current.actions.setSubscriptions([
        makeVendor({ vendorKey: 'sw', monthlyBudget: 200, accountCodes: [] }),
      ]);
      result.current.actions.addOpExLine({
        name: 'Software',
        priorYearAnnual: 2400,
        costBehavior: 'fixed',
        monthlyAmount: 200,
        accountCode: '5100',
      } as Omit<OpExLine, 'id'>);
    });

    // No accountCodes on the vendor → coveredAccountCodes is empty → no exclusion.
    expect(result.current.summary.year1.opex).toBe(2400);
    expect(result.current.summary.year1.subscriptions).toBe(2400);
  });

  it('Inactive subscriptions do NOT contribute to coveredAccountCodes', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'phase57-doublecount-inactive'),
    );

    act(() => {
      result.current.actions.setSubscriptions([
        makeVendor({ vendorKey: 'sw', monthlyBudget: 200, isActive: false, accountCodes: ['5100'] }),
      ]);
      result.current.actions.addOpExLine({
        name: 'Software',
        priorYearAnnual: 2400,
        costBehavior: 'fixed',
        monthlyAmount: 200,
        accountCode: '5100',
      } as Omit<OpExLine, 'id'>);
    });

    // Inactive vendor → not in activeSubscriptions → coveredAccountCodes empty → line contributes.
    expect(result.current.summary.year1.opex).toBe(2400);
    expect(result.current.summary.year1.subscriptions).toBe(0);
  });

  it('accountCode exclusion is whitespace-trimmed', () => {
    // Defense-in-depth: vendor accountCodes from DB sometimes have stray
    // whitespace. The rollup trims when building coveredAccountCodes, so a
    // vendor accountCode of " 5100 " should still match an OpEx line with
    // accountCode "5100".
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'phase57-doublecount-trim'),
    );

    act(() => {
      result.current.actions.setSubscriptions([
        makeVendor({ vendorKey: 'sw', monthlyBudget: 200, accountCodes: ['  5100  '] }),
      ]);
      result.current.actions.addOpExLine({
        name: 'Software',
        priorYearAnnual: 2400,
        costBehavior: 'fixed',
        monthlyAmount: 200,
        accountCode: '5100',
      } as Omit<OpExLine, 'id'>);
    });

    expect(result.current.summary.year1.opex).toBe(0); // Excluded.
    expect(result.current.summary.year1.subscriptions).toBe(2400);
  });
});
