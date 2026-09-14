/**
 * Decision 19 — the snapshot route's half of freezing a finalised month's
 * balance sheet.
 *
 *   - POST with status 'final' records that a freeze is owed, and when (the
 *     finalise's own time). A draft save owes none, and no save ever carries a
 *     stored freeze forward.
 *   - PATCH freeze_balance_sheets merges the two comparisons into report_data
 *     of a snapshot that is STILL final and STILL the same finalise — guarded on
 *     the finalise time it read, not on updated_at, so an Export or memo edit
 *     landing in the read-to-write gap no longer makes the freeze stand down,
 *     while an unfinalise or a re-finalise still does.
 *   - It refuses anything but a whole mom + yoy sheet for the month.
 *   - A failed read or write is captured under invariant balance-sheet-freeze.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockVerifyBusinessAccess = vi.fn()
const mockAdminFrom = vi.fn()
const captureException = vi.fn()

vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: vi.fn(async () => ({ allowed: true, reason: 'test-bypass' })),
}))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({ enforceSectionPermission: vi.fn(() => null) }))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: () => 'test-secret-key' }))
vi.mock('@/lib/utils/verify-business-access', () => ({
  verifyBusinessAccess: (...args: any[]) => mockVerifyBusinessAccess(...args),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: (...args: any[]) => mockAdminFrom(...args) })),
}))
vi.mock('@/lib/reports/revert-report', () => ({ revertReportIfApproved: vi.fn(async () => ({ reverted: false })) }))
vi.mock('@/lib/reports/cycle-stages', () => ({
  periodMonthFromReportMonth: vi.fn(() => null),
  stampGeneratedFirst: vi.fn(async () => null),
}))
vi.mock('@sentry/nextjs', () => ({
  captureException: (...a: unknown[]) => captureException(...a),
  captureMessage: vi.fn(),
}))

import { PATCH, POST } from '@/app/api/monthly-report/snapshot/route'
import fixture from '@/lib/monthly-report/__tests__/fixtures/urban-road-bs-aug-2026.json'
import { buildBalanceSheetData, balanceSheetDates, type XeroBalanceSheetReport } from '@/lib/monthly-report/balance-sheet-rows'
import { FROZEN_BALANCE_SHEETS_KEY } from '@/lib/monthly-report/balance-sheet-freeze'

const reports = fixture.reports as Record<string, { Reports: XeroBalanceSheetReport[] }>
const sheet = (compare: 'mom' | 'yoy') => {
  const d = balanceSheetDates('2026-08', compare)
  return buildBalanceSheetData({
    businessId: 'biz-1', compare, currentDate: d.current, priorDate: d.prior,
    current: reports[d.current].Reports[0], prior: reports[d.prior].Reports[0], accounts: null,
  })
}
const mom = sheet('mom')
const yoy = sheet('yoy')

function req(method: 'PATCH' | 'POST', body: unknown) {
  return new NextRequest('http://test.local/api/monthly-report/snapshot', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

/** One query chain: records every call (all .eq filters, in order) and resolves to `result`. */
function chain(result: { data: any; error: any }) {
  const q: any = { eqs: [] as [string, unknown][] }
  for (const m of ['select', 'update', 'upsert', 'maybeSingle', 'single']) {
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

/** Snapshot-table chains handed out in order (the read, then the write); other tables get a sink. */
function snapshotChains(...chains: any[]) {
  const queue = [...chains]
  mockAdminFrom.mockImplementation((table: string) =>
    table === 'monthly_report_snapshots' ? queue.shift() : chain({ data: null, error: null }),
  )
}

const READ_AT = '2026-09-14T03:00:00.123456+00:00'
const FINALISED_AT = '2026-09-14T02:59:58.000Z'
const storedReport = { report_month: '2026-08', summary: { revenue: 1 }, sections: { revenue: {} } }
/** A report finalised by a build that freezes: the marker the POST wrote. */
const finalisedReport = { ...storedReport, [FROZEN_BALANCE_SHEETS_KEY]: { report_month: '2026-08', finalised_at: FINALISED_AT } }
const BASE = { business_id: 'biz-1', report_month: '2026-08', action: 'freeze_balance_sheets' }

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local'
  mockGetUser.mockReset()
  mockVerifyBusinessAccess.mockReset()
  mockAdminFrom.mockReset()
  captureException.mockReset()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  mockVerifyBusinessAccess.mockResolvedValue(true)
})

describe('PATCH freeze_balance_sheets', () => {
  it('merges both sheets into a final snapshot\'s report_data, guarded on status and the finalise it read', async () => {
    const read = chain({ data: { status: 'final', report_data: finalisedReport, updated_at: READ_AT }, error: null })
    const write = chain({ data: [{ id: 'snap-1' }], error: null })
    snapshotChains(read, write)

    const res = await PATCH(req('PATCH', { ...BASE, balance_sheets: { mom, yoy } }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(true)

    const written = write.updateArgs[0]
    // The rest of the report is untouched; the freeze sits beside it.
    expect(written.report_data).toMatchObject(storedReport)
    expect(written.report_data[FROZEN_BALANCE_SHEETS_KEY]).toEqual({
      frozen_at: body.frozen_at,
      finalised_at: FINALISED_AT,
      report_month: '2026-08',
      mom,
      yoy,
    })
    // Not updated_at: Export stamps pdf_exported_at and a memo edit writes
    // coach_notes, both bumping updated_at without touching report_data, and
    // Finalise → Export is the normal flow. Either used to make this freeze
    // stand down for good.
    expect(write.eqs).toEqual([
      ['business_id', 'biz-1'],
      ['report_month', '2026-08'],
      ['status', 'final'],
      [`report_data->${FROZEN_BALANCE_SHEETS_KEY}->>finalised_at`, FINALISED_AT],
    ])
    expect(captureException).not.toHaveBeenCalled()
  })

  it('a month that is no longer final is not frozen — updated:false, and no write', async () => {
    const read = chain({ data: { status: 'draft', report_data: finalisedReport, updated_at: READ_AT }, error: null })
    const write = chain({ data: [{ id: 'snap-1' }], error: null })
    snapshotChains(read, write)
    const body = await (await PATCH(req('PATCH', { ...BASE, balance_sheets: { mom, yoy } }))).json()
    expect(body).toEqual({ success: true, updated: false, reason: 'not_final' })
    expect(write.update).not.toHaveBeenCalled()
  })

  it('a final month finalised before freezing existed owes no freeze — updated:false, and no write', async () => {
    const read = chain({ data: { status: 'final', report_data: storedReport, updated_at: READ_AT }, error: null })
    const write = chain({ data: [{ id: 'snap-1' }], error: null })
    snapshotChains(read, write)
    const body = await (await PATCH(req('PATCH', { ...BASE, balance_sheets: { mom, yoy } }))).json()
    expect(body).toEqual({ success: true, updated: false, reason: 'no_freeze_owed' })
    expect(write.update).not.toHaveBeenCalled()
  })

  it('a re-finalise since the read matches no row — updated:false', async () => {
    const read = chain({ data: { status: 'final', report_data: finalisedReport, updated_at: READ_AT }, error: null })
    const write = chain({ data: [], error: null })
    snapshotChains(read, write)
    const body = await (await PATCH(req('PATCH', { ...BASE, balance_sheets: { mom, yoy } }))).json()
    expect(body.updated).toBe(false)
  })

  it.each([
    ['half a freeze', { mom }],
    ['the comparisons swapped', { mom: yoy, yoy: mom }],
    ['nothing', undefined],
  ])('refuses %s with a 400, before touching the row', async (_why, balance_sheets) => {
    snapshotChains()
    const res = await PATCH(req('PATCH', { ...BASE, balance_sheets }))
    expect(res.status).toBe(400)
    expect(mockAdminFrom).not.toHaveBeenCalled()
  })

  it('a sheet for another month is refused', async () => {
    snapshotChains()
    const res = await PATCH(req('PATCH', { ...BASE, report_month: '2026-09', balance_sheets: { mom, yoy } }))
    expect(res.status).toBe(400)
  })

  it('a failed write is a 500, captured under the invariant', async () => {
    const read = chain({ data: { status: 'final', report_data: finalisedReport, updated_at: READ_AT }, error: null })
    const write = chain({ data: null, error: { message: 'statement timeout' } })
    snapshotChains(read, write)
    const res = await PATCH(req('PATCH', { ...BASE, balance_sheets: { mom, yoy } }))
    expect(res.status).toBe(500)
    expect(captureException).toHaveBeenCalledWith(
      { message: 'statement timeout' },
      expect.objectContaining({ tags: expect.objectContaining({ invariant: 'balance-sheet-freeze' }) }),
    )
  })

  it('another business\'s month cannot be frozen', async () => {
    mockVerifyBusinessAccess.mockResolvedValue(false)
    snapshotChains()
    const res = await PATCH(req('PATCH', { ...BASE, balance_sheets: { mom, yoy } }))
    expect(res.status).toBe(403)
    expect(mockAdminFrom).not.toHaveBeenCalled()
  })
})

describe('POST never carries a freeze forward', () => {
  it('a Finalise drops the freeze the page\'s in-memory report carried, and records a new one as owed', async () => {
    const upsert = chain({ data: { id: 'snap-1' }, error: null })
    snapshotChains(upsert)
    const report_data = {
      ...storedReport,
      [FROZEN_BALANCE_SHEETS_KEY]: { frozen_at: 'then', report_month: '2026-08', mom, yoy },
    }
    const res = await POST(req('POST', {
      business_id: 'biz-1', report_month: '2026-08', fiscal_year: 2027, status: 'final',
      report_data, summary: { revenue: 1 },
    }))
    expect(res.status).toBe(200)
    const row = upsert.upsertArgs[0]
    expect(row.report_data).toEqual({
      ...storedReport,
      [FROZEN_BALANCE_SHEETS_KEY]: { report_month: '2026-08', finalised_at: row.generated_at },
    })
  })

  it('a draft save owes no freeze and carries none', async () => {
    const upsert = chain({ data: { id: 'snap-1' }, error: null })
    snapshotChains(upsert)
    const res = await POST(req('POST', {
      business_id: 'biz-1', report_month: '2026-08', fiscal_year: 2027, status: 'draft',
      report_data: finalisedReport, summary: { revenue: 1 },
    }))
    expect(res.status).toBe(200)
    expect(upsert.upsertArgs[0].report_data).toEqual(storedReport)
  })
})
