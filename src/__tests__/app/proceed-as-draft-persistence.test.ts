/**
 * Phase 71-03 — B3 Proceed-as-Draft persistence (route-level integration)
 *
 * Bug being locked: clicking "Generate Draft Report" generates the report in
 * memory only; auto-save watches commentary which is empty on a fresh draft;
 * closing the tab loses the report. Fix is to immediately POST a draft
 * snapshot on the Proceed-as-Draft click so the row exists in
 * monthly_report_snapshots BEFORE the user types any commentary.
 *
 * This test file covers the SERVER side: the snapshot route's POST handler
 * correctly upserts at status='draft', preserves idempotency on repeat
 * (business_id, report_month, fiscal_year) writes, and allows transition
 * from draft → final. The CLIENT-side wiring (handleGenerateReport calling
 * saveSnapshot immediately) is exercised at the source-grep level in
 * Test 4 — keeps the suite pure, no React-tree mount required.
 *
 * Approach mirrors phase-53-connection-health-route.test.ts:
 *   - hoisted vi.fn() mocks for auth + Supabase admin client
 *   - vi.mock(...) hooked before route import
 *   - synthetic NextRequest objects pumped through the imported POST handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Hoisted mock state ──────────────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockAdminFrom = vi.fn();

// Permission check is a no-op in tests — return a verdict that lets requests through.
vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: vi.fn(async () => ({
    allowed: true,
    reason: 'test-bypass',
  })),
}));

vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({
  enforceSectionPermission: vi.fn(() => null),
}));

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock('@/lib/supabase/keys', () => ({
  getSupabaseSecretKey: vi.fn(() => 'test-secret-key'),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockAdminFrom })),
}));

// Phase 35 D-16 side-effect — irrelevant to B3 invariants. Stub to a no-op
// so tests don't need to set up cfo_report_status rows.
vi.mock('@/lib/reports/revert-report', () => ({
  revertReportIfApproved: vi.fn(async () => undefined),
}));

// Sentry capture: silence + spy so we can assert nothing alarms.
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

// ─── Required env var (route reads at module load) ──────────────────────────

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePostReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/monthly-report/snapshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const STUB_REPORT_DATA = {
  business_id: 'biz-abc',
  report_month: '2026-04',
  fiscal_year: 2026,
  sections: [],
  is_draft: true,
};

const STUB_SUMMARY = {
  total_revenue: 0,
  total_expenses: 0,
  net_profit: 0,
};

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    business_id: 'biz-abc',
    report_month: '2026-04',
    fiscal_year: 2026,
    status: 'draft' as const,
    is_draft: true,
    unreconciled_count: 3,
    report_data: STUB_REPORT_DATA,
    summary: STUB_SUMMARY,
    generated_by: 'user-xyz',
    ...overrides,
  };
}

/**
 * Build a Supabase admin-mock that simulates an upsert against
 * monthly_report_snapshots keyed on (business_id, report_month).
 * Returns the per-call recorder so tests can introspect what was written.
 */
function configureSnapshotsTable() {
  type UpsertRow = {
    id: string;
    business_id: string;
    report_month: string;
    fiscal_year: number;
    status: string;
    is_draft: boolean;
    unreconciled_count: number;
    report_data: unknown;
    summary: unknown;
    commentary: unknown;
    coach_notes: string | null;
    generated_by: string | null;
    generated_at: string;
    updated_at: string;
  };

  const upsertCalls: Array<{
    row: Omit<UpsertRow, 'id'>;
    options: { onConflict: string; ignoreDuplicates: boolean };
  }> = [];

  // Simulated table state — keyed by `${business_id}::${report_month}`.
  const rows = new Map<string, UpsertRow>();

  mockAdminFrom.mockImplementation((table: string) => {
    if (table !== 'monthly_report_snapshots') {
      throw new Error(`Unexpected table access in test: ${table}`);
    }
    return {
      upsert: (
        row: Omit<UpsertRow, 'id'>,
        options: { onConflict: string; ignoreDuplicates: boolean },
      ) => {
        upsertCalls.push({ row, options });
        const key = `${row.business_id}::${row.report_month}`;
        const existing = rows.get(key);
        const merged: UpsertRow = existing
          ? { ...existing, ...row }
          : { id: `snap-${rows.size + 1}`, ...row };
        rows.set(key, merged);
        return {
          select: () => ({
            single: async () => ({ data: merged, error: null }),
          }),
        };
      },
    };
  });

  return { upsertCalls, rows };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-xyz', email: 'matt@wisdomcg.com.au' } },
    error: null,
  });
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('B3 — Proceed-as-Draft persistence (snapshot POST handler)', () => {
  it('Test 1: upserts a row at status="draft" on initial Proceed-as-Draft save', async () => {
    const { upsertCalls } = configureSnapshotsTable();
    const { POST } = await import('@/app/api/monthly-report/snapshot/route');

    const res = await POST(makePostReq(baseBody()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.snapshot.status).toBe('draft');
    expect(json.snapshot.business_id).toBe('biz-abc');
    expect(json.snapshot.report_month).toBe('2026-04');

    // Exactly one upsert with the right key and status.
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].row.status).toBe('draft');
    expect(upsertCalls[0].row.is_draft).toBe(true);
    expect(upsertCalls[0].options.onConflict).toBe(
      'business_id,report_month',
    );
  });

  it('Test 2: idempotent — two consecutive Proceed-as-Draft clicks produce ONE row', async () => {
    const { upsertCalls, rows } = configureSnapshotsTable();
    const { POST } = await import('@/app/api/monthly-report/snapshot/route');

    const res1 = await POST(makePostReq(baseBody()));
    const res2 = await POST(makePostReq(baseBody()));

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Two upsert CALLS (every POST hits upsert), but only ONE row in the table.
    expect(upsertCalls).toHaveLength(2);
    expect(rows.size).toBe(1);

    // Both calls use upsert (not insert) — the route NEVER bypasses onConflict.
    for (const call of upsertCalls) {
      expect(call.options.onConflict).toBe('business_id,report_month');
      expect(call.options.ignoreDuplicates).toBe(false);
    }

    // The single row carries the latest values.
    const [row] = Array.from(rows.values());
    expect(row.status).toBe('draft');
    expect(row.business_id).toBe('biz-abc');
    expect(row.report_month).toBe('2026-04');
  });

  it('Test 3: status preservation — draft → final transition is allowed', async () => {
    const { rows } = configureSnapshotsTable();
    const { POST } = await import('@/app/api/monthly-report/snapshot/route');

    // First write: draft
    const draftRes = await POST(makePostReq(baseBody({ status: 'draft', is_draft: true })));
    const draftJson = await draftRes.json();
    expect(draftJson.snapshot.status).toBe('draft');

    // Second write: same (business_id, report_month), now status=final
    const finalRes = await POST(
      makePostReq(baseBody({ status: 'final', is_draft: false })),
    );
    const finalJson = await finalRes.json();

    expect(finalRes.status).toBe(200);
    expect(finalJson.snapshot.status).toBe('final');
    expect(finalJson.snapshot.is_draft).toBe(false);

    // Still exactly ONE row — the upsert flipped status in place.
    expect(rows.size).toBe(1);
    const [row] = Array.from(rows.values());
    expect(row.status).toBe('final');
  });

  it('Test 4 (B3 client wiring): page.tsx Proceed-as-Draft path calls saveSnapshot with status="draft" immediately', () => {
    // Source-level invariant — guards against any future refactor that
    // drops the immediate save. Mirrors the 71-01/71-09 source-grep pattern.
    const pagePath = resolve(
      process.cwd(),
      'src/app/finances/monthly-report/page.tsx',
    );
    const source = readFileSync(pagePath, 'utf-8');

    // The B3 marker comment must be present (matches plan done-criteria grep).
    expect(source).toMatch(/B3: Proceed-as-Draft/);

    // The 'Saved as draft' toast literal must be present.
    expect(source).toMatch(/Saved as draft/);

    // The forceDraft branch must invoke saveSnapshot with status: 'draft'.
    // Single regex covers either single- or double-quote style for the value.
    expect(source).toMatch(
      /forceDraft[\s\S]{0,400}saveSnapshot[\s\S]{0,300}status:\s*['"]draft['"]/,
    );
  });
});
