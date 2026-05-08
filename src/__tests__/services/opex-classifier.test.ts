import { describe, it, expect } from 'vitest'
import { isTeamCost, classifyByName } from '@/app/finances/forecast/components/wizard-v4/utils/opex-classifier'

describe('isTeamCost', () => {
  it('identifies wage-related accounts as team costs', () => {
    expect(isTeamCost('Wages & Salaries')).toBe(true)
    expect(isTeamCost('Salaries & Wages')).toBe(true)
    expect(isTeamCost('Staff Wages')).toBe(true)
    expect(isTeamCost('Employee Wages')).toBe(true)
  })

  it('identifies superannuation as team cost', () => {
    expect(isTeamCost('Superannuation')).toBe(true)
    expect(isTeamCost('Super Guarantee')).toBe(true)
    expect(isTeamCost('SGC')).toBe(true)
  })

  // Hotfix 2026-05-07: workcover / workers comp / payroll tax / payroll levy
  // are NOT team costs. Step 4 (Team) doesn't model statutory on-costs, so
  // excluding them from OpEx hides them from the forecast entirely. They
  // route to OpEx (fixed) instead. See classifier file-header note.
  it('does NOT classify workcover/workers-comp as team cost (routes to OpEx)', () => {
    expect(isTeamCost('Payroll Tax')).toBe(false)
    expect(isTeamCost('Payroll Levy')).toBe(false)
    expect(isTeamCost('WorkCover Insurance')).toBe(false)
    expect(isTeamCost('WorkCover')).toBe(false)
    expect(isTeamCost('Workers Compensation')).toBe(false)
    expect(isTeamCost('Workers Comp')).toBe(false)
  })

  it('identifies contractor costs as team costs', () => {
    expect(isTeamCost('Contractor Payments')).toBe(true)
    expect(isTeamCost('Subcontractor Expenses')).toBe(true)
  })

  it('does NOT classify non-team expenses as team costs', () => {
    expect(isTeamCost('Rent')).toBe(false)
    expect(isTeamCost('Office Supplies')).toBe(false)
    expect(isTeamCost('Marketing')).toBe(false)
    expect(isTeamCost('Insurance - Business')).toBe(false)
    expect(isTeamCost('Electricity')).toBe(false)
    expect(isTeamCost('Supermarket Supplies')).toBe(false)
  })
})

describe('classifyByName', () => {
  it('classifies rent as fixed', () => {
    const result = classifyByName('Office Rent')
    expect(result.behavior).toBe('fixed')
    expect(result.isTeamCost).toBe(false)
  })

  it('classifies marketing as variable', () => {
    const result = classifyByName('Google Ads')
    expect(result.behavior).toBe('variable')
    expect(result.isTeamCost).toBe(false)
  })

  it('classifies electricity as seasonal', () => {
    const result = classifyByName('Electricity')
    expect(result.behavior).toBe('seasonal')
    expect(result.isTeamCost).toBe(false)
  })

  it('classifies travel as adhoc', () => {
    const result = classifyByName('Travel Expenses')
    expect(result.behavior).toBe('adhoc')
    expect(result.isTeamCost).toBe(false)
  })

  it('marks team costs and does not classify as OpEx', () => {
    const result = classifyByName('Wages & Salaries')
    expect(result.isTeamCost).toBe(true)
  })

  // Hotfix 2026-05-07: workcover and payroll tax route to OpEx (fixed), not Team.
  // Operators were seeing these in Xero but not in their forecast because the
  // classifier was excluding them as team costs while Step 4 (Team) only
  // models wages/super/contractors/bonuses. Regression coverage:
  it('classifies Workers Compensation as OpEx fixed cost', () => {
    const result = classifyByName('Workers Compensation')
    expect(result.isTeamCost).toBe(false)
    expect(result.behavior).toBe('fixed')
  })

  it('classifies WorkCover Insurance as OpEx fixed cost', () => {
    const result = classifyByName('WorkCover Insurance')
    expect(result.isTeamCost).toBe(false)
    expect(result.behavior).toBe('fixed')
  })

  it('classifies Payroll Tax as OpEx fixed cost', () => {
    const result = classifyByName('Payroll Tax')
    expect(result.isTeamCost).toBe(false)
    expect(result.behavior).toBe('fixed')
  })

  it('classifies Payroll Levy as OpEx fixed cost', () => {
    const result = classifyByName('Payroll Levy')
    expect(result.isTeamCost).toBe(false)
    expect(result.behavior).toBe('fixed')
  })

  it('still classifies actual wages/super as team cost (regression guard)', () => {
    expect(classifyByName('Salaries & Wages').isTeamCost).toBe(true)
    expect(classifyByName('Superannuation').isTeamCost).toBe(true)
    expect(classifyByName('Contractor Payments').isTeamCost).toBe(true)
  })
})
