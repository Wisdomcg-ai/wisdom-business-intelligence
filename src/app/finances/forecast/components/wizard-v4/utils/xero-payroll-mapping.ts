/**
 * Phase 52 (XERO-S4-01..05) — Pure mapping helpers between Xero Payroll AU
 * REST JSON and the wizard's TeamMember/NewHire shape.
 *
 * No I/O, no React, no Supabase. Trivially unit-testable. All input shapes
 * mirror Xero Payroll AU REST JSON (PascalCase keys).
 *
 * Region scope: AU only (https://api.xero.com/payroll.xro/1.0/).
 * TODO(phase-future): NZ Payroll API (`/payroll.xro/2.0/`) and UK Payroll
 * API use a different schema (`PayRunCalendars` vs `PayrollCalendars`,
 * different EmploymentType enums). The helper signatures are
 * region-agnostic strings so future NZ/UK adapters can call into this module.
 *
 * Verified against:
 *   - node_modules/xero-node/dist/gen/model/payroll-au/calendarType.d.ts
 *   - node_modules/xero-node/dist/gen/model/payroll-au/employmentBasis.d.ts
 *   - node_modules/xero-node/dist/gen/model/payroll-au/earningsRateCalculationType.d.ts
 *   - node_modules/xero-node/dist/gen/model/payroll-au/earningsLine.d.ts
 *   - node_modules/xero-node/dist/gen/model/payroll-au/payrollCalendar.d.ts
 *
 * Used by:
 *   - src/app/api/Xero/employees/route.ts (Plan 52-00 — single canonical mapping)
 *   - src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx
 *     (Plan 52-00 — first-load auto-import, 3 mapper sites consolidated)
 *   - Plan 52-01 — on-demand "Import from Xero" modal handler
 *   - Plan 52-02 — re-import reconciliation (mergeXeroEmployeeIntoMember)
 */

import type {
  PayFrequency,
  EmploymentType,
  TeamMember,
  NewHire,
  XeroFieldFingerprint,
} from '../types';

/**
 * Phase 52-01 — Annual pay-period count per PayFrequency.
 * Used by getDerivedAnnualSalary to compute the read-only annual figure
 * displayed for hourly Xero imports (hourlyRate × standardHours × periods).
 */
export const ANNUAL_PAY_PERIODS: Record<PayFrequency, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
};

/**
 * Phase 52-01 — Derive annual salary for an hourly-imported employee.
 * Used for the read-only display when calculation_type === 'hourly' (Operator's
 * Option D). Returns undefined if any input is missing so the UI can fall back
 * to '—' instead of rendering '$0/yr'.
 *
 * Math: hourlyRate × standardHours × annualPayPeriods. The wizard's existing
 * casual-annual helper (Step4Team.calculateCasualAnnual) uses
 * `hourlyRate × hoursPerWeek × weeksPerYear` — same shape, but Phase 52
 * imports use the Xero-supplied standardHours (per pay period) and infer the
 * period multiplier from payFrequency rather than a tenant-set weeksPerYear.
 */
export function getDerivedAnnualSalary(
  hourlyRate: number | undefined,
  standardHours: number | undefined,
  payFrequency: PayFrequency | undefined,
): number | undefined {
  if (hourlyRate == null || standardHours == null || !payFrequency) return undefined;
  const periods = ANNUAL_PAY_PERIODS[payFrequency];
  if (!periods) return undefined;
  return Math.round(hourlyRate * standardHours * periods);
}

/**
 * Phase 52-01 — Mark a Xero-sourced field as operator-overridden. Returns a new
 * _overriddenFields array (existing fields preserved; idempotent on duplicate).
 * Pure helper; safe in render paths.
 */
export function markFieldOverridden(
  current: string[] | undefined,
  fieldName: keyof TeamMember | keyof NewHire | string,
): string[] {
  const existing = current ?? [];
  const name = fieldName as string;
  if (existing.includes(name)) return existing;
  return [...existing, name];
}

/**
 * Phase 52-01 — Check whether a Xero-sourced field has been overridden by the
 * operator. Used for the visual 'edited' marker pill next to the field.
 */
export function isFieldOverridden(
  member: Pick<TeamMember, '_overriddenFields'>,
  fieldName: string,
): boolean {
  return Boolean(member._overriddenFields?.includes(fieldName));
}

/**
 * Phase 52-01 — Decide whether a row originated from a Xero import.
 * Drives conditional rendering of the edit affordance + 'Xero' provenance hint.
 *
 * NB: keyed off `_xeroEmployeeId` (a non-empty string identifies the Xero
 * EmployeeID join key). `Boolean('')` is `false`, so an empty-string id is
 * treated as not-from-Xero — defensive against half-stamped rows.
 */
export function isXeroSourcedRow(
  member: Pick<TeamMember, '_xeroFingerprint' | '_xeroEmployeeId'>,
): boolean {
  return Boolean(member._xeroEmployeeId);
}

/**
 * Maps Xero Payroll AU CalendarType → wizard PayFrequency.
 * FOURWEEKLY/TWICEMONTHLY/QUARTERLY collapse to 'monthly' as the nearest
 * cashflow approximation — these calendar types are rare and the wizard
 * only models 3 frequencies (weekly/fortnightly/monthly).
 */
export function mapXeroPayrollCalendarToFrequency(
  calendarType: string | undefined | null,
): PayFrequency | undefined {
  if (!calendarType) return undefined;
  switch (calendarType.toUpperCase()) {
    case 'WEEKLY':
      return 'weekly';
    case 'FORTNIGHTLY':
      return 'fortnightly';
    case 'FOURWEEKLY':
    case 'TWICEMONTHLY':
    case 'MONTHLY':
    case 'QUARTERLY':
      return 'monthly';
    default:
      return undefined;
  }
}

/**
 * Maps Xero EmploymentBasis (or legacy EmploymentType field) → wizard EmploymentType.
 *
 * Replaces the inline EMPLOYMENT_TYPE_MAP that previously lived at
 * src/app/api/Xero/employees/route.ts:38-44 (which was keyed off the wrong
 * field name — see 52-RESEARCH.md Pitfall 2). The route now reads
 * `EmploymentBasis` (correct AU JSON field) with `EmploymentType` fallback.
 *
 * Fallback to 'full-time' is preserved for backward safety: if the field is
 * missing, gibberish, or `NONEMPLOYEE` (rare), we treat as full-time rather
 * than dropping the row entirely.
 */
export function normaliseXeroEmployment(
  basis: string | undefined | null,
): EmploymentType {
  if (!basis) return 'full-time';
  switch (basis.toUpperCase()) {
    case 'FULLTIME':
      return 'full-time';
    case 'PARTTIME':
      return 'part-time';
    case 'CASUAL':
      return 'casual';
    case 'CONTRACTOR':
    case 'LABOURHIRE':
    case 'SUPERINCOMESTREAM':
      return 'contractor';
    case 'NONEMPLOYEE':
      return 'contractor';
    default:
      return 'full-time';
  }
}

/**
 * Classifies a Xero EarningsRateCalculationType.
 * Used by Plan 52-01 to branch the import-modal UI:
 *   - 'hourly' → annual salary cell shown read-only with edit affordance
 *   - 'salaried' → annual salary editable; hourly/hours shown as derived hints
 */
export function classifyXeroEarningsRateCalculationType(
  calculationType: string | undefined | null,
): 'hourly' | 'salaried' | undefined {
  if (!calculationType) return undefined;
  switch (calculationType.toUpperCase()) {
    case 'USEEARNINGSRATE':
    case 'ENTEREARNINGSRATE':
      return 'hourly';
    case 'ANNUALSALARY':
      return 'salaried';
    default:
      return undefined;
  }
}

/**
 * Extract { hourlyRate, annualSalary, standardHours, calculationType } from a
 * Xero PayTemplate.EarningsLines[]. Picks the first ordinary-earnings line
 * with a meaningful rate or salary (we only handle OrdinaryEarnings per
 * PHASE.md scope — overtime/super/allowances deferred).
 *
 * For salaried employees (CalculationType=ANNUALSALARY), standardHours comes
 * from `ordinaryHoursPerWeek` (top-level Employee field — Xero does not
 * populate NumberOfUnitsPerWeek for salaried staff).
 *
 * For hourly employees (USEEARNINGSRATE/ENTEREARNINGSRATE), standardHours
 * uses `NumberOfUnitsPerWeek` from the line when present, falling back to
 * `ordinaryHoursPerWeek` when the line omits it.
 */
export function extractCompensationFromPayTemplate(
  earningsLines: any[] | undefined,
  ordinaryHoursPerWeek: number | undefined,
): {
  hourlyRate?: number;
  annualSalary?: number;
  standardHours?: number;
  calculationType?: 'hourly' | 'salaried';
} {
  if (!earningsLines || earningsLines.length === 0) {
    return { standardHours: ordinaryHoursPerWeek };
  }
  for (const line of earningsLines) {
    const calcType = classifyXeroEarningsRateCalculationType(line.CalculationType);
    if (calcType === 'salaried' && line.AnnualSalary != null) {
      const annualSalary = typeof line.AnnualSalary === 'string'
        ? parseFloat(line.AnnualSalary)
        : Number(line.AnnualSalary);
      return {
        annualSalary: isNaN(annualSalary) ? undefined : annualSalary,
        standardHours: ordinaryHoursPerWeek,
        calculationType: 'salaried',
      };
    }
    if (calcType === 'hourly' && line.RatePerUnit != null) {
      const hourlyRate = typeof line.RatePerUnit === 'string'
        ? parseFloat(line.RatePerUnit)
        : Number(line.RatePerUnit);
      let standardHours = ordinaryHoursPerWeek;
      if (line.NumberOfUnitsPerWeek != null) {
        const parsed = typeof line.NumberOfUnitsPerWeek === 'string'
          ? parseFloat(line.NumberOfUnitsPerWeek)
          : Number(line.NumberOfUnitsPerWeek);
        if (!isNaN(parsed)) standardHours = parsed;
      }
      return {
        hourlyRate: isNaN(hourlyRate) ? undefined : hourlyRate,
        standardHours,
        calculationType: 'hourly',
      };
    }
  }
  return { standardHours: ordinaryHoursPerWeek };
}

/**
 * Shape of a single employee in the GET /api/Xero/employees response. Mirrors
 * the wire-format JSON returned by route.ts (snake_case, wizard-normalised
 * employment_type). Phase 52-00 added pay_frequency, standard_hours,
 * calculation_type to this shape.
 */
export interface XeroEmployeeApiShape {
  employee_id: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  job_title?: string;
  email?: string;
  start_date?: string;
  termination_date?: string;
  annual_salary?: number;
  hourly_rate?: number;
  hours_per_week?: number;
  standard_hours?: number;
  pay_frequency?: PayFrequency;
  employment_type?: string;
  calculation_type?: 'hourly' | 'salaried';
  is_active: boolean;
  from_xero: boolean;
}

/**
 * The single canonical mapping from a /api/Xero/employees response item to
 * the wizard's TeamMember shape. Used by:
 *   - ForecastWizardV4.tsx first-load auto-import (3 call sites consolidated
 *     in Plan 52-00 to a single helper invocation)
 *   - Plan 52-01 on-demand "Import from Xero" modal handler
 *   - Plan 52-02 re-import path (via mergeXeroEmployeeIntoMember which calls this)
 *
 * Returns the subset of TeamMember fields the helper can populate from Xero
 * (omits id/newSalary/superAmount which the addTeamMember action computes).
 */
export function enrichWizardMemberFromXeroEmployee(
  emp: XeroEmployeeApiShape,
  importedAt: string = new Date().toISOString(),
): Partial<TeamMember> & {
  name: string;
  role: string;
  type: EmploymentType;
  isFromXero: true;
} {
  const type = normaliseXeroEmployment(emp.employment_type);
  const fingerprint = computeXeroFingerprint({
    payFrequency: emp.pay_frequency,
    standardHours: emp.standard_hours,
    hourlyRate: emp.hourly_rate,
    currentSalary: emp.annual_salary,
    hoursPerWeek: emp.hours_per_week,
    type,
    name: emp.full_name,
    role: emp.job_title,
  });
  return {
    name: emp.full_name,
    role: emp.job_title || 'Team member',
    type,
    hoursPerWeek: emp.hours_per_week ?? emp.standard_hours ?? 38,
    hourlyRate: emp.hourly_rate,
    standardHours: emp.standard_hours,
    payFrequency: emp.pay_frequency,
    currentSalary: emp.annual_salary ?? 0,
    isFromXero: true,
    _xeroEmployeeId: emp.employee_id,
    _xeroImportedAt: importedAt,
    _xeroFingerprint: fingerprint,
  };
}

/**
 * Snapshot the current Xero-sourced field values into a JSON-serialisable
 * fingerprint. Used to detect operator edits on re-import (Plan 52-02 will
 * compare current member values vs the fingerprint from last import).
 *
 * Strips `undefined` keys for compactness so the fingerprint round-trips
 * cleanly through localStorage. **Preserves zero values** — currentSalary=0
 * is a meaningful "no annual salary recorded yet" signal for hourly staff
 * and must NOT be stripped (would otherwise look like the field was edited).
 */
export function computeXeroFingerprint(
  values: Partial<XeroFieldFingerprint>,
): XeroFieldFingerprint {
  const result: XeroFieldFingerprint = {};
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined) {
      (result as any)[k] = v;
    }
  }
  return result;
}
