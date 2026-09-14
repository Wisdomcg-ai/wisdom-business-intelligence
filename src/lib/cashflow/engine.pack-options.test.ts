/**
 * The two inputs only the monthly-report pack supplies: an expense line's
 * mapping group, and the instruction to keep an expense month's sign.
 *
 * Both default off, and the forecast module's cashflow must not move when
 * they are absent: some stored forecasts hold negative expense months that
 * are not credits (a cumulative year-to-date series with a reversal), which
 * the engine's Math.abs keeps as payments.
 */
import { describe, it, expect } from 'vitest'
import { generateCashflowForecast } from './engine'
import { FORECAST, baseAssumptions, plLine } from './__fixtures__/small-business'
import type { PLLine } from '@/app/finances/forecast/types'

const withGroup = (line: PLLine, report_group: string | null): PLLine => ({ ...line, report_group })
const groupOf = (data: ReturnType<typeof generateCashflowForecast>, label: string) =>
  data.months[0].expense_groups.find((g) => g.lines.some((l) => l.label === label))?.group

describe('generateCashflowForecast — pack options', () => {
  it('pays a negative expense month as a payment by default, as the forecast module relies on', () => {
    const credit = plLine('Repairs & Maintenance Warehouse', 'Operating Expenses', -502.83)
    const data = generateCashflowForecast([credit], null, baseAssumptions(), FORECAST)
    const line = data.months[0].expense_groups.flatMap((g) => g.lines)[0]
    expect(line.value).toBeGreaterThan(0)
    expect(data.months[0].cash_outflows).toBeGreaterThan(0)
  })

  it('with signedExpenses, a credit reduces the outflow instead of adding to it', () => {
    // Urban Road's July credit: −502.83 × (1 + 10% × 80%) = −543.06.
    const credit = plLine('Repairs & Maintenance Warehouse', 'Operating Expenses', -502.83)
    const rent = plLine('Rent - Office', 'Operating Expenses', 6881.76)
    const data = generateCashflowForecast([rent, credit], null, baseAssumptions(), FORECAST, [], { signedExpenses: true })
    const lines = data.months[0].expense_groups.flatMap((g) => g.lines)
    expect(lines.find((l) => l.label === 'Repairs & Maintenance Warehouse')!.value).toBeCloseTo(-543.06, 2)
    expect(data.months[0].cash_outflows).toBeCloseTo(6881.76 * 1.08 - 543.06, 1)
  })

  it('with signedExpenses, a COGS credit is a negative payment, timed on the same terms', () => {
    const credit = plLine('Customs,Duties & Shipping', 'Cost of Sales', -1000)
    const data = generateCashflowForecast([credit], null, baseAssumptions(), FORECAST, [], { signedExpenses: true })
    // DPO 30: the month-0 stand-in, then each month's credit a month later.
    expect(data.months[0].cogs_lines[0].value).toBeCloseTo(-1100, 2)
    expect(data.months[1].cogs_lines[0].value).toBeCloseTo(-1100, 2)
  })

  it('files an expense under its mapping group when it has one, the keywords when it does not', () => {
    const data = generateCashflowForecast([
      withGroup(plLine('Insurance excl Workers Comp', 'Operating Expenses', 2188.24), 'Other Operating Expenses'),
      withGroup(plLine('Telephone & Internet', 'Operating Expenses', 3264.18), 'Occupancy Expense'),
      plLine('Employ - Wages & Salaries', 'Operating Expenses', 42015.4),
    ], null, baseAssumptions(), FORECAST)
    // The keywords would have said Employment ('worker') and IT ('internet').
    expect(groupOf(data, 'Insurance excl Workers Comp')).toBe('Other Operating Expenses')
    expect(groupOf(data, 'Telephone & Internet')).toBe('Occupancy Expense')
    expect(groupOf(data, 'Employ - Wages & Salaries')).toBe('Employment Expense')
  })

  it('keeps a group the keywords do not know, so its cash stays on a row', () => {
    const fx = withGroup(plLine('Foreign Currency Gains and Losses', 'Operating Expenses', 238.61), 'Foreign Currency Gains and Losses')
    const m = generateCashflowForecast([fx], null, baseAssumptions(), FORECAST).months[0]
    expect(m.expense_groups.map((g) => g.group)).toEqual(['Foreign Currency Gains and Losses'])
    expect(m.expense_groups[0].subtotal).toBeCloseTo(m.cash_outflows, 2)
  })

  it("leaves the forecast module's cashflow untouched when neither is supplied", () => {
    const lines = [
      plLine('Sales', 'Revenue', 10_000),
      plLine('Rent', 'Operating Expenses', -2_000),
      plLine('Materials', 'Cost of Sales', 3_000),
    ]
    const plain = generateCashflowForecast(lines, null, baseAssumptions(), FORECAST)
    const explicit = generateCashflowForecast(
      lines.map((l) => withGroup(l, null)), null, baseAssumptions(), FORECAST, [], { signedExpenses: false },
    )
    expect(explicit).toEqual(plain)
  })
})
