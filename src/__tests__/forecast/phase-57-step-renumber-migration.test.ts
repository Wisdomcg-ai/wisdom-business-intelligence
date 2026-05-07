/**
 * Phase 57 T03 (B3) — Wizard v10 → v11 soft-migration tests.
 *
 * T03 bumps WIZARD_VERSION from 10 to 11 and adds a soft-migration block in
 * `loadStateFromStorage` that:
 *   1. Remaps `parsed.currentStep` 5↔6 (Phase 57 step swap — Subscriptions and
 *      OpEx switched slots; the migration carries the operator's intent
 *      forward so a draft last open on the OpEx step lands on the new OpEx
 *      step (now 6) and similarly for Subscriptions).
 *   2. Defaults `parsed.subscriptions = []` on legacy v10 drafts so downstream
 *      consumers (T07 rollup) cannot read undefined.
 *   3. Defaults `parsed.maxVisitedStep` to `parsed.currentStep || 1` so
 *      previously-visited steps stay clickable post-Phase-57 (T13, B5).
 *   4. Sets `parsed.needsAccountCodeRefresh = true` when any opexLine has
 *      `accountId` set but `accountCode` undefined — R6 mitigation flagging
 *      legacy drafts that would otherwise silently double-count subscription
 *      spend (Step 6 OpEx UI in T11/B4 prompts a Xero refresh).
 *
 * Critical invariant: the migration is read-only on the localStorage row
 * itself — `loadStateFromStorage` mutates the in-memory `parsed` object only.
 * The next autosave reserializes at v11. We test that a v11+ load is a no-op
 * and that v12 (newer than running code) returns null per the existing
 * downgrade-guard.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { loadStateFromStorage } from '@/app/finances/forecast/components/wizard-v4/useForecastWizard';

const BUSINESS_ID = 'phase57-mig-biz';
const FY_START = 2025;
const STORAGE_KEY = `forecast-wizard-v4-${BUSINESS_ID}-${FY_START}`;

/**
 * Minimal valid v10 draft. We only fill the fields the migration code reads;
 * downstream consumers (the rollup, the renderer) aren't exercised here.
 */
function makeV10Draft(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    wizardVersion: 10,
    businessId: BUSINESS_ID,
    fiscalYearStart: FY_START,
    status: 'draft',
    forecastDuration: 3,
    durationLocked: false,
    currentStep: 1,
    activeYear: 1,
    businessProfile: null,
    goals: {
      year1: { revenue: 0, grossProfitPct: 50, netProfitPct: 15 },
      year2: { revenue: 0, grossProfitPct: 52, netProfitPct: 17 },
      year3: { revenue: 0, grossProfitPct: 55, netProfitPct: 20 },
    },
    priorYear: null,
    currentYTD: null,
    revenuePattern: 'seasonal',
    revenueLines: [],
    cogsLines: [],
    teamMembers: [],
    newHires: [],
    departures: [],
    bonuses: [],
    commissions: [],
    defaultOpExIncreasePct: 3,
    opexLines: [],
    capexItems: [],
    investments: [],
    plannedSpends: [],
    otherExpenses: [],
    ...overrides,
  };
}

function seedV10Draft(overrides: Partial<Record<string, unknown>> = {}): void {
  const draft = makeV10Draft(overrides);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

beforeEach(() => {
  window.localStorage.clear();
  // Suppress the expected console.warn (version mismatch) and console.log
  // (migration trace) so test output stays clean. Keep error visible — any
  // error during migration would indicate a real bug.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Phase 57 T03 — wizard v10 → v11 step-swap migration', () => {
  it('remaps currentStep 5 (v10 OpEx) → 6 (v11 OpEx)', () => {
    seedV10Draft({ currentStep: 5 });
    const loaded = loadStateFromStorage(BUSINESS_ID, FY_START);
    expect(loaded).not.toBeNull();
    expect(loaded!.currentStep).toBe(6);
  });

  it('remaps currentStep 6 (v10 Subscriptions) → 5 (v11 Subscriptions)', () => {
    seedV10Draft({ currentStep: 6 });
    const loaded = loadStateFromStorage(BUSINESS_ID, FY_START);
    expect(loaded).not.toBeNull();
    expect(loaded!.currentStep).toBe(5);
  });

  it('leaves currentStep unchanged for steps 1-4 and 7-9', () => {
    for (const step of [1, 2, 3, 4, 7, 8, 9]) {
      window.localStorage.clear();
      seedV10Draft({ currentStep: step });
      const loaded = loadStateFromStorage(BUSINESS_ID, FY_START);
      expect(loaded).not.toBeNull();
      expect(loaded!.currentStep).toBe(step);
    }
  });

  it('defaults subscriptions = [] when missing on v10 draft', () => {
    seedV10Draft({ currentStep: 1 });
    const loaded = loadStateFromStorage(BUSINESS_ID, FY_START);
    expect(loaded).not.toBeNull();
    expect(loaded!.subscriptions).toEqual([]);
  });

  it('defaults maxVisitedStep to currentStep on v10 draft (preserves operator progress)', () => {
    // Operator was on Step 4 (Team) in v10 — should retain Step 4 ceiling
    // post-migration so they can navigate back to any earlier visited step
    // once T13 (B5) ships clickable nav.
    seedV10Draft({ currentStep: 4 });
    const loaded = loadStateFromStorage(BUSINESS_ID, FY_START);
    expect(loaded).not.toBeNull();
    expect(loaded!.maxVisitedStep).toBe(4);
  });

  it('maxVisitedStep tracks the REMAPPED step for v10@5 → v11@6', () => {
    // This is the subtle case: v10 draft on step 5 (OpEx) gets remapped to
    // step 6. The maxVisitedStep ceiling should follow the remap so the
    // operator can navigate back to any of steps 1-6.
    seedV10Draft({ currentStep: 5 });
    const loaded = loadStateFromStorage(BUSINESS_ID, FY_START);
    expect(loaded).not.toBeNull();
    expect(loaded!.currentStep).toBe(6);
    expect(loaded!.maxVisitedStep).toBe(6);
  });

  it('refuses v12+ drafts (downgrade guard — newer than running code)', () => {
    seedV10Draft({ wizardVersion: 12, currentStep: 5 });
    const loaded = loadStateFromStorage(BUSINESS_ID, FY_START);
    expect(loaded).toBeNull();
  });

  it('is a no-op on v11 drafts (already migrated)', () => {
    // Seed a v11 draft directly — no migration should run; currentStep
    // unchanged.
    const v11Draft = {
      ...makeV10Draft({ currentStep: 5, subscriptions: [] }),
      wizardVersion: 11,
      maxVisitedStep: 5,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v11Draft));

    const loaded = loadStateFromStorage(BUSINESS_ID, FY_START);
    expect(loaded).not.toBeNull();
    // Already on v11 — currentStep stays at 5 (no swap), no migration log.
    expect(loaded!.currentStep).toBe(5);
    expect(loaded!.maxVisitedStep).toBe(5);
  });
});

describe('Phase 57 T03 — needsAccountCodeRefresh flag (R6 mitigation)', () => {
  it('sets needsAccountCodeRefresh = true when ANY opexLine has accountId but no accountCode', () => {
    seedV10Draft({
      currentStep: 1,
      opexLines: [
        // Legacy line: accountId set, accountCode undefined.
        { id: 'a', name: 'Software', accountId: 'acc-1', priorYearAnnual: 12000, costBehavior: 'fixed', monthlyAmount: 1000 },
        // Already has code — would not trigger by itself.
        { id: 'b', name: 'Rent',     accountId: 'acc-2', accountCode: '5400', priorYearAnnual: 24000, costBehavior: 'fixed', monthlyAmount: 2000 },
      ],
    });

    const loaded = loadStateFromStorage(BUSINESS_ID, FY_START);
    expect(loaded).not.toBeNull();
    expect(loaded!.needsAccountCodeRefresh).toBe(true);
  });

  it('does NOT set needsAccountCodeRefresh when all opexLines have accountCode populated', () => {
    seedV10Draft({
      currentStep: 1,
      opexLines: [
        { id: 'a', name: 'Software', accountId: 'acc-1', accountCode: '5100', priorYearAnnual: 12000, costBehavior: 'fixed', monthlyAmount: 1000 },
        { id: 'b', name: 'Rent',     accountId: 'acc-2', accountCode: '5400', priorYearAnnual: 24000, costBehavior: 'fixed', monthlyAmount: 2000 },
      ],
    });

    const loaded = loadStateFromStorage(BUSINESS_ID, FY_START);
    expect(loaded).not.toBeNull();
    expect(loaded!.needsAccountCodeRefresh).toBeFalsy();
  });

  it('does NOT set needsAccountCodeRefresh on a draft with no opexLines yet', () => {
    seedV10Draft({ currentStep: 1, opexLines: [] });
    const loaded = loadStateFromStorage(BUSINESS_ID, FY_START);
    expect(loaded).not.toBeNull();
    expect(loaded!.needsAccountCodeRefresh).toBeFalsy();
  });

  it('does NOT set needsAccountCodeRefresh on lines that lack accountId entirely (manual-entry rows)', () => {
    // A row created via manual-entry mode has neither accountId nor
    // accountCode — should NOT be flagged because the operator never
    // associated it with a Xero account in the first place.
    seedV10Draft({
      currentStep: 1,
      opexLines: [
        { id: 'a', name: 'Manual entry', priorYearAnnual: 1200, costBehavior: 'fixed', monthlyAmount: 100 },
      ],
    });

    const loaded = loadStateFromStorage(BUSINESS_ID, FY_START);
    expect(loaded).not.toBeNull();
    expect(loaded!.needsAccountCodeRefresh).toBeFalsy();
  });
});
