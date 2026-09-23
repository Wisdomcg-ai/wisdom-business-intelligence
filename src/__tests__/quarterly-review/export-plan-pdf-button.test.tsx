/**
 * The Export PDF button.
 *
 * Rendering the button proves nothing — the old one rendered perfectly and said
 * "PDF export coming soon!" when pressed. These tests press it.
 *
 * What has to hold: a press produces a file named for the client, a part that
 * could not be read is NAMED on screen rather than silently missing from the
 * page, and a failure says so instead of looking like a download that happened.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';

const loader = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());
const captured = vi.hoisted(() => [] as unknown[]);

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: () => ({}) }) }));
vi.mock('@sentry/nextjs', () => ({
  captureException: (err: unknown) => {
    captured.push(err);
  },
}));
vi.mock('@/app/quarterly-review/services/quarterly-plan-pdf-data', () => ({ loadPlanPdfData: loader }));
vi.mock('@/app/quarterly-review/services/quarterly-plan-pdf', () => ({
  renderPlanPdf: (page: unknown) => ({ save, page }),
}));

import { ExportPlanPdfButton } from '@/app/quarterly-review/components/ExportPlanPdfButton';

const review: any = {
  id: 'r1',
  business_id: 'biz-1',
  quarter: 2,
  year: 2027,
  quarterly_targets: { revenue: 100000, grossProfit: 40000, netProfit: 10000, kpis: [] },
  quarterly_rocks: [],
  personal_commitments: { hoursPerWeekTarget: null, daysOffPlanned: null, daysOffScheduled: [], personalGoal: '' },
  one_thing_answer: null,
  one_thing_for_success: null,
};

const fullData = {
  businessName: 'Test ABC',
  yearType: 'FY' as const,
  annual: { revenue: 400000, grossProfit: 160000, netProfit: 40000, yearEnd: '2027-06-30' },
  quarterFromPlan: null,
  kpis: [],
  missing: [] as string[],
};

beforeEach(() => {
  cleanup();
  loader.mockReset();
  save.mockReset();
  captured.length = 0;
});

describe('pressing Export PDF', () => {
  it('downloads the client’s plan, named for the client and the quarter', async () => {
    loader.mockResolvedValue(fullData);
    render(<ExportPlanPdfButton review={review} />);

    fireEvent.click(screen.getByRole('button', { name: /export pdf/i }));

    await waitFor(() => expect(save).toHaveBeenCalledWith('Test ABC - Q2 FY2027 Plan.pdf'));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('names the part it could not read, so a missing section is not read as "you have none"', async () => {
    loader.mockResolvedValue({ ...fullData, annual: null, missing: ['this year’s targets'] });
    render(<ExportPlanPdfButton review={review} />);

    fireEvent.click(screen.getByRole('button', { name: /export pdf/i }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(await screen.findByText(/Downloaded without this year’s targets/)).toBeTruthy();
  });

  it('says the export failed instead of leaving the client waiting for a file', async () => {
    loader.mockRejectedValue(new Error('network'));
    render(<ExportPlanPdfButton review={review} />);

    fireEvent.click(screen.getByRole('button', { name: /export pdf/i }));

    expect(await screen.findByText(/couldn’t make the PDF|couldn't make the PDF/i)).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    // And it is reported — a failure nobody sees is a failure nobody fixes.
    expect(captured).toHaveLength(1);
  });
});
