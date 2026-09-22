/**
 * A first session's plan saves whether or not anyone edits it.
 *
 * Found in the live test of #574 on 22 Sep 2026: step 4.1 showed last quarter
 * × 4 as this year's plan, but saved only after someone EDITED a number. An
 * owner who said "yes, that's about right" and clicked Continue got no plan —
 * the next step said "set this year's numbers on the previous step first" while
 * the sidebar ticked 4.1 as done.
 *
 * Pinned here, against the real step components:
 *   - accepting the suggestion as it stands saves it (with its margins);
 *   - a plan already on file is never re-saved just by opening the step;
 *   - a line the baseline skipped stays blank, and nothing is saved;
 *   - leaving a step before its save delay runs out still saves; and
 *   - step 4.2 reads the plan only after 4.1's save has landed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';

type Write = { op: 'insert' | 'update'; payload: any };

const db = vi.hoisted(() => ({
  goals: null as any,
  kpiCount: 0,
  writes: [] as { op: 'insert' | 'update'; payload: any }[],
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      let head = false;
      const b: any = {
        select: (_cols?: string, opts?: any) => {
          head = !!opts?.head;
          return b;
        },
        eq: () => b,
        maybeSingle: async () => ({ data: table === 'business_financial_goals' ? db.goals : null, error: null }),
        insert: async (payload: any) => {
          db.writes.push({ op: 'insert', payload });
          db.goals = { ...payload };
          return { error: null };
        },
        update: (payload: any) => {
          db.writes.push({ op: 'update', payload });
          db.goals = { ...(db.goals ?? {}), ...payload };
          return { eq: async () => ({ error: null }) };
        },
        then: (resolve: any) =>
          Promise.resolve(head ? { count: db.kpiCount, error: null } : { data: [], error: null }).then(resolve),
      };
      return b;
    },
  }),
}));

vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileId: vi.fn(async () => 'profile-1'),
}));
vi.mock('@/app/quarterly-review/utils/capture-write-failure', () => ({
  captureReviewWriteFailure: vi.fn(),
}));

import { FoundationAnnualPlanStep } from '@/app/quarterly-review/components/steps/FoundationAnnualPlanStep';
import { FoundationQuarterlyPlanStep } from '@/app/quarterly-review/components/steps/FoundationQuarterlyPlanStep';
import { trackPlanWrite, planWritesSettled } from '@/app/quarterly-review/services/foundation-plan-service';

const baseline = (lines: Partial<Record<'revenue' | 'grossProfit' | 'netProfit', number>>) =>
  Object.fromEntries(Object.entries(lines).map(([k, v]) => [k, { target: 0, actual: v, variance: 0 }]));

const review = (over: Record<string, unknown> = {}): any => ({
  id: 'r1',
  business_id: 'biz-1',
  user_id: 'user-1',
  quarter: 2,
  year: 2027,
  dashboard_snapshot: baseline({ revenue: 100000, grossProfit: 40000, netProfit: 10000 }),
  quarterly_targets: { revenue: 0, grossProfit: 0, netProfit: 0, kpis: [] },
  ...over,
});

const inputValue = (container: HTMLElement, id: string) =>
  (container.querySelector(`#${id}`) as HTMLInputElement | null)?.value;

const settle = (ms = 1200) => new Promise(r => setTimeout(r, ms));

const annualWrites = (): Write[] =>
  db.writes.filter(w => w.payload && ('revenue_year1' in w.payload || 'gross_margin_year1' in w.payload));

beforeEach(() => {
  cleanup();
  db.goals = null;
  db.kpiCount = 0;
  db.writes = [];
});

describe('step 4.1 — this year’s numbers', () => {
  it('saves last quarter × 4 when the owner accepts it without editing', async () => {
    const { container, findByText } = render(
      <FoundationAnnualPlanStep review={review()} onUpdateConfidence={vi.fn()} />
    );
    await waitFor(() => expect(inputValue(container, 'annual-revenue')).toBe('$400,000'));

    await waitFor(() => expect(annualWrites()).toHaveLength(1), { timeout: 3000 });
    expect(annualWrites()[0]).toMatchObject({
      op: 'insert',
      payload: {
        business_id: 'profile-1',
        revenue_year1: 400000,
        gross_profit_year1: 160000,
        net_profit_year1: 40000,
        // Stored with the dollars — the Forecast wizard reads these, and falls
        // back to 50% / 15% when they are 0.
        gross_margin_year1: 40,
        net_margin_year1: 10,
      },
    });
    await findByText('Plan saved');
  });

  it('does not re-save a plan already on file just because the step was opened', async () => {
    db.goals = { revenue_year1: 500000, gross_profit_year1: 160000, net_profit_year1: 40000, year_type: 'FY' };
    const { container } = render(<FoundationAnnualPlanStep review={review()} onUpdateConfidence={vi.fn()} />);
    await waitFor(() => expect(inputValue(container, 'annual-revenue')).toBe('$500,000'));
    await settle();
    expect(db.writes).toHaveLength(0);
  });

  it('leaves a line the baseline skipped blank, and saves nothing until it is filled', async () => {
    const { container, findByText } = render(
      <FoundationAnnualPlanStep
        review={review({ dashboard_snapshot: baseline({ revenue: 100000 }) })}
        onUpdateConfidence={vi.fn()}
      />
    );
    await waitFor(() => expect(inputValue(container, 'annual-revenue')).toBe('$400,000'));
    // Blank, not "$0" — a $0 target nobody chose.
    expect(inputValue(container, 'annual-gp')).toBe('');
    expect(inputValue(container, 'annual-np')).toBe('');
    await findByText('Fill in all three to save your plan.');
    await settle();
    expect(db.writes).toHaveLength(0);
  });

  it('still saves when the step closes before the save delay runs out', async () => {
    const { container, unmount } = render(
      <FoundationAnnualPlanStep review={review()} onUpdateConfidence={vi.fn()} />
    );
    await waitFor(() => expect(inputValue(container, 'annual-revenue')).toBe('$400,000'));
    unmount(); // Continue, clicked straight away
    await planWritesSettled();
    await waitFor(() => expect(annualWrites()).toHaveLength(1));
    expect(annualWrites()[0].payload.revenue_year1).toBe(400000);
  });
});

describe('step 4.2 — the quarters', () => {
  it('reads the plan only after the previous step’s save has landed', async () => {
    // 4.1's save is still on the wire as 4.2 opens.
    let land!: () => void;
    trackPlanWrite(
      new Promise<void>(resolve => {
        land = () => {
          db.goals = { revenue_year1: 400000, gross_profit_year1: 160000, net_profit_year1: 40000, quarterly_targets: {} };
          resolve();
        };
      })
    );
    const { container, queryByText } = render(
      <FoundationQuarterlyPlanStep review={review()} onUpdateQuarterlyTargets={vi.fn()} />
    );
    await settle(200);
    land();
    await waitFor(() => expect(inputValue(container, 'q-revenue-1')).toBe('$100,000'));
    expect(queryByText(/on the previous step first/)).toBeNull();
  });

  it('says it split the year evenly only when it did', async () => {
    db.goals = {
      revenue_year1: 500000,
      gross_profit_year1: 160000,
      net_profit_year1: 40000,
      quarterly_targets: {
        revenue: { q1: '125000', q2: '150000', q3: '125000', q4: '100000' },
        grossProfit: { q1: '40000', q2: '40000', q3: '40000', q4: '40000' },
        netProfit: { q1: '10000', q2: '10000', q3: '10000', q4: '10000' },
      },
    };
    const { container, findByText, queryByText } = render(
      <FoundationQuarterlyPlanStep review={review()} onUpdateQuarterlyTargets={vi.fn()} />
    );
    await waitFor(() => expect(inputValue(container, 'q-revenue-1')).toBe('$150,000'));
    await findByText(/These are this year/);
    expect(queryByText(/split your year evenly/)).toBeNull();
  });

  it('still saves the split, and hands the review its quarter, when the step closes early', async () => {
    // Without this the review keeps its $0 default for the planning quarter,
    // and completing it writes $0 into the plan.
    db.goals = { revenue_year1: 400000, gross_profit_year1: 160000, net_profit_year1: 40000, quarterly_targets: {} };
    const onUpdate = vi.fn();
    const { container, unmount } = render(
      <FoundationQuarterlyPlanStep review={review()} onUpdateQuarterlyTargets={onUpdate} />
    );
    await waitFor(() => expect(inputValue(container, 'q-revenue-1')).toBe('$100,000'));
    unmount();
    await planWritesSettled();
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(db.goals.quarterly_targets.revenue).toEqual({ q1: '100000', q2: '100000', q3: '100000', q4: '100000' });
    expect(onUpdate).toHaveBeenCalledWith({ revenue: 100000, grossProfit: 40000, netProfit: 10000, kpis: [] });
  });
});
