/**
 * Phase 54-01 Task 1 — RED→GREEN unit tests for the new derivation helper +
 * period-factor constants in xero-payroll-mapping.ts.
 *
 * Pure-function tests. No mocking. Validates research §3 numbers (the 5 JDS
 * employees: Alex Howard 6339@84.52 → 37.5h/wk → $164,814/yr, etc.).
 *
 * NB: existing Phase 52 helper coverage lives at
 *   src/__tests__/forecast/phase-52-payroll-mapping.test.ts
 * — this file scopes ONLY to the 54-01 derivation additions so Phase 52's
 * test file isn't bloated with cross-phase concerns. Plan 54-01 frontmatter
 * lists this path explicitly.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveHoursAndSalaryFromPayRun,
  WEEKS_PER_PERIOD_BY_CALENDAR_TYPE,
  PERIODS_PER_YEAR_BY_CALENDAR_TYPE,
} from '@/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping';

describe('Phase 54-01 — period-factor constants', () => {
  it('Test 1 — WEEKS_PER_PERIOD_BY_CALENDAR_TYPE values match research §3', () => {
    expect(WEEKS_PER_PERIOD_BY_CALENDAR_TYPE.WEEKLY).toBe(1);
    expect(WEEKS_PER_PERIOD_BY_CALENDAR_TYPE.FORTNIGHTLY).toBe(2);
    expect(WEEKS_PER_PERIOD_BY_CALENDAR_TYPE.MONTHLY).toBe(4.33);
    expect(WEEKS_PER_PERIOD_BY_CALENDAR_TYPE.FOURWEEKLY).toBe(4);
    expect(WEEKS_PER_PERIOD_BY_CALENDAR_TYPE.TWICEMONTHLY).toBe(2.165);
    expect(WEEKS_PER_PERIOD_BY_CALENDAR_TYPE.QUARTERLY).toBe(13);
  });

  it('Test 2 — PERIODS_PER_YEAR_BY_CALENDAR_TYPE values match research §3', () => {
    expect(PERIODS_PER_YEAR_BY_CALENDAR_TYPE.WEEKLY).toBe(52);
    expect(PERIODS_PER_YEAR_BY_CALENDAR_TYPE.FORTNIGHTLY).toBe(26);
    expect(PERIODS_PER_YEAR_BY_CALENDAR_TYPE.MONTHLY).toBe(12);
    expect(PERIODS_PER_YEAR_BY_CALENDAR_TYPE.FOURWEEKLY).toBe(13);
    expect(PERIODS_PER_YEAR_BY_CALENDAR_TYPE.TWICEMONTHLY).toBe(24);
    expect(PERIODS_PER_YEAR_BY_CALENDAR_TYPE.QUARTERLY).toBe(4);
  });
});

describe('Phase 54-01 — deriveHoursAndSalaryFromPayRun (happy path, JDS numbers)', () => {
  it('Test 3 — Alex Howard FORTNIGHTLY: 6339 @ 84.52 → 37.5h/wk, $164,814/yr', () => {
    const result = deriveHoursAndSalaryFromPayRun(6339, 84.52, 'FORTNIGHTLY');
    expect(result.hoursPerWeek).toBeDefined();
    expect(Math.abs((result.hoursPerWeek as number) - 37.5)).toBeLessThanOrEqual(0.05);
    expect(result.annualSalary).toBe(164814); // 6339 * 26 = 164814 exactly
  });

  it('Test 4 — Bernadette Unatan FORTNIGHTLY: 2501 @ 33.34 → 37.5h/wk, $65,026/yr', () => {
    const result = deriveHoursAndSalaryFromPayRun(2501, 33.34, 'FORTNIGHTLY');
    expect(result.hoursPerWeek).toBeDefined();
    expect(Math.abs((result.hoursPerWeek as number) - 37.5)).toBeLessThanOrEqual(0.05);
    expect(result.annualSalary).toBe(2501 * 26); // 65026
  });
});

describe('Phase 54-01 — deriveHoursAndSalaryFromPayRun (other calendars)', () => {
  it('Test 5 — WEEKLY: 1500 @ 40 → 37.5h/wk, $78,000/yr', () => {
    const result = deriveHoursAndSalaryFromPayRun(1500, 40, 'WEEKLY');
    expect(result.hoursPerWeek).toBe(37.5);
    expect(result.annualSalary).toBe(78000); // 1500 * 52
  });

  it('Test 6 — MONTHLY: 13000 @ 80 → ~37.53h/wk, $156,000/yr', () => {
    const result = deriveHoursAndSalaryFromPayRun(13000, 80, 'MONTHLY');
    const expected = (13000 / 80) / 4.33;
    expect(result.hoursPerWeek).toBeDefined();
    expect(Math.abs((result.hoursPerWeek as number) - expected)).toBeLessThanOrEqual(0.05);
    expect(result.annualSalary).toBe(156000); // 13000 * 12
  });

  it('Test 7 — case-insensitive calendarType (lowercase "weekly" matches WEEKLY)', () => {
    const upper = deriveHoursAndSalaryFromPayRun(1500, 40, 'WEEKLY');
    const lower = deriveHoursAndSalaryFromPayRun(1500, 40, 'weekly');
    expect(lower.hoursPerWeek).toBe(upper.hoursPerWeek);
    expect(lower.annualSalary).toBe(upper.annualSalary);
  });
});

describe('Phase 54-01 — deriveHoursAndSalaryFromPayRun (edge cases)', () => {
  it('Test 8 — missing calendarType returns {} (both undefined, NOT zeroed)', () => {
    const result = deriveHoursAndSalaryFromPayRun(6339, 84.52, undefined);
    expect(result).toEqual({});
    expect(result.hoursPerWeek).toBeUndefined();
    expect(result.annualSalary).toBeUndefined();
  });

  it('Test 9 — unknown calendarType returns {} (no invented factor)', () => {
    const result = deriveHoursAndSalaryFromPayRun(6339, 84.52, 'BIWEEKLY');
    expect(result).toEqual({});
  });

  it('Test 10 — missing hourlyRate: annualSalary still derived, hoursPerWeek undefined', () => {
    const result = deriveHoursAndSalaryFromPayRun(6339, undefined, 'FORTNIGHTLY');
    expect(result.hoursPerWeek).toBeUndefined();
    expect(result.annualSalary).toBe(164814);
  });

  it('Test 11 — zero hourlyRate: annualSalary derived, hoursPerWeek undefined (no division by zero)', () => {
    const result = deriveHoursAndSalaryFromPayRun(6339, 0, 'FORTNIGHTLY');
    expect(result.hoursPerWeek).toBeUndefined();
    expect(result.annualSalary).toBe(164814);
  });

  it('Test 12 — zero avgWagesPerPeriod: returns {hoursPerWeek: 0, annualSalary: 0} (employee on unpaid leave)', () => {
    const result = deriveHoursAndSalaryFromPayRun(0, 84.52, 'FORTNIGHTLY');
    expect(result.hoursPerWeek).toBe(0);
    expect(result.annualSalary).toBe(0);
  });

  it('Test 13 — negative avgWagesPerPeriod: defensive — returns {} (corrupt data never applied)', () => {
    const result = deriveHoursAndSalaryFromPayRun(-100, 84.52, 'FORTNIGHTLY');
    expect(result).toEqual({});
  });
});

describe('Phase 54-01 — deriveHoursAndSalaryFromPayRun (rounding)', () => {
  it('Test 14 — annualSalary is rounded to integer via Math.round (mirrors getDerivedAnnualSalary)', () => {
    // 6339.5 * 26 = 164827.0 — but use a value that actually requires rounding.
    // 6339.5 * 26 = 164827 exactly, so use a fractional that produces a non-integer:
    // 6339.51 * 26 = 164827.26 → rounds to 164827.
    const result = deriveHoursAndSalaryFromPayRun(6339.51, 84.52, 'FORTNIGHTLY');
    expect(result.annualSalary).toBe(Math.round(6339.51 * 26));
    expect(Number.isInteger(result.annualSalary)).toBe(true);
  });

  it('Test 15 — hoursPerWeek is NOT rounded (returned as float; 37.5 is itself a half)', () => {
    const result = deriveHoursAndSalaryFromPayRun(6339, 84.52, 'FORTNIGHTLY');
    expect(result.hoursPerWeek).toBeDefined();
    // The computed value is (6339 / 84.52) / 2 ≈ 37.5000... — assert it isn't
    // accidentally Math.round'd to 38.
    const raw = (6339 / 84.52) / 2;
    expect(result.hoursPerWeek).toBe(raw);
  });
});
