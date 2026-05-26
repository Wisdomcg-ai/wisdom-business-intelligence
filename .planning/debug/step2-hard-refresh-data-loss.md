---
status: diagnosed
trigger: "Step 2 (Prior Year) data not pulling through after hard refresh — JDS tenant"
created: 2026-05-07T00:00:00Z
updated: 2026-05-07T00:00:00Z
---

## Current Focus

hypothesis: `setPriorYear` is called from the always-on Xero refresh after hard refresh; if the API response is degenerate (empty `revenue_lines`, missing `byMonth`, or `revenue.total` truthy but `byLine.length === 0`), it overwrites the cached good data — and additionally clobbers `revenueLines/cogsLines/opexLines` user customizations every time
test: Read Step2PriorYear.tsx, useForecastWizard.ts (loadStateFromStorage, setPriorYear, initializeFromXero, saveStateToStorage), ForecastWizardV4.tsx loadData effect, and the pl-summary API
expecting: Identify which exact data path drops fields after refresh
next_action: Diagnose complete — write findings

## Symptoms

expected: After hard refresh on the forecast wizard at Step 2, the prior year Xero P&L data should still display (either restored from localStorage draft or re-fetched from Xero) without losing fields, monthly breakdowns, or per-line composition
actual: Step 2 info doesn't pull through correctly after hard refresh
errors: (none reported)
reproduction: Open forecast wizard for JDS, navigate to Step 2 with prior year data loaded, hard refresh (Cmd+Shift+R)
started: Recent — likely after Phase 57 (B3 migration #131 / version bump 10→11) or Phase 44.2 (always-replace-priorYear behaviour)
---

## Eliminated

(none — diagnosis-only mode, no hypothesis fully tested experimentally)

## Evidence

- timestamp: 2026-05-07
  checked: useForecastWizard.ts saveStateToStorage (line 365-373) and loadStateFromStorage (line 186-362)
  found: localStorage persists the ENTIRE state via `JSON.stringify({ ...state, wizardVersion: 11 })`. priorYear (with byMonth, byLine, seasonalityPattern, otherIncome, otherExpenses) IS in the saved blob and IS restored synchronously by useState's initializer. So priorYear-from-cache survives hard refresh; auto-save allow-list hypothesis is wrong.
  implication: localStorage hydration is NOT the bug. Step 2 has a non-null priorYear on first paint after refresh.

- timestamp: 2026-05-07
  checked: ForecastWizardV4.tsx loadData effect (lines 92-1190, dep array `[businessId]`)
  found: Effect runs once on mount. `hasRestoredData` branch at line 112 fires when localStorage restored data exists (state.priorYear !== null). Inside that branch, line 244 ALWAYS re-fetches `/api/Xero/pl-summary` and calls `actionsRef.current.setPriorYear(freshPriorYear)` at line 315 — UNCONDITIONALLY (Phase 44.2 commit comment confirms this gate change at lines 304-314).
  implication: After every hard refresh, priorYear is overwritten by whatever pl-summary returns, regardless of what cache had.

- timestamp: 2026-05-07
  checked: useForecastWizard.ts setPriorYear (line 591-715)
  found: Returns `{ ...prev, priorYear: data, revenueLines, cogsLines, opexLines }` — **ALWAYS** rebuilds `revenueLines/cogsLines/opexLines` from scratch using `data.X.byLine`. This is destructive: any user customisation to revenue splits, COGS line cost-behaviour overrides, or OpEx monthlyAmount edits at Step 3/5/6 is wiped on every hard refresh, because Phase 44.2 made the upstream call unconditional.
  implication: Hard refresh runs setPriorYear → setPriorYear blows away revenueLines/cogsLines/opexLines. If the user previously edited those, they reset to the API-derived defaults. From Matt's POV, "Step 2 not pulling through correctly" can read as "what I had at Steps 3/5/6 vanished" — because Step 2's display IS correct (it shows fresh Xero totals) but downstream lines lost their user inputs.

- timestamp: 2026-05-07
  checked: ForecastWizardV4.tsx lines 304-339, gate logic on initializeFromXero
  found: Comment at line 304-314 explicitly states the gate was changed to ALWAYS replace cached priorYear. The remaining gate (line 321) only protects the `initializeFromXero` re-init step (which preserves user-line splits when revenue is unchanged). But `setPriorYear` itself runs unconditionally and rebuilds lines anyway. The two paths conflict: setPriorYear destroys user splits; the gate to skip initializeFromXero is moot.
  implication: The "preserve user-line splits" gate is dead code under the new always-replace policy. The user's Step 3/5/6 work is lost on every hard refresh once Step 2 is non-empty.

- timestamp: 2026-05-07
  checked: Step2PriorYear.tsx render path (lines 437-493 buildMonthlyComparison, line 444 hasMonthlyData)
  found: Step 2 monthly tables read `priorYear.revenue.byMonth[monthKey]` where monthKey is `YYYY-MM` for the prior fiscal year (e.g., 2024-07 for FY2025). When `byMonth` is empty (e.g., the cache→saved-assumptions reconstruction at ForecastWizardV4 line 376-445 explicitly sets `byMonth: {}` for revenue/cogs/opex), `hasMonthlyData = false` and the table falls back to seasonality-derived synthetic monthly numbers from the annual total. This is the "looks wrong" symptom — totals are correct, but monthly columns show flattened/synthetic data instead of actual monthly Xero values.
  implication: If on a previous load the saved-forecast fallback (line 373-451 of ForecastWizardV4) populated priorYear without byMonth, that empty `byMonth: {}` is then persisted to localStorage. On hard refresh, the always-on Xero refresh SHOULD overwrite it with real byMonth — UNLESS pl-summary returns a degenerate response (no_sync, partial_sync, or empty xero_pl_lines for FY2025). On JDS specifically, FY2025 data can be flagged `no_sync` while xero_pl_lines still hold last-good rows (Step 2's own banner-suppression comment confirms this case at line 760-762).

- timestamp: 2026-05-07
  checked: ForecastWizardV4.tsx fallback path (lines 373-445, "loading from saved forecast")
  found: When localStorage's priorYear is missing but a forecast row exists (`resolvedId`), this path calls `actionsRef.current.setPriorYear(priorYear)` with a reconstructed object where `byMonth: {}` is empty for revenue/cogs/opex (lines 388, 397, 423, 429), and `seasonalityPattern` is `Array(12).fill(100/12)` if not stored (line 432-434). This produces a flat-distribution monthly table.
  implication: This fallback intentionally ships flat monthly data. If a user landed on Step 2 the first time via this path, then hard-refreshed, the localStorage now contains priorYear with empty byMonth. The Xero refresh on next load is supposed to fix this — but only fires if the connection resolves correctly (pl-summary returns prior_fy with revenue_by_month non-empty). On JDS the dual-business-id pattern can cause Xero connection lookup to misroute (per memory note "businesses.id vs business_profiles.id"), and the route at /api/Xero/pl-summary line 58 calls `resolveXeroBusinessId(supabase, businessId)`. If that returns no connection, the API returns `{ summary: { has_xero_data: false } }` (line 60-63), and ForecastWizardV4 line 250 short-circuits (`if (freshPriorFY && freshPriorFY.total_revenue != null)`) — leaving the empty-byMonth cache intact.

- timestamp: 2026-05-07
  checked: ForecastWizardV4.tsx Step2 dual API call (Step2PriorYear.tsx line 191-208 vs ForecastWizardV4.tsx line 246)
  found: Step 2's own `loadCurrentYTD` at Step2 line 191 ALSO fetches `/api/Xero/pl-summary` for current_ytd. It does NOT use prior_fy from this response — it only reads `data.summary?.current_ytd` and `data.summary?.data_quality`. So Step 2 ignores the prior_fy field on this fetch.
  implication: Even if pl-summary returns valid prior_fy on the Step2-mount fetch, Step 2 does not use it to refresh priorYear. The wizard-level fetch at ForecastWizardV4 line 246 is the only path that updates priorYear, and it only runs once on mount via the [businessId]-deps effect. So if that one shot fails or returns degenerate data, priorYear stays stale until the user navigates away/back to the wizard or clears localStorage.

## Resolution

root_cause: Three interacting issues compound on hard refresh.

**Primary (severity: HIGH — data loss):**
`useForecastWizard.ts` `setPriorYear` (lines 591-715) UNCONDITIONALLY rebuilds `revenueLines/cogsLines/opexLines` from `data.X.byLine` and returns those alongside `priorYear` (line 707-713). Combined with `ForecastWizardV4.tsx` line 304-315 — which Phase 44.2 changed to ALWAYS call `setPriorYear(freshPriorYear)` regardless of whether revenue changed — every hard refresh wipes the user's Step 3/5/6 customisations (revenue split adjustments, COGS cost-behaviour switches between fixed/variable, OpEx monthlyAmount overrides, accountCode-based subscription exclusions). The "gate" at line 321 that was meant to preserve user-line splits is now dead code: the splits are already destroyed by `setPriorYear` before the gate decides whether to skip `initializeFromXero`.

**Secondary (severity: MEDIUM — display-only):**
The "load from saved forecast assumptions" fallback at `ForecastWizardV4.tsx` lines 373-451 reconstructs priorYear with `byMonth: {}` (empty) for revenue/cogs/opex (lines 388, 397, 423, 429). When this populates state and then is auto-saved to localStorage, subsequent hard refreshes display flat seasonality-derived monthly data instead of actuals — until/unless the Xero refresh path successfully replaces it.

**Tertiary (severity: MEDIUM — JDS-specific):**
On JDS specifically, the dual-business-id issue (per memory note) can cause `/api/Xero/pl-summary` to return `{ has_xero_data: false }` when `resolveXeroBusinessId` doesn't find a connection for the queried id form. ForecastWizardV4 line 250 short-circuits silently (`if (freshPriorFY && freshPriorFY.total_revenue != null)`), leaving stale/empty cache in place with no user-visible error. Step 2's own banner suppresses 'no_sync' (line 760-762) when YTD is populated, masking the underlying failure.

**Severity (whole bug):** Data loss is permanent for the current localStorage row — user's Step 3/5/6 customisations are gone after refresh and stay gone until they re-enter them. They DO recover their values by closing the wizard and reopening (no, actually — that re-runs the same effect with the same already-clobbered cache). Only "Create New Forecast" (`startFresh: true`) or manually clearing localStorage truly resets.

**Reproducer (exact steps):**
1. JDS forecast for FY2026, fresh wizard
2. Step 2 imports/loads prior year (FY2025) Xero data — works correctly with full byMonth
3. Step 3: edit a revenue line (e.g., split into two lines, change a line name)
4. Step 5: change a COGS line from variable to fixed
5. Step 6 (OpEx): override monthlyAmount on one line
6. Hard refresh (Cmd+Shift+R)
7. Step 2 displays Xero totals (looks fine if pl-summary succeeds)
8. Step 3: customisations gone — single auto-generated revenue line restored
9. Step 5: COGS reverted to variable (default)
10. Step 6: monthlyAmount reset to (line.total / 12)

If pl-summary returns degenerate (JDS dual-id or sync_jobs gating), Step 2 itself shows flat monthly columns or empty state.

fix:

**Fix path 1 (primary — preserve user customisations):**
In `useForecastWizard.ts` `setPriorYear` (line 591-715), STOP rebuilding revenueLines/cogsLines/opexLines unconditionally. Either:
  (a) Only assign `priorYear: data` and leave existing lines alone, OR
  (b) Detect "is this a refresh-replace?" (e.g., check if prev.revenueLines.length > 0 — meaning user already has them) and skip line regeneration in that case. Move line-generation into a separate explicit action (`initializeLinesFromPriorYear`) that the wizard calls only on initial Step 2 confirmation, never on background refresh.

In `ForecastWizardV4.tsx` line 315, replace the unconditional `setPriorYear(freshPriorYear)` with a refresh-only setter that updates `state.priorYear` (display data) without touching revenue/cogs/opex lines.

**Fix path 2 (secondary — actually populate byMonth on saved-forecast fallback):**
At `ForecastWizardV4.tsx` lines 388, 397, 423, 429, the assumption rebuild uses `byMonth: {}`. Either store byMonth in the saved-assumptions JSON when forecast is created (preferred), or remove this fallback path entirely and force a Xero refresh, since the fallback ships demonstrably degraded data.

**Fix path 3 (tertiary — surface failures):**
At `ForecastWizardV4.tsx` line 250, when `pl-summary` returns `has_xero_data: false` or `prior_fy` is missing, log explicitly and (for JDS triage) fail loud rather than silently keep stale cache. Plumb the data_quality signal up so the UI can surface "Xero refresh failed — showing cached data" instead of pretending everything's fine.

verification:
files_changed: []
