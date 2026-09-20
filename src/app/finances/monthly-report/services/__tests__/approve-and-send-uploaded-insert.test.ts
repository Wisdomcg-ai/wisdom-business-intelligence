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
import { buildPackPdf, preparePackInserts } from '../pack-pdf'
import { fixtureReport } from './pdf-pack-fixture'
import { uploadedPdf, readPages, A4, LETTER, LETTER_LANDSCAPE } from './pack-insert-test-pdf'
import type { PDFLayout } from '../../types/pdf-layout'
import {
  INSERTS_NOT_SET_UP_REASON,
  MAX_INSERT_BYTES,
  SENDABLE_PACK_BYTES,
  packTooLargeToEmailReason,
  type PackInsertSources,
} from '@/lib/monthly-report/pack-inserts'
import { inspectInsertPdf } from '@/lib/monthly-report/pack-insert-pdf'
import { runPreflight } from '@/lib/monthly-report/preflight'

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

/** An uncompressible one-page upload of about `size` bytes: random bytes in the page's content. */
async function noisePdf(size: number): Promise<Uint8Array> {
  const { PDFDocument, PDFName } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const noise = new Uint8Array(size)
  for (let i = 0; i < noise.length; i += 65536) crypto.getRandomValues(noise.subarray(i, Math.min(i + 65536, noise.length)))
  doc.addPage([612, 792]).node.set(PDFName.of('Noise'), doc.context.flateStream(noise))
  return doc.save()
}

describe('the upload limit and the email agree', () => {
  it('a file the upload check accepts, at the limit, goes out in a lean pack', async () => {
    const { p } = await params()
    vi.mocked(Math.random).mockRestore()
    const bytes = await noisePdf(MAX_INSERT_BYTES - 16_000)
    expect(bytes.length).toBeLessThanOrEqual(MAX_INSERT_BYTES)
    expect(bytes.length).toBeGreaterThan(MAX_INSERT_BYTES - 64_000)
    expect((await inspectInsertPdf(bytes, { maxBytes: MAX_INSERT_BYTES })).ok).toBe(true)

    p.pdf_input.inserts = { payroll: { status: 'file', bytes, filename: 'eh-payroll-aug.pdf' } }
    const res = await approveAndSend(p)
    expect(res.ok).toBe(true)
    expect(posted).toHaveLength(1)
  }, 30_000)
})

describe('a pack too large to email', () => {
  // Dragon's shape: two uploaded pages, each within the upload limit, that
  // together push the pack past what an email carries.
  const twoUploads: PDFLayout = {
    version: 1,
    pages: [
      layout.pages[0],
      { id: 'p2', orientation: 'portrait', widgets: [{ id: 'cva', type: 'uploaded_insert', col: 0, row: 0, colSpan: 2, rowSpan: 3, titleOverride: 'Cash vs Accruals' }] },
      { id: 'p3', orientation: 'portrait', widgets: [{ id: 'hub', type: 'uploaded_insert', col: 0, row: 0, colSpan: 2, rowSpan: 3, titleOverride: 'Hubstaff' }] },
    ],
  }

  it('pre-flight warns with the cut to make, and Approve & Send refuses with the same words, before posting', async () => {
    const { p } = await params()
    vi.mocked(Math.random).mockRestore()
    const sources: PackInsertSources = {
      cva: { status: 'file', bytes: await noisePdf(1_600_000), filename: 'cva.pdf' },
      hub: { status: 'file', bytes: await noisePdf(1_600_000), filename: 'hub.pdf' },
    }
    for (const s of Object.values(sources)) expect(s.status === 'file' && s.bytes.length <= MAX_INSERT_BYTES).toBe(true)

    // What the Export PDF path does: open the files, build the pack, and hand
    // the pre-flight the built file's size.
    const prepared = await preparePackInserts(twoUploads, sources)
    const pack = await buildPackPdf(fixtureReport(), { pdfLayout: twoUploads }, prepared)
    expect(pack.merged).toBe(true)
    expect(pack.bytes.length).toBeGreaterThan(SENDABLE_PACK_BYTES)
    const reason = packTooLargeToEmailReason(pack.bytes.length, pack.inserts)!
    expect(reason).toMatch(/^the pack with its uploaded pages is 3\.\d MB, too large to email: Cash vs Accruals \(1\.5 MB\) and Hubstaff \(1\.5 MB\) have to be at least \d+ KB smaller between them$/)
    // Making the cut it states is enough.
    const cut = Number(reason.match(/at least (\d+) KB/)![1]) * 1024
    expect(pack.bytes.length - cut).toBeLessThanOrEqual(SENDABLE_PACK_BYTES)

    const row = runPreflight({ report: fixtureReport(), uploadedInserts: pack.inserts, uploadedPackBytes: pack.bytes.length })
      .find((r) => r.key === 'uploaded_pages')
    expect(row?.status).toBe('warn')
    expect(row?.detail).toContain(reason)

    p.pdf_input = { ...p.pdf_input, options: { pdfLayout: twoUploads }, inserts: prepared }
    const res = await approveAndSend(p)
    expect(res).toMatchObject({ ok: false, httpStatus: 413, body: { errorCode: 'pdf_too_large' } })
    expect(res.body.error).toBe(`${reason}. Upload smaller PDFs on the External Data tab and send again.`)
    expect(posted).toHaveLength(0)
  }, 30_000)
})

describe('an uploaded page that could not be added, in the emailed pack', () => {
  it("before the migration is applied: the client's page says only that the page couldn't be added", async () => {
    const { p } = await params()
    p.pdf_input.inserts = { payroll: { status: 'unavailable', reason: INSERTS_NOT_SET_UP_REASON } }
    const res = await approveAndSend(p)
    expect(res.ok).toBe(true)
    const pages = await readPages(decode(posted[0].pdf_base64))
    const printed = pages.map((pg) => pg.text.replace(/\n/g, ' ')).join(' ')
    expect(printed).toContain("The Employment Hero Payroll page for August 2026 couldn't be added to this pack.")
    expect(printed).not.toMatch(/migration|database|20260916031500/)
  })
})
