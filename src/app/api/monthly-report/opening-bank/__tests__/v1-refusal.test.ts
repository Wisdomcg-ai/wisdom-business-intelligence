/**
 * GET /api/monthly-report/opening-bank carries, beside the opening, why the v1
 * cashflow must not be built on this business at all. The page asks before it
 * looks up a forecast; a business with more than one Xero organisation or a
 * foreign currency gets the reason on its cash pages, not v1's figures.
 *
 * Through the exported handler (withQuerySchema forwards the request as-is).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { loadMock } = vi.hoisted(() => ({ loadMock: vi.fn() }))

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: () => 'secret' }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'coach-1' } }, error: null }) } }),
}))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({ requireSectionPermission: vi.fn(async () => ({ allowed: true })) }))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({ enforceSectionPermission: vi.fn(() => null) }))
vi.mock('@/lib/utils/verify-business-access', () => ({ verifyBusinessAccess: vi.fn(async () => true) }))
vi.mock('@/lib/monthly-report/opening-bank-load', () => ({ loadPackCashflowOpening: loadMock }))

import { GET } from '../route'

const call = (qs: string) => GET(new Request(`http://localhost/api/monthly-report/opening-bank?${qs}`) as never)

beforeEach(() => {
  loadMock.mockReset()
})

describe('opening-bank route — v1_refusal', () => {
  it('passes the refusal through with the opening', async () => {
    loadMock.mockResolvedValue({
      opening: { status: 'read', amount: 430106.7, asAt: '2026-06-30' },
      v1Refusal: 'This business has more than one Xero organisation, and the cashflow cannot yet be built for more than one.',
    })
    const res = await call('business_id=c7df2983-5711-4959-8ec8-a48030d62666&report_month=2026-08')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.opening).toEqual({ status: 'read', amount: 430106.7, asAt: '2026-06-30' })
    expect(body.v1_refusal).toContain('more than one Xero organisation')
  })

  it('null for a business the v1 cashflow may be built on', async () => {
    loadMock.mockResolvedValue({ opening: { status: 'read', amount: 167629.81, asAt: '2026-06-30' }, v1Refusal: null })
    const body = await (await call('business_id=28d41193-38ae-4071-a2b1-0dbea90a38fd&report_month=2026-08')).json()
    expect(body.v1_refusal).toBeNull()
  })

  it('a load that throws is a 500, which the page reads as could-not-check', async () => {
    loadMock.mockRejectedValue(new Error('timeout'))
    expect((await call('business_id=x&report_month=2026-08')).status).toBe(500)
  })
})
