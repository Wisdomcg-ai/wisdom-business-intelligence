# Task 03 — Bump WIZARD_VERSION 10→11 + soft-migrate v10 drafts

**Ship batch:** B3 (Migration + step swap, atomic) · **Wave:** 2 · **Dependencies:** T01, T02 · **Risk:** MEDIUM (data integrity for in-flight drafts)

## Goal

Bump `WIZARD_VERSION` from 10 to 11. Add a soft-migration block so drafts saved at v10 (where `currentStep: 5` meant "OpEx") load correctly into v11 (where `currentStep: 5` means "Subscriptions"). Without this, every operator with an in-flight draft lands on the wrong step on first reload after Phase 57 deploys.

Also flag legacy drafts whose OpEx lines are missing `accountCode` (drafts created before Phase 57's T01 ingest change). These forecasts cannot benefit from accountCode-based exclusion until the operator refreshes from Xero — see R6 in the risk register and the Step 6 nudge banner in T11.

## Why this is foolproof

This is the highest-risk single edit in Phase 57. A bad migration silently corrupts every active draft. The mitigation is:
1. The migration is read-only on v10 data — we mutate `parsed.currentStep` AFTER asserting `storedVersion < 11`, never the localStorage row itself
2. We test on a fixture before deploying
3. The soft-migration pattern is already proven (Phase 56 P1c B2, see `useForecastWizard.ts:168-197`)
4. We log the migration to console so production telemetry can confirm it ran on real drafts

## Files modified

- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts` (~40 lines)
  - Line 53: `const WIZARD_VERSION = 11;` with a comment block explaining the v11 changes
  - Inside `loadStateFromStorage` (~line 188, after the version-mismatch warning, before `parsed.migratedFromVersion = storedVersion`): insert the migration logic
- `src/app/finances/forecast/components/wizard-v4/types.ts` (~3 lines)
  - Add `needsAccountCodeRefresh?: boolean` to `ForecastWizardState`
- `src/__tests__/forecast/phase-57-step-renumber-migration.test.ts` (new, ~100 lines)
  - Three fixtures: v10@step5 → v11@step6, v10@step6 → v11@step5, v10@step1 → v11@step1 (no-op control)
  - Verify `parsed.subscriptions === []` after migration if the v10 fixture lacked the field (defensive default from T02)
  - Verify `accountCode` stays undefined on legacy `opexLines` (T01 only populates on Xero ingest, not retroactively)
  - Verify `parsed.needsAccountCodeRefresh === true` when v10 fixture has opexLines with `accountId` set but `accountCode` undefined

## Implementation notes

### The bump

```typescript
// Phase 57: step 5↔6 swap (Subscriptions before OpEx). Bump from 10 → 11.
// Soft-migration block below remaps stored currentStep so in-flight drafts
// land on the correct step. Also defaults state.subscriptions = [] for drafts
// saved before T02 added the field. Also flags drafts whose opexLines lack
// accountCode (pre-T01 ingest) so the Step 6 UI can prompt a Xero refresh.
const WIZARD_VERSION = 11;
```

### The migration block

Insert at `useForecastWizard.ts:~188`, after:
```typescript
parsed.migratedFromVersion = storedVersion;
```

Add (BEFORE that line so we can branch on storedVersion before the assignment):
```typescript
// Phase 57 (v10 → v11): step 5 swapped with step 6.
// In v10: step 5 = OpEx, step 6 = Subscriptions
// In v11: step 5 = Subscriptions, step 6 = OpEx (per CONTEXT.md locked decision)
// Remap currentStep so a draft last open on the OpEx step continues to
// land on OpEx (now step 6), and similarly for Subscriptions.
if (storedVersion !== undefined && storedVersion < 11) {
  if (parsed.currentStep === 5) {
    console.log('[ForecastWizard] Phase 57 migration: currentStep 5 → 6 (OpEx kept its meaning, just moved one slot right)');
    parsed.currentStep = 6;
  } else if (parsed.currentStep === 6) {
    console.log('[ForecastWizard] Phase 57 migration: currentStep 6 → 5 (Subscriptions kept its meaning, just moved one slot left)');
    parsed.currentStep = 5;
  }
  // Steps 1-4, 7-9 unchanged

  // T02 default — subscriptions field added post-v10
  if (parsed.subscriptions === undefined) {
    parsed.subscriptions = [];
  }

  // T04 default — maxVisitedStep added in v11
  if (parsed.maxVisitedStep === undefined) {
    parsed.maxVisitedStep = parsed.currentStep || 1;
  }

  // R6 mitigation: legacy opexLines lack accountCode (T01 only populates on
  // fresh Xero ingest, not retroactively). Flag the draft so Step 6 OpEx UI
  // can render a "Refresh from Xero" nudge banner. The nudge cleared by
  // re-ingesting from /api/Xero/chart-of-accounts.
  if (Array.isArray(parsed.opexLines)) {
    const hasLegacyOpexLine = parsed.opexLines.some(
      (line: any) => line && line.accountCode === undefined && line.accountId !== undefined
    );
    if (hasLegacyOpexLine) {
      parsed.needsAccountCodeRefresh = true;
      console.log('[ForecastWizard] Phase 57 migration: legacy opexLines detected (missing accountCode). Set needsAccountCodeRefresh=true so Step 6 prompts a Xero refresh.');
    }
  }
}
```

### Test fixtures

`src/__tests__/forecast/phase-57-step-renumber-migration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Test the migration logic in isolation by exercising loadStateFromStorage
// (export it for testing if not already exposed; otherwise simulate via
// localStorage seed + hook mount).

describe('Phase 57 wizard v10 → v11 migration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('remaps currentStep 5 (v10 OpEx) to 6 (v11 OpEx)', () => {
    const v10Draft = {
      wizardVersion: 10,
      businessId: 'biz-1',
      fiscalYearStart: 2025,
      currentStep: 5,
      opexLines: [{ id: 'a', accountId: 'Software' }],
      // ... minimal valid v10 shape ...
    };
    localStorage.setItem('forecast-wizard-v4-biz-1-2025', JSON.stringify(v10Draft));

    // Trigger load — exact API depends on hook export shape
    const loaded = loadStateFromStorage('biz-1', 2025);

    expect(loaded?.currentStep).toBe(6);
    expect(loaded?.subscriptions).toEqual([]);
    expect(loaded?.maxVisitedStep).toBe(6);
  });

  it('remaps currentStep 6 (v10 Subscriptions) to 5 (v11 Subscriptions)', () => {
    const v10Draft = { wizardVersion: 10, businessId: 'biz-1', fiscalYearStart: 2025, currentStep: 6 };
    localStorage.setItem('forecast-wizard-v4-biz-1-2025', JSON.stringify(v10Draft));

    const loaded = loadStateFromStorage('biz-1', 2025);

    expect(loaded?.currentStep).toBe(5);
  });

  it('leaves currentStep unchanged for steps 1-4, 7-9', () => {
    for (const step of [1, 2, 3, 4, 7, 8, 9]) {
      localStorage.clear();
      const v10Draft = { wizardVersion: 10, businessId: 'biz-1', fiscalYearStart: 2025, currentStep: step };
      localStorage.setItem('forecast-wizard-v4-biz-1-2025', JSON.stringify(v10Draft));
      const loaded = loadStateFromStorage('biz-1', 2025);
      expect(loaded?.currentStep).toBe(step);
    }
  });

  it('defaults subscriptions=[] when missing', () => {
    const v10Draft = { wizardVersion: 10, businessId: 'biz-1', fiscalYearStart: 2025, currentStep: 1 };
    localStorage.setItem('forecast-wizard-v4-biz-1-2025', JSON.stringify(v10Draft));

    const loaded = loadStateFromStorage('biz-1', 2025);
    expect(loaded?.subscriptions).toEqual([]);
  });

  it('refuses v12+ drafts (newer than running code)', () => {
    const v12Draft = { wizardVersion: 12, businessId: 'biz-1', fiscalYearStart: 2025, currentStep: 5 };
    localStorage.setItem('forecast-wizard-v4-biz-1-2025', JSON.stringify(v12Draft));

    const loaded = loadStateFromStorage('biz-1', 2025);
    expect(loaded).toBeNull();
  });

  it('sets needsAccountCodeRefresh=true when legacy opexLines lack accountCode', () => {
    const v10Draft = {
      wizardVersion: 10,
      businessId: 'biz-1',
      fiscalYearStart: 2025,
      currentStep: 1,
      opexLines: [
        { id: 'a', accountId: 'Software' },                       // legacy: accountId set, no accountCode
        { id: 'b', accountId: 'Rent', accountCode: '5400' },      // already has code (somehow)
      ],
    };
    localStorage.setItem('forecast-wizard-v4-biz-1-2025', JSON.stringify(v10Draft));

    const loaded = loadStateFromStorage('biz-1', 2025);
    expect(loaded?.needsAccountCodeRefresh).toBe(true);
  });

  it('does NOT set needsAccountCodeRefresh when all opexLines have accountCode', () => {
    const v10Draft = {
      wizardVersion: 10,
      businessId: 'biz-1',
      fiscalYearStart: 2025,
      currentStep: 1,
      opexLines: [
        { id: 'a', accountId: 'Software', accountCode: '5100' },
        { id: 'b', accountId: 'Rent', accountCode: '5400' },
      ],
    };
    localStorage.setItem('forecast-wizard-v4-biz-1-2025', JSON.stringify(v10Draft));

    const loaded = loadStateFromStorage('biz-1', 2025);
    expect(loaded?.needsAccountCodeRefresh).toBeFalsy();
  });
});
```

If `loadStateFromStorage` is module-scoped (not exported), either:
- Export it for testing (preferred — already a testable pure function)
- Mount the hook and assert via observable state

## Acceptance criteria

- [ ] `WIZARD_VERSION = 11` with comment block explaining v11 changes
- [ ] Migration block correctly remaps step 5 ↔ 6 only when `storedVersion < 11`
- [ ] No remap on v11+ drafts (assert `storedVersion === 11` is a no-op)
- [ ] Subscriptions defaults to `[]` if missing
- [ ] maxVisitedStep defaults to `currentStep || 1` if missing (forward-compatible with T04)
- [ ] **On draft load, after the v10→v11 migration block, scan `parsed.opexLines`. If any line has `accountCode === undefined && accountId !== undefined`, set `parsed.needsAccountCodeRefresh = true`.** This flag is consumed by T11's Step 6 OpEx UI to render a "Refresh from Xero" nudge banner.
- [ ] `ForecastWizardState` type includes `needsAccountCodeRefresh?: boolean`
- [ ] All 7 test cases in `phase-57-step-renumber-migration.test.ts` pass (5 step migration + 2 needsAccountCodeRefresh)
- [ ] Manual smoke: seed a v10 draft in localStorage, load wizard, observe console log line + correct step
- [ ] No new tsc errors; `npm run build` clean

## Regression risks

- **Migration runs twice on the same draft:** mitigated by storing `parsed.migratedFromVersion = storedVersion` and the WIZARD_VERSION check on the next load — second load sees `storedVersion === 11`, skips the block.
- **Migration corrupts a v10 draft mid-load:** the migration mutates the in-memory `parsed` object only. It is then `setState`'d, the autosave reserializes at v11. The original v10 row in localStorage is overwritten with the v11 row by the next debounce.
- **Operator opens an old browser tab while another tab has v11:** the older tab still runs v10 code, sees v11 in localStorage, returns null per the existing `storedVersion > WIZARD_VERSION` guard. Operator gets a fresh draft. Acceptable — they'll lose the older tab's unsaved edits but that was always the case across version bumps.
- **needsAccountCodeRefresh false positive:** if a v10 draft happens to have ALL opexLines with accountCode set (unlikely given T01 only populates on fresh ingest), the flag stays false and no banner shows. Correct.

## Estimated effort

0.5 day.
