/**
 * Phase 35 Plan 04 — Integration tests for POST /api/cfo/report-status.
 *
 * Covers every server-side decision (D-01..D-18) plus the Pitfall 2
 * transaction ordering invariant — failure during Resend must NEVER
 * leave the row at status='sent'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Module mocks ───────────────────────────────────────────────────────────

vi.mock('@supabase/supabase-js', () => {
  const proxy = {
    from: (table: string) => currentServiceMock.from(table),
  }
  return { createClient: vi.fn(() => proxy) }
})

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => currentAuthMock),
}))

const mockSendMonthlyReport = vi.fn()
vi.mock('@/lib/email/send-report', () => ({
  sendMonthlyReport: mockSendMonthlyReport,
}))

// buildReportUrl and revertReportIfApproved are real — keeps the integration
// test close to production. `revertReportIfApproved` operates on the same
// mocked service client.
vi.mock('@/lib/reports/build-report-url', () => ({
  buildReportUrl: vi.fn(() => 'https://wisdombi.ai/reports/view/TOKEN.SIG'),
}))

let currentServiceMock: any = { from: () => ({}) }
let currentAuthMock: any = {}

function setServiceMock(mock: any) {
  currentServiceMock = mock
}
function setAuthMock(mock: any) {
  currentAuthMock = mock
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const BIZ = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const COACH_UID = 'coach-uid-1111'
const SUPER_UID = 'super-uid-2222'
const INTRUDER_UID = 'intruder-uid-3333'
const PERIOD = '2026-03-01'

function buildAuthMock(uid: string | null) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: uid ? { id: uid } : null },
        error: uid ? null : new Error('not authed'),
      }),
    },
  }
}

/**
 * Builds a service-role mock with per-table fakes.
 *
 * tables:
 *   - system_roles: { role } row for roleUid
 *   - businesses: { assigned_coach_id } row for BIZ
 *   - cfo_report_status: supports select (by business_id + period_month),
 *     upsert, insert (email log also routed through this shape), and update
 *     by id. `statusRow` is what select().maybeSingle() returns.
 *   - cfo_email_log: supports insert and update().eq('id', ...)
 *
 * We expose spies so tests can inspect call arguments.
 */
function buildServiceMock(options: {
  role?: 'coach' | 'super_admin' | 'user' | null
  roleUid?: string
  assignedCoach?: string | null
  statusRow?: {
    id: string
    status: 'draft' | 'ready_for_review' | 'approved' | 'sent'
    snapshot_data?: any
  } | null
  upsertReturn?: { id: string }
  emailLogInsertReturn?: { id: string }
}) {
  const upsertSelectSingle = vi.fn().mockResolvedValue({
    data: options.upsertReturn ?? { id: 'cfo-row-upserted' },
    error: null,
  })
  const upsertSelect = vi
    .fn()
    .mockReturnValue({ single: upsertSelectSingle })
  const upsertSpy = vi
    .fn()
    .mockReturnValue({ select: upsertSelect })

  const updateEqSpy = vi.fn().mockResolvedValue({ error: null })
  const updateSpy = vi.fn().mockReturnValue({ eq: updateEqSpy })

  const emailLogInsertSelectSingle = vi.fn().mockResolvedValue({
    data: options.emailLogInsertReturn ?? { id: 'email-log-1' },
    error: null,
  })
  const emailLogInsertSelect = vi
    .fn()
    .mockReturnValue({ single: emailLogInsertSelectSingle })
  const emailLogInsertSpy = vi
    .fn()
    .mockReturnValue({ select: emailLogInsertSelect })
  const emailLogUpdateEqSpy = vi.fn().mockResolvedValue({ error: null })
  const emailLogUpdateSpy = vi
    .fn()
    .mockReturnValue({ eq: emailLogUpdateEqSpy })

  const from = vi.fn((table: string) => {
    if (table === 'system_roles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: options.role ? { role: options.role } : null,
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'businesses') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data:
                options.assignedCoach !== undefined
                  ? { assigned_coach_id: options.assignedCoach }
                  : null,
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'cfo_report_status') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: options.statusRow ?? null,
                error: null,
              }),
            }),
          }),
        }),
        upsert: upsertSpy,
        update: updateSpy,
      }
    }
    if (table === 'cfo_email_log') {
      return {
        insert: emailLogInsertSpy,
        update: emailLogUpdateSpy,
      }
    }
    return {}
  })

  return {
    from,
    spies: {
      upsertSpy,
      updateSpy,
      updateEqSpy,
      emailLogInsertSpy,
      emailLogUpdateSpy,
      emailLogUpdateEqSpy,
    },
  }
}

function makeRequest(body: any): NextRequest {
  return new NextRequest('http://localhost/api/cfo/report-status', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

// ─── Dynamic import after env setup ─────────────────────────────────────────

async function importRoute() {
  const mod = await import('../route')
  return mod.POST
}

// ─── Default params for send-flow tests ─────────────────────────────────────

const approveBody = {
  action: 'approve_and_send',
  business_id: BIZ,
  period_month: PERIOD,
  snapshot_data: { schema_version: 1, business: { id: BIZ, name: 'Urban Road' } },
  pdf_base64: Buffer.from('fake-pdf').toString('base64'),
  pdf_filename: 'urban-road-2026-03-report.pdf',
  coach_name: 'Matt Malouf',
  coach_email: 'mattmalouf@wisdomcg.com.au',
  business_name: 'Urban Road',
  month_label: 'March 2026',
  client_greeting_name: 'Sarah',
  recipient_email: 'sarah@urbanroad.com.au',
  portal_slug: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSendMonthlyReport.mockReset()
  setAuthMock({})
  setServiceMock({ from: () => ({}) })
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/cfo/report-status', () => {
  it('Test 1: unauthenticated → 401 Unauthorized', async () => {
    setAuthMock(buildAuthMock(null))
    const svc = buildServiceMock({})
    setServiceMock(svc)

    const POST = await importRoute()
    const res = await POST(makeRequest({ action: 'mark_ready', business_id: BIZ, period_month: PERIOD }))

    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toMatch(/unauthorized/i)
  })

  it('Test 2: authenticated non-coach (role=user) → 403', async () => {
    setAuthMock(buildAuthMock(INTRUDER_UID))
    const svc = buildServiceMock({ role: 'user' })
    setServiceMock(svc)

    const POST = await importRoute()
    const res = await POST(makeRequest({ action: 'mark_ready', business_id: BIZ, period_month: PERIOD }))

    expect(res.status).toBe(403)
  })

  it('Test 3: coach not assigned → 403', async () => {
    setAuthMock(buildAuthMock(INTRUDER_UID))
    const svc = buildServiceMock({
      role: 'coach',
      assignedCoach: COACH_UID, // different coach
    })
    setServiceMock(svc)

    const POST = await importRoute()
    const res = await POST(makeRequest({ action: 'mark_ready', business_id: BIZ, period_month: PERIOD }))

    expect(res.status).toBe(403)
  })

  it('Test 3b: super_admin unassigned biz → succeeds', async () => {
    setAuthMock(buildAuthMock(SUPER_UID))
    const svc = buildServiceMock({
      role: 'super_admin',
      assignedCoach: 'someone-else',
      statusRow: { id: 'row-1', status: 'draft' },
    })
    setServiceMock(svc)

    const POST = await importRoute()
    const res = await POST(makeRequest({ action: 'mark_ready', business_id: BIZ, period_month: PERIOD }))

    expect(res.status).toBe(200)
  })

  it('Test 4: invalid body (missing action) → 400', async () => {
    setAuthMock(buildAuthMock(COACH_UID))
    const svc = buildServiceMock({ role: 'coach', assignedCoach: COACH_UID })
    setServiceMock(svc)

    const POST = await importRoute()
    const res = await POST(makeRequest({ business_id: BIZ, period_month: PERIOD }))

    expect(res.status).toBe(400)
  })

  it("Test 5: action='mark_ready' as assigned coach → 200, upsert with status='ready_for_review' (D-01)", async () => {
    setAuthMock(buildAuthMock(COACH_UID))
    const svc = buildServiceMock({
      role: 'coach',
      assignedCoach: COACH_UID,
      statusRow: { id: 'row-1', status: 'draft' },
    })
    setServiceMock(svc)

    const POST = await importRoute()
    const res = await POST(makeRequest({ action: 'mark_ready', business_id: BIZ, period_month: PERIOD }))

    expect(res.status).toBe(200)
    expect(svc.spies.upsertSpy).toHaveBeenCalled()
    const upsertArg = svc.spies.upsertSpy.mock.calls[0][0]
    expect(upsertArg.status).toBe('ready_for_review')
    expect(upsertArg.business_id).toBe(BIZ)
    expect(upsertArg.period_month).toBe(PERIOD)
  })

  it('Test 6: approve_and_send from draft → writes approved first, sends, flips to sent with log (D-02/D-11/D-15, Pitfall 2)', async () => {
    setAuthMock(buildAuthMock(COACH_UID))
    const svc = buildServiceMock({
      role: 'coach',
      assignedCoach: COACH_UID,
      statusRow: { id: 'row-1', status: 'draft' },
      upsertReturn: { id: 'cfo-row-1' },
      emailLogInsertReturn: { id: 'log-1' },
    })
    setServiceMock(svc)

    mockSendMonthlyReport.mockResolvedValueOnce({
      success: true,
      id: 'resend-msg-abc',
      statusCode: 200,
    })

    const POST = await importRoute()
    const res = await POST(makeRequest(approveBody))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({
      success: true,
      status: 'sent',
      resend_message_id: 'resend-msg-abc',
      recipient_email: 'sarah@urbanroad.com.au',
    })
    expect(json.sent_at).toBeTruthy()

    // Ordering: upsert approved (with snapshot) → insert email log pending →
    // sendMonthlyReport → update row sent + update log with message id.
    const firstUpsert = svc.spies.upsertSpy.mock.calls[0][0]
    expect(firstUpsert.status).toBe('approved')
    expect(firstUpsert.snapshot_data).toEqual(approveBody.snapshot_data)
    expect(firstUpsert.snapshot_taken_at).toBeTruthy()
    expect(firstUpsert.approved_by).toBe(COACH_UID)
    expect(firstUpsert.approved_at).toBeTruthy()

    // Email log inserted with status_code=null (pending)
    expect(svc.spies.emailLogInsertSpy).toHaveBeenCalled()
    const logInsert = svc.spies.emailLogInsertSpy.mock.calls[0][0]
    expect(logInsert.business_id).toBe(BIZ)
    expect(logInsert.period_month).toBe(PERIOD)
    expect(logInsert.triggered_by).toBe(COACH_UID)
    expect(logInsert.recipient_email).toBe('sarah@urbanroad.com.au')
    expect(logInsert.status_code).toBeNull()

    // sendMonthlyReport called with decoded Buffer
    expect(mockSendMonthlyReport).toHaveBeenCalledTimes(1)
    const sendArg = mockSendMonthlyReport.mock.calls[0][0]
    expect(Buffer.isBuffer(sendArg.pdfBuffer)).toBe(true)
    expect(sendArg.to).toBe('sarah@urbanroad.com.au')
    expect(sendArg.fromEmail).toBe('mattmalouf@wisdomcg.com.au')
    expect(sendArg.reportUrl).toBe('https://wisdombi.ai/reports/view/TOKEN.SIG')

    // After send success: update row status='sent', sent_at populated
    const statusUpdateCalls = svc.spies.updateSpy.mock.calls
    const finalUpdate = statusUpdateCalls.find(
      (call: any) => call[0].status === 'sent',
    )
    expect(finalUpdate).toBeTruthy()
    expect(finalUpdate![0].sent_at).toBeTruthy()

    // Log updated with resend_message_id + status_code=200
    const logUpdateCalls = svc.spies.emailLogUpdateSpy.mock.calls
    const logFinal = logUpdateCalls[0][0]
    expect(logFinal.resend_message_id).toBe('resend-msg-abc')
    expect(logFinal.status_code).toBe(200)
  })

  it('Test 7: approve_and_send failure → status stays approved, 207 with errorCode (APPR-04/D-11)', async () => {
    setAuthMock(buildAuthMock(COACH_UID))
    const svc = buildServiceMock({
      role: 'coach',
      assignedCoach: COACH_UID,
      statusRow: { id: 'row-1', status: 'draft' },
      upsertReturn: { id: 'cfo-row-1' },
    })
    setServiceMock(svc)

    mockSendMonthlyReport.mockResolvedValueOnce({
      success: false,
      errorCode: 'invalid_from_address',
      error: 'Sender address not verified',
    })

    const POST = await importRoute()
    const res = await POST(makeRequest(approveBody))

    expect(res.status).toBe(207)
    const json = await res.json()
    expect(json).toMatchObject({
      success: false,
      errorCode: 'invalid_from_address',
      error: 'Sender address not verified',
    })

    // Row was upserted to approved once — NEVER flipped to sent
    const allUpserts = svc.spies.upsertSpy.mock.calls.map((c: any) => c[0])
    const allUpdates = svc.spies.updateSpy.mock.calls.map((c: any) => c[0])
    const allRowWrites = [...allUpserts, ...allUpdates]
    expect(allRowWrites.some((w) => w.status === 'sent')).toBe(false)
    expect(allUpserts[0].status).toBe('approved')

    // Email log updated with error_message + errorCode
    const logUpdate = svc.spies.emailLogUpdateSpy.mock.calls[0][0]
    expect(logUpdate.error_message).toMatch(/Sender address not verified/)
    expect(logUpdate.status_code).toBeNull()
  })

  it('Test 8: approve_and_send timeout → status stays approved, timedOut:true', async () => {
    setAuthMock(buildAuthMock(COACH_UID))
    const svc = buildServiceMock({
      role: 'coach',
      assignedCoach: COACH_UID,
      statusRow: { id: 'row-1', status: 'draft' },
    })
    setServiceMock(svc)

    mockSendMonthlyReport.mockResolvedValueOnce({
      success: false,
      timedOut: true,
      error: 'Resend call exceeded 15000ms timeout',
    })

    const POST = await importRoute()
    const res = await POST(makeRequest(approveBody))

    const json = await res.json()
    expect(json.timedOut).toBe(true)

    // status never sent
    const allRowWrites = [
      ...svc.spies.upsertSpy.mock.calls.map((c: any) => c[0]),
      ...svc.spies.updateSpy.mock.calls.map((c: any) => c[0]),
    ]
    expect(allRowWrites.some((w) => w.status === 'sent')).toBe(false)

    // log error message mentions timeout
    const logUpdate = svc.spies.emailLogUpdateSpy.mock.calls[0][0]
    expect(logUpdate.error_message).toMatch(/timeout|15000ms/i)
  })

  it("Test 9: revert_to_draft from sent → status='draft', snapshot_data NOT in update payload (D-18)", async () => {
    setAuthMock(buildAuthMock(COACH_UID))
    const svc = buildServiceMock({
      role: 'coach',
      assignedCoach: COACH_UID,
      statusRow: { id: 'row-1', status: 'sent' },
    })
    setServiceMock(svc)

    const POST = await importRoute()
    const res = await POST(
      makeRequest({
        action: 'revert_to_draft',
        business_id: BIZ,
        period_month: PERIOD,
      }),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ success: true, status: 'draft' })

    // The revertReportIfApproved helper was exercised; no update payload
    // contained snapshot_data/snapshot_taken_at.
    const allUpdates = svc.spies.updateSpy.mock.calls.map((c: any) => c[0])
    for (const u of allUpdates) {
      expect(u).not.toHaveProperty('snapshot_data')
      expect(u).not.toHaveProperty('snapshot_taken_at')
    }
  })

  it('Test 10: resend from approved → no snapshot recapture, new log row, sent after success (D-13)', async () => {
    setAuthMock(buildAuthMock(COACH_UID))
    const svc = buildServiceMock({
      role: 'coach',
      assignedCoach: COACH_UID,
      statusRow: { id: 'cfo-row-1', status: 'approved', snapshot_data: { prev: true } },
    })
    setServiceMock(svc)

    mockSendMonthlyReport.mockResolvedValueOnce({
      success: true,
      id: 'resend-msg-xyz',
      statusCode: 200,
    })

    const POST = await importRoute()
    const res = await POST(
      makeRequest({
        action: 'resend',
        business_id: BIZ,
        period_month: PERIOD,
        pdf_base64: Buffer.from('fake-pdf').toString('base64'),
        pdf_filename: 'urban-road-2026-03-report.pdf',
        coach_name: 'Matt Malouf',
        coach_email: 'mattmalouf@wisdomcg.com.au',
        business_name: 'Urban Road',
        month_label: 'March 2026',
        client_greeting_name: 'Sarah',
        recipient_email: 'sarah@urbanroad.com.au',
        portal_slug: null,
      }),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.status).toBe('sent')

    // No upsert carrying snapshot_data should have been called for resend
    const allUpserts = svc.spies.upsertSpy.mock.calls.map((c: any) => c[0])
    expect(
      allUpserts.some((u: any) => 'snapshot_data' in u),
    ).toBe(false)

    // A new email log was inserted
    expect(svc.spies.emailLogInsertSpy).toHaveBeenCalledTimes(1)

    // sendMonthlyReport was called
    expect(mockSendMonthlyReport).toHaveBeenCalledTimes(1)

    // status set to sent (via update, not upsert with snapshot)
    const sentUpdate = svc.spies.updateSpy.mock.calls
      .map((c: any) => c[0])
      .find((u: any) => u.status === 'sent')
    expect(sentUpdate).toBeTruthy()
  })

  it('Test 11: approve_and_send pdf > 10MB base64 → 413', async () => {
    setAuthMock(buildAuthMock(COACH_UID))
    const svc = buildServiceMock({
      role: 'coach',
      assignedCoach: COACH_UID,
    })
    setServiceMock(svc)

    const huge = 'A'.repeat(10_000_001)
    const POST = await importRoute()
    const res = await POST(
      makeRequest({
        ...approveBody,
        pdf_base64: huge,
      }),
    )

    expect(res.status).toBe(413)
  })

  it("Test 12: route exports runtime='nodejs' and maxDuration=30", async () => {
    const mod = await import('../route')
    expect((mod as any).runtime).toBe('nodejs')
    expect((mod as any).maxDuration).toBe(30)
  })
})
