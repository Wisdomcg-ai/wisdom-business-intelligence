/**
 * Dashboard-capture route contract: the coach/admin role gate on both verbs,
 * self-enforced validation (withSchema is observe-mode), and the tenant-
 * ownership check — a badge for an org that isn't an active connection of the
 * business is refused.
 *
 * The gate is the point of PR #545 F4/D2: these captures drive the /cfo
 * board's READY/BLOCKED verdict, and the route used to authorize with
 * verifyBusinessAccess alone — which admits any ACTIVE business_users member
 * of the client business. A client team member could post a 0 count and flip
 * their own board green. The pins below are that regression, from both ends:
 * a team member is refused with nothing written, and the two principals who
 * really do run the round (the assigned coach, and super_admin — who is how
 * the unattended recon round posts) still get through.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockAdminFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: () => 'test-secret-key' }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: (...args: any[]) => mockAdminFrom(...args) })),
}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import { GET, POST } from '@/app/api/cfo/reconciliation/dashboard-capture/route'

const BIZ = 'biz-1'
/** business_profiles.id for BIZ — the other id-space a caller may send. */
const PROFILE = 'profile-1'
const USER = 'user-1'
const OTHER_COACH = 'coach-2'

const postReq = (body: any) =>
  new NextRequest('http://test.local/api/cfo/reconciliation/dashboard-capture', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  })
const getReq = (qs: string) => new NextRequest(`http://test.local/api/cfo/reconciliation/dashboard-capture?${qs}`)

function chain(result: { data: any; error: any }) {
  const q: any = { calls: {} }
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'insert']) {
    q[m] = vi.fn((...a: any[]) => { q.calls[m] = a; return q })
  }
  q.maybeSingle = vi.fn(async () => result)
  q.then = (resolve: any) => resolve(result)
  return q
}

/**
 * business_profiles serves the dual-ID resolver, which probes the SAME table
 * on two different columns — so this chain answers by the column filtered on
 * rather than returning one fixed row.
 */
function profileChain(rows: { id: string; business_id: string }[]) {
  const q: any = { calls: {}, _eq: null as null | [string, string] }
  q.select = vi.fn(() => q)
  q.eq = vi.fn((col: string, val: string) => { q._eq = [col, val]; q.calls.eq = [col, val]; return q })
  q.in = vi.fn(() => q)
  q.limit = vi.fn(() => q)
  const match = () => {
    const [col, val] = q._eq ?? []
    return rows.filter(r => (col === 'business_id' ? r.business_id === val : r.id === val))
  }
  q.maybeSingle = vi.fn(async () => {
    const m = match()
    return { data: m.length === 1 ? m[0] : null, error: null }
  })
  q.then = (resolve: any) => resolve({ data: match(), error: null })
  return q
}

type World = {
  /** system_roles.role for the caller; null = no row (a plain client user). */
  role?: string | null
  /** businesses.assigned_coach_id; undefined = no businesses row at all. */
  assignedCoach?: string | null
  profiles?: { id: string; business_id: string }[]
  tenants?: string[]
  captures?: any[]
}

/** Records every table the route touched, so "nothing was written" is checkable. */
let touched: string[] = []
let insertChain: any

function world(w: World = {}) {
  const { role = 'super_admin', assignedCoach, profiles = [], tenants = ['t1'], captures = [] } = w
  insertChain = chain({ data: [{ id: 'c1', tenant_id: 't1', total_count: 25, captured_at: 'now' }], error: null })
  const capturesChain = chain({ data: captures, error: null })
  const businessesChain = chain({ data: assignedCoach === undefined ? null : { assigned_coach_id: assignedCoach }, error: null })
  const chains: Record<string, any> = {
    system_roles: chain({ data: role === null ? null : { role }, error: null }),
    businesses: businessesChain,
    business_profiles: profileChain(profiles),
    xero_connections: chain({ data: tenants.map(t => ({ tenant_id: t, id: t })), error: null }),
    monthly_report_settings: chain({ data: null, error: null }),
    reconciliation_dashboard_captures: captures.length > 0 ? capturesChain : insertChain,
  }
  mockAdminFrom.mockImplementation((table: string) => {
    touched.push(table)
    const c = chains[table]
    if (!c) throw new Error(`unexpected ${table}`)
    return c
  })
  return { businessesChain, capturesChain }
}

const wroteCaptures = () => touched.includes('reconciliation_dashboard_captures')
const capture = (over: any = {}) => ({ tenant_id: 't1', total_count: 25, method: 'chrome_routine', ...over })

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local'
  touched = []
  mockGetUser.mockReset(); mockAdminFrom.mockReset()
  mockGetUser.mockResolvedValue({ data: { user: { id: USER } }, error: null })
  mockAdminFrom.mockImplementation(() => { throw new Error('no query expected') })
})

describe('POST role gate', () => {
  it('unauthenticated → 401, nothing written', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    world()
    const res = await POST(postReq({ business_id: BIZ, captures: [capture()] }))
    expect(res.status).toBe(401)
    expect(wroteCaptures()).toBe(false)
  })

  it('a client team member with no coach/admin role → 403, nothing written', async () => {
    // The F4 regression: this caller passes verifyBusinessAccess (active
    // business_users member) and must still be refused.
    world({ role: null })
    const res = await POST(postReq({ business_id: BIZ, captures: [capture({ total_count: 0 })] }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Access denied' })
    expect(wroteCaptures()).toBe(false)
  })

  it('a coach who is not this client’s assigned coach → 403, nothing written', async () => {
    world({ role: 'coach', assignedCoach: OTHER_COACH })
    const res = await POST(postReq({ business_id: BIZ, captures: [capture()] }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toContain('not your assigned client')
    expect(wroteCaptures()).toBe(false)
  })

  it('a coach whose client has no businesses row → 403, nothing written', async () => {
    world({ role: 'coach', assignedCoach: undefined })
    const res = await POST(postReq({ business_id: BIZ, captures: [capture()] }))
    expect(res.status).toBe(403)
    expect(wroteCaptures()).toBe(false)
  })

  it('the assigned coach is allowed and the capture is written', async () => {
    world({ role: 'coach', assignedCoach: USER })
    const res = await POST(postReq({ business_id: BIZ, captures: [capture()] }))
    expect(res.status).toBe(200)
    expect(insertChain.insert).toHaveBeenCalledWith([
      expect.objectContaining({ tenant_id: 't1', business_id: BIZ, captured_by: USER }),
    ])
  })

  it('super_admin is allowed without being the assigned coach — this is how the recon round posts', async () => {
    // Matt is assigned coach of 1 of the 12 businesses he captures for, so
    // this branch is load-bearing, not a convenience.
    world({ role: 'super_admin', assignedCoach: OTHER_COACH })
    const res = await POST(postReq({ business_id: BIZ, captures: [capture()] }))
    expect(res.status).toBe(200)
    expect(touched).not.toContain('businesses') // no ownership check for super_admin
  })

  it('a coach posting the business_profiles-space id is checked against the canonical businesses.id', async () => {
    const { businessesChain } = world({
      role: 'coach', assignedCoach: USER, profiles: [{ id: PROFILE, business_id: BIZ }],
    })
    const res = await POST(postReq({ business_id: PROFILE, captures: [capture()] }))
    expect(res.status).toBe(200)
    expect(businessesChain.calls.eq).toEqual(['id', BIZ])
  })
})

describe('GET role gate', () => {
  it('unauthenticated → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    expect((await GET(getReq(`business_id=${BIZ}`))).status).toBe(401)
  })

  it('a client team member with no coach/admin role → 403, no captures read', async () => {
    world({ role: null })
    const res = await GET(getReq(`business_id=${BIZ}`))
    expect(res.status).toBe(403)
    expect(wroteCaptures()).toBe(false)
  })

  it('a coach who is not this client’s assigned coach → 403', async () => {
    world({ role: 'coach', assignedCoach: OTHER_COACH })
    expect((await GET(getReq(`business_id=${BIZ}`))).status).toBe(403)
    expect(wroteCaptures()).toBe(false)
  })
})

describe('self-enforced contract', () => {
  it('empty captures → 400 before auth', async () => {
    const res = await POST(postReq({ business_id: BIZ, captures: [] }))
    expect(res.status).toBe(400)
    expect(mockGetUser).not.toHaveBeenCalled()
  })
  it('a non-footing capture is refused by name', async () => {
    const res = await POST(postReq({ business_id: BIZ, captures: [{ tenant_id: 't1', total_count: 5, accounts: [{ name: 'A', count: 1 }] }] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('accounts sum to 1')
  })
})

describe('tenant ownership + write', () => {
  it("a tenant that isn't an active connection of the business is refused", async () => {
    world()
    const res = await POST(postReq({ business_id: BIZ, captures: [capture({ tenant_id: 'someone-elses', total_count: 3 })] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('someone-elses')
    expect(wroteCaptures()).toBe(false)
  })

  it('valid captures are inserted append-only with the operator and method', async () => {
    world()
    const res = await POST(postReq({
      business_id: BIZ,
      captures: [capture({ accounts: [{ name: 'Airwallex', count: 25 }] })],
    }))
    expect(res.status).toBe(200)
    expect(insertChain.insert).toHaveBeenCalledWith([
      expect.objectContaining({ tenant_id: 't1', business_id: BIZ, total_count: 25, method: 'chrome_routine', captured_by: USER }),
    ])
  })

  it('GET returns the latest-per-tenant rollup', async () => {
    world({
      tenants: ['t1', 't2'],
      captures: [
        { tenant_id: 't1', business_id: BIZ, captured_at: '2026-09-02T02:00:00Z', total_count: 25, accounts: [], method: 'chrome_routine' },
        { tenant_id: 't1', business_id: BIZ, captured_at: '2026-09-01T02:00:00Z', total_count: 30, accounts: [], method: 'chrome_routine' },
      ],
    })
    const res = await GET(getReq(`business_id=${BIZ}`))
    const body = await res.json()
    expect(body.summary.total_count).toBe(25)
    expect(body.summary.captured_tenants).toBe(1)
    expect(body.summary.tenant_count).toBe(2)
  })
})
