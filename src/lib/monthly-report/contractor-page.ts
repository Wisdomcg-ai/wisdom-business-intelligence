/**
 * The Contractor Analysis page's rows, decided apart from jsPDF.
 *
 * Two layouts, chosen per placement in `widget.config.layout`:
 *
 *   'rollup' (the default) — the page every client has had (contractor-rollup):
 *            last month, budget, this month and variance per contractor, then
 *            the same rows by department underneath. Nothing here changes it.
 *
 *   'calxa'  — the Contractors Payment Summary Urban Road's pack has carried
 *            for years (Calxa p14), landscape, two tables side by side:
 *
 *              Name of Contractor | Category | Budget | Jun 2026 | Jul 2026 | Aug 2026
 *              … every contractor, then TOTAL / Budget / Variance $ / Variance %
 *
 *              Category | Name of Contractor | Budget | August 2026 | Variance
 *              … by department, a "<Category> Total" under each, Grand Total
 *
 * Where the 'calxa' layout departs from the sheet, it is because the sheet is
 * wrong or cannot foot, and each is on purpose:
 *
 *   - The Budget row sits under its own month. Calxa's is shifted one column:
 *     July's approved $28,007 prints under June and the contractor budgets'
 *     $30,081 under July, so its July variance ($170) compares two different
 *     things. Here July is 28,007 against 29,911 — (1,904) — and June, which
 *     is FY2026 and has no approved budget, is a dash with the reason under
 *     the table.
 *   - Variance is signed. Calxa prints August's 2,654 as a positive figure on a
 *     green fill when contractors ran $2,654 OVER the $28,375 budget. Here it is
 *     (2,654) on red, as everywhere else in the pack (budget − actual).
 *   - TOTAL is the P&L account (61400 Contractors excl. Artists), not the
 *     vendor column added up. When the vendor rows miss it by a dollar or
 *     more — a journal, a line on another contact, a document with no exchange
 *     rate — an Unallocated row carries the difference and a sentence says so,
 *     rather than the page quietly disagreeing with the P&L three pages back.
 *     Less than a dollar is the rounding of converted figures, and no row.
 *   - Department subtotals carry their variance (decision #14; the March pack
 *     printed them, August left them blank).
 *   - A contractor with no department prints "Uncategorised", not a blank:
 *     the sheet's blank category and its bare "Total" subtotal name nothing.
 *
 * The vendor figures are the P&L's money by default under 'calxa' (`basis`
 * 'net': net of GST, in the organisation's currency — a PHP bill converted at
 * its own rate, as Ailene Alfonso's PHP 22,750 is A$530.56), because TOTAL is
 * the ledger's. A report with no net figures prints gross and says so.
 *
 * Every other option acts only under 'calxa'. Set without it, the config is
 * refused with the reason (the page prints the standard layout and says why),
 * so no other client's page moves and no coach believes an inert option is in
 * force.
 */
import { z } from 'zod'
import type { SubscriptionAccountGroup, SubscriptionDetailData, SubscriptionVendorLine } from '@/app/finances/monthly-report/types'
import { vendorsExceedAccount } from './commentary-money'
import { subscriptionDetailOnBasis } from './subscription-page'

/**
 * The most months the page prints, and so the most the subscription-detail
 * route will crawl: every month past the two it always read is two more paced
 * Xero reads per org, against Xero's 60-a-minute cap and the function timeout.
 */
export const CONTRACTOR_WINDOW_MAX = 6

const configSchema = z.object({
  layout: z.enum(['rollup', 'calxa']).default('rollup'),
  /** Months across the first table, ending at the report month. Calxa: 3 in August, 4 in March. Defaults 3 under 'calxa'. */
  months: z.number().int().min(1).max(CONTRACTOR_WINDOW_MAX).optional(),
  /** 'net' = the P&L's money (the route's `statement`); 'gross' = the document amounts. Defaults 'net' under 'calxa'. */
  basis: z.enum(['gross', 'net']).optional(),
  /** Print each department subtotal's variance. Defaults on under 'calxa' (decision #14). */
  subtotal_variance: z.boolean().optional(),
  /** The row for what the contractor rows do not account for. Defaults on under 'calxa'. */
  unallocated_row: z.boolean().optional(),
  /** What a contractor with no department is filed under. Defaults "Uncategorised". */
  uncategorised_label: z.string().trim().min(1).max(40).optional(),
}).strict()

export interface ContractorPageConfig {
  layout: 'rollup' | 'calxa'
  months: number
  basis: 'gross' | 'net'
  subtotal_variance: boolean
  unallocated_row: boolean
  uncategorised_label: string
}

export type ParsedContractorPageConfig =
  | { ok: true; config: ContractorPageConfig }
  /** The page still prints — in the standard layout — and says why. */
  | { ok: false; config: ContractorPageConfig; reason: string }

const DEFAULT_CONFIG: ContractorPageConfig = {
  layout: 'rollup', months: 2, basis: 'gross', subtotal_variance: false, unallocated_row: false, uncategorised_label: 'Uncategorised',
}

const CALXA_ONLY_KEYS = ['months', 'basis', 'subtotal_variance', 'unallocated_row', 'uncategorised_label'] as const

/**
 * The `count` months ending at the report month, oldest first: 3 at 2026-08 is
 * 2026-06, 2026-07, 2026-08. A window runs across a year end as it is — Calxa's
 * August page prints June, the last month of the year before.
 */
export function windowMonthKeys(reportMonth: string, count: number): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(reportMonth ?? '') || !Number.isInteger(count) || count < 1) return []
  const [y, m] = reportMonth.split('-').map(Number)
  const keys: string[] = []
  for (let back = count - 1; back >= 0; back--) {
    const index = y * 12 + (m - 1) - back
    keys.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`)
  }
  return keys
}

export function parseContractorPageConfig(raw: unknown): ParsedContractorPageConfig {
  const result = configSchema.safeParse(raw ?? {})
  if (!result.success) {
    const reason = result.error.issues
      .slice(0, 3)
      .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
      .join('; ')
    return { ok: false, config: { ...DEFAULT_CONFIG }, reason }
  }
  const c = result.data
  if (c.layout !== 'calxa') {
    const inert = raw == null ? [] : CALXA_ONLY_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(raw, key))
    if (inert.length > 0) {
      return { ok: false, config: { ...DEFAULT_CONFIG }, reason: `${inert.join(', ')} ${inert.length === 1 ? 'applies' : 'apply'} only to layout calxa` }
    }
    return { ok: true, config: { ...DEFAULT_CONFIG } }
  }
  return {
    ok: true,
    config: {
      layout: 'calxa',
      months: c.months ?? 3,
      basis: c.basis ?? 'net',
      subtotal_variance: c.subtotal_variance ?? true,
      unallocated_row: c.unallocated_row ?? true,
      uncategorised_label: c.uncategorised_label ?? 'Uncategorised',
    },
  }
}

/**
 * How many months the export asks the route for. One load serves the pack, so
 * the widest placement wins; with no 'calxa' placement it is the two months the
 * route has always read, and the request does not change.
 */
export function contractorWindowForLayout(widgets: readonly { type: string; config?: unknown }[]): number {
  const sizes = widgets
    .filter((w) => w.type === 'contractor_detail')
    .map((w) => parseContractorPageConfig(w.config))
    .filter((p) => p.ok && p.config.layout === 'calxa')
    .map((p) => p.config.months)
  return Math.max(2, ...sizes)
}

/**
 * A figure, `null` for a figure that does not exist (prints a dash — no budget
 * for the month, a month that was not loaded), `undefined` for a cell the row
 * has no business filling (prints blank — the Budget column of the Budget row).
 */
export type SheetCell = number | null | undefined

export interface ContractorSheetRow {
  kind: 'contractor' | 'unallocated' | 'total' | 'budget' | 'variance' | 'variance_percent'
  label: string
  /** The department as printed; blank on the rows under the contractors. */
  category: string
  budget: SheetCell
  /** One per window month, oldest first. */
  months: SheetCell[]
}

export interface ContractorPivotRow {
  kind: 'contractor' | 'subtotal' | 'unallocated' | 'grand_total'
  /** On a group's first row only, as the sheet's pivot prints it. */
  category: string
  name: string
  budget: SheetCell
  actual: SheetCell
  variance: SheetCell
}

export interface ContractorSheetModel {
  title: string
  /** Oldest first, ending at the report month. */
  months: string[]
  rows: ContractorSheetRow[]
  pivot: ContractorPivotRow[]
  /** Sentences under the tables, each a fact the rows cannot show. */
  notes: string[]
}

const cents = (n: number) => Math.round(n * 100) / 100
/**
 * The least the contractor rows can miss the ledger by and be called
 * Unallocated. Each contractor's figure is converted and rounded line by line
 * (Ailene Alfonso's PHP bills, go sweet spot's NZD one), and across seventeen
 * contractors that alone leaves tens of cents either way — a 60c gap prints as
 * "1", and a sentence naming a journal behind it would name one that does not
 * exist. Below a dollar the gap is rounding, and TOTAL is the ledger either way.
 */
const UNALLOCATED_MATERIALITY = 1
const unaccounted = (n: number | null): n is number => n !== null && Math.abs(n) >= UNALLOCATED_MATERIALITY
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** '2026-06' → 'June 2026'. */
export function longMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${y}` : month
}

/** '2026-06' → 'Jun 2026', the first table's heading. */
export function sheetMonthHeading(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return MONTHS[m - 1] ? `${MONTHS[m - 1].slice(0, 3)} ${y}` : month
}

function money(n: number): string {
  const whole = Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return Math.round(n) < 0 ? `(${whole})` : whole
}

function listOf(parts: string[]): string {
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true })

interface FlatContractor {
  key: string
  name: string
  category: string | null
  budget: number
  months: (number | null)[]
}

/**
 * The 'calxa' layout's rows.
 *
 * `report` is the route's answer for the contractor accounts, asked for with
 * the window (`months`); an answer without one (an older response, a payload
 * saved before it) still prints, with this month and last and a dash for the
 * months nobody loaded.
 */
export function buildContractorSheetModel(report: SubscriptionDetailData, config: ContractorPageConfig): ContractorSheetModel {
  const reportMonth = report.report_month
  const prior = windowMonthKeys(reportMonth, 2)[0]
  const months = windowMonthKeys(reportMonth, config.months)
  const onBasis = subscriptionDetailOnBasis(report, config.basis)
  const accounts = onBasis.detail.accounts ?? []
  const net = onBasis.basis === 'net'
  const notes: string[] = [...onBasis.notes]
  const unloaded = new Set<string>()

  /** A vendor's figure for a month on the page's basis, or null when it was not loaded. */
  const vendorMonth = (v: SubscriptionVendorLine, m: string): number | null => {
    const window = net ? v.statement?.months : v.months
    if (window && typeof window[m] === 'number') return window[m]
    // After subscriptionDetailOnBasis, actual and prior_month_actual are
    // already on the page's basis.
    if (m === reportMonth) return v.actual
    if (m === prior) return v.prior_month_actual
    unloaded.add(m)
    return null
  }

  // One row per contractor across the contractor accounts, keyed as the route
  // keys them, so a contractor paid from two accounts is one line.
  const byKey = new Map<string, FlatContractor>()
  for (const account of accounts) {
    for (const v of account.vendors ?? []) {
      const figures = months.map((m) => vendorMonth(v, m))
      const existing = byKey.get(v.vendor_key)
      if (!existing) {
        byKey.set(v.vendor_key, { key: v.vendor_key, name: v.vendor_name, category: (v.category ?? null) || null, budget: v.budget, months: figures })
        continue
      }
      existing.budget += v.budget
      existing.category = existing.category ?? ((v.category ?? null) || null)
      existing.months = existing.months.map((x, i) => (x === null || figures[i] === null ? null : x + figures[i]!))
    }
  }
  const label = (c: FlatContractor) => c.category ?? config.uncategorised_label
  // Departments first, then the contractors nobody has filed — each run by
  // name, as the sheet lists them.
  const contractors = [...byKey.values()].sort((a, b) =>
    (a.category === null ? 1 : 0) - (b.category === null ? 1 : 0) || byName(a.name, b.name))

  /** The account figures for a month across the accounts: null when any account has none. */
  const accountMonth = (pick: (a: SubscriptionAccountGroup, m: string) => number | null, m: string): number | null => {
    if (accounts.length === 0) return null
    let sum = 0
    for (const a of accounts) {
      const x = pick(a, m)
      if (x === null) return null
      sum += x
    }
    return cents(sum)
  }
  const ledgerOf = (a: SubscriptionAccountGroup, m: string): number | null => {
    if (a.window && typeof a.window.actual[m] === 'number') return a.window.actual[m]
    if (m === reportMonth) return a.total_actual
    if (m === prior) return a.total_prior_month
    unloaded.add(m)
    return null
  }
  const absent = new Map<string, Set<string>>()
  const noBudget = (m: string, reason: string) => {
    const set = absent.get(reason) ?? new Set<string>()
    set.add(m)
    absent.set(reason, set)
  }
  const budgetOf = (a: SubscriptionAccountGroup, m: string): number | null => {
    if (a.window) {
      const b = a.window.budget[m]
      if (typeof b === 'number') return b
      noBudget(m, a.window.budget_absent?.[m] ?? 'no budget was found for it')
      return null
    }
    if (m !== reportMonth) {
      noBudget(m, 'the budget was not loaded for this page')
      return null
    }
    if (a.total_budget_source === 'none') {
      noBudget(m, a.total_budget_absent ?? 'no approved budget is in force')
      return null
    }
    // The vendor budgets added up are the Budget column's TOTAL already; as
    // the account's budget they would compare the page with itself.
    if (a.total_budget_source === 'vendor_sum' || !a.total_budget_source) {
      noBudget(m, `${a.account_name} has no budget line of its own`)
      return null
    }
    return a.total_budget
  }

  const rows: ContractorSheetRow[] = contractors.map((c) => ({
    kind: 'contractor', label: c.name, category: label(c), budget: cents(c.budget), months: c.months.map((x) => (x === null ? null : cents(x))),
  }))

  const totals = months.map((m) => accountMonth(ledgerOf, m))
  const vendorSums = months.map((_, i) => {
    if (contractors.some((c) => c.months[i] === null)) return null
    return cents(contractors.reduce((t, c) => t + (c.months[i] ?? 0), 0))
  })
  const residual = months.map((_, i) => (totals[i] === null || vendorSums[i] === null ? null : cents(totals[i]! - vendorSums[i]!)))
  const withheld = onBasis.basis === 'withheld'
  if (config.unallocated_row && !withheld && residual.some(unaccounted)) {
    rows.push({ kind: 'unallocated', label: 'Unallocated', category: '', budget: undefined, months: residual })
    const named = months
      .map((m, i) => (unaccounted(residual[i]) ? `${sheetMonthHeading(m)}: ${money(residual[i]!)}` : null))
      .filter((p): p is string => !!p)
    const accountNames = listOf(accounts.map((a) => a.account_name))
    // The row prints every month's gap as it is; a month whose gap is under a
    // dollar can still print "1", and is not what the sentence is about.
    const rounding = residual.some((r) => r !== null && !unaccounted(r) && Math.round(Math.abs(r)) !== 0)
    notes.push(
      `Unallocated is the part of ${accountNames} in Xero that no contractor's bill or payment accounts for (${named.join('; ')}): ` +
      'a journal, a line on another contact, or a document with no exchange rate. TOTAL is the ledger\'s figure.' +
      (rounding ? ' A month under a dollar is the rounding of the converted contractor figures.' : ''))
    if (net && months.some((_, i) => totals[i] !== null && vendorSums[i] !== null && vendorsExceedAccount(vendorSums[i]!, totals[i]!))) {
      notes.push('Where Unallocated is negative, the contractor rows add to more than the account posted: at least one contractor figure includes money this account did not post.')
    }
  }

  // Withheld, the contractor rows are gone but their budgets are not: added up
  // they would be 0, and the Grand Total the whole ledger over a budget nobody
  // set. Not known on this page, so a dash.
  const budgetSum = withheld ? null : cents(contractors.reduce((t, c) => t + c.budget, 0))
  const budgets = months.map((m) => accountMonth(budgetOf, m))
  rows.push({ kind: 'total', label: 'TOTAL', category: '', budget: budgetSum, months: totals })
  rows.push({ kind: 'budget', label: 'Budget', category: '', budget: undefined, months: budgets })
  const variances = months.map((_, i) => (budgets[i] === null || totals[i] === null ? null : cents(budgets[i]! - totals[i]!)))
  rows.push({ kind: 'variance', label: 'Variance $', category: '', budget: undefined, months: variances })
  rows.push({
    kind: 'variance_percent', label: 'Variance %', category: '', budget: undefined,
    // A percentage of a $0 budget is not a number; the dollar row says it.
    months: variances.map((v, i) => (v === null || !budgets[i] ? null : Math.round((v / budgets[i]!) * 10000) / 100)),
  })

  // ── By department ──
  const reportIndex = months.indexOf(reportMonth)
  const actualOf = (c: FlatContractor) => (reportIndex >= 0 ? c.months[reportIndex] : null)
  const groups = new Map<string | null, FlatContractor[]>()
  for (const c of contractors) groups.set(c.category, [...(groups.get(c.category) ?? []), c])
  // The contractors nobody has filed come first, as on the sheet: they are the
  // rows that need a decision.
  const order: (string | null)[] = [
    ...(groups.has(null) ? [null] : []),
    ...[...groups.keys()].filter((k): k is string => k !== null).sort(byName),
  ]
  const pivot: ContractorPivotRow[] = []
  for (const name of order) {
    const members = groups.get(name)!
    const groupLabel = name ?? config.uncategorised_label
    members.forEach((c, i) => {
      const actual = actualOf(c)
      pivot.push({
        kind: 'contractor', category: i === 0 ? groupLabel : '', name: c.name, budget: cents(c.budget), actual,
        variance: actual === null ? null : cents(c.budget - actual),
      })
    })
    const budget = cents(members.reduce((t, c) => t + c.budget, 0))
    const actual = members.some((c) => actualOf(c) === null) ? null : cents(members.reduce((t, c) => t + (actualOf(c) ?? 0), 0))
    pivot.push({
      kind: 'subtotal', category: `${groupLabel} Total`, name: '', budget, actual,
      variance: config.subtotal_variance ? (actual === null ? null : cents(budget - actual)) : undefined,
    })
  }
  const reportResidual = reportIndex >= 0 ? residual[reportIndex] : null
  if (rows.some((r) => r.kind === 'unallocated') && unaccounted(reportResidual)) {
    pivot.push({ kind: 'unallocated', category: '', name: 'Unallocated', budget: undefined, actual: reportResidual, variance: undefined })
  }
  const grandActual = reportIndex >= 0 ? totals[reportIndex] : null
  pivot.push({
    kind: 'grand_total', category: 'Grand Total', name: '', budget: budgetSum, actual: grandActual,
    variance: grandActual === null || budgetSum === null ? null : cents(budgetSum - grandActual),
  })

  for (const [reason, set] of absent) {
    const named = listOf(months.filter((m) => set.has(m)).map(longMonthLabel))
    notes.push(`${named} ${set.size === 1 ? 'has' : 'have'} no budget: ${reason}.`)
  }
  if (unloaded.size > 0) {
    notes.push(`${listOf(months.filter((m) => unloaded.has(m)).map(longMonthLabel))} ${unloaded.size === 1 ? 'was' : 'were'} not loaded for this page, so ${unloaded.size === 1 ? 'it prints' : 'they print'} as a dash.`)
  }
  if (accounts.length === 0) notes.push('No contractor accounts were returned for this month.')

  return { title: 'Contractors Payment Summary', months, rows, pivot, notes }
}
