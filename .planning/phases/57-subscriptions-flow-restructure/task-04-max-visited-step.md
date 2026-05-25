# Task 04 — Add `maxVisitedStep` to wizard state

**Ship batch:** B3 (Wizard step swap) · **Wave:** 3 · **Dependencies:** T03 · **Risk:** LOW

## Goal

Track the highest step the operator has reached so the StepBar (T13) can determine which steps are clickable. Forward steps stay disabled until visited; once visited, they're clickable forever after.

## Why this is its own task

`maxVisitedStep` is state-machine logic that sits below the StepBar UI. Splitting it from T13 lets us land the state field early (in B3 wave) and keep the StepBar UI changes (T13) focused on render + click handler logic. Also lets B3 ship the migration default (already added in T03's soft-migration block).

## Files modified

- `src/app/finances/forecast/components/wizard-v4/types.ts` (~3 lines)
  - Add to `ForecastWizardState`: `maxVisitedStep: WizardStep`
- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts` (~15 lines)
  - `createInitialState` (~line 128): set `maxVisitedStep: 1`
  - `nextStep` (~line 331): after computing `next`, advance `maxVisitedStep = max(prev.maxVisitedStep, next as WizardStep)`
  - `goToStep` (~line 327): also advance maxVisitedStep if `step > maxVisitedStep` (defensive — should not happen for forward jumps if StepBar gates correctly, but covers programmatic calls like `actions.goToStep(7)` in ForecastWizardV4.tsx:~1192)
  - `prevStep` does NOT modify maxVisitedStep (visiting a lower step doesn't lower the ceiling)

## Implementation notes

### Type addition

```typescript
// types.ts inside ForecastWizardState
/** Phase 57: highest step the operator has reached. Used by StepBar to gate
 *  which steps are clickable. Initialized to 1; advanced inside nextStep and
 *  goToStep when the new step exceeds the ceiling. Never decreases. */
maxVisitedStep: WizardStep;
```

### Initial state

```typescript
// createInitialState
maxVisitedStep: 1,
```

### Action updates

```typescript
const goToStep = useCallback((step: WizardStep) => {
  setState(prev => ({
    ...prev,
    currentStep: step,
    maxVisitedStep: step > prev.maxVisitedStep ? step : prev.maxVisitedStep,
  }));
}, []);

const nextStep = useCallback(() => {
  setState(prev => {
    let next = prev.currentStep + 1;
    if (next === 8 && prev.forecastDuration === 1) next = 9;
    if (next > 9) return prev;
    const nextStep = next as WizardStep;
    return {
      ...prev,
      currentStep: nextStep,
      maxVisitedStep: nextStep > prev.maxVisitedStep ? nextStep : prev.maxVisitedStep,
      durationLocked: prev.currentStep === 1 ? true : prev.durationLocked,
    };
  });
}, []);

// prevStep — no maxVisitedStep change
```

### Soft-migration default

Already covered by T03's migration block:
```typescript
if (parsed.maxVisitedStep === undefined) {
  parsed.maxVisitedStep = parsed.currentStep || 1;
}
```

This means an operator returning to a v10 draft mid-flow keeps access to all steps they've seen — a draft on step 5 (OpEx pre-Phase-57, now step 6 OpEx after the swap) gets `maxVisitedStep: 6` and can navigate back to steps 1-6, with 7-9 disabled.

## Acceptance criteria

- [ ] `maxVisitedStep: WizardStep` added to type and initialized to 1
- [ ] `nextStep`, `goToStep` advance maxVisitedStep monotonically; never decrease
- [ ] `prevStep` does NOT change maxVisitedStep
- [ ] On a fresh forecast: `state.maxVisitedStep === 1`
- [ ] After `nextStep()` × 3: `state.maxVisitedStep === 4`
- [ ] After `prevStep()` × 2: `state.maxVisitedStep` still 4 (no decrease)
- [ ] Programmatic `actions.goToStep(7)` advances `maxVisitedStep` to 7 (covers existing callers in ForecastWizardV4.tsx:~1192)
- [ ] No new tsc errors; existing tests still green

## Test

`src/__tests__/forecast/phase-57-max-visited-step.test.tsx` (~50 lines):
```typescript
describe('maxVisitedStep state machine', () => {
  it('initializes to 1', () => {
    // mount hook, expect state.maxVisitedStep === 1
  });

  it('advances on nextStep', () => {
    // call actions.nextStep() 3 times; expect maxVisitedStep === 4
  });

  it('does not decrease on prevStep', () => {
    // advance to 4, call prevStep, expect maxVisitedStep still 4
  });

  it('advances on goToStep when target > ceiling', () => {
    // goToStep(7); expect maxVisitedStep === 7
  });

  it('does not advance on goToStep when target ≤ ceiling', () => {
    // advance to 5, goToStep(2); expect maxVisitedStep still 5
  });
});
```

## Regression risks

- **Existing programmatic `goToStep(initialStep)` calls** (ForecastWizardV4.tsx:1196) — these can advance `maxVisitedStep` higher than expected for a fresh forecast. Read those callers; if `initialStep` is computed from a saved draft's progress, advancing maxVisitedStep is correct (operator has already seen that step). If `initialStep` is the wizard restart entry point (e.g., always 1), the change is a no-op.

## Estimated effort

0.25 day.
