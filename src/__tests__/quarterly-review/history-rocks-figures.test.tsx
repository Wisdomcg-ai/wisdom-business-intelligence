/**
 * The review History page says how the rocks actually went, names the quarter
 * each figure describes, and shows "—" when nothing was assessed.
 *
 * Found 26 Sep 2026 while building #608. The page counted rock.status ===
 * 'completed' over the rocks a review PLANNED, which are built from its
 * decisions as 'not_started' and never updated on the review. So "Rocks Done",
 * the Compare view's "Rocks Completion" and the "Avg Rocks Completion" card read
 * 0% for every review completed since #594 (24 Sep), and since #608 also for
 * four older reviews whose rocks it could now see, where they used to read "—".
 * Only Precision's seeded demo reviews carried a real status.
 *
 * How a quarter's rocks went is recorded one review later, in step 1.3
 * (rocks_review). Production, 26 Sep: Digital Bond's Q2 FY2027 review held its
 * five Q1 rocks to account, two completed, while its tile read 0% over the four
 * rocks it planned for Q2.
 *
 * Also pinned, all counts that read 0 because the reader's key was not the
 * writer's:
 * - the accountability counts read 'modified' and 'dropped', which step 1.3
 *   never writes ('modify', 'drop'). Efficient Living's Q2 FY2027 review
 *   modified one rock and dropped fourteen; History, the close screen and the
 *   summary said 0 and 0;
 * - History's Initiative Decisions counts read `action`; a decision is stored
 *   as `decision`, so Keep, Accelerate, Defer and Kill were always 0.
 * And a completed review with no completed_at said "Completed 1 Jan 1970".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InitiativeDecision, Rock, RockReviewDecision, RockReviewItem } from '@/app/quarterly-review/types';

const h = vi.hoisted(() => ({ reviews: [] as Record<string, unknown>[] }));

// One client and one router, as in the app: the page's effect depends on both,
// and a fresh object per render would re-run it every render.
vi.mock('@/lib/supabase/client', () => {
  const query: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) query[m] = () => query;
  query.maybeSingle = async () => ({ data: null, error: null });
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) }, from: () => query };
  return { createClient: () => client };
});
vi.mock('next/navigation', () => {
  const router = { push: () => undefined };
  return { useRouter: () => router, useParams: () => ({ id: 'el-q2' }) };
});
vi.mock('@/lib/business/resolveBusinessId', () => ({ resolveBusinessId: async () => ({ businessId: 'biz-1' }) }));
vi.mock('@/hooks/useBusinessContext', () => {
  const context = { activeBusiness: { id: 'biz-1' }, currentUser: { role: 'coach' }, isLoading: false };
  return { useBusinessContext: () => context };
});
vi.mock('@/hooks/useCoachView', () => ({ useCoachView: () => ({ getPath: (p: string) => p, isCoachView: false }) }));
vi.mock('@/app/quarterly-review/services/quarterly-review-service', () => ({
  quarterlyReviewService: {
    getAllReviews: async () => h.reviews,
    getReviewById: async (id: string) => h.reviews.find(r => r.id === id) ?? null,
  },
}));

import QuarterlyReviewHistoryPage from '@/app/quarterly-review/history/page';
import QuarterlySummaryPage from '@/app/quarterly-review/summary/[id]/page';
import { WorkshopCompleteStep } from '@/app/quarterly-review/components/steps/WorkshopCompleteStep';

const item = (title: string, decision: RockReviewDecision, over: Partial<RockReviewItem> = {}): RockReviewItem => ({
  rockId: `rock-${title}`,
  title,
  owner: '',
  successCriteria: '',
  progressPercentage: decision === 'completed' ? 100 : 0,
  decision,
  outcomeNarrative: '',
  lessonsLearned: '',
  ...over,
});

const planned = (quarter: number, titles: string[]) =>
  titles.map((title, i) => ({
    initiativeId: `${i + 1}0000000-0000-4000-8000-00000000000${quarter}`,
    title,
    category: 'operations',
    currentStatus: 'not_started',
    progressPercentage: 0,
    decision: 'keep',
    notes: '',
    quarterAssigned: `q${quarter}`,
  })) as InitiativeDecision[];

const review = (over: Record<string, unknown>) => ({
  business_id: 'biz-1',
  user_id: 'user-1',
  review_type: 'quarterly',
  status: 'completed',
  completed_at: '2026-09-25T00:51:00Z',
  annual_target_confidence: null,
  last_quarter_rating: null,
  energy_level: null,
  hours_worked_avg: null,
  days_off_taken: null,
  quarterly_targets: { revenue: 0, grossProfit: 0, netProfit: 0, kpis: [] },
  initiative_decisions: [],
  quarterly_rocks: [],
  rocks_review: [],
  customer_pulse: {},
  ...over,
});

/**
 * Digital Bond, newest first as getAllReviews returns them. Q2 FY2027 planned
 * four Q2 rocks and held five Q1 rocks to account (two done). Q1 FY2027 held two
 * Q4 FY2026 rocks to account (none done) and was completed with no date.
 */
const digitalBond = () => [
  review({
    id: 'db-q2',
    quarter: 2,
    year: 2027,
    initiative_decisions: planned(2, ['Build YouTube as a Core Growth Channel', 'Position Myself as the AI Systems Author', 'Hire someone to help with Ad campaigns', 'Determine how to get money off the table']),
    rocks_review: [
      item('Niche & Offer', 'completed'),
      item('Build YouTube as a Core Growth Channel', 'carry_forward'),
      item('Position Myself as the AI Systems Author', 'carry_forward', { progressPercentage: 75 }),
      item('Hire someone to help with Ad campaigns', 'carry_forward'),
      item('Messaging on Digital Bond Website - Update', 'completed'),
    ],
  }),
  review({
    id: 'db-q1',
    quarter: 1,
    year: 2027,
    completed_at: null,
    initiative_decisions: planned(1, ['Niche & Offer', 'Hire someone to help with Ad campaigns']),
    rocks_review: [item('Hire someone to help with Ad campaigns', 'carry_forward'), item('Niche & Offer', 'carry_forward', { progressPercentage: 75 })],
  }),
];

/** Efficient Living: Q2 FY2027 modified one rock and dropped fourteen copies; Q3 2026 has no step 1.3 record. */
const EL = ['Skilled overseas worker', 'Sales and Marketing', 'Due Date Focus', 'Process improvement and due date focus', 'Develop/upskill grads to increase profit'];
const efficientLiving = () => [
  review({
    id: 'el-q2',
    quarter: 2,
    year: 2027,
    // Shown each rock four times, the coach kept one copy and killed three.
    initiative_decisions: [
      ...planned(2, EL),
      ...planned(2, EL).flatMap(d => [1, 2, 3].map(n => ({ ...d, initiativeId: `${d.initiativeId}-${n}`, decision: 'kill' }))),
    ],
    rocks_review: [
      item(EL[0], 'carry_forward', { progressPercentage: 25 }),
      item(EL[0], 'carry_forward', { progressPercentage: 10 }),
      item(EL[1], 'carry_forward', { progressPercentage: 45 }),
      item(EL[2], 'carry_forward', { progressPercentage: 10 }),
      item(EL[3], 'carry_forward', { progressPercentage: 10 }),
      item(EL[4], 'modify', { progressPercentage: 75 }),
      ...EL.flatMap((title, i) => Array.from({ length: i === 0 ? 2 : 3 }, () => item(title, 'drop'))),
    ],
  }),
  review({
    id: 'el-q3-2026',
    quarter: 3,
    year: 2026,
    completed_at: '2026-03-20T01:02:00Z',
    initiative_decisions: planned(3, EL),
    rocks_review: [],
  }),
];

/** Precision's seeded demo review: rocks with the status someone set, no step 1.3 record. */
const precisionSeeded = () => [
  review({
    id: 'pe-q1-2026',
    quarter: 1,
    year: 2026,
    completed_at: '2025-09-26T00:00:00Z',
    quarterly_rocks: [
      { id: 'rock-q1-1', title: 'Launch SimPRO Scheduling Module', owner: 'James Mitchell', status: 'completed', progressPercentage: 100, successCriteria: '' },
      { id: 'rock-q1-3', title: 'Set Up Google Business Profile', owner: 'James Mitchell', status: 'completed', progressPercentage: 100, successCriteria: '' },
      { id: 'rock-q1-2', title: 'Hire 2 Replacement Electricians', owner: 'James Mitchell', status: 'on_track', progressPercentage: 60, successCriteria: '' },
    ] as Rock[],
  }),
];

/** JVJ's first session: three priorities the owner recalled. */
const jvjFirstSession = () => [
  review({
    id: 'jvj-q2',
    quarter: 2,
    year: 2027,
    completed_at: '2026-09-24T05:00:00Z',
    rocks_review: ['Building JVJ Hub', 'Implementation of automations', 'Training the team on AI & the hub'].map(title =>
      item(title, 'carry_forward', { progressPercentage: 50, selfReported: true }),
    ),
  }),
];

async function openHistory(reviews: Record<string, unknown>[]) {
  h.reviews = reviews;
  render(<QuarterlyReviewHistoryPage />);
  await screen.findByText('Quarterly Review Timeline');
}

/** The card for a review, expanded. */
async function expandCard(name: string) {
  const header = (await screen.findByRole('heading', { name })).closest('button') as HTMLElement;
  fireEvent.click(header);
  return header.parentElement as HTMLElement;
}

/** A metric tile: its figure and the label under it. */
const tile = (card: HTMLElement, label: string) => within(card).getByText(label).parentElement as HTMLElement;

describe('a review card says how LAST quarter\'s rocks went, and names that quarter', () => {
  beforeEach(() => {
    h.reviews = [];
  });

  it('shows Digital Bond\'s Q2 FY2027 review 40% for its Q1 rocks, not 0% for the Q2 rocks it planned', async () => {
    await openHistory(digitalBond());
    const card = await expandCard('Q2 2027');
    expect(tile(card, 'Q1 2027 Rocks Done').textContent).toBe('40%Q1 2027 Rocks Done');
    expect(within(card).getByText('Q1 2027 rocks: 2/5 done')).toBeTruthy();
    expect(within(card).queryByText('Rocks Done')).toBeNull();
  });

  it('shows a real 0% as 0%, on the Q1 FY2027 review of the Q4 FY2026 rocks', async () => {
    await openHistory(digitalBond());
    const card = await expandCard('Q1 2027');
    expect(tile(card, 'Q4 2026 Rocks Done').textContent).toBe('0%Q4 2026 Rocks Done');
  });

  it('shows "—" when the review holds no assessment, still naming the quarter', async () => {
    await openHistory(efficientLiving());
    const card = await expandCard('Q3 2026');
    expect(tile(card, 'Q2 2026 Rocks Done').textContent).toBe('—Q2 2026 Rocks Done');
    expect(within(card).queryByText(/Rocks Accountability/)).toBeNull();
  });

  it('lists the rocks the review set for its own quarter without a "0 completed" count', async () => {
    await openHistory(digitalBond());
    const card = await expandCard('Q2 2027');
    const heading = within(card).getByText(/90-Day Rocks for Q2 2027/);
    expect(heading.textContent).toBe('90-Day Rocks for Q2 2027');
  });

  it('keeps the count on rocks that carry the status someone set — Precision\'s seeded review', async () => {
    await openHistory(precisionSeeded());
    const card = await expandCard('Q1 2026');
    expect(within(card).getByText(/90-Day Rocks for Q1 2026/).textContent).toBe('90-Day Rocks for Q1 2026 (2/3 completed)');
    // Nothing held Q4 2025's rocks to account.
    expect(tile(card, 'Q4 2025 Rocks Done').textContent).toBe('—Q4 2025 Rocks Done');
  });

  it('calls a first session\'s recalled priorities what they are', async () => {
    await openHistory(jvjFirstSession());
    const card = await expandCard('Q2 2027');
    expect(tile(card, 'Q1 2027 Priorities Done').textContent).toBe('0%Q1 2027 Priorities Done');
    expect(within(card).getByText('Q1 2027 Priorities (self-reported)')).toBeTruthy();
  });

  it('says "Completed" with no date rather than 1 Jan 1970', async () => {
    await openHistory(digitalBond());
    const header = (await screen.findByRole('heading', { name: 'Q1 2027' })).closest('button') as HTMLElement;
    expect(within(header).getByText('Completed')).toBeTruthy();
    expect(header.textContent).not.toMatch(/1970/);
  });
});

describe('the accountability counts read the decisions step 1.3 writes', () => {
  it('shows Efficient Living\'s one modified and fourteen dropped rocks', async () => {
    await openHistory(efficientLiving());
    const card = await expandCard('Q2 2027');
    const block = within(card).getByText('Q1 2027 Rocks Accountability').parentElement as HTMLElement;
    const count = (label: string) => within(block).getByText(label).previousElementSibling?.textContent;
    expect([count('Done'), count('Carry'), count('Modified'), count('Dropped')]).toEqual(['0', '5', '1', '14']);
  });

  it('counts the initiative decisions by the decision each holds', async () => {
    // Every decision in production stores `decision` (239 on 26 Sep 2026); the
    // card read `action`, so Keep, Accelerate, Defer and Kill were all 0.
    await openHistory(efficientLiving());
    const card = await expandCard('Q2 2027');
    const block = within(card).getByText('Initiative Decisions (20)').parentElement as HTMLElement;
    const count = (label: string) => within(block).getByText(label).previousElementSibling?.textContent;
    expect([count('keep'), count('accelerate'), count('defer'), count('kill')]).toEqual(['5', '0', '0', '15']);
  });

  it('shows them on the close screen too', () => {
    const [q2] = efficientLiving();
    const html = renderToStaticMarkup(<WorkshopCompleteStep review={q2 as never} />);
    const section = html.slice(html.indexOf('Last Quarter Rocks Review'));
    const counts = [...section.matchAll(/text-2xl font-bold text-(?:green|blue|amber|red)-600">(\d+)<\/div><div class="text-xs text-gray-500">([^<]+)</g)]
      .slice(0, 4)
      .map(m => `${m[2]} ${m[1]}`);
    expect(counts).toEqual(['Completed 0', 'Carry Forward 5', 'Modified 1', 'Dropped 14']);
  });

  it('shows them on the summary, naming the quarter, and marks a modified rock as modified — not dropped', async () => {
    h.reviews = efficientLiving();
    render(<QuarterlySummaryPage />);
    const section = (await screen.findByText('Q1 2027 Rocks Accountability')).closest('section') as HTMLElement;
    const count = (label: string) => within(section).getAllByText(label)[0].previousElementSibling?.textContent;
    expect([count('Completed'), count('Carry Forward'), count('Modified'), count('Dropped')]).toEqual(['0', '5', '1', '14']);
    // Each rock's chip. The modified one (the first listing of its title) used
    // to show red, like a drop.
    const chipFor = (index: number) =>
      within(section).getAllByText(EL[4], { selector: 'p' })[index].parentElement?.nextElementSibling as HTMLElement;
    expect([chipFor(0).textContent, chipFor(1).textContent]).toEqual(['Modified', 'Dropped']);
    expect(chipFor(0).className).toContain('bg-amber-100');
    expect(chipFor(1).className).toContain('bg-red-100');
  });
});

describe('Compare and the trend card use the same figures', () => {
  it('compares Q4 2026\'s 0% with Q1 2027\'s 40% as +40%', async () => {
    await openHistory(digitalBond());
    fireEvent.click(screen.getByRole('button', { name: /Compare Quarters/ }));
    for (const name of ['Q2 2027', 'Q1 2027']) {
      const header = screen.getByRole('heading', { name }).closest('button') as HTMLElement;
      fireEvent.click(header.querySelector('button') as HTMLElement);
    }
    const row = (await screen.findByText('Rocks Completion')).closest('tr') as HTMLElement;
    const cells = within(row).getAllByRole('cell').map(c => c.textContent);
    expect(cells).toEqual(['Rocks Completion', '0%Q4 2026 rocks', '40%Q1 2027 rocks', '+40%']);
  });

  it('averages the quarters held to account and names them', async () => {
    await openHistory(digitalBond());
    const card = (await screen.findByText('Avg Rocks Completion')).parentElement?.parentElement as HTMLElement;
    expect(card.textContent).toBe('Avg Rocks Completion20%across 2 quarters · Q4 2026 – Q1 2027');
  });

  it('shows "—" when no completed review held a quarter\'s rocks to account', async () => {
    await openHistory([...efficientLiving().slice(1), review({ id: 'el-q4-2025', quarter: 4, year: 2025, completed_at: '2025-12-17T00:00:00Z' })]);
    const card = (await screen.findByText('Avg Rocks Completion')).parentElement?.parentElement as HTMLElement;
    expect(card.textContent).toBe('Avg Rocks Completion—no quarter’s rocks reviewed yet');
  });
});
