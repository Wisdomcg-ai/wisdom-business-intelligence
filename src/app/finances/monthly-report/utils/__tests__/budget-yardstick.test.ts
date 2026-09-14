/**
 * "Budget" on pack pages 2, 4, 6, 10 and on the Budget-vs-Actual tab.
 *
 * The trap: the monthly statement switched to the APPROVED budget the moment a
 * client moved to budget_source='budget_version', and the Full Year page three
 * pages later in the same pack reserves the words "Approved Budget" for that
 * column while giving "Forecast" to a different one. A reader mapping page 4's
 * unqualified "Budget" onto page 16's "Forecast" reconciles the wrong two
 * columns — on the most-read pages in the pack.
 *
 * The half that must NOT move: ten of the eleven clients with a settings row
 * are still on a forecast, there is only one yardstick in their pack, and
 * "Budget" names it. Their output does not change, note included.
 */
import { describe, it, expect } from 'vitest'
import { statementYardstick, packStatementYardstick, packWagesYardstick, packWagesEmployeeYardstick, wagesEmployeeYardstick } from '../budget-yardstick'

describe('the pack words (Matt, 14 Sep 2026)', () => {
  it("Calxa's 'Budgets' / 'YTD Budget' and no note, whatever the source — the tab keeps its own", () => {
    expect(packStatementYardstick()).toEqual({ columnLabel: 'Budgets', ytdColumnLabel: 'YTD Budget', note: null })
    // The browser tab is unchanged by the decision.
    expect(statementYardstick({ budget_source: 'budget_version' }).columnLabel).toBe('Approved Budget')
  })

  it('the wages page keeps availability and the absent reason, and drops the provenance lines', () => {
    const approved = packWagesYardstick({ source: 'budget_version', label: 'Overall Budget (Xero, rev 12 Aug 2026)' })
    expect(approved).toEqual({ columnLabel: 'Budget', note: null, available: true, absentNote: null })
    const none = packWagesYardstick({ source: 'none', reason: 'no_version_in_force', fiscal_year: 2027 })
    expect(none.available).toBe(false)
    expect(none.absentNote).toContain('no approved budget version is locked for FY2027')
    const emp = packWagesEmployeeYardstick({ source: 'budget_version' }, true)
    expect(emp).toEqual({ columnLabel: 'Forecast', note: null, available: true, absentNote: null })
    expect(packWagesEmployeeYardstick({ source: 'forecast' }, false).absentNote).toContain('No per-employee plan')
  })

  it('keeps the roster source line — "Budget" alone would read as a split of the approved budget — and has no total row to mention', () => {
    expect(packWagesEmployeeYardstick({ source: 'budget_version' }, true, { status: 'applied', missing: [], unchecked: [] })).toEqual({
      columnLabel: 'Budget',
      note: 'Per-employee budgets are the Payroll Report roster’s weekly salaries × this month’s pay runs.',
      available: true,
      absentNote: null,
    })
    expect(packWagesEmployeeYardstick({ source: 'budget_version' }, true, { status: 'applied', missing: ['Thomas White'], unchecked: [] }).note).toBe(
      'Per-employee budgets are the Payroll Report roster’s weekly salaries × this month’s pay runs. ' +
        'No weekly salary on the roster for Thomas White, so their Budget is shown as “—”.',
    )
  })

  it('names a rostered person who was not paid and whom Xero has no record of — their budget is not counted', () => {
    expect(packWagesEmployeeYardstick({ source: 'budget_version' }, true, { status: 'applied', missing: [], unchecked: ['Jordan Casual'] }).note).toBe(
      'Per-employee budgets are the Payroll Report roster’s weekly salaries × this month’s pay runs. ' +
        'Jordan Casual was not paid this month and has no Xero employee record, so their budget is not counted.',
    )
    expect(wagesEmployeeYardstick({ source: 'budget_version' }, true, { status: 'applied', missing: ['Thomas White'], unchecked: ['Jordan Casual', 'Sam Lee'] }).note).toBe(
      'Per-employee budgets are the Payroll Report roster’s weekly salaries × this month’s pay runs. ' +
        'No weekly salary on the roster for Thomas White, so their Budget is shown as “—”. ' +
        'Jordan Casual and Sam Lee were not paid this month and have no Xero employee record, so their budgets are not counted ' +
        'and the Budget total is left out.',
    )
  })
})

describe('statementYardstick', () => {
  it('names the approved budget, and the version, for a budget-store client', () => {
    const y = statementYardstick({
      budget_source: 'budget_version',
      budget_forecast_name: 'FY27 Overall Budget',
    })
    expect(y.columnLabel).toBe('Approved Budget')
    expect(y.ytdColumnLabel).toBe('YTD Approved Budget')
    // The version is what the client actually signed; a pack that cannot be
    // tied back to one is not evidence.
    expect(y.note).toContain('FY27 Overall Budget')
    expect(y.note).toContain('not the forecast')
  })

  it('still names the yardstick when the version has no label', () => {
    const y = statementYardstick({ budget_source: 'budget_version' })
    expect(y.columnLabel).toBe('Approved Budget')
    expect(y.note).toContain('approved budget')
    // No empty parentheses where a label would have gone.
    expect(y.note).not.toContain('()')
  })

  it('leaves a forecast client exactly as they were, note included', () => {
    const y = statementYardstick({ budget_source: 'forecast' })
    expect(y.columnLabel).toBe('Budget')
    expect(y.ytdColumnLabel).toBe('YTD Budget')
    // A note on a page with one yardstick is noise, and noise on ten clients'
    // packs is a change we did not need to make.
    expect(y.note).toBeNull()
  })

  it('reads the flag positively — no settings row is a forecast', () => {
    // Nineteen businesses have no monthly_report_settings row at all. The
    // failure that costs money is calling a forecast an approved budget.
    expect(statementYardstick({}).columnLabel).toBe('Budget')
    expect(statementYardstick({ budget_source: undefined }).note).toBeNull()
  })

  it('treats budget_source "none" as unqualified, not as approved', () => {
    // The resolver emits 'none' for a client switched over whose version will
    // not resolve. There is no approved budget on that page to name.
    expect(statementYardstick({ budget_source: 'none' }).columnLabel).toBe('Budget')
    expect(statementYardstick({ budget_source: 'none' }).note).toBeNull()
  })
})
