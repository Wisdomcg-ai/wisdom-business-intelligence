/**
 * Monthly account actuals for the Ratio Analysis page — per account code and
 * per statement total, straight from the synced ledger.
 *
 * Urban Road's "COGS Tables" page was typed in by hand every month: Freight to
 * Customer (55000) against Total Income, Posters COGS (51150) against Posters
 * income (41700), six-month and three-month averages beside them. Every one of
 * those figures has been in `xero_pl_lines_wide_compat` since the sync landed,
 * and the Feb–Aug 2026 amounts tie to Xero to the cent. The only judgement on
 * the page is which accounts to divide by which — and that is configuration.
 *
 * One builder, two callers: the route the app fetches and the headless preview
 * harness (scripts/preview-pack.ts). Both used to be the kind of thing that
 * grew its own copy of the bucketing rule, and a ratio whose denominator is
 * "Total Income" by one rule while the statement two pages earlier prints Total
 * Income by another is a page that disagrees with the pack it sits in.
 */
import { mapTypeToCategory } from './shared'

/** The statement subtotals a ratio can divide by. */
export type StatementTotal = 'income' | 'cost_of_sales' | 'gross_profit' | 'operating_expenses'

export const STATEMENT_TOTALS: readonly StatementTotal[] = [
  'income', 'cost_of_sales', 'gross_profit', 'operating_expenses',
]

export interface AccountActuals {
  /** Oldest first, ending at the requested end month. Never past it. */
  months: string[]
  /**
   * The earliest month ANY account carries a figure for — across the whole
   * ledger, not just the window. A month before it is not "nothing posted",
   * it is "not synced", and the page has to be able to tell the two apart.
   */
  first_synced_month: string | null
  /** The newest row write, ISO. Null when there are no rows at all. */
  synced_at: string | null
  /**
   * One entry per requested code that exists in the ledger. A code with no
   * entry was not found; a month with no key had nothing posted. Zero is never
   * filled in — the sync writes no zero rows, so absent and $0 are the same
   * fact to us, and inventing the zero is how "unbilled" became "0%".
   */
  accounts: Record<string, { name: string; account_type: string; values: Record<string, number> }>
  /** Same absence rule, per statement subtotal. */
  totals: Record<StatementTotal, Record<string, number>>
}

export interface PlLineRow {
  tenant_id?: string | null
  account_code: string | null
  account_name: string
  account_type: string
  monthly_values: Record<string, number | null> | null
  updated_at?: string | null
}

export interface MappingRow {
  xero_account_name: string
  report_category: string | null
}

export interface ConnectionRow {
  tenant_id: string | null
  functional_currency: string | null
}

/**
 * A Xero account code as Xero allows it: 1–10 characters, letters, digits and
 * the separators the fleet actually uses — "400.8", "225-05", and one client's
 * "400 03" with a space in it. Anchored on an alphanumeric at both ends so a
 * stray comma-split space never becomes part of a code.
 */
export const ACCOUNT_CODE_RE = /^[A-Za-z0-9](?:[A-Za-z0-9 ._-]{0,8}[A-Za-z0-9])?$/

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** 'YYYY-MM' shifted by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** The `count` months ending at `endMonth`, oldest first. */
export function monthsEndingAt(endMonth: string, count: number): string[] {
  const out: string[] = []
  for (let back = count - 1; back >= 0; back--) out.push(shiftMonth(endMonth, -back))
  return out
}

/**
 * Which statement subtotal an account lands in — the statement's rule, not a
 * second one: the coach's mapping when there is one, the Xero type otherwise,
 * matched by account NAME exactly as generate/route.ts matches it.
 */
function totalFor(category: string): StatementTotal | null {
  switch (category) {
    // Revenue only. Other Income sits below Operating Profit on the statement
    // (WA.1), and Urban Road's Total Income of 527,561.80 for August excludes
    // the bank interest in 81000 — so must the denominator.
    case 'Revenue': return 'income'
    case 'Cost of Sales': return 'cost_of_sales'
    case 'Operating Expenses': return 'operating_expenses'
    default: return null
  }
}

/**
 * The mapping-then-type rule for one ledger row, keyed by account NAME. Shared
 * by the totals below and the account list the settings panel offers, so the
 * group a coach picks an account from is the subtotal that account is summed
 * into.
 */
function mappingIndex(mappings: readonly MappingRow[]): Map<string, string | null> {
  // Last writer wins, as in generate/route.ts's mappingByXeroName. The caller
  // orders the rows so the one the statement reads is last.
  const categoryByName = new Map<string, string | null>()
  for (const m of mappings) categoryByName.set(m.xero_account_name, m.report_category)
  return categoryByName
}

function bucketFor(row: Pick<PlLineRow, 'account_name' | 'account_type'>, categoryByName: Map<string, string | null>): StatementTotal | null {
  return totalFor(categoryByName.get(row.account_name) || mapTypeToCategory(row.account_type))
}

/**
 * Refuse the businesses this page cannot yet describe honestly.
 *
 * Account codes are per Xero org: Dragon Roofing's two orgs and IICT's three
 * each have their own 41000, and summing them is a number that exists in no
 * ledger. IICT's HK entity reports in HKD, and adding it to AUD is the 5.26x
 * error #401 fixed. Until this page learns to consolidate, it says so.
 */
export function accountActualsRefusal(input: {
  /** The business's ACTIVE connections (resolveXeroConnections). */
  activeConnections: readonly ConnectionRow[]
  /** The ledger rows about to be summed. */
  rows: readonly Pick<PlLineRow, 'tenant_id'>[]
  /**
   * Every connection row — active or not — for the tenants those rows came
   * from. A disconnected org's ledger is still synced, and still in its own
   * currency.
   */
  rowTenantConnections: readonly ConnectionRow[]
}): string | null {
  const { activeConnections, rows, rowTenantConnections } = input
  if (activeConnections.length > 1) {
    return `this business has ${activeConnections.length} Xero organisations connected — account codes cannot be combined across organisations, so ratio analysis is not available for it yet`
  }
  const rowTenants = new Set(rows.map((r) => r.tenant_id).filter((t): t is string => !!t))
  if (rowTenants.size > 1) {
    return `the synced ledger holds figures from ${rowTenants.size} Xero organisations — account codes cannot be combined across organisations, so ratio analysis is not available for it yet`
  }
  const known = new Set(rowTenantConnections.map((c) => c.tenant_id))
  if ([...rowTenants].some((t) => !known.has(t))) {
    return 'the Xero organisation’s reporting currency is not recorded — ratio analysis is only available for AUD organisations'
  }
  for (const c of [...activeConnections, ...rowTenantConnections]) {
    // Null fails closed: a currency nobody recorded is not evidence of AUD.
    if (c.functional_currency !== 'AUD') {
      return c.functional_currency
        ? `this business reports in ${c.functional_currency} — ratio analysis is only available for AUD organisations`
        : 'the Xero organisation’s reporting currency is not recorded — ratio analysis is only available for AUD organisations'
    }
  }
  return null
}

/**
 * Build the payload. Pure: the caller does the reading, and must have run
 * `accountActualsRefusal` first — this function sums by code and would pool
 * two orgs' codes without complaint.
 */
export function buildAccountActuals(
  rows: readonly PlLineRow[],
  mappings: readonly MappingRow[],
  endMonth: string,
  monthCount: number,
  codes: readonly string[],
): AccountActuals {
  const months = monthsEndingAt(endMonth, monthCount)
  const inWindow = new Set(months)

  const categoryByName = mappingIndex(mappings)

  const wanted = new Set(codes.map((c) => c.trim()))
  const accounts: AccountActuals['accounts'] = {}
  const newestFor = new Map<string, string>()
  const totals: AccountActuals['totals'] = {
    income: {}, cost_of_sales: {}, gross_profit: {}, operating_expenses: {},
  }

  let firstSynced: string | null = null
  let syncedAt: string | null = null

  for (const row of rows) {
    const values = row.monthly_values ?? {}
    if (row.updated_at && (!syncedAt || row.updated_at > syncedAt)) syncedAt = row.updated_at

    const bucket = bucketFor(row, categoryByName)
    const code = (row.account_code ?? '').trim()
    const tracked = code !== '' && wanted.has(code)

    if (tracked && !accounts[code]) {
      accounts[code] = { name: row.account_name, account_type: row.account_type, values: {} }
    }
    // A renamed account arrives as two rows under one code (the view groups on
    // the name). Their months do not overlap, so they sum; the newest row's
    // name is the one Xero shows today.
    if (tracked && row.updated_at && row.updated_at > (newestFor.get(code) ?? '')) {
      newestFor.set(code, row.updated_at)
      accounts[code].name = row.account_name
      accounts[code].account_type = row.account_type
    }

    for (const [month, raw] of Object.entries(values)) {
      if (raw === null || raw === undefined) continue
      const amount = Number(raw)
      if (!Number.isFinite(amount) || !MONTH_KEY_RE.test(month)) continue
      if (!firstSynced || month < firstSynced) firstSynced = month
      // Nothing after the end month, ever: Xero carries the month in progress,
      // and a part month is not an actual.
      if (!inWindow.has(month)) continue
      if (tracked) accounts[code].values[month] = (accounts[code].values[month] ?? 0) + amount
      if (bucket) totals[bucket][month] = (totals[bucket][month] ?? 0) + amount
    }
  }

  for (const month of months) {
    const inc = totals.income[month]
    const cogs = totals.cost_of_sales[month]
    if (inc === undefined && cogs === undefined) continue
    totals.gross_profit[month] = (inc ?? 0) - (cogs ?? 0)
  }

  // Float noise from summing dozens of cent amounts ("527561.8000000001")
  // would otherwise leak into a response a reader compares against Xero.
  const cents = (n: number) => Math.round(n * 100) / 100
  for (const a of Object.values(accounts)) for (const m of Object.keys(a.values)) a.values[m] = cents(a.values[m])
  for (const t of Object.values(totals)) for (const m of Object.keys(t)) t[m] = cents(t[m])

  return { months, first_synced_month: firstSynced, synced_at: syncedAt, accounts, totals }
}

export interface LedgerAccount {
  code: string
  /** The name Xero shows today — the newest row's, for a renamed account. */
  name: string
  /** The statement subtotal it is summed into; null for Other Income/Expenses. */
  bucket: StatementTotal | null
}

export interface LedgerAccountList {
  /** In Xero code order, compared as text (as the statement pages sort, #517). */
  accounts: LedgerAccount[]
  /** Accounts on the ledger with no code — they exist, but a ratio cannot name them. */
  codeless_count: number
}

/**
 * The accounts a Ratio Analysis page can name — read from the SAME ledger rows
 * buildAccountActuals sums, so a code the settings panel offers is a code the
 * page will find.
 *
 * Not the chart of accounts and not account_mappings. Urban Road's mapping for
 * 'Foreign Currency Gains and Losses' carries code 62700 while its ledger row
 * has no code at all, so offering the mapping's code would have printed
 * "account 62700 not found" on the page the coach had just set up. (With the
 * FX account split on — sections.fx_account_split — that codeless merged row
 * becomes the fallback state: a split month carries 497/498/499 as ordinary
 * coded rows, so codeless_count drops by one and they become nameable.) And the
 * chart lists ~160 active P&L accounts against the 88 that have ever posted.
 *
 * Pure, like the builder: the caller reads, and must have run
 * accountActualsRefusal first.
 */
export function listLedgerAccounts(rows: readonly PlLineRow[], mappings: readonly MappingRow[]): LedgerAccountList {
  const categoryByName = mappingIndex(mappings)
  const byCode = new Map<string, LedgerAccount & { updated_at: string }>()
  const codelessNames = new Set<string>()

  for (const row of rows) {
    const code = (row.account_code ?? '').trim()
    if (code === '') {
      codelessNames.add(row.account_name)
      continue
    }
    const updated = row.updated_at ?? ''
    const seen = byCode.get(code)
    // A renamed account arrives as two rows under one code; the newest row's
    // name is the one Xero shows today — the builder's rule, so the panel and
    // the page print the same name.
    if (!seen || updated > seen.updated_at) {
      byCode.set(code, { code, name: row.account_name, bucket: bucketFor(row, categoryByName), updated_at: updated })
    }
  }

  const accounts = [...byCode.values()]
    .map(({ code, name, bucket }) => ({ code, name, bucket }))
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
  return { accounts, codeless_count: codelessNames.size }
}
