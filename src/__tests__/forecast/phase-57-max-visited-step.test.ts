/**
 * Phase 57 T04 (B3) — `maxVisitedStep` state-machine tests.
 *
 * `maxVisitedStep` tracks the highest step the operator has reached. Used by
 * StepBar (T13, B5) to determine which step buttons are clickable: any step
 * whose number is <= maxVisitedStep can be jumped to. Forward steps stay
 * disabled until visited; once visited, they remain clickable forever.
 *
 * Invariants:
 *   1. Initialized to 1 by createInitialState (T03 added this default).
 *   2. nextStep() advances the ceiling monotonically.
 *   3. prevStep() does NOT decrease the ceiling.
 *   4. goToStep(N) advances the ceiling iff N > current ceiling; backward
 *      jumps don't lower it.
 *   5. T03 soft-migration carries the v10 currentStep forward as the initial
 *      ceiling (covered separately in phase-57-step-renumber-migration.test.ts).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForecastWizard } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';

const FY_START_YEAR = 2025;

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

describe('Phase 57 T04 — maxVisitedStep state machine', () => {
  it('initializes to 1 on a fresh forecast', () => {
    const { result } = renderHook(() => useForecastWizard(FY_START_YEAR, 'phase57-mvs-init'));
    expect(result.current.state.maxVisitedStep).toBe(1);
    expect(result.current.state.currentStep).toBe(1);
  });

  it('advances on nextStep — 1 → 2 → 3 → 4', () => {
    const { result } = renderHook(() => useForecastWizard(FY_START_YEAR, 'phase57-mvs-next'));

    act(() => result.current.actions.nextStep());
    expect(result.current.state.maxVisitedStep).toBe(2);

    act(() => result.current.actions.nextStep());
    expect(result.current.state.maxVisitedStep).toBe(3);

    act(() => result.current.actions.nextStep());
    expect(result.current.state.maxVisitedStep).toBe(4);

    expect(result.current.state.currentStep).toBe(4);
  });

  it('does NOT decrease on prevStep — ceiling persists past backward navigation', () => {
    const { result } = renderHook(() => useForecastWizard(FY_START_YEAR, 'phase57-mvs-prev'));

    // Advance to step 4, then walk back to 2.
    act(() => result.current.actions.nextStep()); // → 2
    act(() => result.current.actions.nextStep()); // → 3
    act(() => result.current.actions.nextStep()); // → 4
    expect(result.current.state.maxVisitedStep).toBe(4);

    act(() => result.current.actions.prevStep()); // → 3
    expect(result.current.state.maxVisitedStep).toBe(4);
    expect(result.current.state.currentStep).toBe(3);

    act(() => result.current.actions.prevStep()); // → 2
    expect(result.current.state.maxVisitedStep).toBe(4);
    expect(result.current.state.currentStep).toBe(2);
  });

  it('goToStep advances ceiling on forward jump (N > maxVisitedStep)', () => {
    const { result } = renderHook(() => useForecastWizard(FY_START_YEAR, 'phase57-mvs-goto-fwd'));

    act(() => result.current.actions.goToStep(7));
    expect(result.current.state.currentStep).toBe(7);
    expect(result.current.state.maxVisitedStep).toBe(7);
  });

  it('goToStep does NOT advance ceiling on backward jump (N <= maxVisitedStep)', () => {
    const { result } = renderHook(() => useForecastWizard(FY_START_YEAR, 'phase57-mvs-goto-back'));

    // Walk forward to step 5.
    act(() => result.current.actions.nextStep()); // → 2
    act(() => result.current.actions.nextStep()); // → 3
    act(() => result.current.actions.nextStep()); // → 4
    act(() => result.current.actions.nextStep()); // → 5
    expect(result.current.state.maxVisitedStep).toBe(5);

    // Jump back to step 2 — ceiling stays at 5.
    act(() => result.current.actions.goToStep(2));
    expect(result.current.state.currentStep).toBe(2);
    expect(result.current.state.maxVisitedStep).toBe(5);

    // Jump forward again to step 4 (still <= ceiling) — no change.
    act(() => result.current.actions.goToStep(4));
    expect(result.current.state.currentStep).toBe(4);
    expect(result.current.state.maxVisitedStep).toBe(5);
  });

  it('nextStep correctly handles the Step 8 skip on 1yr forecasts', () => {
    const { result } = renderHook(() => useForecastWizard(FY_START_YEAR, 'phase57-mvs-1yr'));

    // Set duration to 1yr — Step 8 (Growth Plan) gets skipped.
    act(() => result.current.actions.setForecastDuration(1));

    // Walk through Step 7 → next should land on 9 (skip 8). The ceiling
    // should jump from 7 to 9 in one tick — no intermediate 8.
    act(() => result.current.actions.goToStep(7));
    expect(result.current.state.maxVisitedStep).toBe(7);

    act(() => result.current.actions.nextStep());
    expect(result.current.state.currentStep).toBe(9);
    expect(result.current.state.maxVisitedStep).toBe(9);
  });

  it('prevStep on 1yr forecast skips Step 8 in reverse — ceiling unchanged', () => {
    const { result } = renderHook(() => useForecastWizard(FY_START_YEAR, 'phase57-mvs-1yr-prev'));

    act(() => result.current.actions.setForecastDuration(1));
    act(() => result.current.actions.goToStep(9));
    expect(result.current.state.maxVisitedStep).toBe(9);

    // prevStep from 9 lands on 7 (skip 8). Ceiling stays 9.
    act(() => result.current.actions.prevStep());
    expect(result.current.state.currentStep).toBe(7);
    expect(result.current.state.maxVisitedStep).toBe(9);
  });

  it('nextStep is idempotent at the final step (9) — ceiling does not exceed 9', () => {
    const { result } = renderHook(() => useForecastWizard(FY_START_YEAR, 'phase57-mvs-final'));

    act(() => result.current.actions.goToStep(9));
    expect(result.current.state.maxVisitedStep).toBe(9);

    // Calling nextStep at step 9 should be a no-op.
    act(() => result.current.actions.nextStep());
    expect(result.current.state.currentStep).toBe(9);
    expect(result.current.state.maxVisitedStep).toBe(9);
  });
});
