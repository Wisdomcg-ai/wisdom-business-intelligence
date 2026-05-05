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
  // Phase 52-01 additions:
  ANNUAL_PAY_PERIODS,
  getDerivedAnnualSalary,
  markFieldOverridden,
  isFieldOverridden,
  isXeroSourcedRow,
  // Phase 52-02 additions (RED on HEAD until Task 2 ships these exports):
  findMatchingTeamMember,
  computeReconciliationDiff,
  applyReconciliationDecision,
  applySilentXeroUpdates,
  XERO_TRACKED_FIELDS,
  type MemberDiff,
  type FieldDiff,
  type ReconciliationDecision,
} from '@/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping';
import type { TeamMember } from '@/app/finances/forecast/components/wizard-v4/types';

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

// ───────────────────────────────────────────────────────────────────────────
// Phase 52-01 additions — derived-salary helper + override tracking helpers
// ───────────────────────────────────────────────────────────────────────────

describe('ANNUAL_PAY_PERIODS', () => {
  it('weekly = 52', () => {
    expect(ANNUAL_PAY_PERIODS.weekly).toBe(52);
  });
  it('fortnightly = 26', () => {
    expect(ANNUAL_PAY_PERIODS.fortnightly).toBe(26);
  });
  it('monthly = 12', () => {
    expect(ANNUAL_PAY_PERIODS.monthly).toBe(12);
  });
});

describe('getDerivedAnnualSalary', () => {
  it('weekly: $45/hr × 20h × 52 = $46,800', () => {
    expect(getDerivedAnnualSalary(45, 20, 'weekly')).toBe(46800);
  });
  it('fortnightly: $45/hr × 20h × 26 = $23,400', () => {
    expect(getDerivedAnnualSalary(45, 20, 'fortnightly')).toBe(23400);
  });
  it('monthly: $60/hr × 38h × 12 = $27,360', () => {
    expect(getDerivedAnnualSalary(60, 38, 'monthly')).toBe(27360);
  });
  it('rounds non-integer products', () => {
    // 17.55 × 38 × 52 = 34678.68 → 34679
    expect(getDerivedAnnualSalary(17.55, 38, 'weekly')).toBe(34679);
  });
  it('returns undefined when hourlyRate is missing', () => {
    expect(getDerivedAnnualSalary(undefined, 20, 'weekly')).toBeUndefined();
  });
  it('returns undefined when standardHours is missing', () => {
    expect(getDerivedAnnualSalary(45, undefined, 'weekly')).toBeUndefined();
  });
  it('returns undefined when payFrequency is missing', () => {
    expect(getDerivedAnnualSalary(45, 20, undefined)).toBeUndefined();
  });
  it('handles zero hours correctly (returns 0, not undefined)', () => {
    // 45 × 0 × 52 = 0 — meaningful "no hours configured" signal, not missing input.
    expect(getDerivedAnnualSalary(45, 0, 'weekly')).toBe(0);
  });
});

describe('markFieldOverridden', () => {
  it('starts a new array when current is undefined', () => {
    expect(markFieldOverridden(undefined, 'currentSalary')).toEqual(['currentSalary']);
  });
  it('appends to existing array', () => {
    expect(markFieldOverridden(['payFrequency'], 'currentSalary')).toEqual([
      'payFrequency',
      'currentSalary',
    ]);
  });
  it('is idempotent — duplicate add returns the same array reference', () => {
    const arr = ['currentSalary'];
    const result = markFieldOverridden(arr, 'currentSalary');
    expect(result).toBe(arr); // same reference, no change
    expect(result).toEqual(['currentSalary']);
  });
  it('handles empty array input', () => {
    expect(markFieldOverridden([], 'role')).toEqual(['role']);
  });
  it('preserves order on multiple appends', () => {
    let acc: string[] | undefined;
    acc = markFieldOverridden(acc, 'currentSalary');
    acc = markFieldOverridden(acc, 'payFrequency');
    acc = markFieldOverridden(acc, 'hourlyRate');
    acc = markFieldOverridden(acc, 'currentSalary'); // dup, ignored
    expect(acc).toEqual(['currentSalary', 'payFrequency', 'hourlyRate']);
  });
});

describe('isFieldOverridden', () => {
  it('returns false when _overriddenFields is undefined', () => {
    expect(isFieldOverridden({ _overriddenFields: undefined }, 'currentSalary')).toBe(false);
  });
  it('returns true when field is in array', () => {
    expect(
      isFieldOverridden({ _overriddenFields: ['currentSalary', 'payFrequency'] }, 'currentSalary'),
    ).toBe(true);
  });
  it('returns false when field is not in array', () => {
    expect(
      isFieldOverridden({ _overriddenFields: ['payFrequency'] }, 'currentSalary'),
    ).toBe(false);
  });
  it('returns false for empty array', () => {
    expect(isFieldOverridden({ _overriddenFields: [] }, 'currentSalary')).toBe(false);
  });
});

describe('isXeroSourcedRow', () => {
  it('returns true when _xeroEmployeeId is set', () => {
    expect(
      isXeroSourcedRow({ _xeroEmployeeId: 'emp-123', _xeroFingerprint: undefined }),
    ).toBe(true);
  });
  it('returns false when _xeroEmployeeId is undefined', () => {
    expect(
      isXeroSourcedRow({ _xeroEmployeeId: undefined, _xeroFingerprint: undefined }),
    ).toBe(false);
  });
  it('returns false when _xeroEmployeeId is empty string', () => {
    expect(
      isXeroSourcedRow({ _xeroEmployeeId: '', _xeroFingerprint: undefined }),
    ).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Phase 52-02 additions — re-import reconciliation helpers
//
// RED on HEAD: every test below fails because the 4 helpers + types do not
// yet exist on xero-payroll-mapping.ts. After Task 2 lands the helpers, all
// tests in these 4 describe blocks GREEN. Existing 52-00 + 52-01 tests above
// stay GREEN throughout.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Helper to build a minimal TeamMember for reconciliation tests. All Phase 52
 * provenance fields default to "Xero-sourced row" with a fresh fingerprint.
 */
function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'team-default',
    name: 'Alice',
    role: 'Engineer',
    type: 'full-time',
    hoursPerWeek: 38,
    currentSalary: 98000,
    increasePct: 0,
    newSalary: 98000,
    superAmount: 0,
    isFromXero: true,
    payFrequency: 'fortnightly',
    standardHours: 38,
    hourlyRate: undefined,
    _xeroEmployeeId: 'emp-alice-xero',
    _xeroImportedAt: '2026-04-01T00:00:00.000Z',
    _xeroFingerprint: {
      name: 'Alice',
      role: 'Engineer',
      type: 'full-time',
      payFrequency: 'fortnightly',
      standardHours: 38,
      currentSalary: 98000,
    },
    ...overrides,
  };
}

describe('findMatchingTeamMember', () => {
  it('Tier 1 wins: matching _xeroEmployeeId returns that member id even if name differs', () => {
    const members = [
      { id: 'team-1', name: 'Different Name', _xeroEmployeeId: 'emp-xero-1' },
      { id: 'team-2', name: 'Bob Jones', _xeroEmployeeId: 'emp-xero-2' },
    ];
    const result = findMatchingTeamMember(
      { employee_id: 'emp-xero-1', full_name: 'Alice Smith' },
      members,
    );
    expect(result).toBe('team-1');
  });

  it('Tier 2 wins: no _xeroEmployeeId match but email matches case-insensitively', () => {
    const members = [
      { id: 'team-1', name: 'Bob Jones', _xeroEmployeeId: 'other-emp', email: 'BOB@example.com' },
      { id: 'team-2', name: 'Carol', _xeroEmployeeId: 'emp-c', email: 'carol@example.com' },
    ];
    const result = findMatchingTeamMember(
      { employee_id: 'no-match-id', full_name: 'Bob Jones', email: 'bob@example.com' },
      members,
    );
    expect(result).toBe('team-1');
  });

  it('Tier 3 wins: no id/email match but name matches case-insensitively + trimmed', () => {
    const members = [
      { id: 'team-1', name: '  Alice Smith  ', _xeroEmployeeId: 'other-emp' },
      { id: 'team-2', name: 'Bob Jones', _xeroEmployeeId: 'emp-b' },
    ];
    const result = findMatchingTeamMember(
      { employee_id: 'no-match', full_name: 'alice smith' },
      members,
    );
    expect(result).toBe('team-1');
  });

  it('returns undefined when teamMembers is empty', () => {
    const result = findMatchingTeamMember(
      { employee_id: 'emp-1', full_name: 'Anyone' },
      [],
    );
    expect(result).toBeUndefined();
  });

  it('returns undefined when nothing matches across all 3 tiers', () => {
    const members = [
      { id: 'team-1', name: 'Bob', _xeroEmployeeId: 'emp-b', email: 'bob@x.com' },
    ];
    const result = findMatchingTeamMember(
      { employee_id: 'emp-no', full_name: 'Carol', email: 'carol@x.com' },
      members,
    );
    expect(result).toBeUndefined();
  });

  it('Tier 3 matches a manually-added member (no _xeroEmployeeId) by name', () => {
    // Manually-added Mary has no _xeroEmployeeId. Xero returns an employee
    // with full_name 'Mary Smith'. Tier 3 should match.
    const members = [
      { id: 'team-mary', name: 'Mary Smith', _xeroEmployeeId: undefined },
    ];
    const result = findMatchingTeamMember(
      { employee_id: 'emp-mary-xero', full_name: 'Mary Smith' },
      members,
    );
    expect(result).toBe('team-mary');
  });

  it('Tier ordering: when both _xeroEmployeeId AND name match different members, tier 1 wins', () => {
    const members = [
      { id: 'team-a', name: 'Different Name', _xeroEmployeeId: 'emp-target' },
      { id: 'team-b', name: 'Alice Smith', _xeroEmployeeId: 'unrelated-id' },
    ];
    const result = findMatchingTeamMember(
      { employee_id: 'emp-target', full_name: 'Alice Smith' },
      members,
    );
    expect(result).toBe('team-a');
  });
});

describe('computeReconciliationDiff', () => {
  it('all fields unchanged → every field verdict is "unchanged"', () => {
    const member = makeMember();
    const fresh = {
      name: 'Alice',
      role: 'Engineer',
      type: 'full-time' as const,
      payFrequency: 'fortnightly' as const,
      standardHours: 38,
      hourlyRate: undefined,
      currentSalary: 98000,
    };
    const diff = computeReconciliationDiff(member, fresh as any);
    expect(diff.fields.every((f) => f.verdict === 'unchanged')).toBe(true);
  });

  it('one field changed by Xero, operator never touched → verdict is "updated-by-xero-only"', () => {
    const member = makeMember({ currentSalary: 98000, _overriddenFields: undefined });
    const fresh = {
      name: 'Alice',
      role: 'Engineer',
      type: 'full-time' as const,
      payFrequency: 'fortnightly' as const,
      standardHours: 38,
      hourlyRate: undefined,
      currentSalary: 105000,
    };
    const diff = computeReconciliationDiff(member, fresh as any);
    const salaryField = diff.fields.find((f) => f.field === 'currentSalary')!;
    expect(salaryField.verdict).toBe('updated-by-xero-only');
    // Other fields stay "unchanged"
    expect(diff.fields.filter((f) => f.field !== 'currentSalary').every((f) => f.verdict === 'unchanged')).toBe(true);
  });

  it('field operator-overridden but Xero unchanged → verdict is "unchanged" (no Xero change to react to)', () => {
    const member = makeMember({
      currentSalary: 90000, // operator changed value
      _overriddenFields: ['currentSalary'],
      _xeroFingerprint: { ...makeMember()._xeroFingerprint!, currentSalary: 98000 },
    });
    const fresh = {
      name: 'Alice',
      role: 'Engineer',
      type: 'full-time' as const,
      payFrequency: 'fortnightly' as const,
      standardHours: 38,
      hourlyRate: undefined,
      currentSalary: 98000, // Xero hasn't changed since last import
    };
    const diff = computeReconciliationDiff(member, fresh as any);
    expect(diff.fields.find((f) => f.field === 'currentSalary')!.verdict).toBe('unchanged');
  });

  it('field operator-overridden AND Xero changed → verdict is "conflict"', () => {
    const member = makeMember({
      currentSalary: 90000,
      _overriddenFields: ['currentSalary'],
      _xeroFingerprint: { ...makeMember()._xeroFingerprint!, currentSalary: 98000 },
    });
    const fresh = {
      name: 'Alice',
      role: 'Engineer',
      type: 'full-time' as const,
      payFrequency: 'fortnightly' as const,
      standardHours: 38,
      hourlyRate: undefined,
      currentSalary: 105000,
    };
    const diff = computeReconciliationDiff(member, fresh as any);
    expect(diff.fields.find((f) => f.field === 'currentSalary')!.verdict).toBe('conflict');
  });

  it('mix: 1 unchanged + 1 silent-update + 1 conflict', () => {
    const member = makeMember({
      currentSalary: 90000,                     // operator-overridden + Xero will change
      payFrequency: 'fortnightly',              // unchanged
      role: 'Senior Engineer',                  // operator-overridden role; here Xero will NOT change → unchanged
      _overriddenFields: ['currentSalary'],     // role NOT overridden
      _xeroFingerprint: {
        ...makeMember()._xeroFingerprint!,
        currentSalary: 98000,
        role: 'Engineer',
      },
    });
    const fresh = {
      name: 'Alice',
      role: 'Lead Engineer',                    // Xero changed role; operator NOT overridden → silent
      type: 'full-time' as const,
      payFrequency: 'fortnightly' as const,     // unchanged
      standardHours: 38,
      hourlyRate: undefined,
      currentSalary: 105000,                     // Xero changed + operator overridden → conflict
    };
    const diff = computeReconciliationDiff(member, fresh as any);
    const verdicts = diff.fields.reduce<Record<string, string>>((acc, f) => {
      acc[f.field] = f.verdict;
      return acc;
    }, {});
    expect(verdicts.currentSalary).toBe('conflict');
    expect(verdicts.role).toBe('updated-by-xero-only');
    expect(verdicts.payFrequency).toBe('unchanged');
  });

  it('float tolerance: hourlyRate fingerprint=45.00, fresh=45.001 → "unchanged" (within 0.005)', () => {
    const member = makeMember({
      hourlyRate: 45.00,
      _xeroFingerprint: { ...makeMember()._xeroFingerprint!, hourlyRate: 45.00 },
    });
    const fresh = {
      name: 'Alice',
      role: 'Engineer',
      type: 'full-time' as const,
      payFrequency: 'fortnightly' as const,
      standardHours: 38,
      hourlyRate: 45.001,
      currentSalary: 98000,
    };
    const diff = computeReconciliationDiff(member, fresh as any);
    expect(diff.fields.find((f) => f.field === 'hourlyRate')!.verdict).toBe('unchanged');
  });

  it('undefined↔null treated as equivalent (both "absent") → verdict "unchanged"', () => {
    const member = makeMember({
      hourlyRate: undefined,
      _xeroFingerprint: { ...makeMember()._xeroFingerprint!, hourlyRate: undefined },
    });
    const fresh = {
      name: 'Alice',
      role: 'Engineer',
      type: 'full-time' as const,
      payFrequency: 'fortnightly' as const,
      standardHours: 38,
      hourlyRate: null,
      currentSalary: 98000,
    };
    const diff = computeReconciliationDiff(member, fresh as any);
    expect(diff.fields.find((f) => f.field === 'hourlyRate')!.verdict).toBe('unchanged');
  });

  it('missing _xeroFingerprint entirely → every changed field counts as "updated-by-xero-only"', () => {
    const member = makeMember({
      _xeroFingerprint: undefined,
      _overriddenFields: undefined,
      currentSalary: 80000,
    });
    const fresh = {
      name: 'Alice Renamed',
      role: 'New Role',
      type: 'part-time' as const,
      payFrequency: 'monthly' as const,
      standardHours: 20,
      hourlyRate: 50,
      currentSalary: 105000,
    };
    const diff = computeReconciliationDiff(member, fresh as any);
    // Every field where the new value differs from the (undefined) fingerprint → silent
    const silentCount = diff.fields.filter((f) => f.verdict === 'updated-by-xero-only').length;
    expect(silentCount).toBeGreaterThanOrEqual(5);
    expect(diff.fields.some((f) => f.verdict === 'conflict')).toBe(false);
  });
});

describe('applyReconciliationDecision', () => {
  it('"accept-xero" sets field to xero value, removes from _overriddenFields, refreshes fingerprint', () => {
    const member = makeMember({
      currentSalary: 90000,
      _overriddenFields: ['currentSalary', 'payFrequency'],
    });
    const before = Date.now();
    const partial = applyReconciliationDecision(member, 'currentSalary', 'accept-xero', 105000);
    const after = Date.now();
    expect(partial.currentSalary).toBe(105000);
    expect(partial._xeroFingerprint?.currentSalary).toBe(105000);
    expect(partial._overriddenFields).toEqual(['payFrequency']);
    const ts = new Date(partial._xeroImportedAt!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('"accept-xero" on field NOT in _overriddenFields is idempotent on overrides', () => {
    const member = makeMember({
      currentSalary: 98000,
      _overriddenFields: ['payFrequency'],
    });
    const partial = applyReconciliationDecision(member, 'currentSalary', 'accept-xero', 105000);
    expect(partial.currentSalary).toBe(105000);
    expect(partial._xeroFingerprint?.currentSalary).toBe(105000);
    expect(partial._overriddenFields).toEqual(['payFrequency']);
  });

  it('"keep-mine" leaves field value untouched, refreshes fingerprint to xero value, ensures field IS in _overriddenFields', () => {
    const member = makeMember({
      currentSalary: 90000,
      _overriddenFields: ['currentSalary'],
    });
    const partial = applyReconciliationDecision(member, 'currentSalary', 'keep-mine', 105000);
    expect(partial.currentSalary).toBeUndefined(); // not written
    expect(partial._xeroFingerprint?.currentSalary).toBe(105000);
    expect(partial._overriddenFields).toContain('currentSalary');
    expect(partial._xeroImportedAt).toBeDefined();
  });

  it('"keep-mine" when field already in _overriddenFields is idempotent', () => {
    const member = makeMember({
      currentSalary: 90000,
      _overriddenFields: ['currentSalary', 'payFrequency'],
    });
    const partial = applyReconciliationDecision(member, 'currentSalary', 'keep-mine', 105000);
    // No duplicate; preserve order
    expect(partial._overriddenFields).toEqual(['currentSalary', 'payFrequency']);
  });

  it('"edit" sets field to operatorValue (NOT xero value), adds field to _overriddenFields, refreshes fingerprint to xero value', () => {
    const member = makeMember({
      currentSalary: 98000,
      _overriddenFields: undefined,
    });
    const partial = applyReconciliationDecision(member, 'currentSalary', 'edit', 105000, 100000);
    expect(partial.currentSalary).toBe(100000); // operator value
    expect(partial._xeroFingerprint?.currentSalary).toBe(105000); // xero snapshot
    expect(partial._overriddenFields).toContain('currentSalary');
  });

  it('"edit" on field already in _overriddenFields is idempotent on overrides', () => {
    const member = makeMember({
      currentSalary: 90000,
      _overriddenFields: ['currentSalary'],
    });
    const partial = applyReconciliationDecision(member, 'currentSalary', 'edit', 105000, 92000);
    expect(partial.currentSalary).toBe(92000);
    expect(partial._overriddenFields).toEqual(['currentSalary']);
  });

  it('fingerprint preservation: other field fingerprints not being decided are preserved', () => {
    const member = makeMember({
      _xeroFingerprint: {
        name: 'Alice',
        role: 'Engineer',
        type: 'full-time',
        payFrequency: 'fortnightly',
        standardHours: 38,
        currentSalary: 98000,
        hourlyRate: 50,
      },
      _overriddenFields: ['currentSalary'],
    });
    const partial = applyReconciliationDecision(member, 'currentSalary', 'accept-xero', 105000);
    expect(partial._xeroFingerprint?.payFrequency).toBe('fortnightly');
    expect(partial._xeroFingerprint?.standardHours).toBe(38);
    expect(partial._xeroFingerprint?.hourlyRate).toBe(50);
    expect(partial._xeroFingerprint?.role).toBe('Engineer');
    expect(partial._xeroFingerprint?.currentSalary).toBe(105000); // updated
  });

  it('_overriddenFields preservation: other override entries are preserved when removing/adding one', () => {
    const member = makeMember({
      _overriddenFields: ['currentSalary', 'payFrequency', 'role'],
    });
    const partial = applyReconciliationDecision(member, 'currentSalary', 'accept-xero', 105000);
    expect(partial._overriddenFields).toEqual(['payFrequency', 'role']);
  });

  it('_xeroImportedAt is updated to the current time on every decision', async () => {
    const member = makeMember({ _xeroImportedAt: '2020-01-01T00:00:00.000Z' });
    const before = Date.now();
    const partial = applyReconciliationDecision(member, 'currentSalary', 'keep-mine', 105000);
    const after = Date.now();
    const ts = new Date(partial._xeroImportedAt!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe('applySilentXeroUpdates', () => {
  it('all fields unchanged → returns null', () => {
    const member = makeMember();
    const diff: MemberDiff = {
      memberId: member.id,
      xeroEmployeeId: member._xeroEmployeeId!,
      fields: XERO_TRACKED_FIELDS.map((field) => ({
        field,
        currentValue: undefined,
        lastImportedValue: undefined,
        newXeroValue: undefined,
        verdict: 'unchanged' as const,
      })),
    };
    expect(applySilentXeroUpdates(member, diff)).toBeNull();
  });

  it('only conflict fields → returns null (silent updates do not include conflicts)', () => {
    const member = makeMember();
    const diff: MemberDiff = {
      memberId: member.id,
      xeroEmployeeId: member._xeroEmployeeId!,
      fields: [
        {
          field: 'currentSalary',
          currentValue: 90000,
          lastImportedValue: 98000,
          newXeroValue: 105000,
          verdict: 'conflict' as const,
        },
      ],
    };
    expect(applySilentXeroUpdates(member, diff)).toBeNull();
  });

  it('2 silent fields → returns Partial<TeamMember> with both values applied + both in fingerprint + _xeroImportedAt', () => {
    const member = makeMember();
    const diff: MemberDiff = {
      memberId: member.id,
      xeroEmployeeId: member._xeroEmployeeId!,
      fields: [
        {
          field: 'currentSalary',
          currentValue: 98000,
          lastImportedValue: 98000,
          newXeroValue: 105000,
          verdict: 'updated-by-xero-only' as const,
        },
        {
          field: 'role',
          currentValue: 'Engineer',
          lastImportedValue: 'Engineer',
          newXeroValue: 'Lead Engineer',
          verdict: 'updated-by-xero-only' as const,
        },
      ],
    };
    const before = Date.now();
    const result = applySilentXeroUpdates(member, diff);
    const after = Date.now();
    expect(result).not.toBeNull();
    expect((result as any).currentSalary).toBe(105000);
    expect((result as any).role).toBe('Lead Engineer');
    expect(result!._xeroFingerprint?.currentSalary).toBe(105000);
    expect(result!._xeroFingerprint?.role).toBe('Lead Engineer');
    const ts = new Date(result!._xeroImportedAt!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('silent + conflict mix → returns ONLY the silent updates', () => {
    const member = makeMember();
    const diff: MemberDiff = {
      memberId: member.id,
      xeroEmployeeId: member._xeroEmployeeId!,
      fields: [
        {
          field: 'role',
          currentValue: 'Engineer',
          lastImportedValue: 'Engineer',
          newXeroValue: 'Lead Engineer',
          verdict: 'updated-by-xero-only' as const,
        },
        {
          field: 'currentSalary',
          currentValue: 90000,
          lastImportedValue: 98000,
          newXeroValue: 105000,
          verdict: 'conflict' as const,
        },
      ],
    };
    const result = applySilentXeroUpdates(member, diff);
    expect(result).not.toBeNull();
    expect((result as any).role).toBe('Lead Engineer');
    expect((result as any).currentSalary).toBeUndefined();
    expect(result!._xeroFingerprint?.role).toBe('Lead Engineer');
    // currentSalary in fingerprint should NOT be the new conflict value (still last-imported)
    expect(result!._xeroFingerprint?.currentSalary).toBe(member._xeroFingerprint?.currentSalary);
  });

  it('fingerprint preservation: untouched fingerprint fields stay intact', () => {
    const member = makeMember({
      _xeroFingerprint: {
        name: 'Alice',
        role: 'Engineer',
        type: 'full-time',
        payFrequency: 'fortnightly',
        standardHours: 38,
        currentSalary: 98000,
        hourlyRate: 50,
      },
    });
    const diff: MemberDiff = {
      memberId: member.id,
      xeroEmployeeId: member._xeroEmployeeId!,
      fields: [
        {
          field: 'role',
          currentValue: 'Engineer',
          lastImportedValue: 'Engineer',
          newXeroValue: 'Lead Engineer',
          verdict: 'updated-by-xero-only' as const,
        },
      ],
    };
    const result = applySilentXeroUpdates(member, diff);
    expect(result).not.toBeNull();
    expect(result!._xeroFingerprint?.payFrequency).toBe('fortnightly');
    expect(result!._xeroFingerprint?.standardHours).toBe(38);
    expect(result!._xeroFingerprint?.hourlyRate).toBe(50);
    expect(result!._xeroFingerprint?.currentSalary).toBe(98000);
    expect(result!._xeroFingerprint?.role).toBe('Lead Engineer');
  });
});
