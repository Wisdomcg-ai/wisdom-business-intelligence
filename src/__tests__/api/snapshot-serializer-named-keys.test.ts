/**
 * Phase 71-10 (D4) — Snapshot serializer regression tests.
 *
 * Locks the named-key serialization contract introduced in 71-10:
 *   - newly-saved snapshots persist `report_data.sections` as a named-key map
 *     (NOT as a numeric-keyed JS-array-as-JSONB);
 *   - the load path hydrates both named-key (new) and numeric-keyed (legacy)
 *     shapes back into `ReportSection[]` for downstream consumers
 *     (BudgetVsActualTable, pdf-service);
 *   - the snapshot POST route remains a transparent passthrough — it does
 *     NOT re-shape the payload server-side (the serializer runs in
 *     useMonthlyReport.saveSnapshot before the fetch).
 *
 * Test 1: serializeReportSections produces named keys from an array.
 * Test 2: idempotent — already-named input is returned unchanged.
 * Test 3: round-trip deserialize(serialize(arr)) ≡ arr (order-preserving
 *         per CATEGORY_ORDER).
 * Test 4: integration — POST to /api/monthly-report/snapshot with a
 *         named-key sections map results in an upsert payload whose
 *         report_data.sections is the named-key map (not an array).
 * Test 5: unknown category passthrough — never silently dropped.
 *
 * Memory: `feedback_executor_scoped_tests` — this file is the scoped vitest
 * run for 71-10. Full-suite vitest may have timezone-shaped failures in
 * unrelated tests; not in scope here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { ReportSection } from '@/app/finances/monthly-report/types'
import {
  serializeReportSections,
  deserializeReportSections,
  categoryToKey,
  CATEGORY_KEY_MAP,
  type NamedSectionMap,
} from '@/app/finances/monthly-report/utils/snapshot-serializer'

// ── Helpers ─────────────────────────────────────────────────────────────────
function makeLine(account_name: string, actual: number) {
  return {
    account_name,
    xero_account_name: account_name,
    is_budget_only: false,
    actual,
    budget: 0,
    variance_amount: 0,
    variance_percent: 0,
    ytd_actual: actual,
    ytd_budget: 0,
    ytd_variance_amount: 0,
    ytd_variance_percent: 0,
    unspent_budget: 0,
    budget_next_month: 0,
    budget_annual_total: 0,
    prior_year: null,
  }
}

function makeSection(category: ReportSection['category'], lines: ReturnType<typeof makeLine>[]): ReportSection {
  return {
    category,
    lines,
    subtotal: { ...makeLine(`Total ${category}`, lines.reduce((s, l) => s + l.actual, 0)) },
  }
}

// ─── Pure unit tests (Tests 1, 2, 3, 5) ──────────────────────────────────────

describe('snapshot-serializer (Phase 71-10 D4)', () => {
  describe('Test 1 — serializeReportSections converts array to named-key map', () => {
    it('produces { revenue, cost_of_sales, operating_expenses } for a three-section array', () => {
      const arr: ReportSection[] = [
        makeSection('Revenue', [makeLine('Sales', 1000)]),
        makeSection('Cost of Sales', [makeLine('Materials', 300)]),
        makeSection('Operating Expenses', [makeLine('Rent', 200)]),
      ]
      const out = serializeReportSections(arr)
      expect(Object.keys(out).sort()).toEqual(
        ['cost_of_sales', 'operating_expenses', 'revenue'],
      )
      expect(out.revenue.lines[0].account_name).toBe('Sales')
      expect(out.cost_of_sales.lines[0].account_name).toBe('Materials')
      expect(out.operating_expenses.lines[0].account_name).toBe('Rent')
      // Critical: must NOT be an array — numeric Object.keys would re-create
      // the bug we're fixing.
      expect(Array.isArray(out)).toBe(false)
    })

    it('CATEGORY_KEY_MAP exhaustively covers all five canonical categories', () => {
      // Locks the convention so future planners can't drift without touching this test.
      expect(CATEGORY_KEY_MAP).toEqual({
        Revenue: 'revenue',
        'Cost of Sales': 'cost_of_sales',
        'Operating Expenses': 'operating_expenses',
        'Other Income': 'other_income',
        'Other Expenses': 'other_expenses',
      })
    })
  })

  describe('Test 2 — serializeReportSections is idempotent on already-named input', () => {
    it('returns the same map unchanged when passed a NamedSectionMap', () => {
      const named: NamedSectionMap = {
        revenue: makeSection('Revenue', [makeLine('Sales', 1000)]),
        operating_expenses: makeSection('Operating Expenses', [makeLine('Rent', 200)]),
      }
      const out = serializeReportSections(named)
      // Reference equality — no copy made; cheap pass-through.
      expect(out).toBe(named)
    })
  })

  describe('Test 3 — round-trip deserialize(serialize(arr)) ≡ arr (in CATEGORY_ORDER)', () => {
    it('preserves all sections and CATEGORY_ORDER even when input order is shuffled', () => {
      const arr: ReportSection[] = [
        // Shuffled order to prove the deserializer re-orders via CATEGORY_ORDER.
        makeSection('Operating Expenses', [makeLine('Rent', 200)]),
        makeSection('Revenue', [makeLine('Sales', 1000)]),
        makeSection('Cost of Sales', [makeLine('Materials', 300)]),
      ]
      const serialized = serializeReportSections(arr)
      const roundtripped = deserializeReportSections(serialized)
      // CATEGORY_ORDER: Revenue, Cost of Sales, Operating Expenses
      expect(roundtripped.map((s) => s.category)).toEqual([
        'Revenue',
        'Cost of Sales',
        'Operating Expenses',
      ])
      // Deep-equal of contents (modulo order).
      const byCat = (xs: ReportSection[]) =>
        Object.fromEntries(xs.map((s) => [s.category, s]))
      expect(byCat(roundtripped)).toEqual(byCat(arr))
    })

    it('deserializes legacy numeric-keyed shape (pre-71-10 in-prod rows) to an array', () => {
      // Existing prod snapshots have shape {"0": {...}, "1": {...}} because JSONB
      // serialized a JS array. The deserializer must hydrate this transparently.
      const legacyNumeric = {
        '0': makeSection('Revenue', [makeLine('Sales', 1000)]),
        '1': makeSection('Cost of Sales', [makeLine('Materials', 300)]),
      } as unknown as NamedSectionMap
      const out = deserializeReportSections(legacyNumeric)
      expect(out).toHaveLength(2)
      expect(out[0].category).toBe('Revenue')
      expect(out[1].category).toBe('Cost of Sales')
    })

    it('passes through if already an array (in-memory shape)', () => {
      const arr: ReportSection[] = [
        makeSection('Revenue', [makeLine('Sales', 1000)]),
      ]
      const out = deserializeReportSections(arr)
      expect(out).toBe(arr)
    })
  })

  describe('Test 5 — unknown category passthrough (never silently dropped)', () => {
    it('falls back to snake_case slug for unknown categories', () => {
      expect(categoryToKey('Mystery Category')).toBe('mystery_category')
    })

    it('serializer keeps unknown-category sections under their fallback key', () => {
      const arr: ReportSection[] = [
        makeSection('Revenue', [makeLine('Sales', 1000)]),
        // Cast to bypass ReportCategory union — simulates a future category not yet typed.
        { category: 'Custom Section' as any, lines: [makeLine('Misc', 50)], subtotal: makeLine('Total', 50) },
      ]
      const out = serializeReportSections(arr)
      expect(out.revenue).toBeDefined()
      expect((out as any).custom_section).toBeDefined()
      expect((out as any).custom_section.lines[0].account_name).toBe('Misc')
    })

    it('deserializer surfaces unknown keys at the tail of the array', () => {
      const named = {
        revenue: makeSection('Revenue', [makeLine('Sales', 1000)]),
        custom_section: { category: 'Custom Section' as any, lines: [makeLine('Misc', 50)], subtotal: makeLine('Total', 50) },
      } as NamedSectionMap
      const out = deserializeReportSections(named)
      expect(out).toHaveLength(2)
      expect(out[0].category).toBe('Revenue')
      // Unknown category appended after CATEGORY_ORDER members.
      expect(out[1].category).toBe('Custom Section')
    })
  })
})

// ─── Test 4 — Snapshot POST integration ──────────────────────────────────────
//
// Confirms the snapshot route is a TRANSPARENT PASSTHROUGH: whatever shape the
// client POSTs is what lands in the DB. Combined with the unit tests above
// (which prove serializeReportSections produces named keys), this locks the
// end-to-end contract: useMonthlyReport calls serializeReportSections → POSTs
// → route upserts the named-key map verbatim.

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: vi.fn(async () => ({ allowed: true, reason: 'ok' })),
}))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({
  enforceSectionPermission: vi.fn(() => null),
}))

vi.mock('@/lib/supabase/keys', () => ({
  getSupabaseSecretKey: () => 'test-secret-key',
}))

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user-1' } },
        error: null,
      })),
    },
  })),
}))

// R29: route now hard-gates on verifyBusinessAccess. These tests exercise the
// business logic with an authorized user, so grant access.
vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: vi.fn(async () => true),
}))

// revert-report stub — not relevant for serializer assertions, but the route
// will call it post-upsert; mock to a no-op success.
vi.mock('@/lib/reports/revert-report', () => ({
  revertReportIfApproved: vi.fn(async () => undefined),
}))

// Capture the upsert payload so we can assert on report_data.sections shape.
let capturedUpsertPayload: any = null

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (_table: string) => ({
      upsert: (payload: any) => {
        capturedUpsertPayload = payload
        return {
          select: () => ({
            single: async () => ({ data: { id: 'snap-1', ...payload }, error: null }),
          }),
        }
      },
    }),
  })),
}))

// Imports AFTER mocks.
import { POST as snapshotPOST } from '@/app/api/monthly-report/snapshot/route'

function makeRequest(body: any): NextRequest {
  return new NextRequest('http://localhost/api/monthly-report/snapshot', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Test 4 — POST /api/monthly-report/snapshot persists named-key sections verbatim', () => {
  beforeEach(() => {
    capturedUpsertPayload = null
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('upserts report_data.sections as a named-key map (not an array) when serializer runs upstream', async () => {
    const namedSections: NamedSectionMap = {
      revenue: makeSection('Revenue', [makeLine('Sales', 1000)]),
      cost_of_sales: makeSection('Cost of Sales', [makeLine('Materials', 300)]),
      operating_expenses: makeSection('Operating Expenses', [makeLine('Rent', 200)]),
    }
    const reportData = {
      business_id: 'biz-1',
      report_month: '2026-04',
      fiscal_year: 2026,
      sections: namedSections,
      settings: {},
      summary: {
        revenue: { actual: 1000, budget: 0, variance: 0, variance_percent: 0 },
        cogs: { actual: 300, budget: 0, variance: 0, variance_percent: 0 },
        gross_profit: { actual: 700, budget: 0, variance: 0, gp_percent: 70 },
        opex: { actual: 200, budget: 0, variance: 0, variance_percent: 0 },
        net_profit: { actual: 500, budget: 0, variance: 0, np_percent: 50 },
      },
      gross_profit_row: makeLine('Gross Profit', 700),
      net_profit_row: makeLine('Net Profit', 500),
      is_draft: true,
      unreconciled_count: 0,
      has_budget: false,
    }

    const res = await snapshotPOST(
      makeRequest({
        business_id: 'biz-1',
        report_month: '2026-04',
        fiscal_year: 2026,
        status: 'draft',
        is_draft: true,
        unreconciled_count: 0,
        report_data: reportData,
        summary: reportData.summary,
      }),
    )
    expect(res.status).toBe(200)
    expect(capturedUpsertPayload).toBeTruthy()

    const persistedSections = capturedUpsertPayload.report_data.sections
    expect(Array.isArray(persistedSections)).toBe(false)
    expect(Object.keys(persistedSections).sort()).toEqual([
      'cost_of_sales',
      'operating_expenses',
      'revenue',
    ])
    // Spot-check content was preserved.
    expect(persistedSections.revenue.lines[0].account_name).toBe('Sales')
  })
})
