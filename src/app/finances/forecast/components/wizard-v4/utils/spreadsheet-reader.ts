/**
 * Spreadsheet reader for the P&L upload path.
 *
 * Replaces the `xlsx` (SheetJS) library, which carries an unfixable
 * prototype-pollution + ReDoS advisory and was the one place untrusted user
 * uploads were parsed. We now read `.xlsx` with `exceljs` (already a project
 * dependency, used server-side by excel-export-service) and parse `.csv`
 * ourselves. Legacy binary `.xls` is not supported by exceljs; callers get a
 * clear, actionable error.
 *
 * The public surface mirrors what the parser needs: a dense 2-D array of cell
 * values with empty cells represented as '' — exactly the shape the old
 * `XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })` produced.
 */

/** Thrown for inputs we intentionally don't support (e.g. legacy .xls). */
export class UnsupportedSpreadsheetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedSpreadsheetError'
  }
}

/**
 * Parse CSV text into a 2-D string array. RFC-4180: handles quoted fields,
 * escaped quotes (""), and commas/newlines inside quotes; tolerates LF, CRLF
 * and lone-CR line endings and a leading BOM.
 */
export function parseCsv(input: string): string[][] {
  let text = input
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // strip BOM

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++ // consume the escaped quote
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      endField()
    } else if (c === '\n') {
      endRow()
    } else if (c === '\r') {
      if (text[i + 1] === '\n') i++ // treat CRLF as a single terminator
      endRow()
    } else {
      field += c
    }
  }

  // Flush a trailing field/row when the file doesn't end in a newline.
  if (field !== '' || row.length > 0) endRow()

  return rows
}

/**
 * Coerce an exceljs cell value into the primitive the parser expects. exceljs
 * returns rich objects for formulas, hyperlinks, rich text and errors; the old
 * SheetJS path produced plain primitives.
 */
function normalizeCell(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>
    // Formula / shared-formula cell: use the computed result.
    if ('result' in v && v.result !== undefined) return normalizeCell(v.result)
    // Hyperlink cell: { text, hyperlink }.
    if (typeof v.text === 'string') return v.text
    // Rich-text cell: { richText: [{ text }, ...] }.
    if (Array.isArray(v.richText)) {
      return (v.richText as Array<{ text?: string }>).map((t) => t.text ?? '').join('')
    }
    // Error cell (e.g. #REF!) → treat as empty.
    return ''
  }
  return ''
}

/** Build a dense 2-D array from an exceljs worksheet (rows/cols are 1-indexed). */
function worksheetToRows(worksheet: import('exceljs').Worksheet): (string | number | boolean)[][] {
  const maxCol = worksheet.columnCount
  const rows: (string | number | boolean)[][] = []
  for (let r = 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r)
    const dense: (string | number | boolean)[] = []
    for (let c = 1; c <= maxCol; c++) {
      dense.push(normalizeCell(row.getCell(c).value))
    }
    rows.push(dense)
  }
  return rows
}

async function readXlsxRows(buffer: ArrayBuffer): Promise<(string | number | boolean)[][]> {
  // Dynamic import keeps exceljs out of the initial wizard bundle — it only
  // loads when a user actually uploads a spreadsheet.
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  if (workbook.worksheets.length === 0) return []

  // Prefer a sheet that looks like a P&L; otherwise the first sheet.
  let worksheet = workbook.worksheets[0]
  for (const ws of workbook.worksheets) {
    const lower = ws.name.toLowerCase()
    if (lower.includes('p&l') || lower.includes('profit') || lower.includes('income')) {
      worksheet = ws
      break
    }
  }

  return worksheetToRows(worksheet)
}

/**
 * Read a user-uploaded spreadsheet into a dense 2-D array of cell values.
 * Detects the format by magic bytes (with filename as a fallback):
 *   - ZIP header (PK) or `.xlsx`  → exceljs
 *   - OLE header or `.xls`        → UnsupportedSpreadsheetError
 *   - anything else               → CSV text
 */
export async function readSheetRows(file: File): Promise<(string | number | boolean)[][]> {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  const name = (file.name || '').toLowerCase()

  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b // "PK" → xlsx (zip)
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf // legacy .xls (OLE2)

  if (isOle || (name.endsWith('.xls') && !isZip)) {
    throw new UnsupportedSpreadsheetError(
      'Legacy .xls files are not supported. Please re-export your P&L as .xlsx or CSV.',
    )
  }

  if (isZip || name.endsWith('.xlsx')) {
    return readXlsxRows(arrayBuffer)
  }

  // Default: treat as CSV/plain text.
  const text = new TextDecoder().decode(arrayBuffer)
  return parseCsv(text)
}
