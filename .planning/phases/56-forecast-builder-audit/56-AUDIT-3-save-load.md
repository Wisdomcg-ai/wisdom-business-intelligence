# Audit 3 — Save/Load + State Integrity

## P0 — Ship blockers (data loss / corruption / divergence)

### A1 — Orphaned localStorage drafts when API save fails
- **File:** useForecastWizard.ts:207-218 + ForecastWizardV4.tsx:1482-1518
- **Bug:** Wizard auto-saves to localStorage every 500ms. API save (`/api/forecast-wizard-v4/generate`) is separate. If API fails silently, user's localStorage holds a draft the server never received.
- **Risk:** User believes work is saved; reload shows stale draft; server has nothing.

### A2 — Summary recomputation race on load
- **File:** ForecastWizardV4.tsx:893-1001 + useForecastWizard.ts:1042
- **Bug:** After `initializeFromXero()`, a `setTimeout(..., 0)` chain restores saved assumptions (line 893). During this race, `summary` useMemo computes from freshly-initialized state BEFORE saved assumptions land. Save during this window captures wrong summary.
- **Risk:** Revenue/profit numbers silently drift after save+reload.

### A3 — activeYear > forecastDuration not validated on restore
- **Bug:** No validation that restored `activeYear <= forecastDuration`. A 3-year forecast restored as `activeYear:3, forecastDuration:1` → undefined month references → UI crashes / corrupted rollups.

### A4 — Team member deletion orphans commissions/departures
- **File:** useForecastWizard.ts:502-510
- **Bug:** Delete cascades to departures/bonuses/commissions in current state. But if forecast saved BEFORE deletion and restored AFTER, saved assumptions still reference the dead member ID.
- **Risk:** UI crashes or silent ignored departures/commissions.

### A5 — Concurrent save race on `active_forecast` unique index
- **File:** src/app/api/forecast-wizard-v4/generate/route.ts:135-145
- **Bug:** Two concurrent requests both deactivate old forecasts then insert new ones. Race timing can leave both with `is_active=true`. Partial unique index only catches if the second INSERT completes before the first.
- **Risk:** Multiple active forecasts per FY. Coach dashboard shows incorrect state.

### A6 — Planned spends NOT restored on load (CapEx/lease silent loss)
- **File:** ForecastWizardV4.tsx — no restoration code for `plannedSpends`
- **Bug:** `buildAssumptions` saves `plannedSpends` (line 1475) but the load path never restores them from saved assumptions.
- **Risk:** Silent loss of CapEx/lease items on every reload. Step 6 work disappears.

### A7 — Quarterly-to-monthly conversion preference picks corrupted values
- **File:** buildAssumptions lines 1343-1344, types.ts:154-159
- **Bug:** Save stores both monthly AND quarterly. Load prefers quarterly as fallback. If quarterly sums are wrong (month-order issue), the corrupted values are used instead of recomputing from monthly.
- **Risk:** Silent arithmetic divergence in rollups.

### A8 — No assumptions schema version validation
- **File:** buildAssumptions line 1419, RPC `save_assumptions_and_materialize`
- **Bug:** Always saved with `version: 1`, no migration logic on load.
- **Risk:** Inability to evolve schema safely; breaking changes to old forecasts.

## P1 — Confusing edge cases

### B1 — startFresh clears draft but not auto-discovered forecast
- **File:** ForecastWizardV4.tsx:86-88, 521-534
- **Bug:** Even though PR #106 fixed the auto-discover bypass, the loading path may still pull data from a discovered forecast in some edge cases. Worth re-verifying.

### B2 — WIZARD_VERSION bump loses all drafts
- **File:** useForecastWizard.ts:53, 131
- **Bug:** Version mismatch returns null. No upgrade path. Bumping forces all users to lose in-progress drafts.

### B3 — Departures cascade broken on reload
- **Bug:** Saved departure can reference a team member no longer in Xero/wizard. Restored as orphan.

### B4 — "Is it saved?" UX ambiguity
- **Bug:** Three async paths (localStorage, saveDraft, generate) with single `isSaving` feedback. User can't tell which succeeded.

### B5 — otherIncome/otherExpenses preservation fragile
- **File:** ForecastWizardV4.tsx:280-287
- **Bug:** If API drops the field, cached value persists. If actual Xero value is now 0, old value sticks.

### B6 — Concurrent tab edits — no conflict detection
- **File:** generate/route.ts:116-133
- **Bug:** No optimistic locking; last-write-wins silently.

## P2 — Polish

- **C1:** Derived fields recalculated on reload — UI flicker
- **C2:** No audit log of save/load operations
- **C3:** Bonus/commission restore doesn't validate referenced IDs
- **C4:** `annualDepreciation` redundantly recalculated
- **C5:** Revenue goal vs line total inconsistency not validated

## Summary

- **8 P0 ship blockers** — A6 (planned spends loss) is the most operationally damaging.
- **6 P1 edge cases**
- **5 P2 polish**

Most dangerous: A6 (silent data loss on every reload), A2 (numbers drift), A1 (false-saved drafts), A5 (concurrent saves create dual actives).
