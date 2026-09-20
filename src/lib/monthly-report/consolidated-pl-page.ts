/**
 * The per-entity P&L page's rows, decided apart from jsPDF.
 *
 * Two layouts, chosen per placement in `widget.config.layout`:
 *
 *   'standard' (the default) — the page every consolidation parent has had
 *              (WD.6): every account in the consolidation's universe, each org's
 *              Actual / Budget / Var $, then the group's Actual / Budget / Var $ /
 *              Var %. The renderer draws it as it always did; nothing here
 *              changes it.
 *
 *   'calxa'    — Calxa's "P&L Comparison" (Dragon p7 and p14, IICT p7 and
 *              p11): the statement set out per organisation, as a statement —
 *
 *                P&L Comparison — Dragon Roofing & Easy Hail
 *                AUG 2026
 *                                  Dragon Roofing   EASY HAIL      Dragon Roofing
 *                                  Pty Ltd          CLAIM PTY LTD  & Easy Hail
 *                                  Actuals          Actuals        Actuals
 *                Income
 *                  Sales - Insurance     673,765          0        673,765
 *                  …
 *                Total Income            720,810    153,022        873,832
 *
 *              with the section headings, the expense groups (each group row
 *              carrying its subtotal, as the statement pages print them), a
 *              total under each section, and — on the whole P&L — Gross Profit,
 *              Gross Profit % and Net Profit for every organisation. Accounts
 *              with nothing in any column printed are left off: the standard
 *              page lists all 78 of Dragon's, 36 of them zeros (DRG-14).
 *
 * Options only the 'calxa' layout acts on, as the subscription and contractor
 * pages' are:
 *
 *   section  'all' (default) | 'income' | 'cogs' | 'expense' — Calxa splits the
 *            page by section: an Income Split and an Expense Split, and no COGS
 *            one. 'income' is the Revenue section and 'expense' Operating
 *            Expenses, the same shorthand a Budget vs Actual table takes.
 *   columns  'actual_budget' (default) | 'actuals' — Calxa's split pages print
 *            actuals only.
 *
 * Set without 'calxa', the config is refused with the reason (the page prints
 * the standard layout and says why), so no page moves and no coach believes an
 * inert option is in force.
 *
 * The figures are buildConsolidatedRows' — the same per-account derivation the
 * web tab and the standard page read, variances signed by account type — so
 * this page cannot disagree with them about any account. What this adds is
 * arithmetic over those rows, variances re-derived from the sums.
 */
import { z } from 'zod'
import {
  buildConsolidatedRows,
  type ConsolidatedReportVM,
  type ConsolidatedDisplayRow,
} from '@/app/finances/monthly-report/utils/consolidated-rows'
import { calcVariance, mapTypeToCategory } from './shared'
import { partitionByGroup, withoutHeadingEcho } from './expense-groups'
import { marginPercentText, sectionDisplayLabel, sectionTotalLabel } from '@/app/finances/monthly-report/services/pack-style'

const configSchema = z.object({
  layout: z.enum(['standard', 'calxa']).default('standard'),
  section: z.enum(['all', 'income', 'cogs', 'expense']).optional(),
  columns: z.enum(['actual_budget', 'actuals']).optional(),
}).strict()

export type ConsolidatedPLSection = 'all' | 'income' | 'cogs' | 'expense'

export interface ConsolidatedPLConfig {
  layout: 'standard' | 'calxa'
  section: ConsolidatedPLSection
  columns: 'actual_budget' | 'actuals'
}

export type ParsedConsolidatedPLConfig =
  | { ok: true; config: ConsolidatedPLConfig }
  /** The page still prints — in the standard layout — and says why. */
  | { ok: false; config: ConsolidatedPLConfig; reason: string }

const DEFAULT_CONFIG: ConsolidatedPLConfig = { layout: 'standard', section: 'all', columns: 'actual_budget' }

const CALXA_ONLY_KEYS = ['section', 'columns'] as const

export function parseConsolidatedPLConfig(raw: unknown): ParsedConsolidatedPLConfig {
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
  return { ok: true, config: { layout: 'calxa', section: c.section ?? 'all', columns: c.columns ?? 'actual_budget' } }
}

/** One column's figures. Budget and variance are null where the page prints no budget, or the org has none. */
export interface ConsolidatedPLFigures {
  actual: number
  budget: number | null
  variance: number | null
  /** The group column only. */
  variancePct: number | null
}

export type ConsolidatedPLRowKind = 'section' | 'group' | 'line' | 'total' | 'profit' | 'margin'

export interface ConsolidatedPLRow {
  kind: ConsolidatedPLRowKind
  label: string
  /** 0 a section, total or profit row; 1 an account under a section, or a group; 2 an account under a group. */
  indent: 0 | 1 | 2
  /** Per organisation, in the report's column order. Empty on a section heading. */
  tenants: ConsolidatedPLFigures[]
  elim: number
  group: ConsolidatedPLFigures | null
  /** A margin row's text in place of figures: each org's actual (and budget) margin, then the group's. */
  margins?: { tenants: { actual: string; budget: string }[]; group: { actual: string; budget: string } }
}

export interface ConsolidatedPLPageModel {
  tenantNames: string[]
  /** The group column's heading: the pack's entity name. */
  groupName: string
  /** Budget, Var $ under each organisation: off on an actuals-only page, and when the budget is business-level. */
  tenantBudget: boolean
  /** Budget, Var $, Var % under the group. */
  groupBudget: boolean
  elim: boolean
  rows: ConsolidatedPLRow[]
  /** Sentences under the table. */
  notes: string[]
}

const SECTIONS_BY_FILTER: Record<ConsolidatedPLSection, string[]> = {
  all: ['Revenue', 'Cost of Sales', 'Operating Expenses', 'Other Income', 'Other Expenses'],
  income: ['Revenue'],
  cogs: ['Cost of Sales'],
  expense: ['Operating Expenses'],
}

const isRevenueCategory = (category: string) => category === 'Revenue' || category === 'Other Income'
const printsAsZero = (n: number | null) => n === null || Math.round(n) === 0

interface Sums { actual: number; budget: number }

/**
 * @param vm        the consolidated report as the route serves it
 * @param config    a parsed 'calxa' config
 * @param opts.groupOrder the settings' expense_group_order
 * @param opts.groupName  the pack's entity name, for the group column
 */
export function buildConsolidatedPLPageModel(
  vm: ConsolidatedReportVM,
  reportMonth: string,
  config: ConsolidatedPLConfig,
  opts: { groupOrder?: readonly string[] | null; groupName?: string | null } = {},
): ConsolidatedPLPageModel {
  const built = buildConsolidatedRows(vm, reportMonth)
  const tenantCount = vm.byTenant.length
  const showBudget = config.columns === 'actual_budget'
  const tenantBudget = showBudget && !built.isSingleMode
  const groupBudget = showBudget
  const hasBudget = built.hasAnyBudget

  // The group each account is under, off the consolidated line it came from.
  const groupOf = new Map<ConsolidatedDisplayRow, string | undefined>()
  built.rows.forEach((row, i) => groupOf.set(row, vm.consolidated.lines[i]?.group))

  const tenantHasBudget = vm.byTenant.map((t) => t.budgetLines != null)
  const figures = (sums: Sums, revenue: boolean, budgetShown: boolean, budgetKnown: boolean, pct: boolean): ConsolidatedPLFigures => {
    if (!budgetShown || !budgetKnown) return { actual: sums.actual, budget: null, variance: null, variancePct: null }
    const variance = calcVariance(sums.actual, sums.budget, revenue).amount
    return {
      actual: sums.actual,
      budget: sums.budget,
      variance,
      variancePct: pct && sums.budget !== 0 ? (variance / Math.abs(sums.budget)) * 100 : null,
    }
  }

  /** The row's sums per org, the eliminations and the group, over any set of accounts. */
  const sumRows = (rows: readonly ConsolidatedDisplayRow[], sign: (r: ConsolidatedDisplayRow) => number = () => 1) => {
    const tenants: Sums[] = Array.from({ length: tenantCount }, () => ({ actual: 0, budget: 0 }))
    const group: Sums = { actual: 0, budget: 0 }
    let elim = 0
    for (const r of rows) {
      const s = sign(r)
      r.tenantCells.forEach((cell, i) => {
        tenants[i].actual += s * cell.actual
        tenants[i].budget += s * cell.budget
      })
      elim += s * r.elim
      group.actual += s * r.consolidatedActual
      group.budget += s * r.consolidatedBudget
    }
    return { tenants, group, elim }
  }

  const figureRow = (
    kind: ConsolidatedPLRowKind,
    label: string,
    indent: 0 | 1 | 2,
    sums: ReturnType<typeof sumRows>,
    revenue: boolean,
  ): ConsolidatedPLRow => ({
    kind,
    label,
    indent,
    tenants: sums.tenants.map((t, i) => figures(t, revenue, tenantBudget, tenantHasBudget[i], false)),
    elim: sums.elim,
    group: figures(sums.group, revenue, groupBudget, hasBudget, true),
  })

  /** Nothing in any column this page prints. */
  const silent = (r: ConsolidatedDisplayRow) =>
    r.tenantCells.every((c) => printsAsZero(c.actual) && (!tenantBudget || printsAsZero(c.budget))) &&
    printsAsZero(r.elim) &&
    printsAsZero(r.consolidatedActual) &&
    (!groupBudget || printsAsZero(r.consolidatedBudget))

  const rows: ConsolidatedPLRow[] = []
  const categories = SECTIONS_BY_FILTER[config.section]
  const byCategory = new Map<string, ConsolidatedDisplayRow[]>()
  for (const r of built.rows) {
    const category = mapTypeToCategory(r.accountType)
    byCategory.set(category, [...(byCategory.get(category) ?? []), r])
  }

  for (const category of categories) {
    const revenue = isRevenueCategory(category)
    const all = byCategory.get(category) ?? []
    const shown = all.filter((r) => !silent(r))
    if (shown.length > 0) {
      const label = sectionDisplayLabel(category)
      rows.push({ kind: 'section', label, indent: 0, tenants: [], elim: 0, group: null })
      const tagged = shown.map((r) => ({ row: r, group: groupOf.get(r) }))
      const groups = withoutHeadingEcho(
        partitionByGroup(tagged, opts.groupOrder).map((g) => ({ ...g, subtotal: g.name })),
        label,
      )
      for (const g of groups) {
        if (g.name) rows.push(figureRow('group', g.name, 1, sumRows(g.lines.map((t) => t.row)), revenue))
        for (const { row } of g.lines) {
          rows.push(figureRow('line', row.accountName, g.name ? 2 : 1, sumRows([row]), revenue))
        }
      }
      rows.push(figureRow('total', sectionTotalLabel(category), 0, sumRows(all), revenue))
    }

    if (config.section === 'all' && category === 'Cost of Sales') {
      const trading = [...(byCategory.get('Revenue') ?? []), ...(byCategory.get('Cost of Sales') ?? [])]
      const tradingSign = (r: ConsolidatedDisplayRow) => (mapTypeToCategory(r.accountType) === 'Revenue' ? 1 : -1)
      const income = sumRows(byCategory.get('Revenue') ?? [])
      const gp = sumRows(trading, tradingSign)
      rows.push(figureRow('profit', 'Gross Profit', 0, gp, true))
      const margin = (profit: Sums, of: Sums) => ({
        actual: marginPercentText(profit.actual, of.actual),
        budget: marginPercentText(profit.budget, of.budget),
      })
      rows.push({
        kind: 'margin',
        label: 'Gross Profit %',
        indent: 0,
        tenants: [],
        elim: 0,
        group: null,
        margins: { tenants: gp.tenants.map((t, i) => margin(t, income.tenants[i])), group: margin(gp.group, income.group) },
      })
    }
  }

  if (config.section === 'all') {
    // Net Profit = income − cost of sales − expenses + other income − other expenses.
    const every = categories.flatMap((c) => byCategory.get(c) ?? [])
    const netSign = (r: ConsolidatedDisplayRow) => (isRevenueCategory(mapTypeToCategory(r.accountType)) ? 1 : -1)
    rows.push(figureRow('profit', 'Net Profit', 0, sumRows(every, netSign), true))
  }

  const notes: string[] = []
  if (rows.length === 0) {
    const what = config.section === 'all' ? 'the profit and loss' : sectionDisplayLabel(SECTIONS_BY_FILTER[config.section][0])
    notes.push(`No organisation has anything in ${what} this month.`)
  }
  if (showBudget && !hasBudget) notes.push('No budget is in force for this consolidation, so its budget columns are left blank.')

  return {
    tenantNames: vm.byTenant.map((t) => t.display_name),
    groupName: (opts.groupName ?? '').trim() || (vm.business.name ?? '').trim() || 'Consolidated',
    tenantBudget,
    groupBudget,
    elim: rows.some((r) => !printsAsZero(r.elim)),
    rows,
    notes,
  }
}
