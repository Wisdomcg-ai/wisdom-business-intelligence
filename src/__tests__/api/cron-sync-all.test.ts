/**
 * Phase 44 Plan 44-05 — Cron sync-all route tests.
 *
 * Validates GET /api/cron/sync-all-xero:
 *   - 401 without Authorization header.
 *   - 401 with wrong Bearer secret.
 *   - 200 with valid auth → calls runSyncForAllBusinesses, returns results.
 *   - 500 when the orchestrator throws (failures surface, NOT swallowed).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the orchestrator at the module boundary. Each test customises the
// mock's behaviour via the imported `runSyncForAllBusinessesMock` ref.
const runSyncForAllBusinessesMock = vi.fn()
vi.mock('@/lib/xero/sync-orchestrator', () => ({
  runSyncForAllBusinesses: runSyncForAllBusinessesMock,
}))

// Mock Sentry — we just need the captureException stub to be callable.
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret'
  runSyncForAllBusinessesMock.mockReset()
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
  return new Request('http://localhost/api/cron/sync-all-xero', {
    method: 'GET',
    headers,
  }) as any
}

describe('Cron sync-all route', () => {
  it('unauth', async () => {
    // GET with NO Authorization header → 401.
    const { GET } = await import('@/app/api/cron/sync-all-xero/route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
    expect(runSyncForAllBusinessesMock).not.toHaveBeenCalled()
  })

  it('unauth (wrong bearer)', async () => {
    // GET with WRONG Authorization → 401.
    const { GET } = await import('@/app/api/cron/sync-all-xero/route')
    const res = await GET(
      makeRequest({ Authorization: 'Bearer wrong-secret' }),
    )
    expect(res.status).toBe(401)
    expect(runSyncForAllBusinessesMock).not.toHaveBeenCalled()
  })

  it('authorized invocation', async () => {
    // GET with VALID Authorization → 200, calls orchestrator, returns results.
    runSyncForAllBusinessesMock.mockResolvedValueOnce([
      {
        business_id: 'b1',
        status: 'success',
        sync_job_id: 'job-1',
        rows_inserted: 12,
        rows_updated: 0,
        xero_request_count: 4,
        coverage: { months_covered: 12, first_period: '2025-07', last_period: '2026-04', expected_months: 24 },
        reconciliation: { status: 'ok', discrepancy_count: 0 },
      },
      {
        business_id: 'b2',
        status: 'partial',
        sync_job_id: 'job-2',
        rows_inserted: 10,
        rows_updated: 0,
        xero_request_count: 4,
        coverage: { months_covered: 10, first_period: '2025-09', last_period: '2026-04', expected_months: 24 },
        reconciliation: { status: 'mismatch', discrepancy_count: 2 },
      },
    ])

    const { GET } = await import('@/app/api/cron/sync-all-xero/route')
    const res = await GET(
      makeRequest({ Authorization: 'Bearer test-cron-secret' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.totalBusinesses).toBe(2)
    expect(body.successCount).toBe(1)
    expect(body.partialCount).toBe(1)
    expect(body.erroredCount).toBe(0)
    expect(body.results).toHaveLength(2)
    expect(runSyncForAllBusinessesMock).toHaveBeenCalledTimes(1)
  })

  it('orchestrator error caught', async () => {
    // GET with valid auth where the orchestrator throws → 500 (not 200),
    // failure surfaced not swallowed.
    runSyncForAllBusinessesMock.mockRejectedValueOnce(
      new Error('synthetic orchestrator failure'),
    )

    const { GET } = await import('@/app/api/cron/sync-all-xero/route')
    const res = await GET(
      makeRequest({ Authorization: 'Bearer test-cron-secret' }),
    )
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/synthetic orchestrator failure/)
  })
})
