/**
 * Tests for the exceljs/CSV spreadsheet reader that replaced the `xlsx`
 * (SheetJS) dependency on the untrusted P&L-upload path.
 *
 * Covers the CSV tokenizer edge cases, the exceljs .xlsx round-trip (dense
 * output, P&L-sheet preference, cell-value normalization) and the deliberate
 * rejection of legacy .xls — plus one end-to-end parsePLFile run to prove the
 * whole parser still yields correct PriorYearData.
 */

import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  parseCsv,
  readSheetRows,
  UnsupportedSpreadsheetError,
} from '../spreadsheet-reader'
import { parsePLFile } from '../parsePLFile'

describe('parseCsv', () => {
  it('parses a simple grid', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('handles quoted fields with commas and escaped quotes', () => {
    expect(parseCsv('name,note\n"Smith, Co","he said ""hi"""')).toEqual([
      ['name', 'note'],
      ['Smith, Co', 'he said "hi"'],
    ])
  })

  it('handles newlines inside quoted fields', () => {
    expect(parseCsv('a,"line1\nline2",c')).toEqual([['a', 'line1\nline2', 'c']])
  })

  it('handles CRLF, lone CR and a leading BOM', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('flushes a trailing row with no final newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

async function xlsxFile(
  build: (wb: ExcelJS.Workbook) => void,
  name = 'test.xlsx',
): Promise<File> {
  const wb = new ExcelJS.Workbook()
  build(wb)
  const buffer = await wb.xlsx.writeBuffer()
  return new File([buffer], name)
}

describe('readSheetRows — .xlsx via exceljs', () => {
  it('returns a dense 2-D array of primitive cell values', async () => {
    const file = await xlsxFile((wb) => {
      const ws = wb.addWorksheet('Sheet1')
      ws.addRow(['Account', 'Total'])
      ws.addRow(['Sales', 1000])
    })
    const rows = await readSheetRows(file)
    expect(rows[0]).toEqual(['Account', 'Total'])
    expect(rows[1]).toEqual(['Sales', 1000])
  })

  it('prefers a P&L-looking sheet over the first sheet', async () => {
    const file = await xlsxFile((wb) => {
      wb.addWorksheet('Cover').addRow(['ignore me'])
      const pl = wb.addWorksheet('Profit and Loss')
      pl.addRow(['Revenue', 500])
    })
    const rows = await readSheetRows(file)
    expect(rows[0]).toEqual(['Revenue', 500])
  })

  it('normalizes formula cells to their computed result', async () => {
    const file = await xlsxFile((wb) => {
      const ws = wb.addWorksheet('Sheet1')
      const row = ws.addRow(['x'])
      row.getCell(2).value = { formula: 'A1', result: 42 } as ExcelJS.CellFormulaValue
    })
    const rows = await readSheetRows(file)
    expect(rows[0][1]).toBe(42)
  })
})

describe('readSheetRows — legacy .xls rejection', () => {
  it('rejects an OLE-header file', async () => {
    const file = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], 'old.xls')
    await expect(readSheetRows(file)).rejects.toBeInstanceOf(UnsupportedSpreadsheetError)
  })

  it('rejects a .xls filename that is not a zip', async () => {
    const file = new File([new Uint8Array([0x01, 0x02, 0x03])], 'old.xls')
    await expect(readSheetRows(file)).rejects.toBeInstanceOf(UnsupportedSpreadsheetError)
  })
})

describe('parsePLFile — end-to-end via CSV', () => {
  it('extracts revenue, COGS and opex from a P&L CSV', async () => {
    // NOTE: account names containing "income"/"revenue" are treated as section
    // headers by the parser (pre-existing behavior), so the revenue line here
    // is named to avoid that collision.
    const csv = [
      'Account,Total',
      'Revenue',
      'Consulting Fees,120000',
      'Cost of Sales',
      'Materials,40000',
      'Operating Expenses',
      'Rent,24000',
      'Total Expenses,64000',
    ].join('\n')
    const file = new File([csv], 'pl.csv', { type: 'text/csv' })

    const result = await parsePLFile(file)

    expect(result.success).toBe(true)
    expect(result.data!.revenue.total).toBe(120000)
    expect(result.data!.cogs.total).toBe(40000)
    // Rent is opex; the "Total Expenses" summary row is skipped.
    expect(result.data!.opex.byLine.some((l) => l.name === 'Rent')).toBe(true)
    expect(result.data!.opex.byLine.some((l) => /total/i.test(l.name))).toBe(false)
  })

  it('surfaces a friendly error for a legacy .xls upload', async () => {
    const file = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], 'old.xls')
    const result = await parsePLFile(file)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/\.xls/i)
  })
})
