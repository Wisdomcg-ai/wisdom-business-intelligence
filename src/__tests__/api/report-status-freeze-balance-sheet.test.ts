/**
 * Package B — the balance sheet a client is sent is the balance sheet every
 * later copy of that month prints. The report-status route's half.
 *
 *   - approve_and_send keeps the two sheets the sent PDF printed in the
 *     approval's snapshot_data, written after the approval has saved and
 *     before the email goes — so a resend of an 'approved' row that failed to
 *     send finds them too.
 *   - It never stands between the coach and the send: half a sheet, or a write
 *     that does not land, is captured under invariant balance-sheet-freeze
 *     with stage approve_and_send, and the email still goes.
 *   - It never touches monthly_report_snapshots — a Finalise freeze stays
 *     exactly as it was.
 *   - revert_to_draft is the deliberate reopen: the sent copy is marked
 *     reopened (kept as the record of what was sent), the rest of
 *     snapshot_data untouched (D-18). On a month a save already flipped back
 *     to draft it only reopens; a reopen that does not land fails the action.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockAdminFrom = vi.fn()
const captureException = vi.fn()
const captureMessage = vi.fn()
const mockSendMonthlyReport = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: (...args: any[]) => mockAdminFrom(...args) })),
}))
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: () => 'test-secret-key' }))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'coach-1' } }, error: null }) },
  })),
}))
vi.mock('@/lib/email/send-report', () => ({ sendMonthlyReport: (...a: unknown[]) => mockSendMonthlyReport(...a) }))
vi.mock('@/lib/reports/build-report-url', () => ({ buildReportUrl: vi.fn(() => 'https://wisdombi.ai/reports/view/T') }))
vi.mock('@sentry/nextjs', () => ({
  captureException: (...a: unknown[]) => captureException(...a),
  captureMessage: (...a: unknown[]) => captureMessage(...a),
}))

import { POST } from '@/app/api/cfo/report-status/route'
import fixture from '@/lib/monthly-report/__tests__/fixtures/urban-road-bs-aug-2026.json'
import { buildBalanceSheetData, balanceSheetDates, type XeroBalanceSheetReport } from '@/lib/monthly-report/balance-sheet-rows'
import { FROZEN_BALANCE_SHEETS_KEY } from '@/lib/monthly-report/balance-sheet-freeze'

const BIZ = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
const reports = fixture.reports as Record<string, { Reports: XeroBalanceSheetReport[] }>
const sheet = (compare: 'mom' | 'yoy') => {
  const d = balanceSheetDates('2026-08', compare)
  return buildBalanceSheetData({
    businessId: BIZ, compare, currentDate: d.current, priorDate: d.prior,
    current: reports[d.current].Reports[0], prior: reports[d.prior].Reports[0], accounts: null,
  })
}
const mom = sheet('mom')
const yoy = sheet('yoy')

/** One query chain: records every call and resolves to `result`. */
function chain(result: { data: any; error: any }) {
  const q: any = { eqs: [] as [string, unknown][] }
  for (const m of ['select', 'update', 'upsert', 'insert', 'maybeSingle', 'single', 'is']) {
    q[m] = vi.fn((...args: any[]) => {
      q[`${m}Args`] = args
      return q
    })
  }
  q.eq = vi.fn((column: string, value: unknown) => {
    q.eqs.push([column, value])
    return q
  })
  q.then = (resolve: any) => resolve(result)
  return q
}

/** Per-table queues of chains, handed out in call order; a table with no queue gets an empty answer. */
function tables(queues: Record<string, any[]>) {
  const handedOut: Record<string, any[]> = {}
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'system_roles') return chain({ data: { role: 'coach' }, error: null })
    if (table === 'businesses') return chain({ data: { assigned_coach_id: 'coach-1' }, error: null })
    const next = queues[table]?.shift() ?? chain({ data: null, error: null })
    ;(handedOut[table] ??= []).push(next)
    return next
  })
  return handedOut
}

function req(body: unknown) {
  return new NextRequest('http://test.local/api/cfo/report-status', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const snapshotData = {
  schema_version: 1,
  business: { id: BIZ, name: 'Urban Road' },
  period: { month: '2026-08-01', fiscal_year: 2027, label: 'August 2026' },
  report: { report_month: '2026-08', summary: { revenue: { actual: 1 } } },
  commentary: null,
}
const approveBody = {
  action: 'approve_and_send',
  business_id: BIZ,
  period_month: '2026-08-01',
  snapshot_data: snapshotData,
  pdf_base64: Buffer.from('pdf').toString('base64'),
  pdf_filename: 'urban-road-2026-08-report.pdf',
  coach_name: 'Matt Malouf',
  coach_email: 'coach@example.com',
  business_name: 'Urban Road',
  month_label: 'August 2026',
  client_greeting_name: 'Andrea',
  recipient_email: 'owner@example.com',
  portal_slug: null,
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local'
  mockAdminFrom.mockReset()
  captureException.mockReset()
  captureMessage.mockReset()
  mockSendMonthlyReport.mockReset()
  mockSendMonthlyReport.mockResolvedValue({ success: true, id: 'msg-1', statusCode: 200 })
})

describe('approve_and_send keeps the sheets the sent PDF printed', () => {
  it('from draft: the approval saves, the two sheets are written into its snapshot_data, and only then the email goes', async () => {
    const order: string[] = []
    const approve = chain({ data: { id: 'status-1' }, error: null })
    const freeze = chain({ data: null, error: null })
    freeze.update.mockImplementation((...args: any[]) => {
      order.push('freeze')
      freeze.updateArgs = args
      return freeze
    })
    const sent = chain({ data: null, error: null })
    const handedOut = tables({
      cfo_report_status: [approve, freeze, sent],
      cfo_email_log: [chain({ data: { id: 'log-1' }, error: null }), chain({ data: null, error: null })],
    })
    mockSendMonthlyReport.mockImplementation(async () => {
      order.push('send')
      return { success: true, id: 'msg-1', statusCode: 200 }
    })

    const res = await POST(req({ ...approveBody, balance_sheets: { mom, yoy } }))
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('sent')

    // The approval itself is written exactly as before.
    expect(approve.upsertArgs[0].snapshot_data).toEqual(snapshotData)
    // Then the sent copy, beside the rest of the snapshot, on the approved row.
    const written = freeze.updateArgs[0].snapshot_data
    expect(written).toMatchObject(snapshotData)
    expect(written[FROZEN_BALANCE_SHEETS_KEY]).toEqual({
      frozen_at: approve.upsertArgs[0].approved_at,
      report_month: '2026-08',
      mom,
      yoy,
    })
    expect(freeze.eqs).toEqual([['id', 'status-1']])
    expect(order).toEqual(['freeze', 'send'])
    // A Finalise freeze lives in monthly_report_snapshots, and the send never goes there.
    expect(handedOut.monthly_report_snapshots).toBeUndefined()
    expect(captureException).not.toHaveBeenCalled()
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it('a freeze write that fails still sends — and is captured with stage approve_and_send', async () => {
    const approve = chain({ data: { id: 'status-1' }, error: null })
    const freeze = chain({ data: null, error: { message: 'statement timeout' } })
    tables({
      cfo_report_status: [approve, freeze, chain({ data: null, error: null })],
      cfo_email_log: [chain({ data: { id: 'log-1' }, error: null }), chain({ data: null, error: null })],
    })

    const res = await POST(req({ ...approveBody, balance_sheets: { mom, yoy } }))
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('sent')
    expect(mockSendMonthlyReport).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(
      { message: 'statement timeout' },
      expect.objectContaining({ tags: expect.objectContaining({ invariant: 'balance-sheet-freeze', stage: 'approve_and_send' }) }),
    )
  })

  it('a write that throws still sends', async () => {
    const approve = chain({ data: { id: 'status-1' }, error: null })
    const freeze = chain({ data: null, error: null })
    freeze.update.mockImplementation(() => { throw new Error('socket hang up') })
    tables({
      cfo_report_status: [approve, freeze, chain({ data: null, error: null })],
      cfo_email_log: [chain({ data: { id: 'log-1' }, error: null }), chain({ data: null, error: null })],
    })

    const res = await POST(req({ ...approveBody, balance_sheets: { mom, yoy } }))
    expect(res.status).toBe(200)
    expect(mockSendMonthlyReport).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: expect.objectContaining({ invariant: 'balance-sheet-freeze', stage: 'approve_and_send' }) }),
    )
  })

  it('a PDF that printed a reason where a sheet should be freezes neither — says so, and sends', async () => {
    const approve = chain({ data: { id: 'status-1' }, error: null })
    const next = chain({ data: null, error: null })
    tables({
      cfo_report_status: [approve, next],
      cfo_email_log: [chain({ data: { id: 'log-1' }, error: null }), chain({ data: null, error: null })],
    })

    const res = await POST(req({ ...approveBody, balance_sheets: { mom, yoy: null } }))
    expect(res.status).toBe(200)
    expect(mockSendMonthlyReport).toHaveBeenCalledTimes(1)
    // The only update after the approval is the flip to sent.
    expect(next.updateArgs[0]).toMatchObject({ status: 'sent' })
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('not frozen at send'),
      expect.objectContaining({
        level: 'warning',
        tags: expect.objectContaining({ invariant: 'balance-sheet-freeze', stage: 'approve_and_send' }),
        extra: expect.objectContaining({ mom: true, yoy: false }),
      }),
    )
  })

  it('a sheet of another month is not frozen under this one', async () => {
    const approve = chain({ data: { id: 'status-1' }, error: null })
    const next = chain({ data: null, error: null })
    tables({
      cfo_report_status: [approve, next],
      cfo_email_log: [chain({ data: { id: 'log-1' }, error: null }), chain({ data: null, error: null })],
    })
    await POST(req({ ...approveBody, period_month: '2026-09-01', balance_sheets: { mom, yoy } }))
    expect(next.updateArgs[0]).toMatchObject({ status: 'sent' })
    expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining('not frozen at send'), expect.anything())
  })

  it('a pack with no balance sheet page sends exactly as before: no freeze write, nothing captured', async () => {
    const approve = chain({ data: { id: 'status-1' }, error: null })
    const next = chain({ data: null, error: null })
    tables({
      cfo_report_status: [approve, next],
      cfo_email_log: [chain({ data: { id: 'log-1' }, error: null }), chain({ data: null, error: null })],
    })
    const res = await POST(req(approveBody))
    expect(res.status).toBe(200)
    expect(next.updateArgs[0]).toMatchObject({ status: 'sent' })
    expect(captureMessage).not.toHaveBeenCalled()
    expect(captureException).not.toHaveBeenCalled()
  })
})

describe('revert_to_draft is the deliberate reopen', () => {
  const frozen = { frozen_at: '2026-09-15T01:00:00.000Z', report_month: '2026-08', mom, yoy }
  const TAKEN_AT = '2026-09-15T01:00:00.000Z'

  it('marks the sent copy reopened, keeps it and the rest of snapshot_data, guarded on the approval it read', async () => {
    const revertRead = chain({ data: { id: 'status-1', status: 'sent' }, error: null })
    const revertWrite = chain({ data: null, error: null })
    const reopenRead = chain({
      data: { id: 'status-1', snapshot_data: { ...snapshotData, [FROZEN_BALANCE_SHEETS_KEY]: frozen }, snapshot_taken_at: TAKEN_AT },
      error: null,
    })
    const reopenWrite = chain({ data: [{ id: 'status-1' }], error: null })
    tables({ cfo_report_status: [revertRead, revertWrite, reopenRead, reopenWrite] })

    const res = await POST(req({ action: 'revert_to_draft', business_id: BIZ, period_month: '2026-08-01' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, status: 'draft' })

    expect(revertWrite.updateArgs[0]).toMatchObject({ status: 'draft' })
    const written = reopenWrite.updateArgs[0].snapshot_data
    expect(written).toMatchObject(snapshotData)
    expect(written[FROZEN_BALANCE_SHEETS_KEY]).toEqual({ ...frozen, reopened_at: expect.any(String) })
    expect(reopenWrite.eqs).toEqual([['id', 'status-1'], ['snapshot_taken_at', TAKEN_AT]])
    expect(captureException).not.toHaveBeenCalled()
  })

  it('a month sent before this shipped has no sent copy: snapshot_data is not written (D-18)', async () => {
    const reopenWrite = chain({ data: [], error: null })
    tables({
      cfo_report_status: [
        chain({ data: { id: 'status-1', status: 'sent' }, error: null }),
        chain({ data: null, error: null }),
        chain({ data: { id: 'status-1', snapshot_data: snapshotData, snapshot_taken_at: TAKEN_AT }, error: null }),
        reopenWrite,
      ],
    })
    const res = await POST(req({ action: 'revert_to_draft', business_id: BIZ, period_month: '2026-08-01' }))
    expect(res.status).toBe(200)
    expect(reopenWrite.update).not.toHaveBeenCalled()
  })

  it('an already-reopened copy is left as it is', async () => {
    const reopenWrite = chain({ data: [], error: null })
    tables({
      cfo_report_status: [
        chain({ data: { id: 'status-1', status: 'sent' }, error: null }),
        chain({ data: null, error: null }),
        chain({
          data: { id: 'status-1', snapshot_data: { ...snapshotData, [FROZEN_BALANCE_SHEETS_KEY]: { ...frozen, reopened_at: 'then' } }, snapshot_taken_at: TAKEN_AT },
          error: null,
        }),
        reopenWrite,
      ],
    })
    await POST(req({ action: 'revert_to_draft', business_id: BIZ, period_month: '2026-08-01' }))
    expect(reopenWrite.update).not.toHaveBeenCalled()
  })

  it('a reopen that does not land is captured with stage revert_to_draft, and the action says it failed — the status revert itself still stands', async () => {
    const revertWrite = chain({ data: null, error: null })
    tables({
      cfo_report_status: [
        chain({ data: { id: 'status-1', status: 'sent' }, error: null }),
        revertWrite,
        chain({ data: { id: 'status-1', snapshot_data: { ...snapshotData, [FROZEN_BALANCE_SHEETS_KEY]: frozen }, snapshot_taken_at: TAKEN_AT }, error: null }),
        chain({ data: null, error: { message: 'statement timeout' } }),
      ],
    })
    const res = await POST(req({ action: 'revert_to_draft', business_id: BIZ, period_month: '2026-08-01' }))
    // Not a 200 'Reverted to draft': exports still print the sent copy, and the
    // coach is told so — the bar keeps offering the reopen from draft to retry.
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ success: false, error: expect.stringMatching(/balance sheet/i) })
    expect(revertWrite.updateArgs[0]).toMatchObject({ status: 'draft' })
    expect(captureException).toHaveBeenCalledWith(
      { message: 'statement timeout' },
      expect.objectContaining({ tags: expect.objectContaining({ invariant: 'balance-sheet-freeze', stage: 'revert_to_draft' }) }),
    )
  })

  it('a reopen whose guard matched nothing (a new send landed between read and write) is not reported as done', async () => {
    tables({
      cfo_report_status: [
        chain({ data: { id: 'status-1', status: 'sent' }, error: null }),
        chain({ data: null, error: null }),
        chain({ data: { id: 'status-1', snapshot_data: { ...snapshotData, [FROZEN_BALANCE_SHEETS_KEY]: frozen }, snapshot_taken_at: TAKEN_AT }, error: null }),
        chain({ data: [], error: null }),
      ],
    })
    const res = await POST(req({ action: 'revert_to_draft', business_id: BIZ, period_month: '2026-08-01' }))
    expect(res.status).toBe(500)
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('not reopened'),
      expect.objectContaining({ tags: expect.objectContaining({ invariant: 'balance-sheet-freeze', stage: 'revert_to_draft' }) }),
    )
  })

  it('a month a save already flipped back to draft: the same action reopens the kept copy and leaves the status alone', async () => {
    // What the bar's "Reopen balance sheet" posts — after a send, the first
    // draft save silently reverts the status, so Revert to Draft is gone.
    const revertRead = chain({ data: { id: 'status-1', status: 'draft' }, error: null })
    const reopenRead = chain({
      data: { id: 'status-1', snapshot_data: { ...snapshotData, [FROZEN_BALANCE_SHEETS_KEY]: frozen }, snapshot_taken_at: TAKEN_AT },
      error: null,
    })
    const reopenWrite = chain({ data: [{ id: 'status-1' }], error: null })
    tables({ cfo_report_status: [revertRead, reopenRead, reopenWrite] })

    const res = await POST(req({ action: 'revert_to_draft', business_id: BIZ, period_month: '2026-08-01' }))
    expect(res.status).toBe(200)
    expect(revertRead.update).not.toHaveBeenCalled()
    expect(reopenWrite.updateArgs[0]).not.toHaveProperty('status')
    expect(reopenWrite.updateArgs[0].snapshot_data[FROZEN_BALANCE_SHEETS_KEY]).toEqual({ ...frozen, reopened_at: expect.any(String) })
    expect(captureException).not.toHaveBeenCalled()
  })
})

describe('resend never rewrites the sent copy', () => {
  it('writes nothing to snapshot_data — the page prints the sent copy into the resent PDF', async () => {
    const lookup = chain({ data: { id: 'status-1', status: 'sent' }, error: null })
    const sent = chain({ data: null, error: null })
    tables({
      cfo_report_status: [lookup, sent],
      cfo_email_log: [chain({ data: { id: 'log-1' }, error: null }), chain({ data: null, error: null })],
    })
    const { snapshot_data: _drop, ...rest } = approveBody
    const res = await POST(req({ ...rest, action: 'resend', balance_sheets: { mom, yoy } }))
    expect(res.status).toBe(200)
    expect(sent.updateArgs[0]).not.toHaveProperty('snapshot_data')
    expect(lookup.update).not.toHaveBeenCalled()
  })
})
