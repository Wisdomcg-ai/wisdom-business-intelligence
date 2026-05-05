# Phase 52: Xero Employee Data Auto-Fill — Research

**Researched:** 2026-05-04
**Domain:** Xero Payroll AU integration → forecast wizard Step 4 auto-fill
**Confidence:** HIGH on existing wizard surface, types, OAuth scopes, rate-limit infra; MEDIUM on Xero Payroll AU JSON field names where I had to triangulate (existing route + xero-node SDK + WebSearch); HIGH on the planning-relevant deltas because the existing employees route is in-tree and partially does the work.

---

## Summary

The phase is **smaller than PHASE.md implies** because most of the plumbing already exists. The current state of the codebase, verified file-by-file:

1. **OAuth scopes already grant Payroll access** (`payroll.employees.read`, `payroll.settings.read`) in `src/app/api/Xero/auth/route.ts:26-30`. No reconnect required for new tenants. Existing tenants connected before payroll scopes were added need a reconnect — the existing route already returns `{ needs_reconnect: true }` on 401.
2. **`/api/Xero/employees` already exists** at `src/app/api/Xero/employees/route.ts` (351 lines). It already fetches `/Employees` + per-employee `/Employees/{id}` from Xero Payroll AU, parses `OrdinaryHoursPerWeek`, `EmploymentType` (mapping `FULLTIME`/`PARTTIME`/`CASUAL`/`CONTRACTOR`/`LABOURHIRE` → wizard types), and reads `PayTemplate.EarningsLines` for `AnnualSalary` + `RatePerUnit`. **What it does NOT do**: fetch `/PayrollCalendars` and join `Employee.PayrollCalendarID` → `PayrollCalendar.CalendarType` to derive `pay_frequency`. That's the primary new API work.
3. **`payFrequency` field already exists** on `TeamMember` and `NewHire` in `src/app/finances/forecast/components/wizard-v4/types.ts:192,213` (verified on `origin/main`; local `main` is 4 commits behind). Step 4 already renders per-row + business-default selectors at `Step4Team.tsx:2138-2154` and `Step4Team.tsx:2654-2677`. Phase 52 needs to **populate** this field, not add it.
4. **`/api/Xero/employees` is consumed by 5 callers today** (`ForecastWizardV4.tsx` lines 119, 492, 1264; `ForecastBuilder.tsx:59`; `QuickEntryMode.tsx:86`; `ForecastCFO.tsx:38`; `ForecastWizardV2.tsx:332`). The wizard already auto-imports employees on first wizard load when `teamMembers` is empty (`ForecastWizardV4.tsx:117-194`). The phase's "Import from Xero" button is **the second-time / on-demand re-import path** that does NOT exist today.

**Primary recommendation:**
- Plan **52-00** = extend `/api/Xero/employees/route.ts` with `pay_frequency` (one new Xero call: `GET /PayrollCalendars`) + add a `xero-payroll-mapping.ts` helper. Add `standardHours`/`hourlyRate` optional fields to `TeamMember`/`NewHire`. Backfill the existing first-load auto-import in `ForecastWizardV4.tsx` so it stops dropping `pay_frequency`/`standardHours`/`hourlyRate`.
- Plan **52-01** = on-demand "Import from Xero" modal in `Step4Team.tsx` with checkbox selection.
- Plan **52-02** = re-import preservation (the only genuinely complex piece — needs per-field provenance tracking).
- **Drop 52-03** as a separate plan; fold the empty-state + 429 UX into 52-01.

This collapses the proposed 4-plan breakdown to **3 plans**.

---

## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for this phase — this is a research-first phase per `.planning/STATE.md:34`. PHASE.md serves as the operator's directive. The locked decisions extracted from PHASE.md:

### Locked Decisions (from PHASE.md)
- **Read-only this phase** — no writes to Xero (PHASE.md "Out of scope")
- **Default tenant only** — multi-tenant consolidation deferred (PHASE.md "Out of scope")
- **OrdinaryEarnings only** — overtime/super/allowances deferred (PHASE.md "Out of scope")
- **No DB schema changes / no migrations** (PHASE.md "Blast Radius")
- **Build on existing `getValidAccessToken(connection, supabase)` helper** — no new auth flow (PHASE.md "Why now")
- **Use existing rate-limit handler `xero-api-client.ts`** — already exists per PHASE.md success criterion 7
- **Last-write-wins per field with "reset to Xero" button** — for re-import flow (PHASE.md "Goal" item 4)

### Claude's Discretion
- Whether to keep annual salary as source of truth or derive from `hourlyRate × standardHours × annualPayPeriodCount` (PHASE.md XERO-S4-04 explicitly punts: *"UI choice: show as derived ... OR keep annual salary as the source of truth"*) — **see Open Questions section, requires operator answer before 52-01 can be planned cleanly**
- Plan breakdown — PHASE.md says "Final plan list confirmed by planner after research"
- UI: modal vs drawer (PHASE.md says either)
- Empty-state polish: separate plan vs folded into UI plan

### Deferred Ideas (OUT OF SCOPE)
- Multi-tenant consolidation
- Writing back to Xero
- Earnings beyond OrdinaryEarnings (overtime, allowances, super)
- Cash-flow timing using `payFrequency` (different feature, downstream of this phase)

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| XERO-S4-01 | Fetch Xero employee list, display in modal/drawer with checkboxes (name, employment type, pay rate, pay frequency) | API endpoint exists at `src/app/api/Xero/employees/route.ts`; needs pay frequency field added (see "Standard Stack → Xero endpoints" below). UI new — pattern in `Step4Team.tsx:2740-2745` (existing `showAddEmployee` modal). |
| XERO-S4-02 | Auto-fill `payFrequency` from `PayrollCalendar.CalendarType` (WEEKLY → weekly, etc.) | Mapping verified against xero-node SDK source `node_modules/xero-node/dist/gen/model/payroll-au/calendarType.d.ts`. New helper `xero-payroll-mapping.ts` recommended (see "Architecture Patterns"). |
| XERO-S4-03 | Auto-fill `standardHours` from `Employee.OrdinaryEarningsRate.NumberOfUnits` × frequency multiplier | Existing route already extracts `OrdinaryHoursPerWeek` (`employees/route.ts:290-293`). Need new optional `standardHours?: number` field on `TeamMember`/`NewHire`. |
| XERO-S4-04 | Auto-fill `hourlyRate` from `EarningsRate.RatePerUnit` | Existing route already extracts `RatePerUnit` (`employees/route.ts:302-303`). `hourlyRate?: number` already exists on `TeamMember`/`NewHire` (`types.ts:153,174`). |
| XERO-S4-05 | Re-import without losing manual edits; reset-to-Xero button | New `_xeroImportedAt` timestamp + per-field provenance recommended — see "Architecture Patterns → Re-import provenance". |

---

## Standard Stack

### Existing (verified in `package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `xero-node` | `^13.0.0` | Type definitions for Payroll AU models | Official Xero SDK; existing route uses raw `fetch()` not the SDK class methods (cleaner for rate-limit handling); we use it for **types only** (e.g. `import type { CalendarType } from 'xero-node'`) |
| `vitest` | `^4.1.4` | Unit tests | Existing test pattern: `vi.mock('@/lib/xero/token-manager')` + `vi.spyOn(global, 'fetch')` (see `src/__tests__/xero/sync-orchestrator.test.ts:36-41`) |
| `@testing-library/react` | `^16.3.2` | Component tests | Existing pattern in `src/__tests__/forecast/phase-51-step4-pt-casual.test.tsx` — uses real `useForecastWizard` hook in a `Step4Harness` |

**No new packages needed.** All Xero plumbing reuses existing helpers:
- `getValidAccessToken(connection, supabase)` — `src/lib/xero/token-manager.ts:53` (auto-refresh + lock + retry)
- `fetchXeroWithRateLimit(url, opts)` — `src/lib/xero/xero-api-client.ts:143` (429 concurrent/minute/daily, 5xx exponential backoff)
- `decrypt(token)` / `encrypt(token)` — `src/lib/utils/encryption.ts` (AES-256-GCM, transparent migration from unencrypted)

### Version verification
The `xero-node` package is used **for type definitions only** in this phase. The existing `/api/Xero/employees` route uses raw `fetch()` (see `route.ts:194-203`), and the rate-limit-aware client `fetchXeroWithRateLimit` also uses raw `fetch`. There is **no need to verify the latest xero-node version** for this phase — we're locked at `^13.0.0` and the type names we depend on (`CalendarType`, `EarningsLine`, `PayTemplate`, `EmploymentBasis`, `EmployeeStatus`) are present.

### Xero Payroll AU endpoints used

| Endpoint | Used by | New in Phase 52? | Rate-limit concern |
|----------|---------|------------------|---------------------|
| `GET /payroll.xro/1.0/Employees` | Existing route line 195 | No | 1 request per import |
| `GET /payroll.xro/1.0/Employees/{id}` | Existing route line 269 | No (but N+1) | **N requests per import** — for 5-30 employees this is the dominant cost. Hits 60 req/min limit at ~50 employees |
| `GET /payroll.xro/1.0/PayrollCalendars` | **New** | Yes | 1 request per import |

**Rate limit math:** Xero AU Payroll API: 60 req/min minute limit, 5000/day daily limit, 5 concurrent. For a 30-person tenant the import is `1 + 30 + 1 = 32 requests`. Well under daily; under minute limit but close enough that **the existing N+1 pattern should be flagged as a known limitation, not refactored in this phase** (refactor to bulk fetch with `?summaryOnly=false` is a deferred optimization — Xero AU Payroll bulk endpoint does NOT include PayTemplate in the list response, so the N+1 is inherent to the API, not the code).

### Xero Payroll AU types reference (verified in `node_modules/xero-node/dist/gen/model/payroll-au/`)

```typescript
// calendarType.d.ts (verified)
export declare enum CalendarType {
    WEEKLY,           // → wizard 'weekly'
    FORTNIGHTLY,      // → wizard 'fortnightly'
    FOURWEEKLY,       // → wizard 'monthly' (closest match; or treat as fortnightly × 2 — see Open Questions)
    MONTHLY,          // → wizard 'monthly'
    TWICEMONTHLY,     // → wizard 'monthly' (2× monthly = ~bimonthly; map to 'monthly' as nearest)
    QUARTERLY         // → wizard 'monthly' (quarterly is rare; nearest 'monthly' for cashflow purposes)
}

// employmentBasis.d.ts (verified — top-level field on Employee in raw JSON, not in SDK class)
export declare enum EmploymentBasis {
    FULLTIME,         // → wizard 'full-time'
    PARTTIME,         // → wizard 'part-time'
    CASUAL,           // → wizard 'casual'
    LABOURHIRE,       // → wizard 'contractor'
    SUPERINCOMESTREAM,// (rare; map to 'contractor' or skip)
    NONEMPLOYEE       // (skip — not a payable employee)
}

// employeeStatus.d.ts (verified)
export declare enum EmployeeStatus {
    ACTIVE,
    TERMINATED        // existing route filters these out unless include_terminated=true
}

// earningsRateCalculationType.d.ts (verified)
export declare enum EarningsRateCalculationType {
    USEEARNINGSRATE,  // hourly — use EarningsRate.ratePerUnit
    ENTEREARNINGSRATE,// hourly — line.ratePerUnit overrides EarningsRate
    ANNUALSALARY      // salaried — use line.annualSalary, no hourly rate
}

// earningsLine.d.ts (verified — fields present on PayTemplate.EarningsLines[])
class EarningsLine {
    earningsRateID: string;
    calculationType?: EarningsRateCalculationType;
    annualSalary?: number;          // ← present iff salaried
    numberOfUnitsPerWeek?: number;  // ← can be source of standardHours
    ratePerUnit?: number;           // ← hourly rate
    normalNumberOfUnits?: number;
    amount?: number;
    numberOfUnits?: number;
    fixedAmount?: number;
}

// payrollCalendar.d.ts (verified)
class PayrollCalendar {
    name?: string;
    calendarType?: CalendarType;
    payrollCalendarID?: string;     // ← join key from Employee.PayrollCalendarID
    startDate?: string;
    paymentDate?: string;
    referenceDate?: string;
}
```

⚠️ **Caveat — JSON-vs-SDK field naming.** The Xero Payroll AU REST API returns JSON with PascalCase keys (`EmployeeID`, `EmploymentBasis`, `OrdinaryHoursPerWeek`, `PayrollCalendarID`, `EarningsLines`, `PayTemplate`, etc.) but the xero-node SDK exposes camelCase. **The existing route uses raw `fetch()` and parses PascalCase JSON directly** (e.g. `route.ts:251 emp.EmployeeID`, `:285 emp.EmploymentType`, `:290 OrdinaryHoursPerWeek`, `:296 PayTemplate`, `:298 EarningsLines`). Phase 52 should follow this pattern — use SDK enums for the `xero-payroll-mapping.ts` helper's input domain, but parse raw JSON.

**Note on `EmploymentBasis` vs `EmploymentType` in the existing route:** The route at `:285` reads `emp.EmploymentType` and maps `FULLTIME/PARTTIME/CASUAL/CONTRACTOR/LABOURHIRE` → wizard types. Per the SDK, the Xero AU Payroll API actually returns this under the field name `EmploymentBasis` (NOT `EmploymentType` — that name in the SDK is the `EMPLOYEE | CONTRACTOR` enum, a different thing). **There may be a latent bug in the existing route**: it's reading `emp.EmploymentType` which may always be undefined. Recommend Phase 52 verify against a live tenant during 52-00 and fix the field name to `emp.EmploymentBasis` if needed. This is a no-risk fix because the fallback is `'full-time'` (`route.ts:286`).

### NZ / UK / US regional differences

- **AU Payroll API** (`/payroll.xro/1.0/`) — what the existing route uses; covers Phase 52's needs.
- **NZ Payroll** (`/payroll.xro/2.0/`) — different schema (`PayRunCalendars` not `PayrollCalendars`; `EmploymentType` enum has different values: `PERMANENT/CASUAL/CONTRACT`).
- **UK Payroll** (`/payroll.xro/2.0/uk/`) — uses `PayRunCalendars` like NZ.
- **US Payroll** — no public API; Xero US doesn't offer payroll.

**Recommendation for Phase 52:** AU only. Existing route is AU-only and PHASE.md scope says nothing about regional support. Document this in the `xero-payroll-mapping.ts` helper as `// TODO(phase-future): NZ/UK Payroll API uses different schema — currently AU only`. The helper signature should be region-agnostic (`mapXeroPayrollCalendarToFrequency(calendarType: string)`) so a future NZ adapter can call into it.

---

## Architecture Patterns

### Recommended file additions

```
src/
├── app/
│   ├── api/
│   │   └── Xero/
│   │       └── employees/
│   │           └── route.ts                     # MODIFY (52-00): add PayrollCalendars fetch + return pay_frequency
│   └── finances/forecast/components/wizard-v4/
│       ├── types.ts                             # MODIFY (52-00): add standardHours? + xeroEmployeeId? + xeroImportedAt? to TeamMember + NewHire
│       ├── steps/
│       │   └── Step4Team.tsx                    # MODIFY (52-01, 52-02): add Import-from-Xero button + modal
│       └── utils/
│           └── xero-payroll-mapping.ts          # NEW (52-00): pure helpers — calendarType→frequency, EarningsLine→{salary, hourlyRate, standardHours}, employee match strategy
└── __tests__/
    ├── xero/
    │   └── employees-route.test.ts              # NEW (52-00): mock fetch + token-manager, assert PayrollCalendars join
    └── forecast/
        ├── phase-52-payroll-mapping.test.ts     # NEW (52-00): pure mapping helper unit tests (~10 cases)
        ├── phase-52-step4-import.test.tsx       # NEW (52-01): modal + checkbox + auto-fill flow
        └── phase-52-step4-reimport.test.tsx     # NEW (52-02): manual-edit preservation + reset-to-Xero
```

### Pattern 1: Pure mapping helper (52-00)

```typescript
// src/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping.ts
// Pure functions — no I/O, no React, no Supabase. Trivially unit-testable.

import type { PayFrequency, TeamMember } from '../types';

/**
 * Maps Xero Payroll AU CalendarType (PascalCase from JSON) to wizard PayFrequency.
 * Verified against node_modules/xero-node/dist/gen/model/payroll-au/calendarType.d.ts.
 * FOURWEEKLY/TWICEMONTHLY/QUARTERLY are rare — collapse to 'monthly' as nearest cashflow approximation.
 */
export function mapXeroCalendarTypeToPayFrequency(
  calendarType: string | undefined | null,
): PayFrequency | undefined {
  if (!calendarType) return undefined;
  switch (calendarType.toUpperCase()) {
    case 'WEEKLY': return 'weekly';
    case 'FORTNIGHTLY': return 'fortnightly';
    case 'FOURWEEKLY':
    case 'TWICEMONTHLY':
    case 'MONTHLY':
    case 'QUARTERLY': return 'monthly';
    default: return undefined;  // unknown — let UI fall back to defaultPayFrequency
  }
}

/**
 * Extract { hourlyRate, annualSalary, standardHours } from a Xero EarningsLines[].
 * Salaried employees: ANNUALSALARY calculation type → annualSalary set, hourlyRate undefined.
 * Hourly employees: USEEARNINGSRATE/ENTEREARNINGSRATE → ratePerUnit set, annualSalary undefined.
 */
export function extractCompensationFromPayTemplate(
  earningsLines: any[] | undefined,
  ordinaryEarningsRateID: string | undefined,
): { hourlyRate?: number; annualSalary?: number; standardHours?: number } { ... }

/**
 * Match a Xero employee to an existing wizard TeamMember.
 * Strategy (in order of confidence):
 *   1. Exact match on stored xeroEmployeeId (set on prior import)
 *   2. Case-insensitive email match (if both present)
 *   3. Case-insensitive full-name match
 *   4. No match → import as new
 */
export function findMatchingTeamMember(
  xeroEmployee: { employee_id: string; email?: string; full_name: string },
  teamMembers: TeamMember[],
): TeamMember | undefined { ... }
```

**Why this pattern:** isolates all Xero-knowledge in one pure-function module that's trivially testable (no fetch mocking, no React harness). Mirrors the existing `src/app/finances/forecast/components/wizard-v4/utils/opex-classifier.ts` and `parsePLFile.ts` siblings.

### Pattern 2: Re-import provenance tracking (52-02)

Two new optional fields on `TeamMember` + `NewHire`:

```typescript
// types.ts additions (52-00 lays the type, 52-02 uses it)
export interface TeamMember {
  // ... existing fields
  standardHours?: number;        // NEW — hours per pay period from Xero
  _xeroEmployeeId?: string;      // NEW — Xero EmployeeID for re-import matching
  _xeroImportedAt?: string;      // NEW — ISO timestamp of last import; presence indicates this row was Xero-sourced
  _xeroFieldFingerprint?: {      // NEW — hash of last-imported values per field for "has user edited?" detection
    payFrequency?: string;
    standardHours?: string;
    hourlyRate?: string;
    currentSalary?: string;
    name?: string;
    role?: string;
  };
}
```

**Re-import algorithm (XERO-S4-05):**

```
For each Xero employee in the new fetch:
  match = findMatchingTeamMember(xeroEmp, state.teamMembers)
  if !match:
    addTeamMember({...xeroDerived, _xeroEmployeeId, _xeroImportedAt, _xeroFieldFingerprint})
  else:
    For each field {payFrequency, standardHours, hourlyRate, currentSalary}:
      currentValue = match[field]
      lastImportedHash = match._xeroFieldFingerprint?.[field]
      currentValueHash = hash(currentValue)
      if lastImportedHash === currentValueHash:
        # User has NOT edited this field since last import → safe to update
        updateTeamMember(match.id, { [field]: newXeroValue })
      else:
        # User edited → preserve (last-write-wins, manual edit wins)
        skip
    Update _xeroImportedAt + _xeroFieldFingerprint (recompute against new values)

"Reset all to Xero" button: ignore fingerprint, force-overwrite all 4 fields.
```

**Why fingerprinting and not "first-imported" snapshot:** because the "preserved manual edit" semantic is *relative to the last import*, not the first. If user edits salary, then re-imports (salary preserved, fingerprint updated), then user re-edits salary, then re-imports again — the second edit must also be preserved. Comparing current value to "last imported value" handles this.

### Pattern 3: Inline modal (52-01)

```tsx
// Step4Team.tsx — copy the existing showAddEmployee modal pattern (line 2740-2745)
const [showXeroImport, setShowXeroImport] = useState(false);
const [xeroEmployees, setXeroEmployees] = useState<XeroEmployee[] | null>(null);
const [importLoading, setImportLoading] = useState(false);

// Button placement: in the Team Members section header, next to "Add Current" / "Plan Hire"
// at Step4Team.tsx:2688-2703.
<button
  onClick={async () => {
    setImportLoading(true);
    setShowXeroImport(true);
    const res = await fetch(`/api/Xero/employees?business_id=${businessId}`);
    const data = await res.json();
    setXeroEmployees(data.employees || []);
    setImportLoading(false);
  }}
  disabled={!hasXeroConnection}  // disabled-state for empty-state polish (XERO-S4 success #6)
  className="..."
>
  <DownloadCloud className="w-4 h-4" />
  Import from Xero
</button>

{showXeroImport && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    {/* checkbox list of xeroEmployees, "Import N selected" CTA, close X */}
  </div>
)}
```

### Anti-patterns to avoid

- **Don't add a new auth flow.** Use `getValidAccessToken(connection, supabase)` exclusively. The existing route at `route.ts:158` is the canonical pattern.
- **Don't bypass `fetchXeroWithRateLimit`.** The existing employees route at `route.ts:194-203,268-277` calls raw `fetch()` without rate-limit handling — this is a **pre-existing technical debt**, not a Phase 52 requirement to fix. *However*, when adding the new `/PayrollCalendars` call, use `fetchXeroWithRateLimit` to set the precedent for new code. The N+1 `/Employees/{id}` loop is harder to refactor without breaking the existing first-load path; leave for a future plan.
- **Don't write to `xero_connections`.** Token refresh writes there; Phase 52 only reads.
- **Don't compute annual salary on the API side.** The wizard already computes salary from `hourlyRate × hours × weeks` for casuals (`Step4Team.tsx:71`). Pass through Xero raw values; let the wizard do the math. This avoids the salary-derivation Open Question becoming a server-side concern.
- **Don't break the first-load auto-import.** `ForecastWizardV4.tsx:117-194` auto-imports employees on first wizard open. The Phase 52 changes (new optional fields) must NOT break this code path — verify by ensuring `from_xero` field is still set and the existing `addTeamMember(...)` call still works.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Xero token refresh | Custom OAuth flow | `getValidAccessToken(connection, supabase)` (`token-manager.ts:53`) | Race-condition lock, retry-with-backoff, encrypted storage, error categorization (60-day refresh expiry, revoked, network, server) all already handled |
| Xero rate-limit handling | Custom 429 retry loop | `fetchXeroWithRateLimit(url, opts)` (`xero-api-client.ts:143`) | Handles concurrent / minute / daily 429 problems separately, exponential backoff for 5xx, Sentry breadcrumbs, AbortSignal support |
| Xero connection lookup (multi-format business_id) | Custom Supabase queries | Copy the 4-tier lookup from `employees/route.ts:78-146` | Handles `businesses.id` ↔ `business_profiles.id` resolution and any-active-connection fallback. **CONSIDER extracting this to a shared helper in 52-00** since 5+ routes duplicate it (sync-all, pl-summary, employees, balance-sheet) — but flag this as an opportunistic refactor, not a Phase 52 requirement. |
| AES encryption of stored secrets | Custom crypto | `encrypt()` / `decrypt()` (`encryption.ts`) | Already AES-256-GCM with PBKDF2 fallback; transparent migration from plaintext |
| Modal/dialog | Pull in `@radix-ui/react-dialog` or similar | Inline `fixed inset-0 bg-black bg-opacity-50` div, matching existing 7+ inline modals in `Step4Team.tsx` | The codebase has no global Modal component; existing patterns work fine |
| PayrollCalendar→PayFrequency mapping | Inline switch in route handler | `mapXeroCalendarTypeToPayFrequency()` in `xero-payroll-mapping.ts` | Pure, testable, reusable for future NZ/UK adapters; PHASE.md XERO-S4-02 explicitly requests "store the mapping in a small `xero-payroll-mapping.ts` helper" |
| Employee match strategy (re-import) | Per-call inline matching logic | `findMatchingTeamMember()` in `xero-payroll-mapping.ts` | Pure function; explicit strategy ordering (xeroEmployeeId > email > name); reusable for any future "sync from Xero" feature |

**Key insight:** The Xero integration in this codebase is mature. Phase 52 is a small extension on top of well-tested plumbing. **Resist the urge to refactor the existing employees route during Phase 52** — the N+1 fetch, the missing rate-limit-handler usage, the `EmploymentType` vs `EmploymentBasis` field name suspicion — those are all worth documenting as deferred items but NOT worth blocking this phase.

---

## Common Pitfalls

### Pitfall 1: Existing first-load auto-import already does most of the work
**What goes wrong:** Planner thinks Phase 52 is greenfield; duplicates the auto-fill logic in two paths (existing first-load in `ForecastWizardV4.tsx:174-191` AND new "Import from Xero" button in `Step4Team.tsx`).
**Why it happens:** PHASE.md doesn't mention the existing auto-import. It's documented as `needsTeam = !state.teamMembers || state.teamMembers.length === 0` gating in `ForecastWizardV4.tsx:117`.
**How to avoid:** Plan 52-00 must update **both** entry paths — the existing first-load mapper at `:174-191` AND the new on-demand modal in 52-01. They should call the same `enrichWizardMemberFromXeroEmployee(xeroEmp)` helper.
**Warning signs:** PR diffs that touch `Step4Team.tsx` but not `ForecastWizardV4.tsx`. Or vice versa.

### Pitfall 2: `EmploymentType` vs `EmploymentBasis` field name confusion
**What goes wrong:** The existing route reads `emp.EmploymentType` (`route.ts:285`) but Xero AU's actual JSON returns `EmploymentBasis`. Plan 52-00 ports this bug forward.
**Why it happens:** xero-node SDK has BOTH `EmploymentType` (enum: `EMPLOYEE|CONTRACTOR`) and `EmploymentBasis` (enum: `FULLTIME|PARTTIME|CASUAL|...`). The names are easy to mix up.
**How to avoid:** Plan 52-00 should add a one-line "verify against live tenant" task that logs the raw response keys before mapping, and switches to the correct field name. Existing fallback at `route.ts:286` (`|| 'full-time'`) means current users see "full-time" for everyone — operator may have noticed but not flagged it.
**Warning signs:** Imported employees all show "full-time" type regardless of what they are in Xero.

### Pitfall 3: PayrollCalendars vs Employee.PayrollCalendarID join
**What goes wrong:** Plan tries to fetch one PayrollCalendar per employee (N+1 again).
**Why it happens:** It's tempting to fetch `/PayrollCalendars/{id}` per employee.
**How to avoid:** Fetch `/PayrollCalendars` ONCE (returns all calendars for the tenant — typically 1-3) and build a `Map<payrollCalendarID, calendarType>`. Then look up each employee's calendar by ID. Adds 1 request per import, not N.
**Warning signs:** Code that calls `/PayrollCalendars/{id}` inside a loop.

### Pitfall 4: Salaried employees have no hourlyRate
**What goes wrong:** UI shows `$0/hr` for salaried staff or fails to derive standardHours.
**Why it happens:** A `EarningsLine` with `calculationType === 'ANNUALSALARY'` has `annualSalary` set but `ratePerUnit` and `numberOfUnitsPerWeek` are typically undefined.
**How to avoid:** `extractCompensationFromPayTemplate()` returns `{ annualSalary, hourlyRate?, standardHours? }` with all-optional shape. UI must gracefully render "—" when `hourlyRate` is undefined. For salaried, derive `standardHours` from the tenant's typical full-time week (38 in AU) only if explicitly requested by operator — see Open Questions.
**Warning signs:** Tests that assume every employee has `hourlyRate`.

### Pitfall 5: Xero connection lookup is duplicated across 5+ routes
**What goes wrong:** Plan 52-00 adds a 6th implementation of the 4-tier business_id lookup.
**Why it happens:** No shared helper exists despite the pattern appearing in `employees/route.ts:78-146`, `pl-summary/`, `sync-all/`, `chart-of-accounts-full/`, `balance-sheet/`.
**How to avoid:** Either (a) extract to `src/lib/xero/connection-lookup.ts` as part of 52-00 (low risk, high value), or (b) explicitly document the duplication in the plan and defer the refactor.
**Warning signs:** Sixth identical "Try 1...Try 4" block in a route handler.

### Pitfall 6: Re-import wipes manually-added (non-Xero) team members
**What goes wrong:** Re-import iterates `xeroEmployees`, finds no match for manually-added contractor "Mary the Bookkeeper", does NOTHING — but if the implementation iterates `state.teamMembers` instead and removes those without a Xero match, it would delete Mary.
**Why it happens:** Confusion about which list drives the merge.
**How to avoid:** **Always iterate `xeroEmployees` and either match-and-update OR add-new. NEVER iterate `state.teamMembers` to filter.** Manually-added members (where `_xeroEmployeeId === undefined`) are untouchable by re-import.
**Warning signs:** Code that calls `removeTeamMember()` during a re-import.

---

## Code Examples

### Fetch + join PayrollCalendars to Employee (verified pattern)

```typescript
// In src/app/api/Xero/employees/route.ts (52-00 modification)
import { fetchXeroWithRateLimit } from '@/lib/xero/xero-api-client';
import { mapXeroCalendarTypeToPayFrequency } from '@/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping';

// 1. Fetch all PayrollCalendars for the tenant (single request, cached for the duration of this handler)
const calendarsRes = await fetchXeroWithRateLimit(
  'https://api.xero.com/payroll.xro/1.0/PayrollCalendars',
  { accessToken, tenantId: connection.tenant_id },
);
const calendarById = new Map<string, string>();
for (const cal of calendarsRes.json?.PayrollCalendars ?? []) {
  if (cal.PayrollCalendarID && cal.CalendarType) {
    calendarById.set(cal.PayrollCalendarID, cal.CalendarType);
  }
}

// 2. In the existing per-employee loop (route.ts:267-311), after parsing PayTemplate:
const payrollCalendarID = employeeDetail.PayrollCalendarID;
const calendarType = payrollCalendarID ? calendarById.get(payrollCalendarID) : undefined;
const payFrequency = mapXeroCalendarTypeToPayFrequency(calendarType);

// 3. Add to the response object:
employees.push({
  // ... existing fields
  pay_frequency: payFrequency,
});
```

### Test pattern (52-00 — pure mapping helper)

```typescript
// src/__tests__/forecast/phase-52-payroll-mapping.test.ts
import { describe, it, expect } from 'vitest';
import {
  mapXeroCalendarTypeToPayFrequency,
  extractCompensationFromPayTemplate,
  findMatchingTeamMember,
} from '@/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping';

describe('mapXeroCalendarTypeToPayFrequency', () => {
  it.each([
    ['WEEKLY', 'weekly'],
    ['FORTNIGHTLY', 'fortnightly'],
    ['FOURWEEKLY', 'monthly'],
    ['MONTHLY', 'monthly'],
    ['TWICEMONTHLY', 'monthly'],
    ['QUARTERLY', 'monthly'],
    ['weekly', 'weekly'],          // case insensitivity
    [undefined, undefined],
    [null, undefined],
    ['UNKNOWN_NEW_VALUE', undefined],
  ])('maps %s → %s', (input, expected) => {
    expect(mapXeroCalendarTypeToPayFrequency(input as any)).toBe(expected);
  });
});
```

### Test pattern (52-00 — API route with mocked fetch)

```typescript
// src/__tests__/xero/employees-route.test.ts (mirrors src/__tests__/xero/sync-orchestrator.test.ts pattern)
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/xero/token-manager', () => ({
  getValidAccessToken: vi.fn(async () => ({ success: true, accessToken: 'tok' })),
}));
vi.mock('@/lib/utils/encryption', () => ({
  decrypt: (s: string) => s,
  encrypt: (s: string) => s,
}));
// Mock supabase to return a single active connection...

describe('GET /api/Xero/employees', () => {
  it('joins PayrollCalendars to populate pay_frequency', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeJsonResponse({ PayrollCalendars: [
        { PayrollCalendarID: 'cal-1', CalendarType: 'FORTNIGHTLY' },
      ]}))
      .mockResolvedValueOnce(makeJsonResponse({ Employees: [
        { EmployeeID: 'emp-1', FirstName: 'Pat', LastName: 'Test', Status: 'ACTIVE' },
      ]}))
      .mockResolvedValueOnce(makeJsonResponse({ Employees: [{
        EmployeeID: 'emp-1', PayrollCalendarID: 'cal-1', EmploymentBasis: 'FULLTIME',
        PayTemplate: { EarningsLines: [{ EarningsRateID: 'er-1', AnnualSalary: 80000, CalculationType: 'ANNUALSALARY' }] },
      }]}));
    // ...
    const res = await GET(request);
    const data = await res.json();
    expect(data.employees[0].pay_frequency).toBe('fortnightly');
  });
});
```

### Test pattern (52-01/52-02 — Step4 component with real hook)

```typescript
// Mirrors src/__tests__/forecast/phase-51-step4-pt-casual.test.tsx
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';
import { Step4Team } from '@/app/finances/forecast/components/wizard-v4/steps/Step4Team';

// Mock global.fetch to return a canned /api/Xero/employees response
// Render <Step4Team> via Step4Harness (existing pattern)
// Click "Import from Xero" → assert modal opens with 3 employees
// Tick 2 checkboxes → click "Import 2 selected"
// Assert wizard.state.teamMembers length grew by 2 with correct payFrequency, hourlyRate, etc.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline `fetch + sleep(300ms)` for rate limit | `fetchXeroWithRateLimit` helper | Phase 44.2-06B (`xero-api-client.ts`) | All NEW Xero calls in Phase 52 should use this helper |
| Plain-text token storage | AES-256-GCM via `encrypt()`/`decrypt()` | Phase 46-02 | Phase 52 reuses transparent decryption — no action needed |
| Sequential token refresh (race conditions) | DB-locked refresh via `token_refreshing_at` | Phase 44.x token-manager rewrite | Multi-process safety; Phase 52 inherits |
| `EmploymentType` field on employee (existing route) | Likely should be `EmploymentBasis` | Pre-existing latent bug | Recommend 52-00 verify against live tenant |

**Deprecated/outdated:**
- The `EMPLOYMENT_TYPE_MAP` constant in `employees/route.ts:38-44` is correct in its mapping (`FULLTIME → 'full-time'`, etc.), but it's keyed off the wrong field name (see Pitfall 2). The map itself is reusable; only the field name is wrong.

---

## Open Questions

### 1. Salary derivation policy (REQUIRES OPERATOR DECISION before 52-01 can be planned)

**The core question:** When a Xero employee has `hourlyRate=$50`, `standardHours=38`, `payFrequency=fortnightly`, the *derived* annual salary is `$50 × 38 × 52 = $98,800`. The wizard today (`Step4Team.tsx:71` `calculateCasualAnnual`) only auto-calculates for casuals — full-time/part-time use a separately-entered `currentSalary`.

**For salaried employees** (Xero `CalculationType=ANNUALSALARY` with `annualSalary=$98,800` set explicitly), Xero gives us the annual salary directly — no derivation needed.

**For hourly employees** (Xero `CalculationType=USEEARNINGSRATE`), Xero gives us hourly rate + hours per week — the wizard needs to either compute annual salary or store both and let the user pick which is the source of truth.

**Three options for the wizard:**

- **Option A — Override on import.** Wizard's annual salary always reflects the most-recent Xero-derived value: `hourlyRate × standardHours × annualPayPeriodCount`. The wizard becomes a "view of Xero" for these fields. Manual edits to salary persist until the next re-import (per the XERO-S4-05 preservation logic).
- **Option B — Display hint, keep manual as truth.** Show "Xero suggests $98,800/yr" as a small hint next to the salary input. The user-entered annual salary is always the source of truth. Re-import does NOT touch the salary field.
- **Option C — Per-import operator choice.** Modal shows checkbox: "Also update annual salary from hourly rate × hours" — operator can choose at import time per-employee.

**Researcher's recommendation:** **Option A for hourly employees, Option B for salaried.** Rationale: for hourly staff, the hourly rate IS the source of truth in Xero (operator changes it during pay reviews); deriving salary keeps the two systems in sync. For salaried staff, Xero stores the annual figure directly — no derivation, just import the value Xero already has. This matches PHASE.md XERO-S4-04's first-listed option ("show as derived").

**This decision affects 52-01 plan structure** — Option C would require additional UI complexity in the import modal. **Operator must answer before 52-01 PLAN.md can be written.**

### 2. Salaried employee handling — what counts as "standardHours"?

For a salaried employee with `CalculationType=ANNUALSALARY`, Xero typically does NOT populate `numberOfUnitsPerWeek` on the `EarningsLine` (it's only populated when calculation depends on units). Yet the wizard's UI shows "standard hours" as a per-row field for cashflow reasoning.

**Options:**
- **A.** Default salaried to `standardHours = 38` (AU full-time standard) and surface as editable.
- **B.** Leave `standardHours` undefined for salaried; wizard hides the field.
- **C.** Try to read `Employee.OrdinaryHoursPerWeek` (a top-level field on Employee, distinct from EarningsLine — the existing route already extracts this at `:290`).

**Researcher's recommendation:** **Option C is correct** — the existing route already reads `OrdinaryHoursPerWeek` for ALL employees (salaried or hourly), and that field IS populated for salaried employees in Xero AU (it's the "Ordinary hours per week" input on the Xero employment tab). So `standardHours` should come from `OrdinaryHoursPerWeek` for everyone, with hourly-rate-employee derivation as a fallback if `OrdinaryHoursPerWeek` is missing.

**No operator decision needed** — this is a pure technical question with a clear answer.

### 3. New hires with planned start dates from Xero

Xero stores `Employee.StartDate` for everyone. For an employee with `StartDate > today`, are they a "current Team Member" (TeamMember) or a "Planned Hire" (NewHire)?

**Researcher's recommendation:** Pure technical heuristic — if `StartDate > today + 7 days`, treat as `NewHire` with `startMonth` set from `StartDate`. Otherwise `TeamMember`. **Mention this in 52-01 plan; doesn't need operator input.**

### 4. Multi-tenant employees (NOT IN SCOPE per PHASE.md but worth flagging)

Some operators have employees in multiple Xero tenants (e.g. group structure). Phase 52 fetches from default tenant only. If an employee exists in tenants A and B with different pay rates, the import will only show tenant A's data. **Document this in the empty state of the import modal** ("Showing employees from {tenantName} only") so operator isn't confused.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `xero-node` package | Type imports for CalendarType, EmploymentBasis enums | ✓ | `^13.0.0` | — |
| `vitest` | All new tests | ✓ | `^4.1.4` | — |
| `@testing-library/react` | Step4 component tests | ✓ | `^16.3.2` | — |
| Live Xero tenant for verification | Verifying `EmploymentBasis` vs `EmploymentType` field name (Pitfall 2) | Operator has 18+ tenants per MEMORY.md | — | If unavailable: skip the field-name fix, plan a follow-up |
| Existing `xero_connections` table with `payroll.*` scopes | Any test against a real tenant | Operator-side | — | Mocked in unit tests; manual smoke test for live verification |
| `APP_SECRET_KEY` env var | Decrypting stored access tokens | ✓ (per Phase 46-02) | — | Falls back to `SUPABASE_SERVICE_KEY` via PBKDF2 |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run src/__tests__/forecast/phase-52-* src/__tests__/xero/employees-route.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| XERO-S4-01 | API returns employee list with `pay_frequency` populated | unit (route handler with mocked fetch) | `npx vitest run src/__tests__/xero/employees-route.test.ts -t "joins PayrollCalendars"` | ❌ Wave 0 |
| XERO-S4-01 | UI: button click opens modal showing employee names | component (Step4Harness) | `npx vitest run src/__tests__/forecast/phase-52-step4-import.test.tsx -t "modal shows employees"` | ❌ Wave 0 |
| XERO-S4-02 | `mapXeroCalendarTypeToPayFrequency('FORTNIGHTLY') === 'fortnightly'` | unit (pure function) | `npx vitest run src/__tests__/forecast/phase-52-payroll-mapping.test.ts -t "FORTNIGHTLY"` | ❌ Wave 0 |
| XERO-S4-03 | TeamMember.standardHours populated from Xero | component (mocked fetch + real hook) | `npx vitest run src/__tests__/forecast/phase-52-step4-import.test.tsx -t "standardHours"` | ❌ Wave 0 |
| XERO-S4-04 | TeamMember.hourlyRate populated from Xero | component | same file as above, `-t "hourlyRate"` | ❌ Wave 0 |
| XERO-S4-05 | Manual edit preserved on re-import | component | `npx vitest run src/__tests__/forecast/phase-52-step4-reimport.test.tsx -t "preserves manual edit"` | ❌ Wave 0 |
| XERO-S4-05 | "Reset to Xero" button restores Xero values | component | same file, `-t "reset to Xero"` | ❌ Wave 0 |
| Empty state | Disabled button when no Xero connection | component | `npx vitest run src/__tests__/forecast/phase-52-step4-import.test.tsx -t "disabled when no connection"` | ❌ Wave 0 |
| Rate limit (operational) | API surfaces friendly 429 error | manual | — | Manual smoke test against live tenant |

### Sampling Rate
- **Per task commit:** `npx vitest run <changed test files>` (under 10s)
- **Per wave merge:** `npx vitest run src/__tests__/forecast/ src/__tests__/xero/` (~30-60s)
- **Phase gate:** `npm test` + `npm run lint` + `npm run typecheck` + `npm run build` (CI)

### Wave 0 Gaps
- [ ] `src/__tests__/forecast/phase-52-payroll-mapping.test.ts` — covers XERO-S4-02
- [ ] `src/__tests__/xero/employees-route.test.ts` — covers XERO-S4-01 (API side)
- [ ] `src/__tests__/forecast/phase-52-step4-import.test.tsx` — covers XERO-S4-01 (UI), XERO-S4-03, XERO-S4-04, empty state
- [ ] `src/__tests__/forecast/phase-52-step4-reimport.test.tsx` — covers XERO-S4-05
- [ ] No framework install needed (vitest already configured)

---

## Recommended Plan Breakdown

**3 plans, not 4. Here's why:**

### Plan 52-00 — API + types + helpers (foundation)
**Files modified:**
- `src/app/finances/forecast/components/wizard-v4/types.ts` (+~12 lines: `standardHours?`, `_xeroEmployeeId?`, `_xeroImportedAt?`, `_xeroFieldFingerprint?` on TeamMember + NewHire)
- `src/app/api/Xero/employees/route.ts` (+~50 lines: PayrollCalendars fetch, calendar map, `pay_frequency` in response, fix `EmploymentBasis` field name)
- `src/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping.ts` (NEW ~120 lines: 3 pure helpers)
- `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` (+~10 lines: pass through new fields in the existing first-load auto-import path at lines 174-191, 786-797, 1354-1366)
- `src/__tests__/forecast/phase-52-payroll-mapping.test.ts` (NEW)
- `src/__tests__/xero/employees-route.test.ts` (NEW)

**Why bundled (not split into 52-00-API + 52-01-UI):** the API change is too small to be its own plan (50 lines), and the UI plan (52-01) NEEDS the new `pay_frequency` field on the response to even work. Splitting creates an artificial sequencing constraint with no review benefit.

**Risk:** Low — additive optional fields, zero schema migration, tests fully coverable with mocks.

### Plan 52-01 — On-demand "Import from Xero" UI in Step 4
**Files modified:**
- `src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx` (+~150-200 lines: new button in Team Members section header, new modal component, checkbox selection state, "Import N selected" handler, empty-state polish for no-connection case)
- `src/__tests__/forecast/phase-52-step4-import.test.tsx` (NEW)

**Why this is its own plan:** ~200 LOC of UI in a 3,190-line file is non-trivial. Reviewer needs to focus on UX (modal interaction, checkbox state, loading/error states) without API noise. Empty-state polish (PHASE.md proposed 52-03) folds in here naturally — it's a 1-line `disabled={!hasConnection}` plus a tooltip wrapper.

**Risk:** Medium — UI complexity, accessibility (modal focus trap), keyboard navigation. Mitigated by following the existing AddEmployee modal pattern.

**Blocker:** Requires Open Question 1 (salary derivation policy) answered.

### Plan 52-02 — Re-import flow with manual-edit preservation (XERO-S4-05)
**Files modified:**
- `src/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping.ts` (+~60 lines: `mergeXeroEmployeeIntoMember(xeroEmp, existing)` function with fingerprint logic)
- `src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx` (+~50 lines: "Reset to Xero" button per row, re-import handler that uses merge-vs-add logic)
- `src/__tests__/forecast/phase-52-step4-reimport.test.tsx` (NEW)

**Why this is its own plan:** Genuinely complex — fingerprint hashing, per-field comparison, "what counts as user-edited", reset semantics. PHASE.md success criterion #5 ("Re-import preserves manual edits") is the highest-risk requirement. Worth its own focused review.

**Risk:** Medium-high — semantic correctness depends on fingerprint algorithm. Test coverage must include: edit-then-reimport, reimport-then-edit-then-reimport, reset-button-when-no-changes, reset-button-after-edit.

### Why 52-03 (empty-state polish) folds into 52-01
The "disabled button + tooltip" empty state is **3 lines of JSX** in the same Team Members header where the import button lives. Splitting it out creates a PR with zero real content. Same for the rate-limit error UX — it's an `if (data.error?.includes('rate limit')) toast.error(...)` in the import handler.

### Cross-plan dependencies
- 52-01 depends on 52-00 (needs new `pay_frequency` field on API response + new types)
- 52-02 depends on 52-01 (needs the import modal to test re-import)
- 52-00 has no dependencies; can ship first

### Recommended merge order
1. 52-00 (foundation — merges first, tests run green in isolation)
2. 52-01 (UI — depends on 52-00 fields)
3. 52-02 (re-import — depends on 52-01 modal infrastructure)

All three could ship within a single sprint. Each PR small enough for thorough review.

---

## Recommended Shared Helpers

The following should be extracted to `src/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping.ts` in plan 52-00:

| Helper | Signature | Tested in |
|--------|-----------|-----------|
| `mapXeroCalendarTypeToPayFrequency` | `(calendarType: string \| undefined \| null) => PayFrequency \| undefined` | 52-00 unit tests |
| `mapXeroEmploymentBasisToWizardType` | `(basis: string \| undefined) => EmploymentType` | 52-00 unit tests (currently inline in `EMPLOYMENT_TYPE_MAP` at `route.ts:38-44`; extract to helper) |
| `extractCompensationFromPayTemplate` | `(earningsLines: any[] \| undefined, ordinaryEarningsRateID: string \| undefined) => { hourlyRate?: number; annualSalary?: number; standardHours?: number }` | 52-00 unit tests |
| `enrichWizardMemberFromXeroEmployee` | `(xeroEmp: XeroEmployeeResponseShape) => Pick<TeamMember, 'name' \| 'role' \| 'type' \| 'currentSalary' \| 'hoursPerWeek' \| 'hourlyRate' \| 'standardHours' \| 'payFrequency' \| 'isFromXero'> & { _xeroEmployeeId: string; _xeroImportedAt: string }` | 52-00 unit tests; consumed by both ForecastWizardV4.tsx first-load and Step4Team.tsx on-demand import |
| `findMatchingTeamMember` | `(xeroEmp: { employee_id: string; email?: string; full_name: string }, teamMembers: TeamMember[]) => TeamMember \| undefined` | 52-00 unit tests |
| `mergeXeroEmployeeIntoMember` | `(xeroEnriched: ReturnType<typeof enrichWizardMemberFromXeroEmployee>, existing: TeamMember) => Partial<TeamMember>` | 52-02 unit tests (complex — fingerprint logic) |
| `computeXeroFieldFingerprint` | `(member: Pick<TeamMember, 'payFrequency' \| 'standardHours' \| 'hourlyRate' \| 'currentSalary'>) => Required<TeamMember>['_xeroFieldFingerprint']` | 52-02 unit tests |

**Optional opportunistic refactor (52-00 or deferred):**

| Helper | Signature | Why |
|--------|-----------|-----|
| `findActiveXeroConnection` | `(business_id: string, supabase: SupabaseClient) => Promise<XeroConnection \| null>` | Extract the 4-tier lookup duplicated across 5+ routes (`employees/route.ts:78-146`, etc.) |

---

## Sources

### Primary (HIGH confidence)
- **xero-node SDK type definitions** — `node_modules/xero-node/dist/gen/model/payroll-au/calendarType.d.ts`, `employee.d.ts`, `earningsLine.d.ts`, `earningsRateCalculationType.d.ts`, `payTemplate.d.ts`, `payrollCalendar.d.ts`, `employmentBasis.d.ts`, `employeeStatus.d.ts`, `rateType.d.ts`, `incomeType.d.ts` — verified verbatim in this research
- **Existing employees route** — `src/app/api/Xero/employees/route.ts` (full read, 351 lines)
- **Token manager** — `src/lib/xero/token-manager.ts` (full read, 407 lines)
- **Rate-limit client** — `src/lib/xero/xero-api-client.ts` (full read, 268 lines)
- **Encryption** — `src/lib/utils/encryption.ts` (full read, 228 lines)
- **Wizard types** — `git show origin/main:src/app/finances/forecast/components/wizard-v4/types.ts` (777 lines)
- **Step4 component** — `git show origin/main:src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx` (3,190 lines, key sections read)
- **Hook actions** — `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts` (lines 459-540)
- **Existing test patterns** — `src/__tests__/xero/sync-orchestrator.test.ts`, `src/__tests__/xero/xero-api-client-rate-limit.test.ts`, `src/__tests__/forecast/phase-51-step4-pt-casual.test.tsx`
- **OAuth scope config** — `src/app/api/Xero/auth/route.ts:19-31`
- **Phase 51-04b plan (predecessor)** — `.planning/phases/51-forecast-wizard-ux/51-04b-PLAN.md`

### Secondary (MEDIUM confidence)
- [Xero Payroll AU API — PayrollCalendars](https://developer.xero.com/documentation/api/payrollau/payrollcalendars) — referenced for endpoint URL and join semantics; WebFetch timed out, search results confirmed CalendarType enum
- [Xero Payroll AU API — Employees](https://developer.xero.com/documentation/api/payrollau/employees) — referenced for endpoint URL and Employee field shape; WebFetch timed out
- [Xero-OpenAPI / xero-payroll-au.yaml](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-payroll-au.yaml) — referenced as authoritative schema source; WebFetch denied, fields cross-verified against local xero-node SDK

### Tertiary (LOW confidence — flagged for live-tenant verification)
- The `EmploymentType` vs `EmploymentBasis` field-name suspicion (Pitfall 2). Resolution requires logging a real Xero AU Payroll response — must be verified during 52-00 implementation. If `EmploymentType` IS what Xero AU returns at the top level of the JSON response (overloaded with the SDK's `EMPLOYEE | CONTRACTOR` enum elsewhere), the existing route is correct and the recommendation reduces to a no-op.

---

## Metadata

**Confidence breakdown:**
- Existing codebase facts (routes, types, hooks, scopes): **HIGH** — read every relevant file
- Xero Payroll AU type definitions: **HIGH** — verified against in-tree xero-node SDK source
- Xero Payroll AU JSON response field names: **MEDIUM** — cross-referenced existing route + SDK + WebSearch; one ambiguity flagged (Pitfall 2)
- Recommended plan breakdown: **HIGH** — based on file size, dependency graph, and review unit-of-work norms
- Open Questions: **HIGH** that they need answering — Q1 (salary derivation) genuinely blocks 52-01 plan structure

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (Xero Payroll AU API has been stable since 2018; 30 days is conservative)
