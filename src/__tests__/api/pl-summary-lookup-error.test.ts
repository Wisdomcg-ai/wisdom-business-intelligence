/**
 * Hotfix regression test — Issue B from `step2-hard-refresh-data-loss.md`.
 *
 * Bug (TERTIARY, MEDIUM severity, JDS-specific):
 *   When a tenant's businesses.id vs business_profiles.id mismatch causes
 *   the Xero connection lookup to fail, /api/Xero/pl-summary returned 200
 *   with `has_xero_data: false` and the wizard treated that as "Xero not
 *   connected" instead of "lookup error" — silently. Per memory note
 *   `project_dual_id`, this is a known multi-format lookup issue.
 *
 * Fix (visibility only — does NOT touch resolver itself):
 *   The route now distinguishes "no connection found" (existing behavior)
 *   from "lookup failed because resolver found a profile/business mapping
 *   but no xero_connections row" by adding a `lookup_error: string | null`
 *   field on the response when the latter case fires.
 *
 *   The resolver returns `{ connectionBusinessId, connection }`. When the
 *   queried businessId !== connectionBusinessId AND connection is null,
 *   that means the resolver successfully crossed a business/profile
 *   mapping but the corresponding xero_connections row is missing — the
 *   dual-id desync signature.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Phase 46-04 SEC-07 sweep: pl-summary/route.ts now imports @sentry/nextjs
// for error capture. Mock per-file to keep forecast-read-service.test.ts
// shape assertions intact (RESEARCH.md SEC-07 cross-cutting).
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user-1' } },
        error: null,
      })),
    },
    // Not used directly — resolveXeroBusinessId is its own mock and
    // getHistoricalSummary is never reached on the no-connection path.
    from: vi.fn(),
  })),
}))

vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: vi.fn(async () => true),
}))

const resolveXeroBusinessIdMock = vi.fn()
vi.mock('@/lib/utils/resolve-xero-business-id', () => ({
  resolveXeroBusinessId: (...args: unknown[]) => resolveXeroBusinessIdMock(...args),
}))

// getHistoricalSummary should not be called on the no-connection path.
const getHistoricalSummaryMock = vi.fn()
vi.mock('@/lib/services/historical-pl-summary', () => ({
  getHistoricalSummary: (...args: unknown[]) => getHistoricalSummaryMock(...args),
}))

// Import AFTER vi.mock declarations so the route picks up the mocks.
import { GET } from '@/app/api/Xero/pl-summary/route'

beforeEach(() => {
  resolveXeroBusinessIdMock.mockReset()
  getHistoricalSummaryMock.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

function makeRequest(businessId = 'biz-1', fiscalYear = 2026): NextRequest {
  const url = `http://localhost/api/Xero/pl-summary?business_id=${businessId}&fiscal_year=${fiscalYear}`
  return new NextRequest(url)
}

describe('Issue B — pl-summary surfaces lookup_error on dual-id desync', () => {
  it('returns lookup_error when resolver found a mapping but connection is null (queried id !== connectionBusinessId)', async () => {
    // Resolver crossed a profile/business mapping (connectionBusinessId is
    // the OTHER form, e.g. business_profiles.id) but no xero_connections row
    // exists for either side — the dual-id desync signature.
    resolveXeroBusinessIdMock.mockResolvedValue({
      connectionBusinessId: 'profile-uuid-not-equal-to-biz-1',
      connection: null,
    })

    const res = await GET(makeRequest('biz-1'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.summary.has_xero_data).toBe(false)
    // The signal: lookup_error present + non-null.
    expect(body.summary.lookup_error).toBeTruthy()
    expect(typeof body.summary.lookup_error).toBe('string')
    expect(body.summary.lookup_error).toContain('xero_connection_lookup_failed')
    // getHistoricalSummary must NOT be called — we short-circuited on
    // the no-connection branch.
    expect(getHistoricalSummaryMock).not.toHaveBeenCalled()
  })

  it('returns lookup_error: null when resolver returns null connection AND queried id matches (genuine no-connection)', async () => {
    // No business/profile mapping found — resolver returns the same id back
    // with null connection. This is the LEGITIMATE "tenant has no Xero"
    // state. lookup_error must be null so the wizard does NOT show the
    // "couldn't load" toast for tenants that just haven't connected.
    resolveXeroBusinessIdMock.mockResolvedValue({
      connectionBusinessId: 'biz-1',
      connection: null,
    })

    const res = await GET(makeRequest('biz-1'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.summary.has_xero_data).toBe(false)
    expect(body.summary.lookup_error).toBeNull()
    expect(getHistoricalSummaryMock).not.toHaveBeenCalled()
  })

  it('does NOT set lookup_error when connection is found (happy path delegates to getHistoricalSummary)', async () => {
    resolveXeroBusinessIdMock.mockResolvedValue({
      connectionBusinessId: 'biz-1',
      connection: { id: 'conn-1', tenant_id: 'tenant-A' },
    })
    getHistoricalSummaryMock.mockResolvedValue({
      has_xero_data: true,
      prior_fy: { total_revenue: 1_000_000 },
      data_quality: 'verified',
    })

    const res = await GET(makeRequest('biz-1'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.summary.has_xero_data).toBe(true)
    // lookup_error is undefined / not present — only set on the no-connection
    // branch. Wizard should not show the "couldn't load" toast.
    expect(body.summary.lookup_error).toBeUndefined()
    expect(getHistoricalSummaryMock).toHaveBeenCalledTimes(1)
  })
})
