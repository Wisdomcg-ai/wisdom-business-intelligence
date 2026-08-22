/**
 * PR-A materializer fidelity — pins that convertAssumptionsToPLLines
 * reproduces the wizard summary's buckets (audit 2026-08-12: stored NP
 * diverged from the approved summary by $2M on a live forecast).
 */
import { describe, it, expect } from 'vitest'
import {
  convertAssumptionsToPLLines,
  SYS_CODES,
  type ConvertContext,
} from '../assumptions-to-pl-lines'
import type { ForecastAssumptions } from '../../components/wizard-v4/types/assumptions'

const FY = 2027 // Jul 2026 – Jun 2027
const START = '2026-07'
const END = '2027-06'

function monthKeys(): string[] {
  const keys: string[] = []
  let y = 2026, m = 7
  for (let i = 0; i < 12; i++) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return keys
}

function flatMonthly(annual: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const mk of monthKeys()) out[mk] = annual / 12
  return out
}

function baseAssumptions(overrides: Partial<ForecastAssumptions> = {}): ForecastAssumptions {
  return {
    version: 1,
    createdAt: '2026-08-12T00:00:00Z',
    updatedAt: '2026-08-12T00:00:00Z',
    fiscalYearStart: '07',
    revenue: {
      lines: [
        {
          accountId: 'revenue-0',
          accountName: 'Sales',
          priorYearTotal: 1_200_000,
          growthType: 'percentage',
          year1Monthly: flatMonthly(1_200_000),
        },
      ],
      seasonalityPattern: Array(12).fill(100 / 12),
      seasonalitySource: 'manual',
    },
    cogs: { lines: [] },
    team: {
      existingTeam: [],
      plannedHires: [],
      superannuationPct: 12,
      workCoverPct: 1.5,
      payrollTaxPct: 4.85,
      payrollTaxThreshold: 1_200_000,
    },
    opex: { lines: [] },
    capex: { items: [] },
    ...overrides,
  } as ForecastAssumptions
}

function ctx(assumptions: ForecastAssumptions, duration = 1): ConvertContext {
  return {
    assumptions,
    forecastStartMonth: START,
    forecastEndMonth: duration === 1 ? END : `${2026 + duration}-06`,
    fiscalYear: FY,
    forecastDuration: duration,
    existingLines: [],
  }
}

const lineByName = (lines: ReturnType<typeof convertAssumptionsToPLLines>, name: string) =>
  lines.find(l => l.account_name === name)

describe('M1 — COGS grid fidelity', () => {
  it('uses the operator monthly grid verbatim, including locked actual months', () => {
    const grid: Record<string, number> = flatMonthly(600_000)
    grid['2026-07'] = 763_805 // locked July actual — NOT 50k
    const a = baseAssumptions({
      cogs: {
        lines: [{
          accountId: 'cogs-0',
          accountName: 'Materials',
          priorYearTotal: 500_000,
          costBehavior: 'variable',
          percentOfRevenue: 40,
          year1Monthly: grid,
        }],
      },
    })
    const out = convertAssumptionsToPLLines(ctx(a))
    const materials = lineByName(out, 'Materials')!
    expect(materials.forecast_months['2026-07']).toBe(763_805)
    expect(materials.forecast_months['2026-08']).toBe(50_000)
    // The %-of-revenue fallback must NOT have overwritten the grid
    // (40% of 100k monthly revenue would be 40k).
    expect(materials.forecast_months['2026-09']).toBe(50_000)
  })

  it('falls back to % of revenue only for months absent from the grid', () => {
    const partial: Record<string, number> = { '2026-07': 999 }
    const a = baseAssumptions({
      cogs: {
        lines: [{
          accountId: 'cogs-0',
          accountName: 'Materials',
          priorYearTotal: 500_000,
          costBehavior: 'variable',
          percentOfRevenue: 40,
          year1Monthly: partial,
        }],
      },
    })
    const out = convertAssumptionsToPLLines(ctx(a))
    const materials = lineByName(out, 'Materials')!
    expect(materials.forecast_months['2026-07']).toBe(999)
    expect(materials.forecast_months['2026-08']).toBe(40_000) // 40% of 100k
  })
})

describe('M3 — team parity with the wizard summary', () => {
  const teamAssumptions = (duration = 3) => baseAssumptions({
    team: {
      existingTeam: [{
        employeeId: 'emp-1',
        name: 'Alice',
        role: 'Manager',
        employmentType: 'full-time',
        currentSalary: 97_087, // pre-increase
        year1Salary: 100_000, // summary's newSalary
        salaryIncreasePct: 3,
        includeInForecast: true,
        isFromXero: false,
      }, {
        employeeId: 'emp-2',
        name: 'Bob',
        role: 'Subbie',
        employmentType: 'contractor',
        currentSalary: 60_000,
        year1Salary: 60_000,
        salaryIncreasePct: 0,
        includeInForecast: true,
        isFromXero: false,
      }],
      plannedHires: [],
      superannuationPct: 12,
      workCoverPct: 1.5,
      payrollTaxPct: 4.85,
      payrollTaxThreshold: 1_200_000,
    },
  })

  it('compounds salaries from year1Salary and emits stable SYS codes', () => {
    const out = convertAssumptionsToPLLines(ctx(teamAssumptions(), 3))
    const wages = lineByName(out, 'Wages & Salaries')!
    expect(wages.account_code).toBe(SYS_CODES.wages)
    // Y1: (100k + 60k)/12 per month
    expect(wages.forecast_months['2026-07']).toBeCloseTo(160_000 / 12, 0)
    // Y2: Alice 103k + Bob 60k
    expect(wages.forecast_months['2027-07']).toBeCloseTo((103_000 + 60_000) / 12, 0)
  })

  it('applies super to employees only — never contractors', () => {
    const out = convertAssumptionsToPLLines(ctx(teamAssumptions(), 1))
    const sup = lineByName(out, 'Superannuation')!
    expect(sup.account_code).toBe(SYS_CODES.superannuation)
    // 12% of Alice's 100k only — Bob (contractor) excluded.
    expect(sup.forecast_months['2026-07']).toBeCloseTo((100_000 * 0.12) / 12, 0)
  })

  it('emits NO WorkCover or Payroll Tax lines (summary never included them)', () => {
    const out = convertAssumptionsToPLLines(ctx(teamAssumptions(), 1))
    expect(lineByName(out, 'WorkCover Insurance')).toBeUndefined()
    expect(lineByName(out, 'Payroll Tax')).toBeUndefined()
  })

  it('recurs bonuses every year at their CALENDAR month', () => {
    const a = teamAssumptions(2)
    a.team.bonuses = [{ id: 'b1', teamMemberId: 'emp-1', amount: 10_000, month: 6 }] // June
    const out = convertAssumptionsToPLLines(ctx(a, 2))
    const wages = lineByName(out, 'Wages & Salaries')!
    const baseJun27 = (103_000 + 60_000) / 12 // wait: 2027-06 is Y1
    // June of Y1 (2027-06) carries the bonus on top of Y1 wages
    expect(wages.forecast_months['2027-06']).toBeCloseTo(160_000 / 12 + 10_000, 0)
    // June of Y2 (2028-06) carries it again on Y2 wages
    expect(wages.forecast_months['2028-06']).toBeCloseTo(baseJun27 + 10_000, 0)
    // December must NOT carry it (the old fiscal-index bug shifted Jun→Dec)
    expect(wages.forecast_months['2026-12']).toBeCloseTo(160_000 / 12, 0)
  })

  it('annual commissions accrue the full year of linked-line revenue', () => {
    const a = teamAssumptions(1)
    a.team.commissions = [{
      id: 'c1', teamMemberId: 'emp-1', revenueLineId: 'revenue-0',
      percentOfRevenue: 5, timing: 'annual',
    }]
    const out = convertAssumptionsToPLLines(ctx(a, 1))
    const wages = lineByName(out, 'Wages & Salaries')!
    // June (FY end) pays 5% of the full $1.2M = $60k on top of wages.
    expect(wages.forecast_months['2027-06']).toBeCloseTo(160_000 / 12 + 60_000, 0)
  })
})

describe('M6 — subscriptions materialize', () => {
  it('emits the vendor-budget line with growth', () => {
    const a = baseAssumptions({
      subscriptions: {
        auditedAt: '2026-08-12', accountsIncluded: [], vendorCount: 2,
        totalAnnual: 24_000, essentialAnnual: 0, reviewAnnual: 0,
        reduceAnnual: 0, cancelAnnual: 0, potentialSavings: 0,
        activeVendorCount: 2, annualGrowthPct: 3,
        vendors: [
          { vendorKey: 'xero', vendorName: 'Xero', monthlyBudget: 1_000, frequency: 'monthly' },
          { vendorKey: 'adobe', vendorName: 'Adobe', monthlyBudget: 1_000, frequency: 'monthly' },
        ],
      },
    })
    const out = convertAssumptionsToPLLines(ctx(a, 2))
    const subs = lineByName(out, 'Subscriptions (budgeted)')!
    expect(subs.account_code).toBe(SYS_CODES.subscriptions)
    expect(subs.forecast_months['2026-07']).toBe(2_000)
    expect(subs.forecast_months['2027-07']).toBe(2_060) // ×1.03 in Y2
  })
})

describe('M8 — planned spends materialize', () => {
  it('outright purchase produces depreciation via the shared breakdown helper', () => {
    const a = baseAssumptions({
      plannedSpends: [{
        id: 'ps1',
        description: 'Truck',
        amount: 120_000,
        month: 1, // first FY month
        spendType: 'asset',
        paymentMethod: 'outright',
        lease_type: 'outright_purchase',
        useful_life_months: 60,
      } as any],
    })
    const out = convertAssumptionsToPLLines(ctx(a, 1))
    // Renamed so a Xero "Depreciation" OpEx account can't swallow it via the
    // name-keyed dedupe (the summary likewise adds planned-spend
    // depreciation on top of any prior-year depreciation line).
    const dep = lineByName(out, 'Depreciation (planned purchases)')!
    expect(dep.account_code).toBe(SYS_CODES.depreciation)
    // 120k over 60 months = 2k/mo × 12 months in Y1 = 24k, flat 2k per month
    expect(dep.forecast_months['2026-07']).toBeCloseTo(2_000, 0)
  })
})

describe('M7/M13 — parity buckets', () => {
  it('materializes Xero other income/expense flat per year', () => {
    const a = baseAssumptions({ xeroOtherIncome: 12_000, xeroOtherExpense: 6_000 })
    const out = convertAssumptionsToPLLines(ctx(a, 1))
    const oi = lineByName(out, 'Other Income')!
    const oe = lineByName(out, 'Other Expenses')!
    expect(oi.category).toBe('Other Income')
    expect(oi.forecast_months['2026-07']).toBe(1_000)
    expect(oe.category).toBe('Other Expenses')
    expect(oe.forecast_months['2026-07']).toBe(500)
  })

})

describe('ad-hoc OpEx parity (Dragon FY2027: 11 lines, $26,356 divergence)', () => {
  it('with NO months selected, spreads the annual amount across every year', () => {
    const a = baseAssumptions({
      opex: {
        lines: [{
          accountId: 'opex-0',
          accountName: 'Accounting',
          priorYearTotal: 7_617,
          costBehavior: 'adhoc',
          expectedAnnualAmount: 12_000,
          expectedMonths: [],
        }],
      },
    })
    const out = convertAssumptionsToPLLines(ctx(a, 2))
    const acct = lineByName(out, 'Accounting')!
    const y1 = ['2026-07','2026-08','2026-09','2026-10','2026-11','2026-12','2027-01','2027-02','2027-03','2027-04','2027-05','2027-06']
      .reduce((s2, mk) => s2 + (acct.forecast_months[mk] ?? 0), 0)
    expect(Math.round(y1)).toBe(12_000)
    // Y2 charged too — the summary counts ad-hoc lines every year.
    expect(Math.round(acct.forecast_months['2027-07'] * 12)).toBe(12_000)
  })

  it('with months selected, only those months carry the charge', () => {
    const a = baseAssumptions({
      opex: {
        lines: [{
          accountId: 'opex-0',
          accountName: 'Insurance',
          priorYearTotal: 6_000,
          costBehavior: 'adhoc',
          expectedAnnualAmount: 6_000,
          expectedMonths: ['2026-09', '2027-03'],
        }],
      },
    })
    const out = convertAssumptionsToPLLines(ctx(a, 1))
    const ins = lineByName(out, 'Insurance')!
    expect(ins.forecast_months['2026-09']).toBe(3_000)
    expect(ins.forecast_months['2027-03']).toBe(3_000)
    expect(ins.forecast_months['2026-07']).toBe(0)
  })
})

describe('M9 — seasonal OpEx no-history fallback', () => {
  it('values growth-%-driven seasonal lines from priorYearTotal instead of $0', () => {
    const a = baseAssumptions({
      opex: {
        lines: [{
          accountId: 'opex-0',
          accountName: 'Advertising',
          priorYearTotal: 60_000,
          costBehavior: 'seasonal',
          seasonalGrowthPct: 10,
        }],
      },
    })
    const out = convertAssumptionsToPLLines(ctx(a, 2))
    const adv = lineByName(out, 'Advertising')!
    expect(adv.forecast_months['2026-07']).toBe(5_000) // Y1 = prior/12
    expect(adv.forecast_months['2027-07']).toBe(5_500) // Y2 = ×1.10
  })
})

describe('composition-audit follow-ups', () => {
  it('Other Income is emitted in its own category (revenue-like consumers must not bucket it as OpEx)', () => {
    const a = baseAssumptions({ xeroOtherIncome: 12_000 })
    const out = convertAssumptionsToPLLines(ctx(a, 1))
    const oi = lineByName(out, 'Other Income')!
    expect(oi.category).toBe('Other Income')
    // Positive magnitude — consumers apply the sign by category, so a
    // negative here would double the error.
    expect(oi.forecast_months['2026-07']).toBeGreaterThan(0)
  })

  it('retired statutory on-cost rows are NOT resurrected from existing lines', () => {
    const existing = [
      { id: 'e1', account_name: 'WorkCover Insurance', account_code: undefined, category: 'Operating Expenses', actual_months: {}, forecast_months: { '2026-07': 999 }, is_manual: false },
      { id: 'e2', account_name: 'Payroll Tax', account_code: undefined, category: 'Operating Expenses', actual_months: {}, forecast_months: { '2026-07': 888 }, is_manual: false },
      { id: 'e3', account_name: 'Rent', account_code: '420', category: 'Operating Expenses', actual_months: {}, forecast_months: { '2026-07': 5_000 }, is_manual: false },
    ] as any
    const out = convertAssumptionsToPLLines({ ...ctx(baseAssumptions(), 1), existingLines: existing })
    expect(lineByName(out, 'WorkCover Insurance')).toBeUndefined()
    expect(lineByName(out, 'Payroll Tax')).toBeUndefined()
    // Unrelated existing rows still pass through (D-44.1-06 loss vector).
    expect(lineByName(out, 'Rent')).toBeDefined()
  })

  it('a REAL Xero account named "Payroll Tax" survives (only synthetic rows are retired)', () => {
    // Just Digital Signage carries genuine Xero accounts named "Payroll Tax"
    // (opex-4) and "WorkCover" (opex-9). A name-only retire filter would
    // delete real cost lines on the next regenerate.
    const existing = [
      { id: 'e1', account_name: 'Payroll Tax', account_code: 'opex-4', category: 'Operating Expenses', actual_months: {}, forecast_months: { '2026-07': 23_320 }, is_manual: false },
      { id: 'e2', account_name: 'WorkCover Insurance', account_code: 'opex-9', category: 'Operating Expenses', actual_months: {}, forecast_months: { '2026-07': 7_594 }, is_manual: false },
    ] as any
    const out = convertAssumptionsToPLLines({ ...ctx(baseAssumptions(), 1), existingLines: existing })
    expect(lineByName(out, 'Payroll Tax')).toBeDefined()
    expect(lineByName(out, 'WorkCover Insurance')).toBeDefined()
  })

  it('a coach manual override of a retired line IS preserved', () => {
    const existing = [
      { id: 'e1', account_name: 'WorkCover Insurance', account_code: undefined, category: 'Operating Expenses', actual_months: {}, forecast_months: { '2026-07': 999 }, is_manual: true },
    ] as any
    const out = convertAssumptionsToPLLines({ ...ctx(baseAssumptions(), 1), existingLines: existing })
    expect(lineByName(out, 'WorkCover Insurance')).toBeDefined()
  })

  it('subscription-covered OpEx twins are not re-emitted alongside the budgeted line', () => {
    const a = baseAssumptions({
      subscriptions: {
        auditedAt: '2026-08-12', accountsIncluded: [], vendorCount: 1,
        totalAnnual: 12_000, essentialAnnual: 0, reviewAnnual: 0,
        reduceAnnual: 0, cancelAnnual: 0, potentialSavings: 0,
        annualGrowthPct: 0,
        vendors: [{ vendorKey: 'xero', vendorName: 'Xero', monthlyBudget: 1_000, frequency: 'monthly', accountCodes: ['485'] }],
      },
    })
    const existing = [
      { id: 'e1', account_name: 'Software Subscriptions', account_code: '485', category: 'Operating Expenses', actual_months: {}, forecast_months: { '2026-07': 900 }, is_manual: false },
    ] as any
    const out = convertAssumptionsToPLLines({ ...ctx(a, 1), existingLines: existing })
    expect(lineByName(out, 'Software Subscriptions')).toBeUndefined()
    expect(lineByName(out, 'Subscriptions (budgeted)')!.forecast_months['2026-07']).toBe(1_000)
  })

  it('duplicate account_codes are de-conflicted before the upsert (RPC 21000 guard)', () => {
    const a = baseAssumptions({ xeroOtherIncome: 6_000 })
    // An existing Revenue row already occupies the code the parity bucket
    // would reuse via findMatchingLine's name match.
    const existing = [
      { id: 'e1', account_name: 'Other Income', account_code: 'SHARED', category: 'Revenue', actual_months: {}, forecast_months: {}, is_manual: false },
    ] as any
    const out = convertAssumptionsToPLLines({ ...ctx(a, 1), existingLines: existing })
    const codes = out.map(l => l.account_code).filter(Boolean)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

// ---------------------------------------------------------------------------
// 21 Aug 2026 forecast validity audit — FML-01 / PROC-01
//
// The operator can hand-tune Y2/Y3 per OpEx line (an explicit annual amount, a
// per-year % of revenue, a seasonal target) and mark lifecycle years. Every one
// of those was honored by the on-screen summary and Step 8 Review but was never
// exported and never materialized, so the STORED forecast — the thing the
// monthly report varies against — kept the growth-formula value. The Y1-only
// parity check could not see the divergence.
// ---------------------------------------------------------------------------

const yearTotal = (
  line: ReturnType<typeof convertAssumptionsToPLLines>[number],
  startYear: number,
) => {
  let sum = 0
  for (const [mk, v] of Object.entries(line.forecast_months)) {
    const [y, m] = mk.split('-').map(Number)
    const fyStart = m >= 7 ? y : y - 1
    if (fyStart === startYear) sum += v
  }
  return Math.round(sum * 100) / 100
}

describe('FML-01 — Y2/Y3 operator overrides reach the stored forecast', () => {
  const fixedLine = (extra: Record<string, unknown>) =>
    baseAssumptions({
      opex: {
        lines: [{
          accountId: 'opex-0',
          accountName: 'Rent',
          priorYearTotal: 120_000,
          costBehavior: 'fixed',
          monthlyAmount: 10_000,
          annualIncreasePct: 3,
          ...extra,
        }],
      },
    } as never)

  it('an explicit Y2 annual override replaces the growth formula', () => {
    // Formula would give 120,000 × 1.03 = 123,600 in Y2.
    const out = convertAssumptionsToPLLines(ctx(fixedLine({ y2Override: 180_000 }), 3))
    const rent = lineByName(out, 'Rent')!
    expect(yearTotal(rent, 2026)).toBe(120_000)   // Y1 untouched
    expect(yearTotal(rent, 2027)).toBe(180_000)   // Y2 = the operator's number
    expect(yearTotal(rent, 2028)).toBeCloseTo(127_308, 0) // Y3 still formula
  })

  it('an explicit Y3 override applies to Y3 only', () => {
    const out = convertAssumptionsToPLLines(ctx(fixedLine({ y3Override: 200_000 }), 3))
    const rent = lineByName(out, 'Rent')!
    expect(yearTotal(rent, 2027)).toBeCloseTo(123_600, 0)
    expect(yearTotal(rent, 2028)).toBe(200_000)
  })

  it('scaling preserves the within-year shape rather than flattening it', () => {
    // A seasonal-ish fixed line: give Y2 an override and confirm the ratio
    // between two months is unchanged after scaling.
    const out = convertAssumptionsToPLLines(ctx(fixedLine({ y2Override: 240_000 }), 3))
    const rent = lineByName(out, 'Rent')!
    // Flat input stays flat, and the months sum to the override exactly.
    expect(rent.forecast_months['2027-07']).toBe(20_000)
    expect(yearTotal(rent, 2027)).toBe(240_000)
  })

  it('a variable line honors the per-year % of revenue override', () => {
    const a = baseAssumptions({
      revenue: {
        lines: [{
          accountId: 'revenue-0',
          accountName: 'Sales',
          priorYearTotal: 1_200_000,
          growthType: 'percentage',
          year1Monthly: flatMonthly(1_200_000),
          // Y2 revenue must exist for a % override to have anything to bite on.
          year2Quarterly: { q1: 450_000, q2: 450_000, q3: 450_000, q4: 450_000 },
        }],
        seasonalityPattern: Array(12).fill(100 / 12),
        seasonalitySource: 'manual',
      },
      opex: {
        lines: [{
          accountId: 'opex-1',
          accountName: 'Marketing',
          priorYearTotal: 60_000,
          costBehavior: 'variable',
          percentOfRevenue: 5,
          y2PercentOverride: 8,
        }],
      },
    } as never)
    const out = convertAssumptionsToPLLines(ctx(a, 3))
    const mkt = lineByName(out, 'Marketing')!
    // Y1 revenue is 1.2M flat (100k/mo) → 5% = 5,000/mo.
    expect(mkt.forecast_months['2026-07']).toBe(5_000)
    // Y2 revenue is 1.8M (450k/quarter → 150k/mo) → the 8% override = 12,000.
    expect(mkt.forecast_months['2027-07']).toBe(12_000)
    // Y3 has no override and no Y3 revenue defined → falls back to the base %.
    expect(yearTotal(mkt, 2027)).toBe(144_000)
  })

  it('a one-time expense is charged in its year and zeroed in the others', () => {
    const out = convertAssumptionsToPLLines(
      ctx(fixedLine({ isOneTime: true, oneTimeYear: 2 }), 3),
    )
    const rent = lineByName(out, 'Rent')!
    expect(yearTotal(rent, 2026)).toBe(0)
    expect(yearTotal(rent, 2027)).toBeCloseTo(123_600, 0)
    expect(yearTotal(rent, 2028)).toBe(0)
  })

  it('a line that starts in Y2 contributes nothing to Y1', () => {
    const out = convertAssumptionsToPLLines(ctx(fixedLine({ startYear: 2 }), 3))
    const rent = lineByName(out, 'Rent')!
    expect(yearTotal(rent, 2026)).toBe(0)
    expect(yearTotal(rent, 2027)).toBeCloseTo(123_600, 0)
  })

  it('PROC-06: the real Xero account code is stored, not the synthetic opex-N id', () => {
    const out = convertAssumptionsToPLLines(ctx(fixedLine({ accountCode: '6200' }), 1))
    expect(lineByName(out, 'Rent')!.account_code).toBe('6200')
  })
})

describe('XVAL-1 — code-less twins of generated lines are retired, not carried forward', () => {
  const teamOnly = () => baseAssumptions({
    team: {
      existingTeam: [{
        employeeId: 'emp-1',
        name: 'Alice',
        role: 'Manager',
        employmentType: 'full-time',
        currentSalary: 100_000,
        year1Salary: 100_000,
        salaryIncreasePct: 0,
        includeInForecast: true,
        isFromXero: false,
      }],
      plannedHires: [],
      superannuationPct: 12,
      workCoverPct: 1.5,
      payrollTaxPct: 4.85,
    },
  } as never)

  it('THE DIGITAL BOND CASE: a NULL-code wages row does not survive alongside SYS-TEAM-WAGES', () => {
    // The pre-#350 shape: a code-less generated line already stored.
    const zombie = {
      id: 'zombie-1',
      account_name: 'Wages & Salaries',
      account_code: null,
      category: 'Operating Expenses',
      actual_months: {},
      forecast_months: Object.fromEntries(monthKeys().map(mk => [mk, 20_416.66])),
      is_from_xero: false,
      is_manual: false,
    } as never

    const out = convertAssumptionsToPLLines({
      ...ctx(teamOnly(), 1),
      existingLines: [zombie],
    })

    const wageLines = out.filter(l => l.account_name === 'Wages & Salaries')
    expect(wageLines).toHaveLength(1)
    expect(wageLines[0].account_code).toBe(SYS_CODES.wages)
    // The planned figure only — not planned + zombie.
    const total = Object.values(wageLines[0].forecast_months).reduce((a, b) => a + b, 0)
    expect(Math.round(total)).toBe(100_000)
  })

  // NOTE on manual lines: the retirement rule deliberately never targets
  // is_manual rows. A manual row that shares its category+name with a
  // GENERATED line is still collapsed by the long-standing name dedupe below
  // it (keeping both would double-count the same wages) — that behaviour is
  // pre-existing and unchanged here. What this test pins is that the new
  // code-less retirement rule does not reach manual rows.
  it('a MANUAL code-less line is preserved — the retirement rule never targets it', () => {
    const manual = {
      id: 'manual-1',
      account_name: 'Owner Drawings (manual)',
      account_code: null,
      category: 'Operating Expenses',
      actual_months: {},
      forecast_months: { '2026-07': 5_000 },
      is_from_xero: false,
      is_manual: true,
    } as never

    const out = convertAssumptionsToPLLines({
      ...ctx(teamOnly(), 1),
      existingLines: [manual],
    })
    expect(out.some(l => l.account_name === 'Owner Drawings (manual)' && l.is_manual)).toBe(true)
  })

  it('an unrelated code-less line is untouched — only twins of generated lines retire', () => {
    const other = {
      id: 'other-1',
      account_name: 'Some Legacy Account',
      account_code: null,
      category: 'Operating Expenses',
      actual_months: {},
      forecast_months: { '2026-07': 1_234 },
      is_from_xero: false,
      is_manual: false,
    } as never

    const out = convertAssumptionsToPLLines({
      ...ctx(teamOnly(), 1),
      existingLines: [other],
    })
    expect(out.some(l => l.account_name === 'Some Legacy Account')).toBe(true)
  })
})
