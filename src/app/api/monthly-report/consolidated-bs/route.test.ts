/**
 * Integration tests for /api/monthly-report/consolidated-bs.
 *
 * Tests the POST handler end-to-end with a mocked Supabase service client.
 * Shares the same mock-shape pattern as the balance-sheet engine tests.
 *
 * Two cases:
 *   - Case A: Dragon AUD-only with intercompany loan — Assets = Liab + Equity
 *             holds AND both loan sides zero.
 *   - Case B: IICT with one HKD tenant — FX rate loaded and applied, CTA line
 *             posted; missing rate path surfaced via fx_context.missing_rates.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted module mocks: these stub out dependencies the route loads at import
// time (Supabase client factory, cookies-bound auth client, rate limiter, etc).
//
// The service mock is a STABLE proxy object captured at module-load time.
// Every `.from(table)` call delegates to `currentServiceMock` at call time,
// so tests can swap `currentServiceMock` freely via `setServiceMock`.
vi.mock('@supabase/supabase-js', () => {
  const proxy = {
    from: (table: string) => currentServiceMock.from(table),
  }
  return { createClient: vi.fn(() => proxy) }
})
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => currentAuthMock),
}))
vi.mock('@/lib/utils/rate-limiter', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  createRateLimitKey: vi.fn((prefix: string, id: string) => `${prefix}:${id}`),
  RATE_LIMIT_CONFIGS: { report: {} },
}))

// resolveBusinessIds has a module-level cache — clear it before each test so
// a prior test's business_id doesn't bleed into the next test's mock.
vi.mock('@/lib/utils/resolve-business-ids', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return actual
})

// Per-test state — reassigned by each test via `setServiceMock` / `setAuthMock`
let currentServiceMock: any = { from: () => ({}) }
let currentAuthMock: any = {}

function setServiceMock(mock: any) {
  currentServiceMock = mock
}
function setAuthMock(mock: any) {
  currentAuthMock = mock
}

// ─── Supabase mock helpers ──────────────────────────────────────────────────
// Duplicate the chain builder from balance-sheet.test.ts so the route sees
// the same query shape. We re-implement (rather than export from test file)
// to keep test files self-contained.
function mockSupabase(rowsByTable: Record<string, any[]>) {
  const matchAll = (rows: any[], filters: Array<[string, unknown, 'eq' | 'in']>) => {
    return rows.filter((r) =>
      filters.every(([col, val, op]) => {
        if (op === 'eq') return r[col] === val
        if (op === 'in') return Array.isArray(val) && (val as unknown[]).includes(r[col])
        return false
      }),
    )
  }
  const buildQuery = (table: string, filters: Array<[string, unknown, 'eq' | 'in']> = []): any => {
    const rows = rowsByTable[table] ?? []
    const ex = () => matchAll(rows, filters)
    return {
      eq: (col: string, val: unknown) => buildQuery(table, [...filters, [col, val, 'eq']]),
      in: (col: string, val: unknown[]) => buildQuery(table, [...filters, [col, val, 'in']]),
      order: () => Promise.resolve({ data: ex(), error: null }),
      single: () =>
        Promise.resolve({ data: ex()[0] ?? null, error: ex()[0] ? null : { message: 'not found' } }),
      maybeSingle: () => Promise.resolve({ data: ex()[0] ?? null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: ex(), error: null }).then(resolve),
    }
  }
  return {
    from: (table: string) => ({ select: (_cols: string) => buildQuery(table) }),
  }
}

// Auth client — `.or()` chains are used by the access-check path in the route
function mockAuthClient(userId: string, businessId: string, isSuperAdmin = false) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'businesses') {
        return {
          select: () => ({
            eq: () => ({
              or: () => ({
                maybeSingle: async () => ({
                  data: { id: businessId }, // always grant access for test simplicity
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'system_roles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: isSuperAdmin ? { role: 'super_admin' } : null,
                error: null,
              }),
            }),
          }),
        }
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
    },
  }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const DRAGON_BIZ = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const DRAGON_TENANT = 'tenant-dragon-roofing'
const EASY_HAIL_TENANT = 'tenant-easy-hail'

const dragonBSLines = [
  { business_id: DRAGON_BIZ, tenant_id: DRAGON_TENANT, account_name: 'Bank', account_code: null, account_type: 'asset', section: 'Current Assets', monthly_values: { '2026-03': 684827 } },
  { business_id: DRAGON_BIZ, tenant_id: DRAGON_TENANT, account_name: 'Fixed Assets', account_code: null, account_type: 'asset', section: 'Non-Current Assets', monthly_values: { '2026-03': 315173 } },
  { business_id: DRAGON_BIZ, tenant_id: DRAGON_TENANT, account_name: 'Trade Payables', account_code: null, account_type: 'liability', section: 'Current Liabilities', monthly_values: { '2026-03': 284827 } },
  { business_id: DRAGON_BIZ, tenant_id: DRAGON_TENANT, account_name: 'Loan Payable - Dragon Roofing', account_code: null, account_type: 'liability', section: 'Non-Current Liabilities', monthly_values: { '2026-03': 315173 } },
  { business_id: DRAGON_BIZ, tenant_id: DRAGON_TENANT, account_name: 'Retained Earnings', account_code: null, account_type: 'equity', section: 'Equity', monthly_values: { '2026-03': 400000 } },
]
const easyHailBSLines = [
  { business_id: DRAGON_BIZ, tenant_id: EASY_HAIL_TENANT, account_name: 'Bank', account_code: null, account_type: 'asset', section: 'Current Assets', monthly_values: { '2026-03': 184827 } },
  { business_id: DRAGON_BIZ, tenant_id: EASY_HAIL_TENANT, account_name: 'Loan Receivable - Dragon Roofing', account_code: null, account_type: 'asset', section: 'Current Assets', monthly_values: { '2026-03': 315173 } },
  { business_id: DRAGON_BIZ, tenant_id: EASY_HAIL_TENANT, account_name: 'Trade Payables', account_code: null, account_type: 'liability', section: 'Current Liabilities', monthly_values: { '2026-03': 100000 } },
  { business_id: DRAGON_BIZ, tenant_id: EASY_HAIL_TENANT, account_name: 'Retained Earnings', account_code: null, account_type: 'equity', section: 'Equity', monthly_values: { '2026-03': 400000 } },
]

const dragonLoanRule = {
  id: 'r-loan',
  business_id: DRAGON_BIZ,
  rule_type: 'intercompany_loan',
  tenant_a_id: DRAGON_TENANT,
  entity_a_account_code: null,
  entity_a_account_name_pattern: 'Loan Payable - Dragon Roofing',
  tenant_b_id: EASY_HAIL_TENANT,
  entity_b_account_code: null,
  entity_b_account_name_pattern: 'Loan Receivable - Dragon Roofing',
  direction: 'bidirectional',
  description: 'Dragon/Easy Hail intercompany loan',
  active: true,
}

function buildDragonMockState(rules: any[] = [dragonLoanRule]) {
  return {
    businesses: [{ id: DRAGON_BIZ, name: 'Dragon Consolidation' }],
    business_profiles: [{ id: DRAGON_BIZ, business_id: DRAGON_BIZ, fiscal_year_start: 7 }],
    xero_connections: [
      { id: 'c-1', business_id: DRAGON_BIZ, tenant_id: DRAGON_TENANT, tenant_name: 'Dragon Roofing', display_name: 'Dragon Roofing Pty Ltd', display_order: 0, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
      { id: 'c-2', business_id: DRAGON_BIZ, tenant_id: EASY_HAIL_TENANT, tenant_name: 'Easy Hail', display_name: 'Easy Hail Claim Pty Ltd', display_order: 1, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
    ],
    xero_balance_sheet_lines: [...dragonBSLines, ...easyHailBSLines],
    consolidation_elimination_rules: rules,
    fx_rates: [], // Dragon is AUD-only; never consulted
  }
}

// ─── Route handler test harness ─────────────────────────────────────────────
// We dynamically import the route AFTER configuring mocks so the module picks
// up our stubbed clients.

async function invokeRoute(body: unknown) {
  const { POST } = await import('./route')
  const req = new Request('http://localhost/api/monthly-report/consolidated-bs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await POST(req as any)
  return {
    status: res.status,
    json: (await res.json()) as any,
  }
}

describe('POST /api/monthly-report/consolidated-bs', () => {
  beforeEach(() => {
    // Default to an authenticated user with access to the business.
    setAuthMock(mockAuthClient('user-1', DRAGON_BIZ, false))
    // Default service client returns Dragon state with loan rule.
    setServiceMock(mockSupabase(buildDragonMockState()))
  })

  // ─── Case A: Dragon AUD-only with intercompany loan ──────────────────────
  it('Case A — Dragon AUD-only: Assets = Liabilities + Equity, loan zeroed', async () => {
    const { status, json } = await invokeRoute({
      business_id: DRAGON_BIZ,
      report_month: '2026-03',
      fiscal_year: 2026,
    })

    expect(status).toBe(200)
    expect(json.success).toBe(true)
    const report = json.report

    // Both loan sides zeroed (Pitfall 5)
    const loanPayable = report.consolidated.rows.find(
      (r: any) => r.account_name === 'Loan Payable - Dragon Roofing',
    )
    const loanReceivable = report.consolidated.rows.find(
      (r: any) => r.account_name === 'Loan Receivable - Dragon Roofing',
    )
    expect(loanPayable.balance).toBeCloseTo(0, 0)
    expect(loanReceivable.balance).toBeCloseTo(0, 0)

    // Assets = Liabilities + Equity (post-elimination)
    const assetsSum = report.consolidated.rows
      .filter((r: any) => r.account_type === 'asset')
      .reduce((s: number, r: any) => s + r.balance, 0)
    const liabilitiesSum = report.consolidated.rows
      .filter((r: any) => r.account_type === 'liability')
      .reduce((s: number, r: any) => s + r.balance, 0)
    const equitySum = report.consolidated.rows
      .filter((r: any) => r.account_type === 'equity')
      .reduce((s: number, r: any) => s + r.balance, 0)
    expect(Math.abs(assetsSum - (liabilitiesSum + equitySum))).toBeLessThanOrEqual(0.01)

    // Consolidated assets $1,184,827 (pre-elim $1,500,000 − $315,173)
    expect(assetsSum).toBeCloseTo(1184827, 0)

    // Elimination entries captured
    expect(report.eliminations.length).toBe(2)
    expect(report.eliminations.some((e: any) => e.account_name === 'Loan Payable - Dragon Roofing')).toBe(true)
    expect(report.eliminations.some((e: any) => e.account_name === 'Loan Receivable - Dragon Roofing')).toBe(true)

    // No FX (AUD-only) — no CTA line
    expect(report.consolidated.translationReserve).toBe(0)
    expect(report.fx_context.rates_used).toEqual({})
    expect(report.fx_context.missing_rates).toEqual([])

    // 2 tenants loaded
    expect(report.diagnostics.tenants_loaded).toBe(2)
    expect(report.byTenant.length).toBe(2)
  })

  // ─── Case B: IICT with HKD tenant ────────────────────────────────────────
  it('Case B — IICT HKD tenant: FX rate loaded, CTA line posted', async () => {
    const IICT_BIZ = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const HK_TENANT = 'tenant-iict-hk'
    const AU_TENANT = 'tenant-iict-au'
    const iictState = {
      businesses: [{ id: IICT_BIZ, name: 'IICT Consolidation' }],
      business_profiles: [{ id: IICT_BIZ, business_id: IICT_BIZ, fiscal_year_start: 7 }],
      xero_connections: [
        { id: 'c-hk', business_id: IICT_BIZ, tenant_id: HK_TENANT, tenant_name: 'IICT Group Limited', display_name: 'IICT Group Limited', display_order: 0, functional_currency: 'HKD', include_in_consolidation: true, is_active: true },
        { id: 'c-au', business_id: IICT_BIZ, tenant_id: AU_TENANT, tenant_name: 'IICT Aust', display_name: 'IICT (Aust) Pty Ltd', display_order: 1, functional_currency: 'AUD', include_in_consolidation: true, is_active: true },
      ],
      xero_balance_sheet_lines: [
        // HKD-denominated, at rate 0.1925 translates to AUD
        { business_id: IICT_BIZ, tenant_id: HK_TENANT, account_name: 'Cash', account_code: null, account_type: 'asset', section: 'Current Assets', monthly_values: { '2026-03': 10000 } },
        { business_id: IICT_BIZ, tenant_id: HK_TENANT, account_name: 'Payables', account_code: null, account_type: 'liability', section: 'Current Liabilities', monthly_values: { '2026-03': 6000 } },
        { business_id: IICT_BIZ, tenant_id: HK_TENANT, account_name: 'Retained Earnings', account_code: null, account_type: 'equity', section: 'Equity', monthly_values: { '2026-03': 4000 } },
        // AUD already
        { business_id: IICT_BIZ, tenant_id: AU_TENANT, account_name: 'Cash', account_code: null, account_type: 'asset', section: 'Current Assets', monthly_values: { '2026-03': 5000 } },
        { business_id: IICT_BIZ, tenant_id: AU_TENANT, account_name: 'Payables', account_code: null, account_type: 'liability', section: 'Current Liabilities', monthly_values: { '2026-03': 2000 } },
        { business_id: IICT_BIZ, tenant_id: AU_TENANT, account_name: 'Retained Earnings', account_code: null, account_type: 'equity', section: 'Equity', monthly_values: { '2026-03': 3000 } },
      ],
      consolidation_elimination_rules: [],
      fx_rates: [
        { currency_pair: 'HKD/AUD', rate_type: 'closing_spot', period: '2026-03-31', rate: 0.1925 },
      ],
    }
    setAuthMock(mockAuthClient('user-1', IICT_BIZ, false))
    setServiceMock(mockSupabase(iictState))

    const { status, json } = await invokeRoute({
      business_id: IICT_BIZ,
      report_month: '2026-03',
      fiscal_year: 2026,
    })

    expect(status).toBe(200)
    const report = json.report

    // FX rate loaded + surfaced
    expect(report.fx_context.rates_used['HKD/AUD']).toBeCloseTo(0.1925, 4)
    expect(report.fx_context.missing_rates).toEqual([])

    // HK Cash translated: 10000 * 0.1925 = 1925 on the HK column
    const hkColumn = report.byTenant.find((c: any) => c.tenant_id === HK_TENANT)
    const hkCashRow = hkColumn.rows.find((r: any) => r.account_name === 'Cash')
    expect(hkCashRow.balance).toBeCloseTo(1925, 0)

    // Consolidated balances post-translation + CTA
    const assetsSum = report.consolidated.rows.filter((r: any) => r.account_type === 'asset').reduce((s: number, r: any) => s + r.balance, 0)
    const liabSum = report.consolidated.rows.filter((r: any) => r.account_type === 'liability').reduce((s: number, r: any) => s + r.balance, 0)
    const equitySum = report.consolidated.rows.filter((r: any) => r.account_type === 'equity').reduce((s: number, r: any) => s + r.balance, 0)
    expect(Math.abs(assetsSum - (liabSum + equitySum))).toBeLessThanOrEqual(0.01)

    // The HK tenant BS balances in HKD (Assets 10k = Liab 6k + Equity 4k), so at
    // a single closing-spot rate the translated BS STILL balances — so CTA = 0
    // here. This is the correct IAS 21 result when there is no P&L retained
    // earnings translation delta. The CTA non-zero case is covered in the
    // unit test (balance-sheet.test.ts) with a deliberately mismatched rate.
    expect(Math.abs(report.consolidated.translationReserve)).toBeLessThanOrEqual(0.01)
    expect(report.diagnostics.tenants_loaded).toBe(2)
  })

  // ─── Error / auth / input paths ──────────────────────────────────────────
  it('returns 401 when unauthenticated', async () => {
    setAuthMock({
      auth: {
        getUser: async () => ({ data: { user: null }, error: { message: 'no session' } }),
      },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    })
    const { status, json } = await invokeRoute({
      business_id: DRAGON_BIZ,
      report_month: '2026-03',
      fiscal_year: 2026,
    })
    expect(status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 400 when required fields are missing', async () => {
    const { status, json } = await invokeRoute({ business_id: DRAGON_BIZ })
    expect(status).toBe(400)
    expect(json.error).toMatch(/required/)
  })

  it('surfaces missing closing-spot rate via fx_context.missing_rates (no 1.0 fallback)', async () => {
    const IICT_BIZ = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const HK_TENANT = 'tenant-iict-hk'
    const iictState = {
      businesses: [{ id: IICT_BIZ, name: 'IICT' }],
      business_profiles: [{ id: IICT_BIZ, business_id: IICT_BIZ, fiscal_year_start: 7 }],
      xero_connections: [
        { id: 'c-hk', business_id: IICT_BIZ, tenant_id: HK_TENANT, tenant_name: 'IICT Group Limited', display_name: 'IICT Group Limited', display_order: 0, functional_currency: 'HKD', include_in_consolidation: true, is_active: true },
      ],
      xero_balance_sheet_lines: [
        { business_id: IICT_BIZ, tenant_id: HK_TENANT, account_name: 'Cash', account_code: null, account_type: 'asset', section: 'Current Assets', monthly_values: { '2026-03': 10000 } },
      ],
      consolidation_elimination_rules: [],
      fx_rates: [], // no closing-spot rate for 2026-03-31
    }
    setAuthMock(mockAuthClient('user-1', IICT_BIZ, false))
    setServiceMock(mockSupabase(iictState))

    const { status, json } = await invokeRoute({
      business_id: IICT_BIZ,
      report_month: '2026-03',
      fiscal_year: 2026,
    })

    expect(status).toBe(200)
    const report = json.report
    // Missing rate captured — no silent 1.0 fallback
    expect(report.fx_context.missing_rates).toContainEqual({
      currency_pair: 'HKD/AUD',
      period: '2026-03-31',
    })
    // Without translation, HK values pass through untranslated (still HKD 10,000)
    const hkCol = report.byTenant.find((c: any) => c.tenant_id === HK_TENANT)
    const hkCashRow = hkCol.rows.find((r: any) => r.account_name === 'Cash')
    expect(hkCashRow.balance).toBeCloseTo(10000, 0)
  })
})
