/**
 * Package B, end to end — the balance sheet a client is sent is the balance
 * sheet every later copy of that month prints.
 *
 * Urban Road's August, sent from DRAFT (Approve & Send is offered straight from
 * draft, so no Finalise ever ran). Everything here is the real code: the
 * approve/resend orchestrators, both routes, revertReportIfApproved, the real
 * saveSnapshot and the real auto-save hook. Only the edges are fakes: an
 * in-memory database that APPLIES filters and writes, Xero's balance-sheet
 * endpoint, Resend, and the jsPDF service (which records what it was handed).
 *
 * The trap this pins concretely: after the send the page is still unlocked (a
 * draft snapshot), so the first commentary blur POSTs a draft save — and a
 * draft save strips a Finalise freeze from report_data and silently reverts the
 * sent status to draft. The sent copy lives where that save never writes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import { NextRequest } from 'next/server'

// ─── An in-memory database the routes really write to ───────────────────────

type Row = Record<string, any>
const db: {
  tables: Record<string, Row[]>
  /** A write to refuse, as Postgres would: return the error, or null to let it land. */
  failWrite: ((table: string, op: string, payload: Row) => { message: string } | null) | null
} = { tables: {}, failWrite: null }
const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

/** `col`, `col->a->b` (json) or `col->a->>b` (text) — PostgREST's paths. */
function readPath(row: Row, path: string): unknown {
  const parts = path.split(/(->>|->)/)
  let v: any = row[parts[0]]
  for (let i = 1; i < parts.length; i += 2) {
    v = v == null ? null : v[parts[i + 1]] ?? null
    if (parts[i] === '->>' && v != null && typeof v !== 'string') v = JSON.stringify(v)
  }
  return v ?? null
}

function project(row: Row, cols?: string): Row {
  if (!cols || cols.trim() === '*') return clone(row)
  const out: Row = {}
  for (const raw of cols.split(',').map((c) => c.trim()).filter(Boolean)) {
    const [alias, path] = raw.includes(':') ? raw.split(':') : [raw.split(/->>?/).pop()!, raw]
    out[alias] = clone(readPath(row, path))
  }
  return out
}

function from(table: string) {
  let op: 'select' | 'update' | 'upsert' | 'insert' = 'select'
  let payload: Row = {}
  let options: { onConflict?: string; ignoreDuplicates?: boolean } = {}
  let cols: string | undefined
  const filters: ['eq' | 'is', string, unknown][] = []
  const rows = (db.tables[table] ??= [])
  const matches = (r: Row) => filters.every(([, path, value]) => readPath(r, path) === value)

  const exec = (single: boolean) => {
    const refused = op === 'select' ? null : db.failWrite?.(table, op, payload) ?? null
    if (refused) return Promise.resolve({ data: null, error: refused })
    let result: Row[] = []
    if (op === 'select') {
      result = rows.filter(matches)
    } else if (op === 'update') {
      result = rows.filter(matches)
      for (const r of result) Object.assign(r, clone(payload))
    } else if (op === 'upsert') {
      const keys = (options.onConflict ?? 'id').split(',')
      const existing = rows.find((r) => keys.every((k) => r[k] === payload[k]))
      if (existing && options.ignoreDuplicates) result = []
      else if (existing) result = [Object.assign(existing, clone(payload))]
      else rows.push((result = [{ id: `${table}-${rows.length + 1}`, ...clone(payload) }])[0])
    } else {
      rows.push((result = [{ id: `${table}-${rows.length + 1}`, ...clone(payload) }])[0])
    }
    const data = result.map((r) => project(r, cols))
    return Promise.resolve({ data: single ? data[0] ?? null : data, error: null })
  }

  const q: any = {
    select(c?: string) { cols = c; return q },
    update(p: Row) { op = 'update'; payload = p; return q },
    upsert(p: Row, o: typeof options) { op = 'upsert'; payload = p; options = o ?? {}; return q },
    insert(p: Row) { op = 'insert'; payload = p; return q },
    eq(path: string, value: unknown) { filters.push(['eq', path, value]); return q },
    is(path: string, value: unknown) { filters.push(['is', path, value]); return q },
    order() { return q },
    maybeSingle: () => exec(true),
    single: () => exec(true),
    then: (resolve: any, reject: any) => exec(false).then(resolve, reject),
  }
  return q
}

// ─── Module edges ───────────────────────────────────────────────────────────

const COACH = 'coach-1'
const captureMessage = vi.fn()
const captureException = vi.fn()
const sendMonthlyReport = vi.fn()
const built: { balanceSheets: any }[] = []

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from })) }))
vi.mock('@/lib/supabase/keys', () => ({ getSupabaseSecretKey: () => 'test-secret-key' }))
vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: { id: COACH } }, error: null }) } })),
}))
vi.mock('@/lib/permissions/requireSectionPermission', () => ({
  requireSectionPermission: vi.fn(async () => ({ allowed: true, reason: 'test-bypass' })),
}))
vi.mock('@/lib/permissions/sectionPermissionConfig', () => ({ enforceSectionPermission: vi.fn(() => null) }))
vi.mock('@/lib/utils/verify-business-access', () => ({ verifyBusinessAccess: vi.fn(async () => true) }))
vi.mock('@/lib/email/send-report', () => ({ sendMonthlyReport: (...a: unknown[]) => sendMonthlyReport(...a) }))
vi.mock('@/lib/reports/build-report-url', () => ({ buildReportUrl: vi.fn(() => 'https://wisdombi.ai/reports/view/T') }))
vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...a: unknown[]) => captureMessage(...a),
  captureException: (...a: unknown[]) => captureException(...a),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
// The browser client: a single-entity business (no consolidation branch).
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ count: 1 }) }) }) }) }),
  }),
}))
vi.mock('@/app/finances/monthly-report/services/monthly-report-pdf-service', () => ({
  MonthlyReportPDFService: class {
    constructor(_report: unknown, options: { balanceSheets?: unknown }) {
      built.push({ balanceSheets: clone(options.balanceSheets) })
    }
    generate() {
      return { output: () => new Uint8Array([37, 80, 68, 70]).buffer }
    }
  },
}))

import * as snapshotRoute from '@/app/api/monthly-report/snapshot/route'
import * as reportStatusRoute from '@/app/api/cfo/report-status/route'
import { approveAndSend, resendReport, revertToDraft } from '@/app/finances/monthly-report/services/approve-and-send'
import { useMonthlyReport } from '@/app/finances/monthly-report/hooks/useMonthlyReport'
import { useAutoSaveReport, type UseAutoSaveReportReturn } from '@/app/finances/monthly-report/hooks/useAutoSaveReport'
import {
  FROZEN_BALANCE_SHEETS_KEY,
  balanceSheetsForExport,
  loadSentBalanceSheets,
} from '@/lib/monthly-report/balance-sheet-freeze'
import fixture from '@/lib/monthly-report/__tests__/fixtures/urban-road-bs-aug-2026.json'
import { buildBalanceSheetData, balanceSheetDates, type XeroBalanceSheetReport } from '@/lib/monthly-report/balance-sheet-rows'
import type { GeneratedReport } from '@/app/finances/monthly-report/types'

// ─── Urban Road, August 2026 ────────────────────────────────────────────────

const BIZ = '28d41193-38ae-4071-a2b1-0dbea90a38fd'
const MONTH = '2026-08'
const reports = fixture.reports as Record<string, { Reports: XeroBalanceSheetReport[] }>
const sheet = (compare: 'mom' | 'yoy') => {
  const d = balanceSheetDates(MONTH, compare)
  return buildBalanceSheetData({
    businessId: BIZ, compare, currentDate: d.current, priorDate: d.prior,
    current: reports[d.current].Reports[0], prior: reports[d.prior].Reports[0], accounts: null,
  })
}
const mom = sheet('mom')
const yoy = sheet('yoy')
/** Xero after the send: an $853.89 credit posted afterwards moved Trade Debtors. */
const movedMom = {
  ...mom,
  rows: mom.rows.map((r) => (r.label === 'Trade Debtors' && typeof r.current === 'number' ? { ...r, current: r.current - 853.89 } : r)),
}

const report = {
  business_id: BIZ,
  report_month: MONTH,
  fiscal_year: 2027,
  budget_source: 'budget_version',
  sections: [],
  summary: { revenue: { actual: 181_234.5, budget: 175_000 }, net_profit: { actual: 22_118.4, budget: 19_500 } },
  gross_profit_row: { account_name: 'Gross Profit', actual: 90_000, budget: 88_000 },
  net_profit_row: { account_name: 'Net Profit', actual: 22_118.4, budget: 19_500 },
  is_draft: true,
  unreconciled_count: 0,
  has_budget: true,
} as unknown as GeneratedReport
const commentary = { 'Wages & Salaries': { coach_note: 'Five pay runs in August.', vendor_summary: [], is_edited: true } } as any

// ─── The browser: every fetch the page makes, answered by the real routes ───

const xero = { mom: mom as typeof mom, gets: 0 }
async function browserFetch(input: string, init?: RequestInit): Promise<Response> {
  const url = new URL(input, 'http://test.local')
  if (url.pathname === '/api/Xero/balance-sheet') {
    xero.gets += 1
    return new Response(JSON.stringify(url.searchParams.get('compare') === 'mom' ? xero.mom : yoy), { status: 200 })
  }
  const request = new NextRequest(url, { method: init?.method ?? 'GET', body: init?.body as any, headers: init?.headers as any })
  const method = init?.method ?? 'GET'
  if (url.pathname === '/api/monthly-report/snapshot') return (snapshotRoute as any)[method](request)
  if (url.pathname === '/api/cfo/report-status') return reportStatusRoute.POST(request)
  throw new Error(`unexpected fetch ${method} ${url.pathname}`)
}

/** The page: useMonthlyReport's real saveSnapshot/fetchSnapshot, and the real auto-save. */
function mountPage() {
  const page: { reportApi: ReturnType<typeof useMonthlyReport> | null; autoSave: UseAutoSaveReportReturn | null } = {
    reportApi: null,
    autoSave: null,
  }
  function Page() {
    const reportApi = useMonthlyReport(BIZ)
    page.reportApi = reportApi
    page.autoSave = useAutoSaveReport({
      report,
      commentary,
      selectedMonth: MONTH,
      userId: COACH,
      isLocked: false, // a draft snapshot: nothing locks the auto-save after a send
      saveSnapshot: reportApi.saveSnapshot,
    })
    return null
  }
  render(<Page />)
  return page
}

/** loadPdfSections' balance-sheet block, as page.tsx composes it. */
async function pagePrintsBalanceSheets(page: ReturnType<typeof mountPage>, loadedSnapshotStatus: 'draft' | 'final') {
  const stored = loadedSnapshotStatus === 'final' ? await page.reportApi!.fetchSnapshot(MONTH) : null
  const sent = await loadSentBalanceSheets(BIZ, MONTH)
  return balanceSheetsForExport({ businessId: BIZ, reportMonth: MONTH, report, stored, sent })
}

function sendParams(balanceSheets: unknown) {
  return {
    business_id: BIZ,
    period_month: `${MONTH}-01`,
    business_name: 'Urban Road',
    month_label: 'August 2026',
    client_greeting_name: 'Andrea',
    recipient_email: 'owner@example.com',
    coach_name: 'Matt Malouf',
    coach_email: 'coach@example.com',
    pdf_input: { report, options: { commentary, balanceSheets } as any },
    snapshot_data: { schema_version: 1, report, commentary },
  }
}

const statusRow = () => db.tables.cfo_report_status.find((r) => r.business_id === BIZ && r.period_month === `${MONTH}-01`)!
const snapshotRow = () => db.tables.monthly_report_snapshots.find((r) => r.business_id === BIZ && r.report_month === MONTH)!

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local'
  db.tables = {
    system_roles: [{ user_id: COACH, role: 'coach' }],
    businesses: [{ id: BIZ, assigned_coach_id: COACH }],
    monthly_report_snapshots: [
      { id: 'snap-1', business_id: BIZ, report_month: MONTH, fiscal_year: 2027, status: 'draft', report_data: clone(report), commentary },
    ],
    cfo_report_status: [{ id: 'status-1', business_id: BIZ, period_month: `${MONTH}-01`, status: 'draft', generated_at: '2026-09-10T00:00:00Z' }],
    cfo_email_log: [],
  }
  db.failWrite = null
  xero.mom = mom
  xero.gets = 0
  built.length = 0
  captureMessage.mockReset()
  captureException.mockReset()
  sendMonthlyReport.mockReset()
  sendMonthlyReport.mockResolvedValue({ success: true, id: 'msg-1', statusCode: 200 })
  vi.stubGlobal('fetch', vi.fn(browserFetch))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sent from draft: every later copy prints the sheet the client was sent', () => {
  it('keeps it through a resend, the post-send auto-save, a second send and an export — until Revert to Draft', async () => {
    const page = mountPage()

    // 1. Approve & Send from draft. The PDF prints Xero as it stands.
    const printed = await pagePrintsBalanceSheets(page, 'draft')
    expect(printed).toEqual({ mom: { data: mom }, yoy: { data: yoy } })
    expect((await approveAndSend(sendParams(printed))).ok).toBe(true)
    expect(statusRow().status).toBe('sent')
    expect(statusRow().snapshot_data[FROZEN_BALANCE_SHEETS_KEY]).toMatchObject({ report_month: MONTH, mom, yoy })
    // The snapshot is still a draft, untouched by the send.
    expect(snapshotRow().status).toBe('draft')
    expect(snapshotRow().report_data[FROZEN_BALANCE_SHEETS_KEY]).toBeUndefined()

    // 2. Xero moves after the send.
    xero.mom = movedMom
    xero.gets = 0

    // 3. Resend prints what was sent — Xero is not asked.
    const resent = await pagePrintsBalanceSheets(page, 'draft')
    expect((await resendReport(sendParams(resent))).ok).toBe(true)
    expect(built.at(-1)!.balanceSheets).toEqual({ mom: { data: mom }, yoy: { data: yoy } })
    expect(xero.gets).toBe(0)

    // 4. The coach clicks into a note and out again: the auto-save POSTs a draft.
    const draftSaves = () => (fetch as any).mock.calls.filter(([u, i]: [string, RequestInit?]) => u === '/api/monthly-report/snapshot' && i?.method === 'POST').length
    await act(async () => {
      page.autoSave!.flushImmediately()
    })
    await vi.waitFor(() => expect(page.autoSave!.status.kind).toBe('saved'))
    expect(draftSaves()).toBe(1)
    // What that save does today, and still does: the report is a draft again,
    // and the pill silently flips from Sent to Draft (D-16)...
    expect(snapshotRow().status).toBe('draft')
    expect(statusRow().status).toBe('draft')
    // ...but the sent copy is where no snapshot save writes.
    expect(statusRow().snapshot_data[FROZEN_BALANCE_SHEETS_KEY]).toMatchObject({ mom, yoy })
    expect(statusRow().snapshot_data[FROZEN_BALANCE_SHEETS_KEY].reopened_at).toBeUndefined()

    // 5. A later export prints what was sent, not the moved sheet.
    expect(await pagePrintsBalanceSheets(page, 'draft')).toEqual({ mom: { data: mom }, yoy: { data: yoy } })
    expect(xero.gets).toBe(0)

    // 6. Approve & Send again (the pill says Draft): that PDF prints the sent
    //    copy too, and the copy it keeps is the same sheet.
    const again = await pagePrintsBalanceSheets(page, 'draft')
    expect((await approveAndSend(sendParams(again))).ok).toBe(true)
    expect(built.at(-1)!.balanceSheets).toEqual({ mom: { data: mom }, yoy: { data: yoy } })
    expect(statusRow().snapshot_data[FROZEN_BALANCE_SHEETS_KEY]).toMatchObject({ mom, yoy })

    // 7. Revert to Draft — the deliberate reopen. The record of what was sent
    //    stays; exports go back to the rules they always had (a draft asks Xero).
    expect((await revertToDraft(BIZ, `${MONTH}-01`)).ok).toBe(true)
    expect(statusRow().status).toBe('draft')
    expect(statusRow().snapshot_data[FROZEN_BALANCE_SHEETS_KEY]).toMatchObject({ mom, yoy, reopened_at: expect.any(String) })
    expect(statusRow().snapshot_data.report).toBeTruthy() // D-18: the client's link still renders
    expect((await pagePrintsBalanceSheets(page, 'draft')).mom).toEqual({ data: movedMom })

    expect(captureException).not.toHaveBeenCalled()
  })

  it('an existing Finalise freeze is kept: the send prints it, keeps that same copy, and never writes the snapshot', async () => {
    const finalisedAt = '2026-09-14T02:59:58.000Z'
    const finaliseFreeze = { frozen_at: '2026-09-14T03:00:00.000Z', finalised_at: finalisedAt, report_month: MONTH, mom, yoy }
    Object.assign(snapshotRow(), {
      status: 'final',
      report_data: { ...clone(report), [FROZEN_BALANCE_SHEETS_KEY]: finaliseFreeze },
    })
    const snapshotBefore = clone(snapshotRow())
    xero.mom = movedMom
    const page = mountPage()

    const printed = await pagePrintsBalanceSheets(page, 'final')
    expect(printed).toEqual({ mom: { data: mom }, yoy: { data: yoy } })
    expect(xero.gets).toBe(0)
    expect((await approveAndSend(sendParams(printed))).ok).toBe(true)

    expect(snapshotRow()).toEqual(snapshotBefore)
    expect(statusRow().snapshot_data[FROZEN_BALANCE_SHEETS_KEY]).toMatchObject({ mom, yoy })
    expect(await pagePrintsBalanceSheets(page, 'final')).toEqual({ mom: { data: mom }, yoy: { data: yoy } })
  })

  it('a send whose sent copy cannot be written still reaches the client, and says so', async () => {
    const page = mountPage()
    const printed = await pagePrintsBalanceSheets(page, 'draft')
    // The approval lands; the write of the sent copy after it does not.
    db.failWrite = (table, op, payload) =>
      table === 'cfo_report_status' && op === 'update' && 'snapshot_data' in payload ? { message: 'payload too large' } : null

    expect((await approveAndSend(sendParams(printed))).ok).toBe(true)
    expect(sendMonthlyReport).toHaveBeenCalledTimes(1)
    expect(statusRow().status).toBe('sent')
    expect(statusRow().snapshot_data[FROZEN_BALANCE_SHEETS_KEY]).toBeUndefined()
    expect(captureException).toHaveBeenCalledWith(
      { message: 'payload too large' },
      expect.objectContaining({ tags: expect.objectContaining({ invariant: 'balance-sheet-freeze', stage: 'approve_and_send' }) }),
    )
  })
})
