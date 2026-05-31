/**
 * Pure parsers for Xero single-month P&L and Balance Sheet reports used by the
 * monthly-report sync route. Extracted from route.ts so they can be unit-tested
 * directly (Next.js App Router route files may only export route handlers).
 *
 * DM-N7: both parsers previously keyed their account Map by display NAME, so two
 * rows sharing a display name (distinct ledger accounts with the same name)
 * overwrote each other → understated section totals. They now AGGREGATE (sum)
 * same-named rows. xero_balance_sheet_lines is name-grouped (no account_id
 * column) and the consolidation engine groups by account_name, so summing here
 * yields the correct section total.
 */

// Xero summary/calculated rows — NOT real accounts
export const SUMMARY_ROW_NAMES = new Set([
  'gross profit', 'net profit', 'total income', 'total revenue',
  'total cost of sales', 'total direct costs', 'total operating expenses',
  'total expenses', 'total other income', 'total other expenses', 'operating profit',
])

// Map Xero BS section titles to account_type for xero_balance_sheet_lines
export function mapBSSectionToType(section: string): 'asset' | 'liability' | 'equity' | null {
  const t = section.trim().toLowerCase()
  // Xero uses plural "Assets"/"Liabilities"/"Equity"; also handle variants
  if (t.includes('asset')) return 'asset'
  if (t.includes('liabilit')) return 'liability'
  if (t.includes('equity') || t.includes('owner')) return 'equity'
  return null // skip unknown/nested sections
}

// Parse single-month P&L report — extracts account name + single value
export function parseSingleMonthReport(report: any): Map<string, { value: number; section: string }> {
  const accounts = new Map<string, { value: number; section: string }>()
  const rows = report.Rows || []

  for (const section of rows) {
    if (section.RowType !== 'Section' || !section.Rows) continue
    const sectionTitle = section.Title || 'Other'

    for (const row of section.Rows) {
      if (row.RowType !== 'Row' || !row.Cells) continue
      const name = row.Cells[0]?.Value
      if (!name) continue
      if (SUMMARY_ROW_NAMES.has(name.toLowerCase())) continue

      const value = parseFloat(row.Cells[1]?.Value || '0')
      if (!isNaN(value)) {
        // DM-N7: two rows can share a display name (distinct ledger accounts
        // with the same name). Keying the map by name alone made the second
        // row OVERWRITE the first → understated section totals. Aggregate
        // same-named rows instead of overwriting so the section total is right.
        const existing = accounts.get(name)
        accounts.set(name, {
          value: (existing?.value ?? 0) + value,
          section: existing?.section ?? sectionTitle,
        })
      }
    }
  }

  return accounts
}

// Parse BS report → Map<account_name, { value, section, account_type }>
// Skips Section headers, SummaryRow subtotals, and unmapped sections.
export function parseSingleMonthBSReport(
  report: any,
): Map<string, { value: number; section: string; account_type: 'asset' | 'liability' | 'equity' }> {
  const accounts = new Map<string, { value: number; section: string; account_type: 'asset' | 'liability' | 'equity' }>()
  const rows = report?.Rows || []
  for (const row of rows) {
    if (row.RowType !== 'Section' || !row.Rows) continue
    const sectionTitle = (row.Title || '').trim()
    const mappedType = mapBSSectionToType(sectionTitle)
    if (!mappedType) continue
    for (const inner of row.Rows) {
      if (inner.RowType !== 'Row' || !inner.Cells) continue // skip SummaryRow subtotals
      const name = inner.Cells[0]?.Value
      if (!name) continue
      const raw = inner.Cells[1]?.Value ?? ''
      if (!raw.trim()) continue
      const value = parseFloat(raw.replace(/,/g, ''))
      if (isNaN(value)) continue
      // DM-N7: same-named rows (distinct accounts sharing a display name) used
      // to OVERWRITE each other because this map is keyed by name, understating
      // section totals. Aggregate instead of overwrite (see file header).
      const existing = accounts.get(name)
      accounts.set(name, {
        value: (existing?.value ?? 0) + value,
        section: existing?.section ?? sectionTitle,
        account_type: existing?.account_type ?? mappedType,
      })
    }
  }
  return accounts
}
