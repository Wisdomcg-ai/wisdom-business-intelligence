import type { GeneratedReport, BudgetProvenance, WagesDetailData } from '../types'
import type { NoBudgetReason } from '@/lib/budgets/resolve-budget'
import type { RosterBudgetUnavailableReason } from '@/lib/monthly-report/wages-roster-budget'

/**
 * What the word "Budget" means on the monthly statement — in one place, because
 * three pages of the pack and one browser tab all print it.
 *
 * The monthly Budget-vs-Actual statement switched to the APPROVED budget out of
 * budget_versions the moment a client moved to budget_source='budget_version'.
 * The Full Year page in the same pack shows that budget in a column headed
 * "Approved Budget" and gives "Forecast" to a different number beside it. So a
 * reader who maps the unqualified "Budget" on pack page 4 onto "Forecast" on
 * page 16 reconciles the wrong two columns — on the most-read pages there are.
 *
 * The rule the types.ts docblock states: anything that puts the word Budget in
 * front of a reader has to consult budget_source. Read it POSITIVELY —
 * nineteen businesses have no settings row at all, and the failure that costs
 * money is calling a forecast an approved budget, never the reverse.
 *
 * For the ten clients still on a forecast this returns exactly the labels those
 * pages already carried, and their packs do not change: there is only one
 * yardstick in them and "Budget" names it.
 */
export interface StatementYardstick {
  /** Column head over the report month's budget figures. */
  columnLabel: string
  /** Column head over the YTD budget figures. */
  ytdColumnLabel: string
  /**
   * The line naming the yardstick for every budget-derived column on the page
   * — including the ones too narrow to rename (Unspent, Next Mth, Annual).
   * Null when "Budget" is unambiguous, so nothing is added to a pack that does
   * not need it.
   */
  note: string | null
}

export const APPROVED_LABEL = 'Approved Budget'

/**
 * The sentence that names the approved budget as the yardstick, for one page.
 *
 * `crossRef` is the OTHER page in the same pack a reader is most likely to
 * reconcile this one against. The words themselves live here and nowhere else,
 * so the browser tab and the PDF page cannot drift apart — which is the whole
 * failure this module was written for.
 */
function approvedNote(versionLabel: string | null | undefined, crossRef: string): string {
  const version = (versionLabel ?? '').trim()
  return (
    `Every budget figure on this page is the approved budget` +
    `${version ? ` (${version})` : ''} — not the forecast. ` +
    `${crossRef} names the same yardstick “${APPROVED_LABEL}”.`
  )
}

export function statementYardstick(
  report: Pick<GeneratedReport, 'budget_source' | 'budget_forecast_name'>,
): StatementYardstick {
  if (report.budget_source !== 'budget_version') {
    return { columnLabel: 'Budget', ytdColumnLabel: 'YTD Budget', note: null }
  }
  // budget_forecast_name is the resolver's label for whatever produced the
  // column, which for this branch is the budget version. Naming the version
  // matters more than naming the source: a locked version is the thing the
  // client signed, and a pack that cannot be tied back to one is not evidence.
  return {
    columnLabel: APPROVED_LABEL,
    ytdColumnLabel: `YTD ${APPROVED_LABEL}`,
    note: approvedNote(report.budget_forecast_name, 'The Full Year page'),
  }
}

/**
 * The words the PDF PACK prints over its budget columns — Calxa's, for every
 * client: "Budgets" over the month, "YTD Budget" over the year to date, and no
 * note.
 *
 * The browser tab keeps statementYardstick. The reason it says "Approved
 * Budget" was a pack that printed a Forecast column and an Approved Budget
 * column side by side on its Full Year page; that page is now Calxa's Current
 * Year Budget page and carries no forecast column, so the pack holds one
 * yardstick and one word names it. Matt accepted this on 14 Sep 2026 (the
 * column-names decision), along with taking the provenance sentence out of the
 * pack. Forecast-basis clients printed "Budget" here and get Calxa's "Budgets"
 * too — the same column set (Variance, YTD Actuals, Unspent Budget) is already
 * Calxa's for every client.
 *
 * Deliberately independent of budget_source: the no-budget reason card
 * (noBudgetNote) still says why a column is empty; nothing here is a claim
 * about where the figures came from.
 */
export const PACK_BUDGET_LABEL = 'Budgets'
export const PACK_YTD_BUDGET_LABEL = 'YTD Budget'

export function packStatementYardstick(): StatementYardstick {
  return { columnLabel: PACK_BUDGET_LABEL, ytdColumnLabel: PACK_YTD_BUDGET_LABEL, note: null }
}

export interface PageYardstick {
  /** Column head over the budget figures. */
  columnLabel: string
  /** Names the yardstick, when "Budget" alone would name two different numbers. */
  note: string | null
  /**
   * False when nothing resolved. Every budget-derived cell on the page is then
   * a dash, and `absentNote` says why — never a $0 that reads as a budget of
   * nothing, and never a variance measured against one.
   */
  available: boolean
  absentNote: string | null
}

/**
 * The word over the wages page's account budget column, and the line under it.
 *
 * The page used to read `forecast_pl_lines` unconditionally, so for a client on
 * the budget store it headed an unqualified "Budget" over the FORECAST while
 * pages 4/6/10 of the same pack headed "Approved Budget" over a different
 * number for the same account (Urban Road, August 2026: $76,182 against
 * $52,519 for Employ - Wages & Salaries). Same word, two yardsticks, one pack.
 *
 * `undefined` provenance is a response that predates this field. It gets
 * exactly the words the page carried before — "Budget", no note, available —
 * because that is what it is: a forecast-sourced column on a pack that had
 * only one yardstick in it.
 */
export function wagesYardstick(provenance?: BudgetProvenance | null): PageYardstick {
  if (!provenance) return { columnLabel: 'Budget', note: null, available: true, absentNote: null }

  if (provenance.source === 'budget_version') {
    return {
      columnLabel: APPROVED_LABEL,
      note: approvedNote(provenance.label, 'The Budget vs Actual page'),
      available: true,
      absentNote: null,
    }
  }

  if (provenance.source === 'forecast') {
    return { columnLabel: 'Budget', note: null, available: true, absentNote: null }
  }

  return {
    columnLabel: 'Budget',
    note: null,
    available: false,
    absentNote: absentSentence(provenance.reason, provenance.fiscal_year),
  }
}

/**
 * The word over the wages page's PER-EMPLOYEE budget column.
 *
 * A different object from the account column above it: the approved budget is
 * not split by employee, so the per-employee plan is a forecast's — or, for a
 * client with no forecast plan, the Payroll Report roster's weekly salaries
 * (`roster`, which the loader sets only then). So on a budget-store client's
 * page the two columns cannot both be headed "Budget" over a forecast — that
 * is the same defect one table lower down.
 *
 * `planExists` is the availability guard: with no plan every figure in the
 * column is 0, and $0 against a real actual is a 100% favourable variance on
 * someone's salary.
 */
export function wagesEmployeeYardstick(
  provenance: BudgetProvenance | null | undefined,
  planExists: boolean,
  roster?: WagesDetailData['employee_roster'],
): PageYardstick {
  if (roster?.status === 'applied') {
    return { columnLabel: 'Budget', note: rosterNote(roster.missing, true), available: true, absentNote: null }
  }
  if (roster?.status === 'unavailable') {
    return {
      columnLabel: 'Budget',
      note: null,
      available: false,
      absentNote:
        `The Payroll Report roster’s weekly salaries could not be turned into this month’s budget because ` +
        `${ROSTER_UNAVAILABLE_BECAUSE[roster.reason] ?? 'the pay runs could not be counted'}, ` +
        'so the per-employee Budget and Variance columns are shown as “—”.',
    }
  }
  if (!planExists) {
    return {
      columnLabel: 'Budget',
      note: null,
      available: false,
      absentNote:
        'No per-employee plan exists for this month, so the per-employee Budget ' +
        'and Variance columns are shown as “—”.',
    }
  }
  if (provenance?.source === 'budget_version') {
    return {
      columnLabel: 'Forecast',
      note:
        'The per-employee figures are the forecast’s employee plan — the approved ' +
        'budget above is not split by employee.',
      available: true,
      absentNote: null,
    }
  }
  return { columnLabel: 'Budget', note: null, available: true, absentNote: null }
}

const ROSTER_UNAVAILABLE_BECAUSE: Record<RosterBudgetUnavailableReason, string> = {
  unknown_pay_cycle: 'a pay run this month has no recognised pay cycle',
  mixed_pay_cycles: 'this month’s pay runs are on more than one pay cycle',
  overlapping_pay_periods: 'this month’s pay runs cover overlapping pay periods',
  start_dates_unreadable: 'the employees’ start dates could not be read',
}

/**
 * Where roster budgets come from, and who has none. `hasTotalRow` is the tab's
 * total row, which is left out rather than print a sum over part of the team
 * under the team's heading; the pack's employee table has no total row.
 */
function rosterNote(missing: readonly string[], hasTotalRow: boolean): string {
  const source = 'Per-employee budgets are the Payroll Report roster’s weekly salaries × this month’s pay runs.'
  if (missing.length === 0) return source
  const names = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
  return (
    `${source} No weekly salary on the roster for ${names}, so their Budget is shown as “—”` +
    `${hasTotalRow ? ' and the Budget total is left out' : ''}.`
  )
}

/**
 * The Wages page's two yardsticks in the pack: the tab's availability and
 * absent-reason (a column of dashes still has to say why), without the
 * provenance sentence. The account column reads "Budget" on either source —
 * "Approved Budget" there only ever existed to tell it apart from the Full
 * Year page's forecast column, which the pack no longer prints. The
 * per-employee column keeps its own head ("Forecast" for a budget-store
 * client), which says what the removed note said.
 *
 * The one note the pack keeps is the roster's. Its column is headed "Budget"
 * under an account table headed "Budget" over the approved budget, and without
 * the line a reader takes the per-employee figures for a split of that budget —
 * they are the coach's roster, which happens to tie to it for Urban Road.
 */
export function packWagesYardstick(provenance?: BudgetProvenance | null): PageYardstick {
  const y = wagesYardstick(provenance)
  return { ...y, columnLabel: 'Budget', note: null }
}

export function packWagesEmployeeYardstick(
  provenance: BudgetProvenance | null | undefined,
  planExists: boolean,
  roster?: WagesDetailData['employee_roster'],
): PageYardstick {
  return {
    ...wagesEmployeeYardstick(provenance, planExists, roster),
    note: roster?.status === 'applied' ? rosterNote(roster.missing, false) : null,
  }
}

/**
 * Why the budget columns are empty, in one sentence.
 *
 * A column of dashes with nothing explaining them is the empty-state-as-
 * instruction trap: the reader supplies their own explanation, and it is
 * usually "the system is broken" or "we budgeted nothing". The resolver
 * already knows which of six things went wrong; this is the only place that
 * turns that into words, so the tab and the pack say the same one.
 */
export function absentSentence(
  reason: NoBudgetReason | null | undefined,
  fiscalYear: number | string | null | undefined,
): string {
  return `No budget for this month — Budget and Variance columns are shown as “—” because ${noBudgetBecause(reason, fiscalYear)}.`
}

/**
 * The "because" clause of absentSentence on its own, for a page whose columns
 * are not the statement's (the Subscription page's TOTAL row).
 */
export function noBudgetBecause(
  reason: NoBudgetReason | null | undefined,
  fiscalYear: number | string | null | undefined,
): string {
  const fy = fiscalYear ? `FY${fiscalYear}` : 'this fiscal year'
  switch (reason) {
    case 'no_version_in_force':
      return `no approved budget version is locked for ${fy}`
    case 'version_not_yet_effective':
      return 'the approved budget version takes effect after this month'
    case 'multiple_versions_in_force':
      return 'more than one approved budget version is in force, so none was applied'
    case 'version_has_no_lines':
      return 'the approved budget version has no lines'
    case 'budget_read_failed':
      return 'the approved budget could not be read'
    case 'invalid_report_month':
      return 'this month cannot be matched to a budget period'
    // No reason is the forecast path: the resolver only explains itself for
    // a client on the budget store.
    default:
      return `no active forecast was found for ${fy}`
  }
}

/**
 * The same sentence for the monthly statement, off the report's own fields.
 * `has_budget` is the authority: the resolver keeps it equal to
 * `lines.length > 0`, so a source that resolved an object and yielded nothing
 * is a no-budget report here too.
 */
export function noBudgetNote(
  report: Pick<GeneratedReport, 'has_budget' | 'no_budget_reason' | 'fiscal_year'>,
): string | null {
  if (report.has_budget) return null
  return absentSentence(report.no_budget_reason, report.fiscal_year)
}
