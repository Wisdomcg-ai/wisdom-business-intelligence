/**
 * The expense group each consolidated line prints under.
 *
 * A single-entity report reads the group off account_mappings.report_subcategory
 * (mappingGroup, in the generate and Full Year routes). The consolidated route
 * never read it, so the lines it served carried none and every consolidated
 * statement page was one flat alphabetical run: Calxa prints IICT's expenses
 * under Employment Expense, Motor Vehicle Expense, Travel & Accommodation … each
 * with its subtotal, and Dragon's under nine headings (IICT-26, DRG-21).
 *
 * account_mappings is keyed by business and account NAME — it has no tenant —
 * and the consolidation engine merges orgs on type and name, so a consolidated
 * line and a mapping row meet on the name. Case and surrounding spaces are
 * ignored, as the engine's alignment key ignores them. Where both id spaces
 * hold a row for one name, the businesses-space row wins: it is the row the
 * generate route reads for the same business.
 *
 * The heading ORDER is the settings row's expense_group_order, which the route
 * already serves beside the report.
 */
import { mappingGroup } from './expense-groups'

type Client = any

export interface AccountGroupMappingRow {
  business_id: string
  xero_account_name: string | null
  report_subcategory: string | null
}

const nameKey = (name: string) => name.toLowerCase().trim()

/** name (lower-cased, trimmed) → group, or null for a mapped account with no group. */
export function accountGroupsByName(
  rows: readonly AccountGroupMappingRow[],
  businessId: string,
): Map<string, string | null> {
  const out = new Map<string, string | null>()
  const fromBusiness = new Set<string>()
  for (const row of rows) {
    if (!row.xero_account_name) continue
    const key = nameKey(row.xero_account_name)
    const own = row.business_id === businessId
    if (out.has(key) && (fromBusiness.has(key) || !own)) continue
    out.set(key, mappingGroup(row))
    if (own) fromBusiness.add(key)
  }
  return out
}

/**
 * The business's mapping rows, in both id spaces. Throws on a database error:
 * the generate route fails its request on the same read, and a consolidated
 * report whose groups were guessed is not one to print.
 */
export async function loadAccountGroups(
  supabase: Client,
  ids: { businessId: string; all: string[] },
): Promise<Map<string, string | null>> {
  const { data, error } = await supabase
    .from('account_mappings')
    .select('business_id, xero_account_name, report_subcategory')
    .in('business_id', ids.all)
  if (error) throw new Error(`[Consolidated] Failed to load account mappings: ${error.message}`)
  return accountGroupsByName((data ?? []) as AccountGroupMappingRow[], ids.businessId)
}

/**
 * The report with `group` on each consolidated line that has one. A line with
 * no mapping, or a mapping with no group, is left as the engine built it, so a
 * business with no groups set is served exactly the report it was.
 */
export function withConsolidatedGroups<R extends { consolidated: { lines: Array<{ account_name: string; group?: string | null }> } }>(
  report: R,
  groups: ReadonlyMap<string, string | null>,
): R {
  if (groups.size === 0) return report
  let changed = false
  const lines = report.consolidated.lines.map((line) => {
    const group = groups.get(nameKey(line.account_name))
    if (!group || !group.trim()) return line
    changed = true
    return { ...line, group }
  })
  return changed ? { ...report, consolidated: { ...report.consolidated, lines } } : report
}
