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

/**
 * Map a Xero BS section TITLE to an account_type.
 *
 * This is a FALLBACK ONLY — section titles are presentation, not structure.
 * Xero emits `Bank`, `Credit Cards`, `Directors Loan`, `Net ATO Balance`,
 * `Provision for Income Tax` and others as TOP-LEVEL sibling sections, and lets
 * each org rename them freely. Classifying by title dropped every bank account
 * of every tenant (888 rows / 13 tenants) and understated assets by exactly the
 * bank balance, so no real tenant's balance sheet has ever balanced.
 *
 * The authority is the chart of accounts (`xero_accounts.xero_class`), keyed by
 * the account GUID every data row carries. This function only covers rows with
 * no catalog entry — chiefly Xero's synthetic `Current Year Earnings`
 * (account id abababab-…), which sits under a literal `Equity` title.
 *
 * The sync orchestrator reached the same conclusion independently: "catalog
 * xero_type FIRST (chart-of-accounts truth, layout-independent — works for any
 * tenant's custom report layout including JDS-style flat sibling sub-sections)".
 */
export function mapBSSectionToType(section: string): 'asset' | 'liability' | 'equity' | null {
  const t = section.trim().toLowerCase()
  // Xero uses plural "Assets"/"Liabilities"/"Equity"; also handle variants
  if (t.includes('asset')) return 'asset'
  if (t.includes('liabilit')) return 'liability'
  if (t.includes('equity') || t.includes('owner')) return 'equity'
  return null
}

/** Xero account classes → the three BS buckets. */
export function mapXeroClassToType(
  xeroClass: string | null | undefined,
): 'asset' | 'liability' | 'equity' | null {
  switch ((xeroClass || '').trim().toUpperCase()) {
    case 'ASSET': return 'asset'
    case 'LIABILITY': return 'liability'
    case 'EQUITY': return 'equity'
    default: return null
  }
}

/** The account GUID Xero attaches to every BS data row (Cells[0].Attributes). */
function accountIdOf(cell: any): string | null {
  const attrs = cell?.Attributes
  if (!Array.isArray(attrs)) return null
  const hit = attrs.find((a: any) => a?.Id === 'account')
  return typeof hit?.Value === 'string' ? hit.Value : null
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

export interface BSParsedAccount {
  value: number
  section: string
  /** Null when neither the catalog nor the section title could classify the row. */
  account_type: 'asset' | 'liability' | 'equity' | null
  /** Xero account GUID, when the row carries one. */
  account_id: string | null
}

/**
 * Parse a single-month BS report → Map<account_name, BSParsedAccount>.
 *
 * NEVER drops a data row. The previous version skipped any section whose TITLE
 * did not contain asset/liabilit/equity/owner, which silently discarded whole
 * sections — every tenant's `Bank` accounts among them — with no log and no
 * Sentry. Unclassifiable rows now come back with `account_type: null` so the
 * caller can resolve them against the chart of accounts and, failing that,
 * REPORT them rather than lose them.
 *
 * @param classifyByAccountId resolves an account GUID to a type via the chart of
 *   accounts. Optional so this stays a pure function for tests; the sync passes
 *   the real catalog. Catalog wins over the section title, because titles are
 *   presentation and users rename them.
 */
export function parseSingleMonthBSReport(
  report: any,
  classifyByAccountId?: (accountId: string) => 'asset' | 'liability' | 'equity' | null,
): Map<string, BSParsedAccount> {
  const accounts = new Map<string, BSParsedAccount>()
  const rows = report?.Rows || []
  for (const row of rows) {
    if (row.RowType !== 'Section' || !row.Rows) continue
    const sectionTitle = (row.Title || '').trim()
    const sectionType = mapBSSectionToType(sectionTitle)
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
      // Catalog first (structure), section title second (presentation).
      const accountId = accountIdOf(inner.Cells[0])

      // No account GUID → not an account. Xero emits computed totals such as
      // "Net Assets" and "Total Equity" as ordinary Rows, distinguished only by
      // the absence of an account attribute. Including them would double-count
      // their own section; reporting them as unclassified would be noise. Xero's
      // synthetic Current Year Earnings DOES carry an id (abababab-…), so it is
      // correctly kept.
      if (!accountId) continue
      const resolved =
        (accountId && classifyByAccountId ? classifyByAccountId(accountId) : null) ?? sectionType

      const existing = accounts.get(name)
      accounts.set(name, {
        value: (existing?.value ?? 0) + value,
        section: existing?.section ?? sectionTitle,
        account_type: existing?.account_type ?? resolved,
        account_id: existing?.account_id ?? accountId,
      })
    }
  }
  return accounts
}
