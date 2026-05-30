/**
 * Phase 69-04 — Pre-expiry warning + cron_heartbeat regression tests for
 * /api/cron/refresh-xero-tokens.
 *
 * Adds two new invariants on top of the existing 53-04 cron test suite:
 *
 *   1. `xero_token_pre_expiry` — Sentry warning fires per tenant when
 *      `(expires_at - now()) < 24h` AND the current cron tick's per-row
 *      status was NOT `refreshed` (i.e. cron observed an expiring token
 *      but did not produce a new one). Distinct from
 *      `cron_refresh_xero_tokens_failed` (which fires on transient
 *      Xero-side failures only). The two are SEPARATE invariants by
 *      design — 53-05's "exactly one event per failure" honors named
 *      failure modes, not raw event counts; pre-expiry observation is
 *      a different signal from per-tick refresh failure.
 *
 *   2. `cron_heartbeats` row written once per invocation via the new
 *      recordHeartbeat helper. Success path → status='success'.
 *      Aggregate-failure path → status='failed'. Auth-gate rejection
 *      does NOT write a heartbeat (heartbeat presence == "real
 *      invocation occurred").
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock token-manager.getValidAccessToken at the module boundary.
const getValidAccessTokenMock = vi.fn()
vi.mock('@/lib/xero/token-manager', async () => {
  const actual = await vi.importActual<any>('@/lib/xero/token-manager')
  return {
    ...actual,
    getValidAccessToken: getValidAccessTokenMock,
    REFRESH_THRESHOLD_MINUTES: actual.REFRESH_THRESHOLD_MINUTES,
  }
})

// Mock supabase admin.
const supabaseFromMock = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: () => ({ from: supabaseFromMock }),
}))

// Mock the heartbeat helper so we can assert recordHeartbeat was called
// without exercising the actual DB insert path.
const recordHeartbeatMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/cron/heartbeat', () => ({
  recordHeartbeat: recordHeartbeatMock,
}))

// Mock Sentry — collect calls so we can assert on tags.
const captureExceptionMock = vi.fn()
const captureMessageMock = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
  captureMessage: captureMessageMock,
}))

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret'
  getValidAccessTokenMock.mockReset()
  supabaseFromMock.mockReset()
  captureExceptionMock.mockReset()
  captureMessageMock.mockReset()
  recordHeartbeatMock.mockReset()
  recordHeartbeatMock.mockResolvedValue(undefined)
  vi.resetModules()
})

afterEach(() => {
  if (ORIGINAL_CRON_SECRET === undefined) {
    delete process.env.CRON_SECRET
  } else {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET
  }
})

function makeRequest(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/cron/refresh-xero-tokens', {
    method: 'GET',
    headers,
  }) as any
}

function mockConnectionsQuery(rows: any[] | null, error: any = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: rows, error }),
  }
  supabaseFromMock.mockReturnValue(builder)
  return builder
}

function rowExpiringIn(ms: number, overrides: Partial<any> = {}) {
  return {
    id: overrides.id ?? 'conn-x',
    business_id: overrides.business_id ?? 'biz-x',
    tenant_id: overrides.tenant_id ?? 'tenant-x',
    tenant_name: overrides.tenant_name ?? 'Tenant X',
    expires_at: new Date(Date.now() + ms).toISOString(),
  }
}

function preExpiryCaptures() {
  return captureMessageMock.mock.calls.filter(
    ([, ctx]: any[]) => ctx?.tags?.invariant === 'xero_token_pre_expiry',
  )
}

describe('phase-69 pre-expiry — xero_token_pre_expiry Sentry warning', () => {
  it('emits xero_token_pre_expiry warning when expires_at < 24h AND status=still_valid', async () => {
    // expires in 6h, so wasFreshBeforeCall=true → status='still_valid'.
    // 6h < 24h pre-expiry threshold → warning must fire.
    mockConnectionsQuery([
      rowExpiringIn(6 * 60 * 60 * 1000, {
        id: 'c-pre',
        business_id: 'b-pre',
        tenant_id: 't-pre',
      }),
    ])
    getValidAccessTokenMock.mockResolvedValueOnce({
      success: true,
      accessToken: 'tok',
    })

    const { GET } = await import('@/app/api/cron/refresh-xero-tokens/route')
    const res = await GET(
      makeRequest({ Authorization: 'Bearer test-cron-secret' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.still_valid).toBe(1)

    const calls = preExpiryCaptures()
    expect(calls).toHaveLength(1)
    const [, ctx] = calls[0]
    expect(ctx.level).toBe('warning')
    expect(ctx.tags.connection_id).toBe('c-pre')
    expect(ctx.tags.business_id).toBe('b-pre')
    expect(ctx.tags.tenant_id).toBe('t-pre')
    expect(ctx.tags.hours_until_expiry).toBe('6')
    expect(ctx.tags.last_status).toBe('still_valid')
  })

  it('does NOT emit warning when status=refreshed (cron successfully refreshed)', async () => {
    // expires in 10min, well inside the 15min REFRESH threshold →
    // wasFreshBeforeCall=false → status='refreshed'. Warning must NOT fire.
    mockConnectionsQuery([rowExpiringIn(10 * 60 * 1000)])
    getValidAccessTokenMock.mockResolvedValueOnce({
      success: true,
      accessToken: 'tok',
    })

    const { GET } = await import('@/app/api/cron/refresh-xero-tokens/route')
    const res = await GET(
      makeRequest({ Authorization: 'Bearer test-cron-secret' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.refreshed).toBe(1)
    expect(preExpiryCaptures()).toHaveLength(0)
  })

  it('does NOT emit warning when expires_at > 24h', async () => {
    mockConnectionsQuery([rowExpiringIn(48 * 60 * 60 * 1000)])
    getValidAccessTokenMock.mockResolvedValueOnce({
      success: true,
      accessToken: 'tok',
    })

    const { GET } = await import('@/app/api/cron/refresh-xero-tokens/route')
    const res = await GET(
      makeRequest({ Authorization: 'Bearer test-cron-secret' }),
    )
    expect(res.status).toBe(200)
    expect(preExpiryCaptures()).toHaveLength(0)
  })

  it('emits warning when status=failed AND expires_at < 24h (distinct from cron_refresh_xero_tokens_failed)', async () => {
    mockConnectionsQuery([
      rowExpiringIn(12 * 60 * 60 * 1000, {
        id: 'c-fail',
        business_id: 'b-fail',
        tenant_id: 't-fail',
      }),
    ])
    getValidAccessTokenMock.mockResolvedValueOnce({
      success: false,
      error: 'server_error',
      message: 'Xero 503',
    })

    const { GET } = await import('@/app/api/cron/refresh-xero-tokens/route')
    const res = await GET(
      makeRequest({ Authorization: 'Bearer test-cron-secret' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.failed).toBe(1)

    // Existing cron_refresh_xero_tokens_failed capture still fires.
    expect(captureExceptionMock).toHaveBeenCalledTimes(1)
    expect(captureExceptionMock.mock.calls[0][1]?.tags?.invariant).toBe(
      'cron_refresh_xero_tokens_failed',
    )

    // New xero_token_pre_expiry capture also fires (different invariant).
    const calls = preExpiryCaptures()
    expect(calls).toHaveLength(1)
    expect(calls[0][1].tags.last_status).toBe('failed')
    expect(calls[0][1].tags.connection_id).toBe('c-fail')
  })

  it('emits one warning per affected tenant in a multi-row batch', async () => {
    // A: 2h, still_valid → fires
    // B: 30d, still_valid → does not fire
    // C: 4h, failed       → fires
    mockConnectionsQuery([
      rowExpiringIn(2 * 60 * 60 * 1000, { id: 'A', business_id: 'bA', tenant_id: 'tA' }),
      rowExpiringIn(30 * 24 * 60 * 60 * 1000, { id: 'B', business_id: 'bB', tenant_id: 'tB' }),
      rowExpiringIn(4 * 60 * 60 * 1000, { id: 'C', business_id: 'bC', tenant_id: 'tC' }),
    ])
    getValidAccessTokenMock
      .mockResolvedValueOnce({ success: true, accessToken: 'tA' })
      .mockResolvedValueOnce({ success: true, accessToken: 'tB' })
      .mockResolvedValueOnce({
        success: false,
        error: 'server_error',
        message: 'Xero 503',
      })

    const { GET } = await import('@/app/api/cron/refresh-xero-tokens/route')
    const res = await GET(
      makeRequest({ Authorization: 'Bearer test-cron-secret' }),
    )
    expect(res.status).toBe(200)

    const calls = preExpiryCaptures()
    expect(calls).toHaveLength(2)
    const tagsByConnId = Object.fromEntries(
      calls.map(([, ctx]: any[]) => [ctx.tags.connection_id, ctx.tags]),
    )
    expect(tagsByConnId.A).toBeDefined()
    expect(tagsByConnId.A.last_status).toBe('still_valid')
    expect(tagsByConnId.C).toBeDefined()
    expect(tagsByConnId.C.last_status).toBe('failed')
    expect(tagsByConnId.B).toBeUndefined()
  })
})

describe('phase-69 heartbeat — cron writes one cron_heartbeats row per invocation', () => {
  it('writes status=success heartbeat on a clean run', async () => {
    mockConnectionsQuery([
      rowExpiringIn(60 * 60 * 1000), // 1h to expiry → still_valid + pre-expiry warning
    ])
    getValidAccessTokenMock.mockResolvedValueOnce({
      success: true,
      accessToken: 'tok',
    })

    const { GET } = await import('@/app/api/cron/refresh-xero-tokens/route')
    const res = await GET(
      makeRequest({ Authorization: 'Bearer test-cron-secret' }),
    )
    expect(res.status).toBe(200)

    expect(recordHeartbeatMock).toHaveBeenCalledTimes(1)
    const [opts] = recordHeartbeatMock.mock.calls[0]
    expect(opts.cronPath).toBe('/api/cron/refresh-xero-tokens')
    expect(opts.status).toBe('success')
    // Metadata carries the aggregate counters for queryability.
    expect(opts.metadata).toMatchObject({ total: 1 })
  })

  it('writes status=failed heartbeat when the aggregate path throws', async () => {
    mockConnectionsQuery(null, { message: 'supabase down' })

    const { GET } = await import('@/app/api/cron/refresh-xero-tokens/route')
    const res = await GET(
      makeRequest({ Authorization: 'Bearer test-cron-secret' }),
    )
    expect(res.status).toBe(500)

    expect(recordHeartbeatMock).toHaveBeenCalledTimes(1)
    const [opts] = recordHeartbeatMock.mock.calls[0]
    expect(opts.cronPath).toBe('/api/cron/refresh-xero-tokens')
    expect(opts.status).toBe('failed')
    expect(opts.errorMessage).toMatch(/supabase down/)
  })

  it('does NOT write a heartbeat when auth gate rejects (heartbeat == real invocation)', async () => {
    const { GET } = await import('@/app/api/cron/refresh-xero-tokens/route')
    const res = await GET(makeRequest()) // no Authorization header
    expect(res.status).toBe(401)
    expect(recordHeartbeatMock).not.toHaveBeenCalled()
  })
})
