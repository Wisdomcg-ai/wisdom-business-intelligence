/**
 * R24 (SEC-N1) — auth guard regression for GET /api/Xero/employees.
 *
 * This route returns live payroll PII (names, emails, job titles, annual
 * salaries, hourly rates, hours) via a service-role client. Before R24 it
 * gated only on `business_id` presence — no session required at all — leaking
 * every tenant's compensation roster.
 *
 * The contract these tests lock:
 *   - unauthenticated (no session)     → 401, no Xero/DB work
 *   - authenticated but not authorized → 403, no Xero/DB work
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Keep all downstream I/O modules importable but inert ──────────────────────
const serviceFrom = vi.fn(() => {
  throw new Error('service-role DB must not be reached when auth/authz fails')
})
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: serviceFrom })),
}))
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: vi.fn(() => 'k') }))
const getValidAccessToken = vi.fn()
vi.mock('@/lib/xero/token-manager', () => ({
  getValidAccessToken: () => getValidAccessToken(),
}))
const resolveXeroBusinessId = vi.fn()
vi.mock('@/lib/utils/resolve-xero-business-id', () => ({
  resolveXeroBusinessId: (supabase: unknown, id: string) => resolveXeroBusinessId(supabase, id),
}))
vi.mock('@/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping', () => ({
  mapXeroPayrollCalendarToFrequency: vi.fn(),
  normaliseXeroEmployment: vi.fn(),
  extractCompensationFromPayTemplate: vi.fn(),
  deriveHoursAndSalaryFromPayRun: vi.fn(),
}))

// ── Auth + authz mocks (the surfaces under test) ──────────────────────────────
let currentUser: any = null
let currentAccess = false
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: currentUser }, error: null })) },
  })),
}))
const verifyBusinessAccess = vi.fn(async (_userId: string, _businessId: string) => currentAccess)
vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: (userId: string, businessId: string) =>
    verifyBusinessAccess(userId, businessId),
}))

const BIZ_ID = 'biz-employees-guard-0001'
const USER_ID = 'user-employees-guard-0001'

async function callGet() {
  const route = await import('../route')
  return route.GET(
    new NextRequest(`http://localhost/api/Xero/employees?business_id=${BIZ_ID}`),
  )
}

describe('Xero/employees auth guard (R24)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentUser = null
    currentAccess = false
  })

  it('returns 401 when unauthenticated and never touches Xero/DB', async () => {
    currentUser = null
    const res = await callGet()
    expect(res.status).toBe(401)
    expect(resolveXeroBusinessId).not.toHaveBeenCalled()
    expect(getValidAccessToken).not.toHaveBeenCalled()
    expect(serviceFrom).not.toHaveBeenCalled()
  })

  it('returns 403 when authenticated but not authorized', async () => {
    currentUser = { id: USER_ID }
    currentAccess = false
    const res = await callGet()
    expect(res.status).toBe(403)
    expect(verifyBusinessAccess).toHaveBeenCalledWith(USER_ID, BIZ_ID)
    expect(resolveXeroBusinessId).not.toHaveBeenCalled()
    expect(getValidAccessToken).not.toHaveBeenCalled()
    expect(serviceFrom).not.toHaveBeenCalled()
  })
})
