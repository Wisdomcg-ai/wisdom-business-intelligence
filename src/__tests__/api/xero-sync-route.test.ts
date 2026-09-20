/**
 * POST /api/Xero/sync — the KPI dashboard's "Sync Xero" button — through the
 * exported handler, wrapper and all.
 *
 * The route used to run its own single-org "sync": connections[0] only, a
 * financial_metrics write the dashboard never charts, zeros on a failed fetch,
 * and an unconditional last_synced_at = now that made a 403ing org read fresh
 * on every connection-health surface for 48h. It is now a shim over
 * syncBusinessXeroPL, and these tests pin what that shim must never get wrong:
 * it writes nothing of its own, and it only says "synced" when every org of the
 * business synced — including the orgs the sync could not reach.
 * (xero-sync-route-every-org.test.ts drives the real orchestrator.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { SyncResult, SyncOptions, TenantSyncOutcome } from '@/lib/xero/sync-orchestrator'
import type { XeroConnectionStatusRow } from '@/lib/xero/connection-status'

const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

// Dragon Roofing's shape: one business, two Xero orgs. The dashboard posts the
// business_profiles.id; team membership is keyed on the businesses.id.
const PROFILE_ID = 'aabd3c49-4dc8-4aa6-a9a6-75f62ab89ff5'
const BUSINESS_ID = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
const DRAGON = { tenant_id: 't-dragon', tenant_name: 'Dragon Roofing Pty Ltd' }
const EHC = { tenant_id: 't-ehc', tenant_name: 'Easy Hail Claim' }

function connection(over: Partial<XeroConnectionStatusRow> & { tenant_id: string; tenant_name: string }): XeroConnectionStatusRow {
  return {
    id: `conn-${over.tenant_id}`,
    business_id: BUSINESS_ID,
    include_in_consolidation: true,
    is_active: true,
    last_synced_at: '2026-09-15T04:04:14.882Z',
    updated_at: '2026-09-15T04:04:14.882Z',
    expires_at: '2026-09-15T04:34:00.000Z',
    created_at: '2026-03-01T00:00:00.000Z',
    ...over,
  }
}

type Scripted = {
  ids?: { businessId: string; profileId: string; all: string[] }
  rows?: XeroConnectionStatusRow[]
  rowsError?: { message: string } | null
  result?: SyncResult
  tenants?: TenantSyncOutcome[]
  throws?: Error
}
let scripted: Scripted = {}

// The only database handle the route holds. Reads of xero_connections answer
// from the script; any write — or any other table — is recorded and refused, so
// "the route writes nothing itself" is checked rather than assumed.
const writes: string[] = []
const reads: Array<{ table: string; column: string; values: unknown }> = []
function adminStub() {
  const refuse = (what: string) => () => {
    writes.push(what)
    throw new Error(`route must not ${what}`)
  }
  return {
    from: (table: string) => {
      if (table !== 'xero_connections') return { select: refuse(`read ${table}`), update: refuse(`update ${table}`) }
      return {
        select: () => ({
          in: async (column: string, values: unknown) => {
            reads.push({ table, column, values })
            return { data: scripted.rowsError ? null : scripted.rows ?? [], error: scripted.rowsError ?? null }
          },
        }),
        update: refuse('update xero_connections'),
        insert: refuse('insert xero_connections'),
        upsert: refuse('upsert xero_connections'),
        delete: refuse('delete xero_connections'),
      }
    },
    rpc: refuse('call an rpc'),
  }
}
vi.mock('@/lib/supabase/admin', () => ({ createServiceRoleClient: vi.fn(() => adminStub()) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => adminStub()) }))

let authedUser: { id: string } | null = { id: 'coach-1' }
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: authedUser }, error: null })) },
  })),
}))

const resolveBusinessProfileIds = vi.fn(async (..._args: unknown[]) => scripted.ids!)
vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: (...args: unknown[]) => resolveBusinessProfileIds(...args),
}))

const verifyBusinessAccess = vi.fn(async (..._args: unknown[]) => true)
vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: (...args: unknown[]) => verifyBusinessAccess(...args),
}))

const syncBusinessXeroPL = vi.fn(async (_businessId: string, opts: SyncOptions = {}) => {
  for (const t of scripted.tenants ?? []) opts.onTenantOutcome?.(t)
  if (scripted.throws) throw scripted.throws
  return scripted.result!
})
vi.mock('@/lib/xero/sync-orchestrator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/xero/sync-orchestrator')>()),
  syncBusinessXeroPL: (businessId: string, opts?: SyncOptions) => syncBusinessXeroPL(businessId, opts),
}))

import { SYNC_IN_FLIGHT, SYNC_NO_CONNECTIONS } from '@/lib/xero/sync-orchestrator'

function syncResult(status: SyncResult['status'], error?: string): SyncResult {
  return {
    business_id: PROFILE_ID,
    status,
    sync_job_id: 'job-1',
    rows_inserted: 42,
    rows_updated: 0,
    xero_request_count: 68,
    coverage: { months_covered: 15, first_period: '2025-07-01', last_period: '2026-09-01', expected_months: 15 },
    reconciliation: { status: 'ok', discrepancy_count: 0 },
    ...(error ? { error } : {}),
  }
}

function post(body: unknown) {
  return new NextRequest('http://localhost/api/Xero/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function callPost(body: unknown = { business_id: PROFILE_ID }) {
  const { POST } = await import('@/app/api/Xero/sync/route')
  // Next calls a route handler with (request, context).
  const res = await (POST as (req: Request, ctx: unknown) => Promise<Response>)(post(body), { params: {} })
  return { status: res.status, json: await res.json() }
}

beforeEach(() => {
  authedUser = { id: 'coach-1' }
  scripted = {
    ids: { businessId: BUSINESS_ID, profileId: PROFILE_ID, all: [PROFILE_ID, BUSINESS_ID] },
    rows: [connection(DRAGON), connection(EHC)],
  }
  writes.length = 0
  reads.length = 0
  syncBusinessXeroPL.mockClear()
  resolveBusinessProfileIds.mockClear()
  verifyBusinessAccess.mockReset()
  verifyBusinessAccess.mockResolvedValue(true)
  captureException.mockClear()
})

describe('POST /api/Xero/sync — refuses before any sync', () => {
  it('401 without a session', async () => {
    authedUser = null
    expect((await callPost()).status).toBe(401)
    expect(syncBusinessXeroPL).not.toHaveBeenCalled()
  })

  it('400 without a business_id, and for a body that is not JSON', async () => {
    expect((await callPost({})).status).toBe(400)
    expect((await callPost('not json')).status).toBe(400)
    expect(syncBusinessXeroPL).not.toHaveBeenCalled()
  })

  it('checks access against the resolved businesses.id — where team membership lives — and 403s a refusal', async () => {
    verifyBusinessAccess.mockResolvedValue(false)
    const { status } = await callPost({ business_id: PROFILE_ID })
    expect(status).toBe(403)
    expect(resolveBusinessProfileIds).toHaveBeenCalledWith(expect.anything(), PROFILE_ID)
    expect(verifyBusinessAccess).toHaveBeenCalledWith('coach-1', BUSINESS_ID)
    expect(syncBusinessXeroPL).not.toHaveBeenCalled()
  })

  it('an id that did not resolve to both id-spaces cannot be checked — failed, not "not connected"', async () => {
    scripted.ids = { businessId: PROFILE_ID, profileId: PROFILE_ID, all: [PROFILE_ID] }
    const { status, json } = await callPost()
    expect(status).toBe(500)
    expect(json).toEqual({ outcome: 'failed', orgs: [] })
    expect(reads).toEqual([])
    expect(syncBusinessXeroPL).not.toHaveBeenCalled()
  })

  it('a failed connection read is failed (500), reported, and syncs nothing', async () => {
    scripted.rowsError = { message: 'canceling statement due to statement timeout' }
    const { status, json } = await callPost()
    expect(status).toBe(500)
    expect(json.outcome).toBe('failed')
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(syncBusinessXeroPL).not.toHaveBeenCalled()
  })

  it('reads the connection rows under both id forms', async () => {
    scripted.result = syncResult('success')
    scripted.tenants = [{ ...DRAGON, status: 'success' }, { ...EHC, status: 'success' }]
    await callPost()
    expect(reads).toEqual([{ table: 'xero_connections', column: 'business_id', values: [PROFILE_ID, BUSINESS_ID] }])
  })

  it('no longer answers GET — a sync is not a read', async () => {
    const mod = await import('@/app/api/Xero/sync/route')
    expect((mod as Record<string, unknown>).GET).toBeUndefined()
  })
})

describe('POST /api/Xero/sync — delegates to the orchestrator and writes nothing itself', () => {
  it('syncs the posted business through syncBusinessXeroPL, asking for every org outcome', async () => {
    scripted.result = syncResult('success')
    scripted.tenants = [{ ...DRAGON, status: 'success' }, { ...EHC, status: 'success' }]
    const { status, json } = await callPost()

    expect(status).toBe(200)
    expect(syncBusinessXeroPL).toHaveBeenCalledTimes(1)
    expect(syncBusinessXeroPL.mock.calls[0]![0]).toBe(PROFILE_ID)
    expect(typeof syncBusinessXeroPL.mock.calls[0]![1]?.onTenantOutcome).toBe('function')
    expect(json).toEqual({
      outcome: 'synced',
      orgs: [
        { name: 'Dragon Roofing Pty Ltd', status: 'success' },
        { name: 'Easy Hail Claim', status: 'success' },
      ],
    })
    // No last_synced_at stamp, no financial_metrics row, no rpc of its own.
    expect(writes).toEqual([])
  })

  it('writes nothing itself even when the sync fails', async () => {
    scripted.result = syncResult('error', 'All 2 tenants errored')
    scripted.tenants = [{ ...DRAGON, status: 'error' }, { ...EHC, status: 'error' }]
    await callPost()
    expect(writes).toEqual([])
  })
})

describe('POST /api/Xero/sync — "synced" means every org synced', () => {
  it('one org refused (the IICT Group Pty Ltd 403) is partial, naming the org — never synced', async () => {
    scripted.result = syncResult('partial', '1 tenant(s) errored')
    scripted.tenants = [{ ...DRAGON, status: 'success' }, { ...EHC, status: 'error' }]
    const { status, json } = await callPost()
    expect(status).toBe(200)
    expect(json).toEqual({
      outcome: 'partial',
      orgs: [
        { name: 'Dragon Roofing Pty Ltd', status: 'success' },
        { name: 'Easy Hail Claim', status: 'error' },
      ],
    })
  })

  it('every org landed but with gaps is partial', async () => {
    scripted.result = syncResult('partial', '1 tenant(s) partial')
    scripted.tenants = [{ ...DRAGON, status: 'partial' }, { ...EHC, status: 'success' }]
    const { status, json } = await callPost()
    expect(status).toBe(200)
    expect(json.outcome).toBe('partial')
  })

  it('a rollup of success with any org short of success is still not green', async () => {
    scripted.result = syncResult('success')
    scripted.tenants = [{ ...DRAGON, status: 'success' }, { ...EHC, status: 'partial' }]
    expect((await callPost()).json.outcome).toBe('partial')
  })

  it('a rollup of partial is not green even when every reported org says success', async () => {
    scripted.result = syncResult('partial', '1 tenant(s) errored')
    scripted.tenants = [{ ...DRAGON, status: 'success' }, { ...EHC, status: 'success' }]
    expect((await callPost()).json.outcome).toBe('partial')
  })

  it('a rollup of success that reports no org at all cannot be vouched for — failed', async () => {
    scripted.result = syncResult('success')
    scripted.tenants = []
    const { status, json } = await callPost()
    expect(status).toBe(502)
    expect(json.outcome).toBe('failed')
  })

  it('every org errored is failed (502), not a success with zeros', async () => {
    scripted.result = syncResult('error', 'All 2 tenants errored')
    scripted.tenants = [{ ...DRAGON, status: 'error' }, { ...EHC, status: 'error' }]
    const { status, json } = await callPost()
    expect(status).toBe(502)
    expect(json.outcome).toBe('failed')
    expect(json.orgs.map((o: { status: string }) => o.status)).toEqual(['error', 'error'])
  })

  it("a single org stopped by Xero's daily limit rolls up 'partial' but landed nothing — failed", async () => {
    scripted.rows = [connection(DRAGON)]
    scripted.result = syncResult('partial', '1 tenant(s) paused (rate limit)')
    scripted.tenants = [{ ...DRAGON, status: 'paused' }]
    const { status, json } = await callPost()
    expect(status).toBe(502)
    expect(json).toEqual({ outcome: 'failed', orgs: [{ name: 'Dragon Roofing Pty Ltd', status: 'paused' }] })
  })

  it('another sync holding the lock is in_progress (409), not a failure', async () => {
    scripted.result = { ...syncResult('error', SYNC_IN_FLIGHT), sync_job_id: '' }
    const { status, json } = await callPost()
    expect(status).toBe(409)
    expect(json).toEqual({ outcome: 'in_progress', orgs: [] })
  })

  it('the orchestrator finding no active connection after the route saw one is failed (500), not "not connected"', async () => {
    // Its own id lookup missed the rows — the resolver echoes on a failed read.
    scripted.result = syncResult('error', SYNC_NO_CONNECTIONS)
    const { status, json } = await callPost()
    expect(status).toBe(500)
    expect(json).toEqual({ outcome: 'failed', orgs: [] })
  })

  it('an orchestrator throw is failed (500) and reported to Sentry', async () => {
    scripted.throws = new Error('begin_xero_sync_job failed: connection reset')
    const { status, json } = await callPost()
    expect(status).toBe(500)
    expect(json.outcome).toBe('failed')
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  it('an org with no name is still listed, not dropped', async () => {
    scripted.result = syncResult('partial', '1 tenant(s) errored')
    scripted.tenants = [{ ...DRAGON, status: 'success' }, { tenant_id: 't-x', tenant_name: null, status: 'error' }]
    const { json } = await callPost()
    expect(json.orgs[1]).toEqual({ name: 'Unnamed Xero organisation', status: 'error' })
  })
})

describe('POST /api/Xero/sync — the orgs the sync cannot reach', () => {
  it('a switched-off sibling org makes an otherwise clean sync partial, and is named', async () => {
    // Easy Hail Claim's token was refused, so the token manager switched it off.
    scripted.rows = [connection(DRAGON), connection({ ...EHC, is_active: false })]
    scripted.result = syncResult('success')
    scripted.tenants = [{ ...DRAGON, status: 'success' }]
    const { status, json } = await callPost()
    expect(status).toBe(200)
    expect(json).toEqual({
      outcome: 'partial',
      orgs: [
        { name: 'Dragon Roofing Pty Ltd', status: 'success' },
        { name: 'Easy Hail Claim', status: 'disconnected' },
      ],
    })
  })

  it('an org retired on purpose (off and excluded from consolidation) does not block green', async () => {
    scripted.rows = [connection(DRAGON), connection({ ...EHC, is_active: false, include_in_consolidation: false })]
    scripted.result = syncResult('success')
    scripted.tenants = [{ ...DRAGON, status: 'success' }]
    const { json } = await callPost()
    expect(json).toEqual({ outcome: 'synced', orgs: [{ name: 'Dragon Roofing Pty Ltd', status: 'success' }] })
  })

  it('a switched-off row with a live row for the same org is not disconnected', async () => {
    scripted.rows = [
      connection(DRAGON),
      connection({ ...DRAGON, id: 'conn-old-dragon', business_id: PROFILE_ID, is_active: false }),
    ]
    scripted.result = syncResult('success')
    scripted.tenants = [{ ...DRAGON, status: 'success' }]
    expect((await callPost()).json.outcome).toBe('synced')
  })

  it('no org switched on is not_connected without running a sync, naming the disconnected org', async () => {
    scripted.rows = [connection({ ...DRAGON, is_active: false })]
    const { status, json } = await callPost()
    expect(status).toBe(404)
    expect(json).toEqual({ outcome: 'not_connected', orgs: [{ name: 'Dragon Roofing Pty Ltd', status: 'disconnected' }] })
    expect(syncBusinessXeroPL).not.toHaveBeenCalled()
  })

  it('never connected is not_connected with no orgs, without running a sync', async () => {
    scripted.rows = []
    const { status, json } = await callPost()
    expect(status).toBe(404)
    expect(json).toEqual({ outcome: 'not_connected', orgs: [] })
    expect(syncBusinessXeroPL).not.toHaveBeenCalled()
  })
})
