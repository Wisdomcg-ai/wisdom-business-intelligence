import type { GeneratedReport, BudgetProvenance } from '../types'
import type { NoBudgetReason } from '@/lib/budgets/resolve-budget'

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
 * A different object from the account column above it: the per-employee plan
 * exists only inside a forecast, and the approved budget is not split by
 * employee. So on a budget-store client's page the two columns cannot both be
 * headed "Budget" — that is the same defect one table lower down.
 *
 * `planExists` is the availability guard: with no plan every figure in the
 * column is 0, and $0 against a real actual is a 100% favourable variance on
 * someone's salary.
 */
export function wagesEmployeeYardstick(
  provenance: BudgetProvenance | null | undefined,
  planExists: boolean,
): PageYardstick {
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
  const fy = fiscalYear ? `FY${fiscalYear}` : 'this fiscal year'
  const because = (() => {
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
  })()
  return `No budget for this month — Budget and Variance columns are shown as “—” because ${because}.`
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
