/**
 * WA.6 — PATCH /api/monthly-report/snapshot { action: 'mark_pdf_exported' }.
 *
 * pdf_exported_at existed since the baseline schema and was read in three
 * places (the snapshot list SELECT, the types, the phase-70 audit script) but
 * written in none — permanently null on every row. The PATCH stamps it.
 *
 * Pins the properties that make the verb safe:
 *   - it is an UPDATE, never an upsert — a PDF export can never create or
 *     rewrite report data, so exporting a FINAL month cannot downgrade it;
 *   - a missing row is updated:false, not an error (pre-WA.6 in-memory reports);
 *   - the R29 verifyBusinessAccess hard-gate applies (service-role client).
 *
 * Mock pattern mirrors monthly-report-idor-gate.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockVerifyBusinessAccess = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: vi.fn(async () => ({ allowed: true, reason: 'test-bypass' })),
}))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({
  enforceSectionPermission: vi.fn(() => null),
}))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))
vi.mock('@/lib/supabase/keys', () => ({
  getSupabaseSecretKey: () => 'test-secret-key',
}))
vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: (...args: any[]) => mockVerifyBusinessAccess(...args),
}))
vi.mock('@/lib/reports/revert-report', () => ({
  revertReportIfApproved: vi.fn(async () => ({ reverted: false })),
}))

// Chainable service-role stub: from().update().eq().eq().select()
const eqChain = { eq: vi.fn(), select: vi.fn() }
eqChain.eq.mockReturnValue(eqChain)
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({ update: mockUpdate })),
  })),
}))

function patchReq(body: unknown) {
  return new NextRequest('http://test.local/api/monthly-report/snapshot', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const VALID = { business_id: 'biz-1', report_month: '2026-07', action: 'mark_pdf_exported' as const }
const authed = { data: { user: { id: 'user-1' } }, error: null }

async function callPatch(body: unknown) {
  const { PATCH } = await import('@/app/api/monthly-report/snapshot/route')
  return PATCH(patchReq(body) as any)
}

beforeEach(() => {
  vi.clearAllMocks()
  eqChain.eq.mockReturnValue(eqChain)
  mockUpdate.mockReturnValue(eqChain)
})

describe('PATCH mark_pdf_exported', () => {
  it('stamps pdf_exported_at on the existing row and reports updated:true', async () => {
    mockGetUser.mockResolvedValue(authed)
    mockVerifyBusinessAccess.mockResolvedValue(true)
    eqChain.select.mockResolvedValue({ data: [{ id: 'snap-1' }], error: null })

    const res = await callPatch(VALID)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.updated).toBe(true)
    expect(typeof json.pdf_exported_at).toBe('string')
    // The write is a narrow update of the stamp columns only — never report
    // data or status, so a FINAL month cannot be touched by an export.
    const patch = mockUpdate.mock.calls[0][0]
    expect(Object.keys(patch).sort()).toEqual(['pdf_exported_at', 'updated_at'])
  })

  it('a month with no snapshot row is updated:false, not an error', async () => {
    mockGetUser.mockResolvedValue(authed)
    mockVerifyBusinessAccess.mockResolvedValue(true)
    eqChain.select.mockResolvedValue({ data: [], error: null })

    const res = await callPatch(VALID)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.updated).toBe(false)
  })

  it('unauthenticated → 401, and no write is attempted', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await callPatch(VALID)
    expect(res.status).toBe(401)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('cross-tenant business_id → 403 from the R29 hard-gate, no write', async () => {
    mockGetUser.mockResolvedValue(authed)
    mockVerifyBusinessAccess.mockResolvedValue(false)
    const res = await callPatch(VALID)
    expect(res.status).toBe(403)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects an unknown action at the schema boundary', async () => {
    mockGetUser.mockResolvedValue(authed)
    mockVerifyBusinessAccess.mockResolvedValue(true)
    const res = await callPatch({ ...VALID, action: 'mark_something_else' })
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
