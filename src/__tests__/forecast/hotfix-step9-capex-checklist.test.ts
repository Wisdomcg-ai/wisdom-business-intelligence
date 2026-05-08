/**
 * Hotfix 2026-05-07 — Step 9 (Review) checklist: CapEx step never registers
 * as complete.
 *
 * Bug: Step8Review.tsx checklist row 7 ("CapEx & Other") read
 * `state.capexItems.length > 0 || state.otherExpenses.length > 0`. The legacy
 * `capexItems` field is unused by Step6CapEx.tsx (which renders as Step 7 in
 * the post-Phase-57 ordering and writes to `state.plannedSpends`). Operators
 * who added CapEx items via the planned-spending UI never saw the checklist
 * flip green.
 *
 * Fix: predicate is now `maxVisitedStep >= 7` (operator visited the step)
 * with a data-presence fallback (`plannedSpends` OR legacy `capexItems` OR
 * `otherExpenses`). Zero planned spends is a valid forecast, so "visited"
 * is the right semantic — operators with no CapEx shouldn't be blocked from
 * generating their forecast.
 *
 * Why a render-free test: Step8Review pulls in recharts + an AI narrative
 * fetch effect that's expensive to mock. We mirror the predicate logic
 * verbatim and assert the full truth table. If Step8Review.tsx changes the
 * predicate, mirror the change here — these tests are the spec.
 */

import { describe, it, expect } from 'vitest';
import type { WizardStep } from '@/app/finances/forecast/components/wizard-v4/types';

// Mirror of the `capexStepComplete` predicate in Step8Review.tsx.
// Keep this in sync with the implementation.
function isCapexStepComplete(state: {
  maxVisitedStep: WizardStep;
  plannedSpends: unknown[];
  capexItems: unknown[];
  otherExpenses: unknown[];
}): boolean {
  return (
    state.maxVisitedStep >= 7
    || state.plannedSpends.length > 0
    || state.capexItems.length > 0
    || state.otherExpenses.length > 0
  );
}

function makeState(overrides: Partial<Parameters<typeof isCapexStepComplete>[0]> = {}) {
  return {
    maxVisitedStep: 1 as WizardStep,
    plannedSpends: [] as unknown[],
    capexItems: [] as unknown[],
    otherExpenses: [] as unknown[],
    ...overrides,
  };
}

describe('Step 9 checklist — CapEx step completion', () => {
  it('regression: completes when operator added planned spends (the bug fix)', () => {
    // Pre-fix: this returned false because the predicate read capexItems
    // (legacy/unused) instead of plannedSpends (the actual storage field).
    expect(
      isCapexStepComplete(
        makeState({ plannedSpends: [{ id: 'ps1' }] }),
      ),
    ).toBe(true);
  });

  it('completes when operator visited Step 7 even with zero planned spends', () => {
    // Forecasts with no CapEx are valid — visiting the step is enough.
    expect(
      isCapexStepComplete(makeState({ maxVisitedStep: 7 as WizardStep })),
    ).toBe(true);
  });

  it('completes when operator reached Step 8 (later steps imply Step 7 was visited)', () => {
    expect(
      isCapexStepComplete(makeState({ maxVisitedStep: 8 as WizardStep })),
    ).toBe(true);
    expect(
      isCapexStepComplete(makeState({ maxVisitedStep: 9 as WizardStep })),
    ).toBe(true);
  });

  it('legacy v10 drafts: completes via capexItems fallback', () => {
    // A v10 draft saved before plannedSpends existed may still have items
    // in the legacy capexItems field. The predicate falls back to it so
    // those operators see the green checkmark.
    expect(
      isCapexStepComplete(
        makeState({ capexItems: [{ id: 'old1' }] }),
      ),
    ).toBe(true);
  });

  it('completes when otherExpenses exist (Step 7 is "CapEx & Other")', () => {
    expect(
      isCapexStepComplete(
        makeState({ otherExpenses: [{ id: 'oe1' }] }),
      ),
    ).toBe(true);
  });

  it('does NOT complete for a brand-new forecast that has not reached Step 7', () => {
    // Operator on Step 1, nothing entered yet → Step 7 should still be grey.
    expect(
      isCapexStepComplete(makeState({ maxVisitedStep: 1 as WizardStep })),
    ).toBe(false);
    expect(
      isCapexStepComplete(makeState({ maxVisitedStep: 6 as WizardStep })),
    ).toBe(false);
  });
});
