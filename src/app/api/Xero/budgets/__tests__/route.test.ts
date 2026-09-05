/**
 * GET /api/Xero/budgets — the five-state availability answer the forecast
 * empty state renders. The fail-open rule under test: "could not check" is a
 * distinct state, never collapsed into "no budget".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
const getUserMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({ auth: { getUser: getUserMock }, from: vi.fn() })),
}))
const verifyAccessMock = vi.fn()
vi.mock('@/lib/utils/verify-business-access', () => ({ verifyBusinessAccess: (...a: unknown[]) => verifyAccessMock(...a) }))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({ requireSectionPermission: vi.fn(async () => ({ allowed: true })) }))
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

import { GET, combineOrgStates } from '../route'
import { BudgetsScopeMissingError } from '@/lib/xero/budgets'

const req = (qs = 'business_id=biz-1&fiscal_year=2027') => new NextRequest(`http://localhost/api/Xero/budgets?${qs}`)
const conn = (tenantId: string, name = tenantId) => ({ id: `c-${tenantId}`, tenant_id: tenantId, tenant_name: name, display_name: null, functional_currency: 'AUD' })

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  verifyAccessMock.mockReset().mockResolvedValue(true)
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
})
