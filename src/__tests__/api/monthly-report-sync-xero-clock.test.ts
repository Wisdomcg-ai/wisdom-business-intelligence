/**
 * The monthly-report "Sync" button must never move an org's data clock on the
 * strength of the balance sheet alone.
 *
 * `xero_connections.last_synced_at` is half of dataClockFor()
 * (lib/xero/connection-status.ts): the DATA axis behind the coach
 * connection-health pill, /cfo, /api/Xero/status, the daily health report and
 * the dashboard's "Last synced" line. POST /api/monthly-report/sync-xero used
 * to stamp it for every connection in `bsResult.syncedTenantIds` — i.e.
 * whenever the BALANCE SHEET mirror synced for that org — and never looked at
 * the P&L orchestrator's outcome at all. An org whose P&L failed but whose BS
 * synced then read fresh for the full 48h window, and because the 6-hourly
 * cron's P&L would keep failing too, nothing overwrote the lie: one click
 * bought 48h of false green over a broken pipe.
 *
 * syncBusinessXeroPL is now the only writer of that column on this path. It
 * stamps per tenant, inside the try, only for a tenant that finished 'success'
 * or 'partial', and never from the catch (sync-orchestrator.ts).
 *
 * These dispatch through the exported POST, so the withSchema wrapper is in the
 * path, and post `business_id` — the businesses.id that
 * src/app/finances/monthly-report/page.tsx resolves via resolveBusinessId() and
 * useXeroConnection() sends as `{ business_id }`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const BUSINESSES_ID = '22222222-2222-4222-8222-222222222222'
const PROFILE_ID = '33333333-3333-4333-8333-333333333333'

const TENANT_A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const TENANT_B = 'bbbbbbbb-0000-4000-8000-00000000000b'

type ConnectionRow = {
  id: string
  tenant_id: string
  tenant_name: string
  business_id: string
  is_active: boolean
  last_synced_at: string | null
}

type ClockWrite = { connectionId: string; writer: 'route' | 'orchestrator' }

type PlOutcome = 'success' | 'partial' | 'error' | 'paused'

// ── Mutable fixture state. Every mock reads it lazily, at call time. ─────────
let connectionRows: ConnectionRow[] = []
let clockWrites: ClockWrite[] = []
let orchestratorCalls: string[] = []
let plOutcomeByTenant: Record<string, PlOutcome> = {}
let bsSyncedTenantIds: string[] = []
/** Attributes a clock write to whoever is on the stack when it happens. */
let writer: 'route' | 'orchestrator' = 'route'
/**
 * When false the orchestrator stand-in writes nothing at all, which isolates
 * the route: any clock write that still appears came from the route itself.
 */
let orchestratorStamps = true
/**
 * The 44-05 single-flight guard: another sync is already running, so the
 * orchestrator returns without iterating a single tenant.
 */
let orchestratorRefusesInFlight = false

function connectionsMatching(col: string, values: string[]): ConnectionRow[] {
  return connectionRows.filter((row) => values.includes(String((row as never as Record<string, unknown>)[col])))
}

// The service-role client the route builds at module scope. The connection read
// honours the route's real filters (`.in('business_id', ids.all)` then
// `.eq('is_active', true)`) so a fixture can't pass by being ignored.
function adminFrom(table: string): any {
  if (table === 'businesses') {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: BUSINESSES_ID, owner_id: USER_ID, assigned_coach_id: null },
            error: null,
          }),
        }),
      }),
    }
  }
  if (table === 'xero_connections') {
    return {
      select: () => ({
        in: (col: string, values: string[]) => ({
          eq: async (flag: string, want: boolean) => ({
            data: connectionsMatching(col, values).filter(
              (row) => (row as never as Record<string, unknown>)[flag] === want,
            ),
            error: null,
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          if ('last_synced_at' in patch) clockWrites.push({ connectionId: id, writer })
          return { data: null, error: null }
        },
      }),
    }
  }
  throw new Error(`[test] unexpected table on the admin client: ${table}`)
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => adminFrom(table) }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    rpc: async () => ({ data: false, error: null }),
  }),
}))

vi.mock('@/lib/business/resolveBusinessProfileIds', () => ({
  resolveBusinessProfileIds: async () => ({
    businessId: BUSINESSES_ID,
    profileId: PROFILE_ID,
    all: [PROFILE_ID, BUSINESSES_ID],
  }),
}))

/**
 * Stand-in for syncBusinessXeroPL reproducing the one behaviour these tests
 * turn on: it stamps last_synced_at per tenant, only for a tenant that finished
 * 'success' or 'partial' — guarded on `tenantStatus !== 'paused'` inside the
 * try, never from the catch that handles a failed tenant.
 */
async function runOrchestratorStandIn(businessId: string) {
  orchestratorCalls.push(businessId)

  if (orchestratorRefusesInFlight) {
    return {
      business_id: businessId,
      status: 'error' as const,
      sync_job_id: '',
      rows_inserted: 0,
      rows_updated: 0,
      xero_request_count: 0,
      coverage: { months_covered: 0, first_period: '', last_period: '', expected_months: 24 },
      reconciliation: { status: 'ok' as const, discrepancy_count: 0 },
      error:
        'Another sync for this business is already in progress (within 15-minute staleness window).',
    }
  }

  // The orchestrator selects the same connection set the route did.
  const tenants = connectionsMatching('business_id', [PROFILE_ID, BUSINESSES_ID]).filter(
    (row) => row.is_active,
  )
  const outcomes = tenants.map((conn) => ({
    conn,
    status: plOutcomeByTenant[conn.tenant_id] ?? ('success' as PlOutcome),
  }))

  if (orchestratorStamps) {
    writer = 'orchestrator'
    for (const { conn, status } of outcomes) {
      if (status === 'error' || status === 'paused') continue
      await adminFrom('xero_connections')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', conn.id)
    }
    writer = 'route'
  }

  const failed = outcomes.filter((o) => o.status === 'error' || o.status === 'paused')
  const status = failed.length === 0 ? 'success' : failed.length === outcomes.length ? 'error' : 'partial'
  return {
    business_id: businessId,
    status: status as 'success' | 'partial' | 'error',
    sync_job_id: 'job-1',
    rows_inserted: status === 'error' ? 0 : 42,
    rows_updated: 0,
    xero_request_count: 7,
    coverage: { months_covered: 12, first_period: '2025-07-01', last_period: '2026-09-01', expected_months: 24 },
    reconciliation: { status: 'ok' as const, discrepancy_count: 0 },
    ...(status === 'error' ? { error: `P&L failed for ${failed.map((f) => f.conn.tenant_name).join(', ')}` } : {}),
  }
}

vi.mock('@/lib/xero/sync-orchestrator', () => ({
  syncBusinessXeroPL: (businessId: string) => runOrchestratorStandIn(businessId),
}))

vi.mock('@/lib/xero/bs-mirror-sync', () => ({
  syncBusinessBSMirror: async () => ({
    syncedTenantIds: [...bsSyncedTenantIds],
    perTenantErrors: [],
    missedMonths: [],
    monthsPerTenant: 13,
  }),
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

function connection(overrides: Partial<ConnectionRow> & Pick<ConnectionRow, 'id' | 'tenant_id'>): ConnectionRow {
  return {
    tenant_name: overrides.tenant_id === TENANT_B ? 'Org B' : 'Org A',
    business_id: BUSINESSES_ID,
    is_active: true,
    last_synced_at: null,
    ...overrides,
  }
}

async function postSync(businessId: string): Promise<Response> {
  const { POST } = await import('@/app/api/monthly-report/sync-xero/route')
  return (await POST(
    new NextRequest('http://localhost/api/monthly-report/sync-xero', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ business_id: businessId }),
    }),
  )) as Response
}

describe('POST /api/monthly-report/sync-xero — the data clock only moves for an org whose P&L landed', () => {
  beforeEach(() => {
    connectionRows = [connection({ id: 'conn-a', tenant_id: TENANT_A })]
    clockWrites = []
    orchestratorCalls = []
    plOutcomeByTenant = {}
    bsSyncedTenantIds = [TENANT_A]
    writer = 'route'
    orchestratorStamps = true
    orchestratorRefusesInFlight = false
  })

  it('forwards the businesses.id the monthly-report UI posts to the orchestrator', async () => {
    const res = await postSync(BUSINESSES_ID)

    expect(res.status).toBe(200)
    expect(orchestratorCalls).toEqual([BUSINESSES_ID])
  })

  it('leaves the clock where it was when the P&L failed and only the balance sheet synced', async () => {
    plOutcomeByTenant = { [TENANT_A]: 'error' }
    bsSyncedTenantIds = [TENANT_A]

    const res = await postSync(BUSINESSES_ID)
    const body = await res.json()

    expect(clockWrites).toEqual([])
    // The failure is still reported rather than swallowed.
    expect(body.errors?.some((e: { error: string }) => e.error.includes('P&L'))).toBe(true)
  })

  it('moves the clock when the P&L landed — written by the orchestrator, not the route', async () => {
    const res = await postSync(BUSINESSES_ID)

    expect(res.status).toBe(200)
    expect(clockWrites).toEqual([{ connectionId: 'conn-a', writer: 'orchestrator' }])
  })

  it('writes no clock of its own: with the orchestrator stamping nothing, a clean BS sync moves nothing', async () => {
    // The regression pin. Before the fix this stage stamped every tenant in
    // bsResult.syncedTenantIds, so this produced one write with writer 'route'.
    orchestratorStamps = false
    bsSyncedTenantIds = [TENANT_A]

    const res = await postSync(BUSINESSES_ID)

    expect(res.status).toBe(200)
    expect(clockWrites).toEqual([])
  })

  it('a multi-org business stamps only the org whose P&L landed, though the BS synced for both', async () => {
    connectionRows = [
      connection({ id: 'conn-a', tenant_id: TENANT_A }),
      connection({ id: 'conn-b', tenant_id: TENANT_B }),
    ]
    plOutcomeByTenant = { [TENANT_A]: 'success', [TENANT_B]: 'error' }
    bsSyncedTenantIds = [TENANT_A, TENANT_B]

    const res = await postSync(BUSINESSES_ID)
    const body = await res.json()

    expect(clockWrites).toEqual([{ connectionId: 'conn-a', writer: 'orchestrator' }])
    expect(clockWrites.map((w) => w.connectionId)).not.toContain('conn-b')
    expect(body.tenants_total).toBe(2)
  })

  it("a 'partial' tenant still earns its stamp — the numbers landed, some months short", async () => {
    connectionRows = [
      connection({ id: 'conn-a', tenant_id: TENANT_A }),
      connection({ id: 'conn-b', tenant_id: TENANT_B }),
    ]
    plOutcomeByTenant = { [TENANT_A]: 'partial', [TENANT_B]: 'paused' }
    bsSyncedTenantIds = [TENANT_A, TENANT_B]

    await postSync(BUSINESSES_ID)

    expect(clockWrites).toEqual([{ connectionId: 'conn-a', writer: 'orchestrator' }])
  })

  it('moves no clock when a concurrent sync means the orchestrator never reached the org', async () => {
    // The single-flight guard returns before iterating any tenant, so no P&L
    // ran at all. The BS mirror still succeeds — which is exactly the shape the
    // old stamp mistook for a healthy sync.
    orchestratorRefusesInFlight = true
    bsSyncedTenantIds = [TENANT_A]

    const res = await postSync(BUSINESSES_ID)
    const body = await res.json()

    expect(clockWrites).toEqual([])
    expect(body.errors?.some((e: { error: string }) => e.error.includes('already in progress'))).toBe(true)
  })

  it('an inactive connection is neither read nor stamped', async () => {
    connectionRows = [
      connection({ id: 'conn-a', tenant_id: TENANT_A }),
      connection({ id: 'conn-b', tenant_id: TENANT_B, is_active: false }),
    ]
    bsSyncedTenantIds = [TENANT_A]

    const res = await postSync(BUSINESSES_ID)
    const body = await res.json()

    expect(body.tenants_total).toBe(1)
    expect(clockWrites).toEqual([{ connectionId: 'conn-a', writer: 'orchestrator' }])
  })
})
