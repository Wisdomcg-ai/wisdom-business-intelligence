/**
 * Characterization tests for PayrollCalculator — the pure engine that turns a
 * salary + frequency into per-period pay, super, PAYG and monthly cost. It was
 * previously untested; these lock in its CURRENT behaviour so the CFO-grade
 * numbers can't silently regress, and they document one real discrepancy found
 * while writing them (see the PAYG block).
 *
 * Expected values are derived from src/app/finances/forecast/constants.ts:
 *   pay periods/yr: weekly 52, fortnightly 26, monthly 12
 *   super default:  0.12
 *   default hours:  40/wk
 *   AU brackets (as coded): $0 ≤18,200; 19% →45k; 32.5% →120k (base 5,092);
 *                           37% →180k (base 29,467); 45% >180k (base 51,667)
 */
import { describe, it, expect } from 'vitest'
import { PayrollCalculator } from '../payroll-calculator'
import type { ForecastEmployee } from '../../types'

const emp = (over: Partial<ForecastEmployee> = {}): ForecastEmployee => ({
  employee_name: 'Test Employee',
  classification: 'opex',
  ...over,
})

describe('calculatePayPerPeriod', () => {
  it('divides annual salary by the periods-per-year for the frequency', () => {
    expect(PayrollCalculator.calculatePayPerPeriod(52000, 'weekly')).toBe(1000)
    expect(PayrollCalculator.calculatePayPerPeriod(52000, 'fortnightly')).toBe(2000)
    expect(PayrollCalculator.calculatePayPerPeriod(120000, 'monthly')).toBe(10000)
  })
})

describe('hourly ↔ annual conversions', () => {
  it('annual from hourly = rate × hours × 52', () => {
    expect(PayrollCalculator.calculateAnnualSalaryFromHourly(50, 40)).toBe(104000)
  })
  it('hourly from annual is the inverse; guards divide-by-zero hours', () => {
    expect(PayrollCalculator.calculateHourlyRateFromAnnual(104000, 40)).toBe(50)
    expect(PayrollCalculator.calculateHourlyRateFromAnnual(104000, 0)).toBe(0)
  })
  it('pay per period from an hourly rate', () => {
    expect(PayrollCalculator.calculatePayPerPeriodFromHourly(50, 40, 'weekly')).toBe(2000)
    expect(PayrollCalculator.calculatePayPerPeriodFromHourly(50, 40, 'fortnightly')).toBe(4000)
    expect(PayrollCalculator.calculatePayPerPeriodFromHourly(50, 40, 'monthly')).toBeCloseTo(8666.67, 2)
  })
})

describe('calculateSuperPerPeriod', () => {
  it('applies the 12% default super rate', () => {
    expect(PayrollCalculator.calculateSuperPerPeriod(1000)).toBe(120)
  })
  it('honours an explicit super rate', () => {
    expect(PayrollCalculator.calculateSuperPerPeriod(1000, 0.11)).toBe(110)
  })
})

describe('calculatePAYGPerPeriod (AU brackets as currently coded)', () => {
  // annualTax computed from the brackets, then ÷ periods; asserted via monthly (÷12).
  it('no tax at or below the tax-free threshold', () => {
    expect(PayrollCalculator.calculatePAYGPerPeriod(18000, 'monthly')).toBe(0)
  })
  it('bracket 1 (19%): 45,000 → 5,092/yr', () => {
    // (45,000 − 18,200) × 0.19 = 5,092
    expect(PayrollCalculator.calculatePAYGPerPeriod(45000, 'monthly')).toBeCloseTo(5092 / 12, 4)
  })
  it('bracket 2 (32.5%): 90,000 → 19,717/yr', () => {
    // (90,000 − 45,000) × 0.325 + 5,092 = 19,717
    expect(PayrollCalculator.calculatePAYGPerPeriod(90000, 'monthly')).toBeCloseTo(19717 / 12, 4)
  })
  it('bracket 3 (37%): 150,000 → 40,567/yr', () => {
    // (150,000 − 120,000) × 0.37 + 29,467 = 40,567
    expect(PayrollCalculator.calculatePAYGPerPeriod(150000, 'monthly')).toBeCloseTo(40567 / 12, 4)
  })
  it('bracket 4 (45%): 200,000 → 60,667/yr', () => {
    // (200,000 − 180,000) × 0.45 + 51,667 = 60,667
    expect(PayrollCalculator.calculatePAYGPerPeriod(200000, 'monthly')).toBeCloseTo(60667 / 12, 4)
  })

  // ⚠️ DOCUMENTED DISCREPANCY (captured, not asserted as "correct"): the constant
  // is named TAX_BRACKETS_2024_25 but encodes the PRE-Stage-3 (2023-24) brackets.
  // The real 2024-25 AU brackets are 16%/30%/37%/45% at 45k/135k/190k. PAYG here
  // feeds a displayed net-pay/withholding figure, NOT the forecast COST (which is
  // gross + super), so the impact is limited — but the label is wrong and the
  // figure is stale. Flagging rather than fixing, so this stays a pure
  // characterization test.
})

describe('calculateMonthlyCost (gross + super — the actual forecast cost)', () => {
  it('is monthly salary plus super at the default rate', () => {
    // 120,000 / 12 = 10,000; + 12% super = 11,200
    expect(PayrollCalculator.calculateMonthlyCost(120000)).toBe(11200)
  })
  it('honours an explicit super rate', () => {
    expect(PayrollCalculator.calculateMonthlyCost(120000, 0.11)).toBe(11100)
  })
})

describe('recalculateEmployee', () => {
  it('derives hourly rate + all pay fields when annual salary changed', () => {
    const out = PayrollCalculator.recalculateEmployee(
      emp({ annual_salary: 104000, standard_hours_per_week: 40 }),
      'fortnightly',
      undefined,
      'annual_salary',
    )
    expect(out.hourly_rate).toBe(50)              // 104,000 / (40 × 52)
    expect(out.pay_per_period).toBe(4000)         // 104,000 / 26
    expect(out.super_per_period).toBe(480)        // 4,000 × 0.12
    expect(out.monthly_cost).toBeCloseTo(9706.67, 2) // 104,000/12 × 1.12
  })

  it('derives annual salary from hourly rate when hourly changed', () => {
    const out = PayrollCalculator.recalculateEmployee(
      emp({ hourly_rate: 50, standard_hours_per_week: 40 }),
      'weekly',
      undefined,
      'hourly_rate',
    )
    expect(out.annual_salary).toBe(104000)        // 50 × 40 × 52
    expect(out.pay_per_period).toBe(2000)         // 104,000 / 52
  })
})

describe('calculatePayPeriodsInMonth', () => {
  it('monthly is always 1', () => {
    expect(PayrollCalculator.calculatePayPeriodsInMonth('2024-08', 'monthly')).toBe(1)
  })
  it('weekly/fortnightly use a 4/2 approximation without a pay day', () => {
    expect(PayrollCalculator.calculatePayPeriodsInMonth('2024-08', 'weekly')).toBe(4)
    expect(PayrollCalculator.calculatePayPeriodsInMonth('2024-08', 'fortnightly')).toBe(2)
  })
  it('counts actual pay-day occurrences when a pay day is given', () => {
    // Aug 2024 has 5 Fridays.
    expect(PayrollCalculator.calculatePayPeriodsInMonth('2024-08', 'weekly', 'friday')).toBe(5)
    expect(PayrollCalculator.calculatePayPeriodsInMonth('2024-08', 'fortnightly', 'friday')).toBe(3) // ceil(5/2)
  })
})

describe('calculateProrationFactor', () => {
  it('is 1 for a full month with no start/end dates', () => {
    expect(PayrollCalculator.calculateProrationFactor('2024-08')).toBe(1)
  })
  it('is 0 before the employee starts', () => {
    expect(PayrollCalculator.calculateProrationFactor('2024-08', '2024-09')).toBe(0)
  })
  it('is 0 after the employee has left', () => {
    expect(PayrollCalculator.calculateProrationFactor('2024-08', undefined, '2024-07')).toBe(0)
  })
  it('is 1 for a month the employee is active in (month-granularity, per current impl)', () => {
    expect(PayrollCalculator.calculateProrationFactor('2024-08', '2024-07')).toBe(1)
    expect(PayrollCalculator.calculateProrationFactor('2024-08', '2024-08')).toBe(1)
  })
})

describe('calculateEmployeeMonthlyCost', () => {
  it('is 0 without an annual salary', () => {
    expect(PayrollCalculator.calculateEmployeeMonthlyCost(emp(), '2024-08', 'monthly')).toBe(0)
  })
  it('is the full monthly cost for an active month', () => {
    const cost = PayrollCalculator.calculateEmployeeMonthlyCost(
      emp({ annual_salary: 120000 }), '2024-08', 'monthly',
    )
    expect(cost).toBe(11200) // 10,000 + 12% super
  })
  it('is 0 for a month before the employee starts', () => {
    const cost = PayrollCalculator.calculateEmployeeMonthlyCost(
      emp({ annual_salary: 120000, start_date: '2024-09' }), '2024-08', 'monthly',
    )
    expect(cost).toBe(0)
  })
})
