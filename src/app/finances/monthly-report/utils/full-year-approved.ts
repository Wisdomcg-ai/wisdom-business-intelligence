import type { FullYearReport, FullYearLine } from '../types'

/**
 * The approved-budget column on the Full Year page.
 *
 * Two yardsticks now exist for the same client. The FORECAST answers "where
 * will we land"; the APPROVED budget out of budget_versions answers "what were
 * we held to". The monthly Budget-vs-Actual page already switched to the
 * approved budget the moment a client moved to budget_source='budget_version'
 * — the Full Year page did not, so pages 4/6/10 of the pack were measured
 * against one number and pages 16-18 against another, with nothing on either
 * page saying which. For Urban Road the two differ by $83k in August alone,
 * because the forecast's closed months were overwritten with actuals by the
 * seeder while the approved budget still says 450,000.
 *
 * This module holds the one predicate both surfaces ask, so the browser tab and
 * the PDF can never disagree about whether the column is there.
 */

/** Rendered in place of a number that does not exist. Not "$0" — see below. */
export const APPROVED_ABSENT = '—'

/**
 * Does this report carry an approved budget at all?
 *
 * Derived from the payload rather than from a settings flag on purpose: the
 * question the column actually depends on is "did the budget store answer",
 * and budget_source='budget_version' is only the first half of that. A client
 * switched over whose version is not yet in force, is ambiguous, or has no
 * lines gets `approved_annual_budget: null` on every row from the route, and
 * must see no column at all — not an empty one, which a reader fills in as
 * zero.
 *
 * Net profit is the probe because it is the one line every report has and the
 * route builds it last, out of every section: if anything anywhere resolved an
 * approved budget, net profit's is non-null.
 */
export function hasApprovedBudget(report: FullYearReport | null | undefined): boolean {
  if (!report) return false
  if (report.net_profit?.approved_annual_budget != null) return true
  // Belt and braces for a payload built before net profit carried the field
  // (a snapshot frozen between #493 and this change): a section subtotal that
  // has one is proof enough.
  return (report.sections ?? []).some((s) => s.subtotal?.approved_annual_budget != null)
}

/**
 * Format one line's approved annual total, or the absent marker.
 *
 * The formatter is passed in because the tab and the PDF each have their own
 * (locale string vs jsPDF's bracketed negatives) and this must not become a
 * third one that rounds differently from the column next to it.
 */
export function formatApprovedAnnual(line: FullYearLine, fmt: (n: number) => string): string {
  const value = line.approved_annual_budget
  return value == null ? APPROVED_ABSENT : fmt(value)
}
