/**
 * The pack names its month the same wherever it is rendered.
 *
 * The month labels came from `new Date(report_month + '-01')` — UTC midnight —
 * read back by a local-time formatter. Anywhere west of Greenwich that is the
 * month BEFORE the report's: an August pack rendered in Los Angeles printed
 * "August 2026" on the cover as "July 2026", and every statement header as
 * "MONTH: JUL 2026". In January it lost the year as well ("2026-01" → "Dec 25"
 * on the short column headings).
 *
 * Nothing was ever mislabelled for a client: Vercel renders in UTC and every
 * coach is in Australia (UTC+10/+11 — a positive offset does not shift a UTC
 * midnight backwards). But a CFO pack whose month depends on where it was
 * rendered is wrong on its face, and it made the golden digest tests fail for
 * anyone running them outside UTC.
 *
 * Los Angeles is the behind-UTC zone here (−7/−8). Setting process.env.TZ
 * mid-process re-reads the zone on Node 20, so the assertions below are a real
 * render under a negative offset, not a simulated one. The zone is restored
 * afterwards so the rest of the suite is unaffected.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }))

import { MonthlyReportPDFService } from '../monthly-report-pdf-service'
import { fixtureReport } from './pdf-pack-fixture'
import { packMonthLong, packMonthYear, packMonthYY, packMonthAbbr, packPriorMonth } from '../pack-style'

/** Every page's content stream, joined — the text jsPDF actually drew. */
function streams(doc: ReturnType<MonthlyReportPDFService['generate']>): string {
  const internal = (doc as unknown as { internal: { getNumberOfPages(): number; pages: string[][] } }).internal
  const pages: string[] = []
  for (let p = 1; p <= internal.getNumberOfPages(); p++) pages.push(internal.pages[p].join('\n'))
  return pages.join('\n<page>\n')
}

/** The capture date the goldens pin, so "Prepared on" is not the day this runs. */
const preparedOn = { at: '2026-09-16T01:22:18.913Z', basis: 'finalised' as const }

/** The default page order: the cover plus every statement header. */
const renderPack = () => streams(new MonthlyReportPDFService(fixtureReport(), { preparedOn } as never).generate())

describe('the month labels are derived from the month key, not from an instant', () => {
  it("'2026-08' is August wherever it is read", () => {
    expect(packMonthLong('2026-08')).toBe('August 2026')
    expect(packMonthYear('2026-08')).toBe('Aug 2026')
    expect(packMonthYY('2026-08')).toBe('Aug 26')
    expect(packMonthAbbr('2026-08')).toBe('Aug')
  })

  it('January keeps its year — the case that lost one', () => {
    expect(packMonthLong('2026-01')).toBe('January 2026')
    expect(packMonthYY('2026-01')).toBe('Jan 26')
  })

  it('September is Calxa’s "Sep", never en-AU’s "Sept"', () => {
    expect(packMonthYear('2026-09')).toBe('Sep 2026')
    expect(packMonthYY('2026-09')).toBe('Sep 26')
    expect(packMonthAbbr('2026-09')).toBe('Sep')
  })

  it('the prior month wraps the year in January', () => {
    expect(packPriorMonth('2026-08')).toBe('2026-07')
    expect(packPriorMonth('2026-01')).toBe('2025-12')
    expect(packMonthYY(packPriorMonth('2026-01'))).toBe('Dec 25')
  })

  it('anything that is not a month key comes back as it went in', () => {
    expect(packMonthLong('')).toBe('')
    expect(packMonthLong('2026-13')).toBe('2026-13')
    expect(packMonthYY('not a month')).toBe('not a month')
    expect(packPriorMonth('2026-13')).toBe('2026-13')
  })
})

describe('an August pack rendered west of Greenwich', () => {
  const original = process.env.TZ
  let utc = ''

  beforeAll(() => {
    process.env.TZ = 'UTC'
    utc = renderPack()
    process.env.TZ = 'America/Los_Angeles'
  })

  afterAll(() => {
    process.env.TZ = original
  })

  it('is rendering under a genuinely behind-UTC zone', () => {
    // Guards the test itself: if setting TZ mid-process ever stopped working,
    // every assertion below would pass for the wrong reason.
    expect(new Date('2026-08-01').getMonth()).toBe(6) // July, locally
  })

  it('still says August on the cover and in every statement header', () => {
    const la = renderPack()
    expect(la).toContain('(August 2026) Tj')
    expect(la).toContain('(MONTH: AUG 2026) Tj')
    expect(la).not.toContain('(July 2026) Tj')
    expect(la).not.toContain('(MONTH: JUL 2026) Tj')
  })

  it('draws byte-for-byte what it draws in UTC', () => {
    expect(renderPack()).toBe(utc)
  })
})
