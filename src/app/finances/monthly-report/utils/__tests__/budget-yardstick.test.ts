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
import { statementYardstick } from '../budget-yardstick'

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
