/**
 * The Generate route's no-active-forecast read is refused for a business with
 * more than one Xero organisation (IICT-18): it keys on the account name and
 * a later organisation's months overwrite an earlier one's, with no exchange
 * rates. One organisation reads exactly as before.
 *
 * Through the exported POST, on an in-memory client that applies its filters.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase } from '@/lib/monthly-report/__tests__/fake-supabase'

const { dbRef } = vi.hoisted(() => ({ dbRef: { current: null as any } }))

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from: (t: string) => dbRef.current.from(t) })) }))
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: () => 'test-key' }))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'coach-1' } }, error: null }) } })),
}))
vi.mock('@/lib/utils/verify-business-access', () => ({ verifyBusinessAccess: vi.fn(async () => true) }))
vi.mock('@/lib/utils/rate-limiter', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  createRateLimitKey: vi.fn((p: string, id: string) => `${p}:${id}`),
  RATE_LIMIT_CONFIGS: { report: {} },
}))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({ requireSectionPermission: vi.fn(async () => ({ allow: true, reason: 'owner' })) }))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({ SECTION_PERMISSION_ENFORCE: false, enforceSectionPermission: () => null }))
vi.mock('@/lib/services/forecast-read-service', () => ({
  createForecastReadService: vi.fn(() => ({
    getMonthlyComposite: vi.fn(async () => ({ rows: [], data_quality: 'fresh', per_tenant_quality: [] })),
    getDataQualityForBusiness: vi.fn(async () => ({ data_quality: 'fresh', per_tenant_quality: [] })),
  })),
}))
vi.mock('@/lib/budgets/resolve-budget', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/budgets/resolve-budget')>()),
  resolveBudget: vi.fn(async () => ({ source: 'none', versionId: null, forecastId: null, noBudgetReason: null, label: null, lines: [], monthsCovered: 0 })),
}))

const BIZ = 'fbc6dffd-677d-47ec-8277-7157982938e7'
const PROFILE = '6c0dfadb-4229-4fc2-89eb-ec064d24511b'
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: vi.fn(async () => ({ businessId: BIZ, profileId: PROFILE, all: [BIZ, PROFILE] })),
}))

function tables(connections: Array<{ tenant_id: string; functional_currency: string }>) {
  return {
    business_profiles: [{ id: PROFILE, business_id: BIZ, fiscal_year_start: 7 }],
    monthly_report_settings: [],
    account_mappings: [{ business_id: BIZ, xero_account_name: 'Membership income', xero_account_code: '200', report_category: 'Revenue', report_subcategory: null }],
    // IICT's only FY2027 forecasts are inactive: the no-active-forecast read.
    financial_forecasts: [{ id: '88199866', business_id: PROFILE, fiscal_year: 2027, is_active: false, created_at: '2026-05-01' }],
    xero_connections: connections.map((c) => ({ business_id: BIZ, is_active: true, ...c })),
    xero_pl_lines_wide_compat: connections.map((c, i) => ({
      business_id: PROFILE, tenant_id: c.tenant_id, account_code: '200', account_name: 'Membership income', account_type: 'revenue', section: 'Revenue',
      monthly_values: { '2026-08': i === 0 ? 32_455 : 1_628_445 },
    })),
  }
}

async function generate() {
  const { POST } = await import('../route')
  return POST(new Request('http://localhost/api/monthly-report/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ business_id: BIZ, report_month: '2026-08', fiscal_year: 2027 }),
  }) as any)
}

beforeEach(() => {
  dbRef.current = null
})

describe('generate — the no-active-forecast read and more than one organisation', () => {
  it('refuses IICT’s shape (AUD + HKD) with a sentence the coach can act on, and never reads the lines', async () => {
    dbRef.current = fakeSupabase(tables([{ tenant_id: 'iap', functional_currency: 'AUD' }, { tenant_id: 'igl', functional_currency: 'HKD' }]))
    const res = await generate()
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('MULTI_ORG_NO_ACTIVE_FORECAST')
    expect(body.error).toContain('2 Xero organisations and no active FY2027 forecast')
    expect(body.error).toContain('one-for-one')
    expect(dbRef.current.calls.some((c: { table: string }) => c.table === 'xero_pl_lines_wide_compat')).toBe(false)
  })

  it('one organisation reads the lines as before', async () => {
    dbRef.current = fakeSupabase(tables([{ tenant_id: 'iap', functional_currency: 'AUD' }]))
    const res = await generate()
    expect(res.status).toBe(200)
    const report = (await res.json()).report
    const revenue = report.sections.find((s: any) => s.category === 'Revenue')
    expect(revenue.subtotal.actual).toBe(32_455)
  })
})
