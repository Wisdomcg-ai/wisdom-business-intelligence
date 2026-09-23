/**
 * GET /api/Xero/budgets — the five-state availability answer the forecast
 * empty state renders. The fail-open rule under test: "could not check" is a
 * distinct state, never collapsed into "no budget".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
// Two distinguishable clients, so a test can say WHICH one a callee received.
// AUTH_CLIENT is the caller's RLS-bound session; ADMIN_CLIENT is service-role.
const AUTH_CLIENT = { __client: 'auth' as const, auth: { getUser: vi.fn() }, from: vi.fn() }
const ADMIN_CLIENT = { __client: 'admin' as const, from: vi.fn() }
const getUserMock = AUTH_CLIENT.auth.getUser
vi.mock('@/lib/supabase/server', () => ({ createRouteHandlerClient: vi.fn(async () => AUTH_CLIENT) }))
vi.mock('@/lib/supabase/admin', () => ({ createServiceRoleClient: vi.fn(() => ADMIN_CLIENT) }))
const verifyAccessMock = vi.fn()
vi.mock('@/lib/utils/verify-business-access', () => ({ verifyBusinessAccess: (...a: unknown[]) => verifyAccessMock(...a) }))
const sectionPermissionMock = vi.fn(async () => ({ allowed: true }))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({ requireSectionPermission: (...a: unknown[]) => sectionPermissionMock(...(a as [])) }))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({ enforceSectionPermission: vi.fn(() => null) }))
const resolveConnectionsMock = vi.fn()
vi.mock('@/lib/business/resolveXeroBusinessId', () => ({ resolveXeroConnections: (...a: unknown[]) => resolveConnectionsMock(...a) }))
const tokenMock = vi.fn()
vi.mock('@/lib/xero/token-manager', () => ({ getValidAccessToken: (...a: unknown[]) => tokenMock(...a) }))
const listMock = vi.fn()
const getMock = vi.fn()
vi.mock('@/lib/xero/budgets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/xero/budgets')>()
  return { ...actual, listXeroBudgets: (...a: unknown[]) => listMock(...a), getXeroBudget: (...a: unknown[]) => getMock(...a) }
})

import { GET } from '../route'
import { combineOrgStates } from '@/lib/xero/budget-availability'
import { BudgetsScopeMissingError } from '@/lib/xero/budgets'

const req = (qs = 'business_id=biz-1&fiscal_year=2027') => new NextRequest(`http://localhost/api/Xero/budgets?${qs}`)
const conn = (tenantId: string, name = tenantId) => ({ id: `c-${tenantId}`, tenant_id: tenantId, tenant_name: name, display_name: null, functional_currency: 'AUD' })

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  verifyAccessMock.mockReset().mockResolvedValue(true)
  sectionPermissionMock.mockClear()
  resolveConnectionsMock.mockReset()
  tokenMock.mockReset().mockResolvedValue({ success: true, accessToken: 'tok' })
  listMock.mockReset()
  getMock.mockReset()
})

describe('combineOrgStates', () => {
  it('follows the precedence available > scope_missing > error > none, and not_connected when empty', () => {
    expect(combineOrgStates([])).toBe('not_connected')
    expect(combineOrgStates([{ state: 'none' }, { state: 'available' }])).toBe('available')
    expect(combineOrgStates([{ state: 'none' }, { state: 'scope_missing' }, { state: 'error' }])).toBe('scope_missing')
    expect(combineOrgStates([{ state: 'none' }, { state: 'error' }])).toBe('error')
    expect(combineOrgStates([{ state: 'none' }, { state: 'none' }])).toBe('none')
  })
})

describe('GET /api/Xero/budgets', () => {
  it('401 without a user, 400 without params, 403 without access', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null })
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('fiscal_year=2027'))).status).toBe(400)
    expect((await GET(req('business_id=biz-1'))).status).toBe(400)
    verifyAccessMock.mockResolvedValueOnce(false)
    expect((await GET(req())).status).toBe(403)
  })

  it('not_connected when the business has no active Xero connection', async () => {
    resolveConnectionsMock.mockResolvedValue({ connectionBusinessId: 'biz-1', connections: [] })
    const body = await (await GET(req())).json()
    expect(body).toEqual({ state: 'not_connected', fiscalYear: 2027, orgs: [] })
  })

  it('available: lists each org\'s budgets with FY coverage; a scope-missing sibling org is reported, not hidden', async () => {
    resolveConnectionsMock.mockResolvedValue({ connectionBusinessId: 'biz-1', connections: [conn('t-au', 'Acme AU'), conn('t-hk', 'Acme HK')] })
    listMock.mockImplementation(async (auth: { tenantId: string }) => {
      if (auth.tenantId === 't-hk') throw new BudgetsScopeMissingError('t-hk')
      return [{ budgetId: 'b-1', name: 'FY27 Budget', type: 'OVERALL', updatedAt: '2026-08-01T00:00:00.000Z', tracking: [] }]
    })
    getMock.mockResolvedValue({
      budgetId: 'b-1', name: 'FY27 Budget', type: 'OVERALL', updatedAt: null, tracking: [],
      lines: [{ accountId: 'a', accountCode: '200', months: { '2026-07': 1, '2026-08': 1, '2027-06': 1, '2027-09': 1 } }],
    })
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.state).toBe('available')
    expect(body.orgs).toHaveLength(2)
    expect(body.orgs[0]).toMatchObject({ tenantId: 't-au', orgName: 'Acme AU', state: 'available' })
    expect(body.orgs[0].budgets[0]).toMatchObject({ budgetId: 'b-1', name: 'FY27 Budget', lineCount: 1, coverage: { firstPeriod: '2026-07', lastPeriod: '2027-09', monthsInFY: 3 } })
    expect(body.orgs[1]).toMatchObject({ tenantId: 't-hk', state: 'scope_missing', budgets: [] })
    // The detail fetch asked for a three-year window starting at the FY.
    expect(getMock.mock.calls[0][2]).toEqual({ from: '2026-07', to: '2029-06' })
  })

  it('a budget with no cell in this FY is not offered, and an org with only such budgets is none', async () => {
    // Urban Road, 7 Sep 2026: the FY28 check returned `available` on a
    // FY27-only "Overall Budget" and an empty "400k Budget" tracking budget.
    resolveConnectionsMock.mockResolvedValue({ connectionBusinessId: 'biz-1', connections: [conn('t-1')] })
    listMock.mockResolvedValue([
      { budgetId: 'b-overall', name: 'Overall Budget', type: 'OVERALL', updatedAt: null, tracking: [] },
      { budgetId: 'b-empty', name: '400k Budget', type: 'TRACKING', updatedAt: null, tracking: [] },
      { budgetId: 'b-in-fy', name: 'FY28 Budget', type: 'OVERALL', updatedAt: null, tracking: [] },
    ])
    getMock.mockImplementation(async (_auth: unknown, budgetId: string) => {
      if (budgetId === 'b-overall') return { budgetId, name: 'Overall Budget', type: 'OVERALL', updatedAt: null, tracking: [], lines: [{ accountId: 'a', accountCode: '200', months: { '2026-07': 1 } }] } // prior FY only
      if (budgetId === 'b-empty') return { budgetId, name: '400k Budget', type: 'TRACKING', updatedAt: null, tracking: [], lines: [] }
      return { budgetId, name: 'FY28 Budget', type: 'OVERALL', updatedAt: null, tracking: [], lines: [{ accountId: 'a', accountCode: '200', months: { '2027-07': 5, '2027-08': 5 } }] }
    })
    const body = await (await GET(req('business_id=biz-1&fiscal_year=2028'))).json()
    expect(body.state).toBe('available')
    expect(body.orgs[0].budgets.map((b: { budgetId: string }) => b.budgetId)).toEqual(['b-in-fy'])
    expect(body.orgs[0].budgets[0].coverage.monthsInFY).toBe(2)

    // Only out-of-FY / empty budgets → none, not available.
    listMock.mockResolvedValue([{ budgetId: 'b-overall', name: 'Overall Budget', type: 'OVERALL', updatedAt: null, tracking: [] }])
    const none = await (await GET(req('business_id=biz-1&fiscal_year=2028'))).json()
    expect(none.state).toBe('none')
    expect(none.orgs[0]).toMatchObject({ state: 'none', budgets: [] })
  })

  it('scope_missing when no org has granted the scope (never "none")', async () => {
    resolveConnectionsMock.mockResolvedValue({ connectionBusinessId: 'biz-1', connections: [conn('t-1')] })
    listMock.mockRejectedValue(new BudgetsScopeMissingError('t-1'))
    const body = await (await GET(req())).json()
    expect(body.state).toBe('scope_missing')
  })

  it('none when every org answered with no budgets', async () => {
    resolveConnectionsMock.mockResolvedValue({ connectionBusinessId: 'biz-1', connections: [conn('t-1')] })
    listMock.mockResolvedValue([])
    const body = await (await GET(req())).json()
    expect(body.state).toBe('none')
    expect(body.orgs[0].state).toBe('none')
  })

  it('error (not none) when an org could not be checked — token failure or Xero error', async () => {
    resolveConnectionsMock.mockResolvedValue({ connectionBusinessId: 'biz-1', connections: [conn('t-1'), conn('t-2')] })
    tokenMock.mockImplementation(async (c: { tenant_id: string }) =>
      c.tenant_id === 't-1' ? { success: false, shouldDeactivate: true } : { success: true, accessToken: 'tok' })
    listMock.mockRejectedValue(new Error('Xero 500'))
    const body = await (await GET(req())).json()
    expect(body.state).toBe('error')
    expect(body.orgs[0]).toMatchObject({ state: 'error', error: 'requires_reconnect' })
    expect(body.orgs[1]).toMatchObject({ state: 'error', error: 'xero_error' })
  })

  it('refreshes the token on the SERVICE-ROLE client, never the caller\'s session', async () => {
    // getValidAccessToken is a WRITER: it takes the refresh lock and persists
    // Xero's rotated refresh token, both UPDATEs on xero_connections. Its
    // `rls_access` WITH CHECK is auth_can_manage_business(), which admits only
    // role IN ('admin','member') — while this route's own gate
    // (verifyBusinessAccess) admits ANY active membership, and the policy's
    // USING clause lets those same callers READ the row. Hand the token manager
    // the caller's session and a co-owner/viewer silently fails to take the
    // lock, then rotates the token at Xero and cannot save it: a dead refresh
    // token on a live connection. Pin the client, not just the behaviour.
    resolveConnectionsMock.mockResolvedValue({ connectionBusinessId: 'biz-1', connections: [conn('t-1'), conn('t-2')] })
    listMock.mockResolvedValue([])

    expect((await GET(req())).status).toBe(200)

    expect(tokenMock).toHaveBeenCalledTimes(2)
    for (const call of tokenMock.mock.calls) {
      expect(call[1]).toBe(ADMIN_CLIENT)
      expect(call[1]).not.toBe(AUTH_CLIENT)
    }
    // Connection resolution is the same write-path row, so it takes the same client.
    expect(resolveConnectionsMock).toHaveBeenCalledWith(ADMIN_CLIENT, 'biz-1')
    // ...and the permission check keeps the auth-bound session: a service-role
    // client there would answer for the SERVICE, not the user.
    expect(sectionPermissionMock).toHaveBeenCalledWith(AUTH_CLIENT, 'user-1', 'biz-1', 'finances')
  })
})
