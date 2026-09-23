/**
 * xero_pl_lines, long → wide: one row per account, amounts summed per month.
 *
 * getMonthlyComposite's direct (all-AUD) path — the Full Year page, the
 * generate route's actuals, the forecast wizard's history and the cashflow's
 * actuals all read what this returns. Pure.
 */

export interface XeroPlRowLike {
  account_code: string | null
  account_name: string
  account_type: string | null
  period_month: string | null // 'YYYY-MM-DD'
  amount: number | string
  tenant_id: string | null
}

export interface WideXeroPlRow {
  account_code: string | null
  account_name: string
  account_type: 'revenue' | 'cogs' | 'opex' | 'other_income' | 'other_expense'
  /** Keys are 'YYYY-MM'. */
  monthly_values: Record<string, number>
}

export function normalizeXeroAccountType(raw: string | null | undefined): WideXeroPlRow['account_type'] {
  switch (raw) {
    case 'revenue':
    case 'cogs':
    case 'opex':
    case 'other_income':
    case 'other_expense':
      return raw
    default:
      return 'opex'
  }
}

/**
 * Within ONE org an account code is the account, so rows group on it (a name
 * for a row with no code) and sum per month — the grouping this has always
 * done, and a single-org business gets it unchanged.
 *
 * ACROSS orgs a shared code is not a shared account. Dragon Roofing and Easy
 * Hail share 74 codes and 26 of them name different accounts — 402 is Easy
 * Hail's "Marketing" and Dragon's "Bad Debts expense" — and grouping the whole
 * business on the code summed each pair under whichever name was read first
 * (DRG-40): the Full Year page printed "Marketing" twice, one of them carrying
 * Dragon's bad debts, while the consolidated statement printed them apart. So
 * each org is grouped on its own, then the orgs' accounts are merged on type
 * and name — the consolidated engine's alignment, and the multi-currency
 * branch's — and a merged row keeps a code only when that code names no other
 * row in the business. A code two accounts share identifies neither, and
 * matching a budget on it would hand one of them the other's line.
 */
export function aggregateXeroPlRows(xeroRows: ReadonlyArray<XeroPlRowLike>): WideXeroPlRow[] {
  // A row with no tenant_id is history from before the column was written,
  // not a second org: it does not by itself make a business multi-org.
  const tenants = new Set(xeroRows.flatMap((row) => (row.tenant_id ? [row.tenant_id] : [])))
  if (tenants.size <= 1) return groupWithinOrg(xeroRows, (row) => row.account_code ?? `NAME:${row.account_name}`)

  const perOrg = groupWithinOrg(
    xeroRows,
    (row) => `${row.tenant_id ?? ''}|${row.account_code ?? `NAME:${row.account_name}`}`,
  )
  const merged = new Map<string, { row: WideXeroPlRow; codes: Set<string | null> }>()
  for (const account of perOrg) {
    const key = `${account.account_type}::${account.account_name.toLowerCase().trim()}`
    const hit = merged.get(key)
    if (!hit) {
      merged.set(key, { row: { ...account, monthly_values: { ...account.monthly_values } }, codes: new Set([account.account_code]) })
      continue
    }
    hit.codes.add(account.account_code)
    for (const [month, amount] of Object.entries(account.monthly_values)) {
      hit.row.monthly_values[month] = (hit.row.monthly_values[month] ?? 0) + amount
    }
  }

  const rowsPerCode = new Map<string, number>()
  for (const { codes } of merged.values()) {
    for (const code of codes) if (code !== null) rowsPerCode.set(code, (rowsPerCode.get(code) ?? 0) + 1)
  }
  return [...merged.values()].map(({ row, codes }) => {
    const [only] = codes
    const code = codes.size === 1 && only !== null && rowsPerCode.get(only) === 1 ? only : null
    return { ...row, account_code: code }
  })
}

function groupWithinOrg(
  xeroRows: ReadonlyArray<XeroPlRowLike>,
  keyOf: (row: XeroPlRowLike) => string,
): WideXeroPlRow[] {
  const grouped = new Map<string, WideXeroPlRow>()
  for (const row of xeroRows) {
    const key = keyOf(row)
    let agg = grouped.get(key)
    if (!agg) {
      agg = {
        account_code: row.account_code,
        account_name: row.account_name,
        account_type: normalizeXeroAccountType(row.account_type),
        monthly_values: {},
      }
      grouped.set(key, agg)
    }
    // 'YYYY-MM-DD' → 'YYYY-MM'
    const monthKey = (row.period_month ?? '').slice(0, 7)
    if (!monthKey) continue
    const amt = Number(row.amount)
    agg.monthly_values[monthKey] = (agg.monthly_values[monthKey] ?? 0) + (Number.isFinite(amt) ? amt : 0)
  }
  return [...grouped.values()]
}
