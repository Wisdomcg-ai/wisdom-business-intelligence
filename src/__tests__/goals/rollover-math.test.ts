/**
 * Tests for rollover-math.ts — Phase 73 Plan 02
 *
 * Covers:
 *   - computeRolledLadder: D3 shift correctness, null/undefined → 0
 *   - computeRolledPlanDates: FY boundary (prior 2026-06-30), CY boundary (prior 2026-12-31), +3y planEnd
 */
import { describe, it, expect } from 'vitest'
import {
  computeRolledLadder,
  computeRolledPlanDates,
  applyFinancialActuals,
} from '@/app/goals/utils/rollover-math'

// ─── Ladder Shift ────────────────────────────────────────────────────────────

describe('computeRolledLadder — D3 shift', () => {
  const priorRow = {
    revenue_current: 100,
    revenue_year1: 200,
    revenue_year2: 300,
    revenue_year3: 400,

    gross_profit_current: 10,
    gross_profit_year1: 20,
    gross_profit_year2: 30,
    gross_profit_year3: 40,

    gross_margin_current: 5,
    gross_margin_year1: 10,
    gross_margin_year2: 15,
    gross_margin_year3: 20,

    net_profit_current: 1,
    net_profit_year1: 2,
    net_profit_year2: 3,
    net_profit_year3: 4,

    net_margin_current: 0.5,
    net_margin_year1: 1,
    net_margin_year2: 1.5,
    net_margin_year3: 2,

    customers_current: 50,
    customers_year1: 100,
    customers_year2: 150,
    customers_year3: 200,

    employees_current: 5,
    employees_year1: 6,
    employees_year2: 7,
    employees_year3: 8,

    leads_per_month_current: 10,
    leads_per_month_year1: 20,
    leads_per_month_year2: 30,
    leads_per_month_year3: 40,

    conversion_rate_current: 0.1,
    conversion_rate_year1: 0.2,
    conversion_rate_year2: 0.3,
    conversion_rate_year3: 0.4,

    avg_transaction_value_current: 500,
    avg_transaction_value_year1: 600,
    avg_transaction_value_year2: 700,
    avg_transaction_value_year3: 800,

    team_headcount_current: 3,
    team_headcount_year1: 5,
    team_headcount_year2: 7,
    team_headcount_year3: 9,

    owner_hours_per_week_current: 40,
    owner_hours_per_week_year1: 35,
    owner_hours_per_week_year2: 30,
    owner_hours_per_week_year3: 25,
  }

  it('shifts revenue ladder correctly: new_current=prior_year1, new_year1=prior_year2, new_year2=prior_year3, new_year3=prior_year3', () => {
    const result = computeRolledLadder(priorRow)
    expect(result.revenue_current).toBe(200)   // prior year1
    expect(result.revenue_year1).toBe(300)     // prior year2
    expect(result.revenue_year2).toBe(400)     // prior year3
    expect(result.revenue_year3).toBe(400)     // extrapolate: same as prior year3
  })

  it('shifts all 12 metric prefixes correctly', () => {
    const result = computeRolledLadder(priorRow)

    // gross_profit
    expect(result.gross_profit_current).toBe(20)
    expect(result.gross_profit_year1).toBe(30)
    expect(result.gross_profit_year2).toBe(40)
    expect(result.gross_profit_year3).toBe(40)

    // gross_margin
    expect(result.gross_margin_current).toBe(10)
    expect(result.gross_margin_year1).toBe(15)
    expect(result.gross_margin_year2).toBe(20)
    expect(result.gross_margin_year3).toBe(20)

    // net_profit
    expect(result.net_profit_current).toBe(2)
    expect(result.net_profit_year1).toBe(3)
    expect(result.net_profit_year2).toBe(4)
    expect(result.net_profit_year3).toBe(4)

    // net_margin
    expect(result.net_margin_current).toBe(1)
    expect(result.net_margin_year1).toBe(1.5)
    expect(result.net_margin_year2).toBe(2)
    expect(result.net_margin_year3).toBe(2)

    // customers
    expect(result.customers_current).toBe(100)
    expect(result.customers_year1).toBe(150)
    expect(result.customers_year2).toBe(200)
    expect(result.customers_year3).toBe(200)

    // employees
    expect(result.employees_current).toBe(6)
    expect(result.employees_year1).toBe(7)
    expect(result.employees_year2).toBe(8)
    expect(result.employees_year3).toBe(8)

    // leads_per_month
    expect(result.leads_per_month_current).toBe(20)
    expect(result.leads_per_month_year1).toBe(30)
    expect(result.leads_per_month_year2).toBe(40)
    expect(result.leads_per_month_year3).toBe(40)

    // conversion_rate
    expect(result.conversion_rate_current).toBe(0.2)
    expect(result.conversion_rate_year1).toBe(0.3)
    expect(result.conversion_rate_year2).toBe(0.4)
    expect(result.conversion_rate_year3).toBe(0.4)

    // avg_transaction_value
    expect(result.avg_transaction_value_current).toBe(600)
    expect(result.avg_transaction_value_year1).toBe(700)
    expect(result.avg_transaction_value_year2).toBe(800)
    expect(result.avg_transaction_value_year3).toBe(800)

    // team_headcount
    expect(result.team_headcount_current).toBe(5)
    expect(result.team_headcount_year1).toBe(7)
    expect(result.team_headcount_year2).toBe(9)
    expect(result.team_headcount_year3).toBe(9)

    // owner_hours_per_week
    expect(result.owner_hours_per_week_current).toBe(35)
    expect(result.owner_hours_per_week_year1).toBe(30)
    expect(result.owner_hours_per_week_year2).toBe(25)
    expect(result.owner_hours_per_week_year3).toBe(25)
  })

  it('coerces null/undefined values to 0', () => {
    const sparseRow = {
      revenue_year1: 500,
      revenue_year2: null,
      revenue_year3: undefined,
      // all other fields missing
    }
    const result = computeRolledLadder(sparseRow as Record<string, unknown>)
    // new_current = prior_year1 = 500
    expect(result.revenue_current).toBe(500)
    // new_year1 = prior_year2 = null → 0
    expect(result.revenue_year1).toBe(0)
    // new_year2 = prior_year3 = undefined → 0
    expect(result.revenue_year2).toBe(0)
    // new_year3 = prior_year3 = undefined → 0
    expect(result.revenue_year3).toBe(0)
    // Missing metric prefix (gross_profit not in sparseRow) → all 0
    expect(result.gross_profit_current).toBe(0)
  })

  it('returns an object with exactly 48 columns (12 metrics × 4 suffixes)', () => {
    const result = computeRolledLadder(priorRow)
    const keys = Object.keys(result)
    expect(keys.length).toBe(48)
  })
})

// ─── Option B Seeding (applyFinancialActuals) ────────────────────────────────

describe('applyFinancialActuals — Option B seeding (fail-closed)', () => {
  // D3 ladder: new_current = prior_year1. Build from a known prior row so we
  // can assert which *_current values get overridden vs kept on D3.
  const prior = {
    revenue_year1: 200, revenue_year2: 300, revenue_year3: 400,
    gross_profit_year1: 20, gross_profit_year2: 30, gross_profit_year3: 40,
    gross_margin_year1: 10, gross_margin_year2: 15, gross_margin_year3: 20,
    net_profit_year1: 2, net_profit_year2: 3, net_profit_year3: 4,
    net_margin_year1: 1, net_margin_year2: 1.5, net_margin_year3: 2,
    customers_year1: 100, customers_year2: 150, customers_year3: 200,
    employees_year1: 6,
    leads_per_month_year1: 20,
    conversion_rate_year1: 0.2,
    avg_transaction_value_year1: 600,
    team_headcount_year1: 5,
    owner_hours_per_week_year1: 35,
  }
  const d3 = computeRolledLadder(prior as Record<string, unknown>)

  it('usable=false → ladder returned unchanged (keep D3)', () => {
    const out = applyFinancialActuals(d3, { usable: false, revenue: 999, gross_profit: 1, net_profit: 1 })
    expect(out).toEqual(d3)
  })

  it('seeds financial *_current from actuals and DERIVES margins from the seeded dollars', () => {
    const out = applyFinancialActuals(d3, {
      usable: true,
      revenue: 1_000_000,
      gross_profit: 540_000,
      net_profit: 83_000,
    })
    expect(out.revenue_current).toBe(1_000_000)
    expect(out.gross_profit_current).toBe(540_000)
    expect(out.net_profit_current).toBe(83_000)
    // margins derived, whole-percent: 540000/1000000*100 = 54; 83000/1000000*100 = 8.3
    expect(out.gross_margin_current).toBe(54)
    expect(out.net_margin_current).toBe(8.3)
  })

  it('rounds dollars to whole numbers and margins to 2dp', () => {
    const out = applyFinancialActuals(d3, {
      usable: true,
      revenue: 1_234_567.89,
      gross_profit: 416_543.21,
      net_profit: 98_765.43,
    })
    expect(out.revenue_current).toBe(1_234_568)
    expect(out.gross_profit_current).toBe(416_543)
    expect(out.net_profit_current).toBe(98_765)
    expect(out.gross_margin_current).toBe(33.74) // 416543.21/1234567.89*100 → 33.7439 → 33.74
    expect(out.net_margin_current).toBe(8)        // 98765.43/1234567.89*100 → ~8.00 → 8
  })

  it('never touches year1/year2/year3 (preserves the D3 shift)', () => {
    const out = applyFinancialActuals(d3, { usable: true, revenue: 1_000_000, gross_profit: 540_000, net_profit: 83_000 })
    expect(out.revenue_year1).toBe(d3.revenue_year1)
    expect(out.revenue_year2).toBe(d3.revenue_year2)
    expect(out.revenue_year3).toBe(d3.revenue_year3)
    expect(out.gross_profit_year1).toBe(d3.gross_profit_year1)
    expect(out.net_margin_year3).toBe(d3.net_margin_year3)
  })

  it('never touches non-financial metrics (no actual source → keep D3)', () => {
    const out = applyFinancialActuals(d3, { usable: true, revenue: 1_000_000, gross_profit: 540_000, net_profit: 83_000 })
    expect(out.customers_current).toBe(d3.customers_current)            // = prior customers_year1 = 100
    expect(out.employees_current).toBe(d3.employees_current)
    expect(out.leads_per_month_current).toBe(d3.leads_per_month_current)
    expect(out.conversion_rate_current).toBe(d3.conversion_rate_current)
    expect(out.avg_transaction_value_current).toBe(d3.avg_transaction_value_current)
    expect(out.team_headcount_current).toBe(d3.team_headcount_current)
    expect(out.owner_hours_per_week_current).toBe(d3.owner_hours_per_week_current)
  })

  it('fail-closed when revenue <= 0 → unchanged', () => {
    expect(applyFinancialActuals(d3, { usable: true, revenue: 0, gross_profit: 5, net_profit: 5 })).toEqual(d3)
    expect(applyFinancialActuals(d3, { usable: true, revenue: -100, gross_profit: 5, net_profit: 5 })).toEqual(d3)
  })

  it('fail-closed when revenue is not finite → unchanged', () => {
    expect(applyFinancialActuals(d3, { usable: true, revenue: NaN, gross_profit: 5, net_profit: 5 })).toEqual(d3)
  })

  it('seeds revenue but keeps D3 GP/NP (and their margins) when GP/NP are not finite', () => {
    const out = applyFinancialActuals(d3, { usable: true, revenue: 1_000_000, gross_profit: NaN, net_profit: NaN })
    expect(out.revenue_current).toBe(1_000_000)
    expect(out.gross_profit_current).toBe(d3.gross_profit_current) // kept D3
    expect(out.gross_margin_current).toBe(d3.gross_margin_current)
    expect(out.net_profit_current).toBe(d3.net_profit_current)
    expect(out.net_margin_current).toBe(d3.net_margin_current)
  })

  it('is pure — does not mutate the input ladder', () => {
    const snapshot = { ...d3 }
    applyFinancialActuals(d3, { usable: true, revenue: 1_000_000, gross_profit: 540_000, net_profit: 83_000 })
    expect(d3).toEqual(snapshot)
  })
})

// ─── Plan Date Roll ──────────────────────────────────────────────────────────

describe('computeRolledPlanDates — FY boundary (yearStartMonth=7)', () => {
  // Prior year1_end_date = 2026-06-30 (end of FY26)
  const priorYear1End = new Date(2026, 5, 30) // June 30, 2026

  it('planStartDate = 2026-07-01 (start of FY27)', () => {
    const result = computeRolledPlanDates(priorYear1End, 'FY', 7)
    expect(result.planStartDate.getFullYear()).toBe(2026)
    expect(result.planStartDate.getMonth()).toBe(6) // July = month index 6
    expect(result.planStartDate.getDate()).toBe(1)
  })

  it('year1EndDate = 2027-06-30 (end of FY27)', () => {
    const result = computeRolledPlanDates(priorYear1End, 'FY', 7)
    expect(result.year1EndDate.getFullYear()).toBe(2027)
    expect(result.year1EndDate.getMonth()).toBe(5) // June = month index 5
    expect(result.year1EndDate.getDate()).toBe(30)
  })

  it('planEndDate = 2029-06-30 (end of FY29 = newFY+2)', () => {
    const result = computeRolledPlanDates(priorYear1End, 'FY', 7)
    expect(result.planEndDate.getFullYear()).toBe(2029)
    expect(result.planEndDate.getMonth()).toBe(5) // June
    expect(result.planEndDate.getDate()).toBe(30)
  })
})

describe('computeRolledPlanDates — CY boundary (yearStartMonth=1)', () => {
  // Prior year1_end_date = 2026-12-31 (end of CY26)
  const priorYear1End = new Date(2026, 11, 31) // December 31, 2026

  it('planStartDate = 2027-01-01 (start of CY27)', () => {
    const result = computeRolledPlanDates(priorYear1End, 'CY', 1)
    expect(result.planStartDate.getFullYear()).toBe(2027)
    expect(result.planStartDate.getMonth()).toBe(0) // January = month index 0
    expect(result.planStartDate.getDate()).toBe(1)
  })

  it('year1EndDate = 2027-12-31 (end of CY27)', () => {
    const result = computeRolledPlanDates(priorYear1End, 'CY', 1)
    expect(result.year1EndDate.getFullYear()).toBe(2027)
    expect(result.year1EndDate.getMonth()).toBe(11) // December = month index 11
    expect(result.year1EndDate.getDate()).toBe(31)
  })

  it('planEndDate = 2029-12-31 (end of CY29 = newFY+2)', () => {
    const result = computeRolledPlanDates(priorYear1End, 'CY', 1)
    expect(result.planEndDate.getFullYear()).toBe(2029)
    expect(result.planEndDate.getMonth()).toBe(11) // December
    expect(result.planEndDate.getDate()).toBe(31)
  })
})
