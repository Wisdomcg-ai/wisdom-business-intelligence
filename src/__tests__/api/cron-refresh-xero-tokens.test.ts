/**
 * Phase 53 Plan 53-04 — Refresh-only Xero token cron tests.
 *
 * Validates GET /api/cron/refresh-xero-tokens:
 *   - Auth gate (4 cases including SEC-02 fail-closed when CRON_SECRET unset).
 *   - Per-connection iteration with status mapping (refreshed | still_valid |
 *     failed | deactivated).
 *   - Per-connection isolation: one bad connection doesn't abort the run.
 *   - Mid-run-deactivation tolerance: snapshot semantics — IDs queried once,
 *     iteration tolerates rows whose is_active flips during the loop.
 *   - Aggregate-error path: supabase fetch throw → 500 + Sentry capture.
 *   - Zero-connections: empty data → 200 with all counters at 0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock token-manager.getValidAccessToken at the module boundary.
const getValidAccessTokenMock = vi.fn()
vi.mock('@/lib/xero/token-manager', async () => {
  const actual = await vi.importActual<any>('@/lib/xero/token-manager')
  return {
    ...actual,
    getValidAccessToken: getValidAccessTokenMock,
    // Re-export the constant so the route can import it.
    REFRESH_THRESHOLD_MINUTES: actual.REFRESH_THRESHOLD_MINUTES,
  }
})

// Mock the supabase admin client. The .from('xero_connections').select().eq()
// chain returns a thenable that resolves to { data, error }.
const supabaseFromMock = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createServiceRoleClient: () => ({ from: supabaseFromMock }),
}))

// Mock Sentry — collect calls so we can assert on tags.
const captureExceptionMock = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
  captureMessage: vi.fn(),
}))

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret'
  getValidAccessTokenMock.mockReset()
  supabaseFromMock.mockReset()
  captureExceptionMock.mockReset()
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

/**
 * Helper: configure supabase mock to return `rows` from the
 * `from('xero_connections').select(...).eq('is_active', true)` chain.
 */
function mockConnectionsQuery(rows: any[] | null, error: any = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: rows, error }),
  }
  supabaseFromMock.mockReturnValue(builder)
  return builder
}

/**
 * Helper: build a fake xero_connections row. expires_at defaults to "fresh"
 * (well past the 15-min refresh threshold).
 */
function fakeRow(overrides: Partial<any> = {}) {
  const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString() // +1h
  return {
    id: overrides.id ?? 'conn-1',
    business_id: overrides.business_id ?? 'biz-1',
    tenant_id: overrides.tenant_id ?? 'tenant-1',
    tenant_name: overrides.tenant_name ?? 'Tenant One',
    expires_at: overrides.expires_at ?? farFuture,
  }
}

describe('Cron refresh-xero-tokens — auth gate', () => {
  it('Test 1: returns 401 with NO Authorization header', async () => {
    const { GET } = await import('@/app/api/cron/refresh-xero-tokens/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
    expect(getValidAccessTokenMock).not.toHaveBeenCalled()
    expect(supabaseFromMock).not.toHaveBeenCalled()
  })

  it('Test 2: returns 401 with WRONG Bearer', async () => {
    const { GET } = await import('@/app/api/cron/refresh-xero-tokens/route')
    const res = await GET(makeRequest({ Authorization: 'Bearer wrong-secret' }))
    expect(res.status).toBe(401)
    expect(getValidAccessTokenMock).not.toHaveBeenCalled()
    expect(supabaseFromMock).not.toHaveBeenCalled()
  })

  it('Test 3: returns 200 with VALID Bearer, calls supabase + getValidAccessToken', async () => {
    mockConnectionsQuery([fakeRow({ id: 'c1' })])
    getValidAccessTokenMock.mockResolvedValueOnce({
      success: true,
      accessToken: 'tok-1',
    })

    const { GET } = await import('@/app/api/cron/refresh-xero-tokens/route')
    const res = await GET(
      makeRequest({ Authorization: 'Bearer test-cron-secret' }),
    )
    expect(res.status).toBe(200)
    expect(supabaseFromMock).toHaveBeenCalledWith('xero_connections')
    expect(getValidAccessTokenMock).toHaveBeenCalledTimes(1)
  })

  it('Test 4 (SEC-02 fail-closed): CRON_SECRET unset + no header → 401', async () => {
    delete process.env.CRON_SECRET

    const { GET } = await import('@/app/api/cron/refresh-xero-tokens/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
    expect(getValidAccessTokenMock).not.toHaveBeenCalled()
    expect(supabaseFromMock).not.toHaveBeenCalled()
  })
})

describe('Cron refresh-xero-tokens — aggregation', () => {
  it('Test 5: 3 mock connections produce correct aggregate (refreshed/still_valid/deactivated)', async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString() // already expired
    const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    mockConnectionsQuery([
      // c1: pre-call expires_at is far in the future → still_valid
      fakeRow({
        id: 'c1',
        business_id: 'b1',
        tenant_name: 'T1',
        expires_at: farFuture,
      }),
      // c2: pre-call expires_at is past → refreshed
      fakeRow({
        id: 'c2',
        business_id: 'b2',
        tenant_name: 'T2',
        expires_at: past,
      }),
      // c3: pre-call expires_at is past, but token-manager returns deactivate
      fakeRow({
        id: 'c3',
        business_id: 'b3',
        tenant_name: 'T3',
        expires_at: past,
      }),
    ])

    getValidAccessTokenMock
      // c1 — already-fresh short-circuit
      .mockResolvedValueOnce({ success: true, accessToken: 'tok-1' })
      // c2 — successfully refreshed
      .mockResolvedValueOnce({ success: true, accessToken: 'tok-2' })
      // c3 — failed + shouldDeactivate
      .mockResolvedValueOnce({
        success: false,
        error: 'token_expired_permanently',
        message: 'Refresh token has expired',
        shouldDeactivate: true,
      })

    const { GET } = await import('@/app/api/cron/refresh-xero-tokens/route')
    const res = await GET(
      makeRequest({ Authorization: 'Bearer test-cron-secret' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.total).toBe(3)
    expect(body.still_valid).toBe(1)
    expect(body.refreshed).toBe(1)
    expect(body.deactivated).toBe(1)
    expect(body.failed).toBe(0)
    expect(body.results).toHaveLength(3)

    const byId = Object.fromEntries(
      body.results.map((r: any) => [r.connection_id, r]),
    )
    expect(byId.c1.status).toBe('still_valid')
    expect(byId.c1.tenant_name).toBe('T1')
    expect(byId.c1.business_id).toBe('b1')
    expect(byId.c2.status).toBe('refreshed')
    expect(byId.c3.status).toBe('deactivated')

    // Sentry capture fires once for the deactivation, with the correct invariant tag.
    expect(captureExceptionMock).toHaveBeenCalledTimes(1)
    const [, ctx] = captureExceptionMock.mock.calls[0]
    expect(ctx?.tags?.invariant).toBe('cron_refresh_xero_tokens_deactivated')
    expect(ctx?.tags?.connection_id).toBe('c3')
  })

  it('Test 6: per-connection throw is isolated; loop continues, status=failed, Sentry captured', async () => {
    mockConnectionsQuery([
      fakeRow({ id: 'cThrow', business_id: 'bThrow' }),
      fakeRow({ id: 'cOk', business_id: 'bOk' }),
    ])

    getValidAccessTokenMock
      .mockRejectedValueOnce(new Error('synthetic boom'))
      .mockResolvedValueOnce({ success: true, accessToken: 'tok-ok' })

    const { GET } = await import('@/app/api/cron/refresh-xero-tokens/route')
    const res = await GET(
      makeRequest({ Authorization: 'Bearer test-cron-secret' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(2)
    expect(body.failed).toBe(1)
    // The "ok" row had a far-future expires_at by default → still_valid.
    expect(body.still_valid + body.refreshed).toBe(1)
    expect(body.deactivated).toBe(0)

    const throwResult = body.results.find(
      (r: any) => r.connection_id === 'cThrow',
    )
    expect(throwResult.status).toBe('failed')
    expect(throwResult.error).toMatch(/synthetic boom/)

    // Sentry capture fires once for the per-connection throw with the right tag.
    expect(captureExceptionMock).toHaveBeenCalledTimes(1)
    const [, ctx] = captureExceptionMock.mock.calls[0]
    expect(ctx?.tags?.invariant).toBe(
      'cron_refresh_xero_tokens_per_connection',
    )
    expect(ctx?.tags?.connection_id).toBe('cThrow')
    expect(ctx?.tags?.business_id).toBe('bThrow')
  })

  it('Test 7: mid-run deactivation of c1 does not abort iteration to c2', async () => {
    mockConnectionsQuery([
      fakeRow({
        id: 'c1',
        business_id: 'b1',
        expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
      }),
      fakeRow({ id: 'c2', business_id: 'b2' }),
    ])

    getValidAccessTokenMock
      // c1 — token-manager wrote is_active=false internally and returned deactivate
      .mockResolvedValueOnce({
        success: false,
        error: 'token_expired_permanently',
        shouldDeactivate: true,
        message: 'gone',
      })
      // c2 — still healthy (default fakeRow expires_at is far future)
      .mockResolvedValueOnce({ success: true, accessToken: 'tok-2' })

    const { GET } = await import('@/app/api/cron/refresh-xero-tokens/route')
    const res = await GET(
      makeRequest({ Authorization: 'Bearer test-cron-secret' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(2)
    expect(body.deactivated).toBe(1)
    expect(body.still_valid + body.refreshed).toBe(1)
    expect(body.failed).toBe(0)

    // Ensure both connections were visited (snapshot iteration)
    expect(getValidAccessTokenMock).toHaveBeenCalledTimes(2)
  })

  it('Test 8: supabase fetch throw → 500 + Sentry capture with aggregate invariant', async () => {
    // Simulate the .eq() resolving with an error.
    mockConnectionsQuery(null, { message: 'connection refused' })

    const { GET } = await import('@/app/api/cron/refresh-xero-tokens/route')
    const res = await GET(
      makeRequest({ Authorization: 'Bearer test-cron-secret' }),
    )
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/connection refused/)

    expect(captureExceptionMock).toHaveBeenCalledTimes(1)
    const [, ctx] = captureExceptionMock.mock.calls[0]
    expect(ctx?.tags?.invariant).toBe('cron_refresh_xero_tokens')
  })

  it('Test 9: zero active connections → 200 with all counters at 0, no Sentry capture', async () => {
    mockConnectionsQuery([])

    const { GET } = await import('@/app/api/cron/refresh-xero-tokens/route')
    const res = await GET(
      makeRequest({ Authorization: 'Bearer test-cron-secret' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.total).toBe(0)
    expect(body.refreshed).toBe(0)
    expect(body.still_valid).toBe(0)
    expect(body.failed).toBe(0)
    expect(body.deactivated).toBe(0)
    expect(body.results).toEqual([])

    expect(getValidAccessTokenMock).not.toHaveBeenCalled()
    expect(captureExceptionMock).not.toHaveBeenCalled()
  })
})
