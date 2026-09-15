/**
 * Opening an upload, and the page number on a page the pack did not draw.
 */
import { describe, it, expect } from 'vitest'
import { PDFDocument, degrees } from 'pdf-lib'
import { inspectInsertPdf, footerPlacement, mergePackInserts } from '../pack-insert-pdf'
import {
  INSERTS_NOT_LOADED_REASON,
  INSERTS_NOT_SET_UP_REASON,
  MAX_INSERT_BYTES,
  MAX_INSERT_PAGES,
  SENDABLE_PACK_BYTES,
  insertCardMessage,
  insertPlacements,
  insertPreflightRow,
  latestInsertByWidget,
  packTooLargeToEmailReason,
  type PackInsertRecord,
} from '../pack-inserts'
import { uploadedPdf, encryptedPdf, readPages, LETTER } from '@/app/finances/monthly-report/services/__tests__/pack-insert-test-pdf'

describe('inspectInsertPdf', () => {
  it('a readable PDF: its page count, and a document to merge', async () => {
    const r = await inspectInsertPdf(await uploadedPdf('X'))
    expect(r.ok && r.pageCount).toBe(2)
  })

  it('refuses, with a reason, what the pack cannot use', async () => {
    const kinds = async (bytes: Uint8Array, opts?: { maxBytes?: number }) => {
      const r = await inspectInsertPdf(bytes, opts)
      return r.ok ? 'ok' : `${r.kind}: ${r.reason}`
    }
    expect(await kinds(new Uint8Array())).toBe('empty: the file is empty')
    expect(await kinds(new TextEncoder().encode('PK a spreadsheet'))).toBe('not_pdf: the file is not a PDF')
    expect(await kinds(encryptedPdf())).toMatch(/^encrypted: the PDF is encrypted or password-protected/)
    expect(await kinds(new TextEncoder().encode('%PDF-1.7\n%%EOF'))).toMatch(/^unreadable: the PDF could not be read/)
    const big = await uploadedPdf('X')
    expect(await kinds(big, { maxBytes: big.length - 1 })).toMatch(/^too_large: the file is .* at most .*Approve & Send/)
  })

  it('a file with more pages than any insert is taken for the wrong file', async () => {
    const r = await inspectInsertPdf(await uploadedPdf('X', Array.from({ length: MAX_INSERT_PAGES + 1 }, () => LETTER)))
    expect(r.ok ? 'ok' : r.kind).toBe('too_many_pages')
  })

  it('the email carries a pack of SENDABLE_PACK_BYTES inside a 4.5 MB request, base64, with room for the snapshot', () => {
    expect(Math.ceil(SENDABLE_PACK_BYTES / 3) * 4).toBeLessThanOrEqual(4_000_000)
  })

  it('a file at the upload limit is not one no email could carry: it leaves the pack its own pages', () => {
    // A lean pack's own pages (the fixture pack with a placeholder sheet) are ~310 KB.
    expect(MAX_INSERT_BYTES + 512 * 1024).toBeLessThanOrEqual(SENDABLE_PACK_BYTES)
  })
})

describe('packTooLargeToEmailReason — the one size check pre-flight and Approve & Send share', () => {
  const MB = 1024 * 1024
  const ready = (label: string, sizeBytes: number) => ({ widgetId: label, label, state: { status: 'ready' as const, pageCount: 1, filename: `${label}.pdf`, sizeBytes } })

  it('nothing to say at or under what an email carries', () => {
    expect(packTooLargeToEmailReason(SENDABLE_PACK_BYTES, [ready('Payroll', 2 * MB)])).toBeNull()
    expect(packTooLargeToEmailReason(1000, [])).toBeNull()
  })

  it('one upload: its size, and how much smaller it has to be — rounded UP, so doing it is enough', () => {
    // The reviewer's pack: 3,364,983 bytes with a 3,052,627-byte upload.
    const reason = packTooLargeToEmailReason(3_364_983, [ready('Employment Hero Payroll', 3_052_627)])
    expect(reason).toBe('the pack with its uploaded pages is 3.2 MB, too large to email: Employment Hero Payroll (2.9 MB) has to be at least 357 KB smaller')
    // 364,983 bytes over: 356 KB smaller would not be enough.
    expect(357 * 1024).toBeGreaterThanOrEqual(3_364_983 - SENDABLE_PACK_BYTES)
    expect(356 * 1024).toBeLessThan(3_364_983 - SENDABLE_PACK_BYTES)
  })

  it('over by a megabyte or more: said in MB, rounded up', () => {
    expect(packTooLargeToEmailReason(SENDABLE_PACK_BYTES + 1_100_000, [ready('Payroll', 2_000_000)]))
      .toBe('the pack with its uploaded pages is 3.9 MB, too large to email: Payroll (1.9 MB) has to be at least 1.1 MB smaller')
  })

  it('under a megabyte over: said in KB, rounded up', () => {
    expect(packTooLargeToEmailReason(SENDABLE_PACK_BYTES + 40_000, [ready('Lumary', 900_000)]))
      .toBe('the pack with its uploaded pages is 2.9 MB, too large to email: Lumary (879 KB) has to be at least 40 KB smaller')
  })

  it('two uploads: between them', () => {
    expect(packTooLargeToEmailReason(3_500_000, [ready('Cash vs Accruals', 1_600_000), ready('Hubstaff', 1_600_000)]))
      .toBe('the pack with its uploaded pages is 3.3 MB, too large to email: Cash vs Accruals (1.5 MB) and Hubstaff (1.5 MB) have to be at least 489 KB smaller between them')
  })

  it("a pack whose own pages don't fit says so, rather than ask for an impossible cut", () => {
    expect(packTooLargeToEmailReason(3_400_000, [ready('Lumary', 100_000)]))
      .toBe('the pack with its uploaded pages is 3.2 MB, too large to email even without Lumary (98 KB)')
  })
})

describe('footerPlacement — bottom-right as the page is shown', () => {
  const mm = 72 / 25.4
  const box = { x: 0, y: 0, width: 612, height: 792 }

  it('an upright page: 15mm in from the right, 10mm up', () => {
    expect(footerPlacement(box, 0, 50)).toEqual({ x: 612 - 15 * mm - 50, y: 10 * mm, rotate: 0 })
  })

  it('a crop box off the origin moves with it', () => {
    const at = footerPlacement({ x: 20, y: 30, width: 612, height: 792 }, 0, 50)
    expect(at.x).toBeCloseTo(20 + 612 - 15 * mm - 50)
    expect(at.y).toBeCloseTo(30 + 10 * mm)
  })

  // /Rotate turns the page clockwise for display. Map each answer back to where
  // it is SHOWN and it must be the same corner as the upright page's.
  const shown = (turn: number, p: { x: number; y: number }) => {
    const { width: W, height: H } = box
    switch (turn) {
      case 90: return { vx: p.y, vy: W - p.x }
      case 180: return { vx: W - p.x, vy: H - p.y }
      case 270: return { vx: H - p.y, vy: p.x }
      default: return { vx: p.x, vy: p.y }
    }
  }

  it.each([90, 180, 270, -90, 450])('rotated %i°: the same visual corner, the text turned to read across', (rotation) => {
    const turn = ((rotation % 360) + 360) % 360
    const at = footerPlacement(box, rotation, 50)
    const visualWidth = turn === 90 || turn === 270 ? box.height : box.width
    const v = shown(turn, at)
    expect(v.vx).toBeCloseTo(visualWidth - 15 * mm - 50)
    expect(v.vy).toBeCloseTo(10 * mm)
    expect(at.rotate).toBe(turn)
  })
})

describe('mergePackInserts', () => {
  async function pack(pages: number): Promise<Uint8Array> {
    const doc = await PDFDocument.create()
    for (let i = 0; i < pages; i++) doc.addPage([595.28, 841.89])
    return doc.save()
  }

  it('a rotated uploaded page is stamped and keeps its rotation', async () => {
    const up = await PDFDocument.load(await uploadedPdf('R', [LETTER]))
    up.getPage(0).setRotation(degrees(90))
    const doc = await PDFDocument.load(await up.save())
    const merged = await mergePackInserts(await pack(3), [{ widgetId: 'w', firstPage: 2, pageCount: 1 }], new Map([['w', doc]]))
    const back = await PDFDocument.load(merged)
    expect(back.getPage(1).getRotation().angle).toBe(90)
    expect((await readPages(merged))[1].text).toContain('Page 2 of 3')
  })

  it('two uploads in one pack, each in its own place', async () => {
    const a = (await inspectInsertPdf(await uploadedPdf('A', [LETTER]))) as { doc: PDFDocument }
    const b = (await inspectInsertPdf(await uploadedPdf('B'))) as { doc: PDFDocument }
    const merged = await mergePackInserts(
      await pack(6),
      [{ widgetId: 'b', firstPage: 4, pageCount: 2 }, { widgetId: 'a', firstPage: 2, pageCount: 1 }],
      new Map([['a', a.doc], ['b', b.doc]]),
    )
    const pages = await readPages(merged)
    expect(pages.map((p) => p.text.split('\n')[0] || '')).toEqual(['', 'A 1', '', 'B 1', 'B 2', ''])
    expect(pages[3].text).toContain('Page 4 of 6')
  })

  it('refuses a reservation that does not match its document, rather than drop a page', async () => {
    const a = (await inspectInsertPdf(await uploadedPdf('A'))) as { doc: PDFDocument }
    await expect(mergePackInserts(await pack(3), [{ widgetId: 'a', firstPage: 2, pageCount: 1 }], new Map([['a', a.doc]]))).rejects.toThrow(/2 pages but 1 were reserved/)
    await expect(mergePackInserts(await pack(2), [{ widgetId: 'a', firstPage: 2, pageCount: 2 }], new Map([['a', a.doc]]))).rejects.toThrow(/reserved pages 2-3 of 2/)
    await expect(mergePackInserts(await pack(3), [{ widgetId: 'x', firstPage: 2, pageCount: 1 }], new Map())).rejects.toThrow(/no document/)
  })
})

describe('placements, rows and the pre-flight row', () => {
  it('lists every uploaded-page placement in page order, named or not', () => {
    expect(insertPlacements({
      version: 1,
      pages: [
        { id: 'p1', orientation: 'portrait', widgets: [{ id: 'es', type: 'executive_summary', col: 0, row: 0, colSpan: 2, rowSpan: 3 }] },
        { id: 'p2', orientation: 'portrait', widgets: [{ id: 'a', type: 'uploaded_insert', col: 0, row: 0, colSpan: 2, rowSpan: 3, titleOverride: ' Cash vs Accruals ' }] },
        { id: 'p3', orientation: 'portrait', widgets: [{ id: 'b', type: 'uploaded_insert', col: 0, row: 0, colSpan: 2, rowSpan: 3 }] },
      ],
    })).toEqual([{ widgetId: 'a', label: 'Cash vs Accruals' }, { widgetId: 'b', label: 'Uploaded page' }])
    expect(insertPlacements(null)).toEqual([])
  })

  it('the newest upload per placement wins — a replacement is a new row', () => {
    const row = (id: string, widget_id: string, created_at: string) => ({ id, widget_id, created_at }) as PackInsertRecord
    const latest = latestInsertByWidget([row('1', 'a', '2026-09-01T00:00:00Z'), row('2', 'a', '2026-09-03T00:00:00Z'), row('3', 'b', '2026-09-02T00:00:00Z')])
    expect(latest.get('a')?.id).toBe('2')
    expect(latest.get('b')?.id).toBe('3')
  })

  it('no row for a pack with no uploaded page; pass when every file is ready; warn naming what is missing or unusable', () => {
    expect(insertPreflightRow([], '2026-08')).toBeNull()
    expect(insertPreflightRow([{ widgetId: 'a', label: 'Lumary', state: { status: 'ready', pageCount: 2, filename: 'l.pdf', sizeBytes: 4000 } }], '2026-08'))
      .toMatchObject({ status: 'pass', detail: '1 uploaded page for August 2026 (2 sheets) will be merged in.' })
    const warn = insertPreflightRow([
      { widgetId: 'a', label: 'Cash vs Accruals', state: { status: 'missing' } },
      { widgetId: 'b', label: 'Hubstaff', state: { status: 'unavailable', reason: 'the PDF is encrypted.' } },
    ], '2026-08')
    expect(warn?.status).toBe('warn')
    expect(warn?.detail).toBe('Cash vs Accruals has not been uploaded for August 2026 — the pack prints a notice in its place. Upload on the External Data tab. Hubstaff can\'t be added: the PDF is encrypted.')
  })

  it('every file ready but the built pack too large to email: warn, with the cut Approve & Send will ask for', () => {
    const placed = [{ widgetId: 'a', label: 'Employment Hero Payroll', state: { status: 'ready' as const, pageCount: 1, filename: 'eh.pdf', sizeBytes: 1_900_000 } }]
    const over = insertPreflightRow(placed, '2026-08', SENDABLE_PACK_BYTES + 200_000)
    expect(over?.status).toBe('warn')
    expect(over?.detail).toBe(
      `1 uploaded page for August 2026 (1 sheet) will be merged in, but ${packTooLargeToEmailReason(SENDABLE_PACK_BYTES + 200_000, placed)} — Approve & Send will refuse it until then.`,
    )
    // Measured and within what an email carries: pass, as before.
    expect(insertPreflightRow(placed, '2026-08', SENDABLE_PACK_BYTES)?.status).toBe('pass')
  })
})

describe("the card on the client's page", () => {
  it('nothing uploaded: says so', () => {
    expect(insertCardMessage('Lumary Income Analysis', '2026-08', { status: 'missing' })).toBe("The Lumary Income Analysis page for August 2026 hasn't been uploaded.")
  })

  it.each([
    INSERTS_NOT_SET_UP_REASON,
    INSERTS_NOT_LOADED_REASON,
    'the uploaded file eh-payroll.pdf could not be downloaded',
    'the PDF could not be read (Invalid PDF header)',
    'the PDF is encrypted or password-protected — open it and print it to a new PDF, then upload that',
  ])('could not be added (%s): one plain sentence — the reason is the coach\'s, not the client\'s', (reason) => {
    const card = insertCardMessage('Lumary Income Analysis', '2026-08', { status: 'unavailable', reason })
    expect(card).toBe("The Lumary Income Analysis page for August 2026 couldn't be added to this pack.")
    expect(card).not.toMatch(/migration|database|download|export|PDF|upload/i)
  })

  it('the not-set-up reason the coach sees names no migration file either', () => {
    expect(INSERTS_NOT_SET_UP_REASON).not.toMatch(/migration|\d{14}/)
  })
})
