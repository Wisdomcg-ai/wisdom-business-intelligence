---
phase: 59-forecast-seed-from-prior-fy
plan: "03"
subsystem: forecast
tags: [ui, empty-state, seed-flow, wizard, cta]
dependency_graph:
  requires: [POST /api/forecast/seed-from-prior, ForecastEmptyState-phase58]
  provides: [dual-CTA-empty-state, handleSeedForecast-handler]
  affects: [59-04-wizard-hydration]
tech_stack:
  added: []
  patterns: [useCallback-async-handler, conditional-dual-cta, isSeedingForecast-loading-gate]
key_files:
  created: []
  modified:
    - src/app/finances/forecast/components/ForecastEmptyState.tsx
    - src/app/finances/forecast/page.tsx
decisions:
  - "Critical decision 2 honored: wizardStartStep=1 (Goals first), NOT Step 3 — goals stripped from seed so operator sets new-year goals before reviewing seeded data"
  - "startFresh=true is the full localStorage handshake (research Q1+Q8) — no manual localStorage manipulation in handler"
  - "useCallback for handleSeedForecast with deps [businessId, selectedFiscalYear, forecast?.fiscal_year]"
  - "Dual CTA only renders when BOTH priorFiscalYearWithForecast AND onSeedForecast are truthy — component remains backward-compatible"
metrics:
  duration_seconds: 204
  completed_date: "2026-05-11"
  tasks_completed: 2
  files_created: 0
  files_modified: 2
---

# Phase 59 Plan 03: Empty-State Seed UI — Summary

## One-liner

Dual-CTA empty state: primary "Seed from FY{prior}" (orange, Sparkles) + secondary "Start FY{target} blank" (outline) wired via `handleSeedForecast` → POST /api/forecast/seed-from-prior → wizard opens on Step 1 with `startFresh=true`.

## What Was Built

### Task 1: `ForecastEmptyState.tsx` — dual-CTA layout

Added two new optional props to `ForecastEmptyStateProps`:

```typescript
onSeedForecast?: () => void
isSeedingForecast?: boolean
```

Conditional CTA block replaces the previous single-button block:
- **When `priorFiscalYearWithForecast && onSeedForecast` are both truthy:** renders `flex-col sm:flex-row gap-3` container with two buttons — primary seed (orange-600, Sparkles icon, disables on `isSeedingForecast`, shows "Seeding…") and secondary blank (white/gray outline, ArrowRight icon).
- **When either is falsy:** falls through to preserved single-CTA path (original `bg-brand-orange` button, identical to Phase 58 behavior).

The "view/edit FY{prior} forecast" text affordance below the CTAs is preserved unchanged — it uses `onSwitchFiscalYear` and is independent of the seed flow.

Lines modified in `ForecastEmptyState.tsx`:
- Interface: added 2 props (lines 41-48 of final file)
- Function signature: destructure `onSeedForecast`, `isSeedingForecast = false` (lines 78-79)
- CTA block: replaced single `<button>` with conditional `{ priorFiscalYearWithForecast && onSeedForecast ? <dual> : <single> }` (lines 130-172 of final file)

### Task 2: `page.tsx` — `handleSeedForecast` handler + state wiring

**New state** (after `wizardStartFresh`):
```typescript
const [isSeedingForecast, setIsSeedingForecast] = useState(false)
```

**`handleSeedForecast`** (async, `useCallback`, added before the `isNewForecast` check):
1. Guard: return if `!businessId` or no `targetFY`
2. `setIsSeedingForecast(true)`
3. `POST /api/forecast/seed-from-prior` with `{ businessId, targetFiscalYear: targetFY }`
4. Non-OK → `toast.error(payload?.error || 'Seed failed')`, return (wizard stays closed)
5. OK → extract `forecastId`, set state:
   - `setSelectedForecastId(forecastId)`
   - `setSelectedForecastName(null)`
   - `setWizardStartStep(1)` — **Critical decision 2** (Goals first, not Step 3)
   - `setWizardStartFresh(true)` — **Research Q1+Q8** localStorage handshake
   - `setShowWizardV4(true)`
6. `finally: setIsSeedingForecast(false)`

**`<ForecastEmptyState>` element** updated with two new props:
```tsx
onSeedForecast={handleSeedForecast}
isSeedingForecast={isSeedingForecast}
```

**`useCallback` added** to React import (was missing — `useState, useEffect, useRef, useMemo` before).

## Critical Decision Verification

| Decision | Verified |
|---|---|
| `setWizardStartStep(1)` inside handleSeedForecast | PASS — `grep -c "setWizardStartStep(1)" page.tsx` = 1 |
| `setWizardStartFresh(true)` inside handleSeedForecast | PASS — appears in seed flow AND preserved in blank flow |
| `/api/forecast/seed-from-prior` URL exactly once | PASS — `grep -c` = 1 |
| `onSeedForecast` in ForecastEmptyState.tsx | PASS — `grep -c` = 4 (interface, destructure, disabled prop, JSX onClick) |
| `isSeedingForecast` disables seed button | PASS — `disabled={isSeedingForecast}` in JSX |
| Single-CTA path preserved for no-prior-FY case | PASS — else branch preserves original button exactly |

## Deviations from Plan

None — plan executed exactly as written.

The plan specified `useCallback` — `useCallback` was not in the existing React import, so it was added (Rule 3: auto-fix blocking issue). This is documented here for completeness but is not a deviation from plan intent.

## Known Stubs

None. Both files are fully wired:
- `onSeedForecast` prop flows through to `handleSeedForecast` which calls the real POST endpoint
- The wizard opens with real `forecastId` + `wizardStartStep=1` + `wizardStartFresh=true`
- No placeholder data, no hardcoded values in UI paths

## Self-Check: PASSED
