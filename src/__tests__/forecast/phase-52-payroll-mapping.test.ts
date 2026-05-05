/**
 * Phase 52-00 Task 1 RED:
 *   ALL tests fail with "Cannot find module '...xero-payroll-mapping'" on HEAD.
 *   Becomes GREEN in Task 3 once the helper module is created.
 *
 * Pure-function unit tests for src/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping.ts.
 * Covers all 6 helpers: mapXeroPayrollCalendarToFrequency, normaliseXeroEmployment,
 * classifyXeroEarningsRateCalculationType, extractCompensationFromPayTemplate,
 * enrichWizardMemberFromXeroEmployee, computeXeroFingerprint.
 */

import { describe, it, expect } from 'vitest';
import {
  mapXeroPayrollCalendarToFrequency,
  normaliseXeroEmployment,
  classifyXeroEarningsRateCalculationType,
  extractCompensationFromPayTemplate,
  enrichWizardMemberFromXeroEmployee,
  computeXeroFingerprint,
} from '@/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping';

describe('mapXeroPayrollCalendarToFrequency', () => {
  it.each([
    ['WEEKLY', 'weekly'],
    ['FORTNIGHTLY', 'fortnightly'],
    ['FOURWEEKLY', 'monthly'],
    ['MONTHLY', 'monthly'],
    ['TWICEMONTHLY', 'monthly'],
    ['QUARTERLY', 'monthly'],
    ['weekly', 'weekly'],
    ['Fortnightly', 'fortnightly'],
    ['monthly', 'monthly'],
    ['UNKNOWN_NEW_VALUE', undefined],
    ['', undefined],
  ])('maps %s → %s', (input, expected) => {
    expect(mapXeroPayrollCalendarToFrequency(input as string)).toBe(expected);
  });

  it('maps undefined → undefined', () => {
    expect(mapXeroPayrollCalendarToFrequency(undefined)).toBe(undefined);
  });

  it('maps null → undefined', () => {
    expect(mapXeroPayrollCalendarToFrequency(null)).toBe(undefined);
  });
});

describe('normaliseXeroEmployment', () => {
  it.each([
    ['FULLTIME', 'full-time'],
    ['PARTTIME', 'part-time'],
    ['CASUAL', 'casual'],
    ['CONTRACTOR', 'contractor'],
    ['LABOURHIRE', 'contractor'],
    ['SUPERINCOMESTREAM', 'contractor'],
    ['NONEMPLOYEE', 'contractor'],
    ['fulltime', 'full-time'],
    ['Casual', 'casual'],
    ['GIBBERISH', 'full-time'],
    ['', 'full-time'],
  ])('normalises %s → %s', (input, expected) => {
    expect(normaliseXeroEmployment(input as string)).toBe(expected);
  });

  it('handles undefined → full-time fallback', () => {
    expect(normaliseXeroEmployment(undefined)).toBe('full-time');
  });

  it('handles null → full-time fallback', () => {
    expect(normaliseXeroEmployment(null)).toBe('full-time');
  });
});

describe('classifyXeroEarningsRateCalculationType', () => {
  it.each([
    ['USEEARNINGSRATE', 'hourly'],
    ['ENTEREARNINGSRATE', 'hourly'],
    ['ANNUALSALARY', 'salaried'],
    ['useearningsrate', 'hourly'],
    ['AnnualSalary', 'salaried'],
    ['WEIRD_NEW_VALUE', undefined],
  ])('classifies %s → %s', (input, expected) => {
    expect(classifyXeroEarningsRateCalculationType(input as string)).toBe(expected);
  });

  it('handles undefined → undefined', () => {
    expect(classifyXeroEarningsRateCalculationType(undefined)).toBe(undefined);
  });

  it('handles null → undefined', () => {
    expect(classifyXeroEarningsRateCalculationType(null)).toBe(undefined);
  });
});

describe('extractCompensationFromPayTemplate', () => {
  it('extracts salaried compensation from ANNUALSALARY line', () => {
    const result = extractCompensationFromPayTemplate(
      [{ EarningsRateID: 'er-1', CalculationType: 'ANNUALSALARY', AnnualSalary: '98000' }],
      38,
    );
    expect(result).toEqual({
      annualSalary: 98000,
      standardHours: 38,
      calculationType: 'salaried',
    });
  });

  it('extracts hourly compensation with NumberOfUnitsPerWeek from line', () => {
    const result = extractCompensationFromPayTemplate(
      [{
        EarningsRateID: 'er-2',
        CalculationType: 'USEEARNINGSRATE',
        RatePerUnit: '45.00',
        NumberOfUnitsPerWeek: '20',
      }],
      38,
    );
    expect(result).toEqual({
      hourlyRate: 45,
      standardHours: 20,
      calculationType: 'hourly',
    });
  });

  it('extracts hourly compensation falling back to ordinaryHoursPerWeek when NumberOfUnitsPerWeek missing', () => {
    const result = extractCompensationFromPayTemplate(
      [{
        EarningsRateID: 'er-3',
        CalculationType: 'ENTEREARNINGSRATE',
        RatePerUnit: '50',
      }],
      40,
    );
    expect(result).toEqual({
      hourlyRate: 50,
      standardHours: 40,
      calculationType: 'hourly',
    });
  });

  it('returns standardHours fallback when earningsLines is empty', () => {
    expect(extractCompensationFromPayTemplate([], 38)).toEqual({ standardHours: 38 });
  });

  it('returns standardHours fallback when earningsLines is undefined', () => {
    expect(extractCompensationFromPayTemplate(undefined, 38)).toEqual({ standardHours: 38 });
  });

  it('handles numeric (non-string) values', () => {
    const result = extractCompensationFromPayTemplate(
      [{ EarningsRateID: 'er-4', CalculationType: 'ANNUALSALARY', AnnualSalary: 75000 }],
      38,
    );
    expect(result.annualSalary).toBe(75000);
    expect(result.calculationType).toBe('salaried');
  });
});

describe('enrichWizardMemberFromXeroEmployee', () => {
  const FIXED_IMPORT_AT = '2026-05-04T00:00:00.000Z';

  it('enriches a salaried full-time employee', () => {
    const result = enrichWizardMemberFromXeroEmployee(
      {
        employee_id: 'emp-1',
        full_name: 'Alice Smith',
        first_name: 'Alice',
        last_name: 'Smith',
        job_title: 'Manager',
        annual_salary: 98000,
        hours_per_week: 38,
        standard_hours: 38,
        pay_frequency: 'fortnightly',
        employment_type: 'full-time',
        calculation_type: 'salaried',
        is_active: true,
        from_xero: true,
      },
      FIXED_IMPORT_AT,
    );
    expect(result.name).toBe('Alice Smith');
    expect(result.role).toBe('Manager');
    expect(result.type).toBe('full-time');
    expect(result.currentSalary).toBe(98000);
    expect(result.payFrequency).toBe('fortnightly');
    expect(result.standardHours).toBe(38);
    expect(result.isFromXero).toBe(true);
    expect(result._xeroEmployeeId).toBe('emp-1');
    expect(result._xeroImportedAt).toBe(FIXED_IMPORT_AT);
    expect(result._xeroFingerprint).toBeDefined();
    expect(result._xeroFingerprint?.payFrequency).toBe('fortnightly');
    expect(result._xeroFingerprint?.standardHours).toBe(38);
    expect(result._xeroFingerprint?.currentSalary).toBe(98000);
  });

  it('enriches an hourly casual', () => {
    const result = enrichWizardMemberFromXeroEmployee(
      {
        employee_id: 'emp-2',
        full_name: 'Bob Jones',
        job_title: 'Floor Staff',
        hourly_rate: 45,
        hours_per_week: 20,
        standard_hours: 20,
        pay_frequency: 'weekly',
        employment_type: 'casual',
        calculation_type: 'hourly',
        is_active: true,
        from_xero: true,
      },
      FIXED_IMPORT_AT,
    );
    expect(result.type).toBe('casual');
    expect(result.hourlyRate).toBe(45);
    expect(result.standardHours).toBe(20);
    expect(result.payFrequency).toBe('weekly');
    expect(result.currentSalary).toBe(0);
    expect(result.isFromXero).toBe(true);
  });

  it('defaults role to "Team member" when job_title is missing', () => {
    const result = enrichWizardMemberFromXeroEmployee(
      {
        employee_id: 'emp-3',
        full_name: 'Carol Doe',
        is_active: true,
        from_xero: true,
      },
      FIXED_IMPORT_AT,
    );
    expect(result.role).toBe('Team member');
  });

  it('uses provided importedAt verbatim', () => {
    const result = enrichWizardMemberFromXeroEmployee(
      {
        employee_id: 'emp-4',
        full_name: 'Dan Lee',
        is_active: true,
        from_xero: true,
      },
      FIXED_IMPORT_AT,
    );
    expect(result._xeroImportedAt).toBe(FIXED_IMPORT_AT);
  });

  it('includes name and role in _xeroFingerprint snapshot', () => {
    const result = enrichWizardMemberFromXeroEmployee(
      {
        employee_id: 'emp-5',
        full_name: 'Eve Park',
        job_title: 'Designer',
        annual_salary: 80000,
        is_active: true,
        from_xero: true,
      },
      FIXED_IMPORT_AT,
    );
    expect(result._xeroFingerprint?.name).toBe('Eve Park');
    expect(result._xeroFingerprint?.role).toBe('Designer');
  });
});

describe('computeXeroFingerprint', () => {
  it('strips undefined keys', () => {
    const result = computeXeroFingerprint({
      payFrequency: 'monthly',
      standardHours: undefined,
      hourlyRate: 50,
    });
    expect(result).toEqual({ payFrequency: 'monthly', hourlyRate: 50 });
    expect('standardHours' in result).toBe(false);
  });

  it('preserves zero values (must NOT strip 0)', () => {
    const result = computeXeroFingerprint({
      currentSalary: 0,
      hourlyRate: 0,
      standardHours: 38,
    });
    expect(result.currentSalary).toBe(0);
    expect(result.hourlyRate).toBe(0);
    expect(result.standardHours).toBe(38);
  });

  it('returns an empty object for fully-undefined input', () => {
    expect(computeXeroFingerprint({})).toEqual({});
  });
});
