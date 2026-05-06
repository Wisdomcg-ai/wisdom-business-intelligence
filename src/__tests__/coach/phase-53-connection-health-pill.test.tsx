/**
 * Phase 53-05 Task 3 RED:
 *   XeroHealthPill column added to ClientOverviewTable.tsx, plus the
 *   ClientMetrics interface extension and sort wiring.
 *
 *   Component-only tests (no API mocking) — render the table directly with
 *   controlled fixtures. The dashboard page wiring is covered by Task 2's
 *   endpoint tests + this file's column-render tests; we don't redundantly
 *   re-test the parallel Promise.all leg.
 *
 *   7 cases:
 *     1. status=verified renders green pill with CheckCircle icon
 *     2. status=stale renders yellow pill with Clock icon
 *     3. status=dead renders red pill that IS an <a> linking to
 *        /api/Xero/auth?business_id=…&return_to=…
 *     4. status=none renders gray pill with Minus, NOT an <a>
 *     5. Pill column hidden on small breakpoint (className includes
 *        'hidden' + 'sm:inline-flex')
 *     6. Dead row gets bg-red tint (mobile signal — visible without the pill)
 *     7. Sort by xeroConnectionHealth ascending puts dead first, verified last
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  ClientOverviewTable,
  type ClientMetrics,
} from '@/components/coach/ClientOverviewTable';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeClient(
  overrides: Partial<ClientMetrics> & {
    id: string;
    businessName: string;
    xeroConnectionHealth: ClientMetrics['xeroConnectionHealth'];
  },
): ClientMetrics {
  return {
    status: 'active',
    lastLogin: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    lastWeeklyReview: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    lastDashboardUpdate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    lastAssessmentScore: 75,
    lastAssessmentStatus: 'STRONG',
    roadmapLevel: 'Growth',
    roadmapRevenue: 1500000,
    openLoopsCount: 0,
    openIssuesCount: 0,
    industry: 'Coaching',
    ...overrides,
  };
}

function getRowForBusiness(name: string): HTMLTableRowElement {
  // The business name link is always inside the first <td> of its <tr>.
  const link = screen.getByText(name);
  const row = link.closest('tr');
  if (!row) throw new Error(`Could not find <tr> for business "${name}"`);
  return row as HTMLTableRowElement;
}

beforeEach(() => {
  // jsdom: no per-test cleanup needed; React Testing Library auto-unmounts.
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Phase 53-05 — XeroHealthPill column in ClientOverviewTable', () => {
  it('Test 1 — verified status renders pill with text "Xero" and a CheckCircle icon', () => {
    const clients: ClientMetrics[] = [
      makeClient({
        id: 'biz-verified',
        businessName: 'Verified Co',
        xeroConnectionHealth: 'verified',
      }),
    ];
    render(<ClientOverviewTable clients={clients} />);
    const row = getRowForBusiness('Verified Co');
    // Pill is in the row; aria-label should contain "verified" or "Xero ✓"
    const pill = within(row).getByLabelText(/xero/i);
    expect(pill).toBeInTheDocument();
    // Visual: green tint via tailwind class (bg-green-50)
    expect(pill.className).toMatch(/bg-green-/);
    // Pill is decoration only — should be a <span>, not an <a>
    expect(pill.tagName.toLowerCase()).toBe('span');
  });

  it('Test 2 — stale status renders yellow pill', () => {
    const clients: ClientMetrics[] = [
      makeClient({
        id: 'biz-stale',
        businessName: 'Stale Co',
        xeroConnectionHealth: 'stale',
      }),
    ];
    render(<ClientOverviewTable clients={clients} />);
    const row = getRowForBusiness('Stale Co');
    const pill = within(row).getByLabelText(/xero/i);
    expect(pill).toBeInTheDocument();
    expect(pill.className).toMatch(/bg-yellow-/);
    expect(pill.tagName.toLowerCase()).toBe('span');
  });

  it('Test 3 — dead status renders red pill IS an <a> linking to /api/Xero/auth', () => {
    const clients: ClientMetrics[] = [
      makeClient({
        id: 'biz-dead-uuid-123',
        businessName: 'Dead Co',
        xeroConnectionHealth: 'dead',
      }),
    ];
    render(<ClientOverviewTable clients={clients} />);
    const row = getRowForBusiness('Dead Co');
    const pill = within(row).getByLabelText(/xero/i);
    expect(pill).toBeInTheDocument();
    expect(pill.tagName.toLowerCase()).toBe('a');
    expect(pill.className).toMatch(/bg-red-/);
    const href = (pill as HTMLAnchorElement).getAttribute('href');
    expect(href).toContain('/api/Xero/auth');
    expect(href).toContain('business_id=biz-dead-uuid-123');
    expect(href).toContain('return_to=');
    // return_to should be the coach dashboard
    expect(decodeURIComponent(href || '')).toContain('/coach/dashboard');
  });

  it('Test 4 — none status renders gray pill that is NOT a link', () => {
    const clients: ClientMetrics[] = [
      makeClient({
        id: 'biz-none',
        businessName: 'No-Xero Co',
        xeroConnectionHealth: 'none',
      }),
    ];
    render(<ClientOverviewTable clients={clients} />);
    const row = getRowForBusiness('No-Xero Co');
    const pill = within(row).getByLabelText(/no xero|xero/i);
    expect(pill).toBeInTheDocument();
    expect(pill.tagName.toLowerCase()).toBe('span');
    expect(pill.className).toMatch(/bg-gray-/);
  });

  it('Test 5 — pill is hidden on small breakpoint (hidden + sm:inline-flex classes)', () => {
    const clients: ClientMetrics[] = [
      makeClient({
        id: 'biz-1',
        businessName: 'Mobile Test Co',
        xeroConnectionHealth: 'verified',
      }),
    ];
    render(<ClientOverviewTable clients={clients} />);
    const row = getRowForBusiness('Mobile Test Co');
    const pill = within(row).getByLabelText(/xero/i);
    // Pill itself includes responsive hide/show classes
    expect(pill.className).toMatch(/hidden/);
    expect(pill.className).toMatch(/sm:(inline-flex|flex)/);
  });

  it('Test 6 — dead row gets bg-red tint on the <tr> (mobile signal — visible without the pill)', () => {
    const clients: ClientMetrics[] = [
      makeClient({
        id: 'biz-dead',
        businessName: 'Dead Mobile Co',
        xeroConnectionHealth: 'dead',
      }),
    ];
    render(<ClientOverviewTable clients={clients} />);
    const row = getRowForBusiness('Dead Mobile Co');
    expect(row.className).toMatch(/bg-red-/);
    // Optional: data attribute mirrors the health for QA/debug
    expect(row.getAttribute('data-xero-health')).toBe('dead');
  });

  it('Test 7 — sort by xeroConnectionHealth ascending: dead first, verified last (operationally useful default)', () => {
    const clients: ClientMetrics[] = [
      makeClient({
        id: 'biz-verified',
        businessName: 'AAA Verified Co',
        xeroConnectionHealth: 'verified',
      }),
      makeClient({
        id: 'biz-stale',
        businessName: 'BBB Stale Co',
        xeroConnectionHealth: 'stale',
      }),
      makeClient({
        id: 'biz-dead',
        businessName: 'CCC Dead Co',
        xeroConnectionHealth: 'dead',
      }),
      makeClient({
        id: 'biz-none',
        businessName: 'DDD None Co',
        xeroConnectionHealth: 'none',
      }),
    ];
    render(<ClientOverviewTable clients={clients} />);

    // Find the sortable header for the new Xero column (header is sortable
    // — clicking sets sortField='xeroConnectionHealth').
    const xeroHeader = screen.getByRole('columnheader', { name: /xero/i });
    // Click once → desc by default in this component → click twice for asc.
    // (handleSort sets desc on first click of a new field; toggles to asc on
    // second click of the same field.)
    fireEvent.click(xeroHeader);
    fireEvent.click(xeroHeader);

    // Read the resulting business-name order from the DOM
    const rows = screen.getAllByRole('row');
    // rows[0] is the <thead> row; rows[1..] are the body rows in render order
    const bodyNames = rows
      .slice(1)
      .map((r) => {
        const link = r.querySelector('a, td');
        return link?.textContent?.trim() ?? '';
      })
      .filter(Boolean);

    // Find indices of each business name in the rendered order
    const idx = (name: string) => bodyNames.findIndex((s) => s.includes(name));
    const iDead = idx('CCC Dead Co');
    const iStale = idx('BBB Stale Co');
    const iNone = idx('DDD None Co');
    const iVerified = idx('AAA Verified Co');
    expect(iDead).toBeGreaterThanOrEqual(0);
    expect(iStale).toBeGreaterThanOrEqual(0);
    expect(iNone).toBeGreaterThanOrEqual(0);
    expect(iVerified).toBeGreaterThanOrEqual(0);
    // Operational order: dead < stale < none < verified
    expect(iDead).toBeLessThan(iStale);
    expect(iStale).toBeLessThan(iNone);
    expect(iNone).toBeLessThan(iVerified);
  });
});
