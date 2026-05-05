---
phase: 52-xero-employee-data
plan: 02
subsystem: forecast / xero-import
tags: [xero, payroll-au, forecast-wizard, step4, ui, modal, reconciliation, tdd, option-d]
requirements: [XERO-S4-05]
dependency_graph:
  requires:
    - "Plan 52-00 (helper module + provenance fields _xeroFingerprint, _xeroEmployeeId, _xeroImportedAt, _overriddenFields)"
    - "Plan 52-01 (import modal + per-field override stamping via updateXeroSourcedField + isXeroSourcedRow + markFieldOverridden)"
  provides:
    - "Refresh-from-Xero button on Step 4 Team Members header (visible only when ≥1 row carries _xeroFingerprint)"
    - "Reconciliation modal with 3 sections: silent updates summary + conflicts (per-row per-field decisions) + New from Xero opt-ins"
    - "4 new pure helpers on xero-payroll-mapping.ts: findMatchingTeamMember, computeReconciliationDiff, applyReconciliationDecision, applySilentXeroUpdates"
    - "XERO_TRACKED_FIELDS constant + MemberDiff/FieldDiff/ReconciliationDecision/XeroTrackedField types"
    - "3-tier match strategy (id > email > name) with Pitfall 6 safety lock — algorithm iterates xeroEmployees, NEVER state.teamMembers"
    - "Per-field decision semantics: [Accept Xero] (writes value + clears override + advances fingerprint), [Keep yours] (advances fingerprint only — no re-prompt next refresh), [Edit] (operator value + adds override + advances fingerprint)"
    - "Bulk actions: 'Accept all Xero changes' + 'Keep all my changes'"
    - "Apply batches updates per-member (Test 14 lock — not per-field)"
  affects:
    - "Phase 52 — COMPLETE. All 5 XERO-S4-* requirements GREEN end-to-end."
tech-stack:
  added: []  # no new deps
  patterns:
    - "Pure-function pattern for reconciliation logic (4 new helpers, no I/O, trivially testable)"
    - "Real-hook Step4Harness component test pattern (mirrors 52-01) with mockImplementation + sequential call indexing for first vs second refresh"
    - "Direct-seed helper bypasses 52-01 import flow so each test focuses on reconciliation only"
    - "Inline modal pattern (no global Modal component) — same structure as 52-01 import modal"
key-files:
  created:
    - src/__tests__/forecast/phase-52-step4-reimport.test.tsx (1043 LOC, 16 component tests)
  modified:
    - src/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping.ts (+252 LOC; 4 new helpers + types + XERO_TRACKED_FIELDS constant)
    - src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx (+545 / -1 LOC; reconciliation state + 5 handlers + Refresh button + reconciliation modal)
    - src/__tests__/forecast/phase-52-payroll-mapping.test.ts (+543 LOC; 29 new pure-function tests across 4 describe blocks)
decisions:
  - "Default decision for un-clicked conflict fields on Apply = 'keep-mine' (safer — never overwrites operator value without explicit consent). Documented inline in applyReconciliation handler. Operator can still mass-apply with 'Accept all Xero changes' bulk action if desired."
  - "seedXeroMember test helper builds a SeedMember directly via actions.addTeamMember (bypasses the 52-01 import modal). Rationale: each test focuses on reconciliation behaviour only; going through the import modal would couple tests to 52-01 UI changes and double the harness setup time."
  - "Conflict + silent merge in applyReconciliation: when a member has BOTH silent updates AND conflict decisions, both are merged into a single per-member partial then dispatched as ONE actions.updateTeamMember call. This honours Test 14's per-member batching contract while preserving deep-merge of _xeroFingerprint (so a silent role update + conflict salary decision both land in the fingerprint)."
  - "valuesEqual treats undefined↔null as equivalent ('absent'); applies 0.005 float tolerance to numeric comparisons. Documented inline. Rationale: Xero may return undefined where a previous import returned null (or vice versa) due to JSON serialisation; treating them as different would surface a phantom conflict on every refresh."
  - "Fingerprint always advances on every decision (accept-xero, keep-mine, edit). This is the 'no-re-prompt' guarantee — Test 8 regression-locks it. Once the operator has decided what to do with Xero's value, that value becomes the new baseline for future refreshes; the conflict only re-emerges if Xero changes AGAIN."
  - "findMatchingTeamMember tier 3 (name match) intentionally matches manually-added members (no _xeroEmployeeId). Test 13 documents this — operator gets a chance to 'claim' the manual row by clicking Apply (silent updates apply if the manual row's name matches Xero exactly; field-level conflicts still surface). This is correct per Operator's Option D — manual rows aren't deleted, but if the operator types a name that exactly matches a Xero employee, they're inviting reconciliation."
  - "Reconciliation modal NEVER calls actions.removeTeamMember (the safety guarantee per Pitfall 6). Test 12 regression-locks: a manually-added row with no Xero match stays untouched on refresh. The algorithm only iterates `xeroEmployees` and either matches-and-reconciles or adds-as-new."
  - "NewHire reconciliation deferred (planned-hire imports get provenance fields stamped on 52-01 import + 52-02 New-from-Xero add path, but the diff/conflict UI lists ONLY teamMembers, not newHires). Rationale: NewHires are forward-looking; operator typically edits them manually before start date; surfacing reconciliation conflicts on planned hires would create more noise than signal. Documented inline."
metrics:
  duration: ~45min (single session, no checkpoints, all RED→GREEN clean on first try)
  tasks_completed: 4
  commits: 4
  files_changed: 4
  net_loc: +2383 / -1
  tests_added: 45 (29 helper unit + 16 component)
  tests_pass: 333/333 forecast+xero suites GREEN; 100/100 phase-52-payroll-mapping GREEN; 16/16 phase-52-step4-reimport GREEN
  date_completed: 2026-05-08
---

# Phase 52 Plan 02: Step 4 Refresh-from-Xero Reconciliation Summary

Ships the re-import / reconciliation flow on Step 4 — XERO-S4-05's "re-import without losing manual edits" requirement, implementing **Operator's Option D** end-to-end. Phase 52 is now COMPLETE with all 5 XERO-S4-* requirements GREEN.

## What Shipped

### 1. Refresh-from-Xero button (XERO-S4-05)
Added to the Team Members section header, alongside `Add Current` / `Plan Hire` / `Import from Xero` (52-01). Visible **only** when `hasAnyXeroSourcedRow` is true — i.e. at least one wizard row carries `_xeroFingerprint`. Distinct visual treatment from Import (white background with blue border vs filled blue) so operators can distinguish "first import" vs "refresh" at a glance.

### 2. Reconciliation modal (XERO-S4-05)
Inline modal (no global Modal component, per 52-RESEARCH anti-pattern). `role="dialog"` + `aria-modal="true"` + `aria-label="Reconcile with Xero"`. Three sections rendered conditionally:

**a. Silent updates summary line** — blue info banner: `"N employee(s) will be silently updated with new Xero values for fields you haven't edited."` Operator sees the count but isn't asked to make any decisions about these.

**b. Conflicts requiring decision** — one card per matched member with conflicts. Each card lists every conflict field with the format `"fieldName: Xero now shows X; you have Y"` and two buttons: `[Keep yours]` (gray when selected) and `[Accept Xero]` (blue when selected). Selected state is per-member-per-field via `pendingDecisions[memberId][field]`.

**c. New from Xero** — list of unmatched Xero employees with checkboxes. Operator opts in to add. `aria-label={`Add ${full_name}`}` for each checkbox.

**Bulk actions** (rendered next to the conflicts header): `Accept all Xero changes` + `Keep all my changes`. Both pre-fill `pendingDecisions` for every conflict field; per-field clicks override.

**In-sync state** — when nothing has changed AND no new candidates, modal opens briefly with `"✓ Everything is in sync with Xero"` + `"No changes detected since last import."` + Close button. No awkward silent no-op.

**Footer** — Cancel/Close + `Apply N changes` (CTA disabled when 0 changes).

### 3. The 3-tier match strategy (XERO-S4-05)
`findMatchingTeamMember(xeroEmp, teamMembers)` runs in this order:
1. **Exact `_xeroEmployeeId` match** (highest confidence — survives name changes)
2. **Case-insensitive trimmed email match** (if both have email)
3. **Case-insensitive trimmed full-name match** (matches manually-added rows too — Test 13)

Returns `undefined` if no match → emits New-from-Xero candidate.

### 4. Per-field diff verdict logic (XERO-S4-05)
`computeReconciliationDiff(member, freshXeroValues)` classifies each of the 7 `XERO_TRACKED_FIELDS` (`name`, `role`, `type`, `payFrequency`, `standardHours`, `hourlyRate`, `currentSalary`):

```
xeroChanged       = !valuesEqual(newXeroValue, lastImportedValue)
operatorOverrode  = member._overriddenFields?.includes(field)

  !xeroChanged                          → 'unchanged'                (skip)
  xeroChanged && !operatorOverrode      → 'updated-by-xero-only'    (silent apply)
  xeroChanged && operatorOverrode       → 'conflict'                (operator decides)
```

`valuesEqual` treats `undefined↔null` as equivalent (both "absent") and applies a 0.005 tolerance to numeric comparisons (covers float drift on hourly rates).

### 5. Per-field decision semantics (Test 6/7/8)
`applyReconciliationDecision(member, field, decision, newXeroValue, operatorValue?)` returns a `Partial<TeamMember>` ready for `actions.updateTeamMember`:

| Decision | Field value | `_overriddenFields` | `_xeroFingerprint[field]` | `_xeroImportedAt` |
|----------|-------------|----------------------|----------------------------|-------------------|
| `accept-xero` | → newXeroValue | field REMOVED | → newXeroValue | → now() |
| `keep-mine` | unchanged | field IN (idempotent) | → newXeroValue | → now() |
| `edit` | → operatorValue | field IN (idempotent) | → newXeroValue | → now() |

**Key invariant:** the fingerprint ALWAYS advances on every decision, so the same conflict will not re-prompt on the next refresh until Xero changes again. Test 8 regression-locks this.

### 6. Apply handler — per-member batching (Test 14)
The `applyReconciliation` handler:
1. Builds a `Map<memberId, Partial<TeamMember>>` from silent updates
2. For each member with conflicts, merges decision-derived partials INTO the same map entry (preserving deep-merge of `_xeroFingerprint`)
3. Dispatches **one** `actions.updateTeamMember(memberId, partial)` per touched member (NOT per field)
4. Adds selected New-from-Xero opt-ins via the same path as 52-01 (planned-hire branch on `start_date > today + 7d`)
5. Closes + clears modal state

### 7. Pitfall 6 safety guarantee (Test 12 — regression-locked)
The reconciliation algorithm **iterates `xeroEmployees`** from the fresh fetch. For each one, either matches via `findMatchingTeamMember` or emits a New-from-Xero candidate. It **NEVER iterates `state.teamMembers`** to filter or remove. Manually-added rows (no `_xeroEmployeeId`) are completely untouchable by this flow. No `removeTeamMember` calls in any code path of this plan.

Test 12 verifies: seed Mary (manual, no Xero provenance) + Alice (Xero-sourced); Xero refresh returns ONLY Alice; click Apply → Mary STILL in `state.teamMembers` with all fields unchanged.

### 8. New helper exports on xero-payroll-mapping.ts

| Export | Signature | Used by |
|--------|-----------|---------|
| `XERO_TRACKED_FIELDS` | `readonly ['name','role','type','payFrequency','standardHours','hourlyRate','currentSalary']` | Diff loop + bulk actions |
| `XeroTrackedField` | `typeof XERO_TRACKED_FIELDS[number]` | Type for field keys |
| `FieldDiffVerdict` | `'unchanged' \| 'updated-by-xero-only' \| 'conflict'` | Diff result |
| `FieldDiff` | `{ field, currentValue, lastImportedValue, newXeroValue, verdict }` | Per-field diff entry |
| `MemberDiff` | `{ memberId, xeroEmployeeId, fields: FieldDiff[] }` | Per-member diff |
| `ReconciliationDecision` | `'accept-xero' \| 'keep-mine' \| 'edit'` | Per-field decision |
| `findMatchingTeamMember` | `(xeroEmp, teamMembers) => string \| undefined` | 3-tier match strategy |
| `computeReconciliationDiff` | `(member, freshXeroValues) => MemberDiff` | Per-field verdict matrix |
| `applyReconciliationDecision` | `(member, field, decision, newXeroValue, operatorValue?) => Partial<TeamMember>` | Per-field decision → wizard update |
| `applySilentXeroUpdates` | `(member, diff) => Partial<TeamMember> \| null` | Batch silent updates per member |

## RED → GREEN Test Transitions

| Task | RED commit | GREEN commit | Tests | Cases |
|------|-----------|--------------|-------|-------|
| 1: helper unit tests | `3c79097` | `4f9103d` | `phase-52-payroll-mapping.test.ts` (extended) | 29 new (4 describe blocks) |
| 2: helper implementations | (Task 1 RED is the contract) | `4f9103d` | (Task 1 → all GREEN) | 29/29 GREEN |
| 3: component tests | `a7e426b` | `ae6021b` | `phase-52-step4-reimport.test.tsx` (NEW) | 16 (15/16 RED on HEAD; Test 1 trivially GREEN) |
| 4: Step4Team UI | (Task 3 RED is the contract) | `ae6021b` | (Task 3 → all GREEN) | 16/16 GREEN |

Final: **333/333** forecast + xero tests GREEN across 29 files. **tsc clean**. **eslint** shows only the same 3 pre-existing warnings flagged in 52-01 SUMMARY (lines 652, 663, 1239 — react-hooks/exhaustive-deps; unrelated to this plan).

## Net LOC per File

| File | Lines | Notes |
|------|------:|-------|
| `Step4Team.tsx` | **+545 / -1** | Imports + 7 new pieces of state + 5 new handlers (open/applyReconciliation/acceptAllXero/keepAllMine/setFieldDecision/toggleNewFromXeroSelection) + 1 derived (hasAnyXeroSourcedRow) + Refresh button (~15 LOC) + reconciliation modal (~180 LOC) |
| `xero-payroll-mapping.ts` | **+252** | 4 new helpers (findMatch, computeDiff, applyDecision, applySilent) + private valuesEqual helper + XERO_TRACKED_FIELDS const + 6 new types/interfaces |
| `phase-52-step4-reimport.test.tsx` | **+1043** | NEW — 16 component tests with Step4Harness + sequential fetch mock + seedXeroMember helper |
| `phase-52-payroll-mapping.test.ts` | **+543** | 29 new test cases across 4 new describe blocks (findMatchingTeamMember, computeReconciliationDiff, applyReconciliationDecision, applySilentXeroUpdates) |

**Total: +2,383 / -1 LOC across 4 files.**

## Confirmation: What Was NOT Touched

- `useForecastWizard.ts` — untouched (`git diff origin/main` returns empty for this file). All wiring done via existing `actions.addTeamMember` / `addNewHire` / `updateTeamMember` signatures.
- `WIZARD_VERSION` — still **10** (verified via grep). No localStorage migration.
- No DB schema migration. No `forecast_assumptions` JSONB shape change.
- No rollup math change. Test 16 regression-locks `summary.year1.teamCosts` for a silent salary increase ($98k→$105k → delta $7000 + 12% super = $7,840).
- No new `/api/Xero/*` endpoint. Reuses the same `/api/Xero/employees` route built in 52-00; only the consumer code path is new.
- 52-00 helper tests (48 cases) — STILL GREEN.
- 52-01 helper tests (23 new) + component tests (16) — STILL GREEN.
- Phase 50/51 baseline (Step4 pt-casual, termination, pay-frequency, season) — STILL GREEN.

## Deviations from Plan

None — plan executed exactly as written. The implementation choices flagged in the plan as decisions to make at execution time were resolved as documented in the `decisions:` frontmatter above:

- Default conflict decision = `keep-mine` (safer)
- `seedXeroMember` direct-via-action (bypasses 52-01 import modal)
- Conflict + silent merge in single `Map<memberId, Partial<TeamMember>>` dispatch
- `valuesEqual` semantics (null↔undefined, 0.005 float tolerance)
- Fingerprint always advances on every decision (Test 8 lock)
- Tier 3 matches manually-added rows by name (Test 13 documents intent)
- Reconciliation never calls `removeTeamMember` (Pitfall 6 lock)
- NewHire reconciliation deferred (only teamMembers iterated by diff loop)

## Sentinel / Manual Verification

**NOT executed in this session** (no live Xero credentials in the worktree env, no Vercel preview deploy yet). Recommended manual sentinel before merging the PR:

```
1. Open the Vercel preview URL → log in → navigate to Envisage or JDS forecast
2. Step 4: click "Import from Xero" (52-01) → import 2-3 employees → Save
3. Manually edit ONE employee's salary (e.g. $80k → $82k); the "edited" pill (52-01) appears
4. In Xero, change a DIFFERENT employee's role/salary
5. Step 4: click "Refresh from Xero"
6. Modal opens. Verify:
   - Silent updates summary shows the OTHER employee changed
   - "Conflicts requiring decision" section IS visible if you also changed the
     manually-edited employee in Xero
   - "New from Xero" section IS visible if you added a new employee in Xero
7. Click [Accept Xero] for the conflict field → click "Apply N changes"
8. Verify: edited pill disappears (override cleared), salary now matches Xero
9. Click Refresh again with no further Xero changes → "Everything is in sync" appears
10. Edit the same field again → click Refresh → no conflict re-prompt (fingerprint advanced)
```

## Phase 52 Closeout Notes

**All 5 XERO-S4-* requirements GREEN end-to-end:**
- XERO-S4-01: API endpoint + Step 4 import button + checkbox modal (52-00 + 52-01)
- XERO-S4-02: pay_frequency from PayrollCalendars join (52-00)
- XERO-S4-03: standardHours from OrdinaryHoursPerWeek + extractCompensationFromPayTemplate (52-00 + 52-01)
- XERO-S4-04: hourlyRate + Option D edit affordance (52-00 + 52-01)
- XERO-S4-05: Refresh-from-Xero with manual-edit preservation (52-02 — this plan)

**Pitfall 6 (manual-row safety) regression-locked by Test 12.**

**N+1 fetch limitation persists** (per-employee `/Employees/{id}` calls — documented in 52-00; not addressed in 52-02). At 30 employees: 32 requests per refresh, well under Xero's 60/min and 5000/day caps. Acceptable per RESEARCH.

**Future phase candidates (deferred — opportunistic, not phase-blocking):**
- Extract the 4-tier xero connection lookup into a shared helper (52-RESEARCH "Recommended Shared Helpers" — duplicated across 5+ routes)
- NewHire reconciliation UI (currently NewHires get provenance fields stamped on import but no diff UI; refactor would consolidate the per-member diff loop to iterate `[...teamMembers, ...newHires]`)
- Multi-tenant employee imports (Phase 52 is default-tenant-only per PHASE.md)

## PR

Will be opened as `feat(52-02): Re-import from Xero with reconciliation (XERO-S4-05) — Phase 52 COMPLETE` immediately after this SUMMARY commit lands.

## Self-Check: PASSED

Verified files exist:
- `src/__tests__/forecast/phase-52-step4-reimport.test.tsx` — FOUND (1043 LOC, 16 tests)
- `src/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping.ts` — FOUND (modified, +252 LOC)
- `src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx` — FOUND (modified, +545/-1 LOC)
- `src/__tests__/forecast/phase-52-payroll-mapping.test.ts` — FOUND (modified, +543 LOC, 100 total cases)

Verified commits exist on `feat/52-02-step4-xero-reimport-reconcile`:
- `3c79097` (Task 1 RED, 29 helper unit tests) — FOUND
- `4f9103d` (Task 2 GREEN, 4 helper implementations) — FOUND
- `a7e426b` (Task 3 RED, 16 component tests) — FOUND
- `ae6021b` (Task 4 GREEN, Step4Team reconciliation flow) — FOUND

All Phase 52-02 success criteria validated against on-disk + git state.
