/**
 * R29 (SEC-N2 / SEC-N3) — cross-tenant IDOR hard-gate on monthly-report routes.
 *
 * Eight monthly-report routes (account-mappings, auto-map, commentary, settings,
 * snapshot, subscription-detail, wages-detail, full-year) plus debug use a
 * module-level service-role Supabase client that bypasses RLS. Their only prior
 * tenant check was the section-permission layer, which is LOG_ONLY by default
 * (logs but does not block) — so an authenticated user of tenant A could pass
 * tenant B's business_id and read/write B's data.
 *
 * R29 adds a verifyBusinessAccess(user.id, businessId) hard-gate to every verb.
 * This suite proves the gate on a representative GET (settings) and POST
 * (snapshot), and confirms the gate is wired (not LOG_ONLY): a denied access
 * decision returns 403 and reaches no service-role query.
 *
 * The happy path (authorized user → 200) is already covered by the route-level
 * business-logic suites (proceed-as-draft, snapshot-serializer, commentary,
 * subscription-detail, etc.), which now mock verifyBusinessAccess → true.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Auth + permission mocks ─────────────────────────────────────────────────

const mockGetUser = vi.fn()
const mockVerifyBusinessAccess = vi.fn()
const mockAdminFrom = vi.fn()

vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: vi.fn(async () => ({ allowed: true, reason: 'test-bypass' })),
}))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({
  // Section layer stays LOG_ONLY (returns null = does not block) so this suite
  // proves the SEPARATE verifyBusinessAccess gate is what enforces isolation.
  enforceSectionPermission: vi.fn(() => null),
}))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))
vi.mock('@/lib/supabase/keys', () => ({
  getSupabaseSecretKey: () => 'test-secret-key',
}))
vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: (...args: any[]) => mockVerifyBusinessAccess(...args),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockAdminFrom })),
}))
vi.mock('@/lib/reports/revert-report', () => ({
  revertReportIfApproved: vi.fn(async () => ({ reverted: false })),
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getReq(url: string) {
  return new NextRequest(url)
}
function postReq(body: any) {
  return new NextRequest('http://test.local/api/monthly-report/snapshot', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const authedUser = { data: { user: { id: 'user-1' } }, error: null }

describe('R29 — monthly-report IDOR hard-gate', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local'
    process.env.SUPABASE_SERVICE_KEY = 'service-key'
    mockGetUser.mockReset()
    mockVerifyBusinessAccess.mockReset()
    mockAdminFrom.mockReset()
    mockGetUser.mockResolvedValue(authedUser)
    mockVerifyBusinessAccess.mockResolvedValue(true)
    // If any query slips through, surface it loudly rather than silently passing.
    mockAdminFrom.mockImplementation(() => {
      throw new Error('service-role query should not run when access is denied')
    })
  })

  it('GET settings → 401 when unauthenticated; no access check, no query', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const { GET } = await import('@/app/api/monthly-report/settings/route')
    const res = await GET(getReq('http://test.local/api/monthly-report/settings?business_id=biz-B'))
    expect(res.status).toBe(401)
    expect(mockVerifyBusinessAccess).not.toHaveBeenCalled()
    expect(mockAdminFrom).not.toHaveBeenCalled()
  })

  it('GET settings → 403 when the user lacks access to the business; no query', async () => {
    mockVerifyBusinessAccess.mockResolvedValue(false)
    const { GET } = await import('@/app/api/monthly-report/settings/route')
    const res = await GET(getReq('http://test.local/api/monthly-report/settings?business_id=biz-B'))
    expect(res.status).toBe(403)
    expect(mockVerifyBusinessAccess).toHaveBeenCalledWith('user-1', 'biz-B')
    expect(mockAdminFrom).not.toHaveBeenCalled()
  })

  it('POST snapshot → 403 when the user lacks access to the business; no query', async () => {
    mockVerifyBusinessAccess.mockResolvedValue(false)
    const { POST } = await import('@/app/api/monthly-report/snapshot/route')
    const res = await POST(postReq({
      business_id: 'biz-B',
      report_month: '2026-04',
      fiscal_year: 'FY2026',
      report_data: { sections: {} },
      summary: { revenue: 0 },
    }))
    expect(res.status).toBe(403)
    expect(mockVerifyBusinessAccess).toHaveBeenCalledWith('user-1', 'biz-B')
    expect(mockAdminFrom).not.toHaveBeenCalled()
  })

  it('POST snapshot → 400 (missing business_id) short-circuits before the access check', async () => {
    const { POST } = await import('@/app/api/monthly-report/snapshot/route')
    const res = await POST(postReq({ report_month: '2026-04' }))
    expect(res.status).toBe(400)
    expect(mockVerifyBusinessAccess).not.toHaveBeenCalled()
  })
})
