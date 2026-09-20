import { describe, it, expect } from 'vitest'
import { packPdfFilename } from '../pack-filename'

describe('packPdfFilename', () => {
  it('names the company and the month, the way the Calxa packs are named', () => {
    expect(packPdfFilename('Distinct Directions', '2026-08')).toBe('Distinct Directions Monthly Report - August 2026.pdf')
  })

  it('accepts a period month with a day (the send flow passes YYYY-MM-01)', () => {
    expect(packPdfFilename('Urban Road', '2026-08-01')).toBe('Urban Road Monthly Report - August 2026.pdf')
  })

  it('reads the month from the string, not a Date, so no timezone moves it', () => {
    expect(packPdfFilename('IICT Group', '2026-12')).toBe('IICT Group Monthly Report - December 2026.pdf')
    expect(packPdfFilename('IICT Group', '2027-01')).toBe('IICT Group Monthly Report - January 2027.pdf')
  })

  it('removes characters a file name cannot carry and tidies the spacing', () => {
    expect(packPdfFilename('  A/B: Roofing*  "Group" <Pty> | Ltd?.  ', '2026-08'))
      .toBe('A B Roofing Group Pty Ltd Monthly Report - August 2026.pdf')
  })

  it('keeps ordinary punctuation such as & and +', () => {
    expect(packPdfFilename('Dragon Roofing + Easy Hail & Co', '2026-08'))
      .toBe('Dragon Roofing + Easy Hail & Co Monthly Report - August 2026.pdf')
  })

  it('falls back to the plain title when there is no usable name', () => {
    expect(packPdfFilename(null, '2026-08')).toBe('Monthly Report - August 2026.pdf')
    expect(packPdfFilename('   ', '2026-08')).toBe('Monthly Report - August 2026.pdf')
    expect(packPdfFilename('///', '2026-08')).toBe('Monthly Report - August 2026.pdf')
  })

  it('shortens a very long name rather than producing an unwieldy file name', () => {
    const name = 'X'.repeat(200)
    const out = packPdfFilename(name, '2026-08')
    expect(out.endsWith(' Monthly Report - August 2026.pdf')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(80 + ' Monthly Report - August 2026.pdf'.length)
  })

  it('never invents a month from a malformed period', () => {
    expect(packPdfFilename('Urban Road', 'bad')).toBe('Urban Road Monthly Report.pdf')
  })
})
