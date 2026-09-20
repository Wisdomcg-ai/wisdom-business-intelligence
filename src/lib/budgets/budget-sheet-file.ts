/**
 * An uploaded budget file → a grid of cells.
 *
 * CSV goes through the parser the P&L upload already uses (RFC-4180, BOM, CRLF
 * — spreadsheet-reader.ts), and .xlsx through exceljs, which is already a
 * dependency. Legacy binary .xls is refused with something a coach can act on
 * rather than read as a broken page.
 *
 * Unlike the P&L reader this does not go looking for a sheet called "P&L": a
 * budget workbook's tab is named for the budget version (Calxa's import wizard
 * asks for exactly that), so the FIRST sheet is the one, unless a later one
 * names the fiscal year and the first does not look like a grid.
 */
import { parseCsv } from '@/app/finances/forecast/components/wizard-v4/utils/spreadsheet-reader'
import type { Cell } from './budget-spreadsheet'

/** exceljs hands back rich objects for formulas, hyperlinks and rich text. */
function normalizeCell(value: unknown): Cell {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>
    if ('result' in v && v.result !== undefined) return normalizeCell(v.result)
    if (typeof v.text === 'string') return v.text
    if (Array.isArray(v.richText)) return (v.richText as Array<{ text?: string }>).map((t) => t.text ?? '').join('')
    return ''
  }
  return ''
}

export async function readBudgetSheetCells(file: File): Promise<Cell[][]> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const name = (file.name || '').toLowerCase()
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b // "PK" — xlsx is a zip
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf // legacy .xls

  if (isOle || (name.endsWith('.xls') && !isZip)) {
    throw new Error('Legacy .xls files cannot be read. Save the budget as .xlsx or CSV and upload it again.')
  }

  if (isZip || name.endsWith('.xlsx')) {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const worksheet = workbook.worksheets[0]
    if (!worksheet) throw new Error('That workbook has no sheets in it.')
    const rows: Cell[][] = []
    for (let r = 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r)
      const dense: Cell[] = []
      for (let c = 1; c <= worksheet.columnCount; c++) dense.push(normalizeCell(row.getCell(c).value))
      rows.push(dense)
    }
    return rows
  }

  return parseCsv(new TextDecoder().decode(buffer)) as Cell[][]
}
