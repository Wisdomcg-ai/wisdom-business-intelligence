# Task 06 — Update hardcoded step references (descriptions, YearTabs, programmatic callers)

**Ship batch:** B3 (Wizard step swap) · **Wave:** 4 · **Dependencies:** T05 · **Risk:** LOW

## Goal

After T05 swaps the renderStep + WIZARD_STEPS, sweep every other site that hardcodes step 5 or 6 and update copy / behavior to match the new ordering.

## Files modified

- `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` (~10 lines)
  - **Line 1800 — YearTabs gate:** `[3, 4, 5].includes(state.currentStep)` → `[3, 4, 6].includes(state.currentStep)` (Subscriptions step 5 is Y1-only; OpEx step 6 needs year tabs)
  - **Line 1840-1841 — step descriptions:** swap step 5 and step 6 strings
  - **Lines ~1192-1197 programmatic goToStep callers:** verify `initialStep` and `actions.goToStep(7)` callers are still semantically correct (CapEx is still step 7; no change expected, but document the audit in commit)
- `src/app/finances/forecast/components/wizard-v4/steps/Step8Review.tsx` (~10 lines)
  - **Line 605-611 — completion checklist:** swap the order of `{ step: 5, label: 'OpEx' }` and `{ step: 6, label: 'Subscriptions' }`. Update label strings AND `hasData` predicates per CONTEXT.md validation rules
- Any test files with hardcoded step assertions:
  - `src/__tests__/forecast/phase-51-step5-labels.test.tsx`
  - `src/__tests__/forecast/phase-51-step6-sidebar.test.tsx`
  - `src/__tests__/forecast/phase-51-step6-manual-entry.test.tsx`
  - `src/__tests__/forecast/phase-51-step6-re-analyze.test.tsx`

## Implementation notes

### Step descriptions (ForecastWizardV4.tsx:~1840)

Before:
```typescript
{state.currentStep === 5 && "Classify operating expenses as Fixed, Variable, or Ad-hoc"}
{state.currentStep === 6 && "Audit your subscriptions and identify potential savings"}
```

After:
```typescript
{state.currentStep === 5 && "Audit your subscriptions and identify potential savings"}
{state.currentStep === 6 && "Classify operating expenses as Fixed, Variable, or Ad-hoc"}
```

### YearTabs gate

Before (`ForecastWizardV4.tsx:1800`):
```typescript
{[3, 4, 5].includes(state.currentStep) && state.forecastDuration > 1 && (
```

After:
```typescript
// Phase 57: Subscriptions (step 5) is Y1-only — no year tabs. OpEx (step 6) is
// multi-year — show year tabs.
{[3, 4, 6].includes(state.currentStep) && state.forecastDuration > 1 && (
```

### Step8Review completion checklist (~line 605-611)

Before:
```typescript
{ step: 5, label: 'OpEx', hasData: state.opexLines.length > 0 },
{ step: 6, label: 'Subscriptions', hasData: /* whatever */ },
```

After:
```typescript
{ step: 5, label: 'Subscriptions', hasData: state.subscriptions.some(v => v.isActive) },
{ step: 6, label: 'OpEx', hasData: state.opexLines.length > 0 },
```

If a wizard-completed flag is needed for Subscriptions where 0 vendors is a valid "completed" state (operator chose to add nothing), use `state.subscriptions !== undefined` instead — the rendering of Step 5 ensures the field exists. CONTEXT.md prefers this softer predicate (per validation table).

### Programmatic goToStep callers

Audit `ForecastWizardV4.tsx:1192-1197`:
```typescript
actions.goToStep(7);     // Was: jump to CapEx after some action. CapEx is still step 7. NO CHANGE.
actions.goToStep(initialStep);  // initialStep is computed from saved progress. NO CHANGE.
```

Run `grep -n "goToStep(" src/app/finances/forecast/` to find any other programmatic callers. None expected, but verify.

### Phase 51 test updates

`phase-51-step5-labels.test.tsx` — if it asserts "Step 5 shows OpEx label", change to "Step 5 shows Subscriptions" (or "Step 6 shows OpEx" — whichever is the test's true intent). Use `git log -p` on the test file to understand its original intent before mutating assertions.

`phase-51-step6-sidebar.test.tsx`, `phase-51-step6-manual-entry.test.tsx`, `phase-51-step6-re-analyze.test.tsx` — these assert behavior of the Subscriptions step. After swap that step is at currentStep=5. Two options:
1. **Preferred:** rename the test files to `phase-51-subscriptions-*.test.tsx` (no longer step-numbered) and update assertions to mount Subscriptions at currentStep=5
2. **Quick:** leave file names; just update assertions

Option 1 is cleaner long-term. Option 2 ships faster. **Recommend option 2 in this PR**, schedule option 1 as a follow-up cleanup.

### Other potential search hits

```bash
grep -rn "step === 5\|step === 6\|currentStep === 5\|currentStep === 6\|case 5:\|case 6:\|step: 5\|step: 6" src/app/finances/forecast/
grep -rn "Step 5\|Step 6\|step 5\|step 6" src/app/finances/forecast/ src/__tests__/forecast/
```

For every hit, decide:
- Is it a number used in business logic (`if (currentStep === 5)`)? → swap if its semantic meaning is the OpEx step
- Is it human-readable copy ("Step 5 of 9")? → swap if it refers to the OpEx step
- Is it a step ordinal that's stable regardless of label (e.g., "the 5th step in the wizard")? → no change

Document audit conclusions in commit message.

## Acceptance criteria

- [ ] YearTabs gate updated to `[3, 4, 6]`; verified by mounting wizard, advancing to Subscriptions (no year tabs), advancing to OpEx (year tabs visible)
- [ ] Step descriptions swapped at lines ~1840-1841
- [ ] Step8Review completion checklist swapped + `hasData` predicates correct
- [ ] All Phase 51 tests pass after assertion updates
- [ ] `grep -n "Step 5\|Step 6" src/app/finances/forecast/` shows zero false matches (only intentional references)
- [ ] No new tsc errors

## Regression risks

- **Forgotten step references**: easy to miss. The grep audit is the safety net. If something is missed, T16 (manual QA) catches it.
- **Test fixtures that depend on rendering Subscriptions at step 6**: covered by the test updates above.
- **AICFOPanel labels** are NOT updated in this task — that's T14. They will be wrong on `main` between B3 ship and B5 ship — Matt accepts this for a few days because the panel labels are advisory text, not data.

## Estimated effort

0.5 day (mostly the test updates).
