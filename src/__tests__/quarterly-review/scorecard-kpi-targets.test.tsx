/**
 * The Scorecard reads a KPI's target from whichever column holds it.
 *
 * It read `year1_target || 0` alone. Precision keeps every target in
 * `target_value` with year1_target at its default 0, so its Scorecard showed ten
 * zeros — and SAVED zero as each KPI's target into the review's snapshot, the
 * history next quarter's Scorecard compares against. Found 25 Sep 2026.
 *
 * Rendered as the real component against Precision's rows exactly as stored,
 * because pinning a helper proves nothing about the screen that calls it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const db = vi.hoisted(() => ({ kpis: [] as any[] }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'coach-1' } } }) },
    from: (table: string) => {
      const b: any = {
        select: () => b,
        eq: () => b,
        order: () => b,
        maybeSingle: async () =>
          table === 'business_profiles' ? { data: { id: 'profile-1' }, error: null } : { data: null, error: null },
        then: (resolve: any) =>
          Promise.resolve({ data: table === 'business_kpis' ? db.kpis : [], error: null }).then(resolve),
      };
      return b;
    },
  }),
}));
vi.mock('@/hooks/useBusinessContext', () => ({
  useBusinessContext: () => ({ activeBusiness: { id: 'biz-1', ownerId: 'owner-1' } }),
}));

import { ScorecardReviewStep } from '@/app/quarterly-review/components/steps/ScorecardReviewStep';

/** Precision Electrical Group's active KPIs, as business_kpis holds them. */
const precision = [
  ['Monthly Revenue', '$', '0', '716667'],
  ['Gross Margin', '%', '0', '30'],
  ['Net Profit Margin', '%', '0', '9.5'],
  ['Debtor Days (DSO)', 'days', '0', '45'],
  ['Average Project Value', '$', '0', '46500'],
  ['Safety Incidents (LTI)', 'number', '0', '0'],
].map(([name, unit, year1_target, target_value], i) => ({
  id: `k${i}`,
  kpi_id: `kpi-${i}`,
  name,
  friendly_name: name,
  category: 'Operations',
  unit,
  year1_target,
  target_value,
  current_value: 0,
}));

const review: any = { id: 'r1', business_id: 'biz-1', quarter: 2, year: 2027, dashboard_snapshot: {} };

const lastSnapshot = (onUpdate: ReturnType<typeof vi.fn>) => onUpdate.mock.calls.at(-1)![0];

beforeEach(() => {
  cleanup();
  db.kpis = precision;
});

describe('Precision’s Scorecard shows the targets its coach set', () => {
  it('shows each target from whichever column holds it, in its own units', async () => {
    render(<ScorecardReviewStep review={review} onUpdate={vi.fn()} />);
    expect(await screen.findByText('$716,667')).toBeTruthy();
    expect(screen.getByText('30%')).toBeTruthy();
    expect(screen.getByText('9.5%')).toBeTruthy();
    expect(screen.getByText('45 days')).toBeTruthy();
    expect(screen.getByText('$46,500')).toBeTruthy();
  });

  it('saves the real targets into the review, not zeros', async () => {
    // The snapshot is what saveKpiActuals files and next quarter compares against.
    const onUpdate = vi.fn();
    render(<ScorecardReviewStep review={review} onUpdate={onUpdate} />);
    await waitFor(() => expect(lastSnapshot(onUpdate).kpis).toHaveLength(6));
    const targets = Object.fromEntries(lastSnapshot(onUpdate).kpis.map((k: any) => [k.name, k.target]));
    expect(targets).toEqual({
      'Monthly Revenue': 716667,
      'Gross Margin': 30,
      'Net Profit Margin': 9.5,
      'Debtor Days (DSO)': 45,
      'Average Project Value': 46500,
      // "0" in both columns is "no target set" — the same rule as everywhere else.
      'Safety Incidents (LTI)': 0,
    });
  });
});

describe('every other client reads the same as before, in clearer units', () => {
  it('still uses year1_target when that is where the target lives', async () => {
    db.kpis = [{ ...precision[0], name: 'Revenue', friendly_name: 'Revenue', unit: 'currency', year1_target: 300000, target_value: null }];
    const onUpdate = vi.fn();
    render(<ScorecardReviewStep review={review} onUpdate={onUpdate} />);
    expect(await screen.findByText('$300,000')).toBeTruthy();
    await waitFor(() => expect(lastSnapshot(onUpdate).kpis[0].target).toBe(300000));
  });

  it('prints a plain count and a coach’s qualifier the way the PDF does', async () => {
    // The old formatter printed "30 number" and dropped nothing it did not know.
    db.kpis = [
      { ...precision[1], kpi_id: 'a', name: 'Adam’s Time', friendly_name: 'Adam’s Time', unit: 'number', year1_target: 30, target_value: null },
      { ...precision[1], kpi_id: 'b', name: 'Caseload Value', friendly_name: 'Caseload Value', unit: 'AUD per clinician', year1_target: 250000, target_value: null },
    ];
    render(<ScorecardReviewStep review={review} onUpdate={vi.fn()} />);
    expect(await screen.findByText('$250,000 per clinician')).toBeTruthy();
    expect(screen.getByText('30')).toBeTruthy();
    expect(screen.queryByText('30 number')).toBeNull();
  });
});
