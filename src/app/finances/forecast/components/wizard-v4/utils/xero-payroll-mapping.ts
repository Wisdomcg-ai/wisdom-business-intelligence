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

// ────────────────────────────────────────────────────────────────────────────
// Phase 52-02 — Re-import reconciliation helpers
//
// These pure functions implement Operator's Option D:
//   - findMatchingTeamMember: 3-tier match (id > email > name) — caller iterates
//     `xeroEmployees` and looks up against `teamMembers`, NEVER the reverse
//     (52-RESEARCH Pitfall 6 — manually-added members must stay untouchable).
//   - computeReconciliationDiff: per-field diff classifying each tracked field
//     as 'unchanged' / 'updated-by-xero-only' / 'conflict'.
//   - applyReconciliationDecision: per-field operator decision → Partial<TeamMember>.
//   - applySilentXeroUpdates: batch the silent (no-prompt) updates for one member.
// ────────────────────────────────────────────────────────────────────────────

/**
 * The 7 fields tracked by Xero re-import reconciliation. Source of truth — keep
 * in sync with markFieldOverridden (52-01) and the salary cell + payFrequency
 * dropdown override-stamping in Step4Team.tsx.
 *
 * `name` and `role` participate so a Xero rename or job-title change can be
 * silently applied (operator hasn't typed in the wizard) or surfaced as a
 * conflict (operator has overridden). `type` is included so a part-time → full-
 * time change in Xero gets reconciled the same way.
 */
export const XERO_TRACKED_FIELDS = [
  'name',
  'role',
  'type',
  'payFrequency',
  'standardHours',
  'hourlyRate',
  'currentSalary',
] as const;
export type XeroTrackedField = typeof XERO_TRACKED_FIELDS[number];

export type FieldDiffVerdict = 'unchanged' | 'updated-by-xero-only' | 'conflict';

export interface FieldDiff {
  field: XeroTrackedField;
  currentValue: unknown;
  lastImportedValue: unknown;
  newXeroValue: unknown;
  verdict: FieldDiffVerdict;
}

export interface MemberDiff {
  memberId: TeamMember['id'];
  xeroEmployeeId: string;
  fields: FieldDiff[];
}

export type ReconciliationDecision = 'accept-xero' | 'keep-mine' | 'edit';

/**
 * Phase 52-02 — Match a Xero employee to an existing wizard TeamMember.
 *
 * Strategy (in order of confidence):
 *   1. Exact match on `_xeroEmployeeId` (highest — survives name changes)
 *   2. Case-insensitive email match (if both present)
 *   3. Case-insensitive trimmed full-name match
 *
 * Returns the matched member's `id`, or `undefined` if no match.
 *
 * IMPORTANT: caller iterates `xeroEmployees` and looks up via this function
 * against `teamMembers`. Never iterate `teamMembers` to filter — manually-
 * added rows (no `_xeroEmployeeId`) must stay untouchable. Tier 3 by name does
 * still match manually-added rows by design — the operator can choose to
 * "claim" the row in the modal or skip via [Keep yours].
 */
export function findMatchingTeamMember(
  xeroEmp: { employee_id: string; email?: string; full_name: string },
  teamMembers: ReadonlyArray<{
    id: string;
    name: string;
    _xeroEmployeeId?: string;
    email?: string;
  }>,
): string | undefined {
  // Tier 1: _xeroEmployeeId
  if (xeroEmp.employee_id) {
    const byId = teamMembers.find((m) => m._xeroEmployeeId === xeroEmp.employee_id);
    if (byId) return byId.id;
  }
  // Tier 2: email (case-insensitive)
  if (xeroEmp.email) {
    const xeroEmail = xeroEmp.email.toLowerCase().trim();
    const byEmail = teamMembers.find(
      (m) => m.email && m.email.toLowerCase().trim() === xeroEmail,
    );
    if (byEmail) return byEmail.id;
  }
  // Tier 3: full name (case-insensitive, trimmed)
  if (xeroEmp.full_name) {
    const xeroName = xeroEmp.full_name.toLowerCase().trim();
    const byName = teamMembers.find(
      (m) => m.name.toLowerCase().trim() === xeroName,
    );
    if (byName) return byName.id;
  }
  return undefined;
}

/**
 * Phase 52-02 — Value equality helper for reconciliation diffs.
 *
 *   - `undefined` and `null` are equivalent (both = "absent")
 *   - Numbers compared with 0.005 tolerance (covers float drift on hourly rates
 *     and standard hours; e.g. 45.00 vs 45.001)
 *   - Everything else: strict ===
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 0.005;
  }
  return a === b;
}

/**
 * Phase 52-02 — Compute a per-field diff between the current wizard member,
 * its last-imported fingerprint, and the fresh Xero values. Returns the
 * field list with verdicts.
 *
 * Verdict logic per field:
 *   xeroChanged       = newXeroValue !== lastImportedValue (via valuesEqual)
 *   operatorOverrode  = member._overriddenFields?.includes(field)
 *
 *   - !xeroChanged                          → 'unchanged'   (skip)
 *   - xeroChanged && !operatorOverrode      → 'updated-by-xero-only' (silent apply)
 *   - xeroChanged && operatorOverrode       → 'conflict'    (operator decides)
 */
export function computeReconciliationDiff(
  member: TeamMember,
  freshXeroValues: Partial<Record<XeroTrackedField, unknown>>,
): MemberDiff {
  const fingerprint = member._xeroFingerprint ?? {};
  const overridden = new Set(member._overriddenFields ?? []);
  const fields: FieldDiff[] = XERO_TRACKED_FIELDS.map((field) => {
    const currentValue = (member as any)[field];
    const lastImportedValue = (fingerprint as any)[field];
    const newXeroValue = (freshXeroValues as any)[field];
    const xeroChanged = !valuesEqual(newXeroValue, lastImportedValue);
    const operatorOverrode = overridden.has(field);
    let verdict: FieldDiffVerdict;
    if (!xeroChanged) verdict = 'unchanged';
    else if (!operatorOverrode) verdict = 'updated-by-xero-only';
    else verdict = 'conflict';
    return { field, currentValue, lastImportedValue, newXeroValue, verdict };
  });
  return {
    memberId: member.id,
    xeroEmployeeId: member._xeroEmployeeId ?? '',
    fields,
  };
}

/**
 * Phase 52-02 — Compute the partial member update for a single per-field
 * decision. The fingerprint is ALWAYS refreshed (whether the operator accepts
 * or keeps), so the same conflict will not re-prompt on the next refresh —
 * comparison happens against the now-known Xero state.
 *
 *   accept-xero
 *     - sets field to `newXeroValue`
 *     - removes field from `_overriddenFields` (operator accepted Xero's value)
 *     - updates `_xeroFingerprint[field]` to `newXeroValue`
 *     - bumps `_xeroImportedAt`
 *
 *   keep-mine
 *     - leaves field value untouched (NOT included in the partial)
 *     - ensures field is in `_overriddenFields` (idempotent)
 *     - updates `_xeroFingerprint[field]` to `newXeroValue` (so future re-
 *       imports compare against the now-known Xero state, not the original)
 *     - bumps `_xeroImportedAt`
 *
 *   edit (with operatorValue)
 *     - sets field to `operatorValue` (NOT newXeroValue)
 *     - adds field to `_overriddenFields` (idempotent)
 *     - updates `_xeroFingerprint[field]` to `newXeroValue`
 *     - bumps `_xeroImportedAt`
 */
export function applyReconciliationDecision(
  member: TeamMember,
  field: XeroTrackedField,
  decision: ReconciliationDecision,
  newXeroValue: unknown,
  operatorValue?: unknown,
): Partial<TeamMember> {
  const updatedFingerprint: XeroFieldFingerprint = {
    ...(member._xeroFingerprint ?? {}),
    [field]: newXeroValue,
  } as XeroFieldFingerprint;
  const currentOverrides = member._overriddenFields ?? [];
  const importedAt = new Date().toISOString();

  if (decision === 'accept-xero') {
    return {
      [field]: newXeroValue,
      _xeroFingerprint: updatedFingerprint,
      _overriddenFields: currentOverrides.filter((f) => f !== field),
      _xeroImportedAt: importedAt,
    } as Partial<TeamMember>;
  }
  if (decision === 'keep-mine') {
    return {
      _xeroFingerprint: updatedFingerprint,
      _overriddenFields: currentOverrides.includes(field)
        ? currentOverrides
        : [...currentOverrides, field],
      _xeroImportedAt: importedAt,
    } as Partial<TeamMember>;
  }
  // 'edit'
  return {
    [field]: operatorValue,
    _xeroFingerprint: updatedFingerprint,
    _overriddenFields: currentOverrides.includes(field)
      ? currentOverrides
      : [...currentOverrides, field],
    _xeroImportedAt: importedAt,
  } as Partial<TeamMember>;
}

/**
 * Phase 52-02 — Apply ALL silent (updated-by-xero-only) field updates for one
 * member in a single shot. Returns a Partial<TeamMember> ready to pass to
 * `actions.updateTeamMember`, or `null` if there are no silent updates.
 *
 * Silent updates apply BEFORE the modal renders so the operator only sees
 * genuine conflicts.
 *
 * Fingerprint preservation: untouched fingerprint fields stay intact; only
 * the silently-updated fields advance.
 */
export function applySilentXeroUpdates(
  member: TeamMember,
  diff: MemberDiff,
): Partial<TeamMember> | null {
  const silent = diff.fields.filter((f) => f.verdict === 'updated-by-xero-only');
  if (silent.length === 0) return null;
  const update: Record<string, unknown> = {
    _xeroImportedAt: new Date().toISOString(),
  };
  const fingerprint: XeroFieldFingerprint = { ...(member._xeroFingerprint ?? {}) };
  for (const f of silent) {
    update[f.field] = f.newXeroValue;
    (fingerprint as any)[f.field] = f.newXeroValue;
  }
  update._xeroFingerprint = fingerprint;
  return update as Partial<TeamMember>;
}
