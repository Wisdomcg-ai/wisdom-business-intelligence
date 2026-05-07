/**
 * Regression: sub-1% percentages must NOT be normalized
 *
 * Reverts the dual-unit guard from PR #126 (Phase 56 P1a — COGS-001 /
 * Team-Commission-001) which assumed `percentOfRevenue <= 1` meant the
 * value was a 0-1 decimal and multiplied by 100. That guard misclassified
 * legitimate sub-1% lines (e.g., a COGS line at 0.5% of revenue) and
 * inflated their cost contribution 100×.
 *
 * Confirmed real-world impact (JDS forecast investigation,
 * `.planning/phases/57-subscriptions-flow-restructure/jds-wizard-state-corruption-investigation.md`):
 * 28 of 29 JDS COGS lines were below 1%, the wizard rolled COGS up to
 * $76.15M instead of the correct $6.65M, and Y1 net profit displayed as
 * −$71M instead of +$336K.
 *
 * Contract locked here: the wizard rollup trusts the input format. All
 * `percentOfRevenue` values are stored on the 0-100 scale. If a real
 * dual-unit hazard ever appears, fix it at the input boundary, not in the
 * rollup.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import {
  generateMonthKeys,
  type COGSLine,
  type Commission,
  type RevenueLine,
  type TeamMember,
} from '@/app/finances/forecast/components/wizard-v4/types';

const FY_START_YEAR = 2025;

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

/** Build a revenue line whose Y1 monthly entries sum to `annual`. */
function makeRevenueLine(id: string, name: string, annual: number): RevenueLine {
  const monthKeys = generateMonthKeys(FY_START_YEAR);
  const per = annual / 12;
  const year1Monthly: { [key: string]: number } = {};
  for (const k of monthKeys) year1Monthly[k] = per;
  return { id, name, year1Monthly };
}

describe('Wizard rollup — sub-1% percentages (revert of #126 normalizedPct guard)', () => {
  it('COGS line at 0.5% of revenue contributes $5,000 on $1M revenue (NOT $500,000)', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'wizard-pct-no-norm-cogs'),
    );

    const revLine = makeRevenueLine('rev-1', 'Sales', 1_000_000);
    const cogsLine: COGSLine = {
      id: 'cogs-1',
      name: 'Materials',
      costBehavior: 'variable',
      percentOfRevenue: 0.5, // half a percent — legitimate, NOT a 0-1 decimal
    };

    act(() => {
      result.current.actions.setRevenueLines([revLine]);
      result.current.actions.setCOGSLines([cogsLine]);
    });

    const y1 = result.current.summary.year1;
    expect(y1.revenue).toBe(1_000_000);
    // 1,000,000 × 0.5 / 100 = 5,000. Pre-revert this would have been
    // 1,000,000 × (0.5 × 100) / 100 = 500,000.
    expect(y1.cogs).toBe(5_000);
  });

  it('Multiple sub-1% COGS lines aggregate correctly (JDS-style: 28 lines under 1%)', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'wizard-pct-no-norm-cogs-many'),
    );

    const revLine = makeRevenueLine('rev-1', 'Sales', 1_000_000);
    // Four sub-1% lines summing to 1.6% → $16,000 on $1M.
    // Pre-revert (with guard): each line gets *100, so total = 1,600,000.
    const cogsLines: COGSLine[] = [
      { id: 'c1', name: 'L1', costBehavior: 'variable', percentOfRevenue: 0.5 },
      { id: 'c2', name: 'L2', costBehavior: 'variable', percentOfRevenue: 0.3 },
      { id: 'c3', name: 'L3', costBehavior: 'variable', percentOfRevenue: 0.4 },
      { id: 'c4', name: 'L4', costBehavior: 'variable', percentOfRevenue: 0.4 },
    ];

    act(() => {
      result.current.actions.setRevenueLines([revLine]);
      result.current.actions.setCOGSLines(cogsLines);
    });

    expect(result.current.summary.year1.cogs).toBe(16_000);
  });

  it('COGS line at 30% of revenue still contributes $300,000 on $1M (above-1% path unchanged)', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'wizard-pct-no-norm-cogs-30'),
    );

    const revLine = makeRevenueLine('rev-1', 'Sales', 1_000_000);
    const cogsLine: COGSLine = {
      id: 'cogs-1',
      name: 'Materials',
      costBehavior: 'variable',
      percentOfRevenue: 30,
    };

    act(() => {
      result.current.actions.setRevenueLines([revLine]);
      result.current.actions.setCOGSLines([cogsLine]);
    });

    expect(result.current.summary.year1.cogs).toBe(300_000);
  });

  it('Commission at 0.3% of revenue contributes $3,000 on $1M revenue (NOT $300,000)', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'wizard-pct-no-norm-commission'),
    );

    const revLine = makeRevenueLine('rev-1', 'Sales', 1_000_000);

    // Salaried team member with $0 salary so teamCosts is driven solely by
    // the commission contribution (super defaults to 0% via wizard logic;
    // we keep currentSalary at 0 so any super calc nets to 0 too).
    const member: Omit<TeamMember, 'id' | 'newSalary' | 'superAmount'> = {
      name: 'Sales Rep',
      role: 'Sales',
      type: 'full-time',
      hoursPerWeek: 38,
      currentSalary: 0,
      increasePct: 0,
      isFromXero: false,
    };

    act(() => {
      result.current.actions.setRevenueLines([revLine]);
      result.current.actions.addTeamMember(member);
    });

    // Read back the generated team member id, then add the commission.
    const memberId = result.current.state.teamMembers[0]!.id;
    const commission: Omit<Commission, 'id'> = {
      teamMemberId: memberId,
      revenueLineId: 'rev-1',
      percentOfRevenue: 0.3, // 0.3% — legitimate, NOT a 0-1 decimal
      timing: 'monthly',
    };

    act(() => {
      result.current.actions.addCommission(commission);
    });

    const y1 = result.current.summary.year1;
    expect(y1.revenue).toBe(1_000_000);
    // 1,000,000 × 0.3 / 100 = 3,000. Pre-revert this would have been
    // 1,000,000 × (0.3 × 100) / 100 = 300,000.
    expect(y1.teamCosts).toBe(3_000);
  });

  it('Commission at 5% of revenue still contributes $50,000 on $1M (above-1% path unchanged)', () => {
    const { result } = renderHook(() =>
      useForecastWizard(FY_START_YEAR, 'wizard-pct-no-norm-commission-5'),
    );

    const revLine = makeRevenueLine('rev-1', 'Sales', 1_000_000);
    const member: Omit<TeamMember, 'id' | 'newSalary' | 'superAmount'> = {
      name: 'Sales Rep',
      role: 'Sales',
      type: 'full-time',
      hoursPerWeek: 38,
      currentSalary: 0,
      increasePct: 0,
      isFromXero: false,
    };

    act(() => {
      result.current.actions.setRevenueLines([revLine]);
      result.current.actions.addTeamMember(member);
    });

    const memberId = result.current.state.teamMembers[0]!.id;

    act(() => {
      result.current.actions.addCommission({
        teamMemberId: memberId,
        revenueLineId: 'rev-1',
        percentOfRevenue: 5,
        timing: 'monthly',
      });
    });

    expect(result.current.summary.year1.teamCosts).toBe(50_000);
  });
});
