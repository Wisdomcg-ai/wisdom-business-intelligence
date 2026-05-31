/**
 * Phase 71-04 — S1 commentary trigger expansion
 *
 * Locks the 4 trigger types beyond the legacy expense-over-$500 fire:
 *   1. Expense over-budget ≥$500              (existing — unchanged)
 *   2. Revenue under-budget ≥$500 OR ≥10%     (new)
 *   3. Large favourable expense ≥$500 AND ≥20% of budget (new)
 *   4. BS movements ≥$5000 OR ≥10% of opening balance    (new)
 *
 * Plus: every commentary row carries a `trigger_reason` naming WHY it appeared.
 *
 * Tests 1-8 exercise the pure `collectCommentaryTriggers` helper.
 * Test 9 exercises the commentary route's POST handler (route-level integration,
 * same mock pattern as proceed-as-draft-persistence.test.ts / 71-03).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mock state (Test 9 route-level integration) ────────────────────

const mockGetUser = vi.fn()
const mockAdminFrom = vi.fn()
const mockGetValidAccessToken = vi.fn()
const mockFetch = vi.fn()

vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: vi.fn(async () => ({
    allowed: true,
    reason: 'test-bypass',
  })),
}))

vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({
  enforceSectionPermission: vi.fn(() => null),
}))

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/supabase/keys', () => ({
  getSupabaseSecretKey: vi.fn(() => 'test-secret-key'),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockAdminFrom })),
}))

vi.mock('@/lib/xero/token-manager', () => ({
  getValidAccessToken: mockGetValidAccessToken,
}))

vi.mock('@/lib/reports/revert-report', () => ({
  revertReportIfApproved: vi.fn(async () => undefined),
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'

// ─── Shared helpers ─────────────────────────────────────────────────────────

function makeLine(overrides: Partial<{
  account_name: string
  xero_account_name: string | null
  is_budget_only: boolean
  actual: number
  budget: number
  variance_amount: number
}> = {}) {
  const actual = overrides.actual ?? 0
  const budget = overrides.budget ?? 0
  // Convention: variance_amount = budget - actual (positive = favourable for expenses, unfavourable for revenue)
  // Aligns with existing page.tsx convention (line.variance_amount <= -500 → expense $500+ over)
  const variance_amount = overrides.variance_amount ?? budget - actual
  return {
    account_name: overrides.account_name ?? 'Test Account',
    xero_account_name: overrides.xero_account_name ?? overrides.account_name ?? 'Test Account',
    is_budget_only: overrides.is_budget_only ?? false,
    actual,
    budget,
    variance_amount,
    variance_percent: budget !== 0 ? (variance_amount / budget) * 100 : 0,
    ytd_actual: 0,
    ytd_budget: 0,
    ytd_variance_amount: 0,
    ytd_variance_percent: 0,
    unspent_budget: 0,
    budget_next_month: 0,
    budget_annual_total: 0,
    prior_year: null,
  }
}

function makeReport(sections: Array<{ category: string; lines: any[] }>) {
  return {
    business_id: 'biz-abc',
    report_month: '2026-04',
    fiscal_year: 2026,
    settings: {} as any,
    sections: sections.map(s => ({
      category: s.category as any,
      lines: s.lines,
      subtotal: makeLine({ account_name: `${s.category} Total` }),
    })),
    summary: {} as any,
    gross_profit_row: makeLine(),
    net_profit_row: makeLine(),
    is_draft: true,
    unreconciled_count: 0,
    has_budget: true,
  } as any
}

function makeBSRow(overrides: {
  label: string
  current: number | null
  prior: number | null
  type?: 'line_item' | 'subtotal' | 'section_header' | 'net_assets'
}) {
  const current = overrides.current
  const prior = overrides.prior
  const variance = current != null && prior != null ? current - prior : null
  return {
    type: overrides.type ?? 'line_item',
    label: overrides.label,
    current,
    prior,
    variance,
    variance_pct: variance != null && prior ? (variance / prior) * 100 : null,
  }
}

// ─── Tests 1-8: pure helper ────────────────────────────────────────────────

describe('collectCommentaryTriggers — pure helper', () => {
  it('Test 1: returns four arrays keyed by trigger type', async () => {
    const { collectCommentaryTriggers } = await import(
      '@/app/finances/monthly-report/utils/commentary-triggers'
    )

    const report = makeReport([
      {
        category: 'Operating Expenses',
        lines: [makeLine({ account_name: 'Marketing', actual: 1600, budget: 1000 })], // -600 variance
      },
      {
        category: 'Revenue',
        lines: [makeLine({ account_name: 'Sales', actual: 9000, budget: 10000 })], // -$1000 / -10% shortfall
      },
    ])

    const result = collectCommentaryTriggers(report)
    expect(result).toHaveProperty('expense_lines')
    expect(result).toHaveProperty('revenue_lines')
    expect(result).toHaveProperty('favourable_expense_lines')
    expect(result).toHaveProperty('bs_lines')
    expect(Array.isArray(result.expense_lines)).toBe(true)
    expect(Array.isArray(result.revenue_lines)).toBe(true)
    expect(Array.isArray(result.favourable_expense_lines)).toBe(true)
    expect(Array.isArray(result.bs_lines)).toBe(true)
  })

  it('Test 2: existing expense over-budget ≥$500 trigger preserved', async () => {
    const { collectCommentaryTriggers } = await import(
      '@/app/finances/monthly-report/utils/commentary-triggers'
    )

    const report = makeReport([
      {
        category: 'Operating Expenses',
        lines: [makeLine({ account_name: 'Office Supplies', actual: 1600, budget: 1000 })],
        // variance_amount = budget - actual = -600 → triggers existing rule
      },
    ])

    const result = collectCommentaryTriggers(report)
    expect(result.expense_lines).toHaveLength(1)
    expect(result.expense_lines[0]).toMatchObject({
      account_name: 'Office Supplies',
      trigger_reason: 'expense_over_budget_dollar',
    })
  })

  it('Test 3: revenue shortfall — dollar trigger (≥$500)', async () => {
    const { collectCommentaryTriggers } = await import(
      '@/app/finances/monthly-report/utils/commentary-triggers'
    )

    const report = makeReport([
      {
        category: 'Revenue',
        lines: [makeLine({ account_name: 'Sales', actual: 9000, budget: 10000 })],
        // shortfall=$1000, 10% of budget
      },
    ])

    const result = collectCommentaryTriggers(report)
    expect(result.revenue_lines).toHaveLength(1)
    expect(result.revenue_lines[0].account_name).toBe('Sales')
    // Both dollar AND percent thresholds fire; convention picks the dollar reason first.
    expect(result.revenue_lines[0].trigger_reason).toBe('revenue_under_budget_dollar')
  })

  it('Test 4: revenue shortfall — percent trigger (≥10% when dollar < $500)', async () => {
    const { collectCommentaryTriggers } = await import(
      '@/app/finances/monthly-report/utils/commentary-triggers'
    )

    const report = makeReport([
      {
        category: 'Revenue',
        lines: [makeLine({ account_name: 'Consulting', actual: 1700, budget: 2000 })],
        // shortfall=$300 (< $500) BUT 15% (≥ 10%)
      },
    ])

    const result = collectCommentaryTriggers(report)
    expect(result.revenue_lines).toHaveLength(1)
    expect(result.revenue_lines[0]).toMatchObject({
      account_name: 'Consulting',
      trigger_reason: 'revenue_under_budget_percent',
    })
  })

  it('Test 5: large favourable expense — variance ≥$500 AND ≥20%', async () => {
    const { collectCommentaryTriggers } = await import(
      '@/app/finances/monthly-report/utils/commentary-triggers'
    )

    const report = makeReport([
      {
        category: 'Operating Expenses',
        lines: [makeLine({ account_name: 'Travel', actual: 7000, budget: 10000 })],
        // variance = +3000 (favourable), 30% of budget
      },
    ])

    const result = collectCommentaryTriggers(report)
    expect(result.favourable_expense_lines).toHaveLength(1)
    expect(result.favourable_expense_lines[0]).toMatchObject({
      account_name: 'Travel',
      trigger_reason: 'expense_favourable_significant',
    })
  })

  it('Test 6: favourable expense but small % — NOT included', async () => {
    const { collectCommentaryTriggers } = await import(
      '@/app/finances/monthly-report/utils/commentary-triggers'
    )

    const report = makeReport([
      {
        category: 'Operating Expenses',
        lines: [makeLine({ account_name: 'Rent', actual: 99000, budget: 100000 })],
        // variance = +1000 (≥$500) but only 1% (< 20%) — both conditions required
      },
    ])

    const result = collectCommentaryTriggers(report)
    expect(result.favourable_expense_lines).toHaveLength(0)
  })

  it('Test 7: BS movement — dollar trigger (≥$5,000)', async () => {
    const { collectCommentaryTriggers } = await import(
      '@/app/finances/monthly-report/utils/commentary-triggers'
    )

    const balanceSheet = {
      business_id: 'biz-abc',
      report_date: '2026-04-30',
      compare: 'mom' as const,
      current_label: 'Apr 2026',
      prior_label: 'Mar 2026',
      balances: true,
      rows: [
        makeBSRow({ label: 'Cash', current: 57000, prior: 50000 }), // +$7,000 MoM
      ],
    }

    const report = makeReport([])
    const result = collectCommentaryTriggers(report, balanceSheet as any)
    expect(result.bs_lines).toHaveLength(1)
    expect(result.bs_lines[0]).toMatchObject({
      account_name: 'Cash',
      trigger_reason: 'bs_movement_dollar',
    })
  })

  it('Test 8: BS movement — percent trigger (≥10% of opening)', async () => {
    const { collectCommentaryTriggers } = await import(
      '@/app/finances/monthly-report/utils/commentary-triggers'
    )

    const balanceSheet = {
      business_id: 'biz-abc',
      report_date: '2026-04-30',
      compare: 'mom' as const,
      current_label: 'Apr 2026',
      prior_label: 'Mar 2026',
      balances: true,
      rows: [
        makeBSRow({ label: 'Accounts Receivable', current: 11200, prior: 10000 }),
        // change = +$1,200 (< $5,000) BUT 12% (≥ 10%)
      ],
    }

    const report = makeReport([])
    const result = collectCommentaryTriggers(report, balanceSheet as any)
    expect(result.bs_lines).toHaveLength(1)
    expect(result.bs_lines[0]).toMatchObject({
      account_name: 'Accounts Receivable',
      trigger_reason: 'bs_movement_percent',
    })
  })
})

// ─── Test 9: commentary route accepts expanded payload + emits trigger_reason

describe('POST /api/monthly-report/commentary — expanded payload + trigger_reason', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })

    // Default: route hits xero_connections, xero_pl_lines_wide_compat,
    // account_mappings, monthly_report_settings. Mock with a builder pattern.
    mockAdminFrom.mockImplementation((table: string) => {
      const builder: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
      }

      if (table === 'xero_connections') {
        builder.maybeSingle.mockResolvedValue({
          data: { id: 'conn-1', tenant_id: 'tenant-1', is_active: true },
          error: null,
        })
      } else if (table === 'xero_pl_lines_wide_compat') {
        // .select().eq() → array (not maybeSingle)
        builder.eq = vi.fn().mockResolvedValue({
          data: [
            { account_name: 'Marketing', account_code: '6010' },
            { account_name: 'Sales', account_code: '4000' },
            { account_name: 'Travel', account_code: '6020' },
          ],
          error: null,
        })
      } else if (table === 'account_mappings') {
        builder.not = vi.fn().mockResolvedValue({ data: [], error: null })
      } else if (table === 'monthly_report_settings') {
        builder.maybeSingle.mockResolvedValue({
          data: { subscription_account_codes: [], wages_account_names: [] },
          error: null,
        })
      }
      return builder
    })

    mockGetValidAccessToken.mockResolvedValue({
      success: true,
      accessToken: 'test-token',
    })

    // Stub Xero API to return zero invoices/banktx — vendor_summary will be empty,
    // but the commentary row should still emit with trigger_reason populated.
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ Invoices: [], BankTransactions: [] }),
    })
    global.fetch = mockFetch as any
  })

  it('Test 9: accepts expanded payload and tags each row with trigger_reason', async () => {
    const { POST } = await import('@/app/api/monthly-report/commentary/route')

    const req = new NextRequest('http://localhost/api/monthly-report/commentary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: 'biz-abc',
        report_month: '2026-04',
        expense_lines: [
          { account_name: 'Marketing', xero_account_name: 'Marketing' },
        ],
        revenue_lines: [
          { account_name: 'Sales', xero_account_name: 'Sales' },
        ],
        favourable_expense_lines: [
          { account_name: 'Travel', xero_account_name: 'Travel' },
        ],
        bs_lines: [],
        trigger_reasons: {
          Marketing: 'expense_over_budget_dollar',
          Sales: 'revenue_under_budget_dollar',
          Travel: 'expense_favourable_significant',
        },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.commentary).toBeDefined()
    // Each row in commentary must carry trigger_reason
    expect(body.commentary['Marketing']).toMatchObject({
      trigger_reason: 'expense_over_budget_dollar',
    })
    expect(body.commentary['Sales']).toMatchObject({
      trigger_reason: 'revenue_under_budget_dollar',
    })
    expect(body.commentary['Travel']).toMatchObject({
      trigger_reason: 'expense_favourable_significant',
    })
  })

  it('Test 9b: backward-compat — old expense_lines-only payload still works', async () => {
    const { POST } = await import('@/app/api/monthly-report/commentary/route')

    const req = new NextRequest('http://localhost/api/monthly-report/commentary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: 'biz-abc',
        report_month: '2026-04',
        expense_lines: [
          { account_name: 'Marketing', xero_account_name: 'Marketing' },
        ],
        // No revenue_lines / favourable_expense_lines / bs_lines / trigger_reasons
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    // Without trigger_reasons map, legacy expense_lines still default to the
    // canonical expense_over_budget_dollar reason.
    expect(body.commentary['Marketing']).toMatchObject({
      trigger_reason: 'expense_over_budget_dollar',
    })
  })
})
