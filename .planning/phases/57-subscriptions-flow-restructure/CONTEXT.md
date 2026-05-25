# Phase 57 — Subscription integration + flow restructure

## Goal

Make Step 6 Subscription data feed the forecast P&L (it currently saves to `subscription_budgets` but is never read by the rollup). Reorder the wizard so Subscriptions comes before discretionary OpEx. Make the top-bar nav clickable.

## Locked decisions

### Step ordering — swap 5↔6 only
Today: `Goals → PriorYear → Revenue/COGS → Team → OpEx → Subscriptions → CapEx → Growth Plan → Review` (9 steps).
After: `Goals → PriorYear → Revenue/COGS → Team → Subscriptions → OpEx → CapEx → Growth Plan → Review` (still 9 steps).

### Step labels
- Keep "OpEx" — do NOT rename to "Discretionary OpEx".
- Step 5 (Subscriptions) and Step 6 (OpEx) each render the BudgetFramework component.

### BudgetFramework rework
Decompose the breakdown explicitly so the operator sees what's locked in vs what's discretionary. Display order:
- Revenue
- − COGS  → Gross Profit
- − Team
- − Subscriptions  ← NEW line (sum from Step 5 vendors)
- − Profit Target
- = Available OpEx (still called this; remains the discretionary number)

Header stays "OpEx Budget". Explainer text updated to: `Revenue − COGS − Team − Subscriptions − Profit = Available for OpEx`.

### Subscription integration semantics

**Join key:** add `accountCode?: string` to `OpExLine`. Populate during `initializeFromXero` and refresh paths. Step 5 ↔ Step 6 join on `accountCode`. Bump `WIZARD_VERSION` 10 → 11. Soft-migration pattern from P56 P1c B2 handles old drafts (fall through to name-based matching when `accountCode` missing).

**Residual handling (when Step 5 vendor sum < historical for matching accounts):** trust the operator — forecast uses the Step 5 sum, the gap is gone. Show a banner if the gap exceeds 15% of historical so it's not silent.

**Multi-year derivation:** subscriptions Y2/Y3 grow with `state.defaultOpExIncreasePct` (default 3%). NO new per-vendor Y2/Y3 fields. NO new global subscription-specific growth field.

**Visibility of subscription-classified OpEx in Step 6 (new):** show those rows with a "covered by Step 5" badge and zero contribution to the rollup. Don't hide them — transparency over invisibility.

**Snapshot for reporting:** populate `forecast_assumptions.subscriptions` (field exists in schema today, never written) during `buildAssumptions`. `subscription_budgets` table remains the live source of truth; the JSON snapshot is the at-save-time copy for self-contained forecasts.

### Clickable top-bar navigation
- Add `maxVisitedStep` to `ForecastWizardState`, init to 1, advanced inside `nextStep` whenever `currentStep + 1 > maxVisitedStep`.
- Any step where `step <= maxVisitedStep` is clickable. Both forward and backward — once visited, stays clickable.
- Before `goToStep` mutates `currentStep`, flush-save synchronously (await both wizard-state autosave and Step 5's subscription-budget API save). On save failure, toast + stay put.
- No confirm modal.
- Per-step validation icons (e.g., warning dot for incomplete fields) — informational, NOT gating.

### Bonus cleanup (bundle into the phase)
- Fix AI narrative stale step labels (`AICFOPanel.tsx:869` says "Step 8: Final Review" but it's Step 9 today).
- Rewrite Excel Subscriptions tab to read from new `state.subscriptions` field (currently filters by dead `isSubscription` flag and produces an empty tab).

## Out of scope (deferred)
- Subscription what-if scenarios in Step 9 (no `totalSubscriptionsAdj` in scenario math). Phase 58+ if needed.
- Per-vendor Y2/Y3 budgets.
- Renaming Step 6 to "Discretionary OpEx".
- Merging CapEx into Other.

## Acceptance criteria
1. Existing forecasts load and walk through the new step order without data loss (soft migration handles v10 drafts).
2. Net profit math on existing forecasts is unchanged after Phase 57 deploys (subscriptions previously flowed in via opex-classifier; now flow in via Step 5 — totals must match for accounts that didn't change).
3. Subscription account double-counting is impossible (Step 6 OpEx rows for accountCodes covered by Step 5 contribute zero).
4. Top-bar navigation: from any visited step, the operator can jump forward or back to any other visited step. No data loss on jump.
5. JDS end-to-end walkthrough (per memory `user_role.md`) — load existing JDS forecast, walk new flow, verify P&L unchanged, verify subscription-detail report still returns same vendors.

## Reference
- Research: `.planning/phases/57-subscriptions-flow-restructure/RESEARCH.md`
- Audit context: `.planning/phases/56-forecast-builder-audit/SYNTHESIS.md`
- Soft-migration pattern: `useForecastWizard.ts:168-197` (P56 P1c B2)
- Subscription reporting consumer: `/api/monthly-report/subscription-detail/route.ts:216`
