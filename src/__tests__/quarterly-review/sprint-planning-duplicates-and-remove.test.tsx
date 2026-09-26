/**
 * Step 4.3 against JVJ Civil and Asphalt's decisions as stored on 25 Sep 2026:
 * repeats are flagged for the coach to choose, and "Remove rock" works on any
 * rock and stays removed.
 *
 * Before: five cards with no word of the repeats; "Remove Initiative" only on a
 * rock added in 4.3; and removing it came straight back within a second,
 * because only the step's working copy changed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, act, cleanup, within } from '@testing-library/react';
import { useState } from 'react';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => {
      const b: any = {
        select: () => b,
        eq: () => b,
        in: () => b,
        order: () => b,
        maybeSingle: async () => ({ data: { id: 'p1', key_roles: [], owner_info: {} }, error: null }),
        then: (r: any) => Promise.resolve({ data: [], error: null }).then(r),
      };
      return b;
    },
  }),
}));
vi.mock('@/hooks/useBusinessContext', () => ({ useBusinessContext: () => ({ activeBusiness: null }) }));
vi.mock('@/app/goals/services/operational-activities-service', () => ({
  OperationalActivitiesService: { loadActivities: async () => [] },
}));
vi.mock('@/app/goals/components/OperationalPlanTab', () => ({ default: () => null }));

import { QuarterlyRocksStep } from '@/app/quarterly-review/components/steps/QuarterlyRocksStep';
import type { InitiativeDecision } from '@/app/quarterly-review/types';

const TRAINING_ROW = '05af7ff5-6023-4f36-b4b0-7db83c7c3740';
const KPI_ROW = '5d9fb9c9-11e6-4325-8d25-4d6ab6a9b2e1';

const decision = (initiativeId: string, title: string, quarterAssigned = 'q2', over: Partial<InitiativeDecision> = {}) =>
  ({
    initiativeId,
    title,
    category: 'people',
    currentStatus: 'not_started',
    progressPercentage: 0,
    decision: 'keep',
    notes: '',
    quarterAssigned,
    ...over,
  }) as InitiativeDecision;

const jvj = (): InitiativeDecision[] => [
  decision(TRAINING_ROW, 'Training'),
  decision(KPI_ROW, 'KPI & Bonus Structure'),
  decision('c742f2c3-71d8-4597-acf0-04afc0833d87', 'Performance Management System', 'unassigned'),
  decision('0a1d1d80-5bb0-4220-8f2a-e850a050c1b7', 'Performance Management System', 'unassigned'),
  decision('new-1790293272000', 'Training'),
  decision('new-1790293338029', 'KPI & Bonus Structure', 'q2', { assignedTo: 'Chris Panic' }),
  decision('sprint-new-1790296002208', 'Complete the Payroll Automations'),
];

let saved: InitiativeDecision[] = [];

function Workshop({ initial }: { initial: InitiativeDecision[] }) {
  const [review, setReview] = useState<any>({
    id: 'r1',
    business_id: 'b1',
    quarter: 2,
    year: 2027,
    quarterly_targets: { revenue: 0, grossProfit: 0, netProfit: 0, kpis: [] },
    initiative_decisions: initial,
  });
  return (
    <QuarterlyRocksStep
      review={review}
      onUpdateInitiativeDecisions={(next) => {
        saved = next;
        setReview((r: any) => ({ ...r, initiative_decisions: next }));
      }}
    />
  );
}

const pause = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

const cards = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-testid="rock-card"]'));

/** The rock cards' titles, top to bottom. */
const cardTitles = (container: HTMLElement) => cards(container).map((c) => c.querySelector('h4')?.textContent);

const cardFor = (container: HTMLElement, position: number) => cards(container)[position - 1];

async function open(initial = jvj()) {
  const utils = render(<Workshop initial={initial} />);
  await waitFor(() => expect(cardTitles(utils.container).length).toBeGreaterThan(0), { timeout: 5000 });
  await pause(300); // after the step's post-load settle, as a person would be
  return utils;
}

async function removeCard(container: HTMLElement, position: number) {
  const card = cardFor(container, position);
  fireEvent.click(within(card).getByText(cardTitles(container)[position - 1] as string));
  await pause(20);
  fireEvent.click(within(cardFor(container, position)).getByText('Remove rock'));
  fireEvent.click(within(cardFor(container, position)).getByText('Remove'));
  await pause(20);
}

beforeEach(() => {
  cleanup();
  saved = [];
});

describe('repeats are flagged, not merged', () => {
  it('lists every copy, flags both repeats, and leaves the pool out', async () => {
    const { container, getByText } = await open();
    expect(cardTitles(container)).toEqual([
      'Training',
      'KPI & Bonus Structure',
      'Training',
      'KPI & Bonus Structure',
      'Complete the Payroll Automations',
    ]);
    getByText(/Some rocks are listed more than once/);
    expect(within(cardFor(container, 1)).getByText(/Listed more than once — also #3/)).toBeTruthy();
    expect(within(cardFor(container, 4)).getByText(/Listed more than once — also #2/)).toBeTruthy();
    expect(within(cardFor(container, 5)).queryByText(/Listed more than once/)).toBeNull();
  });

  it('offers "Remove rock" on a rock that came from the plan, not only one added here', async () => {
    const { container } = await open();
    fireEvent.click(within(cardFor(container, 1)).getByText('Training'));
    await pause(20);
    expect(within(cardFor(container, 1)).getByText('Remove rock')).toBeTruthy();
  });

  it('asks before removing, and "Keep it" keeps it', async () => {
    const { container } = await open();
    fireEvent.click(within(cardFor(container, 5)).getByText('Complete the Payroll Automations'));
    await pause(20);
    fireEvent.click(within(cardFor(container, 5)).getByText('Remove rock'));
    fireEvent.click(within(cardFor(container, 5)).getByText('Keep it'));
    await pause(700);
    expect(cardTitles(container)).toHaveLength(5);
  });
});

describe('a removed rock stays removed', () => {
  it('removing the repeat the coach chose leaves one Training — and the flag goes', async () => {
    const { container, queryByText } = await open();
    await removeCard(container, 3); // the session's copy of Training
    await pause(1500); // longer than the write-back delay and the re-sync
    expect(cardTitles(container)).toEqual([
      'Training',
      'KPI & Bonus Structure',
      'KPI & Bonus Structure',
      'Complete the Payroll Automations',
    ]);
    expect(within(cardFor(container, 1)).queryByText(/Listed more than once/)).toBeNull();
    expect(queryByText(/Some rocks are listed more than once/)).not.toBeNull(); // KPI still repeats
    // Saved — not just gone from the screen.
    expect(saved.filter((d) => d.title === 'Training').map((d) => d.initiativeId)).toEqual([TRAINING_ROW]);
  });

  it('removing the SAVED copy keeps the coach\'s copy, on the saved row — not cancelled', async () => {
    const { container } = await open();
    await removeCard(container, 2); // the plan's row for KPI & Bonus Structure
    await pause(1500);
    expect(cardTitles(container)).toEqual([
      'Training',
      'Training',
      'KPI & Bonus Structure',
      'Complete the Payroll Automations',
    ]);
    const kpi = saved.filter((d) => d.title === 'KPI & Bonus Structure');
    expect(kpi).toHaveLength(1);
    expect(kpi[0]).toMatchObject({ initiativeId: KPI_ROW, decision: 'keep', assignedTo: 'Chris Panic' });
  });

  it('a removed plan rock is marked Drop, and does not come back when the step re-opens', async () => {
    const first = await open();
    await removeCard(first.container, 3); // Training's copy
    await pause(700);
    await removeCard(first.container, 1); // Training itself
    await pause(1500);
    expect(cardTitles(first.container)).not.toContain('Training');
    expect(saved.find((d) => d.initiativeId === TRAINING_ROW)?.decision).toBe('kill');
    first.unmount();

    const reopened = await open(saved);
    expect(cardTitles(reopened.container)).not.toContain('Training');
  });

  it('a rock added here and removed is kept as a Drop — the record the sync takes back the row it filed by', async () => {
    // The background sync files a rock added here a few seconds after an edit.
    // Dropped from the decisions without a trace, its row stayed an active rock.
    const first = await open();
    await removeCard(first.container, 5); // Complete the Payroll Automations, added in 4.3
    await pause(1500);
    expect(cardTitles(first.container)).not.toContain('Complete the Payroll Automations');
    expect(saved.find((d) => d.initiativeId === 'sprint-new-1790296002208')?.decision).toBe('kill');
    first.unmount();

    const reopened = await open(saved);
    expect(cardTitles(reopened.container)).not.toContain('Complete the Payroll Automations');
  });

  it('keeps an edit typed just before another rock is removed', async () => {
    const { container } = await open();
    fireEvent.click(within(cardFor(container, 5)).getByText('Complete the Payroll Automations'));
    await pause(20);
    fireEvent.change(within(cardFor(container, 5)).getByPlaceholderText(/What does success look like/), {
      target: { value: 'Pays run without manual steps' },
    });
    // Straight away — inside the write-back delay.
    await removeCard(container, 3);
    await pause(1500);
    expect(saved.find((d) => d.initiativeId === 'sprint-new-1790296002208')?.outcome).toBe(
      'Pays run without manual steps'
    );
  });
});
