/**
 * WD.8 — memo storage contract on the snapshot route.
 *
 *   - PATCH set_memo is a targeted UPDATE: writes coach_notes, empty→null,
 *     updated:false when no snapshot row exists (memo never goes nowhere
 *     silently).
 *   - POST wipe-guard: the regenerate path never sends coach_notes, and the
 *     upsert payload must NOT contain the key then — including it as null
 *     would wipe the saved memo on every regenerate. Explicit null clears.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockVerifyBusinessAccess = vi.fn()
const mockAdminFrom = vi.fn()

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
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: (...args: any[]) => mockAdminFrom(...args) })),
}))
vi.mock('@/lib/reports/revert-report', () => ({
  revertReportIfApproved: vi.fn(async () => ({ reverted: false })),
}))
// #429 (CFO production board) stamps the cycle's Generated stage inside the
// snapshot POST — isolate it so this suite pins only the snapshot upsert.
vi.mock('@/lib/reports/cycle-stages', () => ({
  periodMonthFromReportMonth: vi.fn(() => null),
  stampGeneratedFirst: vi.fn(async () => null),
}))
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

import { PATCH, POST } from '@/app/api/monthly-report/snapshot/route'

function patchReq(body: any) {
  return new NextRequest('http://test.local/api/monthly-report/snapshot', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}
function postReq(body: any) {
  return new NextRequest('http://test.local/api/monthly-report/snapshot', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Thenable query-builder capturing update/upsert payloads. */
function chain(result: { data: any; error: any }) {
  const q: any = { calls: {} }
  for (const m of ['select', 'eq', 'update', 'upsert', 'maybeSingle', 'single']) {
    q[m] = vi.fn((...args: any[]) => {
      q.calls[m] = args
      return q
    })
  }
  q.then = (resolve: any) => resolve(result)
  return q
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local'
  mockGetUser.mockReset()
  mockVerifyBusinessAccess.mockReset()
  mockAdminFrom.mockReset()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  mockVerifyBusinessAccess.mockResolvedValue(true)
})

const BASE = { business_id: 'biz-1', report_month: '2026-07' }

describe('WD.8 — PATCH set_memo', () => {
  it('writes coach_notes via a targeted UPDATE and reports updated:true', async () => {
    const q = chain({ data: [{ id: 'snap-1' }], error: null })
    mockAdminFrom.mockReturnValue(q)
    const res = await PATCH(patchReq({ ...BASE, action: 'set_memo', memo: 'Insurance jumped because…' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(true)
    expect(q.calls.update[0]).toMatchObject({ coach_notes: 'Insurance jumped because…' })
    // Targeted: never touches report_data or status.
    expect(Object.keys(q.calls.update[0])).toEqual(['coach_notes', 'updated_at'])
  })

  it('an empty/whitespace memo stores NULL, not an empty string', async () => {
    const q = chain({ data: [{ id: 'snap-1' }], error: null })
    mockAdminFrom.mockReturnValue(q)
    await PATCH(patchReq({ ...BASE, action: 'set_memo', memo: '   ' }))
    expect(q.calls.update[0].coach_notes).toBeNull()
  })

  it('no snapshot row → updated:false (the caller must surface this, not drop the memo)', async () => {
    const q = chain({ data: [], error: null })
    mockAdminFrom.mockReturnValue(q)
    const res = await PATCH(patchReq({ ...BASE, action: 'set_memo', memo: 'x' }))
    const body = await res.json()
    expect(body.updated).toBe(false)
  })

  it('a non-string non-null memo is a 400', async () => {
    const res = await PATCH(patchReq({ ...BASE, action: 'set_memo', memo: 42 }))
    expect(res.status).toBe(400)
  })
})

describe('WD.8 — POST wipe-guard on coach_notes', () => {
  const fullBody = {
    ...BASE,
    fiscal_year: 2027,
    report_data: { some: 'report' },
    summary: { some: 'summary' },
  }

  it('a save WITHOUT coach_notes omits the key from the upsert — regenerate cannot wipe a memo', async () => {
    const q = chain({ data: { id: 'snap-1' }, error: null })
    mockAdminFrom.mockReturnValue(q)
    const res = await POST(postReq(fullBody))
    expect(res.status).toBe(200)
    expect('coach_notes' in q.calls.upsert[0]).toBe(false)
  })

  it('an explicit coach_notes still writes (and empty clears to null)', async () => {
    const q = chain({ data: { id: 'snap-1' }, error: null })
    mockAdminFrom.mockReturnValue(q)
    await POST(postReq({ ...fullBody, coach_notes: 'keep this' }))
    expect(q.calls.upsert[0].coach_notes).toBe('keep this')

    const q2 = chain({ data: { id: 'snap-1' }, error: null })
    mockAdminFrom.mockReturnValue(q2)
    await POST(postReq({ ...fullBody, coach_notes: '' }))
    expect(q2.calls.upsert[0].coach_notes).toBeNull()
  })
})
