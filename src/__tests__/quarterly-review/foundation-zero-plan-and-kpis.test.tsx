/**
 * JVJ Civil and Asphalt, first session, 25 Sep 2026 — two things went wrong.
 *
 * 1. Their plan row existed (a Goals wizard session opened on 28 Jan and never
 *    filled in) with every target at $0. Step 4.1 showed $0 × 3 as "the plan on
 *    file", marked it saved, and nobody entered the year; step 4.2 then split
 *    quarters against a $0 year ("$15.2M over $0").
 *
 * 2. Step 4.2's KPI picker took up to three of five essentials in ONE click,
 *    then hid itself for good once any KPI existed. The owner added one and
 *    could not add a second.
 *
 * Pinned here against the real step components. The Goals wizard's KPI section
 * is replaced by a stub that drives the same callbacks, so these tests pin what
 * the STEP does with them — which write it makes, and that none of them is the
 * Goals wizard's list save (which switches off every KPI it is not handed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, cleanup, fireEvent } from '@testing-library/react';

const db = vi.hoisted(() => ({
  goals: null as any,
  writes: [] as { table: string; op: string; payload: any; filters: Record<string, unknown> }[],
  // The order KPI writes land in, and how long an add's insert takes.
  seq: [] as string[],
  upsertDelayMs: 0,
}));

const kpiService = vi.hoisted(() => ({
  read: { ok: true, kpis: [] as any[] },
  updates: [] as { businessId: string; kpiId: string; updates: any }[],
  deletes: [] as { businessId: string; kpiId: string }[],
  listSaves: 0,
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const call = { table, op: 'select', payload: undefined as any, filters: {} as Record<string, unknown> };
      const b: any = {
        select: () => b,
        eq: (col: string, val: unknown) => {
          call.filters[col] = val;
          return b;
        },
        maybeSingle: async () => ({ data: table === 'business_financial_goals' ? db.goals : null, error: null }),
        upsert: async (payload: any) => {
          if (db.upsertDelayMs) await new Promise(r => setTimeout(r, db.upsertDelayMs));
          db.writes.push({ table, op: 'upsert', payload, filters: {} });
          db.seq.push(`${table}:upsert`);
          return { error: null };
        },
        insert: async (payload: any) => {
          db.writes.push({ table, op: 'insert', payload, filters: {} });
          db.goals = { ...payload };
          return { error: null };
        },
        update: (payload: any) => {
          call.op = 'update';
          call.payload = payload;
          db.writes.push(call);
          db.seq.push(`${table}:update`);
          if (table === 'business_financial_goals') db.goals = { ...(db.goals ?? {}), ...payload };
          return b;
        },
        then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
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

vi.mock('@/app/goals/services/kpi-service', () => ({
  default: {
    getUserKPIsResult: vi.fn(async () => kpiService.read),
    updateKPIValue: vi.fn(async (businessId: string, kpiId: string, updates: any) => {
      kpiService.updates.push({ businessId, kpiId, updates });
      db.seq.push('kpi-target');
      return { success: true };
    }),
    deleteKPI: vi.fn(async (businessId: string, kpiId: string) => {
      kpiService.deletes.push({ businessId, kpiId });
      return { success: true };
    }),
    saveUserKPIs: vi.fn(async () => {
      kpiService.listSaves += 1;
      return { success: true };
    }),
  },
}));

// A stand-in for the Goals wizard's KPI section: the list, and buttons that
// call the same callbacks its modal and table call.
vi.mock('@/app/goals/components/step1', () => ({
  KPISection: (props: any) => (
    <div data-testid="kpi-section">
      <ul>
        {props.kpis.map((k: any) => (
          <li key={k.id} data-testid={`kpi-${k.id}`}>
            {k.name}:{k.year1Target}
            <button onClick={() => props.deleteKPI(k.id)}>remove {k.id}</button>
            <button onClick={() => props.updateKPIValue(k.id, 'year1Target', 50)}>target5 {k.id}</button>
            <button onClick={() => props.updateKPIValue(k.id, 'year1Target', 500)}>target50 {k.id}</button>
          </li>
        ))}
      </ul>
      {['leads', 'conversion', 'avg-sale', 'nps'].map(id => (
        <button
          key={id}
          onClick={() =>
            props.addKPI({
              id,
              name: `KPI ${id}`,
              friendlyName: `Plain ${id}`,
              category: 'ATTRACT',
              unit: 'number',
              frequency: 'monthly',
              currentValue: 0,
              year1Target: 0,
              year2Target: 0,
              year3Target: 0,
            })
          }
        >
          add {id}
        </button>
      ))}
    </div>
  ),
}));

import { FoundationAnnualPlanStep } from '@/app/quarterly-review/components/steps/FoundationAnnualPlanStep';
import { FoundationQuarterlyPlanStep } from '@/app/quarterly-review/components/steps/FoundationQuarterlyPlanStep';
import { planWritesSettled } from '@/app/quarterly-review/services/foundation-plan-service';

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

// JVJ's row as it stood on 25 Sep 2026: every annual target $0, quarters set.
const JVJ_EMPTY_PLAN = {
  revenue_year1: 0,
  gross_profit_year1: 0,
  net_profit_year1: 0,
  year_type: 'FY',
  quarterly_targets: {
    revenue: { q1: '4200000', q2: '3500000', q3: '3500000', q4: '4000000' },
    grossProfit: { q1: '2400000', q2: '2000000', q3: '2000000', q4: '2300000' },
    netProfit: { q1: '1100000', q2: '770000', q3: '770000', q4: '1050000' },
  },
};

const REAL_PLAN = {
  revenue_year1: 1200000,
  gross_profit_year1: 480000,
  net_profit_year1: 120000,
  year_type: 'FY',
  quarterly_targets: {},
};

const inputValue = (container: HTMLElement, id: string) =>
  (container.querySelector(`#${id}`) as HTMLInputElement | null)?.value;

const settle = (ms = 1200) => new Promise(r => setTimeout(r, ms));

const kpiWrites = () => db.writes.filter(w => w.table === 'business_kpis');

beforeEach(() => {
  cleanup();
  db.goals = null;
  db.writes = [];
  db.seq = [];
  db.upsertDelayMs = 0;
  kpiService.read = { ok: true, kpis: [] };
  kpiService.updates = [];
  kpiService.deletes = [];
  kpiService.listSaves = 0;
});

describe('a plan row whose targets are all $0 is not a plan', () => {
  it('4.1 seeds from the baseline, not $0 × 3 marked "saved" — and saves over the empty row', async () => {
    db.goals = { ...JVJ_EMPTY_PLAN };
    const { container, queryByText } = render(
      <FoundationAnnualPlanStep review={review()} onUpdateConfidence={vi.fn()} />
    );
    await waitFor(() => expect(inputValue(container, 'annual-revenue')).toBe('$400,000'));
    expect(queryByText(/already in this business.s plan/i)).toBeNull();
    expect(queryByText(/started you at last quarter × 4/)).not.toBeNull();

    // The row exists, so the save UPDATES it — never a second plan.
    await waitFor(
      () =>
        expect(
          db.writes.some(w => w.table === 'business_financial_goals' && w.op === 'update' && w.payload.revenue_year1 === 400000)
        ).toBe(true),
      { timeout: 3000 }
    );
    expect(db.writes.some(w => w.table === 'business_financial_goals' && w.op === 'insert')).toBe(false);
  });

  it('4.2 sends the owner back to set the year instead of splitting against $0', async () => {
    db.goals = { ...JVJ_EMPTY_PLAN };
    const { findByText, container } = render(
      <FoundationQuarterlyPlanStep review={review()} onUpdateQuarterlyTargets={vi.fn()} />
    );
    await findByText(/Set this year.s revenue, gross profit and net profit on the previous step first/);
    expect(container.querySelector('#q-revenue-0')).toBeNull();
    expect(container.textContent).not.toMatch(/over \$0/);
    // Nothing is saved from a screen that shows no quarters.
    await settle();
    expect(db.writes.filter(w => w.table === 'business_financial_goals')).toHaveLength(0);
  });

  it('4.2 still shows the quarters once the year is set', async () => {
    db.goals = { ...JVJ_EMPTY_PLAN, revenue_year1: 15200000, gross_profit_year1: 8700000, net_profit_year1: 3690000 };
    const { container } = render(
      <FoundationQuarterlyPlanStep review={review()} onUpdateQuarterlyTargets={vi.fn()} />
    );
    await waitFor(() => expect(container.querySelector('#q-revenue-0')).not.toBeNull());
    expect(inputValue(container, 'q-revenue-1')).toBe('$3,500,000');
  });
});

describe('KPIs in a first session — as many as the client wants', () => {
  const renderStep = async () => {
    db.goals = { ...REAL_PLAN };
    const utils = render(<FoundationQuarterlyPlanStep review={review()} onUpdateQuarterlyTargets={vi.fn()} />);
    await utils.findByTestId('kpi-section');
    return utils;
  };

  it('a client who already has one KPI can add a second, third and fourth', async () => {
    kpiService.read = {
      ok: true,
      kpis: [{ id: 'customer-count', name: 'Active Customer Count', currentValue: 0, year1Target: 0, year2Target: 0, year3Target: 0 }],
    };
    const { getByText, findByTestId } = await renderStep();

    fireEvent.click(getByText('add leads'));
    fireEvent.click(getByText('add conversion'));
    fireEvent.click(getByText('add avg-sale'));

    await findByTestId('kpi-avg-sale');
    await planWritesSettled();
    const added = kpiWrites()
      .filter(w => w.op === 'upsert')
      .map(w => w.payload[0].kpi_id);
    expect(added).toEqual(['leads', 'conversion', 'avg-sale']);
    expect(await findByTestId('kpi-customer-count')).toBeTruthy();
  });

  it('adding never switches another KPI off, and never uses the Goals list save', async () => {
    kpiService.read = {
      ok: true,
      kpis: [{ id: 'customer-count', name: 'Active Customer Count', currentValue: 0, year1Target: 0, year2Target: 0, year3Target: 0 }],
    };
    const { getByText } = await renderStep();
    fireEvent.click(getByText('add leads'));
    await waitFor(() => expect(kpiWrites().length).toBeGreaterThan(0));
    await planWritesSettled();

    expect(kpiService.listSaves).toBe(0);
    for (const w of kpiWrites().filter(x => x.op === 'update')) {
      expect(w.payload.is_active).toBe(true);
      expect(w.filters.kpi_id).toBe('leads');
    }
  });

  it('adding the same KPI twice writes it once', async () => {
    const { getByText } = await renderStep();
    fireEvent.click(getByText('add leads'));
    fireEvent.click(getByText('add leads'));
    await planWritesSettled();
    expect(kpiWrites().filter(w => w.op === 'upsert')).toHaveLength(1);
  });

  it('a target is saved once, after typing stops, with the last figure', async () => {
    kpiService.read = {
      ok: true,
      kpis: [{ id: 'customer-count', name: 'Active Customer Count', currentValue: 0, year1Target: 0, year2Target: 0, year3Target: 0 }],
    };
    const { getByText, findByText } = await renderStep();
    fireEvent.click(getByText('target5 customer-count'));
    fireEvent.click(getByText('target50 customer-count'));
    expect(kpiService.updates).toHaveLength(0);

    await findByText('KPIs saved', undefined, { timeout: 3000 });
    expect(kpiService.updates).toEqual([
      { businessId: 'profile-1', kpiId: 'customer-count', updates: { year1Target: 500 } },
    ]);
  });

  it('a target typed while a slow add is still on the wire waits for the row', async () => {
    const { getByText, findByText } = await renderStep();
    // The insert takes longer than the target's save delay.
    db.upsertDelayMs = 1500;
    fireEvent.click(getByText('add leads'));
    await findByText('target50 leads');
    fireEvent.click(getByText('target50 leads'));

    await waitFor(() => expect(kpiService.updates).toHaveLength(1), { timeout: 4000 });
    // Run before the insert, the update would change no row and the target
    // would be lost without an error.
    expect(db.seq.filter(x => x.startsWith('business_kpis') || x === 'kpi-target')).toEqual([
      'business_kpis:upsert',
      'business_kpis:update',
      'kpi-target',
    ]);
    expect(kpiService.updates[0]).toEqual({ businessId: 'profile-1', kpiId: 'leads', updates: { year1Target: 500 } });
  });

  it('leaving the step before the save delay still saves the target', async () => {
    kpiService.read = {
      ok: true,
      kpis: [{ id: 'customer-count', name: 'Active Customer Count', currentValue: 0, year1Target: 0, year2Target: 0, year3Target: 0 }],
    };
    const { getByText, unmount } = await renderStep();
    fireEvent.click(getByText('target50 customer-count'));
    unmount();
    await planWritesSettled();
    await waitFor(() => expect(kpiService.updates).toHaveLength(1));
    expect(kpiService.updates[0].updates).toEqual({ year1Target: 500 });
  });

  it('removing a KPI switches it off — one KPI, never the list', async () => {
    kpiService.read = {
      ok: true,
      kpis: [
        { id: 'customer-count', name: 'Active Customer Count', currentValue: 0, year1Target: 0, year2Target: 0, year3Target: 0 },
        { id: 'leads', name: 'Leads', currentValue: 0, year1Target: 10, year2Target: 0, year3Target: 0 },
      ],
    };
    const { getByText, queryByTestId } = await renderStep();
    fireEvent.click(getByText('remove leads'));
    await planWritesSettled();
    expect(kpiService.deletes).toEqual([{ businessId: 'profile-1', kpiId: 'leads' }]);
    expect(kpiService.listSaves).toBe(0);
    expect(queryByTestId('kpi-leads')).toBeNull();
    expect(queryByTestId('kpi-customer-count')).not.toBeNull();
  });

  it('a KPI list that could not be read is never shown as "no KPIs"', async () => {
    kpiService.read = { ok: false, kpis: [] };
    db.goals = { ...REAL_PLAN };
    const { findByText, queryByTestId } = render(
      <FoundationQuarterlyPlanStep review={review()} onUpdateQuarterlyTargets={vi.fn()} />
    );
    await findByText(/Couldn.t check this business.s KPIs/);
    expect(queryByTestId('kpi-section')).toBeNull();
  });
});
