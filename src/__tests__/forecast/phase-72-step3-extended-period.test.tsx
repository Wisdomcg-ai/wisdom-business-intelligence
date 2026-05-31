/**
 * Phase 72-02 — Step 3 Extended-Period Bug — Y1 Month Range Honors Plan Period
 *
 * Regression tests locking the "wizard-blind-to-plan-period" fix for Step 3.
 *
 * Root cause (see 72-DIAGNOSIS.md): Step3RevenueCOGS.tsx hardcoded a 12-month
 * window starting at `fiscalYear - 1` and locked `currentYTD.months_count`
 * actuals against that window — without consulting `is_extended_period`,
 * `plan_start_date`, `year1_end_date`, or `year1_months`. For Armstrong on
 * 2026-05-31 the wizard rendered 3 editable months instead of 13.
 *
 * Tests:
 *   1. Util — Armstrong (extended Y1=13mo, plan_start=2026-06-01) → 13 month keys.
 *   2. Util — Standard non-extended FY26 → 12 keys (no regression).
 *   3. Util — Edge: extended starting at FY boundary (plan_start_date = FY start) → no remainder.
 *   4. Util — Edge: extended >12 ≤15 months (Phase 14 max for AU FY) → correct keys.
 *   5. Component — Armstrong scenario: Step 3 renders 13 month columns.
 *
 * The component test uses the real-hook test harness pattern (Step3Harness) so
 * the entire data path (planPeriod slice → util → monthKeys → render) is
 * exercised end-to-end.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import { Step3RevenueCOGS } from '@/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS';
import {
  getPlanY1MonthKeys,
  type PlanPeriod,
} from '@/lib/utils/plan-period';

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Pure-function util tests
// ────────────────────────────────────────────────────────────────────────────

describe('getPlanY1MonthKeys — plan-period-aware month range', () => {
  it('Test 1: Armstrong — extended Y1=13mo, plan_start_date=2026-06-01 → 13 keys Jun 2026 .. Jun 2027', () => {
    // Armstrong's actual plan-period row.
    const planPeriod: PlanPeriod = {
      isExtendedPeriod: true,
      year1Months: 13,
      planStartDate: '2026-06-01',
      year1EndDate: '2027-06-30',
    };
    // fiscalYear is the AU FY containing plan_start_date — Jun 2026 falls in FY26.
    const keys = getPlanY1MonthKeys(2026, planPeriod, 7);

    expect(keys.length).toBe(13);
    expect(keys[0]).toBe('2026-06');
    expect(keys[keys.length - 1]).toBe('2027-06');
    // Spot-check middle month
    expect(keys).toContain('2026-12');
    expect(keys).toContain('2027-01');
  });

  it('Test 2: Standard non-extended FY26 → 12 keys (no regression — falls through to fiscal-year range)', () => {
    // Either null planPeriod or non-extended planPeriod should yield 12 FY-aligned keys.
    const keys = getPlanY1MonthKeys(2026, null, 7);

    expect(keys.length).toBe(12);
    expect(keys[0]).toBe('2025-07'); // FY26 starts July 2025
    expect(keys[11]).toBe('2026-06');

    // Same result for non-extended planPeriod
    const nonExtended: PlanPeriod = {
      isExtendedPeriod: false,
      year1Months: 12,
      planStartDate: '2025-07-01',
      year1EndDate: '2026-06-30',
    };
    const keys2 = getPlanY1MonthKeys(2026, nonExtended, 7);
    expect(keys2.length).toBe(12);
    expect(keys2[0]).toBe('2025-07');
    expect(keys2[11]).toBe('2026-06');
  });

  it('Test 3: Edge — extended plan_start_date sitting at FY start (no remainder, just 12 months)', () => {
    // is_extended_period=true but plan_start_date lands on the FY boundary
    // and year1_months=12. Should produce exactly 12 keys matching the FY.
    const planPeriod: PlanPeriod = {
      isExtendedPeriod: true,
      year1Months: 12,
      planStartDate: '2025-07-01',
      year1EndDate: '2026-06-30',
    };
    const keys = getPlanY1MonthKeys(2026, planPeriod, 7);
    expect(keys.length).toBe(12);
    expect(keys[0]).toBe('2025-07');
    expect(keys[11]).toBe('2026-06');
  });

  it('Test 4: Edge — extended 15-month plan (Phase 14 max for AU FY): plan_start=2026-04-01, year1=15mo → 15 keys', () => {
    // Phase 14 allows up to 15-month extended period (Apr planning season).
    const planPeriod: PlanPeriod = {
      isExtendedPeriod: true,
      year1Months: 15,
      planStartDate: '2026-04-01',
      year1EndDate: '2027-06-30',
    };
    // FY26 contains plan_start 2026-04-01 (FY26 = Jul 2025 - Jun 2026).
    const keys = getPlanY1MonthKeys(2026, planPeriod, 7);

    expect(keys.length).toBe(15);
    expect(keys[0]).toBe('2026-04');
    expect(keys[keys.length - 1]).toBe('2027-06');
    // Boundary spot-check
    expect(keys).toContain('2026-06');
    expect(keys).toContain('2026-07');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Component-level integration test — Step 3 renders 13 month columns for Armstrong
// ────────────────────────────────────────────────────────────────────────────

interface HarnessProps {
  businessId: string;
  planPeriod: PlanPeriod | null;
}

/**
 * Real-hook test harness — seeds a revenue line + plumbs planPeriod into the
 * wizard state via actions.setPlanPeriod (the new action being added in 72-02).
 */
function Step3Harness({ businessId, planPeriod }: HarnessProps) {
  const wizard = useForecastWizard(2025, businessId); // FY26 = year-start 2025
  const [seeded, setSeeded] = React.useState(false);

  React.useEffect(() => {
    if (seeded) return;
    if (wizard.state.revenueLines.length === 0) {
      // Seed a single revenue line — enough for the table body to render and
      // emit month-column <td> cells we can count.
      wizard.actions.setRevenueLines([
        {
          id: 'rev-1',
          name: 'Sales Revenue',
          year1Monthly: {},
        },
      ]);
    }
    wizard.actions.setPlanPeriod(planPeriod);
    setSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!seeded || wizard.state.revenueLines.length === 0) return null;
  // Wait for planPeriod to land in state before rendering.
  if (wizard.state.planPeriod !== planPeriod) return null;
  return (
    <Step3RevenueCOGS
      state={wizard.state}
      actions={wizard.actions}
      fiscalYear={2026}
    />
  );
}

describe('Step3RevenueCOGS — extended-period plan period rendering', () => {
  it('Test 5: Armstrong scenario — extended Y1=13mo renders 13 month columns in the monthly view', async () => {
    const planPeriod: PlanPeriod = {
      isExtendedPeriod: true,
      year1Months: 13,
      planStartDate: '2026-06-01',
      year1EndDate: '2027-06-30',
    };

    render(<Step3Harness businessId="test-72-02-armstrong" planPeriod={planPeriod} />);

    // The Step 3 monthly view exposes a <button> to switch to monthly mode.
    // Find and click it to expose the per-month input grid.
    const monthlyButton = await screen.findByRole('button', { name: /monthly/i });
    monthlyButton.click();

    // After switching, the monthly grid header renders one <th> per month-key.
    // For Armstrong (extended Y1=13mo, plan_start=2026-06-01), we expect 13
    // month columns whose calendar months span Jun 2026 .. Jun 2027.
    //
    // The table has 2 leading columns (Line Item, % Split) + N month columns
    // + 2 trailing columns (Total, action). We assert by counting input cells
    // in the data row — `Sales Revenue` line has one editable input per month.
    const row = await screen.findByText(/Sales Revenue/i);
    expect(row).toBeTruthy();

    // Locate all numeric inputs in the monthly table body (one per editable cell).
    // For our seeded line with no actuals lock and extended 13-mo plan,
    // every cell is editable → 13 inputs.
    const inputs = document.querySelectorAll('input[type="number"][inputmode="decimal"]');
    expect(inputs.length).toBe(13);
  });
});
