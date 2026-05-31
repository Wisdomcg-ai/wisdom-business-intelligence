/**
 * Phase 71-05 — S2 Subscription budget-only vendor visibility (TDD RED → GREEN)
 *
 * Bug being locked:
 *   src/app/api/monthly-report/subscription-detail/route.ts (~line 406) filters
 *   the final response with `.filter(a => a.vendors.length > 0)`. That alone
 *   would be benign except the upstream `vendorData` map is only populated
 *   from bank-transaction loops, so any subscription_budgets vendor whose
 *   bank-tx for the month never landed (annual subs in off-month, mis-mapped
 *   contacts, vendors paid by card and not yet reconciled) becomes invisible
 *   in the response — the coach sees a $0 actual on the account but no idea
 *   WHICH budgeted vendor is missing.
 *
 * Fix (per Phase 71 CONTEXT D-S2):
 *   - Always render budgeted vendors in the response, even with zero actuals.
 *   - Zero-actual budget rows carry `actual: 0`, `prior_month_actual: 0`,
 *     `transaction_count: 0`, `budget: <monthly_budget>`.
 *   - UI flags them with a "not billed this month" badge.
 *
 * Schema note:
 *   `subscription_budgets` columns relevant here are:
 *     vendor_name, vendor_key, monthly_budget, account_codes (text[]),
 *     is_active. The plan-spec said `account_code` (singular) + `monthly_amount`
 *     but production schema uses `account_codes` array + `monthly_budget`
 *     (see supabase/migrations/00000000000000_baseline_schema.sql:4916).
 *     Test mocks are aligned with the production columns.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

// Section-permission gate (LOG_ONLY by default) — allow through.
vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: vi.fn(async () => ({ allowed: true, reason: 'ok' })),
}))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({
  enforceSectionPermission: vi.fn(() => null),
}))

// Service-role supabase key helper.
vi.mock('@/lib/supabase/keys', () => ({
  getSupabaseSecretKey: () => 'test-secret-key',
}))

// Token manager: always succeed with a fake access token.
vi.mock('@/lib/xero/token-manager', () => ({
  getValidAccessToken: vi.fn(async () => ({
    success: true,
    accessToken: 'fake-access-token',
  })),
}))

// Auth route-handler client — authenticated user.
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

// ── Service-role supabase mock (the module-level `supabase`) ─────────────────
//
// The route does several .from(...) queries:
//   - xero_connections (.select('*').eq().eq().maybeSingle())
//   - subscription_budgets (.select(...).eq().eq() → returns array)
//   - xero_pl_lines_wide_compat (.select(...).eq().in() → returns array)
//   - monthly_report_settings (.select('budget_forecast_id').eq().maybeSingle())
//   - financial_forecasts (.select('id').in().eq().order().limit().maybeSingle())
//   - forecast_pl_lines (.select(...).eq() → returns array)
//   - account_mappings (.select(...).eq() → returns array)
//
// Per-table fixtures are configured by each test via `tableFixtures`.

type TableData = { rows?: any[]; single?: any | null; error?: any | null }
let tableFixtures: Record<string, TableData> = {}

function chainable(table: string): any {
  const fx = tableFixtures[table] ?? { rows: [], single: null }
  const rows = fx.rows ?? []
  const single = fx.single ?? null
  const error = fx.error ?? null

  const c: any = {
    eq: () => c,
    in: () => c,
    or: () => c,
    is: () => c,
    order: () => c,
    limit: () => c,
    maybeSingle: async () => ({ data: single, error }),
    single: async () => ({ data: single, error }),
    // Awaiting the chain itself yields the rows array.
    then: (resolve: any, reject?: any) =>
      Promise.resolve({ data: rows, error }).then(resolve, reject),
  }
  return c
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => ({ select: () => chainable(table) }),
  })),
}))

// ── Xero fetch mock ──────────────────────────────────────────────────────────
//
// The route hits:
//   GET /api.xro/2.0/Accounts (chart of accounts → code↔name)
//   GET /api.xro/2.0/BankTransactions?where=... (current month, then prior month)
//
// Tests stash canned responses on `xeroFixtures` and the global fetch mock
// returns them based on URL pattern + a per-call call-count for the BankTransactions
// endpoint (first call = current month, second call = prior month).
type XeroFixtures = {
  accounts: any[]
  currentBankTxns: any[]
  priorBankTxns: any[]
}
let xeroFixtures: XeroFixtures = {
  accounts: [],
  currentBankTxns: [],
  priorBankTxns: [],
}
let bankTxnCallCount = 0

function mockFetch(url: any): Promise<Response> {
  const u = String(url)
  if (u.includes('/api.xro/2.0/Accounts') && !u.includes('BankTransactions')) {
    return Promise.resolve(
      new Response(JSON.stringify({ Accounts: xeroFixtures.accounts }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }
  if (u.includes('/api.xro/2.0/BankTransactions')) {
    bankTxnCallCount += 1
    // First call = current month, second = prior month (pagination loop on
    // page=1 returns <100 items, so the inner while loop only calls fetch once
    // per period).
    const isCurrent = bankTxnCallCount === 1
    const items = isCurrent ? xeroFixtures.currentBankTxns : xeroFixtures.priorBankTxns
    return Promise.resolve(
      new Response(JSON.stringify({ BankTransactions: items }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }
  return Promise.resolve(new Response('{}', { status: 200 }))
}

// ─── Imports AFTER mock declarations ──────────────────────────────────────────
import { POST } from '@/app/api/monthly-report/subscription-detail/route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: any): NextRequest {
  return new NextRequest('http://localhost/api/monthly-report/subscription-detail', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  } as any)
}

beforeEach(() => {
  bankTxnCallCount = 0
  tableFixtures = {}
  xeroFixtures = {
    accounts: [
      { Code: '415', Name: 'Subscriptions — Software' },
      { Code: '440', Name: 'Payment Processing' },
    ],
    currentBankTxns: [],
    priorBankTxns: [],
  }
  // Default xero_connections row so the route doesn't short-circuit.
  tableFixtures['xero_connections'] = {
    single: {
      id: 'conn-1',
      business_id: 'biz-1',
      tenant_id: 'tenant-1',
      is_active: true,
    },
  }
  vi.stubGlobal('fetch', vi.fn(mockFetch))
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('S2 — subscription-detail budget-only vendor visibility', () => {
  it('Test 1: budget-only vendor appears with actual=0, transaction_count=0', async () => {
    // No bank transactions for account 415 this month or prior.
    xeroFixtures.currentBankTxns = []
    xeroFixtures.priorBankTxns = []

    // subscription_budgets has one budget-only row on account 415.
    tableFixtures['subscription_budgets'] = {
      rows: [
        {
          vendor_name: 'LastPass',
          vendor_key: 'lastpass',
          monthly_budget: 25,
          account_codes: ['415'],
          is_active: true,
        },
      ],
    }

    const res = await POST(makeRequest({
      business_id: 'biz-1',
      report_month: '2026-04',
      account_codes: ['415'],
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)

    const acc = json.data.accounts.find((a: any) => a.account_code === '415')
    expect(acc, 'account 415 should be present in response').toBeTruthy()
    expect(acc.vendors).toHaveLength(1)
    const v = acc.vendors[0]
    expect(v.vendor_name).toBe('LastPass')
    expect(v.actual).toBe(0)
    expect(v.prior_month_actual).toBe(0)
    expect(v.transaction_count).toBe(0)
    expect(v.budget).toBe(25)
  })

  it('Test 2: existing transacted vendor preserved (no regression)', async () => {
    xeroFixtures.currentBankTxns = [
      {
        Type: 'SPEND',
        Contact: { Name: 'Stripe Au' },
        LineItems: [{ AccountCode: '440', LineAmount: 50, Description: '' }],
      },
    ]
    xeroFixtures.priorBankTxns = []

    tableFixtures['subscription_budgets'] = {
      rows: [
        {
          vendor_name: 'Stripe Au',
          vendor_key: 'stripe',
          monthly_budget: 50,
          account_codes: ['440'],
          is_active: true,
        },
      ],
    }

    const res = await POST(makeRequest({
      business_id: 'biz-1',
      report_month: '2026-04',
      account_codes: ['440'],
    }))
    const json = await res.json()
    const acc = json.data.accounts.find((a: any) => a.account_code === '440')
    expect(acc).toBeTruthy()
    expect(acc.vendors).toHaveLength(1)
    const v = acc.vendors[0]
    // extractVendorName('Stripe Au', '') → matchKnownVendor returns 'Stripe'.
    expect(v.vendor_name).toBe('Stripe')
    expect(v.actual).toBe(50)
    expect(v.transaction_count).toBe(1)
    expect(v.budget).toBe(50)
  })

  it('Test 3: mixed — budget-only + transacted vendors both visible', async () => {
    xeroFixtures.currentBankTxns = [
      {
        Type: 'SPEND',
        Contact: { Name: 'Stripe Au' },
        LineItems: [{ AccountCode: '440', LineAmount: 50, Description: '' }],
      },
    ]
    xeroFixtures.priorBankTxns = []

    tableFixtures['subscription_budgets'] = {
      rows: [
        {
          vendor_name: 'LastPass',
          vendor_key: 'lastpass',
          monthly_budget: 25,
          account_codes: ['415'],
          is_active: true,
        },
        {
          vendor_name: 'Stripe Au',
          vendor_key: 'stripe',
          monthly_budget: 50,
          account_codes: ['440'],
          is_active: true,
        },
      ],
    }

    const res = await POST(makeRequest({
      business_id: 'biz-1',
      report_month: '2026-04',
      account_codes: ['415', '440'],
    }))
    const json = await res.json()

    const acc415 = json.data.accounts.find((a: any) => a.account_code === '415')
    const acc440 = json.data.accounts.find((a: any) => a.account_code === '440')

    expect(acc415, 'account 415 should appear via budget-only LastPass').toBeTruthy()
    expect(acc415.vendors).toHaveLength(1)
    expect(acc415.vendors[0].vendor_name).toBe('LastPass')
    expect(acc415.vendors[0].actual).toBe(0)
    expect(acc415.vendors[0].transaction_count).toBe(0)
    expect(acc415.vendors[0].budget).toBe(25)

    expect(acc440).toBeTruthy()
    expect(acc440.vendors).toHaveLength(1)
    expect(acc440.vendors[0].vendor_name).toBe('Stripe')
    expect(acc440.vendors[0].actual).toBe(50)
    expect(acc440.vendors[0].transaction_count).toBe(1)
  })

  it('Test 4: unbudgeted Xero vendor still visible (no regression)', async () => {
    xeroFixtures.currentBankTxns = [
      {
        Type: 'SPEND',
        Contact: { Name: 'Adobe' },
        LineItems: [{ AccountCode: '440', LineAmount: 50, Description: '' }],
      },
    ]
    xeroFixtures.priorBankTxns = []

    // No subscription_budgets row for Adobe.
    tableFixtures['subscription_budgets'] = { rows: [] }

    const res = await POST(makeRequest({
      business_id: 'biz-1',
      report_month: '2026-04',
      account_codes: ['440'],
    }))
    const json = await res.json()
    const acc = json.data.accounts.find((a: any) => a.account_code === '440')
    expect(acc).toBeTruthy()
    expect(acc.vendors).toHaveLength(1)
    const v = acc.vendors[0]
    expect(v.vendor_name).toBe('Adobe')
    expect(v.actual).toBe(50)
    expect(v.transaction_count).toBe(1)
    // budget may be 0 or undefined for unbudgeted — assert "not > 0".
    expect(v.budget ?? 0).toBe(0)
  })
})
