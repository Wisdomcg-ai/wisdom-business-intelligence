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
  planYearCoversQuarter,
  MAX_KPIS_ON_PAGE,
  type PlanPageInput,
} from '@/app/quarterly-review/utils/quarterly-plan-page';
// The PDF derives rocks with the WRITER's own helper (#594), so it is tested
// against the same module the writer uses.
import { rocksFromDecisions, isForPlannedQuarter } from '@/app/quarterly-review/utils/rocks-from-decisions';
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

// ---------------------------------------------------------------------------
// Both found by exporting a REAL review live (Precision Electrical Group,
// Q2 FY2026, 23 Sep 2026) rather than from the sample data above.
// ---------------------------------------------------------------------------

describe('the numbers watched are the ones THAT quarter committed to', () => {
  const tenActiveKpis = Array.from({ length: 10 }, (_, i) => ({ name: `Business KPI ${i + 1}`, target: 0, unit: null }));

  it('prints the review’s own three, not the ten the business tracks today', () => {
    // The live page listed Monthly Revenue, Gross Margin, Debtor Days … — the
    // business's current set — over a plan whose quarter targeted three.
    const page = buildPlanPage(
      input({
        review: review({
          quarterly_targets: {
            revenue: 870000,
            grossProfit: 365400,
            netProfit: 117000,
            kpis: [
              { id: 'kpi-leads', name: 'Leads Per Month', target: 140, unit: 'leads' },
              { id: 'kpi-conversion', name: 'Quote Win Rate', target: 65, unit: '%' },
              { id: 'kpi-atv', name: 'Average Job Value', target: 1150, unit: '$' },
            ],
          },
        }),
        kpis: tenActiveKpis,
      })
    );
    const watching = page.blocks.find(b => b.title === 'Numbers I’m watching') as any;
    expect(watching.items.map((i: any) => i.text)).toEqual(['Leads Per Month', 'Quote Win Rate', 'Average Job Value']);
    expect(watching.items.map((i: any) => i.detail)).toEqual(['Target 140 leads', 'Target 65%', 'Target $1,150']);
  });

  it('falls back to the business’s KPIs for a first session, which targeted none', () => {
    const page = buildPlanPage(input({ kpis: [{ name: 'Money Coming In Each Month', target: 0, unit: '$' }] }));
    const watching = page.blocks.find(b => b.title === 'Numbers I’m watching') as any;
    expect(watching.items[0].text).toBe('Money Coming In Each Month');
  });

  it('caps the list, and says how many it left off rather than shortening it quietly', () => {
    const page = buildPlanPage(input({ kpis: tenActiveKpis }));
    const watching = page.blocks.find(b => b.title === 'Numbers I’m watching') as any;
    expect(watching.items).toHaveLength(MAX_KPIS_ON_PAGE + 1);
    expect(watching.items[MAX_KPIS_ON_PAGE].text).toBe('and 4 more on your KPI dashboard');
  });
});

describe('the year printed is the quarter’s own year', () => {
  it('leaves the year off when the plan has rolled past that quarter', () => {
    // Live: a Q2 FY2026 plan (October to December 2025) printed "The year to
    // 30 June 2027" with today's targets — a year that quarter knew nothing of.
    expect(planYearCoversQuarter('2027-06-30', 2, 2026, 'FY')).toBe(false);
    const page = buildPlanPage(input({ review: review({ quarter: 2, year: 2026 }) }));
    expect(page.blocks.map(b => b.title)).not.toContain('The year to 30 June 2027');
    // The quarter's own targets still print.
    expect(page.blocks[0].title).toBe('My targets this quarter');
  });

  it('keeps it for a quarter inside the plan year — including the last one', () => {
    expect(planYearCoversQuarter('2027-06-30', 1, 2027, 'FY')).toBe(true);
    expect(planYearCoversQuarter('2027-06-30', 4, 2027, 'FY')).toBe(true);
    expect(planYearCoversQuarter('2027-12-31', 4, 2027, 'CY')).toBe(true);
    expect(titles(input())).toContain('The year to 30 June 2027');
  });

  it('shows it when the plan has no year-end to place it by', () => {
    expect(planYearCoversQuarter(null, 2, 2026, 'FY')).toBe(true);
    const page = buildPlanPage(
      input({ review: review({ quarter: 2, year: 2026 }), annual: { revenue: 400000, grossProfit: 160000, netProfit: 40000, yearEnd: null } })
    );
    expect(page.blocks.map(b => b.title)).toContain('The year');
  });
});

// ---------------------------------------------------------------------------
// Found 24 Sep 2026 by walking a whole first session on production and
// exporting the PDF at the end: the rock set in Sprint Planning was not on it.
// ---------------------------------------------------------------------------

/** The exact record step 4.3 wrote in that session. */
const sprintDecision = (over: Record<string, unknown> = {}) => ({
  why: '',
  notes: '',
  tasks: [],
  title: 'Finish the quoting template rollout',
  outcome: '',
  category: 'other',
  decision: 'keep',
  milestones: [],
  totalHours: 0,
  initiativeId: 'sprint-new-1790198021629',
  currentStatus: 'active',
  quarterAssigned: 'q2',
  progressPercentage: 0,
  ...over,
});

describe('the rocks the session actually set reach the page', () => {
  it('prints a rock that Sprint Planning recorded, even though quarterly_rocks is empty', () => {
    // Step 4.3 writes initiative_decisions; nothing routed writes quarterly_rocks.
    const page = buildPlanPage(
      input({ review: review({ quarterly_rocks: [], initiative_decisions: [sprintDecision()] }) })
    );
    const rocks = page.blocks.find(b => b.title === 'My rocks this quarter') as any;
    expect(rocks.items.map((i: any) => i.text)).toEqual(['Finish the quoting template rollout']);
  });

  it('leaves off what the session decided NOT to do this quarter', () => {
    expect(
      rocksFromDecisions(
        [
          sprintDecision({ title: 'Doing it', decision: 'keep' }),
          sprintDecision({ title: 'Pushing harder', decision: 'accelerate' }),
          sprintDecision({ title: 'Deferred', decision: 'defer' }),
          sprintDecision({ title: 'Killed', decision: 'kill' }),
        ] as never,
        2
      ).map(r => r.title)
    ).toEqual(['Doing it', 'Pushing harder']);
  });

  it('leaves off a decision tagged for a different quarter, and keeps an untagged one', () => {
    expect(
      rocksFromDecisions(
        [
          sprintDecision({ title: 'Next quarter', quarterAssigned: 'q3' }),
          sprintDecision({ title: 'This quarter', quarterAssigned: 'q2' }),
          sprintDecision({ title: 'Untagged', quarterAssigned: undefined }),
        ] as never,
        2
      ).map(r => r.title)
    ).toEqual(['This quarter', 'Untagged']);
  });

  it('names who owns it and when it is due, when the session said so', () => {
    const page = buildPlanPage(
      input({
        review: review({
          quarterly_rocks: [],
          initiative_decisions: [
            sprintDecision({ assignedTo: 'Sam', endDate: '2026-11-30', outcome: 'Every quote on the new template' }),
          ],
        }),
      })
    );
    const rocks = page.blocks.find(b => b.title === 'My rocks this quarter') as any;
    expect(rocks.items[0].detail).toBe('Sam · by 30 November 2026 — Every quote on the new template');
  });

  it('still prefers real rocks when a review has them', () => {
    // Older reviews (and the seeded ones) carry quarterly_rocks with owner and date.
    const page = buildPlanPage(
      input({
        review: review({
          quarterly_rocks: [{ id: '1', title: 'The real rock', owner: 'Sam', successCriteria: '' }],
          initiative_decisions: [sprintDecision({ title: 'The decision' })],
        }),
      })
    );
    const rocks = page.blocks.find(b => b.title === 'My rocks this quarter') as any;
    expect(rocks.items.map((i: any) => i.text)).toEqual(['The real rock']);
  });

  it('shows no rocks block when the session set none', () => {
    const page = buildPlanPage(input({ review: review({ quarterly_rocks: [], initiative_decisions: [] }) }));
    expect(page.blocks.map(b => b.title)).not.toContain('My rocks this quarter');
  });
});

// ---------------------------------------------------------------------------
// Found the same morning, checking #593 against a real completed review before
// declaring it done: "unassigned" is a literal value, and the most common one.
// ---------------------------------------------------------------------------

/** Digital Bond's completed Q1 FY2027 review, decisions exactly as stored. */
const digitalBondDecisions = [
  ['Niche & Offer', 'q3'],
  ['Hire someone to help with Ad campaigns', 'q3'],
  ['Messaging on Digital Bond Website - Update', 'unassigned'],
  ['Process for delivering a scalable solution', 'unassigned'],
  ['Messaging on Digital Bond Website - Update', 'unassigned'],
  ['Process for delivering a scalable solution', 'unassigned'],
  ['Determine how to get money off the table and invest', 'unassigned'],
  ['Determine how to get money off the table and invest', 'unassigned'],
  ['Develop a leveraged sales process', 'unassigned'],
  ['Delegate Sales Calls', 'unassigned'],
].map(([title, q], i) => sprintDecision({ title, quarterAssigned: q, initiativeId: `db-${i}` }));

describe('"unassigned" work is the quarter being planned', () => {
  it('treats the literal "unassigned" the same as no tag at all', () => {
    // 81 of 150 decisions in production carry it — the most common value.
    expect(isForPlannedQuarter({ quarterAssigned: 'unassigned' }, 1)).toBe(true);
    expect(isForPlannedQuarter({ quarterAssigned: undefined }, 1)).toBe(true);
    expect(isForPlannedQuarter({ quarterAssigned: '' }, 1)).toBe(true);
  });

  it('reads the tag regardless of case or stray spaces', () => {
    expect(isForPlannedQuarter({ quarterAssigned: 'Unassigned' }, 1)).toBe(true);
    expect(isForPlannedQuarter({ quarterAssigned: ' Q1 ' }, 1)).toBe(true);
    expect(isForPlannedQuarter({ quarterAssigned: 'q3' }, 1)).toBe(false);
  });

  it('prints Digital Bond’s five rocks — not zero, and not eight', () => {
    const page = buildPlanPage(
      input({ review: review({ quarter: 1, quarterly_rocks: [], initiative_decisions: digitalBondDecisions }) })
    );
    const rocks = page.blocks.find(b => b.title === 'My rocks this quarter') as any;
    expect(rocks.items.map((i: any) => i.text)).toEqual([
      'Messaging on Digital Bond Website - Update',
      'Process for delivering a scalable solution',
      'Determine how to get money off the table and invest',
      'Develop a leveraged sales process',
      'Delegate Sales Calls',
    ]);
  });
});

describe('the same rock is listed once', () => {
  it('drops a repeated title, however it is spaced or capitalised', () => {
    const page = buildPlanPage(
      input({
        review: review({
          quarterly_rocks: [],
          initiative_decisions: [
            sprintDecision({ title: 'Delegate Sales Calls' }),
            sprintDecision({ title: '  delegate   sales calls ' }),
          ],
        }),
      })
    );
    const rocks = page.blocks.find(b => b.title === 'My rocks this quarter') as any;
    expect(rocks.items).toHaveLength(1);
  });

  it('keeps the owner and date when only one copy carried them', () => {
    const page = buildPlanPage(
      input({
        review: review({
          quarterly_rocks: [],
          initiative_decisions: [
            sprintDecision({ title: 'Hire', assignedTo: '' }),
            sprintDecision({ title: 'Hire', assignedTo: 'Sam', endDate: '2026-11-30' }),
          ],
        }),
      })
    );
    const rocks = page.blocks.find(b => b.title === 'My rocks this quarter') as any;
    expect(rocks.items).toEqual([{ text: 'Hire', detail: 'Sam · by 30 November 2026' }]);
  });

  it('applies to stored rocks as well, so both sources print the same page', () => {
    const page = buildPlanPage(
      input({
        review: review({
          quarterly_rocks: [
            { id: '1', title: 'Hire', owner: 'Sam', successCriteria: '' },
            { id: '2', title: 'Hire', owner: 'Sam', successCriteria: '' },
          ],
        }),
      })
    );
    const rocks = page.blocks.find(b => b.title === 'My rocks this quarter') as any;
    expect(rocks.items).toHaveLength(1);
  });
});

describe('repeated copies fill each other in, field by field', () => {
  it('takes the owner from one copy and the date from another — Efficient Living’s shape', () => {
    // Four copies of "Due Date Focus"; exactly one carries the owner.
    const page = buildPlanPage(
      input({
        review: review({
          quarterly_rocks: [],
          initiative_decisions: [
            sprintDecision({ title: 'Due Date Focus', initiativeId: 'a' }),
            sprintDecision({ title: 'Due Date Focus', initiativeId: 'b', assignedTo: 'Priya' }),
            sprintDecision({ title: 'due date focus', initiativeId: 'c', endDate: '2026-12-15' }),
            sprintDecision({ title: 'Due Date Focus', initiativeId: 'd', outcome: 'Every job invoiced on time' }),
          ],
        }),
      })
    );
    const rocks = page.blocks.find(b => b.title === 'My rocks this quarter') as any;
    expect(rocks.items).toEqual([
      { text: 'Due Date Focus', detail: 'Priya · by 15 December 2026 — Every job invoiced on time' },
    ]);
  });

  it('never lets a copy tagged for another quarter lend this one its owner', () => {
    const [rock] = rocksFromDecisions(
      [
        sprintDecision({ title: 'Hire', quarterAssigned: 'unassigned' }),
        sprintDecision({ title: 'Hire', quarterAssigned: 'q3', assignedTo: 'Someone else' }),
      ] as never,
      2
    );
    expect(rock.owner).toBe('');
  });

  it('never overwrites what the first copy already said', () => {
    const [rock] = rocksFromDecisions(
      [
        sprintDecision({ title: 'Hire', assignedTo: 'Sam' }),
        sprintDecision({ title: 'Hire', assignedTo: 'Priya' }),
      ] as never,
      2
    );
    expect(rock.owner).toBe('Sam');
  });

  it('keeps every decision behind a rock, so it can be traced back', () => {
    const [rock] = rocksFromDecisions(
      [sprintDecision({ title: 'Hire', initiativeId: 'x' }), sprintDecision({ title: 'Hire', initiativeId: 'y' })] as never,
      2
    );
    expect(rock.linkedInitiatives).toEqual(['x', 'y']);
  });
});

// ---------------------------------------------------------------------------
// Found 24 Sep 2026 exporting Digital Bond's plan live, after #595.
// ---------------------------------------------------------------------------

describe('a KPI target reads in its own units, however the unit was spelled', () => {
  it('prints money as money, whichever word the KPI stored', () => {
    // Production spells it three ways.
    for (const unit of ['$', 'currency', 'dollar', ' Currency ']) {
      expect(kpiTargetLabel({ name: 'Revenue', target: 300000, unit })).toBe('$300,000');
    }
  });

  it('prints a percentage as a percentage', () => {
    for (const unit of ['%', 'percentage', 'percent', 'PERCENT']) {
      expect(kpiTargetLabel({ name: 'Margin', target: 30, unit })).toBe('30%');
    }
  });

  it('prints a plain count as just the number', () => {
    expect(kpiTargetLabel({ name: 'Hours', target: 30, unit: 'number' })).toBe('30');
    expect(kpiTargetLabel({ name: 'Hours', target: 1200, unit: null })).toBe('1,200');
  });

  it('keeps a real unit as a word, including ones that merely START with a unit word', () => {
    expect(kpiTargetLabel({ name: 'Leads', target: 140, unit: 'leads' })).toBe('140 leads');
    expect(kpiTargetLabel({ name: 'Time', target: 40, unit: 'hours per quarter' })).toBe('40 hours per quarter');
    expect(kpiTargetLabel({ name: 'Budget', target: 80, unit: 'percent of allocated budget used' })).toBe(
      '80 percent of allocated budget used'
    );
    expect(kpiTargetLabel({ name: 'Fees', target: 5000, unit: 'AUD per clinician' })).toBe('5,000 AUD per clinician');
  });

  it('prints Digital Bond’s four KPIs the way a client reads them', () => {
    const page = buildPlanPage(
      input({
        review: review({
          quarter: 1,
          quarterly_targets: {
            revenue: 280000,
            grossProfit: 252000,
            netProfit: 140000,
            kpis: [
              { id: '1', name: 'Revenue - AI Systems Lab', target: 300000, unit: 'currency' },
              { id: '2', name: "Adam's Time Delivering Projects", target: 30, unit: 'number' },
              { id: '3', name: 'Revenue - Partnerships', target: 750000, unit: 'currency' },
              { id: '4', name: 'Work Done by Systems vs Humans', target: 30, unit: 'percentage' },
            ],
          },
        }),
      })
    );
    const watching = page.blocks.find(b => b.title === 'Numbers I’m watching') as any;
    expect(watching.items.map((i: any) => i.detail)).toEqual([
      'Target $300,000',
      'Target 30',
      'Target $750,000',
      'Target 30%',
    ]);
  });
});

describe('a stored rock with no title is not a rock', () => {
  it('prints no blank bullet for Envisage’s Q4 2025 row, exactly as stored', () => {
    const page = buildPlanPage(
      input({
        review: review({
          quarterly_rocks: [
            { id: 'rock-1764161895890', owner: '', title: '', status: 'not_started', priority: 1, doneDefinition: '' },
          ],
          initiative_decisions: [],
        }),
      })
    );
    expect(page.blocks.map(b => b.title)).not.toContain('My rocks this quarter');
  });

  it('still prints a legacy rock that only has the old "definition of done"', () => {
    const page = buildPlanPage(
      input({
        review: review({
          quarterly_rocks: [{ id: 'r', title: 'Launch the site', owner: 'Sam', doneDefinition: 'Live with SEO copy' }],
        }),
      })
    );
    const rocks = page.blocks.find(b => b.title === 'My rocks this quarter') as any;
    expect(rocks.items).toEqual([{ text: 'Launch the site', detail: 'Sam — Live with SEO copy' }]);
  });
});
