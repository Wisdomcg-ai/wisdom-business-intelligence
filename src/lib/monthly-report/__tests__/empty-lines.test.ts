/**
 * The account names are Urban Road's real dormant accounts, taken off the
 * August 2026 pack where each printed a full row of zeros.
 */
import { describe, it, expect } from 'vitest'
import { isSilentLine, withoutSilentLines, isSilentFullYearLine, withoutSilentFullYearLines } from '../empty-lines'

const silent = { actual: 0, budget: 0, ytd_actual: 0, ytd_budget: 0, budget_annual_total: 0, budget_next_month: 0, prior_year_actual: 0 }

describe('isSilentLine', () => {
  it('drops a dormant account with nothing anywhere', () => {
    expect(isSilentLine(silent)).toBe(true)
  })

  it('KEEPS a budget with no spend — a 100% underspend is the loudest kind', () => {
    expect(isSilentLine({ ...silent, budget: 27090 })).toBe(false)
  })

  it('KEEPS unbudgeted spend', () => {
    expect(isSilentLine({ ...silent, actual: 4200 })).toBe(false)
  })

  it('KEEPS an account quiet this month but active this year', () => {
    expect(isSilentLine({ ...silent, ytd_actual: 33711 })).toBe(false)
  })

  it('KEEPS an account budgeted only later in the year', () => {
    // Art Import is budgeted in Sep, Dec and May only — the annual column is
    // the sole evidence it exists in August.
    expect(isSilentLine({ ...silent, budget_annual_total: 45000 })).toBe(false)
  })

  it('KEEPS an account that carried money last year and none this year', () => {
    // "We stopped doing this" is a finding, not an absence.
    expect(isSilentLine({ ...silent, prior_year_actual: 27482 })).toBe(false)
  })

  it('treats floating-point residue as zero', () => {
    expect(isSilentLine({ ...silent, actual: 4e-14 })).toBe(true)
    // But not a real cent.
    expect(isSilentLine({ ...silent, actual: 0.01 })).toBe(false)
  })

  it('treats missing figures as zero rather than crashing', () => {
    expect(isSilentLine({})).toBe(true)
    expect(isSilentLine({ actual: null, budget: undefined })).toBe(true)
    expect(isSilentLine({ actual: NaN })).toBe(true)
  })
})

describe('withoutSilentLines', () => {
  it('removes the dormant accounts and keeps the rest', () => {
    const lines = [
      { account_name: 'Canvas Sales', ...silent, actual: 349319 },
      { account_name: 'Commercial Sales', ...silent },
      { account_name: 'Furniture Sales', ...silent },
      { account_name: 'Materialised', ...silent, budget_annual_total: 5000 },
      { account_name: 'Canvas Jondo', ...silent },
    ]
    expect(withoutSilentLines(lines).map(l => l.account_name)).toEqual([
      'Canvas Sales', 'Materialised',
    ])
  })

  it('never empties a section — an all-silent category is itself a finding', () => {
    // A whole cost category with no activity reads better as an empty table
    // under its heading than as a section that vanished without explanation.
    const allSilent = [{ account_name: 'A', ...silent }, { account_name: 'B', ...silent }]
    expect(withoutSilentLines(allSilent)).toHaveLength(2)
  })

  it('leaves an already-clean section untouched', () => {
    const lines = [{ account_name: 'A', ...silent, actual: 1 }]
    expect(withoutSilentLines(lines)).toEqual(lines)
  })
})

describe('isSilentFullYearLine', () => {
  const m = (o = {}) => ({ actual: 0, budget: 0, approved_budget: 0, ...o })
  const twelve = () => Array.from({ length: 12 }, () => m())
  const base = { months: twelve(), projected_total: 0, annual_budget: 0, approved_annual_budget: 0 }

  it('drops a dormant account across the whole year', () => {
    expect(isSilentFullYearLine(base)).toBe(true)
  })

  it('KEEPS an account budgeted in only one month', () => {
    // Art Import: budgeted September, December and May only. Eleven of its
    // twelve cells are zero and it is not silent.
    const months = twelve()
    months[2] = m({ approved_budget: 15000 })
    expect(isSilentFullYearLine({ ...base, months })).toBe(false)
  })

  it('KEEPS an account with a single month of actuals', () => {
    const months = twelve()
    months[0] = m({ actual: 33711 })
    expect(isSilentFullYearLine({ ...base, months })).toBe(false)
  })

  it('KEEPS an account with only an annual total', () => {
    expect(isSilentFullYearLine({ ...base, approved_annual_budget: 45000 })).toBe(false)
    expect(isSilentFullYearLine({ ...base, annual_budget: 45000 })).toBe(false)
    expect(isSilentFullYearLine({ ...base, projected_total: 45000 })).toBe(false)
  })

  it('survives a line with no months array at all', () => {
    expect(isSilentFullYearLine({})).toBe(true)
  })

  it('never empties a section', () => {
    expect(withoutSilentFullYearLines([base, base])).toHaveLength(2)
  })
})
