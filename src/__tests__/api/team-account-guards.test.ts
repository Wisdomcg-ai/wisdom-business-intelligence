/**
 * S1 (22 Sep 2026 system diagnostic) — a client owner could delete ANY account.
 *
 * /api/team/invite added any existing account (found by email) to the caller's
 * team as an active member; /api/team/remove-member with deleteCompletely then
 * deleted that account's role, users row and auth login because it had no
 * other business_users rows — true of every coach and super_admin.
 *
 * These tests drive the real routes and assert the dangerous calls are never
 * made: no delete, no auth DELETE, no team insert — not merely a 4xx status.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('@/lib/security/csrf', () => ({ csrfProtection: vi.fn().mockResolvedValue({ valid: true }) }))
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: () => 'test-secret' }))
const sendEmailMock = vi.fn().mockResolvedValue({ success: true })
vi.mock('@/lib/email/resend', () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...a) }))

const routeHandlerClientMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: (...a: unknown[]) => routeHandlerClientMock(...a),
}))
const serviceRoleClientMock = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: (...a: unknown[]) => serviceRoleClientMock(...a),
}))

import { POST as REMOVE_POST } from '@/app/api/team/remove-member/route'
import { POST as INVITE_POST } from '@/app/api/team/invite/route'

type Result = { data: unknown; error: unknown }
type Op = { table: string; op: string; args: unknown[] }

/** A fake Supabase client: each from(table) takes the next queued result for that table and logs every write. */
function fakeClient(queues: Record<string, Result[]>) {
  const ops: Op[] = []
  const idx: Record<string, number> = {}
  const from = vi.fn((table: string) => {
    const i = idx[table] ?? 0
    idx[table] = i + 1
    const result = queues[table]?.[i] ?? { data: null, error: null }
    const b: Record<string, unknown> = {}
    const chain = (name: string, record = false) => (...args: unknown[]) => {
      if (record) ops.push({ table, op: name, args })
      return b
    }
    for (const m of ['select', 'eq', 'neq', 'or', 'limit', 'order', 'in']) b[m] = chain(m)
    for (const m of ['delete', 'insert', 'upsert', 'update']) b[m] = chain(m, true)
    b.single = () => Promise.resolve(result)
    b.maybeSingle = () => Promise.resolve(result)
    b.then = (onF: (v: Result) => unknown, onR?: (e: unknown) => unknown) => Promise.resolve(result).then(onF, onR)
    return b
  })
  return { client: { from }, ops }
}

const jsonReq = (body: unknown) =>
  new Request('http://test/local', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

const fetchMock = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  sendEmailMock.mockResolvedValue({ success: true })
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

const OWNER = 'owner-of-A'
const authed = (id = OWNER) => ({
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id, email: 'owner@a.test', user_metadata: {} } }, error: null }) },
})

/** Queues for remove-member up to (and including) the guard's lookups. */
function removeQueues(target: {
  role: string | null
  ownsOrCoaches?: boolean
  otherTeams?: boolean
  roleLookupError?: boolean
}) {
  return {
    system_roles: [
      { data: { role: 'client' }, error: null },                                   // caller: not super_admin
      target.roleLookupError
        ? { data: null, error: { message: 'boom' } }
        : { data: target.role ? { role: target.role } : null, error: null },       // guard: target role
      { data: null, error: null },                                                  // delete path
    ],
    businesses: [
      { data: { id: 'biz-A', owner_id: OWNER, assigned_coach_id: null }, error: null }, // caller owns biz-A
      { data: target.ownsOrCoaches ? [{ id: 'biz-Z' }] : [], error: null },              // guard: owns/coaches?
    ],
    business_users: [
      { data: null, error: null },                                  // caller membership check
      { data: { user_id: 'target-user' }, error: null },            // member lookup (in biz-A)
      { data: target.otherTeams ? [{ id: 'm-2' }] : [], error: null }, // guard: other teams?
      { data: null, error: null },                                  // removal
    ],
    users: [{ data: { email: 'target@x.test' }, error: null }],
  }
}

const removeBody = { memberId: 'm-1', businessId: 'biz-A', deleteCompletely: true }
const destructive = (ops: Op[]) => ops.filter((o) => o.op === 'delete')
const authDeletes = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')

describe('S1 — remove-member "delete completely" never reaches a privileged account', () => {
  for (const role of ['super_admin', 'coach']) {
    it(`refuses a ${role} target with 403 and changes nothing`, async () => {
      routeHandlerClientMock.mockResolvedValue(authed())
      const { client, ops } = fakeClient(removeQueues({ role }))
      serviceRoleClientMock.mockReturnValue(client)

      const res = await REMOVE_POST(jsonReq(removeBody))
      expect(res.status).toBe(403)
      expect(destructive(ops)).toEqual([])      // not even the team row
      expect(authDeletes()).toHaveLength(0)     // login untouched
    })
  }

  it('refuses a client who owns or coaches a business, and changes nothing', async () => {
    routeHandlerClientMock.mockResolvedValue(authed())
    const { client, ops } = fakeClient(removeQueues({ role: 'client', ownsOrCoaches: true }))
    serviceRoleClientMock.mockReturnValue(client)

    const res = await REMOVE_POST(jsonReq(removeBody))
    expect(res.status).toBe(403)
    expect(destructive(ops)).toEqual([])
    expect(authDeletes()).toHaveLength(0)
  })

  it('fails closed when the guard cannot read the role: 500 and nothing changed', async () => {
    routeHandlerClientMock.mockResolvedValue(authed())
    const { client, ops } = fakeClient(removeQueues({ role: null, roleLookupError: true }))
    serviceRoleClientMock.mockReturnValue(client)

    const res = await REMOVE_POST(jsonReq(removeBody))
    expect(res.status).toBe(500)
    expect(destructive(ops)).toEqual([])
    expect(authDeletes()).toHaveLength(0)
  })

  it('a member of another team is removed from THIS team only — account kept', async () => {
    routeHandlerClientMock.mockResolvedValue(authed())
    const { client, ops } = fakeClient(removeQueues({ role: 'client', otherTeams: true }))
    serviceRoleClientMock.mockReturnValue(client)

    const res = await REMOVE_POST(jsonReq(removeBody))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.deletedCompletely).toBe(false)
    expect(destructive(ops).map((o) => o.table)).toEqual(['business_users'])
    expect(authDeletes()).toHaveLength(0)
  })

  it('a plain client on this team only is still deleted completely', async () => {
    routeHandlerClientMock.mockResolvedValue(authed())
    const { client, ops } = fakeClient(removeQueues({ role: 'client' }))
    serviceRoleClientMock.mockReturnValue(client)

    const res = await REMOVE_POST(jsonReq(removeBody))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.deletedCompletely).toBe(true)
    expect(destructive(ops).map((o) => o.table).sort()).toEqual(['business_users', 'system_roles', 'team_invites', 'users'])
    expect(authDeletes()).toHaveLength(1)
    expect(String(authDeletes()[0][0])).toContain('/auth/v1/admin/users/target-user')
  })

  it('an account with no system_roles row counts as a client (deletable)', async () => {
    routeHandlerClientMock.mockResolvedValue(authed())
    const { client } = fakeClient(removeQueues({ role: null }))
    serviceRoleClientMock.mockReturnValue(client)

    const res = await REMOVE_POST(jsonReq(removeBody))
    expect(res.status).toBe(200)
    expect(authDeletes()).toHaveLength(1)
  })

  it('reports an incomplete deletion instead of success when the auth delete fails', async () => {
    routeHandlerClientMock.mockResolvedValue(authed())
    const { client } = fakeClient(removeQueues({ role: 'client' }))
    serviceRoleClientMock.mockReturnValue(client)
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    const res = await REMOVE_POST(jsonReq(removeBody))
    const body = await res.json()
    expect(res.status).toBe(500)
    expect(body.deletedCompletely).toBe(false)
  })
})

/** Invite an email that already has an account; the route finds it in public.users. */
function inviteSetup(opts: { callerRole: string; targetRole: string | null }) {
  routeHandlerClientMock.mockResolvedValue({
    ...authed(),
    from: fakeClient({
      business_users: [{ data: null, error: null }],                                  // caller membership (RLS client)
      users: [{ data: { id: 'existing-user', email: 'coach@wisdom.test' }, error: null }], // existing account found
    }).client.from,
  })
  const admin = fakeClient({
    system_roles: [
      { data: { role: opts.callerRole }, error: null },                               // caller
      { data: opts.targetRole ? { role: opts.targetRole } : null, error: null },      // target
    ],
    businesses: [{ data: { id: 'biz-A', business_name: 'Biz A', owner_id: OWNER, assigned_coach_id: null }, error: null }],
    business_users: [
      { data: null, error: null },  // already a member? no
      { data: null, error: null },  // insert
    ],
  })
  serviceRoleClientMock.mockReturnValue(admin.client)
  return admin
}

const inviteBody = { businessId: 'biz-A', firstName: 'X', email: 'coach@wisdom.test', role: 'viewer' }

describe('S1 — invite cannot pull a coach or super_admin account onto a team', () => {
  for (const targetRole of ['super_admin', 'coach']) {
    it(`an owner inviting a ${targetRole} email gets 403 — no team row, no profile rewrite`, async () => {
      const admin = inviteSetup({ callerRole: 'client', targetRole })
      const res = await INVITE_POST(jsonReq(inviteBody))
      expect(res.status).toBe(403)
      expect(admin.ops.filter((o) => o.op === 'insert' || o.op === 'upsert')).toEqual([])
      expect(sendEmailMock).not.toHaveBeenCalled()
    })
  }

  it('a super_admin may still add a coach account', async () => {
    const admin = inviteSetup({ callerRole: 'super_admin', targetRole: 'coach' })
    const res = await INVITE_POST(jsonReq(inviteBody))
    expect(res.status).toBe(200)
    expect(admin.ops.some((o) => o.table === 'business_users' && o.op === 'insert')).toBe(true)
  })

  it('adding an existing client never overwrites their profile (insert-if-missing)', async () => {
    const admin = inviteSetup({ callerRole: 'client', targetRole: 'client' })
    const res = await INVITE_POST(jsonReq({ ...inviteBody, firstName: 'Renamed' }))
    expect(res.status).toBe(200)
    const upsert = admin.ops.find((o) => o.table === 'users' && o.op === 'upsert')
    expect(upsert).toBeDefined()
    expect(upsert!.args[1]).toMatchObject({ onConflict: 'id', ignoreDuplicates: true })
  })

  it('escapes names in the invite email', async () => {
    inviteSetup({ callerRole: 'client', targetRole: 'client' })
    await INVITE_POST(jsonReq({ ...inviteBody, firstName: '<img src=x onerror=alert(1)>' }))
    const html = (sendEmailMock.mock.calls[0][0] as { html: string }).html
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})
