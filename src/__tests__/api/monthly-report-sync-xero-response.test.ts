/**
 * The monthly-report "Sync" response must say whether the P&L actually landed.
 *
 * Companion to monthly-report-sync-xero-clock.test.ts. That file pins the
 * DATABASE clock (`xero_connections.last_synced_at`, written only by
 * syncBusinessXeroPL, per tenant, on that tenant's own success). This one pins
 * what the route TELLS its two callers, because the same lie had a second door:
 *
 *   `success: true` was hardcoded. The route answers 200 whenever it reaches
 *   the end — the balance-sheet mirror runs regardless — so a run where the
 *   orchestrator returned status 'error' (every org failed, or the 44-05
 *   single-flight guard refused a second concurrent run and no P&L was
 *   attempted at all) still came back 200 {success: true}. The detail sat in
 *   `errors`, which neither caller reads.
 *
 *   /integrations/page.tsx branches on `data.success` and announced
 *   "N/M Xero organisations synced". useXeroConnection.handleSync treated any
 *   2xx as a sync: it toasted success and moved its own on-screen clock.
 *
 * 'partial' stays a success — some org's numbers did land — but must be
 * distinguishable, so the UI can say "some data did not sync" instead of
 * claiming a clean run.
 *
 * Dispatched through the exported POST so the withSchema wrapper is in the
 * path, posting the businesses.id that monthly-report/page.tsx resolves via
 * resolveBusinessId() and useXeroConnection() sends as `{ business_id }`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const BUSINESSES_ID = '22222222-2222-4222-8222-222222222222'
const PROFILE_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const TENANT_B = 'bbbbbbbb-0000-4000-8000-00000000000b'

type PlResult = {
  status: 'success' | 'partial' | 'error'
  rows_inserted: number
  coverage: { months_covered: number } | null
  error?: string
}

// ── Mutable fixture state, read lazily by every mock. ───────────────────────
let plResult: PlResult
let bsSyncedTenantIds: string[]
let bsMissedMonths: { tenant_id: string; month: string; reason: string }[]
let bsPerTenantErrors: { tenant_id: string; error: string }[]
let activeTenantIds: string[]

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
        in: () => ({
          eq: async () => ({
            data: activeTenantIds.map((tenantId, i) => ({
              id: `conn-${i}`,
              tenant_id: tenantId,
              tenant_name: tenantId === TENANT_B ? 'Org B' : 'Org A',
              business_id: BUSINESSES_ID,
              is_active: true,
            })),
            error: null,
          }),
        }),
      }),
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
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

vi.mock('@/lib/xero/sync-orchestrator', () => ({
  syncBusinessXeroPL: async () => ({
    business_id: BUSINESSES_ID,
    status: plResult.status,
    sync_job_id: 'job-1',
    rows_inserted: plResult.rows_inserted,
    rows_updated: 0,
    xero_request_count: 7,
    coverage: plResult.coverage,
    reconciliation: { status: 'ok', discrepancy_count: 0 },
    ...(plResult.error ? { error: plResult.error } : {}),
  }),
}))

// The BS mirror keeps succeeding throughout: that is the whole point. Its work
// is real, and it must never be enough on its own to call the sync a success.
vi.mock('@/lib/xero/bs-mirror-sync', () => ({
  syncBusinessBSMirror: async () => ({
    syncedTenantIds: [...bsSyncedTenantIds],
    perTenantErrors: [...bsPerTenantErrors],
    missedMonths: [...bsMissedMonths],
    monthsPerTenant: 3,
  }),
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

async function postSync(): Promise<Response> {
  const { POST } = await import('@/app/api/monthly-report/sync-xero/route')
  return (await POST(
    new NextRequest('http://localhost/api/monthly-report/sync-xero', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ business_id: BUSINESSES_ID }),
    }),
  )) as Response
}

describe('POST /api/monthly-report/sync-xero — the response reports the P&L outcome', () => {
  beforeEach(() => {
    plResult = { status: 'success', rows_inserted: 42, coverage: { months_covered: 12 } }
    bsSyncedTenantIds = [TENANT_A]
    bsMissedMonths = []
    bsPerTenantErrors = []
    activeTenantIds = [TENANT_A]
  })

  it('a clean run is a success, and reports the months it covered', async () => {
    const res = await postSync()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.pl_status).toBe('success')
    expect(body.error).toBeUndefined()
    expect(body.errors).toBeUndefined()
    // The field the toast reads. It has always been `months_fetched`; the hook
    // was reading `months_synced`, which no response ever carried.
    expect(body.months_fetched).toBe(12)
    expect(body.accounts_synced).toBe(42)
  })

  it('is NOT a success when every org’s P&L errored, though the balance sheet synced', async () => {
    plResult = {
      status: 'error',
      rows_inserted: 0,
      coverage: null,
      error: 'All 1 tenants errored',
    }
    bsSyncedTenantIds = [TENANT_A]

    const res = await postSync()
    const body = await res.json()

    // Still 200: the BS mirror's work is real and the body says what happened.
    // A non-2xx would send both callers down their network-failure branch and
    // throw this detail away.
    expect(res.status).toBe(200)
    expect(body.success).toBe(false)
    expect(body.pl_status).toBe('error')
    // /integrations reads `data.error` in its else-branch; without it the alert
    // degrades to a bare "Sync failed" naming no cause.
    expect(body.error).toContain('tenants errored')
    expect(body.errors?.some((e: { error: string }) => e.error.includes('P&L'))).toBe(true)
  })

  it('is NOT a success when a concurrent sync meant no P&L ran at all', async () => {
    // The 44-05 single-flight guard returns before touching a tenant. The BS
    // mirror still succeeds — exactly the shape the old `success: true` and the
    // deleted clock stamp both mistook for a healthy sync.
    plResult = {
      status: 'error',
      rows_inserted: 0,
      coverage: null,
      error: 'Another sync for this business is already in progress (within 15-minute staleness window).',
    }
    bsSyncedTenantIds = [TENANT_A]

    const res = await postSync()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(false)
    expect(body.error).toContain('already in progress')
  })

  it('a partial run is a success, but says so — one org landed, one did not', async () => {
    activeTenantIds = [TENANT_A, TENANT_B]
    bsSyncedTenantIds = [TENANT_A, TENANT_B]
    plResult = {
      status: 'partial',
      rows_inserted: 21,
      coverage: { months_covered: 12 },
      error: '1 tenant(s) errored',
    }

    const res = await postSync()
    const body = await res.json()

    // Something landed, so the caller should keep its post-sync work (reloading
    // mappings) — but pl_status is what stops it claiming a clean sync.
    expect(body.success).toBe(true)
    expect(body.pl_status).toBe('partial')
    expect(body.error).toBeUndefined()
    expect(body.tenants_total).toBe(2)
  })

  it('a P&L that landed while the balance sheet lost months stays a success, with the shortfall attached', async () => {
    bsMissedMonths = [{ tenant_id: TENANT_A, month: '2026-08', reason: 'fetch 429' }]

    const res = await postSync()
    const body = await res.json()

    expect(body.success).toBe(true)
    expect(body.pl_status).toBe('success')
    expect(body.months_failed).toBe(1)
    // Non-empty `errors` is what turns the toast from "Synced" into
    // "Synced ... — some data did not sync".
    expect(body.errors).toHaveLength(1)
  })
})
