/**
 * Package B — the send stores the sheets its PDF printed, not a fresh fetch.
 *
 * approveAndSend builds the PDF from `pdf_input` and posts it; the balance
 * sheets it posts beside it are taken from that same `pdf_input`, so what is
 * kept is, by construction, what the client's attachment printed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const built: { options: any }[] = []
vi.mock('../monthly-report-pdf-service', () => ({
  MonthlyReportPDFService: class {
    constructor(_report: unknown, options: unknown) {
      built.push({ options })
    }
    generate() {
      return { output: () => new Uint8Array([37, 80, 68, 70]).buffer }
    }
  },
}))

import { approveAndSend, resendReport, type ApproveAndSendParams } from '../approve-and-send'
import fixture from '@/lib/monthly-report/__tests__/fixtures/urban-road-bs-aug-2026.json'
import { buildBalanceSheetData, balanceSheetDates, type XeroBalanceSheetReport } from '@/lib/monthly-report/balance-sheet-rows'

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

const posted: any[] = []
beforeEach(() => {
  built.length = 0
  posted.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      posted.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ success: true, status: 'sent' }), { status: 200 })
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function params(balanceSheets?: unknown): ApproveAndSendParams {
  return {
    business_id: BIZ,
    period_month: '2026-08-01',
    business_name: 'Urban Road',
    month_label: 'August 2026',
    client_greeting_name: 'Andrea',
    recipient_email: 'owner@example.com',
    coach_name: 'Matt Malouf',
    coach_email: 'coach@example.com',
    pdf_input: {
      report: { report_month: '2026-08' } as any,
      options: { ...(balanceSheets ? { balanceSheets } : {}) } as any,
    },
    snapshot_data: { schema_version: 1 },
  }
}

describe('approveAndSend posts the sheets its PDF was built from', () => {
  it('the posted sheets are the very sheets handed to the PDF', async () => {
    const sources = { mom: { data: mom }, yoy: { data: yoy } }
    await approveAndSend(params(sources))
    expect(built).toHaveLength(1)
    expect(built[0].options.balanceSheets).toBe(sources)
    expect(posted[0].action).toBe('approve_and_send')
    expect(posted[0].balance_sheets).toEqual({ mom, yoy })
  })

  it('a comparison the PDF printed a reason for is posted as null', async () => {
    await approveAndSend(params({ mom: { data: mom }, yoy: { data: null, reason: 'Xero returned 503' } }))
    expect(posted[0].balance_sheets).toEqual({ mom, yoy: null })
  })

  it('a pack with no balance sheet page posts no balance_sheets at all — the body is as it was', async () => {
    await approveAndSend(params())
    expect(posted[0]).not.toHaveProperty('balance_sheets')
  })

  it('a resend posts none: it prints the sent copy, and never rewrites it', async () => {
    await resendReport(params({ mom: { data: mom }, yoy: { data: yoy } }))
    expect(posted[0].action).toBe('resend')
    expect(posted[0]).not.toHaveProperty('balance_sheets')
  })
})
