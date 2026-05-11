/**
 * Integration tests: seed transformer (59-01) + pl-lines generator (existing)
 *
 * Exercises the exact two-step chain that 59-02's route runs:
 *   1. seedForecastFromPrior (59-01 pure service)
 *   2. convertAssumptionsToPLLines (existing assumptions-to-pl-lines.ts)
 *
 * These tests verify the critical seam between the two modules — month-key
 * alignment, value preservation, CapEx/Goals exclusion, adhoc expectedMonths,
 * and plannedHires clearing. Unit tests in forecast-seed-service.test.ts cover
 * each module in isolation; this file catches mismatches at the join.
 *
 * Covers PHASE.md success criterion 2 (pre-populated revenue/COGS/OpEx/team/
 * subscriptions; CapEx + Goals empty after seed) and decisions D1, D3.
 */

import { describe, it, expect } from 'vitest'
import { seedForecastFromPrior, isForecastSeedable } from '../forecast-seed-service'
import {
  convertAssumptionsToPLLines,
  generateMonthRange,
} from '@/app/finances/forecast/services/assumptions-to-pl-lines'
import type { ForecastAssumptions } from '@/app/finances/forecast/components/wizard-v4/types/assumptions'

// ─── Fixture ─────────────────────────────────────────────────────────────────

/**
 * Realistic JDS-style portfolio business fixture — prior FY26 assumptions.
 *
 * FY26 = Jul 2025 – Jun 2026 (AU fiscal year, yearStart='07').
 *
 * Revenue line 1 : 12 × $50,000 = $600,000 across 2025-07..2026-06
 * Revenue line 2 : sparse 6 keys (every other month) totalling $120,000
 * COGS           : 1 variable line with year1Monthly across same 12 months
 * OpEx           : 3 lines — fixed, percentage-of-revenue, adhoc
 * Team           : 2 existing members, 1 planned hire "Bob" (to be cleared)
 * CapEx          : 1 item (should be stripped)
 * Goals          : populated (should be stripped)
 */
function makeFY26Fixture(): ForecastAssumptions {
  // FY26 month keys: Jul 2025 – Jun 2026
  const fy26Months = generateMonthRange('2025-07', '2026-06')

  // Revenue line 1: flat $50,000/month across all 12 FY26 months → $600,000
  const revLine1Monthly: Record<string, number> = {}
  for (const mk of fy26Months) {
    revLine1Monthly[mk] = 50000
  }

  // Revenue line 2: sparse — 6 months (every other month) × $20,000 = $120,000
  // Jul, Sep, Nov, Jan, Mar, May
  const revLine2Monthly: Record<string, number> = {}
  for (let i = 0; i < fy26Months.length; i += 2) {
    revLine2Monthly[fy26Months[i]] = 20000
  }

  // COGS line 1: explicit monthly values for all 12 months ($8,000/month)
  const cogsLine1Monthly: Record<string, number> = {}
  for (const mk of fy26Months) {
    cogsLine1Monthly[mk] = 8000
  }

  // Year2 monthly for multi-year test (FY27 months when duration=2): 2026-07..2027-06
  const fy27Months = generateMonthRange('2026-07', '2027-06')
  const revLine1Year2Monthly: Record<string, number> = {}
  for (const mk of fy27Months) {
    revLine1Year2Monthly[mk] = 55000
  }

  return {
    version: 11,
    createdAt: '2025-05-01T00:00:00.000Z',
    updatedAt: '2025-05-01T00:00:00.000Z',
    fiscalYearStart: '07',
    industry: 'consulting',
    employeeCount: 10,
    goals: {
      year1: { revenue: 1500000, grossProfitPct: 60, netProfitPct: 20 },
      year2: { revenue: 1800000, grossProfitPct: 62, netProfitPct: 22 },
    },
    revenue: {
      lines: [
        {
          accountId: 'rev-001',
          accountName: 'Management Consulting',
          priorYearTotal: 600000,
          growthType: 'percentage',
          growthPct: 0,
          year1Monthly: revLine1Monthly,       // FY26: $50k × 12 = $600k
          year2Monthly: revLine1Year2Monthly,  // FY27: $55k × 12 (for multi-year test)
          year3Monthly: {},
        },
        {
          accountId: 'rev-002',
          accountName: 'Advisory Services',
          priorYearTotal: 120000,
          growthType: 'percentage',
          growthPct: 0,
          year1Monthly: revLine2Monthly,  // FY26: sparse 6 months × $20k = $120k
        },
      ],
      seasonalityPattern: Array(12).fill(100 / 12),
      seasonalitySource: 'manual',
    },
    cogs: {
      lines: [
        {
          accountId: 'cogs-001',
          accountName: 'Direct Labour',
          priorYearTotal: 96000,
          costBehavior: 'variable',
          percentOfRevenue: 13.33,
          year1Monthly: cogsLine1Monthly,  // FY26: $8k × 12 = $96k
        },
      ],
    },
    team: {
      existingTeam: [
        {
          employeeId: 'emp-001',
          name: 'Sarah Chen',
          role: 'Principal Consultant',
          employmentType: 'full-time',
          currentSalary: 140000,
          salaryIncreasePct: 3,
          includeInForecast: true,
          isFromXero: true,
        },
        {
          employeeId: 'emp-002',
          name: 'James Wu',
          role: 'Senior Analyst',
          employmentType: 'full-time',
          currentSalary: 110000,
          salaryIncreasePct: 3,
          includeInForecast: true,
          isFromXero: true,
        },
      ],
      plannedHires: [
        {
          id: 'hire-001',
          role: 'Graduate Analyst',
          employmentType: 'full-time',
          salary: 80000,
          startMonth: '2025-10',  // Oct 2025 (in FY26 range)
        },
      ],
      superannuationPct: 11.5,
      workCoverPct: 1.5,
      payrollTaxPct: 5.45,
      payrollTaxThreshold: 1200000,
    },
    opex: {
      lines: [
        {
          accountId: 'opex-001',
          accountName: 'Office Rent',
          priorYearTotal: 60000,
          costBehavior: 'fixed',
          monthlyAmount: 5000,
        },
        {
          accountId: 'opex-002',
          accountName: 'Marketing Spend',
          priorYearTotal: 36000,
          costBehavior: 'variable',
          percentOfRevenue: 5,
        },
        {
          accountId: 'opex-003',
          accountName: 'Conference & Events',
          priorYearTotal: 24000,
          costBehavior: 'adhoc',
          expectedAnnualAmount: 24000,
          expectedMonths: ['2025-10', '2026-03'],  // Oct 2025 + Mar 2026 (FY26 months)
        },
      ],
    },
    capex: {
      items: [
        {
          id: 'capex-001',
          name: 'Workstations',
          amount: 30000,
          month: '2025-09',
          category: 'technology',
        },
      ],
    },
    plannedSpends: [],
    subscriptions: {
      auditedAt: '2025-05-01T00:00:00.000Z',
      accountsIncluded: ['sub-001'],
      vendorCount: 3,
      totalAnnual: 18000,
      essentialAnnual: 12000,
      reviewAnnual: 6000,
      reduceAnnual: 0,
      cancelAnnual: 0,
      potentialSavings: 0,
    },
  }
}

// ─── Shared context builders ──────────────────────────────────────────────────

function makeFY27ConvertContext(seededAssumptions: ForecastAssumptions, forecastDuration = 1) {
  return {
    assumptions: seededAssumptions,
    forecastStartMonth: '2026-07',
    forecastEndMonth: forecastDuration === 2 ? '2028-06' : '2027-06',
    fiscalYear: 2027,
    forecastDuration,
    existingLines: [],
  }
}

// ─── Group A: Month-range alignment (the critical seam) ──────────────────────

describe('Group A: month-range alignment', () => {
  const fixture = makeFY26Fixture()
  const { assumptions: seededAssumptions } = seedForecastFromPrior(fixture, 2027, 1)
  const ctx = makeFY27ConvertContext(seededAssumptions)
  const plLines = convertAssumptionsToPLLines(ctx)

  const fy27Keys = new Set(generateMonthRange('2026-07', '2027-06'))
  const fy26Keys = new Set(generateMonthRange('2025-07', '2026-06'))

  it('every pl_line forecast_months key is within the FY27 range (2026-07..2027-06)', () => {
    for (const line of plLines) {
      const months = Object.keys(line.forecast_months)
      for (const mk of months) {
        expect(fy27Keys.has(mk), `Line "${line.account_name}" has out-of-range key ${mk}`).toBe(true)
      }
    }
  })

  it('ZERO prior-FY26 month keys (2025-07..2026-06) appear in any pl_line', () => {
    for (const line of plLines) {
      const months = Object.keys(line.forecast_months)
      for (const mk of months) {
        expect(fy26Keys.has(mk), `Line "${line.account_name}" has leaked FY26 key ${mk}`).toBe(false)
      }
    }
  })

  it('revenue line 1 (dense, $50k×12) has exactly 12 month keys in FY27', () => {
    // "Management Consulting" was seeded with 12 FY26 months → should shift to 12 FY27 months
    const managementLine = plLines.find(
      l => l.category === 'Revenue' && l.account_name === 'Management Consulting',
    )
    expect(managementLine).toBeDefined()
    const keyCount = Object.keys(managementLine!.forecast_months).length
    expect(keyCount, `Expected 12 keys but got ${keyCount}`).toBe(12)
  })

  it('all revenue line forecast_months keys are strictly within FY27 range', () => {
    // Covers both dense and sparse revenue lines — NO prior-FY key may appear
    const revLines = plLines.filter(l => l.category === 'Revenue')
    expect(revLines.length).toBeGreaterThan(0)
    for (const line of revLines) {
      for (const mk of Object.keys(line.forecast_months)) {
        expect(fy27Keys.has(mk), `Line "${line.account_name}" has out-of-range key ${mk}`).toBe(true)
      }
    }
  })
})

// ─── Group B: Sum preservation ───────────────────────────────────────────────

describe('Group B: sum preservation', () => {
  it('revenue line 1 sum equals $600,000 after seed + pl-lines (within $1 tolerance)', () => {
    const fixture = makeFY26Fixture()
    const { assumptions: seededAssumptions } = seedForecastFromPrior(fixture, 2027, 1)
    const ctx = makeFY27ConvertContext(seededAssumptions)
    const plLines = convertAssumptionsToPLLines(ctx)

    // Find "Management Consulting" revenue line (line 1 with $50k × 12)
    const revLine = plLines.find(
      l => l.category === 'Revenue' && l.account_name === 'Management Consulting',
    )
    expect(revLine).toBeDefined()

    const sum = Object.values(revLine!.forecast_months).reduce((acc, v) => acc + v, 0)
    expect(Math.abs(sum - 600000)).toBeLessThanOrEqual(1)
  })

  it('revenue line 2 (sparse) sum equals $120,000 after seed + pl-lines (within $1 tolerance)', () => {
    const fixture = makeFY26Fixture()
    const { assumptions: seededAssumptions } = seedForecastFromPrior(fixture, 2027, 1)
    const ctx = makeFY27ConvertContext(seededAssumptions)
    const plLines = convertAssumptionsToPLLines(ctx)

    const revLine = plLines.find(
      l => l.category === 'Revenue' && l.account_name === 'Advisory Services',
    )
    expect(revLine).toBeDefined()

    const sum = Object.values(revLine!.forecast_months).reduce((acc, v) => acc + v, 0)
    expect(Math.abs(sum - 120000)).toBeLessThanOrEqual(1)
  })
})

// ─── Group C: Multi-year forecast carry ──────────────────────────────────────

describe('Group C: multi-year forecast carry', () => {
  const fixture = makeFY26Fixture()
  // Prior was a 2-year forecast
  const { assumptions: seededAssumptions, forecastDuration } = seedForecastFromPrior(fixture, 2027, 2)
  const ctx = makeFY27ConvertContext(seededAssumptions, 2)
  const plLines = convertAssumptionsToPLLines(ctx)

  const fy2728Keys = new Set(generateMonthRange('2026-07', '2028-06'))  // 24 months
  const fy26Keys = new Set(generateMonthRange('2025-07', '2026-06'))

  it('forecastDuration is copied as 2 from prior', () => {
    expect(forecastDuration).toBe(2)
  })

  it('revenue pl_lines have keys spanning both years (2026-07..2028-06)', () => {
    const revLines = plLines.filter(l => l.category === 'Revenue')
    expect(revLines.length).toBeGreaterThan(0)

    for (const line of revLines) {
      const keys = Object.keys(line.forecast_months)
      // Each revenue line should have keys only in the 24-month range
      for (const mk of keys) {
        expect(fy2728Keys.has(mk), `Unexpected key ${mk} in line "${line.account_name}"`).toBe(true)
      }
    }
  })

  it('ZERO prior-FY26 keys appear anywhere in 2-year pl_lines', () => {
    for (const line of plLines) {
      for (const mk of Object.keys(line.forecast_months)) {
        expect(fy26Keys.has(mk), `FY26 key ${mk} leaked into line "${line.account_name}"`).toBe(false)
      }
    }
  })
})

// ─── Group D: Idempotency ────────────────────────────────────────────────────

describe('Group D: idempotency after seed', () => {
  it('isForecastSeedable returns false after running the full seed pipeline', () => {
    const fixture = makeFY26Fixture()
    const { assumptions: seededAssumptions } = seedForecastFromPrior(fixture, 2027, 1)
    const ctx = makeFY27ConvertContext(seededAssumptions)
    const plLines = convertAssumptionsToPLLines(ctx)

    // After seed: seededAssumptions.revenue.lines.length > 0 → not seedable
    const seedable = isForecastSeedable(seededAssumptions, plLines.length)
    expect(seedable).toBe(false)
  })

  it('isForecastSeedable returns false based on revenue lines alone (plLineCount=0)', () => {
    const fixture = makeFY26Fixture()
    const { assumptions: seededAssumptions } = seedForecastFromPrior(fixture, 2027, 1)

    // Even without persisting pl_lines, revenue.lines > 0 blocks re-seed
    expect(isForecastSeedable(seededAssumptions, 0)).toBe(false)
  })
})

// ─── Group E: CapEx + Goals exclusion ────────────────────────────────────────

describe('Group E: CapEx and Goals exclusion through full pipeline', () => {
  const fixture = makeFY26Fixture()
  const { assumptions: seededAssumptions } = seedForecastFromPrior(fixture, 2027, 1)
  const ctx = makeFY27ConvertContext(seededAssumptions)
  const plLines = convertAssumptionsToPLLines(ctx)

  it('seeded assumptions have capex.items === [] (stripped by 59-01)', () => {
    expect(seededAssumptions.capex).toEqual({ items: [] })
  })

  it('seeded assumptions have goals undefined (stripped by 59-01)', () => {
    expect('goals' in seededAssumptions).toBe(false)
  })

  it('no pl_line has category "CapEx"', () => {
    const capexLines = plLines.filter(l => l.category === 'CapEx')
    expect(capexLines).toHaveLength(0)
  })

  it('no pl_line has category "Goals"', () => {
    const goalsLines = plLines.filter(l => l.category === 'Goals')
    expect(goalsLines).toHaveLength(0)
  })

  it('capex.items=[] means no Depreciation line is generated', () => {
    // convertCapExDepreciation returns [] when capex.items is empty
    const depLines = plLines.filter(
      l => l.account_name === 'Depreciation',
    )
    expect(depLines).toHaveLength(0)
  })
})

// ─── Group F: expectedMonths integration ─────────────────────────────────────

describe('Group F: expectedMonths integration (adhoc opex shift)', () => {
  const fixture = makeFY26Fixture()
  // Fixture has adhoc line with expectedMonths=['2025-10', '2026-03']
  const { assumptions: seededAssumptions } = seedForecastFromPrior(fixture, 2027, 1)

  it('seeded assumptions shift adhoc expectedMonths to FY27 range', () => {
    const adhocLine = seededAssumptions.opex.lines.find(
      l => l.accountId === 'opex-003',
    )
    expect(adhocLine).toBeDefined()
    expect(adhocLine!.expectedMonths).toEqual(['2026-10', '2027-03'])
  })

  it('pl_line for adhoc opex has values only at shifted months (2026-10 and 2027-03)', () => {
    const ctx = makeFY27ConvertContext(seededAssumptions)
    const plLines = convertAssumptionsToPLLines(ctx)

    const adhocPLLine = plLines.find(l => l.account_name === 'Conference & Events')
    expect(adhocPLLine).toBeDefined()

    const months = adhocPLLine!.forecast_months
    // Should have values at the two shifted months
    expect(months['2026-10']).toBeGreaterThan(0)
    expect(months['2027-03']).toBeGreaterThan(0)

    // Should NOT have values at the original FY26 months
    expect(months['2025-10']).toBeUndefined()
    expect(months['2026-03']).toBeUndefined()
  })

  it('adhoc opex total across shifted months equals expectedAnnualAmount ($24,000)', () => {
    const ctx = makeFY27ConvertContext(seededAssumptions)
    const plLines = convertAssumptionsToPLLines(ctx)

    const adhocPLLine = plLines.find(l => l.account_name === 'Conference & Events')
    expect(adhocPLLine).toBeDefined()

    const sum = Object.values(adhocPLLine!.forecast_months).reduce((acc, v) => acc + v, 0)
    // $24,000 split across 2 months = $12,000 each
    expect(Math.abs(sum - 24000)).toBeLessThanOrEqual(1)
  })
})

// ─── Group G: team.plannedHires cleared ──────────────────────────────────────

describe('Group G: team.plannedHires cleared (decision D1 via full pipeline)', () => {
  const fixture = makeFY26Fixture()
  // Fixture has plannedHires=[{ name role: 'Graduate Analyst', startMonth: '2025-10' }]
  const { assumptions: seededAssumptions } = seedForecastFromPrior(fixture, 2027, 1)
  const ctx = makeFY27ConvertContext(seededAssumptions)
  const plLines = convertAssumptionsToPLLines(ctx)

  it('seeded assumptions.team.plannedHires is empty', () => {
    expect(seededAssumptions.team.plannedHires).toEqual([])
  })

  it('wages pl_line is present (from existingTeam)', () => {
    const wagesLine = plLines.find(l => l.account_name === 'Wages & Salaries')
    expect(wagesLine).toBeDefined()
    const sum = Object.values(wagesLine!.forecast_months).reduce((acc, v) => acc + v, 0)
    expect(sum).toBeGreaterThan(0)
  })

  it('wages reflect existingTeam salaries only (Bob the planned hire is gone)', () => {
    const ctx2 = makeFY27ConvertContext(seededAssumptions)
    const pl = convertAssumptionsToPLLines(ctx2)
    const wagesLine = pl.find(l => l.account_name === 'Wages & Salaries')
    expect(wagesLine).toBeDefined()

    // existingTeam: Sarah ($140k/yr = $11,666/mo) + James ($110k/yr = $9,166/mo)
    // Combined: ~$250k/yr = ~$20,833/mo
    // Bob would have added $80k/yr = $6,666/mo from Oct 2026 onwards
    // After clearing plannedHires, monthly wages should be lower than if Bob was included

    // Compute expected wages from existingTeam only (no planned hire)
    const sarahMonthly = 140000 / 12
    const jamesMonthly = 110000 / 12
    const expectedMonthly = sarahMonthly + jamesMonthly

    const fy27Months = generateMonthRange('2026-07', '2027-06')
    for (const mk of fy27Months) {
      const actual = wagesLine!.forecast_months[mk]
      // Wages should not include Bob's salary ($6,666+/mo)
      // Allow small rounding tolerance
      expect(actual).toBeLessThan(expectedMonthly + 100)
    }
  })

  it('existingTeam members (Sarah + James) are preserved in seeded assumptions', () => {
    expect(seededAssumptions.team.existingTeam).toHaveLength(2)
    const names = seededAssumptions.team.existingTeam.map(m => m.name)
    expect(names).toContain('Sarah Chen')
    expect(names).toContain('James Wu')
  })
})
