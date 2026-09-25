/**
 * First-session plan: the arithmetic, and the guarantee that saving it can never
 * destroy a plan that already exists.
 *
 * Matt, 22 Sep 2026: a first session sets JUST this year's numbers.
 *
 * The non-destructive guarantee matters because a coach can force a first
 * session for a client who already has a plan. The Goals wizard saves with a
 * full-row upsert and its KPI save deactivates every KPI not listed — copying
 * either would wipe a real client's data the moment a forced session saved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  evenSplit,
  evenSplitAll,
  sumSplit,
  seedAnnualFromBaseline,
  seedAnnualNumbers,
  isComplete,
  marginPercent,
  year1EndDateFor,
  toQuarterlyTargetsJson,
  planningQuarterTargets,
  describeQuarter,
} from '@/app/quarterly-review/utils/foundation-plan';
import { snapshotActual } from '@/app/quarterly-review/utils/snapshot-actuals';
import {
  saveFoundationAnnualPlan,
  saveFoundationQuarterlyTargets,
  addFoundationKpi,
  trackPlanWrite,
  planWritesSettled,
  FOUNDATION_OWNED_COLUMNS,
} from '@/app/quarterly-review/services/foundation-plan-service';

// ---------------------------------------------------------------------------
describe('the quarters add back up to the year, to the dollar', () => {
  it('splits a round figure evenly', () => {
    expect(evenSplit(400000)).toEqual([100000, 100000, 100000, 100000]);
  });

  it('puts the remainder on Q4 rather than losing it', () => {
    // Naive ÷4 rounding gives 25,000 × 4 = 100,000 — a dollar short of the year.
    const s = evenSplit(100001);
    expect(s).toEqual([25000, 25000, 25000, 25001]);
    expect(sumSplit(s)).toBe(100001);
  });

  it('holds for every remainder', () => {
    for (const n of [0, 1, 2, 3, 7, 999999, 1234567]) {
      expect(sumSplit(evenSplit(n))).toBe(n);
    }
  });

  it('splits a planned loss the same way', () => {
    const s = evenSplit(-100001);
    expect(sumSplit(s)).toBe(-100001);
  });
});

describe('seeding this year from last quarter', () => {
  it('annualises last quarter × 4', () => {
    expect(seedAnnualFromBaseline(111111)).toBe(444444);
  });

  it('carries a loss through honestly — never clamped to 0', () => {
    expect(seedAnnualFromBaseline(-5000)).toBe(-20000);
  });

  it('seeds nothing — a blank, not $0 — from a line that was never entered', () => {
    expect(seedAnnualFromBaseline(null)).toBeNull();
    expect(seedAnnualFromBaseline(undefined)).toBeNull();
  });

  it('leaves a skipped line blank, and a partial seed is not a plan', () => {
    const seed = seedAnnualNumbers({ revenue: 100000 });
    expect(seed).toEqual({ revenue: 400000, grossProfit: null, netProfit: null });
    expect(isComplete(seed)).toBe(false);
    expect(isComplete(seedAnnualNumbers({ revenue: 1, grossProfit: 1, netProfit: 0 }))).toBe(true);
  });

  it('seeds all three lines', () => {
    expect(seedAnnualNumbers({ revenue: 100, grossProfit: 50, netProfit: -10 })).toEqual({
      revenue: 400,
      grossProfit: 200,
      netProfit: -40,
    });
  });
});

describe('margins are stored the way the Goals wizard stores them', () => {
  it('is a percentage to two decimals', () => {
    expect(marginPercent(160000, 500000)).toBe(32);
    expect(marginPercent(1, 3)).toBe(33.33);
  });

  it('carries a planned loss through as a negative margin', () => {
    expect(marginPercent(-5000, 100000)).toBe(-5);
  });

  it('is 0, not a division by zero, when there is no revenue', () => {
    expect(marginPercent(1000, 0)).toBe(0);
    expect(marginPercent(1000, -1)).toBe(0);
  });
});

describe('the plan year-end is the real calendar date', () => {
  it('ends an FY plan on 30 June — not the 29th the Goals wizard stores', () => {
    // The wizard builds it through a Date + toISOString, which in AEST turns
    // local 30 June into "29 June". This is a string, so it can't drift.
    expect(year1EndDateFor('FY', 2027)).toBe('2027-06-30');
  });

  it('ends a CY plan on 31 December', () => {
    expect(year1EndDateFor('CY', 2027)).toBe('2027-12-31');
  });
});

describe('a quarter is named so nobody misreads it', () => {
  it('names an FY quarter the way the workshop header does, with its months', () => {
    // "Q1 2027" alone reads as January–March, which is wrong for an FY business.
    expect(describeQuarter(1, 2027, 'FY')).toBe('Q1 FY2027 (July to September)');
    expect(describeQuarter(3, 2027, 'FY')).toBe('Q3 FY2027 (January to March)');
    expect(describeQuarter(4, 2027, 'FY')).toBe('Q4 FY2027 (April to June)');
  });

  it('names a calendar-year quarter plainly', () => {
    expect(describeQuarter(1, 2027, 'CY')).toBe('Q1 2027 (January to March)');
    expect(describeQuarter(4, 2027, 'CY')).toBe('Q4 2027 (October to December)');
  });
});

describe('the quarterly targets are stored in the shape the Scorecard reads', () => {
  it('writes string values keyed revenue/grossProfit/netProfit → q1..q4', () => {
    const json = toQuarterlyTargetsJson(evenSplitAll({ revenue: 400, grossProfit: 200, netProfit: 40 }));
    // ScorecardReviewStep does parseFloat(quarterlyTargets.revenue?.[quarterKey]).
    expect(json.revenue).toEqual({ q1: '100', q2: '100', q3: '100', q4: '100' });
    expect(parseFloat(json.netProfit.q3)).toBe(10);
  });

  it('hands the planning quarter its own slice', () => {
    const split = evenSplitAll({ revenue: 400001, grossProfit: 200, netProfit: 40 });
    expect(planningQuarterTargets(split, 4).revenue).toBe(100001);
    expect(planningQuarterTargets(split, 2).revenue).toBe(100000);
  });
});

describe('next quarter can read the baseline back', () => {
  it('reads the actual out of the object the snapshot writer stores', () => {
    // createQuarterlySnapshot stores { target, actual, variance }. The plan grid
    // read it as a bare number and got the whole object.
    expect(snapshotActual({ target: 0, actual: 111111, variance: 0 })).toBe(111111);
  });

  it('still reads a plain number', () => {
    expect(snapshotActual(5000)).toBe(5000);
  });

  it('falls back to the legacy flat field', () => {
    expect(snapshotActual(undefined, 750)).toBe(750);
  });

  it('never returns an object to arithmetic', () => {
    expect(typeof snapshotActual({ actual: 'nope' })).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// The writes. A tiny fake that records every call.
// ---------------------------------------------------------------------------
type Call = { table: string; op: string; payload?: any; filters: Record<string, unknown>; returning?: boolean };

function fakeDb(state: {
  goals?: any;
  kpiCount?: number;
  insertError?: any;
  upsertError?: any;
  updateRows?: any[];
}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: 'select', filters: {} };
      const b: any = {
        select: (_cols?: string, opts?: any) => {
          // update(...).select() returns the updated rows; it is still an update.
          if (call.op === 'update') call.returning = true;
          else call.op = opts?.head ? 'count' : 'select';
          return b;
        },
        insert: (payload: any) => {
          call.op = 'insert';
          call.payload = payload;
          calls.push(call);
          return Promise.resolve({ error: state.insertError ?? null });
        },
        update: (payload: any) => {
          call.op = 'update';
          call.payload = payload;
          return b;
        },
        upsert: (payload: any) => {
          call.op = 'upsert';
          call.payload = payload;
          calls.push(call);
          return Promise.resolve({ error: state.upsertError ?? null });
        },
        eq: (col: string, val: unknown) => {
          call.filters[col] = val;
          return b;
        },
        maybeSingle: async () => {
          calls.push(call);
          return { data: state.goals ?? null, error: null };
        },
        then: (resolve: any) => {
          calls.push(call);
          const res =
            call.op === 'count'
              ? { count: state.kpiCount ?? 0, error: null }
              : call.returning
                ? { data: state.updateRows ?? [], error: null }
                : { error: null };
          return Promise.resolve(res).then(resolve);
        },
      };
      return b;
    },
  };
  return { client, calls };
}

const NUMBERS = { revenue: 444444, grossProfit: 222222, netProfit: 44444 };

describe('saving the annual plan never destroys an existing one', () => {
  it('creates a new plan with the 2- and 3-year targets left EMPTY, not $0', async () => {
    const { client, calls } = fakeDb({ goals: null });
    const res = await saveFoundationAnnualPlan(client, {
      profileId: 'p1', userId: 'u1', numbers: NUMBERS, yearType: 'FY', year1EndDate: '2027-06-30',
    });
    expect(res.created).toBe(true);
    const insert = calls.find(c => c.op === 'insert')!;
    expect(insert.payload).toMatchObject({
      business_id: 'p1',
      revenue_year1: 444444,
      gross_profit_year1: 222222,
      net_profit_year1: 44444,
      year_type: 'FY',
      year1_end_date: '2027-06-30',
      revenue_year3: null,
      net_profit_year2: null,
      // 222,222 / 444,444 and 44,444 / 444,444
      gross_margin_year1: 50,
      net_margin_year1: 10,
    });
  });

  it('on an existing plan, writes ONLY the three numbers and the year type', async () => {
    // The forced-first-session case: a client who already has a full plan.
    const { client, calls } = fakeDb({ goals: { id: 'g1', year1_end_date: '2027-06-29' } });
    const res = await saveFoundationAnnualPlan(client, {
      profileId: 'p1', userId: 'u1', numbers: NUMBERS, yearType: 'FY', year1EndDate: '2027-06-30',
    });
    expect(res.created).toBe(false);
    expect(calls.some(c => c.op === 'insert')).toBe(false);

    const update = calls.find(c => c.op === 'update')!;
    const written = Object.keys(update.payload).filter(k => k !== 'updated_at');
    expect(written.sort()).toEqual([...FOUNDATION_OWNED_COLUMNS].sort());
    // The margins move with the numbers they are derived from, never apart.
    expect(update.payload).toMatchObject({ gross_margin_year1: 50, net_margin_year1: 10 });
    // Nothing else — above all, nothing that would zero their 3-year ladder,
    // core metrics or plan dates, which a full-row upsert would.
    for (const k of ['revenue_year2', 'revenue_year3', 'customers_year3', 'plan_start_date', 'plan_end_date', 'quarterly_targets']) {
      expect(update.payload).not.toHaveProperty(k);
    }
  });

  it('never moves an existing plan year-end', async () => {
    const { client, calls } = fakeDb({ goals: { id: 'g1', year1_end_date: '2027-06-29' } });
    await saveFoundationAnnualPlan(client, {
      profileId: 'p1', userId: 'u1', numbers: NUMBERS, yearType: 'FY', year1EndDate: '2027-06-30',
    });
    expect(calls.find(c => c.op === 'update')!.payload).not.toHaveProperty('year1_end_date');
  });

  it('fills an EMPTY plan year-end', async () => {
    const { client, calls } = fakeDb({ goals: { id: 'g1', year1_end_date: null } });
    await saveFoundationAnnualPlan(client, {
      profileId: 'p1', userId: 'u1', numbers: NUMBERS, yearType: 'FY', year1EndDate: '2027-06-30',
    });
    expect(calls.find(c => c.op === 'update')!.payload.year1_end_date).toBe('2027-06-30');
  });

  it('falls back to updating when another tab created the plan first', async () => {
    const { client, calls } = fakeDb({ goals: null, insertError: { code: '23505' } });
    const res = await saveFoundationAnnualPlan(client, {
      profileId: 'p1', userId: 'u1', numbers: NUMBERS, yearType: 'FY', year1EndDate: '2027-06-30',
    });
    expect(res.created).toBe(false);
    expect(calls.some(c => c.op === 'update')).toBe(true);
  });
});

describe('saving the quarterly split', () => {
  it('writes only the quarterly_targets column, merged over what is there', async () => {
    const { client, calls } = fakeDb({ goals: { quarterly_targets: { custom: { keep: 'me' } } } });
    await saveFoundationQuarterlyTargets(client, {
      profileId: 'p1',
      split: evenSplitAll({ revenue: 400, grossProfit: 200, netProfit: 40 }),
    });
    const update = calls.find(c => c.op === 'update')!;
    expect(Object.keys(update.payload).sort()).toEqual(['quarterly_targets', 'updated_at']);
    expect(update.payload.quarterly_targets.custom).toEqual({ keep: 'me' });
    expect(update.payload.quarterly_targets.revenue.q1).toBe('100');
  });

  it('refuses to split a plan that does not exist yet', async () => {
    const { client } = fakeDb({ goals: null });
    await expect(
      saveFoundationQuarterlyTargets(client, { profileId: 'p1', split: evenSplitAll(NUMBERS) })
    ).rejects.toThrow(/annual numbers first/);
  });
});

describe('adding a KPI — one at a time, no cap', () => {
  const kpi = (id: string) => ({ id, name: `KPI ${id}`, plainName: `Plain ${id}`, unit: 'number' });

  it('adds a KPI for a client who already has some (JVJ could not add a second)', async () => {
    const { client, calls } = fakeDb({ kpiCount: 4 });
    await addFoundationKpi(client, { profileId: 'p1', userId: 'u1', kpi: kpi('a') });
    const upsert = calls.find(c => c.op === 'upsert')!;
    expect(upsert.table).toBe('business_kpis');
    expect(upsert.payload).toHaveLength(1);
    expect(upsert.payload[0]).toMatchObject({
      business_id: 'p1',
      user_id: 'u1',
      kpi_id: 'a',
      name: 'KPI a',
      friendly_name: 'Plain a',
      is_active: true,
    });
    // No "already has KPIs" count check any more.
    expect(calls.some(c => c.op === 'count')).toBe(false);
  });

  it('never overwrites a KPI row that already exists', async () => {
    const { client, calls } = fakeDb({});
    await addFoundationKpi(client, { profileId: 'p1', userId: 'u1', kpi: kpi('a') });
    // ignoreDuplicates: an existing row keeps its targets — the insert skips it.
    const upsert = calls.find(c => c.op === 'upsert')!;
    expect(upsert.payload[0].year1_target).toBe(0);
    // The only update switches THIS KPI on. It never switches anything off —
    // the Goals wizard's list save issues is_active=false for unlisted KPIs.
    const updates = calls.filter(c => c.op === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({ is_active: true });
    expect(updates[0].filters).toEqual({ business_id: 'p1', kpi_id: 'a' });
  });

  it('brings a removed KPI back with its old targets, and says what they are', async () => {
    const { client } = fakeDb({
      updateRows: [{ current_value: 40, year1_target: 60, year2_target: 80, year3_target: 100 }],
    });
    const stored = await addFoundationKpi(client, { profileId: 'p1', userId: 'u1', kpi: kpi('a') });
    expect(stored).toEqual({ currentValue: 40, year1Target: 60, year2Target: 80, year3Target: 100 });
  });

  it('reports a failed add rather than swallowing it', async () => {
    const { client } = fakeDb({ upsertError: { message: 'rls' } });
    await expect(addFoundationKpi(client, { profileId: 'p1', userId: 'u1', kpi: kpi('a') })).rejects.toEqual({
      message: 'rls',
    });
  });
});

describe('a reader waits for plan saves still in flight', () => {
  it('does not resolve until the save lands', async () => {
    let land!: () => void;
    trackPlanWrite(new Promise<void>(r => (land = r)));
    let settled = false;
    const wait = planWritesSettled().then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    land();
    await wait;
    expect(settled).toBe(true);
  });

  it('still lets the reader go when the save failed', async () => {
    trackPlanWrite(Promise.reject(new Error('network'))).catch(() => {});
    await expect(planWritesSettled()).resolves.toBeUndefined();
  });
});
