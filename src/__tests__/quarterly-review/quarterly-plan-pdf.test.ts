/**
 * The client's one-page plan.
 *
 * Matt, 23 Sep 2026: "a one-page plan to stick on the wall" — so the two things
 * pinned hardest here are that a real quarter FITS ON ONE PAGE, and that a
 * section with nothing in it is left out. A first session fills three blocks;
 * printing the other six as empty headings hands the client a form they appear
 * to have failed rather than the plan they just built.
 *
 * The rest is the detail that goes wrong quietly on a page nobody re-reads: an
 * FY quarter printed with the wrong calendar year, a plan year-end a day early
 * through a Date, and a loss printed as a gain.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildPlanPage,
  planMoney,
  planPdfFilename,
  quarterPeriodLabel,
  quarterTitle,
  formatPlainDate,
  kpiTargetLabel,
  type PlanPageInput,
} from '@/app/quarterly-review/utils/quarterly-plan-page';
import { renderPlanPdf } from '@/app/quarterly-review/services/quarterly-plan-pdf';

const NOW = new Date(2026, 8, 23);

const review = (over: Record<string, unknown> = {}): any => ({
  quarter: 2,
  year: 2027,
  quarterly_targets: { revenue: 100000, grossProfit: 40000, netProfit: 10000, kpis: [] },
  quarterly_rocks: [],
  personal_commitments: { hoursPerWeekTarget: null, daysOffPlanned: null, daysOffScheduled: [], personalGoal: '' },
  one_thing_answer: null,
  one_thing_for_success: null,
  ...over,
});

const input = (over: Partial<PlanPageInput> = {}): PlanPageInput => ({
  review: review(),
  businessName: 'Test ABC',
  yearType: 'FY',
  annual: { revenue: 400000, grossProfit: 160000, netProfit: 40000, yearEnd: '2027-06-30' },
  kpis: [],
  now: NOW,
  ...over,
});

const titles = (i: PlanPageInput) => buildPlanPage(i).blocks.map(b => b.title);

describe('a quarter is named the way the client counts one', () => {
  it('puts an FY quarter in the calendar year it actually falls in', () => {
    // Q2 FY2027 is Oct–Dec 2026. Printing "2027" is the error that makes a
    // client doubt every other figure on the page.
    expect(quarterPeriodLabel(2, 2027, 'FY')).toBe('October to December 2026');
    expect(quarterPeriodLabel(1, 2027, 'FY')).toBe('July to September 2026');
    expect(quarterPeriodLabel(3, 2027, 'FY')).toBe('January to March 2027');
    expect(quarterPeriodLabel(4, 2027, 'FY')).toBe('April to June 2027');
  });

  it('leaves a calendar-year quarter in its own year', () => {
    expect(quarterPeriodLabel(1, 2027, 'CY')).toBe('January to March 2027');
    expect(quarterPeriodLabel(4, 2027, 'CY')).toBe('October to December 2027');
  });

  it('titles it the way the workshop header does', () => {
    expect(quarterTitle(2, 2027, 'FY')).toBe('Q2 FY2027');
    expect(quarterTitle(2, 2027, 'CY')).toBe('Q2 2027');
  });
});

describe('figures print the way a reader expects', () => {
  it('shows a planned loss as a loss', () => {
    expect(planMoney(-5000)).toBe('($5,000)');
  });

  it('separates a real zero from a figure nobody set', () => {
    expect(planMoney(0)).toBe('$0');
    expect(planMoney(null)).toBe('—');
    expect(planMoney(undefined)).toBe('—');
  });

  it('reads the plan year-end off the string, never through a Date', () => {
    // new Date('2027-06-30') is UTC midnight — the 29th in Australia.
    expect(formatPlainDate('2027-06-30')).toBe('30 June 2027');
    expect(formatPlainDate(null)).toBeNull();
  });

  it('gives a KPI target its own units, and none when there is no target', () => {
    expect(kpiTargetLabel({ name: 'Revenue', target: 120000, unit: '$' })).toBe('$120,000');
    expect(kpiTargetLabel({ name: 'Margin', target: 42, unit: '%' })).toBe('42%');
    expect(kpiTargetLabel({ name: 'Customers', target: 180 })).toBe('180');
    expect(kpiTargetLabel({ name: 'Customers', target: 0 })).toBeNull();
    expect(kpiTargetLabel({ name: 'Customers', target: null })).toBeNull();
  });
});

describe('a section with nothing in it is left out', () => {
  it('a first session prints its numbers, its KPIs and the next steps — and nothing empty', () => {
    const page = buildPlanPage(
      input({ kpis: [{ name: 'Money Coming In Each Month', target: 0, unit: '$' }] })
    );
    expect(page.blocks.map(b => b.title)).toEqual([
      'My targets this quarter',
      'The year to 30 June 2027',
      'Numbers I’m watching',
      'Next steps',
    ]);
    expect(page.title).toBe('Q2 FY2027 Plan');
    expect(page.period).toBe('October to December 2026');
    expect(page.preparedOn).toBe('Prepared 23 September 2026');
  });

  it('leaves out rocks, commitments and the one thing when the session set none', () => {
    const t = titles(input());
    expect(t).not.toContain('My rocks this quarter');
    expect(t).not.toContain('My commitments');
  });

  it('adds each one as soon as it has something to say', () => {
    const t = titles(
      input({
        review: review({
          quarterly_rocks: [{ id: '1', title: 'Hire an installer', owner: 'Sam', successCriteria: '' }],
          personal_commitments: { hoursPerWeekTarget: 45, daysOffPlanned: 7, daysOffScheduled: [], personalGoal: '' },
          one_thing_answer: 'Stop being the bottleneck',
        }),
      })
    );
    expect(t).toContain('My rocks this quarter');
    expect(t).toContain('My commitments');
    expect(t).toContain('The one thing that would make this quarter a success');
  });

  it('drops a rock with no title rather than printing a blank line', () => {
    const page = buildPlanPage(
      input({
        review: review({
          quarterly_rocks: [
            { id: '1', title: '   ', owner: 'Sam', successCriteria: '' },
            { id: '2', title: 'Real rock', owner: '', successCriteria: '' },
          ],
        }),
      })
    );
    const rocks = page.blocks.find(b => b.title === 'My rocks this quarter') as any;
    expect(rocks.items).toHaveLength(1);
    expect(rocks.items[0].text).toBe('Real rock');
  });

  it('still produces a usable page for a review that recorded nothing at all', () => {
    const page = buildPlanPage(
      input({
        review: review({ quarterly_targets: { revenue: 0, grossProfit: 0, netProfit: 0, kpis: [] } }),
        annual: null,
      })
    );
    expect(page.blocks.map(b => b.title)).toEqual(['Next steps']);
  });

  it('names a rock’s owner and when it is due', () => {
    const page = buildPlanPage(
      input({
        review: review({
          quarterly_rocks: [
            { id: '1', title: 'Hire', owner: 'Sam', targetDate: '2026-11-30', successCriteria: 'Working solo' },
          ],
        }),
      })
    );
    const rocks = page.blocks.find(b => b.title === 'My rocks this quarter') as any;
    expect(rocks.items[0].detail).toBe('Sam · by 30 November 2026 — Working solo');
  });
});

describe('the quarter’s targets come from where they were actually recorded', () => {
  it('prints the review’s own targets', () => {
    const page = buildPlanPage(input());
    const block = page.blocks[0] as any;
    expect(block.items.map((i: any) => i.value)).toEqual(['$100,000', '$40,000', '$10,000']);
  });

  it('falls back to the plan’s figures for that quarter when the review carries none', () => {
    // Reviews completed before the plan steps wrote targets back hold zeroes.
    const page = buildPlanPage(
      input({
        review: review({ quarterly_targets: { revenue: 0, grossProfit: 0, netProfit: 0, kpis: [] } }),
        quarterFromPlan: { revenue: 125000, grossProfit: 50000, netProfit: 12500 },
      })
    );
    const block = page.blocks[0] as any;
    expect(block.title).toBe('My targets this quarter');
    expect(block.items.map((i: any) => i.value)).toEqual(['$125,000', '$50,000', '$12,500']);
  });
});

describe('the file is named so three clients’ plans do not collide in a downloads folder', () => {
  it('leads with the business', () => {
    expect(planPdfFilename('Test ABC', 'Q2 FY2027 Plan')).toBe('Test ABC - Q2 FY2027 Plan.pdf');
  });

  it('copes with a name a file system would refuse, or no name at all', () => {
    expect(planPdfFilename('A/B: Pty Ltd', 'Q2 FY2027 Plan')).toBe('A B Pty Ltd - Q2 FY2027 Plan.pdf');
    expect(planPdfFilename(null, 'Q2 FY2027 Plan')).toBe('Q2 FY2027 Plan.pdf');
  });
});

describe('it is a ONE-page plan', () => {
  const pageCount = (doc: unknown) =>
    (doc as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();

  it('fits a full quarter — targets, year, three KPIs, three rocks, the one thing and commitments — on one page', () => {
    const page = buildPlanPage(
      input({
        businessName: 'Precision Electrical Group',
        review: review({
          quarterly_rocks: [
            { id: '1', title: 'Hire and onboard a second installer', owner: 'Sam', targetDate: '2026-11-30', successCriteria: 'Working unsupervised on residential jobs' },
            { id: '2', title: 'Move quoting onto the new template so every quote carries the 42% margin', owner: 'Priya', targetDate: '2026-10-31', successCriteria: 'All quotes out of the new system' },
            { id: '3', title: 'Collect the three overdue debtors', owner: 'Sam', successCriteria: '' },
          ],
          personal_commitments: {
            hoursPerWeekTarget: 45,
            daysOffPlanned: 7,
            daysOffScheduled: [],
            personalGoal: 'Coach my son’s cricket team every Saturday through the season.',
          },
          one_thing_answer: 'Getting the second installer productive, so I stop being the bottleneck on every job.',
        }),
        kpis: [
          { name: 'Money Coming In Each Month', target: 120000, unit: '$' },
          { name: 'Money You Keep After Direct Costs', target: 42, unit: '%' },
          { name: 'Number of Paying Customers', target: 180, unit: null },
        ],
      })
    );
    expect(pageCount(renderPlanPdf(page))).toBe(1);
  });

  it('runs onto a second page rather than clipping when a quarter has far more in it', () => {
    const page = buildPlanPage(
      input({
        review: review({
          quarterly_rocks: Array.from({ length: 7 }, (_, i) => ({
            id: String(i),
            title: `Rock ${i + 1} — a long commitment title that wraps onto a second line on the page`,
            owner: 'Someone With A Long Name',
            targetDate: '2026-12-15',
            successCriteria: 'A success measure long enough to wrap as well, so the block is as tall as it can get',
          })),
          personal_commitments: { hoursPerWeekTarget: 40, daysOffPlanned: 10, daysOffScheduled: [], personalGoal: 'A fortnight off in January.' },
          one_thing_answer: 'Finishing the backlog.',
        }),
        kpis: [{ name: 'Money Coming In Each Month', target: 120000, unit: '$' }],
      })
    );
    const doc = renderPlanPdf(page);
    expect(pageCount(doc)).toBe(2);
    // Every block still reached the paper — the last one is the proof.
    expect(page.blocks[page.blocks.length - 1].title).toBe('Next steps');
  });
});

// ---------------------------------------------------------------------------
// Gathering what the review row does not hold.
// ---------------------------------------------------------------------------
const resolveProfileId = vi.hoisted(() => vi.fn());
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileId: resolveProfileId,
}));

import { loadPlanPdfData } from '@/app/quarterly-review/services/quarterly-plan-pdf-data';

function fakeDb(state: { name?: any; goals?: any; goalsError?: any; kpis?: any[]; kpisError?: any }) {
  const seen: { table: string; filters: Record<string, unknown> }[] = [];
  const client = {
    from(table: string) {
      const entry = { table, filters: {} as Record<string, unknown> };
      seen.push(entry);
      const b: any = {
        select: () => b,
        eq: (col: string, val: unknown) => {
          entry.filters[col] = val;
          return b;
        },
        maybeSingle: async () =>
          table === 'businesses'
            ? { data: state.name ?? null, error: null }
            : { data: state.goals ?? null, error: state.goalsError ?? null },
        then: (resolve: any) =>
          Promise.resolve({ data: state.kpis ?? [], error: state.kpisError ?? null }).then(resolve),
      };
      return b;
    },
  };
  return { client, seen };
}

describe('the plan is read through the business, not through whoever is logged in', () => {
  beforeEach(() => {
    resolveProfileId.mockReset();
    resolveProfileId.mockResolvedValue('profile-1');
  });

  it('resolves the profile from the review’s business and reads the plan by it', async () => {
    // A coach exporting a client's plan has no plan of their own; resolving off
    // the signed-in user is how one client's figures reach another's page.
    const { client, seen } = fakeDb({
      name: { name: 'Test ABC' },
      goals: {
        revenue_year1: '400000',
        gross_profit_year1: '160000',
        net_profit_year1: '40000',
        year_type: 'FY',
        year1_end_date: '2027-06-30',
        quarterly_targets: { revenue: { q1: '100000', q2: '125000' }, grossProfit: { q2: '50000' }, netProfit: { q2: '12500' } },
      },
      kpis: [{ name: 'Monthly Revenue', friendly_name: 'Money Coming In Each Month', unit: '$', year1_target: 120000 }],
    });

    const data = await loadPlanPdfData(client as never, { business_id: 'biz-1', quarter: 2 } as never);

    expect(resolveProfileId).toHaveBeenCalledWith(client, 'biz-1');
    expect(seen.find(s => s.table === 'business_financial_goals')!.filters.business_id).toBe('profile-1');
    expect(seen.find(s => s.table === 'business_kpis')!.filters.business_id).toBe('profile-1');
    expect(data.businessName).toBe('Test ABC');
    expect(data.annual).toEqual({ revenue: 400000, grossProfit: 160000, netProfit: 40000, yearEnd: '2027-06-30' });
    // The planning quarter's own slice, not q1's.
    expect(data.quarterFromPlan).toEqual({ revenue: 125000, grossProfit: 50000, netProfit: 12500 });
    // The plain-English name is the one the client chose to see.
    expect(data.kpis).toEqual([{ name: 'Money Coming In Each Month', target: 120000, unit: '$' }]);
    expect(data.missing).toEqual([]);
  });

  it('names what it could not read instead of printing a plan that looks empty', async () => {
    const { client } = fakeDb({ name: { name: 'Test ABC' }, goalsError: { message: 'boom' }, kpisError: { message: 'boom' } });
    const data = await loadPlanPdfData(client as never, { business_id: 'biz-1', quarter: 2 } as never);
    expect(data.annual).toBeNull();
    expect(data.missing).toEqual(['this year’s targets', 'the numbers you’re watching']);
  });

  it('says so when the business has no profile at all, rather than reading nothing quietly', async () => {
    resolveProfileId.mockResolvedValue(null);
    const { client } = fakeDb({ name: { name: 'Test ABC' } });
    const data = await loadPlanPdfData(client as never, { business_id: 'biz-1', quarter: 2 } as never);
    expect(data.missing).toHaveLength(2);
    expect(data.kpis).toEqual([]);
  });
});
