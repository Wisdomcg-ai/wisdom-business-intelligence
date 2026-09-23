/**
 * First session, steps 3 and 5.
 *
 * Both screens exist because the standard ones are dead ends for a first-timer:
 * step 3 showed "No Previous Rocks Found" and nothing to do, and step 5 offered
 * triage of two empty lists — the single most valuable screen in the session
 * reading as "you have nothing".
 *
 * What is pinned:
 *   3 — what the owner types becomes rocks_review, marked self-reported, with
 *       anything unfinished carried forward; blank rows are not priorities they
 *       failed; and the screen survives a reload.
 *   5 — each line lands in the REAL Open Loops / Issues list, against the
 *       CLIENT's business (a coach runs this), and a failed save keeps what they
 *       typed instead of eating it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import {
  toRocksReview,
  fromRocksReview,
  summarise,
  decisionFor,
  FOUNDATION_PRIORITY_LIMIT,
  type FoundationPriority,
} from '@/app/quarterly-review/utils/foundation-rocks';

const row = (over: Partial<FoundationPriority> = {}): FoundationPriority => ({
  id: 'self-1',
  title: 'Hire a second technician',
  outcome: 'landed',
  note: '',
  ...over,
});

describe('step 3 — what the owner says they were working on', () => {
  it('records it as a rock review item, marked as their own words', () => {
    const [item] = toRocksReview([row({ note: 'Started in October' })]);
    expect(item).toEqual({
      rockId: 'self-1',
      title: 'Hire a second technician',
      owner: '',
      successCriteria: '',
      progressPercentage: 100,
      decision: 'completed',
      outcomeNarrative: 'Started in October',
      lessonsLearned: '',
      // Everything else in rocks_review came from a rock the system held. This
      // did not, and a reader has to be able to tell the difference.
      selfReported: true,
    });
  });

  it('carries anything unfinished forward rather than dropping it', () => {
    expect(decisionFor('landed')).toBe('completed');
    expect(decisionFor('partly')).toBe('carry_forward');
    expect(decisionFor('didnt')).toBe('carry_forward');
    const items = toRocksReview([row({ outcome: 'partly' }), row({ id: 'self-2', outcome: 'didnt' })]);
    expect(items.map(i => i.progressPercentage)).toEqual([50, 0]);
    expect(items.every(i => i.decision === 'carry_forward')).toBe(true);
  });

  it('does not record a blank row as a priority they failed', () => {
    expect(toRocksReview([row({ title: '   ' }), row({ id: 'self-2', title: 'Real one' })])).toHaveLength(1);
  });

  it('keeps a priority that has been named but not yet answered', () => {
    const [item] = toRocksReview([row({ outcome: null, title: 'Typed, mid-sentence' })]);
    expect(item.title).toBe('Typed, mid-sentence');
    expect(item.progressPercentage).toBe(0);
  });

  it('reads back what was stored, so the step survives a reload', () => {
    const stored = toRocksReview([
      row({ outcome: 'landed' }),
      row({ id: 'self-2', title: 'Fix the quoting process', outcome: 'partly', note: 'Half done' }),
      row({ id: 'self-3', title: 'Website', outcome: 'didnt', note: '' }),
    ]);
    expect(fromRocksReview(stored).map(r => ({ t: r.title, o: r.outcome, n: r.note }))).toEqual([
      { t: 'Hire a second technician', o: 'landed', n: '' },
      { t: 'Fix the quoting process', o: 'partly', n: 'Half done' },
      { t: 'Website', o: 'didnt', n: '' },
    ]);
  });

  it('counts what landed for the line the coach reads out', () => {
    expect(summarise([row(), row({ id: 'self-2', outcome: 'didnt' }), row({ id: 'self-3', outcome: null })])).toEqual({
      answered: 2,
      landed: 1,
      carried: 1,
    });
  });

  it('asks for three — more than that is a list, not a set of priorities', () => {
    expect(FOUNDATION_PRIORITY_LIMIT).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// The screens.
// ---------------------------------------------------------------------------
const ctx = vi.hoisted(() => ({ activeBusiness: { id: 'client-biz-1', ownerId: 'client-owner-1' } as any }));
const loops = vi.hoisted(() => ({ list: [] as any[], create: vi.fn(), listErr: null as any }));
const issues = vi.hoisted(() => ({ list: [] as any[], create: vi.fn(), listErr: null as any }));

vi.mock('@/hooks/useBusinessContext', () => ({ useBusinessContext: () => ctx }));
vi.mock('@/app/quarterly-review/utils/capture-write-failure', () => ({ captureReviewWriteFailure: vi.fn() }));
vi.mock('@/lib/services/openLoopsService', () => ({
  getOpenLoops: async (...args: unknown[]) => {
    loops.listArgs = args;
    if (loops.listErr) throw loops.listErr;
    return loops.list;
  },
  createOpenLoop: (...args: unknown[]) => loops.create(...args),
}));
vi.mock('@/lib/services/issuesService', () => ({
  getActiveIssues: async (...args: unknown[]) => {
    issues.listArgs = args;
    if (issues.listErr) throw issues.listErr;
    return issues.list;
  },
  createIssue: (...args: unknown[]) => issues.create(...args),
}));

import { FoundationRocksStep } from '@/app/quarterly-review/components/steps/FoundationRocksStep';
import { FoundationOpenItemsStep } from '@/app/quarterly-review/components/steps/FoundationOpenItemsStep';

const review: any = { id: 'r1', business_id: 'client-biz-1', quarter: 2, year: 2027, rocks_review: [] };

beforeEach(() => {
  cleanup();
  loops.list = [];
  issues.list = [];
  loops.listErr = null;
  issues.listErr = null;
  loops.create.mockReset().mockResolvedValue({ id: 'loop-new' });
  issues.create.mockReset().mockResolvedValue({ id: 'issue-new' });
});

describe('step 3 on screen', () => {
  it('asks about the quarter that just ended, not the one being planned', () => {
    render(<FoundationRocksStep review={review} onUpdate={vi.fn()} yearType="FY" />);
    // Planning Q2 FY2027 means reflecting on Q1 FY2027.
    expect(screen.getByText(/Q1 FY2027 \(July to September\)/)).toBeTruthy();
  });

  it('saves what was typed, as soon as it is typed', () => {
    const onUpdate = vi.fn();
    const { container } = render(<FoundationRocksStep review={review} onUpdate={onUpdate} yearType="FY" />);

    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Hire a second technician' } });
    fireEvent.click(screen.getByRole('button', { name: 'Partly there' }));

    const last = onUpdate.mock.calls.at(-1)![0];
    expect(last[0]).toMatchObject({
      title: 'Hire a second technician',
      decision: 'carry_forward',
      progressPercentage: 50,
      selfReported: true,
    });
  });

  it('shows what was already recorded when the step is reopened', () => {
    const stored = toRocksReview([row({ title: 'Fix the quoting process', outcome: 'didnt' })]);
    const { container } = render(
      <FoundationRocksStep review={{ ...review, rocks_review: stored }} onUpdate={vi.fn()} yearType="FY" />
    );
    expect((container.querySelector('input[type="text"]') as HTMLInputElement).value).toBe('Fix the quoting process');
    expect(screen.getByRole('button', { name: 'Didn’t happen' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('step 5 on screen', () => {
  it('puts a captured line on the CLIENT’s list, not the coach’s', async () => {
    // A coach runs this in the session. Creating against their own business is
    // how one client's backlog ends up on another's board.
    render(<FoundationOpenItemsStep review={review} />);
    await waitFor(() => expect(screen.getByPlaceholderText(/Henderson quote/)).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText(/Henderson quote/), {
      target: { value: 'The Henderson quote still isn’t out' },
    });
    fireEvent.click(screen.getByLabelText('Add to Open Loops'));

    await waitFor(() => expect(loops.create).toHaveBeenCalled());
    const [input, , businessId] = loops.create.mock.calls[0];
    expect(businessId).toBe('client-biz-1');
    expect(input).toMatchObject({ title: 'The Henderson quote still isn’t out', status: 'in-progress' });
    // And it shows on the list straight away.
    expect(await screen.findByText('The Henderson quote still isn’t out')).toBeTruthy();
  });

  it('sends a problem to the Issues list instead', async () => {
    render(<FoundationOpenItemsStep review={review} />);
    await waitFor(() => expect(screen.getByPlaceholderText(/running out of stock/)).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText(/running out of stock/), {
      target: { value: 'We keep running out of stock' },
    });
    fireEvent.click(screen.getByLabelText('Add to Issues'));

    await waitFor(() => expect(issues.create).toHaveBeenCalled());
    expect(issues.create.mock.calls[0][0]).toMatchObject({ title: 'We keep running out of stock', status: 'new' });
    expect(loops.create).not.toHaveBeenCalled();
  });

  it('keeps what they typed when the save fails, and says so', async () => {
    loops.create.mockRejectedValue(new Error('network'));
    render(<FoundationOpenItemsStep review={review} />);
    await waitFor(() => expect(screen.getByPlaceholderText(/Henderson quote/)).toBeTruthy());

    const box = screen.getByPlaceholderText(/Henderson quote/) as HTMLInputElement;
    fireEvent.change(box, { target: { value: 'Something worth keeping' } });
    fireEvent.click(screen.getByLabelText('Add to Open Loops'));

    expect(await screen.findByText(/still in the box/)).toBeTruthy();
    expect(box.value).toBe('Something worth keeping');
  });

  it('shows what is already on the lists rather than two empty boxes', async () => {
    loops.list = [{ id: 'l1', title: 'Existing loop' }];
    issues.list = [{ id: 'i1', title: 'Existing issue' }];
    render(<FoundationOpenItemsStep review={review} />);

    expect(await screen.findByText('Existing loop')).toBeTruthy();
    expect(screen.getByText('Existing issue')).toBeTruthy();
  });

  it('says so when the lists could not be read, instead of implying they are empty', async () => {
    loops.listErr = new Error('boom');
    render(<FoundationOpenItemsStep review={review} />);
    // Apostrophe-agnostic: the component writes &apos;, which renders straight.
    expect(await screen.findByText(/couldn.t load what.s already on these lists/)).toBeTruthy();
  });
});
