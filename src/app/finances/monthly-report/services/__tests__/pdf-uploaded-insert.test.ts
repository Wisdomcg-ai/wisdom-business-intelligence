/**
 * Uploaded pages, through the real pack: jsPDF draws the pack with placeholder
 * sheets, pdf-lib swaps the upload's pages in (services/pack-pdf).
 *
 * What is proved:
 *   - a 2-page upload lands at its layout position, the pages after it move
 *     down, and every page — the uploaded ones included — reads "Page X of N"
 *     with the final N;
 *   - DD's shape: cover, then the Lumary page as page 2;
 *   - a month with nothing uploaded prints a card saying so, in the page's
 *     place, and the pre-flight row warns;
 *   - a placement that could not be added prints one plain sentence — the
 *     reason (a file that would not open, a failed download, a database not
 *     yet migrated) is the coach's, in pre-flight, never on the client's page;
 *   - an unreadable or encrypted file is reported to Sentry under an
 *     invariant tag;
 *   - a pack that places no uploaded page is byte-for-byte the file the
 *     service wrote before this existed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sentry = vi.hoisted(() => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('@sentry/nextjs', () => sentry)

import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { buildPackPdf, preparePackInserts } from '../pack-pdf'
import { fixtureReport, pageContaining, textRuns } from './pdf-pack-fixture'
import { uploadedPdf, encryptedPdf, readPages, A4, LETTER, LETTER_LANDSCAPE } from './pack-insert-test-pdf'
import type { PDFLayout, LayoutWidget } from '../../types/pdf-layout'
import { INSERTS_NOT_LOADED_REASON, INSERTS_NOT_SET_UP_REASON, insertPreflightRow } from '@/lib/monthly-report/pack-inserts'

const widget = (id: string, type: LayoutWidget['type'], extra: Partial<LayoutWidget> = {}): LayoutWidget => ({
  id, type, col: 0, row: 0, colSpan: 2, rowSpan: 3, ...extra,
})

/** Executive summary, the upload, then the memo — one sheet each apart from the upload. */
function packLayout(): PDFLayout {
  return {
    version: 1,
    pages: [
      { id: 'p1', orientation: 'portrait', widgets: [widget('es', 'executive_summary')] },
      { id: 'p2', orientation: 'portrait', widgets: [widget('lumary', 'uploaded_insert', { titleOverride: 'Lumary Income Analysis' })] },
      { id: 'p3', orientation: 'portrait', widgets: [widget('memo', 'memo')] },
    ],
  }
}

const MEMO = 'August was steady.'
/** What the client's page says for a placement whose file could not be added, whatever the reason. */
const NOT_ADDED = "The Lumary Income Analysis page for August 2026 couldn't be added to this pack."

/** A jsPDF page's text as one line — a card's message wraps over several show-text runs. */
const pageLine = (doc: any, page: number) => textRuns(doc, page).join(' ').replace(/\\([()])/g, '$1')
/** The first jsPDF page whose text, as one line, contains `needle`; -1 if none. */
const pageSaying = (doc: any, needle: string) => {
  for (let i = 1; i <= doc.getNumberOfPages(); i++) if (pageLine(doc, i).includes(needle)) return i
  return -1
}

beforeEach(() => {
  sentry.captureException.mockClear()
  sentry.captureMessage.mockClear()
})

describe('a 2-page upload', () => {
  it('lands at its layout position, and every page is numbered against the final count', async () => {
    const pack = await buildPackPdf(fixtureReport(), { pdfLayout: packLayout(), memo: MEMO }, {
      lumary: { status: 'file', bytes: await uploadedPdf('LUMARY'), filename: 'lumary-aug.pdf' },
    })
    expect(pack.merged).toBe(true)
    const pages = await readPages(pack.bytes)
    expect(pages.map((p) => p.size)).toEqual([A4, LETTER, LETTER_LANDSCAPE, A4])

    // The upload's own content, in order, where the placement is.
    expect(pages[1].text).toContain('LUMARY 1')
    expect(pages[2].text).toContain('LUMARY 2')
    // The pages around it are the pack's.
    expect(pages[0].text).toContain('Actual vs Budget')
    expect(pages[3].text).toContain(MEMO)

    // "Page X of 4" on all four: jsPDF's footer on its own sheets, the stamp on the upload's.
    pages.forEach((p, i) => expect(p.text, `page ${i + 1}`).toContain(`Page ${i + 1} of 4`))
    // Nothing of the placeholder sheets survives.
    expect(pages.map((p) => p.text).join('\n')).not.toContain('goes here')
  })

  it('the placeholder sheets jsPDF drew are exactly the pages the upload replaced', async () => {
    const pack = await buildPackPdf(fixtureReport(), { pdfLayout: packLayout(), memo: MEMO }, {
      lumary: { status: 'file', bytes: await uploadedPdf('LUMARY'), filename: 'lumary-aug.pdf' },
    })
    expect(pack.service.insertPlaceholders).toEqual([{ widgetId: 'lumary', firstPage: 2, pageCount: 2 }])
    expect(pageContaining(pack.doc, 'Page 4 of 4')).toBe(4)
  })
})

describe("Distinct Directions' shape — the Lumary insert is page 2", () => {
  it('cover, then the uploaded page, then the statements', async () => {
    const layout: PDFLayout = {
      version: 1,
      pages: [
        { id: 'c', orientation: 'portrait', widgets: [widget('cover', 'cover_page')] },
        { id: 'l', orientation: 'portrait', widgets: [widget('lumary', 'uploaded_insert', { titleOverride: 'Lumary Income Analysis' })] },
        { id: 'e', orientation: 'landscape', widgets: [widget('es', 'executive_summary', { colSpan: 3 })] },
      ],
    }
    const pack = await buildPackPdf(fixtureReport(), { pdfLayout: layout }, {
      lumary: { status: 'file', bytes: await uploadedPdf('LUMARY INCOME', [LETTER_LANDSCAPE]), filename: 'lumary.pdf' },
    })
    const pages = await readPages(pack.bytes)
    expect(pages).toHaveLength(3)
    expect(pages[1].size).toEqual(LETTER_LANDSCAPE)
    expect(pages[1].text).toContain('LUMARY INCOME 1')
    expect(pages[1].text).toContain('Page 2 of 3')
    // The cover carries no number, as before.
    expect(pages[0].text).not.toMatch(/Page \d of/)
    expect(pages[2].text).toContain('Page 3 of 3')
  })
})

describe('nothing uploaded for the month', () => {
  it('prints a card in the page\'s place — the pack is never silently a page short', async () => {
    const pack = await buildPackPdf(fixtureReport(), { pdfLayout: packLayout(), memo: MEMO }, { lumary: { status: 'missing' } })
    expect(pack.merged).toBe(false)
    const doc: any = pack.doc
    expect(doc.getNumberOfPages()).toBe(3)
    expect(pageSaying(doc, "The Lumary Income Analysis page for August 2026 hasn't been uploaded.")).toBe(2)
    expect(pageContaining(doc, MEMO)).toBe(3)
    // The file is jsPDF's own output.
    expect(pack.bytes).toEqual(new Uint8Array(doc.output('arraybuffer')))
  })

  it('and the pre-flight row warns, naming the page', async () => {
    const prepared = await preparePackInserts(packLayout(), { lumary: { status: 'missing' } })
    const row = insertPreflightRow(prepared.placements, '2026-08')
    expect(row?.status).toBe('warn')
    expect(row?.detail).toContain('Lumary Income Analysis has not been uploaded for August 2026')
  })

  it('an export that never loaded the uploads still prints the page, not a blank — without saying why to the client', async () => {
    const pack = await buildPackPdf(fixtureReport(), { pdfLayout: packLayout(), memo: MEMO }, undefined)
    expect(pageSaying(pack.doc, NOT_ADDED)).toBe(2)
    expect(pageSaying(pack.doc, INSERTS_NOT_LOADED_REASON)).toBe(-1)
  })
})

describe("the client's page never carries the coach's reason", () => {
  it.each([
    INSERTS_NOT_SET_UP_REASON,
    INSERTS_NOT_LOADED_REASON,
    'the uploaded file lumary-aug.pdf could not be downloaded',
  ])('unavailable (%s): the plain sentence, and none of the reason', async (reason) => {
    const pack = await buildPackPdf(fixtureReport(), { pdfLayout: packLayout(), memo: MEMO }, { lumary: { status: 'unavailable', reason } })
    expect(pageSaying(pack.doc, NOT_ADDED)).toBe(2)
    expect(pageSaying(pack.doc, reason)).toBe(-1)
    const all = Array.from({ length: (pack.doc as any).getNumberOfPages() }, (_, i) => pageLine(pack.doc, i + 1)).join(' ')
    expect(all).not.toMatch(/migration|database|20260916031500/)
  })
})

describe('a file the pack cannot use', () => {
  it('unreadable: the page says it could not be added, the coach\'s pre-flight says why, and Sentry hears it under an invariant tag', async () => {
    const junk = new TextEncoder().encode('%PDF-1.4\nthis is not really a pdf at all')
    const sources = { lumary: { status: 'file' as const, bytes: junk, filename: 'broken.pdf' } }
    const pack = await buildPackPdf(fixtureReport(), { pdfLayout: packLayout(), memo: MEMO }, sources)
    expect(pack.merged).toBe(false)
    expect(pageSaying(pack.doc, NOT_ADDED)).toBe(2)
    expect(pageSaying(pack.doc, 'the PDF could not be read')).toBe(-1)
    expect(insertPreflightRow(pack.inserts, '2026-08')?.detail).toContain("Lumary Income Analysis can't be added: the PDF could not be read")
    const tags = [...sentry.captureException.mock.calls, ...sentry.captureMessage.mock.calls].map((c: any[]) => c[1]?.tags?.invariant)
    expect(tags).toContain('pack-insert-unreadable')
  })

  it('encrypted: the reason the coach can act on is in pre-flight, not on the client\'s page', async () => {
    const pack = await buildPackPdf(fixtureReport(), { pdfLayout: packLayout(), memo: MEMO }, {
      lumary: { status: 'file', bytes: encryptedPdf(), filename: 'payroll.pdf' },
    })
    expect(pageSaying(pack.doc, NOT_ADDED)).toBe(2)
    expect(pageSaying(pack.doc, 'encrypted')).toBe(-1)
    expect(insertPreflightRow(pack.inserts, '2026-08')?.detail).toContain('the PDF is encrypted or password-protected')
    const tags = [...sentry.captureException.mock.calls, ...sentry.captureMessage.mock.calls].map((c: any[]) => c[1]?.tags?.invariant)
    expect(tags).toContain('pack-insert-unreadable')
  })
})

describe('an uploaded page placed on a sheet with another widget', () => {
  it('takes whole sheets of its own; the widgets either side keep theirs', async () => {
    const layout: PDFLayout = {
      version: 1,
      pages: [
        {
          id: 'shared',
          orientation: 'portrait',
          widgets: [
            widget('memo', 'memo', { rowSpan: 1 }),
            widget('lumary', 'uploaded_insert', { row: 1, rowSpan: 1 }),
            widget('kpi', 'kpi_revenue', { row: 2, colSpan: 1, rowSpan: 1 }),
          ],
        },
      ],
    }
    const pack = await buildPackPdf(fixtureReport(), { pdfLayout: layout, memo: MEMO }, {
      lumary: { status: 'file', bytes: await uploadedPdf('UP', [LETTER]), filename: 'up.pdf' },
    })
    const pages = await readPages(pack.bytes)
    expect(pages.map((p) => p.size)).toEqual([A4, LETTER, A4])
    expect(pages[0].text).toContain(MEMO)
    expect(pages[1].text).toContain('UP 1')
    expect(pages[2].text).toContain('Revenue')
  })
})

describe('a pack with no uploaded page is the file it always was', () => {
  // jsPDF stamps a random file id and the time; hold both still so two
  // renders of the same pack can be compared byte for byte.
  // A seeded sequence, restarted before each render, rather than one constant:
  // jsPDF also names its event subscriptions with Math.random.
  let seed = 1
  const reseed = () => { seed = 1 }
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-16T01:00:00Z'))
    vi.spyOn(Math, 'random').mockImplementation(() => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const withoutInsert: PDFLayout = {
    version: 1,
    pages: [
      { id: 'p1', orientation: 'portrait', widgets: [widget('es', 'executive_summary')] },
      { id: 'p2', orientation: 'portrait', widgets: [widget('memo', 'memo')] },
    ],
  }

  it('a layout: byte-identical to the service\'s own output, whatever sources are handed in', async () => {
    reseed()
    const before = new Uint8Array(new MonthlyReportPDFService(fixtureReport(), { pdfLayout: withoutInsert, memo: MEMO }).generate().output('arraybuffer'))
    reseed()
    const after = await buildPackPdf(fixtureReport(), { pdfLayout: withoutInsert, memo: MEMO }, { stray: { status: 'missing' } })
    expect(after.merged).toBe(false)
    expect(Buffer.from(after.bytes).equals(Buffer.from(before))).toBe(true)
  })

  it('the legacy page order: byte-identical too', async () => {
    reseed()
    const before = new Uint8Array(new MonthlyReportPDFService(fixtureReport(), { memo: MEMO }).generate().output('arraybuffer'))
    reseed()
    const after = await buildPackPdf(fixtureReport(), { memo: MEMO }, undefined)
    expect(Buffer.from(after.bytes).equals(Buffer.from(before))).toBe(true)
  })
})
