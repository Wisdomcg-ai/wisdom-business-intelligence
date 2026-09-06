/**
 * Superseded rows must leave the stored P&L — 7 Sep 2026 (Urban Road).
 *
 * The wizard's export drops OpEx lines that Step 4 (team) or Step 5
 * (subscriptions) now carry, and the on-screen summary agrees. The converter
 * used to re-emit those rows from `existingLines` (team twins were not in its
 * retire predicate), and even when it did retire a row (subscription twins),
 * nothing deleted it — the RPC upsert never removes rows. Result on Urban
 * Road's first Generate after a Xero-budget seed: approved OpEx $1,942,100,
 * stored $2,932,593 (+$990,493 = wages + super + contractors), NP +$536k on
 * screen vs −$454k stored.
 *
 * These tests pin both halves: the converter does not carry the twins, and
 * findRetiredExistingLines names exactly those rows for deletion.
 */
import { describe, it, expect } from 'vitest'
import {
  convertAssumptionsToPLLines,
  findRetiredExistingLines,
  buildRetirePredicate,
  teamCoverageFromAssumptions,
  SYS_CODES,
  type ConvertContext,
} from '../assumptions-to-pl-lines'
import type { PLLine } from '../../types'
import type {
  ForecastAssumptions,
  ExistingTeamMember,
  OpExLineAssumption,
} from '../../components/wizard-v4/types/assumptions'
import { generateMonthKeys } from '../../components/wizard-v4/types'

const FY = 2027 // Jul 2026 – Jun 2027
const Y1 = generateMonthKeys(FY - 1)

function flat(keys: string[], perMonth: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of keys) out[k] = perMonth
  return out
}

function member(
  employeeId: string,
  employmentType: ExistingTeamMember['employmentType'],
  salary: number,
): ExistingTeamMember {
  return {
    employeeId,
    name: employeeId,
    role: 'Staff',
    employmentType,
    currentSalary: salary,
    salaryIncreasePct: 0,
    includeInForecast: true,
    isFromXero: false,
  }
}

function assumptions(opts: {
  team?: ExistingTeamMember[]
  opexLines?: OpExLineAssumption[]
  subscriptionCodes?: string[]
}): ForecastAssumptions {
  const base: ForecastAssumptions = {
    version: 1,
    createdAt: '2026-09-07T00:00:00Z',
    updatedAt: '2026-09-07T00:00:00Z',
    fiscalYearStart: '07',
    revenue: { lines: [], seasonalityPattern: Array(12).fill(100 / 12), seasonalitySource: 'industry_default' },
    cogs: { lines: [] },
    team: {
      existingTeam: opts.team ?? [],
      plannedHires: [],
      superannuationPct: 12,
      workCoverPct: 0,
      payrollTaxPct: 0,
    },
    opex: { lines: opts.opexLines ?? [], defaultIncreasePct: 0 },
    capex: { items: [] },
  }
  if (opts.subscriptionCodes) {
    ;(base as unknown as { subscriptions: unknown }).subscriptions = {
      vendors: [
        {
          vendorKey: 'xero',
          vendorName: 'Xero',
          frequency: 'monthly',
          monthlyBudget: 100,
          isActive: true,
          accountCodes: opts.subscriptionCodes,
        },
      ],
      totalAnnual: 1200,
      activeVendorCount: 1,
    }
  }
  return base
}

function ctx(a: ForecastAssumptions, existingLines: PLLine[]): ConvertContext {
  return {
    assumptions: a,
    forecastStartMonth: '2026-07',
    forecastEndMonth: '2027-06',
    fiscalYear: FY,
    forecastDuration: 1,
    existingLines,
  }
}

function row(id: string, account_code: string | undefined, account_name: string, perMonth: number, extra: Partial<PLLine> = {}): PLLine {
  return {
    id,
    forecast_id: 'f-1',
    account_code,
    account_name,
    category: 'Operating Expenses',
    actual_months: {},
    forecast_months: flat(Y1, perMonth),
    is_manual: false,
    ...extra,
  }
}

const RENT: OpExLineAssumption = {
  accountId: '66000', accountName: 'Rent - Office', priorYearTotal: 100_000,
  costBehavior: 'budgeted', budgetedMonthly: flat(Y1, 7_000), accountCode: '66000',
}

// The seed-era rows a Xero-budget seed writes and the wizard export later drops.
const WAGES = row('r-wages', '62170', 'Employ - Wages & Salaries', 47_000)
const SUPER = row('r-super', '62160', 'Employ - Superannuation', 5_600)
const CONTRACTORS = row('r-contr', '61400', 'Contractors excl. Artists', 29_900)
const WORKERS_COMP = row('r-wc', '62180', "Employ - Workers' Compensation", 760)
const IT_SOFTWARE = row('r-it', '63700', 'IT Costs Software', 14_150)
const RENT_ROW = row('r-rent', '66000', 'Rent - Office', 8_900)
const PAYROLL_TAX_XERO = row('r-ptax', '62200', 'Payroll Tax', 2_000)
const MANUAL_WAGES = row('r-manual', '62171', 'Wages & Salaries - Directors', 10_000, { is_manual: true })

const EXISTING = [WAGES, SUPER, CONTRACTORS, WORKERS_COMP, IT_SOFTWARE, RENT_ROW, PAYROLL_TAX_XERO, MANUAL_WAGES]

const opexTotal = (lines: PLLine[]) =>
  Math.round(
    lines
      .filter(l => l.category === 'Operating Expenses')
      .reduce((s, l) => s + Object.values(l.forecast_months).reduce((a, b) => a + b, 0), 0),
  )

describe('teamCoverageFromAssumptions', () => {
  it('derives coverage from saved team members like the wizard does from live state', () => {
    expect(teamCoverageFromAssumptions(assumptions({}))).toEqual({ employees: false, contractors: false })
    expect(teamCoverageFromAssumptions(assumptions({ team: [member('e', 'full-time', 80_000)] })))
      .toEqual({ employees: true, contractors: false })
    expect(teamCoverageFromAssumptions(assumptions({ team: [member('c', 'contractor', 60_000)] })))
      .toEqual({ employees: false, contractors: true })
    expect(teamCoverageFromAssumptions(null)).toEqual({ employees: false, contractors: false })
  })
})

describe('Generate after a budget seed: team-covered twins', () => {
  const team = [member('emp-1', 'full-time', 100_000), member('con-1', 'contractor', 60_000)]
  const a = assumptions({ team, opexLines: [RENT], subscriptionCodes: ['63700'] })

  it('the converter does NOT carry the superseded wages / super / contractor / subscription rows', () => {
    const out = convertAssumptionsToPLLines(ctx(a, EXISTING))
    const codes = out.map(l => l.account_code)

    expect(codes).toContain(SYS_CODES.wages)
    expect(codes).toContain(SYS_CODES.superannuation)
    expect(codes).toContain(SYS_CODES.subscriptions)
    expect(codes).not.toContain('62170')
    expect(codes).not.toContain('62160')
    expect(codes).not.toContain('61400')
    expect(codes).not.toContain('63700')

    // What Step 4 does NOT model survives, and so do real Xero accounts the
    // classifier deliberately keeps in OpEx, and every manual row.
    expect(codes).toContain('62180')
    expect(codes).toContain('62200')
    expect(codes).toContain('62171')
    expect(codes).toContain('66000')

    // Parity: OpEx is team (160k wages + 12k super on the employee) + subscriptions
    // 1.2k + rent 84k + workers comp 9.12k + payroll tax 24k + manual 120k.
    expect(opexTotal(out)).toBe(160_000 + 12_000 + 1_200 + 84_000 + 9_120 + 24_000 + 120_000)
  })

  it('findRetiredExistingLines names exactly the rows the converter dropped', () => {
    const out = convertAssumptionsToPLLines(ctx(a, EXISTING))
    const retired = findRetiredExistingLines(a, EXISTING, out).map(l => l.id).sort()
    expect(retired).toEqual(['r-contr', 'r-it', 'r-super', 'r-wages'])
  })

  it('never returns a row the converter carried (matched or passed through)', () => {
    const out = convertAssumptionsToPLLines(ctx(a, EXISTING))
    const retiredIds = new Set(findRetiredExistingLines(a, EXISTING, out).map(l => l.id))
    for (const carried of out) {
      if (carried.id) expect(retiredIds.has(carried.id)).toBe(false)
    }
  })

  it('a contractor-only team retires the contractor row but keeps wages and super', () => {
    const contractorOnly = assumptions({ team: [member('con-1', 'contractor', 60_000)], opexLines: [RENT] })
    const out = convertAssumptionsToPLLines(ctx(contractorOnly, EXISTING))
    const codes = out.map(l => l.account_code)
    expect(codes).toContain('62170')
    expect(codes).toContain('62160')
    expect(codes).not.toContain('61400')
    expect(findRetiredExistingLines(contractorOnly, EXISTING, out).map(l => l.id)).toEqual(['r-contr'])
  })
})

describe('Nothing is retired when Step 4 carries no replacement', () => {
  it('empty team: the seed-era team rows pass through untouched and are not retired', () => {
    const a = assumptions({ opexLines: [RENT] })
    const out = convertAssumptionsToPLLines(ctx(a, EXISTING))
    const codes = out.map(l => l.account_code)
    expect(codes).not.toContain(SYS_CODES.wages)
    expect(codes).toContain('62170')
    expect(codes).toContain('62160')
    expect(codes).toContain('61400')
    expect(findRetiredExistingLines(a, EXISTING, out)).toEqual([])
  })

  it('the predicate ignores team names when SYS-TEAM-WAGES is absent from the payload', () => {
    const a = assumptions({ team: [member('emp-1', 'full-time', 100_000)] })
    const isRetired = buildRetirePredicate(a, [RENT_ROW]) // no SYS-TEAM-WAGES emitted
    expect(isRetired(WAGES)).toBe(false)
    expect(isRetired(SUPER)).toBe(false)
  })

  it('manual rows are never retired, even when they look like team costs', () => {
    const a = assumptions({ team: [member('emp-1', 'full-time', 100_000)] })
    const sysWages = row('g-wages', SYS_CODES.wages, 'Wages & Salaries', 8_000)
    const isRetired = buildRetirePredicate(a, [sysWages])
    expect(isRetired(MANUAL_WAGES)).toBe(false)
    expect(isRetired({ ...WAGES, is_manual: true })).toBe(false)
  })

  it('statutory on-costs and real "Payroll Tax" accounts are unmodelled, so they survive', () => {
    const a = assumptions({ team: [member('emp-1', 'full-time', 100_000)] })
    const sysWages = row('g-wages', SYS_CODES.wages, 'Wages & Salaries', 8_000)
    const isRetired = buildRetirePredicate(a, [sysWages])
    expect(isRetired(WORKERS_COMP)).toBe(false)
    expect(isRetired(PAYROLL_TAX_XERO)).toBe(false)
  })

  it('a wages account outside Operating Expenses (e.g. COGS labour) is left alone', () => {
    const a = assumptions({ team: [member('emp-1', 'full-time', 100_000)] })
    const sysWages = row('g-wages', SYS_CODES.wages, 'Wages & Salaries', 8_000)
    const isRetired = buildRetirePredicate(a, [sysWages])
    expect(isRetired({ ...WAGES, category: 'Cost of Sales' })).toBe(false)
  })
})

describe('Existing retire rules still hold', () => {
  it('subscription-covered twins are retired with or without a team', () => {
    const a = assumptions({ opexLines: [RENT], subscriptionCodes: ['63700'] })
    const out = convertAssumptionsToPLLines(ctx(a, [IT_SOFTWARE, RENT_ROW]))
    expect(out.map(l => l.account_code)).not.toContain('63700')
    expect(findRetiredExistingLines(a, [IT_SOFTWARE, RENT_ROW], out).map(l => l.id)).toEqual(['r-it'])
  })

  it('synthetic retired names (phantom on-costs) are retired through the converter', () => {
    const a = assumptions({ team: [member('emp-1', 'full-time', 100_000)] })
    const phantom = row('r-phantom', undefined, 'Payroll Tax', 500)
    const out = convertAssumptionsToPLLines(ctx(a, [phantom]))
    expect(out.map(l => l.account_name)).not.toContain('Payroll Tax')
    expect(findRetiredExistingLines(a, [phantom], out).map(l => l.id)).toEqual(['r-phantom'])
  })

  it('an unmatched code-less twin of a generated line is retired (XVAL-1)', () => {
    // The converter matches the FIRST same-named existing row by name and
    // carries its id; a second code-less duplicate cannot be matched and used
    // to sit alongside the SYS-coded line forever.
    const a = assumptions({ team: [member('emp-1', 'full-time', 100_000)] })
    const sysWages = row('g-wages', SYS_CODES.wages, 'Wages & Salaries', 8_000)
    const codeless = row('r-codeless', undefined, 'Wages & Salaries', 5_000)
    expect(buildRetirePredicate(a, [sysWages])(codeless)).toBe(true)
    // A code-less row whose name the payload does NOT generate is left alone.
    expect(buildRetirePredicate(a, [sysWages])(row('r-other', undefined, 'Sundry Expenses', 100))).toBe(false)
  })
})
