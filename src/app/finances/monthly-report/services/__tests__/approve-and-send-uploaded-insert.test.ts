/**
 * Approve & Send and Resend attach the same pack Export PDF saves — uploaded
 * pages merged in at their layout position, numbered with the rest.
 *
 * The service is NOT mocked here: the attachment is decoded from the posted
 * base64 and read page by page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import { approveAndSend, resendReport, type ApproveAndSendParams } from '../approve-and-send'
import { buildPackPdf } from '../pack-pdf'
import { fixtureReport } from './pdf-pack-fixture'
import { uploadedPdf, readPages, A4, LETTER, LETTER_LANDSCAPE } from './pack-insert-test-pdf'
import type { PDFLayout } from '../../types/pdf-layout'
import type { PackInsertSources } from '@/lib/monthly-report/pack-inserts'

const layout: PDFLayout = {
  version: 1,
  pages: [
    { id: 'p1', orientation: 'portrait', widgets: [{ id: 'es', type: 'executive_summary', col: 0, row: 0, colSpan: 2, rowSpan: 3 }] },
    { id: 'p2', orientation: 'portrait', widgets: [{ id: 'payroll', type: 'uploaded_insert', col: 0, row: 0, colSpan: 2, rowSpan: 3, titleOverride: 'Employment Hero Payroll' }] },
    { id: 'p3', orientation: 'portrait', widgets: [{ id: 'memo', type: 'memo', col: 0, row: 0, colSpan: 2, rowSpan: 3 }] },
  ],
}

const posted: any[] = []
beforeEach(() => {
  posted.length = 0
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    posted.push(JSON.parse(String(init?.body)))
    return new Response(JSON.stringify({ success: true, status: 'sent' }), { status: 200 })
  }))
  // jsPDF stamps the time and a random file id, pdf-lib a random font tag:
  // held still so two builds of one pack compare byte for byte. Date only —
  // pdf-lib yields to the event loop with setTimeout while it saves.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-16T01:00:00Z'))
  reseed()
  vi.spyOn(Math, 'random').mockImplementation(nextRandom)
})

// A seeded sequence rather than one constant: jsPDF names its event
// subscriptions with Math.random, and identical names collide.
let seed = 1
const reseed = () => { seed = 1 }
const nextRandom = () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function params(): Promise<{ p: ApproveAndSendParams; inserts: PackInsertSources }> {
  const inserts: PackInsertSources = { payroll: { status: 'file', bytes: await uploadedPdf('PAYROLL'), filename: 'eh-payroll-aug.pdf' } }
  return {
    inserts,
    p: {
      business_id: 'biz-1',
      period_month: '2026-08-01',
      business_name: 'IICT Group',
      month_label: 'August 2026',
      client_greeting_name: 'Sam',
      recipient_email: 'owner@example.com',
      coach_name: 'Matt Malouf',
      coach_email: 'coach@example.com',
      pdf_input: { report: fixtureReport(), options: { pdfLayout: layout, memo: 'Payroll moved.' }, inserts },
      snapshot_data: { schema_version: 1 },
    },
  }
}

const decode = (b64: string) => new Uint8Array(Buffer.from(b64, 'base64'))

describe.each([
  ['approveAndSend', approveAndSend, 'approve_and_send'],
  ['resendReport', resendReport, 'resend'],
] as const)('%s attaches the merged pack', (_name, send, action) => {
  it('the 2-page upload is pages 2-3 of 4, numbered like every other page', async () => {
    const { p } = await params()
    const res = await send(p)
    expect(res.ok).toBe(true)
    expect(posted[0].action).toBe(action)
    const pages = await readPages(decode(posted[0].pdf_base64))
    expect(pages.map((pg) => pg.size)).toEqual([A4, LETTER, LETTER_LANDSCAPE, A4])
    expect(pages[1].text).toContain('PAYROLL 1')
    expect(pages[2].text).toContain('PAYROLL 2')
    pages.forEach((pg, i) => expect(pg.text).toContain(`Page ${i + 1} of 4`))
  })

  it('byte for byte the file Export PDF builds from the same input', async () => {
    const { p, inserts } = await params()
    reseed()
    await send(p)
    reseed()
    const exported = await buildPackPdf(fixtureReport(), { pdfLayout: layout, memo: 'Payroll moved.' }, inserts)
    expect(Buffer.from(decode(posted[0].pdf_base64)).equals(Buffer.from(exported.bytes))).toBe(true)
  })
})

describe('a pack too large to email', () => {
  it('is refused before posting, naming the uploaded page to shrink', async () => {
    const { p } = await params()
    // An uncompressible upload: random bytes in the page content, just under the upload limit.
    const { PDFDocument } = await import('pdf-lib')
    vi.mocked(Math.random).mockRestore()
    const big = await PDFDocument.create()
    const noise = new Uint8Array(2_900_000)
    for (let i = 0; i < noise.length; i += 65536) crypto.getRandomValues(noise.subarray(i, Math.min(i + 65536, noise.length)))
    const page = big.addPage([612, 792])
    page.node.set((await import('pdf-lib')).PDFName.of('Noise'), big.context.flateStream(noise))
    p.pdf_input.inserts = { payroll: { status: 'file', bytes: await big.save(), filename: 'huge.pdf' } }
    const res = await approveAndSend(p)
    expect(res).toMatchObject({ ok: false, httpStatus: 413, body: { errorCode: 'pdf_too_large' } })
    expect(res.body.error).toMatch(/too large to email\. Upload a smaller PDF for Employment Hero Payroll/)
    expect(posted).toHaveLength(0)
  })
})
