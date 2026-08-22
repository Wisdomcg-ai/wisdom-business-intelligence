import { describe, it, expect } from 'vitest'
import {
  classifyTeamCost,
  isCoveredByTeamStep,
  isTeamCost,
  type TeamCoverage,
} from '@/app/finances/forecast/components/wizard-v4/utils/opex-classifier'
import {
  shouldExcludeFromOpEx,
  deriveTeamCoverage,
} from '@/app/finances/forecast/components/wizard-v4/useForecastWizard'

/**
 * 21 Aug 2026 forecast validity audit, finding XVAL-2 / COA-02 / XVAL-3.
 *
 * The wizard removes an OpEx line when it believes Step 4 (Team) regenerates
 * that cost. It used to decide with one flat keyword list gated on "does Step 4
 * hold ANY data" — which deleted real, unreplaced cost from stored forecasts:
 * Dragon Roofing's live FY2027 forecast was missing $435,481/yr of "Virtual
 * Contractors" (bill-paid, so no Step 4 counterpart), while its economically
 * identical "Consultants" ($1.15M) survived only because the name missed the
 * keyword list.
 *
 * The rule is now: exclude ONLY what Step 4 actually generates, per kind.
 */

const EMPLOYEES_ONLY: TeamCoverage = { employees: true, contractors: false }
const CONTRACTORS_TOO: TeamCoverage = { employees: true, contractors: true }
const EMPTY_TEAM: TeamCoverage = { employees: false, contractors: false }

describe('classifyTeamCost — what KIND of team cost a name looks like', () => {
  it.each([
    'Wages & Salaries',
    'Salaries & Wages',
    'Staff Wages',
    'Superannuation',
    'Super Guarantee',
    // Efficient Living's real account — added to the list 21 Aug 2026 (XVAL-3).
    'Employment Expenses: Office team',
    'Staff Remuneration',
  ])('%s is payroll-kind', name => {
    expect(classifyTeamCost(name)).toBe('payroll')
  })

  it.each([
    'Virtual Contractors',
    'Contractors excl. Artists',
    'Subcontractor Costs',
    'Contract Labour',
  ])('%s is contractor-kind', name => {
    expect(classifyTeamCost(name)).toBe('contractor')
  })

  // Step 4 models none of these, so they must never be removed from OpEx.
  it.each([
    'Directors Fees',
    'Director Fee',
    'Fringe Benefits Tax',
    'FBT',
    'Motor Vehicle Allowance',
    'Annual Leave Provision',
  ])('%s is unmodelled-kind (Step 4 never generates it)', name => {
    expect(classifyTeamCost(name)).toBe('unmodelled')
  })

  it.each([
    'Payroll Tax',
    'Payroll Levy',
    'WorkCover',
    'WorkCover Insurance',
    'Workers Compensation',
    // IICT Group's real Xero account (code 500) — the spaced spelling used to
    // defeat the entire statutory carve-out.
    'Work Cover',
  ])('%s is not a team cost at all — statutory on-cost stays in OpEx', name => {
    expect(classifyTeamCost(name)).toBeNull()
    expect(isTeamCost(name)).toBe(false)
  })

  // "Employment Expenses: X" is a real nested-CoA shape. The kind must come
  // from the MOST SPECIFIC marker, not the prefix, or a contractor account
  // would be treated as payroll-covered and deleted.
  it('resolves nested "Employment Expenses: X" names by the specific marker', () => {
    expect(classifyTeamCost('Employment Expenses: Contractors International')).toBe('contractor')
    expect(classifyTeamCost('Employment Expenses: Directors Fees')).toBe('unmodelled')
    expect(classifyTeamCost('Employment Expenses: Office team')).toBe('payroll')
  })

  it('does not swallow the Microsoft Teams subscription', () => {
    expect(classifyTeamCost('Microsoft Teams')).toBeNull()
    expect(classifyTeamCost('Teams Subscription')).toBeNull()
  })

  it('leaves ordinary OpEx alone', () => {
    expect(classifyTeamCost('Rent')).toBeNull()
    expect(classifyTeamCost('Supermarket Supplies')).toBeNull()
    expect(classifyTeamCost('Consultants')).toBeNull()
  })
})

describe('isCoveredByTeamStep — coverage decides, not the keyword alone', () => {
  it('THE DRAGON CASE: contractor accounts are NOT covered by an employees-only team', () => {
    // Step 4's Xero payroll import produces employees; bill-paid contractors
    // have no counterpart, so removing this line deletes $435,481/yr.
    expect(isCoveredByTeamStep('Virtual Contractors', EMPLOYEES_ONLY)).toBe(false)
  })

  it('contractor accounts ARE covered once contractor members exist in Step 4', () => {
    expect(isCoveredByTeamStep('Virtual Contractors', CONTRACTORS_TOO)).toBe(true)
  })

  it('payroll accounts are covered by employees', () => {
    expect(isCoveredByTeamStep('Wages & Salaries', EMPLOYEES_ONLY)).toBe(true)
    expect(isCoveredByTeamStep('Superannuation', EMPLOYEES_ONLY)).toBe(true)
  })

  it('payroll accounts are NOT covered by a contractors-only team', () => {
    expect(
      isCoveredByTeamStep('Wages & Salaries', { employees: false, contractors: true }),
    ).toBe(false)
  })

  it('unmodelled costs are never covered, whatever Step 4 holds', () => {
    for (const coverage of [EMPTY_TEAM, EMPLOYEES_ONLY, CONTRACTORS_TOO]) {
      expect(isCoveredByTeamStep('Directors Fees', coverage)).toBe(false)
      expect(isCoveredByTeamStep('Fringe Benefits Tax', coverage)).toBe(false)
    }
  })
})

describe('shouldExcludeFromOpEx — the gate the summary and the export share', () => {
  it('THE DRAGON REGRESSION: Virtual Contractors stays in OpEx with an employees-only team', () => {
    expect(
      shouldExcludeFromOpEx({ name: 'Virtual Contractors' }, EMPLOYEES_ONLY),
    ).toBe(false)
  })

  it('still excludes wages once employees exist (no double-count with Step 4)', () => {
    expect(shouldExcludeFromOpEx({ name: 'Wages & Salaries' }, EMPLOYEES_ONLY)).toBe(true)
  })

  it('excludes nothing when Step 4 is empty (PR #350 M2 invariant preserved)', () => {
    expect(shouldExcludeFromOpEx({ name: 'Wages & Salaries' }, EMPTY_TEAM)).toBe(false)
    expect(shouldExcludeFromOpEx({ name: 'Virtual Contractors' }, EMPTY_TEAM)).toBe(false)
  })

  it('an explicit operator override always wins, both directions', () => {
    expect(
      shouldExcludeFromOpEx(
        { name: 'Virtual Contractors', isTeamCostOverride: true },
        EMPLOYEES_ONLY,
      ),
    ).toBe(true)
    expect(
      shouldExcludeFromOpEx(
        { name: 'Wages & Salaries', isTeamCostOverride: false },
        EMPLOYEES_ONLY,
      ),
    ).toBe(false)
  })

  it('accepts a bare boolean as employees-only — the conservative legacy read', () => {
    expect(shouldExcludeFromOpEx({ name: 'Wages & Salaries' }, true)).toBe(true)
    expect(shouldExcludeFromOpEx({ name: 'Virtual Contractors' }, true)).toBe(false)
    expect(shouldExcludeFromOpEx({ name: 'Wages & Salaries' }, false)).toBe(false)
  })
})

describe('deriveTeamCoverage', () => {
  it('reads employees and contractors out of the live member lists', () => {
    expect(deriveTeamCoverage([], [])).toEqual({ employees: false, contractors: false })
    expect(deriveTeamCoverage([{ type: 'full-time' }], [])).toEqual({
      employees: true,
      contractors: false,
    })
    expect(deriveTeamCoverage([{ type: 'contractor' }], [])).toEqual({
      employees: false,
      contractors: true,
    })
    // New hires count as coverage too — they generate cost in the forecast.
    expect(
      deriveTeamCoverage([{ type: 'casual' }], [{ type: 'contractor' }]),
    ).toEqual({ employees: true, contractors: true })
  })

  it('treats a member with no type as an employee (Xero payroll import)', () => {
    expect(deriveTeamCoverage([{}], [])).toEqual({ employees: true, contractors: false })
  })
})
