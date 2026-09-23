/**
 * A coach's budget spreadsheet, read into budget_versions/budget_lines.
 *
 * /api/budgets/import reads a budget out of XERO, for one organisation. The
 * budgets these clients are actually held to are not in Xero: Dragon's FY27
 * Budget is edited per organisation in Calxa Budget Tools and exported as
 * `Business Unit Name | Account Number | Account Name | 2026 Jul … 2027 Jun`,
 * and IICT's whole consolidated budget lives in one Calxa version on accounts
 * that exist in no Xero org at all — 221 Commissions Received GST Free and 429
 * General Expenses (IICT-08, DRG-04 option a; decision 1).
 *
 * So this reads a sheet: an account code, an account name, twelve month
 * columns, optionally an organisation column. Every row is then one of three
 * things, and the coach sees which before anything is saved:
 *
 *   matched      the code (or the name) is an account in that organisation's
 *                chart — the budget lands on the account the actuals land on;
 *   budget-only  no account answers to it and the coach has said what kind of
 *                account it is, so it prints as its own row (IICT's 429);
 *   unmatched    neither — nothing is saved while one of these carries money.
 *
 * Mapping one code onto another (IICT's 210 → 200, 221 → 220) is a CHOICE made
 * in the preview, not a rule in here: the same sheet next year may need a
 * different one, and a rule nobody can see is a rule nobody can check.
 *
 * The organisation column is read whenever the sheet has one, including when
 * the coach is importing ONE organisation out of it. A row of another
 * organisation is left out and named — never matched against this
 * organisation's chart, which would put Easy Hail's 477 "Wages and Salaries"
 * onto Dragon's 477 "Wages and Salaries - Admin" (26 of the 74 codes they share
 * name different accounts) and write the two as one line. A business-level
 * version is the exception: its one version budgets the group, however the
 * sheet groups its rows.
 *
 * Pure. The route does the reading and the writing.
 */
import { buildFuzzyLookup } from '@/lib/utils/account-matching'
import { classifyByXeroType } from '@/lib/xero/accounts-catalog'
import type { PLBucket } from '@/lib/services/xero-budget-seed-service'

export type Cell = string | number | boolean | null | undefined

export interface SheetRow {
  /** 1-based row number in the sheet, so the coach can find it. */
  row: number
  code: string | null
  name: string
  /** The organisation column's value, when the sheet has one. */
  org: string | null
  /** Declared account type, when the sheet carries one. */
  type: PLBucket | null
  months: Record<string, number>
  annual: number
}

export interface ParsedBudgetSheet {
  /** The fiscal months the sheet's columns cover, in fiscal order. */
  months: string[]
  rows: SheetRow[]
  hasOrgColumn: boolean
  /** Why the sheet cannot be read as it stands. */
  problems: string[]
}

const HEADER_ALIASES: Record<'code' | 'name' | 'org' | 'type', string[]> = {
  code: ['account code', 'account number', 'account no', 'code', 'acct code'],
  name: ['account name', 'name', 'account'],
  org: ['business unit name', 'organisation', 'organization', 'entity', 'tenant', 'company', 'org'],
  type: ['account type', 'type', 'report category'],
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * A month column header → 'YYYY-MM'. Calxa exports "2026 Jul" (Dragon) and
 * "Jul 2026" (IICT); Excel hands a date cell back as 'YYYY-MM-DD'.
 */
export function parseMonthHeader(value: Cell): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (!text) return null
  const iso = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?(?:T.*)?$/)
  if (iso) {
    const month = Number(iso[2])
    return month >= 1 && month <= 12 ? `${iso[1]}-${iso[2]}` : null
  }
  const lower = text.toLowerCase().replace(/[.]/g, '')
  const nameFirst = lower.match(/^([a-z]{3,9})[\s\-/]+(\d{2}|\d{4})$/)
  const yearFirst = lower.match(/^(\d{4})[\s\-/]+([a-z]{3,9})$/)
  const parts = nameFirst ? { name: nameFirst[1], year: nameFirst[2] } : yearFirst ? { name: yearFirst[2], year: yearFirst[1] } : null
  if (!parts) return null
  const index = MONTH_NAMES.indexOf(parts.name.slice(0, 3))
  if (index === -1) return null
  const year = parts.year.length === 2 ? 2000 + Number(parts.year) : Number(parts.year)
  if (!Number.isFinite(year)) return null
  return `${year}-${String(index + 1).padStart(2, '0')}`
}

/** "$1,234.50", "(500)", "-", 1234.5 → a number, or null for a blank cell. */
export function parseAmount(value: Cell): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return null
  const text = value.trim()
  if (!text || text === '-' || text === '—') return null
  const negative = /^\(.*\)$/.test(text)
  const cleaned = text.replace(/[()$\s,]/g, '')
  if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return negative ? -Math.abs(n) : n
}

function bucketFromText(value: Cell): PLBucket | null {
  const text = String(value ?? '').toLowerCase().trim()
  if (!text) return null
  if (['revenue', 'income', 'sales'].includes(text)) return 'revenue'
  if (['cogs', 'cost of sales', 'cost of goods sold', 'direct costs'].includes(text)) return 'cogs'
  if (['opex', 'operating expenses', 'expense', 'expenses', 'overheads'].includes(text)) return 'opex'
  if (['other income'].includes(text)) return 'other_income'
  if (['other expense', 'other expenses'].includes(text)) return 'other_expense'
  return null
}

/**
 * Read the sheet's grid. `fyMonths` is the fiscal year being imported: a column
 * outside it is not the year's budget and is left out, named in `problems` —
 * silently importing a neighbouring year's column would restate a month that
 * belongs to another version.
 */
export function parseBudgetSheet(cells: readonly Cell[][], fyMonths: readonly string[]): ParsedBudgetSheet {
  const problems: string[] = []
  const fySet = new Set(fyMonths)

  let headerAt = -1
  let columns: { code: number; name: number; org: number; type: number; months: Array<{ index: number; month: string }> } | null = null
  for (let r = 0; r < Math.min(cells.length, 30); r++) {
    const row = cells[r] ?? []
    const found = { code: -1, name: -1, org: -1, type: -1 }
    const months: Array<{ index: number; month: string }> = []
    const outside: string[] = []
    row.forEach((cell, index) => {
      const text = String(cell ?? '').trim().toLowerCase()
      for (const key of ['code', 'name', 'org', 'type'] as const) {
        if (found[key] === -1 && HEADER_ALIASES[key].includes(text)) found[key] = index
      }
      const month = parseMonthHeader(cell)
      if (month) {
        if (fySet.has(month)) months.push({ index, month })
        else outside.push(month)
      }
    })
    if (months.length > 0 && (found.code !== -1 || found.name !== -1)) {
      headerAt = r
      columns = { ...found, months }
      if (outside.length > 0) {
        problems.push(`Columns for ${[...new Set(outside)].sort().join(', ')} are outside this fiscal year and were left out.`)
      }
      break
    }
  }

  if (!columns) {
    return {
      months: [],
      rows: [],
      hasOrgColumn: false,
      problems: ['No header row with an account code or name and at least one month column (for example "Jul 2026") was found.'],
    }
  }

  const monthsFound = columns.months.map((m) => m.month)
  const missingMonths = fyMonths.filter((m) => !monthsFound.includes(m))
  if (missingMonths.length > 0) {
    problems.push(`The sheet has no column for ${missingMonths.join(', ')}. A budget must cover all twelve months of the year.`)
  }

  const rows: SheetRow[] = []
  const empty: string[] = []
  for (let r = headerAt + 1; r < cells.length; r++) {
    const row = cells[r] ?? []
    const code = columns.code === -1 ? null : String(row[columns.code] ?? '').trim() || null
    const name = columns.name === -1 ? '' : String(row[columns.name] ?? '').trim()
    if (!code && !name) continue
    const months: Record<string, number> = {}
    let annual = 0
    for (const { index, month } of columns.months) {
      const amount = parseAmount(row[index])
      if (amount === null || amount === 0) continue
      months[month] = (months[month] ?? 0) + amount
      annual += amount
    }
    // A row with no figure in any month budgets nothing — a group heading, a
    // "Total" line, an account the coach zeroed. It is counted and named in
    // `problems` rather than shown as a row that could be matched.
    if (Object.keys(months).length === 0) {
      empty.push(`row ${r + 1}${code || name ? ` (${[code, name].filter(Boolean).join(' ')})` : ''}`)
      continue
    }
    rows.push({
      row: r + 1,
      code,
      name: name || (code ? `Account ${code}` : ''),
      org: columns.org === -1 ? null : String(row[columns.org] ?? '').trim() || null,
      type: columns.type === -1 ? null : bucketFromText(row[columns.type]),
      months,
      annual: Math.round(annual * 100) / 100,
    })
  }

  if (empty.length > 0) {
    problems.push(`${empty.length} row${empty.length === 1 ? '' : 's'} with no figures ${empty.length === 1 ? 'was' : 'were'} left out: ${empty.slice(0, 5).join(', ')}${empty.length > 5 ? ', …' : ''}.`)
  }

  return {
    months: fyMonths.filter((m) => monthsFound.includes(m)),
    rows,
    hasOrgColumn: columns.org !== -1,
    problems,
  }
}

// ─── Matching ────────────────────────────────────────────────────────────────

/** One account of one organisation's chart (xero_accounts), as the preview sees it. */
export interface CatalogEntry {
  tenant_id: string
  code: string | null
  name: string
  /** From the Xero type, or from the type the P&L mirror stored. Null when neither says. */
  type: PLBucket | null
  archived?: boolean
}

export interface ImportScope {
  /** null = a business-level version covering the group. */
  tenantId: string | null
  displayName: string
  currency: string
}

export type RowChoice =
  | { action: 'map'; target_code: string }
  | { action: 'budget_only'; account_type: PLBucket }
  | { action: 'skip' }

export interface MatchedRow extends SheetRow {
  /** Which version this row will be written to. */
  scope: string | null
  status: 'matched' | 'budget_only' | 'unmatched' | 'skipped'
  /** What will be written: the account's own code and name when matched. */
  account_code: string | null
  account_name: string
  account_type: PLBucket | null
  /** What the coach needs to know about this row — the reason it cannot be saved, or what it was matched to. */
  note: string | null
}

export interface ScopePreview {
  scope: string | null
  display_name: string
  currency: string
  rows: MatchedRow[]
  totals: {
    matched: number
    budget_only: number
    unmatched: number
    skipped: number
    /** The year, by section, and the net profit it implies — the coach's sanity check on signs. */
    by_type: Record<PLBucket, number>
    net_profit: number
  }
}

export interface BudgetImportPreview {
  months: string[]
  scopes: ScopePreview[]
  /** Everything that stops a save, in the coach's words. */
  blocking: string[]
  problems: string[]
  can_save: boolean
}

const BUCKETS: PLBucket[] = ['revenue', 'cogs', 'opex', 'other_income', 'other_expense']
const zeroTotals = (): Record<PLBucket, number> => ({ revenue: 0, cogs: 0, opex: 0, other_income: 0, other_expense: 0 })

/** The catalog type, or the type the account's P&L history was stored under. */
export function catalogEntryType(xeroType: string | null | undefined, storedType: string | null | undefined): PLBucket | null {
  const fromXero = classifyByXeroType(xeroType ?? null) as PLBucket | null
  if (fromXero) return fromXero
  const stored = (storedType ?? '').toLowerCase().trim()
  return (BUCKETS as string[]).includes(stored) ? (stored as PLBucket) : null
}

/**
 * Match every row of the sheet to an account, under the coach's choices.
 *
 * `rowKey` is the sheet row number as a string — a choice belongs to a line of
 * the sheet the coach is looking at, not to a code, which can appear twice.
 */
export function matchBudgetSheet(input: {
  sheet: ParsedBudgetSheet
  scopes: readonly ImportScope[]
  catalog: readonly CatalogEntry[]
  choices?: Record<string, RowChoice>
  /** Organisation names as they can be written in the sheet's org column. */
  orgNames?: Record<string, string[]>
}): BudgetImportPreview {
  const choices = input.choices ?? {}
  const byTenant = new Map<string, CatalogEntry[]>()
  for (const entry of input.catalog) byTenant.set(entry.tenant_id, [...(byTenant.get(entry.tenant_id) ?? []), entry])

  const only = input.scopes.length === 1 ? input.scopes[0] : null

  /**
   * Which version a row belongs to. `elsewhere` is a row of a DIFFERENT
   * organisation than the one this import is for: it is left out and named,
   * never matched against this organisation's chart. Folding it in would put
   * Easy Hail's 477 "Wages and Salaries" on Dragon's 477 "Wages and Salaries -
   * Admin" — 26 of the 74 codes they share name different accounts — which is
   * the DRG-20 failure this module exists to stop, at import time.
   */
  const scopeOf = (row: SheetRow): { scope: ImportScope | null; note: string | null; elsewhere?: string } => {
    // No organisation column, or one business-level version — whose single
    // version budgets the group however the sheet groups its rows.
    if (!input.sheet.hasOrgColumn || (only && only.tenantId === null)) return { scope: input.scopes[0] ?? null, note: null }
    const wanted = (row.org ?? '').trim().toLowerCase()
    // A row naming no organisation, on an import for one: the coach already
    // said which organisation the sheet is for.
    if (!wanted) return only ? { scope: only, note: null } : { scope: null, note: 'This row names no organisation.' }
    const hit = input.scopes.find((s) =>
      s.displayName.toLowerCase().trim() === wanted
      || (input.orgNames?.[s.tenantId ?? ''] ?? []).some((n) => n.toLowerCase().trim() === wanted))
    if (hit) return { scope: hit, note: null }
    if (only) return { scope: only, note: null, elsewhere: row.org ?? '' }
    return { scope: null, note: `“${row.org}” is not one of this business’s Xero organisations.` }
  }

  const perScope = new Map<string | null, ScopePreview>()
  for (const s of input.scopes) {
    perScope.set(s.tenantId, {
      scope: s.tenantId,
      display_name: s.displayName,
      currency: s.currency,
      rows: [],
      totals: { matched: 0, budget_only: 0, unmatched: 0, skipped: 0, by_type: zeroTotals(), net_profit: 0 },
    })
  }
  const unplaced: MatchedRow[] = []
  /** Rows of another organisation than the one this import is for. */
  const elsewhere: string[] = []

  for (const row of input.sheet.rows) {
    const choice = choices[String(row.row)]
    const placed = scopeOf(row)
    const target = placed.scope
    const candidates: CatalogEntry[] = target === null
      ? input.catalog.slice()
      : target.tenantId === null
        ? input.catalog.slice()
        : byTenant.get(target.tenantId) ?? []

    let status: MatchedRow['status'] = 'unmatched'
    let account: CatalogEntry | null = null
    let note: string | null = placed.note
    let accountType: PLBucket | null = row.type

    if (placed.elsewhere !== undefined) {
      status = 'skipped'
      note = `Belongs to “${placed.elsewhere}”, not ${target!.displayName} — left out of this import.`
      elsewhere.push(placed.elsewhere)
    } else if (choice?.action === 'skip') {
      status = 'skipped'
      note = 'Left out of the import.'
    } else if (!target) {
      status = 'unmatched'
    } else {
      const code = (choice?.action === 'map' ? choice.target_code : row.code ?? '').trim().toLowerCase()
      const byCode = code ? candidates.filter((c) => (c.code ?? '').trim().toLowerCase() === code) : []
      const distinct = new Set(byCode.map((c) => `${c.type ?? ''}::${c.name.toLowerCase().trim()}`))
      if (byCode.length > 0 && distinct.size === 1) {
        account = byCode[0]
      } else if (byCode.length > 0) {
        note = `Code ${code} is ${[...new Set(byCode.map((c) => `“${c.name}”`))].join(' and ')} in different organisations — choose the account.`
      } else {
        const fuzzy = buildFuzzyLookup(candidates, (c) => c.name)
        const hit = fuzzy(row.name)
        if (hit) account = hit
      }

      if (account) {
        accountType = account.type ?? row.type ?? (choice?.action === 'budget_only' ? choice.account_type : null)
        if (!accountType) {
          note = `Xero does not say what kind of account ${account.name} is — choose Revenue, Cost of Sales or an expense.`
        } else {
          status = 'matched'
          note = choice?.action === 'map'
            ? `Mapped to ${account.code ?? ''} ${account.name}`.trim()
            : account.name.toLowerCase().trim() === row.name.toLowerCase().trim()
              ? null
              : `Matched to ${account.name}`
          if (account.archived) note = `${note ? `${note}. ` : ''}Archived in Xero.`
        }
      } else if (choice?.action === 'budget_only') {
        status = 'budget_only'
        accountType = choice.account_type
        note = 'No Xero account — kept as a budget-only row.'
      } else if (row.type) {
        status = 'budget_only'
        accountType = row.type
        note = 'No Xero account — kept as a budget-only row, from the sheet’s account type.'
      } else if (!note) {
        note = 'No account with this code or name. Map it to an account, or say what kind of account it is to keep it budget-only.'
      }
    }

    const matched: MatchedRow = {
      ...row,
      scope: target ? target.tenantId : null,
      status,
      account_code: account?.code ?? (choice?.action === 'map' ? choice.target_code : row.code),
      account_name: account?.name ?? row.name,
      account_type: accountType,
      note,
    }

    const bucket = target ? perScope.get(target.tenantId) : undefined
    if (!bucket) {
      unplaced.push(matched)
      continue
    }
    bucket.rows.push(matched)
    bucket.totals[status === 'budget_only' ? 'budget_only' : status]++
    if (status === 'matched' || status === 'budget_only') {
      if (matched.account_type) bucket.totals.by_type[matched.account_type] += row.annual
    }
  }

  const scopes = [...perScope.values()].map((s) => ({
    ...s,
    totals: {
      ...s.totals,
      net_profit: Math.round((s.totals.by_type.revenue + s.totals.by_type.other_income - s.totals.by_type.cogs - s.totals.by_type.opex - s.totals.by_type.other_expense) * 100) / 100,
    },
  }))

  // Said once at the top, as well as row by row: a coach who does not scroll
  // the table still has to be told which organisations this import leaves
  // without a budget, because the report then refuses the whole group's.
  const problems = [...input.sheet.problems]
  if (elsewhere.length > 0 && only) {
    const names = [...new Set(elsewhere)]
    problems.push(
      `${elsewhere.length} row${elsewhere.length === 1 ? '' : 's'} naming ${listOf(names.map((n) => `“${n}”`))} `
      + `${elsewhere.length === 1 ? 'was' : 'were'} left out: this import is for ${only.displayName}. `
      + 'Choose “Each organisation, from the sheet” to import them all.',
    )
  }
  const budgets = (s: ScopePreview) => s.rows.some((r) => r.status === 'matched' || r.status === 'budget_only')
  const unbudgeted = scopes.filter((s) => s.scope !== null && !budgets(s))
  if (unbudgeted.length > 0 && unbudgeted.length < scopes.length) {
    const one = unbudgeted.length === 1
    problems.push(
      `${listOf(unbudgeted.map((s) => s.display_name))} ${one ? 'is' : 'are'} not budgeted by this sheet, `
      + `so ${one ? 'it gets' : 'they get'} no budget version. The report refuses the whole group’s budget `
      + 'until every organisation has one.',
    )
  }

  const blocking: string[] = []
  for (const problem of input.sheet.problems) {
    if (problem.startsWith('The sheet has no column') || problem.startsWith('No header row')) blocking.push(problem)
  }
  const unmatchedWithMoney = [...scopes.flatMap((s) => s.rows), ...unplaced].filter((r) => r.status === 'unmatched' && r.annual !== 0)
  if (unmatchedWithMoney.length > 0) {
    blocking.push(
      `${unmatchedWithMoney.length} row${unmatchedWithMoney.length === 1 ? '' : 's'} could not be matched to an account: `
      + `${unmatchedWithMoney.slice(0, 5).map((r) => `row ${r.row} (${[r.code, r.name].filter(Boolean).join(' ')})`).join(', ')}`
      + `${unmatchedWithMoney.length > 5 ? ', …' : ''}. Nothing is saved while a row with a budget on it has no home.`,
    )
  }
  if (scopes.every((s) => s.rows.every((r) => r.status !== 'matched' && r.status !== 'budget_only'))) {
    blocking.push('No row of this sheet would be saved.')
  }

  return {
    months: input.sheet.months,
    scopes: unplaced.length > 0
      ? [...scopes, {
          scope: null,
          display_name: 'Not assigned to an organisation',
          currency: '',
          rows: unplaced,
          totals: { matched: 0, budget_only: 0, unmatched: unplaced.length, skipped: 0, by_type: zeroTotals(), net_profit: 0 },
        }]
      : scopes,
    blocking,
    problems,
    can_save: blocking.length === 0,
  }
}

const listOf = (names: readonly string[]): string =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/** The rows one version will be written with: one per account per month, merged. */
export function budgetLinesFromPreview(scope: ScopePreview, fyMonths: readonly string[]): Array<{
  account_code: string | null
  account_name: string
  account_type: PLBucket | null
  category: string | null
  month: string
  amount: number
}> {
  const CATEGORY: Record<PLBucket, string> = {
    revenue: 'Revenue', cogs: 'Cost of Sales', opex: 'Operating Expenses',
    other_income: 'Other Income', other_expense: 'Other Expenses',
  }
  // Two sheet rows can land on one account — IICT's 210 mapped to 200 beside
  // 200 itself — and budget_lines is unique per (version, account, month), so
  // they are added together rather than one overwriting the other.
  const byKey = new Map<string, { account_code: string | null; account_name: string; account_type: PLBucket | null; months: Record<string, number> }>()
  for (const row of scope.rows) {
    if (row.status !== 'matched' && row.status !== 'budget_only') continue
    const key = (row.account_code ?? '').trim().toLowerCase() || `name:${row.account_name.toLowerCase().trim()}`
    const hit = byKey.get(key) ?? { account_code: row.account_code, account_name: row.account_name, account_type: row.account_type, months: {} }
    for (const [month, amount] of Object.entries(row.months)) hit.months[month] = (hit.months[month] ?? 0) + amount
    byKey.set(key, hit)
  }
  const out: ReturnType<typeof budgetLinesFromPreview> = []
  for (const line of byKey.values()) {
    for (const month of fyMonths) {
      const amount = line.months[month]
      if (amount === undefined || amount === 0) continue
      out.push({
        account_code: line.account_code,
        account_name: line.account_name,
        account_type: line.account_type,
        category: line.account_type ? CATEGORY[line.account_type] : null,
        month,
        amount: Math.round(amount * 100) / 100,
      })
    }
  }
  return out
}
