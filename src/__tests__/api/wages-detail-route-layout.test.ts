/**
 * The wages-detail route builds the per-employee Budget from the layout the
 * page is printing, when the page sends it.
 *
 * The export prints the Payroll Report from the page's layout — which can be a
 * just-saved one, or a default template's applied on load and never saved. The
 * route read only the STORED layout, so the Wages Analysis page in the same
 * export could read a different roster. Tests go through the exported POST.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: vi.fn(async () => ({ allowed: true, reason: 'ok' })),
}))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({ enforceSectionPermission: vi.fn(() => null) }))
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: () => 'test-secret-key' }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
  })),
}))
vi.mock('@/lib/utils/verify-business-access', () => ({ verifyBusinessAccess: vi.fn(async () => true) }))
vi.mock('@/lib/xero/token-manager', () => ({ getValidAccessToken: vi.fn() }))
const loadWagesDetail = vi.fn(async (..._args: unknown[]) => ({ data: { accounts: [] }, live_fallback: 'not_needed' }))
vi.mock('@/lib/monthly-report/wages-detail-load', () => ({
  loadWagesDetail: (...args: unknown[]) => loadWagesDetail(...args),
}))

const BUSINESS = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
const base = { business_id: BUSINESS, report_month: '2026-08', fiscal_year: 2027, wages_account_names: ['Employ - Wages & Salaries'] }
const layout = { version: 1, pages: [{ id: 'calxa-24', widgets: [{ id: 'calxa-24-w-payroll_grid', type: 'payroll_grid', config: { roster: [{ name: 'Andrea Shinners', weekly_salary: 2500 }] } }] }] }

async function post(body: unknown) {
  const { POST } = await import('@/app/api/monthly-report/wages-detail/route')
  const req = new NextRequest('http://localhost/api/monthly-report/wages-detail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (POST as (req: Request, ctx: unknown) => Promise<Response>)(req, { params: {} })
}

describe('POST /api/monthly-report/wages-detail — the layout being printed', () => {
  beforeEach(() => loadWagesDetail.mockClear())

  it('hands the posted layout to the loader', async () => {
    const res = await post({ ...base, pdf_layout: layout })
    expect(res.status).toBe(200)
    expect(loadWagesDetail.mock.calls[0][1]).toMatchObject({ ...base, pdf_layout: layout })
  })

  it('hands on a posted null — a page printing no layout reads no roster', async () => {
    await post({ ...base, pdf_layout: null })
    expect(loadWagesDetail.mock.calls[0][1]).toHaveProperty('pdf_layout', null)
  })

  it('leaves the loader on the stored layout when no layout is posted', async () => {
    await post(base)
    expect((loadWagesDetail.mock.calls[0][1] as Record<string, unknown>).pdf_layout).toBeUndefined()
  })
})
