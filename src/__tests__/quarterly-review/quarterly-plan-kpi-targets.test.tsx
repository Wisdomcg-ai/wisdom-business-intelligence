/**
 * The standard Quarterly Plan step (4.2) shows a KPI's target from whichever
 * column holds it, in its own units.
 *
 * It selected year1_target only and showed `year1_target || 0`, so Precision —
 * whose targets all live in target_value — showed a column of dashes. Its own
 * formatter also missed "currency" (no $), dropped "days", and turned "percent
 * of allocated budget used" into a bare percentage. Found 25 Sep 2026.
 *
 * Rendered as the real component: this step is 2,000 lines, and a helper test
 * would say nothing about which column the screen actually asks for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const db = vi.hoisted(() => ({ kpis: [] as any[], selects: [] as { table: string; cols: string }[] }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'coach-1' } } }) },
    from: (table: string) => {
      const b: any = {
        select: (cols?: string) => {
          db.selects.push({ table, cols: String(cols ?? '') });
          return b;
        },
        eq: () => b, in: () => b, order: () => b, neq: () => b, is: () => b, limit: () => b,
        maybeSingle: async () =>
          table === 'business_profiles' ? { data: { id: 'profile-1' }, error: null } : { data: null, error: null },
        single: async () => ({ data: null, error: null }),
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

import { QuarterlyPlanStep } from '@/app/quarterly-review/components/steps/QuarterlyPlanStep';

const review: any = {
  id: 'r1', business_id: 'biz-1', quarter: 2, year: 2027,
  quarterly_targets: { revenue: 0, grossProfit: 0, netProfit: 0, kpis: [] },
  initiative_decisions: [], initiatives_changes: { added: [], removed: [], deferred: [], carriedForward: [] },
  dashboard_snapshot: {},
};

const kpi = (name: string, unit: string, year1_target: any, target_value: any) => ({
  kpi_id: name.toLowerCase().replace(/\W+/g, '-'), name, friendly_name: name, unit, current_value: 0,
  year1_target, year2_target: 0, year3_target: 0, target_value,
});

const renderStep = () =>
  render(
    <QuarterlyPlanStep
      review={review}
      onUpdateInitiativeDecisions={vi.fn()}
      onUpdateQuarterlyTargets={vi.fn()}
      onUpdateInitiativesChanges={vi.fn()}
    />
  );

beforeEach(() => {
  cleanup();
  db.selects = [];
});

describe('Precision’s Quarterly Plan shows the targets its coach set', () => {
  it('asks the database for the column the targets are actually in', async () => {
    db.kpis = [kpi('Monthly Revenue', '$', '0', '716667')];
    renderStep();
    await screen.findByText('Key Performance Indicators');
    const kpiSelect = db.selects.find(s => s.table === 'business_kpis')!;
    expect(kpiSelect.cols).toContain('target_value');
  });

  it('shows each target from whichever column holds it, in its own units', async () => {
    db.kpis = [
      kpi('Monthly Revenue', '$', '0', '716667'),
      kpi('Net Profit Margin', '%', '0', '9.5'),
      kpi('Debtor Days (DSO)', 'days', '0', '45'),
    ];
    renderStep();
    expect(await screen.findByText('$716,667')).toBeTruthy();
    expect(screen.getByText('9.5%')).toBeTruthy();
    expect(screen.getByText('45 days')).toBeTruthy();
  });
});

describe('every other client reads the same as before, in clearer units', () => {
  it('prints "currency" as money and keeps a coach’s qualifier', async () => {
    db.kpis = [
      kpi('Revenue - Partnerships', 'currency', 750000, null),
      kpi('Plan Utilisation', 'percent of allocated budget used', 80, null),
    ];
    renderStep();
    // Was "750,000" with no $, and "80.0%" with the qualifier dropped.
    expect(await screen.findByText('$750,000')).toBeTruthy();
    expect(screen.getByText('80% of allocated budget used')).toBeTruthy();
  });

  it('shows a dash for a KPI with no target in either column', async () => {
    db.kpis = [kpi('Safety Incidents (LTI)', 'number', '0', '0')];
    renderStep();
    await screen.findByText('Safety Incidents (LTI)');
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });
});
