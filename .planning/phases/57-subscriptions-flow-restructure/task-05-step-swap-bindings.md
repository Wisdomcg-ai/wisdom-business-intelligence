# Task 05 — Swap WIZARD_STEPS[5]↔[6] + renderStep switch

**Ship batch:** B3 (Wizard step swap) · **Wave:** 3 · **Dependencies:** T03 · **Risk:** LOW

## Goal

Make Subscriptions step 5 and OpEx step 6 in the rendered wizard. Swap two entries in `WIZARD_STEPS`, swap two cases in the `renderStep()` switch. Per CONTEXT.md decision: **keep the label "OpEx"** (do NOT rename to "Discretionary OpEx").

## Files modified

- `src/app/finances/forecast/components/wizard-v4/types.ts` (~10 lines)
  - `WIZARD_STEPS` (line 854-864): swap entries at indices 4 and 5 (the array entries with `step: 5` and `step: 6`)
- `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` (~5 lines)
  - `renderStep()` switch (line 1555-1573): swap the components rendered at `case 5:` and `case 6:`

## Implementation notes

### WIZARD_STEPS swap

Before:
```typescript
{ step: 5, label: 'OpEx', shortLabel: '5' },
{ step: 6, label: 'Subscriptions', shortLabel: '6' },
```

After:
```typescript
// Phase 57: Subscriptions placed before OpEx so the operator sees subscription
// commitments before they budget discretionary expenses. The Step5OpEx component
// (file name unchanged for git history) renders at step 6 and Step6Subscriptions
// renders at step 5. CONTEXT.md decision: keep label "OpEx" (do NOT rename).
{ step: 5, label: 'Subscriptions', shortLabel: '5' },
{ step: 6, label: 'OpEx', shortLabel: '6' },
```

### renderStep switch

Before (`ForecastWizardV4.tsx:1564-1567`):
```typescript
case 5:
  return <Step5OpEx state={state} actions={actions} fiscalYear={fiscalYear} industry={state.businessProfile?.industry} />;
case 6:
  return <Step6Subscriptions state={state} actions={actions} fiscalYear={fiscalYear} businessId={businessId} />;
```

After:
```typescript
// Phase 57: Subscriptions before OpEx. File names unchanged for git history.
case 5:
  return <Step6Subscriptions state={state} actions={actions} fiscalYear={fiscalYear} businessId={businessId} />;
case 6:
  return <Step5OpEx state={state} actions={actions} fiscalYear={fiscalYear} industry={state.businessProfile?.industry} />;
```

### File name strategy

**Do not rename `Step5OpEx.tsx` to `Step6OpEx.tsx`** — the diff explodes (1613 lines moved), git blame breaks, and the file name has been wrong since at least Phase 51 (`Step6CapEx.tsx` already renders as Step 7). Add a top-of-file comment:

```typescript
// Step5OpEx.tsx
// Phase 57: This component renders at the OpEx step, which is now step 6 (was step 5).
// File name retained for git-history continuity. See WIZARD_STEPS in ../types.ts.
```

Mirror in `Step6Subscriptions.tsx`:
```typescript
// Step6Subscriptions.tsx
// Phase 57: This component renders at step 5 (was step 6). File name retained
// for git-history continuity.
```

## Acceptance criteria

- [ ] `WIZARD_STEPS[4]` is `{ step: 5, label: 'Subscriptions', shortLabel: '5' }`
- [ ] `WIZARD_STEPS[5]` is `{ step: 6, label: 'OpEx', shortLabel: '6' }`
- [ ] `renderStep()` case 5 returns `<Step6Subscriptions />`, case 6 returns `<Step5OpEx />`
- [ ] StepBar renders "Subscriptions" at slot 5, "OpEx" at slot 6
- [ ] On a v11 fresh forecast, `nextStep()` × 4 lands on Subscriptions UI
- [ ] On a v11 fresh forecast, `nextStep()` × 5 lands on OpEx UI (BudgetFramework visible)
- [ ] No new tsc errors; `npm run build` clean
- [ ] All existing tests pass (some Phase 51 tests will need T06 follow-ups for hardcoded step refs)

## Regression risks

- **Phase 51 tests with hardcoded step assertions** (e.g., `phase-51-step5-labels.test.tsx`, `phase-51-step6-sidebar.test.tsx`) — these assert "step 5 has label OpEx" etc. They will fail after this task. Update them in T06 (the renumber sweep). For B3 deploy, mark them temporarily skipped with a TODO referencing T06 if T06 isn't ready in the same PR; otherwise update inline.
- **`isLastStep` and similar boolean derivations** — unaffected (still based on `currentStep === 9`).
- **YearTabs gate** — currently `[3, 4, 5].includes(...)`. After swap, step 5 is Subscriptions which is Y1-only — should NOT show year tabs. Step 6 is OpEx and SHOULD. T06 handles this update.

## Estimated effort

0.5 day (small mechanical change, but careful test review).
