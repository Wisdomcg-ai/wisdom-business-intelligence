/**
 * The burn-rate bar names the yardstick it is a fraction OF.
 *
 * `transformBurnRateData` divides YTD actuals by `sub.budget_annual_total` off
 * the MONTHLY report — which is the approved budget for a client on the budget
 * store and the forecast for everyone else. So the word in front of it cannot
 * be fixed; it has to be read off `budget_source`, which the route emits from
 * the resolver rather than copying from settings.
 *
 * Both the Charts tab and the exported pack draw this chart. Renaming one of
 * them is worse than renaming neither: before the tab was renamed the two
 * surfaces agreed, and after it they described the identical bar as a forecast
 * on screen and a budget in the client's hands.
 */
import { describe, it, expect } from 'vitest'
import { burnRateYardstick, burnRateSubtitle } from '../BudgetBurnRateChart'

describe('burnRateYardstick', () => {
  it('names the approved budget for a client on the budget store', () => {
    // Urban Road and Distinct Directions. The bar really is a fraction of the
    // budget the client signed off, and the Full Year page calls that column
    // "Approved Budget" in those words.
    expect(burnRateYardstick({ budget_source: 'budget_version' }).title).toBe('Approved Budget Burn Rate')
    expect(burnRateYardstick({ budget_source: 'budget_version' }).noun).toBe('approved budget')
  })

  it('names the forecast for everyone else', () => {
    expect(burnRateYardstick({ budget_source: 'forecast' }).title).toBe('Forecast Burn Rate')
    expect(burnRateYardstick({ budget_source: 'forecast' }).noun).toBe('forecast')
  })

  it('treats an absent budget_source as a forecast, never as approved', () => {
    // Nineteen businesses have no settings row at all. Reading the flag
    // positively is the rule — the failure that matters is calling a forecast
    // an approved budget, not the other way round.
    expect(burnRateYardstick({}).title).toBe('Forecast Burn Rate')
    expect(burnRateYardstick({ budget_source: undefined }).title).toBe('Forecast Burn Rate')
  })
})

describe('burnRateSubtitle', () => {
  it('is one sentence shared by the tab and the pack', () => {
    // The pack used to carry its own: "How much of each annual budget has been
    // spent", printed over a bar the tab called a forecast.
    expect(burnRateSubtitle({ budget_source: 'forecast' }, 16.7))
      .toBe('Expense forecast for current FY (17% of year elapsed)')
    expect(burnRateSubtitle({ budget_source: 'budget_version' }, 16.7))
      .toBe('Expense approved budget for current FY (17% of year elapsed)')
  })
})
