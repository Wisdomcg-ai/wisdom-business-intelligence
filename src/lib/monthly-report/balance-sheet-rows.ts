/**
 * The Balance Sheet page's rows, built from TWO single-date Xero reports.
 *
 * Calxa pages 19-21 of Urban Road's pack are "Aug 2026 vs Jul 2026" and "Aug
 * 2026 vs Aug 2025". This module turns Xero's Reports/BalanceSheet answers for
 * the two month-ends into the rows /api/Xero/balance-sheet returns — the rows
 * BalanceSheetTab and the PDF page both render — and it is where every rule
 * about what those rows SAY lives, so the two surfaces cannot drift.
 *
 * Why two reports and not one `periods=1&timeframe=` call. The route used to
 * ask Xero for the comparison column in the same request, which is the
 * parameter shape bs-single-period-parser.ts and sync-orchestrator.ts document
 * as buggy and never use: the comparative is walked back by calendar offset,
 * so a 30 September report compares against 30 August, not 31 August. August
 * happens to tie; September would not. One query per as-of date, merged here
 * by AccountID, puts both columns on true month-ends.
 *
 * What the parse used to get wrong, against Urban Road August 2026 (audit
 * calxa-audit/audit-balance-sheet.json):
 *   - Net Assets sits inside a Section with an empty Title in Xero's JSON, not
 *     at the top level, so it came through as an ordinary line item under a
 *     blank heading and the Net-Assets-vs-Total-Equity check never ran.
 *   - Every empty-titled Section printed a blank heading row (three per page).
 *   - Variance was current − prior on every row. Calxa prints liabilities the
 *     other way — prior − current, so a liability that FELL is a positive,
 *     favourable number: Trade Creditors 482,774 → 380,205 is "102,568 21%",
 *     where we printed "(102,568) (21%)" in red.
 *   - Rows came in Xero's name order. Calxa orders by account code, codeless
 *     accounts last, with Current Earnings closing Equity.
 *   - Accounts at nil in both columns (USD PayPal, Suzie Credit Card,
 *     Retained Earnings b/f at 2c) printed as rows of zeros.
 *   - An account Xero omits at one date (Shopify loan 2 did not exist in
 *     August 2025) printed a dash where Calxa prints 0 and a real variance.
 *
 * And what the page SHOWS, since Matt accepted Calxa's layout (14 Sep 2026):
 * three flat classes by Xero account Class — Asset, Liability, Net Assets,
 * Equity — with none of Xero's groups (Bank, Current Assets, Fixed Assets,
 * Current Liabilities …) and credit cards as negative assets. See
 * buildClassRows.
 *
 * Pure: same reports in, same rows out. The route does the fetching.
 */
import type {
  BalanceSheetCompare,
  BalanceSheetData,
  BalanceSheetRow,
} from '@/app/finances/monthly-report/types'

// ─── Xero report shape (only what we read) ──────────────────────────────────

interface XeroCell {
  Value?: string
  Attributes?: { Id?: string; Value?: string }[]
}

export interface XeroReportRow {
  RowType: string
  Title?: string
  Cells?: XeroCell[]
  Rows?: XeroReportRow[]
}

export interface XeroBalanceSheetReport {
  Rows?: XeroReportRow[]
}

export type BsClass = 'asset' | 'liability' | 'equity'

// ─── Dates and labels ───────────────────────────────────────────────────────

/** Fixed, not toLocaleDateString: en-AU prints "Sept", and Calxa prints "Sep". */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function lastDay(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * The two as-of dates for a report month: its own month-end, and the month-end
 * it is compared against. Both are computed as month-ends — never as "the same
 * day-of-month, one period back", which is how Xero's comparative lands on 30
 * August for a 30 September report and 28 February 2027 for 29 February 2028
 * only by accident.
 */
export function balanceSheetDates(
  month: string,
  compare: BalanceSheetCompare,
): { current: string; prior: string } {
  const [y, m] = month.split('-').map(Number)
  const current = lastDay(y, m)
  const prior = compare === 'mom'
    ? (m === 1 ? lastDay(y - 1, 12) : lastDay(y, m - 1))
    : lastDay(y - 1, m)
  return { current, prior }
}

/** '2026-08-31' → 'Aug 2026', the column heading Calxa prints. */
export function balanceSheetColumnLabel(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

// ─── Labels ─────────────────────────────────────────────────────────────────

/**
 * Dollars. The sync's BS equation materiality (CLAUDE.md, 1 Sep 2026) — how
 * far Net Assets and Total Equity may be apart and the sheet still be said to
 * balance. Exported because anything that MOVES a figure on this sheet has to
 * stay inside it: the consolidated sheet holds its eliminations to this proof
 * and not to a looser one of their own (a pair netted 50c apart moved Net
 * Assets off Total Equity, and the page then blamed the client's books).
 */
export const NET_ASSETS_TOLERANCE = 0.05

/** Xero's fixed id for the Current Year Earnings row, which has no real account. */
const CURRENT_YEAR_EARNINGS_ID = 'abababab-abab-abab-abab-abababababab'

export function isCurrentYearEarnings(label: string, accountId: string | null): boolean {
  return accountId === CURRENT_YEAR_EARNINGS_ID || label.trim().toLowerCase() === 'current year earnings'
}

/** The headings that ARE a class, as opposed to a group inside one (Bank, Fixed Assets). */
const CLASS_TITLES = new Set(['assets', 'liabilities', 'equity'])

function classOfTitle(title: string): BsClass | null {
  const t = title.toLowerCase()
  if (t.includes('liabilit')) return 'liability'
  if (t.includes('equity')) return 'equity'
  if (t.includes('asset')) return 'asset'
  return null
}

// ─── One report, flattened ──────────────────────────────────────────────────

type Entry =
  | { kind: 'header'; key: string; title: string; depth: 0 | 1 }
  /** `cls` is the class heading Xero printed the line under in THIS report. */
  | { kind: 'line'; key: string; label: string; accountId: string | null; value: number | null; cls: BsClass | null }
  | { kind: 'total'; key: string; label: string; depth: 0 | 1; value: number | null }
  | { kind: 'net_assets'; key: string; value: number | null }

function parseAmount(val: string | undefined): number | null {
  if (!val || val.trim() === '') return null
  const n = parseFloat(val.replace(/,/g, ''))
  return Number.isNaN(n) ? null : n
}

function accountIdOf(cells: XeroCell[]): string | null {
  for (const c of cells) {
    const attr = c.Attributes?.find((a) => a.Id === 'account')
    if (attr?.Value) return attr.Value
  }
  return null
}

/**
 * Walk Xero's tree into one ordered list. Keys are what the two dates are
 * merged on: the AccountID for an account, the title for a heading, the label
 * for a total. A repeated key within one report gets an occurrence suffix so
 * two same-titled groups stay two groups.
 */
function flattenReport(report: XeroBalanceSheetReport | null | undefined): Entry[] {
  const out: Entry[] = []
  const seen = new Map<string, number>()
  const unique = (base: string) => {
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n === 0 ? base : `${base}#${n}`
  }

  // The class the walk is inside, in sheet order: a class heading sets it, a
  // group inside it inherits it. Groups do not classify on their own — the
  // rule bs-single-period-parser.ts uses — or an equity reserve titled "Asset
  // Revaluation Reserve" would flip its rows to asset signs. A group only names
  // the class when no class heading has come before it.
  let cls: BsClass | null = null

  const walk = (rows: XeroReportRow[], sectionTitle: string) => {
    for (const row of rows) {
      if (row.RowType === 'Header') continue
      if (row.RowType === 'Section') {
        const title = (row.Title ?? '').trim()
        // An empty Title is Xero's wrapper for a grand total or for Net Assets.
        // It is not a heading, and printing it as one put three blank rows on
        // every page.
        if (title) {
          const depth = CLASS_TITLES.has(title.toLowerCase()) ? 0 : 1
          cls = depth === 0 ? classOfTitle(title) : (cls ?? classOfTitle(title))
          out.push({
            kind: 'header',
            key: unique(`section:${title.toLowerCase()}`),
            title,
            depth,
          })
        }
        walk(row.Rows ?? [], title)
        continue
      }
      const cells = row.Cells ?? []
      const label = (cells[0]?.Value ?? '').trim()
      const value = parseAmount(cells[1]?.Value)
      if (row.RowType === 'SummaryRow') {
        // A total closes the group it sits in. Inside an empty-titled wrapper or
        // a class section (Equity) it is a grand total; inside Bank it is not.
        const grand = !sectionTitle || CLASS_TITLES.has(sectionTitle.toLowerCase())
        out.push({ kind: 'total', key: unique(`total:${label.toLowerCase()}`), label, depth: grand ? 0 : 1, value })
        continue
      }
      if (row.RowType !== 'Row') continue
      // Net Assets, wherever Xero nests it — in practice inside an untitled
      // Section, which is exactly where the old parser never looked.
      if (label.toLowerCase() === 'net assets') {
        out.push({ kind: 'net_assets', key: unique('net_assets'), value })
        continue
      }
      if (!label && value === null) continue
      const accountId = accountIdOf(cells)
      out.push({
        kind: 'line',
        key: unique(accountId && !isCurrentYearEarnings(label, accountId) ? `acct:${accountId}` : `label:${label.toLowerCase()}`),
        label,
        accountId,
        value,
        cls,
      })
    }
  }
  walk(report?.Rows ?? [], '')
  return out
}

// ─── Two reports, merged ────────────────────────────────────────────────────

/**
 * Whether a report says anything at all. Headings are not figures, and neither
 * is a nil total or a nil Current Year Earnings: a Report is a skeleton of
 * Sections and SummaryRows before it is anything else, so counting entries —
 * the test this replaced — called a report with no balance in it "not empty"
 * and zero-filled a first-year client's whole prior-year column.
 */
function hasAnyFigure(entries: Entry[]): boolean {
  return entries.some((e) => e.kind !== 'header' && e.value !== null && e.value !== 0)
}

interface Merged {
  entry: Entry
  current: number | null
  prior: number | null
  /** Whether the current report actually carried this row (as opposed to a zero-fill). */
  inCurrent: boolean
  /** The class heading the PRIOR report printed this line under. */
  priorCls: BsClass | null
}

/**
 * The union of both dates' rows, in the current report's order, with anything
 * only the prior report has slotted in after whatever preceded it there.
 *
 * The union matters: a sheet built from the current date alone drops an
 * account that was closed out during the year (Shopify Loan, 105,826 in August
 * 2025 and nil now), and its prior balance with it — while the prior column's
 * TOTAL still includes it, so the column would not add down.
 */
function mergeEntries(currentReport: Entry[], priorReport: Entry[]): Merged[] {
  // A report with no figure in it is no report: its skeleton's nil totals must
  // not land in the column as zeros either (see hasAnyFigure).
  const current = hasAnyFigure(currentReport) ? currentReport : []
  const prior = hasAnyFigure(priorReport) ? priorReport : []
  const merged: Merged[] = current.map((e) => ({
    entry: e,
    current: e.kind === 'header' ? null : e.value,
    prior: null,
    inCurrent: true,
    priorCls: null,
  }))
  const indexOf = (key: string) => merged.findIndex((m) => m.entry.key === key)
  const clsOf = (e: Entry) => (e.kind === 'line' ? e.cls : null)

  let anchor = -1
  for (const e of prior) {
    const at = indexOf(e.key)
    if (at >= 0) {
      if (e.kind !== 'header') merged[at].prior = e.value
      merged[at].priorCls = clsOf(e)
      anchor = at
      continue
    }
    merged.splice(anchor + 1, 0, {
      entry: e,
      current: null,
      prior: e.kind === 'header' ? null : e.value,
      inCurrent: false,
      priorCls: clsOf(e),
    })
    anchor += 1
  }

  // An account that exists at one date and not the other was nil at the other
  // date — that is what Xero's omission means. Calxa prints 0 and a real
  // variance ("Shopify loan 2 $100000 89,418 | 0 | (89,418) | N/A"); a dash
  // would claim we do not know. Only when a whole report carries no figure is
  // the column genuinely absent, and then it stays null so the page can say
  // there is nothing to compare against.
  const currentEmpty = current.length === 0
  const priorEmpty = prior.length === 0
  for (const m of merged) {
    if (m.entry.kind === 'header') continue
    if (m.current === null && !currentEmpty) m.current = 0
    if (m.prior === null && !priorEmpty) m.prior = 0
  }
  return merged
}

// ─── Rules ──────────────────────────────────────────────────────────────────

/**
 * Variance, with Calxa's sign convention: favourable is positive.
 *
 * For an asset (and for equity and Net Assets) favourable is up: current −
 * prior. For a liability favourable is DOWN: prior − current. Urban Road July →
 * August 2026, Calxa p19: Trade Creditors 482,773.53 → 380,205.08 prints
 * "102,568 21%"; ATO Creditors (39,282) → 10,741 prints "(50,023) (127%)";
 * Rounding (1.93) → (1.86) prints "(4%)", which only the prior − current
 * numerator produces. The percentage divides by the prior's magnitude either
 * way, and is N/A when there is no prior to divide by.
 */
export function balanceSheetVariance(
  cls: BsClass | null,
  current: number | null,
  prior: number | null,
): { variance: number | null; variance_pct: number | null } {
  if (current === null || prior === null) return { variance: null, variance_pct: null }
  const variance = cls === 'liability' ? prior - current : current - prior
  const variance_pct = prior === 0 ? null : (variance / Math.abs(prior)) * 100
  return { variance, variance_pct }
}

/**
 * Whole dollars, half away from zero — the way Calxa (and a spreadsheet)
 * rounds. Math.round takes a half UP, so a negative half lands a dollar short:
 * Urban Road's PrinTribe Loan at (55,019.50) printed "(55,019)" where Calxa
 * p19 prints "(55,020)", and Suzie Credit Card's 12,840.50 at August 2025
 * printed one dollar under Calxa p20's "(12,841)".
 */
export function bsWhole(value: number): number {
  const whole = Math.sign(value) * Math.round(Math.abs(value))
  return whole === 0 ? 0 : whole
}

/** Nil at the precision the page prints — both columns round to 0. */
function roundsToNil(current: number | null, prior: number | null): boolean {
  return bsWhole(current ?? 0) === 0 && bsWhole(prior ?? 0) === 0
}

/**
 * Calxa's order inside a group: account code compared as a string (so "860"
 * Rounding sorts after "23005"), codeless accounts after coded ones by name,
 * and Current Earnings last. Without a code catalogue we keep Xero's order
 * rather than invent one — a sort by name alone is neither Xero's nor Calxa's.
 */
function sortLines(lines: Merged[], accounts: ReadonlyMap<string, BsAccount> | null): Merged[] {
  if (!accounts) {
    // Still pin Current Earnings last: that needs no catalogue.
    const cye = lines.filter((m) => m.entry.kind === 'line' && isCurrentYearEarnings(m.entry.label, m.entry.accountId))
    return [...lines.filter((m) => !cye.includes(m)), ...cye]
  }
  const rank = (m: Merged) => {
    const e = m.entry as Extract<Entry, { kind: 'line' }>
    if (isCurrentYearEarnings(e.label, e.accountId)) return { tier: 2, code: '', name: '' }
    const code = e.accountId ? accounts.get(e.accountId)?.code ?? null : null
    return code ? { tier: 0, code, name: e.label.toLowerCase() } : { tier: 1, code: '', name: e.label.toLowerCase() }
  }
  return [...lines].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra.tier !== rb.tier) return ra.tier - rb.tier
    if (ra.code !== rb.code) return ra.code < rb.code ? -1 : 1
    return ra.name < rb.name ? -1 : ra.name > rb.name ? 1 : 0
  })
}

// ─── Figures as printed ─────────────────────────────────────────────────────

/**
 * A balance-sheet figure the way Calxa prints it: whole dollars, no symbol,
 * negatives in brackets, a dash for a figure that does not exist.
 *
 * Rounded BEFORE the sign test. The old formatter tested the unrounded value,
 * so Urban Road's Rounding account, which moved 7c between July and August,
 * printed a red "(0)" — a bracketed nothing that reads as an unfavourable
 * result that did not happen.
 */
export function bsAmountText(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const rounded = bsWhole(value)
  const abs = Math.abs(rounded).toLocaleString('en-AU', { maximumFractionDigits: 0 })
  return rounded < 0 ? `(${abs})` : abs
}

/** Whole percent, same bracket rule; N/A when there was no prior to divide by. */
export function bsPercentText(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'N/A'
  const rounded = bsWhole(value)
  return rounded < 0 ? `(${Math.abs(rounded)}%)` : `${rounded}%`
}

// ─── The builder ────────────────────────────────────────────────────────────

/** What the xero_accounts catalogue says about one AccountID. */
export interface BsAccount {
  code: string | null
  /** Xero's account Class: ASSET | LIABILITY | EQUITY (| REVENUE | EXPENSE). */
  xeroClass: string | null
}

export interface BuildBalanceSheetInput {
  businessId: string
  compare: BalanceSheetCompare
  /** YYYY-MM-DD of each report, from balanceSheetDates. */
  currentDate: string
  priorDate: string
  current: XeroBalanceSheetReport | null | undefined
  prior: XeroBalanceSheetReport | null | undefined
  /**
   * Xero AccountID → code and class, from xero_accounts. `null` when the
   * catalogue could not be read: the rows then keep Xero's order, and each
   * account sits in the class Xero's report printed it under.
   */
  accounts?: ReadonlyMap<string, BsAccount> | null
}

export const CLASS_OF_XERO: Record<string, BsClass> = { ASSET: 'asset', LIABILITY: 'liability', EQUITY: 'equity' }

const CLASS_LABEL: Record<BsClass, string> = { asset: 'Asset', liability: 'Liability', equity: 'Equity' }

/**
 * A balance restated in another class's sign. Xero prints an asset debit-
 * positive and a liability or equity credit-positive, so moving a figure
 * between the asset side and the other two flips it; liability ↔ equity does
 * not. A credit card is the case that matters: Xero's report prints American
 * Express +64,332 under Current Liabilities, its account Class is ASSET, and
 * Calxa prints it as an asset of (64,332). Either way Net Assets is the same.
 */
function restate(value: number | null, from: BsClass | null, to: BsClass): number | null {
  if (value === null || from === null || (from === 'asset') === (to === 'asset')) return value
  return value === 0 ? 0 : -value
}

/**
 * The sheet Calxa prints (decisions 16 and 17, accepted 14 Sep 2026): three
 * flat classes — Asset, Liability, then Net Assets, then Equity — with no Xero
 * groups (Bank, Current Assets, Fixed Assets, Current Liabilities …) and no
 * group totals, each account in its Xero account Class.
 *
 * Why the class and not Xero's report position. The report files a credit
 * card under Current Liabilities; the catalogue's Class says ASSET, and Calxa
 * — the pack the client already reads — prints Urban Road's Amex and Suzie
 * cards as negative assets. Following the report put 64,332 on both Total
 * Asset and Total Liability that Calxa's page does not carry. The report's
 * heading is the fallback, for an account the catalogue does not know (Current
 * Year Earnings has no account at all) and for when the catalogue could not be
 * read — so a failed read costs the card's placement, never the sheet.
 *
 * Every total is ADDED here, from every account including the ones hidden as
 * nil, because Xero's own SummaryRows total a different grouping once a card
 * moves — and Net Assets is Total Asset − Total Liability, so the page adds
 * down. The sheet "balances" when that equals Total Equity in both columns, at
 * the $0.05 BS materiality (Xero's own report for Just Digital Signage at 30
 * April 2026 is a cent apart: Net Assets 662,903.57 over Current Year Earnings
 * 662,903.58). An account that could not be placed in any class is left off
 * the page and fails the proof, so the page says so instead of printing totals
 * that quietly exclude it.
 */
function buildClassRows(merged: Merged[], accounts: ReadonlyMap<string, BsAccount> | null): {
  rows: BalanceSheetRow[]
  balances: boolean
} {
  const lines: Record<BsClass, (Merged & { cls: BsClass })[]> = { asset: [], liability: [], equity: [] }
  let unplaced = false

  for (const m of merged) {
    if (m.entry.kind !== 'line') continue
    const { entry } = m
    const catalogued = entry.accountId ? accounts?.get(entry.accountId)?.xeroClass : null
    const cls = (catalogued && CLASS_OF_XERO[catalogued.toUpperCase()]) || entry.cls || m.priorCls
    if (!cls) {
      if (m.current || m.prior) unplaced = true
      continue
    }
    // The line's entry is the current report's when both carry it, the prior's
    // when only the prior does — and a zero-filled side has nothing to restate.
    const currentFrom = m.inCurrent ? entry.cls : null
    const priorFrom = m.inCurrent ? m.priorCls : entry.cls
    lines[cls].push({
      ...m,
      cls,
      current: restate(m.current, currentFrom, cls),
      prior: restate(m.prior, priorFrom, cls),
    })
  }

  // A column is absent only when its whole report was (mergeEntries leaves it
  // null); a class with no accounts in a present column totals 0, not a dash.
  const hasCurrent = merged.some((m) => m.entry.kind !== 'header' && m.current !== null)
  const hasPrior = merged.some((m) => m.entry.kind !== 'header' && m.prior !== null)
  // Nothing at the report date is no sheet, not three nil classes: the page
  // says Xero returned nothing rather than printing "Total Asset —".
  if (!hasCurrent) return { rows: [], balances: true }

  const placed = (cls: BsClass): PlacedBsLine[] =>
    (sortLines(lines[cls], accounts) as typeof lines[BsClass]).map((m) => {
      const e = m.entry as Extract<Entry, { kind: 'line' }>
      return {
        label: isCurrentYearEarnings(e.label, e.accountId) ? 'Current Earnings' : e.label,
        current: m.current,
        prior: m.prior,
      }
    })
  return flatClassSheet({ asset: placed('asset'), liability: placed('liability'), equity: placed('equity') }, { hasPrior, unplaced })
}

/** One account on the flat sheet: already in its class, in its class's sign, in page order. */
export interface PlacedBsLine {
  label: string
  current: number | null
  prior: number | null
}

/**
 * The rows of the flat sheet from accounts already placed and ordered — Asset,
 * Liability, Net Assets, Equity, each class closed by a total ADDED from every
 * account including the ones hidden as nil — and whether it balances.
 *
 * One function for both sheets the page prints: one organisation's, built
 * from Xero's report (buildClassRows), and several organisations' built from
 * the stored mirror (consolidated-balance-sheet.ts). Which rows hide, how a
 * total is added, the variance sign and the $0.05 proof are the page's rules,
 * not either sheet's, so neither can print a total the other would not.
 */
export function flatClassSheet(
  lines: Record<BsClass, PlacedBsLine[]>,
  opts: { hasPrior: boolean; unplaced?: boolean },
): { rows: BalanceSheetRow[]; balances: boolean } {
  const { hasPrior, unplaced = false } = opts
  // Xero's balances are cents; a sum of them in binary floating point is not
  // (Just Digital Signage's 1,574,750.74 − 911,847.17 comes out
  // 662,903.5700000001). Back to cents, so the payload — and a frozen copy of
  // it — carries the figure Xero means.
  const cents = (v: number) => Math.round(v * 100) / 100
  const total = (cls: BsClass) => ({
    current: cents(lines[cls].reduce((s, m) => s + (m.current ?? 0), 0)),
    prior: hasPrior ? cents(lines[cls].reduce((s, m) => s + (m.prior ?? 0), 0)) : null,
  })
  const minus = (a: number | null, b: number | null) => (a === null || b === null ? null : cents(a - b))

  const rows: BalanceSheetRow[] = []
  const pushClass = (cls: BsClass) => {
    rows.push({ type: 'section_header', label: CLASS_LABEL[cls], current: null, prior: null, variance: null, variance_pct: null, depth: 0 })
    for (const m of lines[cls]) {
      // Hidden from the page, never from the arithmetic: a 2c Retained
      // Earnings b/f stays inside Total Equity.
      if (roundsToNil(m.current, m.prior)) continue
      rows.push({
        type: 'line_item',
        label: m.label,
        current: m.current,
        prior: m.prior,
        ...balanceSheetVariance(cls, m.current, m.prior),
        depth: 0,
      })
    }
    const t = total(cls)
    rows.push({ type: 'subtotal', label: `Total ${CLASS_LABEL[cls]}`, ...t, ...balanceSheetVariance(cls, t.current, t.prior), depth: 0 })
    return t
  }

  const assets = pushClass('asset')
  const liabilities = pushClass('liability')
  const netAssets = { current: minus(assets.current, liabilities.current), prior: minus(assets.prior, liabilities.prior) }
  rows.push({ type: 'net_assets', label: 'Net Assets', ...netAssets, ...balanceSheetVariance(null, netAssets.current, netAssets.prior), depth: 0 })
  const equity = pushClass('equity')

  // Only a confirmed mismatch fails the proof — an absent prior column is not
  // evidence the sheet is out.
  const agrees = (a: number | null, b: number | null) => a === null || b === null || Math.abs(a - b) <= NET_ASSETS_TOLERANCE
  const balances = !unplaced && agrees(netAssets.current, equity.current) && agrees(netAssets.prior, equity.prior)

  return { rows, balances }
}

export function buildBalanceSheetData(input: BuildBalanceSheetInput): BalanceSheetData {
  const merged = mergeEntries(flattenReport(input.current), flattenReport(input.prior))
  const { rows, balances } = buildClassRows(merged, input.accounts ?? null)
  return {
    business_id: input.businessId,
    report_date: input.currentDate,
    compare: input.compare,
    current_label: balanceSheetColumnLabel(input.currentDate),
    prior_label: balanceSheetColumnLabel(input.priorDate),
    rows,
    balances,
  }
}
