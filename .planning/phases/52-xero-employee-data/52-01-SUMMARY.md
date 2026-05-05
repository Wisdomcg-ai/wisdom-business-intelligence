---
phase: 52-xero-employee-data
plan: 01
subsystem: forecast / xero-import
tags: [xero, payroll-au, forecast-wizard, step4, ui, modal, tdd, option-d]
requirements: [XERO-S4-01, XERO-S4-03, XERO-S4-04]
dependency_graph:
  requires:
    - "Plan 52-00 (helper module + new TeamMember/NewHire optional fields + /api/Xero/employees response shape with pay_frequency, standard_hours, calculation_type)"
    - "Phase 51-04b PayFrequency dropdown (extended here to mark _overriddenFields on Xero rows)"
  provides:
    - "On-demand 'Import from Xero' button + modal in Step 4 Team Members header"
    - "Per-row visual provenance: hourly Xero imports → read-only annual salary cell with Edit affordance + (Xero) hint; salaried → editable by default"
    - "Per-field 'edited' marker (amber pill) when operator overrides any tracked field on a Xero-sourced row"
    - "_overriddenFields populated on edit of currentSalary/payFrequency/hourlyRate (etc.) for Xero-sourced TeamMember rows; manual rows untouched"
    - "Planned-hire branch: Xero StartDate > today + 7 days → routed to addNewHire instead of addTeamMember"
    - "Empty-state + rate-limit polish folded in (no separate plan): disabled button + tooltip on 404, friendly inline message on 429"
    - "4 new helper exports on xero-payroll-mapping.ts (ANNUAL_PAY_PERIODS, getDerivedAnnualSalary, markFieldOverridden, isFieldOverridden, isXeroSourcedRow)"
  affects:
    - "Plan 52-02 (re-import reconciliation) — _overriddenFields is now populated on operator edits; the reconciler can read this to skip auto-overwriting overridden fields"
tech-stack:
  added: []  # no new deps
  patterns:
    - "Inline modal pattern (no global Modal component) — mirrors existing showAddEmployee / showAddHire / terminatingMember inline modals in Step4Team.tsx"
    - "Option D conditional render branch on _xeroFingerprint.hourlyRate presence (hourly imports never carry currentSalary in fingerprint; presence of hourlyRate identifies the hourly-derived path)"
    - "updateXeroSourcedField helper wraps actions.updateTeamMember and stamps changed field name into _overriddenFields when isXeroSourcedRow(member) is true"
key-files:
  created:
    - src/__tests__/forecast/phase-52-step4-import.test.tsx (552 LOC, 16 component tests)
  modified:
    - src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx (+462 / -12 LOC; button + modal + edit affordance + override wrappers)
    - src/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping.ts (+75 LOC; 5 new exports)
    - src/__tests__/forecast/phase-52-payroll-mapping.test.ts (+117 LOC; 23 new test cases for the new helpers)
decisions:
  - "Connection probe is reactive (not pre-flight): hasXeroConnection starts true; downgraded to false only when the first GET to /api/Xero/employees returns 404. Avoids a wasted HEAD request on every Step 4 mount and matches the pattern the existing first-load auto-import already established (relies on the GET response). The trade-off — operator briefly sees an enabled button on a non-Xero business until first click — is acceptable per 52-RESEARCH guidance."
  - "Import-from-Xero button placed alongside Add Current + Plan Hire in the Team Members header (not in a separate row). Matches the Operator's existing visual model where Step 4 actions live above the team table, and keeps the empty-state tooltip directly visible without scroll."
  - "Salary cell stayed in the existing column (not a new column). The read-only-vs-editable branch wraps the existing CurrencyInput inline; an IIFE (immediately-invoked arrow) keeps the conditional self-contained per the existing payFrequency dropdown precedent in the same cell. Avoided a column refactor that would have churned the rest of TeamTable."
  - "Hourly-detection heuristic: _xeroFingerprint.hourlyRate !== undefined. Rationale: extractCompensationFromPayTemplate (52-00) returns calculationType 'hourly' iff a USEEARNINGSRATE/ENTEREARNINGSRATE line is found, in which case it sets hourlyRate but NOT annualSalary. Salaried imports get annualSalary but NOT hourlyRate. The fingerprint preserves both fields when set, so 'fingerprint has hourlyRate' is a reliable proxy for 'this row was originally a hourly Xero import'. Avoids needing a separate _xeroCalculationType field on TeamMember."
  - "NewHire override-tracking deferred to 52-02. 52-01 stamps provenance (_xeroEmployeeId/_xeroFingerprint/_xeroImportedAt) on planned-hire imports but does NOT wrap addNewHire onChange handlers in updateXeroSourcedField. Rationale: NewHires are forward-looking, the operator typically edits salary/role manually before the start date, and re-import reconciliation (the only consumer of _overriddenFields) ships in 52-02 anyway. Documented inline in the payFrequency dropdown for future readers."
metrics:
  duration: ~50min (single session, no checkpoints, all RED→GREEN clean)
  tasks_completed: 3
  commits: 3
  files_changed: 4
  net_loc: +1206 / -12
  tests_added: 39 (16 component + 23 helper)
  tests_pass: 288/288 forecast+xero suites GREEN; 16/16 phase-52-step4-import GREEN; 71/71 phase-52-payroll-mapping GREEN
  date_completed: 2026-05-05
---

# Phase 52 Plan 01: Step 4 Import-from-Xero UI Summary

Ships the on-demand "Import from Xero" UI on Step 4 of the forecast wizard with Operator's Option D encoded throughout: hourly imports get a read-only annual salary cell with an Edit affordance; salaried imports get an editable cell by default; both track per-field overrides via `_overriddenFields` so the visual "edited" pill makes operator overrides immediately obvious. Plus folded-in empty-state + rate-limit polish (no standalone 52-03).

## What Shipped

### 1. Import-from-Xero button (XERO-S4-01)
Added to the Team Members section header, alongside `Add Current` and `Plan Hire`. Disabled with tooltip `"Connect Xero to enable auto-import"` when a prior fetch to `/api/Xero/employees` returned 404. Otherwise tooltipped `"Import employees from connected Xero tenant"`. Uses the `DownloadCloud` icon from lucide-react.

### 2. Inline modal (XERO-S4-01)
Loading skeleton (`Loader2` + spinning) ↔ inline error (red text) ↔ employee table (checkboxes + names + employment type pill + pay frequency + pay rate). `role="dialog"` + `aria-modal="true"` + `aria-label="Import employees from Xero"`. Footer with `Cancel` + `Import N selected` (CTA disabled when 0 selected).

### 3. Primary-rate display branch on calculation_type
- **Hourly** (`USEEARNINGSRATE`/`ENTEREARNINGSRATE`): `$45.00/hr × 20h` plus a smaller `≈ $46,800/yr (Xero-derived)` hint.
- **Salaried** (`ANNUALSALARY`): `$98,000/yr` plus optional `$X/hr × Yh hint` smaller text when both rates are present.
- **Unknown**: falls back to `$annual/yr` or `—`.

### 4. Annual-salary cell branch (XERO-S4-03/04, Option D)
Cell behaviour determined by three derived booleans:
```ts
const xeroSourced = isXeroSourcedRow(sourceMember);
const wasHourlyImport = xeroSourced && sourceMember._xeroFingerprint?.hourlyRate !== undefined;
const overridden = isFieldOverridden(sourceMember, 'currentSalary');
const showReadOnly = wasHourlyImport && !overridden;
```
- `showReadOnly` → `<span>$X</span> + <button>Edit</button> + <span>(Xero)</span>` — Edit click marks `currentSalary` as overridden via `markFieldOverridden`, which on next render flips to the editable input branch.
- Else → `<CurrencyInput>` + amber `edited` pill (hidden unless `xeroSourced && overridden`).

### 5. Per-field override tracking
New helper `updateXeroSourcedField(memberId, updates, fieldNames)` in Step4Team.tsx wraps `actions.updateTeamMember`. When `isXeroSourcedRow(member)` is true, appends each fieldName to `_overriddenFields` via the new `markFieldOverridden` helper. Wired into:
- Annual salary input (all paths: contractor, casual, full-time)
- Pay-frequency dropdown (51-04b precedent extended)
- Hourly rate (when changed via the salary cell's casual recompute path)

Manual (non-Xero) rows skip the override-stamping branch entirely — `_overriddenFields` stays `undefined`. Verified by Test 12.

### 6. Planned-hire branch (52-RESEARCH Open Q3)
On import, Xero `start_date` is parsed and compared against `today + 7 days`. Future-dated employees are routed to `actions.addNewHire` with `startMonth` derived from the StartDate (`YYYY-MM`). Otherwise `actions.addTeamMember`. Both paths populate provenance fields (`_xeroEmployeeId`, `_xeroImportedAt`, `_xeroFingerprint`).

### 7. Empty-state + rate-limit polish (folded from 52-03)
- 404 → modal shows `"Connect Xero to enable auto-import."` + downgrades `hasXeroConnection` so future button clicks are disabled.
- 429 / `/rate limit/i` in error string → `"Xero rate limit hit — retry in a moment."`
- 0 employees → `"No employees found in connected Xero tenant."` + Import N disabled.
- `expired` / `needs_reconnect` → `data.message || "Reconnect Xero to access employee data."`
- Network error → raw `err.message`.

### 8. New helper exports on xero-payroll-mapping.ts (Task 2)
| Export | Signature | Used by |
|--------|-----------|---------|
| `ANNUAL_PAY_PERIODS` | `Record<PayFrequency, number>` (52/26/12) | Modal display + getDerivedAnnualSalary |
| `getDerivedAnnualSalary` | `(hourlyRate, standardHours, payFrequency) => number \| undefined` | Modal "Xero-derived" hint |
| `markFieldOverridden` | `(current[], fieldName) => string[]` (idempotent — same ref on duplicate) | updateXeroSourcedField + Edit-button click |
| `isFieldOverridden` | `(member, fieldName) => boolean` | Edited pill + read-only branch |
| `isXeroSourcedRow` | `(member) => boolean` (keyed off `_xeroEmployeeId`) | Salary cell + payFrequency dropdown |

## RED → GREEN Test Transitions

| Task | RED commit | GREEN commit | Tests | Cases |
|------|-----------|--------------|-------|-------|
| 1: import modal + Option D component tests | `0a2cab9` | `b4efe8a` | `phase-52-step4-import.test.tsx` | 16 (15/16 RED on HEAD; Test 12 trivially passes) |
| 2: helper additions | (no RED — additive type-tested helpers) | `107f2b8` | `phase-52-payroll-mapping.test.ts` (extended) | 23 new cases (71 total) |
| 3: Step4Team UI | (Task 1 RED is the contract) | `b4efe8a` | (Task 1 → all GREEN) | 16/16 GREEN |

Final: **288/288** forecast + xero tests GREEN across 28 files. **tsc clean**. Pre-existing react-hooks/exhaustive-deps warnings on lines 642, 653, 1229 — unchanged from main, unrelated.

## Net LOC per File

| File | Lines | Notes |
|------|------:|-------|
| `Step4Team.tsx` | **+462 / -12** | Imports + 7 new pieces of state + 4 new handlers (open/select/select-all/import) + 1 new helper (updateXeroSourcedField) + Import button + inline modal (~150 LOC) + salary-cell branch refactor (~100 LOC) |
| `xero-payroll-mapping.ts` | **+75** | 5 new exports (ANNUAL_PAY_PERIODS const + 4 functions); pure additive, no signature changes to existing exports |
| `phase-52-step4-import.test.tsx` | **+552** | NEW — 16 component tests with Step4Harness real-hook pattern + global.fetch mock |
| `phase-52-payroll-mapping.test.ts` | **+117** | 23 new test cases across 5 new describe blocks (ANNUAL_PAY_PERIODS, getDerivedAnnualSalary, markFieldOverridden, isFieldOverridden, isXeroSourcedRow) |

**Total: +1,206 / -12 LOC across 4 files.**

## Confirmation: What Was NOT Touched

- `useForecastWizard.ts` — untouched (`git diff origin/main` returns empty for this file). All wiring done via existing `actions.addTeamMember`/`addNewHire`/`updateTeamMember`/`setDefaultPayFrequency` signatures.
- `WIZARD_VERSION` — still **10** (verified via grep).
- No DB schema migration.
- No `forecast_assumptions` JSONB shape change (Phase 52-00 already added the optional fields; 52-01 only writes them).
- No rollup math change. Test 16 regression-locks `summary.year1.teamCosts` for a $0-salary import.
- Phase 50/51 baseline tests — STILL GREEN (288/288 across 28 files).
- 52-00 `phase-52-payroll-mapping.test.ts` original 48 tests — STILL GREEN.

## Deviations from Plan

None — plan executed exactly as written. The implementation choices flagged in the plan as "Decisions to make at execution time" were resolved as documented in the `decisions:` frontmatter above (reactive connection probe, button placement, salary-cell column inline, hourly-detection heuristic, NewHire override-tracking deferred).

## Sentinel / Manual Verification

NOT executed in this session (no live Xero credentials in the worktree env, no Vercel preview yet). Recommended manual sentinel before merging the PR:

```
1. Open the Vercel preview URL → log in → navigate to a Xero-connected business (Envisage or JDS)
2. Open Forecast → Step 4 (Team)
3. Click "Import from Xero" — modal opens listing actual employees
4. Verify: hourly staff show "$X/hr × Yh × ≈ $derived/yr (Xero-derived)"
5. Verify: salaried staff show "$X/yr"
6. Tick 2 employees → click "Import 2 selected" → modal closes; rows appear in team table
7. Verify hourly rows: salary cell read-only with "Edit" + "(Xero)"; click Edit → input appears + "edited" pill on next change
8. Verify salaried rows: salary cell editable; change value → "edited" pill appears
9. Disconnect-business smoke: open a business with no Xero connection → click button → modal opens → "Connect Xero to enable auto-import" inline error → close → button now disabled with tooltip on hover
```

## Notes for Plan 52-02 (Re-Import Reconciliation)

- `_overriddenFields` is now populated **automatically** when the operator edits any tracked field (`currentSalary`, `payFrequency`, `hourlyRate`) on a Xero-sourced TeamMember. The reconciler can read this directly — no need to compute "is field changed since last import?" by hashing.
- `_xeroFingerprint` is still the fallback for fields not tracked in `_overriddenFields` (52-02 may want a hybrid: explicit override list + fingerprint diff for the rest).
- The `enrichWizardMemberFromXeroEmployee` helper is the single mapping path — 52-02 reuses it for the diff side of `mergeXeroEmployeeIntoMember`.
- New helpers `markFieldOverridden`, `isFieldOverridden`, `isXeroSourcedRow` are stable + tested. 52-02 needs only `mergeXeroEmployeeIntoMember` + `findMatchingTeamMember` on top.
- `updateXeroSourcedField` lives inline in Step4Team.tsx (not in xero-payroll-mapping.ts) because it depends on `actions.updateTeamMember` and `state.teamMembers.find`. If 52-02 needs the same wrapping for re-import flows, consider extracting to a hook (`useXeroFieldUpdater`).
- NewHire override-tracking is deferred to 52-02 — currently planned-hire imports get provenance fields stamped but onChange handlers don't wrap. Documented inline in the payFrequency dropdown comment.

## PR

Will be opened as `feat(52-01): Step 4 "Import from Xero" UI with Option D auto-detect (XERO-S4-01/03/04)` immediately after this SUMMARY commit lands.

## Self-Check: PASSED

Verified files exist:
- `src/__tests__/forecast/phase-52-step4-import.test.tsx` — FOUND (552 LOC, 16 tests)
- `src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx` — FOUND (modified, +462/-12)
- `src/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping.ts` — FOUND (modified, +75)
- `src/__tests__/forecast/phase-52-payroll-mapping.test.ts` — FOUND (modified, +117)

Verified commits exist on `feat/52-01-step4-xero-import-ui`:
- `0a2cab9` (Task 1 RED, 16 component tests) — FOUND
- `107f2b8` (Task 2 GREEN, 5 helper exports + 23 tests) — FOUND
- `b4efe8a` (Task 3 GREEN, Step4Team UI) — FOUND

All Phase 52-01 success criteria validated against on-disk + git state.
