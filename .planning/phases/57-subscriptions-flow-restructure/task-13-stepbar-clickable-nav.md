# Task 13 — StepBar clickable nav: maxVisitedStep + validation icons + flush-save-before-jump

**Ship batch:** B5 (Cleanup) · **Wave:** 6 · **Dependencies:** T04, T12 · **Risk:** MEDIUM

## Goal

Make the top-bar StepBar clickable for any step ≤ `state.maxVisitedStep`, both forward (forward-revisit visited steps) and backward. Before invoking `goToStep`, flush pending saves on the current step (especially Step 5 Subscriptions per T12). Add per-step validation icons (informational, not gating).

Per CONTEXT.md (lines 40-45):
- Add `maxVisitedStep` to state — done in T04 (state machinery shipped in B3)
- Any step where `step <= maxVisitedStep` is clickable, forward and backward
- Flush-save synchronously before `goToStep`
- On save failure: toast + stay put
- No confirm modal
- Per-step validation icons — informational only, NOT gating

## Single-batch ship (no skeleton split)

T13 ships fully in **B5** with the new behavior live (no feature flag, no skeleton/flag-flip dance). The previous draft staged StepBar across B3 (skeleton with flag OFF) and B5 (flag flip ON) to allow a soak window. With the post-checker restructure, B3 is now the atomic migration+swap batch, so:

- **`maxVisitedStep` state machinery already lives in B3** (T04 ships it). The state value is populated for every forecast after B3 deploys.
- **B4 ships subscription UX** without touching StepBar.
- **B5 ships the StepBar logic change in a single commit, behavior live immediately.** No flag, no flip.

This reduces complexity (one PR touch instead of two), removes a follow-up "remove the flag" cleanup commit, and tightens the QA window.

## Files modified

- `src/app/finances/forecast/components/wizard-v4/components/StepBar.tsx` (~80 lines, full rewrite)
  - Accept `maxVisitedStep`, `onStepClickAsync` props
  - Compute `isClickable = step.step <= maxVisitedStep` (instead of `<= currentStep`)
  - Per-step validation predicate (returns 'complete' | 'incomplete' | 'unvisited')
  - Render validation icon next to step number
- `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` (~30 lines)
  - Pass `state.maxVisitedStep` to StepBar
  - Implement async `onStepClick` handler: await `subscriptionsStepRef.current?.flushPendingSaves()` (if currentStep === 5), then await `actions.saveDraft()`, then `actions.goToStep(targetStep)`
  - Hold a `useRef<Step6SubscriptionsHandle>` and pass it to Step6Subscriptions in renderStep
- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts` (~10 lines)
  - Expose `saveDraft()` action that returns a Promise<void> awaiting the next localStorage write + any other pending side effects

## Implementation notes

### isClickable logic (no flag)

```typescript
const isClickable = step.step <= maxVisitedStep;
```

That's it. No `STEP_BAR_CLICKABLE_NAV_ENABLED` constant, no branching.

### Validation predicates

```typescript
type StepValidationStatus = 'complete' | 'incomplete' | 'unvisited';

function getStepValidation(step: WizardStep, state: ForecastWizardState): StepValidationStatus {
  if (step > state.maxVisitedStep) return 'unvisited';
  switch (step) {
    case 1:
      return state.goals.year1.revenue > 0 ? 'complete' : 'incomplete';
    case 2:
      return state.priorYear !== null ? 'complete' : 'incomplete';
    case 3:
      return (state.revenueLines.length > 0 && state.cogsLines.length > 0) ? 'complete' : 'incomplete';
    case 4:
      return (state.teamMembers.length > 0 || state.newHires.length > 0) ? 'complete' : 'incomplete';
    case 5:
      // Subscriptions — "complete" means at least one active vendor OR explicit zero-confirmed
      // Soft predicate: if user has visited, treat as complete (CONTEXT.md says informational)
      return 'complete';
    case 6:
      return state.opexLines.length > 0 ? 'complete' : 'incomplete';
    case 7:
    case 8:
      return 'complete';  // optional steps
    case 9:
      return 'complete';  // terminal step, never marked incomplete
    default:
      return 'unvisited';
  }
}
```

### Icon rendering

Inside StepBar's per-step render:

```jsx
const validation = getStepValidation(step.step as WizardStep, state);

// Existing button rendering, plus a small icon overlay or sibling
{validation === 'incomplete' && (
  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 ring-2 ring-white" title="Incomplete" />
)}
{validation === 'complete' && step.step !== currentStep && (
  /* existing green-check styling already conveys this — no extra icon needed */
)}
```

### Async click handler

In StepBar:

```typescript
interface StepBarProps {
  currentStep: WizardStep;
  maxVisitedStep: WizardStep;
  state: ForecastWizardState;  // for validation predicates
  onStepClickAsync: (step: WizardStep) => Promise<void>;  // async to support flush
  steps?: typeof WIZARD_STEPS;
}

// Inside the button onClick:
onClick={async () => {
  if (!isClickable) return;
  try {
    await onStepClickAsync(step.step as WizardStep);
  } catch (err) {
    // Toast handled by parent
  }
}}
```

### Parent (ForecastWizardV4) glue

```typescript
const subscriptionsStepRef = useRef<Step6SubscriptionsHandle>(null);

const handleStepClickAsync = useCallback(async (target: WizardStep) => {
  // Phase 57: flush pending saves before navigating away.
  try {
    if (state.currentStep === 5 && subscriptionsStepRef.current) {
      // Flush Step 5 (Subscriptions) — debounced API write may not have fired
      await subscriptionsStepRef.current.flushPendingSaves();
    }
    // Always flush wizard-state autosave (debounced localStorage write)
    await actions.saveDraft();
    actions.goToStep(target);
  } catch (err) {
    console.error('[StepBar] Flush failed; staying on current step', err);
    toast.error('Could not save your changes. Please try again.');
  }
}, [state.currentStep, actions]);
```

In renderStep, pass the ref:
```typescript
case 5:
  return <Step6Subscriptions ref={subscriptionsStepRef} state={state} actions={actions} fiscalYear={fiscalYear} businessId={businessId} />;
```

### saveDraft action

In `useForecastWizard.ts`:

```typescript
const saveDraft = useCallback(async (): Promise<void> => {
  // Force-flush the localStorage debounced write
  if (autoSaveTimerRef.current) {
    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
  }
  // Synchronously serialize current state to localStorage
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(getStorageKey(businessId, fiscalYearStart), JSON.stringify(stateRef.current));
    } catch (err) {
      console.error('[saveDraft] localStorage write failed', err);
      throw err;
    }
  }
}, [businessId, fiscalYearStart]);
```

(Use `stateRef.current` — a ref mirror of state — to avoid stale closure on the latest state.)

## Acceptance criteria

- [ ] On a forecast with maxVisitedStep=4, only steps 1-4 are clickable; 5-9 disabled
- [ ] After advancing to step 5, steps 1-5 clickable; 6-9 disabled
- [ ] After advancing to step 9, all steps 1-9 clickable
- [ ] Clicking a past visited step (e.g., step 2 from step 7): wizard navigates back, all data preserved
- [ ] Clicking a future visited step (e.g., from step 4 back to 7 if previously visited): wizard navigates forward
- [ ] Editing a vendor budget on step 5, immediately clicking step 6: edit is preserved (T12 flush works)
- [ ] On localStorage write failure: toast appears, currentStep does NOT change
- [ ] Validation icons render: amber dot on incomplete past steps, no icon on complete steps
- [ ] No new tsc errors
- [ ] No `STEP_BAR_CLICKABLE_NAV_ENABLED` flag in codebase (single-batch ship; behavior live immediately)

## Regression risks

- **Step6Subscriptions ref dance:** `forwardRef` + `useImperativeHandle` adds complexity. If T12's flush mechanism is fragile, T13 falls back to a simpler "fire-and-pray" save: `actions.saveDraft()` only, accept that 0–1500ms of subscription edits may be lost on rapid jumps. CONTEXT.md is firm on no-data-loss but the realistic impact is small.
- **maxVisitedStep advancement on programmatic goToStep:** T04 covers this. If `actions.goToStep(7)` is called from a callback in Step 6 (e.g., "Skip to CapEx" button), maxVisitedStep advances to 7 immediately; the operator can then click back to step 5 to revisit OpEx. Acceptable.
- **Animations / transitions** between steps: existing logic. Async click adds a few ms of awaiting; UX should still feel instantaneous.
- **No soak window:** dropping the feature-flag staging means a regression in StepBar lands directly in production with B5. Mitigation: comprehensive test coverage (3 unit tests below) + T16 manual QA before B5 merges.

## Estimated effort

0.75 day (StepBar rewrite + ForecastWizardV4 glue + saveDraft + tests).

## Tests

`src/__tests__/forecast/phase-57-clickable-nav.test.tsx` (~60 lines):

```typescript
describe('Phase 57 clickable StepBar', () => {
  it('only steps 1-N clickable when maxVisitedStep=N', () => {
    // Mount StepBar with maxVisitedStep=4; assert clicks on 1-4 fire onStepClickAsync, 5-9 do not
  });

  it('renders amber dot for incomplete past steps', () => {
    // Mount with state where step 3 is visited but revenueLines empty; assert amber dot rendered on slot 3
  });

  it('parent flush-saves Step 5 before navigating away', async () => {
    // Render full wizard at currentStep=5; mock subscriptionsStepRef.flushPendingSaves; click step 6
    // Expect flushPendingSaves called once before goToStep
  });
});
```
