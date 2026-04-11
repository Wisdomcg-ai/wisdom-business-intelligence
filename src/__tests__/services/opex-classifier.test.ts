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

  it('identifies payroll tax and workcover as team costs', () => {
    expect(isTeamCost('Payroll Tax')).toBe(true)
    expect(isTeamCost('WorkCover Insurance')).toBe(true)
    expect(isTeamCost('Workers Compensation')).toBe(true)
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
})
