# Phase 57: Subscriptions Integration + Wizard Flow Restructure — Research

**Researched:** 2026-05-07
**Domain:** Forecast Wizard V4 (Next.js client component) + Subscriptions persistence (Supabase)
**Confidence:** HIGH (read every relevant file end-to-end; no Context7 needed — this is a feature inside our own codebase)

---

## Summary

The wizard already runs **9 steps** (not 8 as the prompt hints — see "Step ordering correction" below). The current order is: Goals → Prior Year → Revenue/COGS → Team → **OpEx → Subscriptions → CapEx → Growth Plan → Review**. Step 6 Subscriptions persists vendor-level budgets to a dedicated `subscription_budgets` Postgres table, and that data is read by the monthly reporting pipeline (`/api/monthly-report/subscription-detail`) — but **the wizard's own P&L rollup never reads it**. Subscriptions are therefore invisible in the forecast: they appear in Step 5 OpEx (because the underlying Xero accounts are imported as opex lines), then get re-entered in Step 6 against vendor names, then never get stitched back together. Today's wizard double-counts when an operator both edits a software OpEx line in Step 5 AND budgets the same vendor in Step 6.

The reorder Matt wants — Subscriptions BEFORE OpEx — is the correct fix because Step 5 (OpEx) renders a `BudgetFramework` that displays "Available OpEx = Revenue − COGS − Team − Profit Target" and that ceiling needs to subtract subscriptions before the operator divides it across discretionary lines. Subscriptions are the largest non-discretionary fixed-cost bucket for most SMBs, and showing them inside discretionary OpEx makes the budget feel artificially generous.

**Primary recommendation:** Treat the join from Step 6 vendors → Step 5 OpEx accounts as a **one-way override**, not a merger. After Step 5 (Subscriptions) is complete, OpEx accounts whose `accountCode` appears in the active subscription `accountCodes[]` list should be **removed (or zero-clamped) from the Step 6 OpEx rollup**, with their dollar value substituted by the sum of `monthlyBudget × 12` for vendors mapped to that account code. The subscription bucket then enters the rollup as its own line item: `summary.year{N}.subscriptions`. This avoids both double-counting and the messier "residual" reconciliation case.

**Effort estimate:** 8–12 plan tasks across 5–7 working days for a careful operator-quality ship. Risk drivers: state migration for in-flight drafts (LOW–MEDIUM), rollup math regressions on existing forecasts (MEDIUM), and clickable-nav unsaved-state edge cases (LOW). See section H.

---

## User Constraints (from CONTEXT.md)

No CONTEXT.md exists yet for this phase (`.planning/phases/57-subscriptions-flow-restructure/` was empty before this file). All design decisions in this research are **recommendations only** — the planner should treat them as starting points, and Matt should confirm any items flagged "RECOMMEND" before tasks lock in.

### Locked decisions (from prompt)
- Subscriptions step moves **before** discretionary OpEx
- Step 6 subscription data must feed the forecast P&L rollup
- Budget Framework formula must subtract subscriptions
- Step 5 OpEx must exclude subscription-classified accounts when Step 5 (Subscriptions) covers them — no double counting
- Top-bar wizard nav must be clickable across visited steps with a guard
- `subscription_budgets` table is critical for reporting and must remain populated

### Claude's discretion (recommendations made below)
- Exact double-count prevention algorithm (account-code intersection vs. line-name match)
- Y2/Y3 subscription growth model (default inflation %)
- Clickable-nav rules (which steps qualify as "visited"; auto-save before jump)
- Whether to keep 9 steps or collapse to 8 (recommend 9; see "Step count tradeoffs")
- Whether to mirror subscription totals into `forecast_assumptions.subscriptions` for save/load symmetry

### Out of scope (deferred)
- Per-vendor multi-year forecasting UI (Step 5 stays Y1-only for now, with Y2/Y3 derived)
- Cashflow timing impact (Phase 52 handles pay-frequency timing; subscriptions can ride the same train later)
- Restructuring `subscription_budgets` schema (table stays as-is; no migrations in this phase)

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUBS-01 | Reorder wizard steps: Subscriptions BEFORE OpEx | Section A — `WIZARD_STEPS` array (`types.ts:854`), `renderStep()` switch (`ForecastWizardV4.tsx:1554`), `nextStep`/`prevStep` (`useForecastWizard.ts:331-353`) |
| SUBS-02 | Step 6 Subscriptions feeds forecast P&L rollup | Section B — `summary` `useMemo` (`useForecastWizard.ts:1158-1495`), `YearlySummary` type (`types.ts:828-845`) |
| SUBS-03 | Budget Framework subtracts subscriptions | Section C — `BudgetFramework` (`Step5OpEx.tsx:50-210`), formula at line 86 |
| SUBS-04 | OpEx step excludes subscription-classified accounts when Step 5 covers them | Section B — `accountCodes[]` on vendors (`Step6Subscriptions.tsx:60`), OpEx accumulator (`useForecastWizard.ts:1326-1390`) |
| SUBS-05 | Clickable top-bar wizard navigation across visited steps | Section D — `StepBar` component (`StepBar.tsx`), `goToStep` action (`useForecastWizard.ts:327`) |
| SUBS-06 | Step migration for in-flight drafts | Section E — `WIZARD_VERSION` (`useForecastWizard.ts:53`), soft-migration pattern (`useForecastWizard.ts:168-197`) |
| SUBS-07 | Cross-step impacts (Review, AI narrative, Excel/PDF, save/load) | Section F |
| SUBS-08 | Save/load reconciliation between `subscription_budgets` and `forecast_assumptions` | Section G — `buildAssumptions` (`useForecastWizard.ts:1500-1654`), `subscriptions?: SubscriptionAuditSummary` (`assumptions.ts:254`) |

---

## Step ordering correction

The prompt's table assumes the wizard is currently 8 steps with "OpEx | Subscriptions+CapEx | Other | Review." That's not what's in the code today. **The wizard already has 9 steps**, defined explicitly in `WIZARD_STEPS` at `types.ts:854-864`:

| Step | Today's label | Code reference |
|------|---------------|----------------|
| 1 | Goals | `Step1Goals` |
| 2 | Prior Year | `Step2PriorYear` |
| 3 | Revenue & COGS | `Step3RevenueCOGS` |
| 4 | Team | `Step4Team` |
| 5 | OpEx | `Step5OpEx` |
| 6 | Subscriptions | `Step6Subscriptions` |
| 7 | CapEx | `Step6CapEx` (file name lags label) |
| 8 | Growth Plan | `Step8GrowthPlan` (skipped if `forecastDuration === 1`) |
| 9 | Review | `Step8Review` (file name lags label) |

There is no separate "Step 7 Other Expenses" step in the V4 wizard — `OtherExpense` data exists in state (`useForecastWizard.ts:151`) but is captured incidentally on Review, not as a standalone step. There is no "Step 6 CapEx + Subscriptions combined" step either — those have been split since at least Phase 51. The prompt's "currently 8" / "growing to 9" framing should be re-anchored: this phase **stays at 9 steps**, but rearranges 5↔6.

### Recommended new order (9 steps, swap 5/6 only)

| Step | New label | Notes |
|------|-----------|-------|
| 1 | Goals | unchanged |
| 2 | Prior Year | unchanged |
| 3 | Revenue & COGS | unchanged |
| 4 | Team | unchanged |
| **5** | **Subscriptions** | was step 6; gets the "before OpEx" placement |
| **6** | **OpEx** | was step 5; renamed to "Discretionary OpEx" optional |
| 7 | CapEx | unchanged |
| 8 | Growth Plan | unchanged |
| 9 | Review | unchanged |

**RECOMMEND** keeping the count at 9. Collapsing CapEx into "Other" would require a real merge (different data model: `PlannedSpend[]` vs `OtherExpense[]`, lines 367-402 of `types.ts`), is out of scope, and risks breaking Phase 50's lease/finance taxonomy. Stay focused on the 5↔6 swap.

### Renaming OpEx → "Discretionary OpEx"
**RECOMMEND** updating the Step 6 label to "Discretionary OpEx" (not just "OpEx"). After subscriptions are pulled out, the remaining bucket really is what the budget framework calls discretionary. This makes the formula change in section C more legible to operators. Minor copy change in `WIZARD_STEPS[5].label`, `renderStep()` switch, and the step description at `ForecastWizardV4.tsx:1840`.

---

## A. Current state inventory

### Files touched by the 9-step wizard

**Shell + navigation:**
- `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` (1902 lines) — top-level shell, `renderStep()` switch (line 1554), step descriptions (lines 1836-1844), `<StepBar>` mount (line 1792), back/next footer (lines 1854-1888)
- `src/app/finances/forecast/components/wizard-v4/components/StepBar.tsx` (78 lines) — top-bar nav, click handler at line 31
- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts` (1801 lines) — state machine, `WIZARD_VERSION` (line 53), `goToStep`/`nextStep`/`prevStep` (lines 327-353), summary rollup (line 1158-1495), `buildAssumptions` (line 1500-1654)

**Step components:**
- `steps/Step1Goals.tsx`
- `steps/Step2PriorYear.tsx`
- `steps/Step3RevenueCOGS.tsx`
- `steps/Step4Team.tsx`
- `steps/Step5OpEx.tsx` (1613 lines — contains `BudgetFramework`)
- `steps/Step6Subscriptions.tsx` (1399 lines — contains `saveSubscriptionBudgets` and Xero analysis)
- `steps/Step6CapEx.tsx` (562 lines — file name is misleading, this renders as Step 7)
- `steps/Step8GrowthPlan.tsx` (1037 lines — also has subscription keyword detection at line 327)
- `steps/Step8Review.tsx` (1291 lines — final P&L waterfall + completion-checklist)

**Supporting components:**
- `components/AICFOPanel.tsx` — AI narrative; references step labels at lines 586, 667, 746, 869
- `components/AIAssistant.tsx` — older AI panel, also branches on `currentStep`
- `components/BudgetTracker.tsx` — has `currentStep: 'opex' | 'subscriptions' | 'capex'` prop (line 11) — string-based, not number-based
- `components/ExcelExport.tsx` — references "Step 6" in human-readable text at line 372
- `components/StepBar.tsx` — see above
- `components/YearTabs.tsx` — only renders for steps `[3, 4, 5]` (`ForecastWizardV4.tsx:1800`)
- `utils/opex-classifier.ts` (689 lines) — `isTeamCost`, `classifyExpense`, `SUBSCRIPTION_ACCOUNT_KEYWORDS`-equivalent in `'fixed'` bucket
- `types.ts` — `WIZARD_STEPS` array (line 854), `WizardStep = 1|2|...|9` (line 6), `YearlySummary` (line 828)
- `types/assumptions.ts` — `subscriptions?: SubscriptionAuditSummary` (line 254), `SubscriptionAuditSummary` (line 200), `DetectedSubscription` (line 314)

**Subscription persistence:**
- `src/app/api/subscription-budgets/route.ts` — GET / POST / DELETE; upsert key `(business_id, vendor_key)`
- `src/app/api/Xero/chart-of-accounts/route.ts` — `isSubscriptionAccount` heuristic (line 166), `SUBSCRIPTION_ACCOUNT_KEYWORDS` (line 22)
- `src/app/api/Xero/subscription-transactions/route.ts` — referenced by `Step6Subscriptions:398`
- `src/app/api/monthly-report/subscription-detail/route.ts` — **READS** `subscription_budgets` for monthly reporting (line 216)

**Schema:**
- `supabase/migrations/00000000000000_baseline_schema.sql:4916-4941` — `subscription_budgets` table
  - PK: `id` (uuid)
  - Unique: `(business_id, vendor_key)` — line 6451
  - FK: `forecast_id → forecasts(id)` (NULL on delete) — line 9475
  - Generated column: `annual_budget = monthly_budget × 12` regardless of frequency (line 4924-4930)
  - Important: `annual_budget` is computed by the DB and we cannot change its formula without a migration. For monthly/quarterly/annual frequencies the meaning of `monthly_budget` is "average monthly spend after normalising the frequency." Step 6's `saveSubscriptionBudgets` already does this normalisation client-side (`Step6Subscriptions.tsx:495-510`).

### Hardcoded step references — exhaustive list

| File:line | Hardcoded value | What it does | Migration action |
|-----------|-----------------|--------------|------------------|
| `types.ts:6` | `WizardStep = 1\|2\|...\|9` | Type union | No change needed (still 1-9) |
| `types.ts:854-864` | `WIZARD_STEPS` array | Step labels | **Swap entries 5 ↔ 6, rename label "OpEx" → "Discretionary OpEx"** |
| `useForecastWizard.ts:128` | `currentStep: 1` | Initial state | No change |
| `useForecastWizard.ts:335` | `if (next === 8 && prev.forecastDuration === 1) next = 9` | Skip Growth Plan for 1yr forecasts | Still correct (Growth Plan stays at step 8) |
| `useForecastWizard.ts:349` | `if (next === 8 && prev.forecastDuration === 1) next = 7` | Reverse skip | Still correct |
| `ForecastWizardV4.tsx:1192-1197` | `actions.goToStep(7)` and `actions.goToStep(initialStep)` | Programmatic navigation | Verify `initialStep` callers — none reference subscriptions specifically |
| `ForecastWizardV4.tsx:1555-1573` | `switch (state.currentStep) { case 1..9 }` | Renders the step component | **Swap cases 5 and 6 component bindings** |
| `ForecastWizardV4.tsx:1594` | `state.currentStep === 9` | "isLastStep" detection | No change |
| `ForecastWizardV4.tsx:1800` | `[3, 4, 5].includes(state.currentStep)` | Show YearTabs (multi-year tabs) | **Verify which steps need year tabs after swap.** Step 5 (Subscriptions, new) is Y1-only — should NOT show year tabs. Step 6 (OpEx, new) should show them. **Recommend `[3, 4, 6]`.** |
| `ForecastWizardV4.tsx:1836-1844` | `state.currentStep === N && "..."` | Step description text | **Swap step 5/6 strings; update copy** |
| `Step8Review.tsx:610-611` | `{ step: 5, label: 'OpEx', hasData: ... }`, `{ step: 6, label: 'Subscriptions' }` | Completion checklist | **Swap order; update `hasData` predicate for new Step 5** |
| `AICFOPanel.tsx:586` | "**Step 5: Operating Expenses**" | Narrative text | **Update to "**Step 5: Subscriptions Audit**"** and step 6 to "**Step 6: Discretionary Operating Expenses**" |
| `AICFOPanel.tsx:667` | "**Step 6: Subscriptions Audit**" | Narrative text | **Update label** |
| `AICFOPanel.tsx:746` | "**Step 7: Capital Expenditure**" | Narrative text | No change (CapEx stays at 7) |
| `AICFOPanel.tsx:869` | "**Step 8: Final Review**" | Narrative text | This is wrong already — Review is Step 9, Growth Plan is Step 8. Pre-existing bug; flag for cleanup but not blocking. |
| `ExcelExport.tsx:372` | "Run the Subscription Audit in Step 6 of the forecast wizard" | Empty-state text | **Update to "Step 5"** |
| `BudgetTracker.tsx:11` | `currentStep: 'opex' \| 'subscriptions' \| 'capex'` | String-based phase, NOT number | No change to type, but verify caller passes correct string |
| `Step8GrowthPlan.tsx:610-611` | Step references in checklist | (same Step8Review snippet duplicated) | Same swap |

**Search patterns the planner should re-run after renumber:**
- `grep -rn "Step [5-7]\|step ===\|case [5-7]\|currentStep === [5-7]" src/app/finances/forecast/`
- `grep -rn "step: [5-7]\|step:[5-7]" src/app/finances/forecast/`
- Tests: `grep -rn "Step[5-7]\|step.*=.*[5-7]" src/__tests__/forecast/`

### Current navigation behavior

- **Forward (`nextStep`):** `useForecastWizard.ts:331` increments `currentStep`. Skips step 8 if `forecastDuration === 1`. No validation gate — operator can advance even with empty data.
- **Back (`prevStep`):** `useForecastWizard.ts:345` decrements. Same skip logic.
- **Direct (`goToStep`):** `useForecastWizard.ts:327` sets `currentStep` to any value. No validation.
- **StepBar click:** Calls `goToStep` directly. Today's `StepBar` (`StepBar.tsx:21`) computes `isClickable = step.step <= currentStep` — **only past + current steps are clickable**. Future steps render disabled. This is the existing UX; the prompt asks us to make it more flexible.

### Storage state shape

`useForecastWizard.ts:121-152` — `createInitialState`:
```
wizardVersion: 10,           // <- bump on schema changes
businessId,
fiscalYearStart,
status: 'draft',
forecastDuration: 3,
durationLocked: false,
currentStep: 1,              // <- step number lives here
activeYear: 1,
businessProfile: null,
goals: { year1, year2, year3 },
priorYear: null,
currentYTD: null,
revenuePattern: 'seasonal',
revenueLines: [],
cogsLines: [],
teamMembers: [], newHires: [], departures: [], bonuses: [], commissions: [],
defaultOpExIncreasePct: 3,
opexLines: [],               // <- Step 5 (current) / Step 6 (new) data
capexItems: [], investments: [],
plannedSpends: [],           // <- Step 7 data
otherExpenses: [],
```

**Critical:** the wizard does NOT store subscription budgets in this state object. They're loaded fresh from `/api/subscription-budgets` when Step 6 (current) renders. After Phase 57, the same loader must run when Step 5 (new) renders, and the totals must flow into the wizard's in-memory `state` so the rollup at `useForecastWizard.ts:summary` can read them. **RECOMMEND adding `subscriptions: VendorBudget[]` (or simplified shape) to `ForecastWizardState`** — see Section B for design.

### LocalStorage key
`getStorageKey(businessId, fiscalYear) = "forecast-wizard-v4-${businessId}-${fiscalYear}"` — `useForecastWizard.ts:155`.

### Soft-migration pattern (P56 P1 B2)
`useForecastWizard.ts:168-197` — when `parsed.wizardVersion !== WIZARD_VERSION`, the loader **does not discard** the draft. It logs a warning, sets `parsed.migratedFromVersion = storedVersion`, and lets missing fields fall through to defaults. This is the right pattern to reuse for the step renumber. See Section E.

---

## B. Subscription integration semantics

### How subscription accounts are identified today

There are **three independent classifiers** in the codebase:

1. **`isSubscriptionAccount` in `chart-of-accounts/route.ts:166`** — checks `SUBSCRIPTION_ACCOUNT_KEYWORDS` (`subscription, software, saas, cloud, hosting, web services, online services, digital services, it expense, it software, computer software, computer expense, app, platform`) MINUS `EXCLUDE_KEYWORDS` (`telephone, phone, mobile, internet service, profit, distribution, dividend, depreciation, amortisation, amortization, insurance, rent, lease, wages, salary, super, payroll`). Used to set `isSuggested: true` on accounts displayed in Step 6's account picker.

2. **`opex-classifier.ts:62-72`** — the OpEx classifier's `'fixed'` bucket includes subscription/SaaS keywords and software vendor names. This is just for *cost behavior* classification ('fixed'), NOT for marking lines as subscriptions.

3. **`Step8GrowthPlan.tsx:327-335`** — yet another keyword list (`SUBSCRIPTION_KEYWORDS`) used to filter "subscription lines" for the growth plan view. Includes `isSubscription` field check first, then keyword matching.

**There is no single canonical "is this account a subscription" function.** The closest is `isSubscriptionAccount` in chart-of-accounts API, but it operates on Xero account names, not on `OpExLine` objects.

The `OpExLine.isSubscription` flag exists on the type (`types.ts:315`) and is round-tripped through `buildAssumptions` (`useForecastWizard.ts:1576`) — but **nothing in the current codebase ever sets it to `true`**. Searching the entire repo: no `isSubscription: true` writers exist. The flag is dead today. Step 5 OpEx never marks lines as subscriptions, and Step 6 stores its data in a completely separate `subscription_budgets` table without writing back to `OpExLine`.

### The actual join key — recommendation

`Step6Subscriptions.tsx` stores `accountCodes: string[]` on each `VendorBudget` (line 60). When the operator analyses subscriptions, the API returns transactions grouped by Xero `accountCode`, and each vendor inherits the codes of the accounts it appears in. These codes match `OpExLine.accountId` (which is loaded from Xero account IDs in `useForecastWizard.ts:448` and `1119`).

Wait — let me re-check. `Step6Subscriptions.tsx:565` writes `accountCodes: summary?.accountsAnalyzed || []` to the API. `summary.accountsAnalyzed` comes from the analysis response. The chart-of-accounts route returns `accountCode` (Xero's user-facing code like "5100") and `accountId` (Xero's UUID). **The `accountCodes` array stored on `subscription_budgets.account_codes` is the user-facing CODE, not the UUID.**

`OpExLine.accountId` is populated from `cat.account_name || cat.category` indirectly via `useForecastWizard.ts:259` — actually that line uses `category` for the id. Let me re-check: `useForecastWizard.ts:1119-1149` shows opex lines built with `accountId: cat.account_name || cat.category` — that's the Xero account NAME used as ID, not the code. **There's a name/code/id soup here that needs careful reconciliation.**

**RECOMMEND** the planner's first task is a small audit to confirm the join key. Three candidates:
- `accountCode` (like "5100") — what Step 6 stores in `accountCodes[]`
- `accountId` (Xero UUID) — what `OpExLine.accountId` *should* be but currently might be a name
- `accountName` — the human-readable label

The cleanest path: **extend `OpExLine` to carry `accountCode?: string`** (Phase 57 schema bump), populate it during Xero ingest in `useForecastWizard.ts:initializeFromXero` and the refresh paths, then join Step 5 ↔ Step 6 on `accountCode`. This requires a wizard version bump (10 → 11) and a one-time backfill on draft load: when an old draft has `accountId` but no `accountCode`, fall through to name-based matching.

### What happens when vendors don't sum to historical (the residual case)

Three options the prompt lists:

1. **Use Step 5 sum and ignore Xero remainder** — operator-trusted, but if the operator forgets a $300/mo subscription it silently disappears from the forecast.
2. **Use Step 5 sum + leftover Xero amount as a residual line in Step 6 OpEx** — accurate but creates a confusing "Software (residual)" line operators don't understand.
3. **Warn operator that vendors don't sum to historical** — surfaces the gap but adds friction.

**RECOMMEND option (1) with a clear warning UI**, NOT a residual line. Reasoning:
- The whole point of Step 5 (Subscriptions) is the operator looks at every vendor and decides what to keep, what to cut, what to renegotiate. The decision IS the budget.
- A residual line undermines that — it's saying "here's the stuff you didn't bother to budget." That's exactly what Step 5 is meant to eliminate.
- A warning surfaces the gap without forcing the operator to model orphaned spend they've already decided is below the threshold of attention.

**Implementation:** show a banner at the top of new-Step-5 (Subscriptions) when `Σ(activeVendor.monthlyBudget × 12) < 0.85 × Σ(historical_account_total for accountCodes in selected accounts)`. Threshold of 15% gap is generous enough not to nag operators who legitimately decided to cut subscriptions.

### Y2/Y3 derivation — recommendation

The current `subscription_budgets` schema has a single `monthly_budget` per vendor. There's no Y2/Y3 column.

**RECOMMEND a single business-level subscription growth %, not per-vendor.** Rationale:
- Subscriptions tend to inflate uniformly (most SaaS vendors raise prices 5-10% annually; the spread is narrow).
- Per-vendor Y2/Y3 fields multiply the UI surface area (50 vendors × 3 years = 150 inputs to maintain).
- The whole forecast is anchored on operator simplicity (CLAUDE.md memory: "target user is not a numbers person").

**Default:** mirror `state.defaultOpExIncreasePct` (currently 3% — `useForecastWizard.ts:146`) as the default subscription growth rate. Add a separate `state.defaultSubscriptionIncreasePct?: number` field so the operator can override on the new Step 5. **Do NOT persist this to `subscription_budgets` yet** — the schema change can wait — keep it in `forecast_assumptions` JSON instead. See Section G.

**Math (per-year):**
```
year1Subscriptions = Σ(activeVendor.monthlyBudget × 12)   // exactly what Step 6 saves today
year2Subscriptions = year1Subscriptions × (1 + subInc/100)
year3Subscriptions = year1Subscriptions × (1 + subInc/100)^2
```

This is symmetric with how OpEx fixed costs already grow (`useForecastWizard.ts:1346-1349`).

---

## C. Budget Framework formula change

### Current formula (Step5OpEx.tsx:50-210)

`BudgetFramework` component, lines 67-89:
```
revenue       = actualRevenue.y{N}                  // from Step 3
cogs          = actualCOGS.y{N}                     // from Step 3
grossProfit   = revenue - cogs
teamCosts     = year1TeamCosts × 1.03^(yearNum-1)   // simplistic Y2/Y3 growth
targetProfit  = revenue × (netProfitPct / 100)
availableOpEx = grossProfit - teamCosts - targetProfit
```

Display labels (lines 132-155):
- `Revenue`
- `− COGS`
- `= Gross Profit (X%)`
- `− Team Costs`
- `− Target Profit (Y%)`
- `= Available OpEx`

### New formula

Insert one line after Team Costs:
```
availableOpEx = grossProfit - teamCosts - subscriptions - targetProfit
```

Where `subscriptions` is the year-N subscription total computed per Section B (`year1Subscriptions × (1 + subInc/100)^(N-1)`).

### Display labels — recommendation

```
Revenue
− COGS
= Gross Profit (X%)
− Team Costs
− Subscriptions
− Target Profit (Y%)
= Available OpEx
```

**RECOMMEND** also retitling the panel header from "OpEx Budget" (line 108) to "Discretionary OpEx Budget", and updating the explainer at line 110 from `Revenue − COGS − Team − Profit = Available for OpEx` to `Revenue − COGS − Team − Subscriptions − Profit = Available for Discretionary OpEx`.

### Where subscriptions come from

In the new Step 5 (Subscriptions), the operator finalises `subscriptions[]` and that's persisted to both `subscription_budgets` (existing) and a new field on the wizard's in-memory state. When Step 6 (OpEx) renders `BudgetFramework`, it reads `state.subscriptions` (or whatever the new field is called) and sums `monthlyBudget × 12` for `isActive` vendors. Year 2/3 grows by `defaultSubscriptionIncreasePct`.

### Implementation note

`BudgetFramework` currently receives props from `Step5OpEx` (which is itself the renamed step). After the rename, `Step5OpEx.tsx` becomes the OpEx step (still at `case 6` in the switch). The `BudgetFramework` props need a new field:

```typescript
subscriptionsByYear: { y1: number; y2: number; y3: number }
```

The Step5OpEx parent (now Step 6) computes this from `state.subscriptions` and passes it down. Mirror the existing pattern at `Step5OpEx.tsx:1094-1100` where `opexByYear` and `actualRevenue` are passed.

---

## D. Clickable top-bar navigation

### Current rendering (`StepBar.tsx`)

- Mounted at `ForecastWizardV4.tsx:1791-1797`
- Receives `steps` (filtered to skip Growth Plan for 1yr forecasts), `currentStep`, `onStepClick: (step) => actions.goToStep(step)`
- Per-step rendering:
  - `isActive = step.step === currentStep` (current step, navy circle, ring)
  - `isCompleted = step.step < currentStep` (green check, clickable)
  - `isClickable = step.step <= currentStep` (past + current only)
  - Future steps: gray, `disabled`, `cursor-not-allowed`

### Recommended rules — concrete

**RECOMMEND the following navigation contract:**

1. **All visited steps are clickable.** Define "visited" as `state.maxVisitedStep >= step.step`. Add `maxVisitedStep: WizardStep` to `ForecastWizardState`, initialised to 1, advanced inside `nextStep` whenever `currentStep + 1 > maxVisitedStep`.

2. **Auto-save (debounced draft) before any cross-step navigation.** The wizard already auto-saves on state change (`useForecastWizard.ts:305-316`, debounce 500ms). Before `goToStep` actually mutates `currentStep`, call `actions.saveDraft()` synchronously and await it. If save fails, show a toast and stay on the current step.

3. **No confirmation modal for jumps.** In-flight unsaved local edits are already protected by the auto-save chain (state→localStorage→server). The 500ms debounce window is small enough that operators rarely lose work, and confirmation modals get clicked through reflexively.

4. **Future-not-yet-visited steps remain disabled.** This avoids the operator skipping Step 1 (where forecast duration is set) and breaking downstream rendering. Pre-Phase-57 behaviour preserved here.

5. **Per-step validation does NOT block jumps.** Instead, render a small icon next to each step's label indicating "✓ complete" / "⚠ incomplete" / "● not yet visited." This gives operators feedback without blocking exploration. Validation predicates per step:

   | Step | Complete when |
   |------|---------------|
   | 1 Goals | `goals.year1.revenue > 0` and `forecastDuration` set |
   | 2 Prior Year | `priorYear !== null` |
   | 3 Revenue/COGS | `revenueLines.length > 0 && cogsLines.length > 0` |
   | 4 Team | `teamMembers.length > 0 \|\| newHires.length > 0` |
   | 5 Subscriptions (new) | `subscriptions !== undefined` (i.e., operator has finalised even if 0 vendors) |
   | 6 OpEx (new) | `opexLines.length > 0` |
   | 7 CapEx | always optional — never "incomplete" |
   | 8 Growth Plan | always optional |
   | 9 Review | (terminal step, never marked) |

   These predicates also feed the existing `Step8Review` completion checklist (lines 605-611).

### Hot edge case: navigating away from the new Step 5 (Subscriptions) before save

Step 6 today writes to `/api/subscription-budgets` with a 1500ms debounced auto-save (`Step6Subscriptions.tsx:587-606`). When the operator clicks a different step in the StepBar, the timer might not have fired yet. **RECOMMEND** the new Step 5 explicitly calls `saveSubscriptionBudgets()` from a `useEffect` cleanup or in response to a step-change signal, so the data lands before the user sees the new step. Without this, jumping away mid-edit silently drops 0–1500ms of edits.

---

## E. Step renumbering migration

### The problem

A draft saved at version 10 with `currentStep: 5` means "operator was on the OpEx step." After Phase 57 ships, version 11 with `currentStep: 5` means "operator is on the Subscriptions step." Without remapping, operators with in-flight drafts will jump to the wrong step on load.

### `wizardVersion` pattern

The soft-migration path at `useForecastWizard.ts:168-197` already handles missing/extra fields. It does NOT handle semantic remapping of existing fields like `currentStep`.

**RECOMMEND** the following migration logic, inserted at `useForecastWizard.ts:188` (between the version-mismatch warning and the `parsed.migratedFromVersion` assignment):

```typescript
// Phase 57: step 5↔6 swap. v10 draft on currentStep=5 was OpEx; in v11 OpEx is step 6.
if (storedVersion !== undefined && storedVersion < 11) {
  if (parsed.currentStep === 5) parsed.currentStep = 6;       // OpEx → new step 6
  else if (parsed.currentStep === 6) parsed.currentStep = 5;  // Subscriptions → new step 5
  // Steps 1-4 and 7-9 unchanged
}
```

Bump `WIZARD_VERSION` from 10 → 11.

### Saved assumptions store step numbers? — No

I checked `types/assumptions.ts` exhaustively. No step numbers are persisted in the assumptions JSON. The forecast assumptions schema is data-shaped (revenue/cogs/team/opex/capex), not step-shaped. This is good news — no DB migration needed for the renumber.

### `maxVisitedStep` migration

If we add `maxVisitedStep` to state per Section D, drafts loaded from v10 won't have it. Default to `parsed.currentStep` so the user can still navigate back through steps they've reached. Set in the soft-migration block:

```typescript
if (parsed.maxVisitedStep === undefined) {
  parsed.maxVisitedStep = parsed.currentStep || 1;
}
```

---

## F. Cross-step impacts

### Step 9 (Review) P&L breakdown
- **File:** `Step8Review.tsx`
- **Site 1: `PLWaterfallChart`** (lines 95-105) — currently has `Revenue, COGS, Gross Profit, Team, OpEx, Invest, Other, Net Profit`. **Add Subscriptions** between Team and OpEx:
  ```
  { name: 'Subscriptions', value: -data.subscriptions }
  ```
  Requires `YearlySummary.subscriptions: number` (new field).
- **Site 2: scenario adjustment math** (lines 553-597) — `totalOpexAdj`, `totalTeamAdj`, etc. Add `totalSubscriptionsAdj` if scenarios should be able to flex subscriptions independently. **RECOMMEND skipping for v1** — scenarios are out of scope for Phase 57; just include `subscriptions` in the base summary, not in scenario overlays. Phase 58+ can add subscription scenarios.
- **Site 3: completion checklist** (lines 605-611) — already needs swap per section A.
- **Site 4: AI advisor checks** (lines 641-660) — uses `y1.opex`, `y1.teamCosts`, etc. Verify ratios still make sense with subscriptions split out. The current "team costs as % of revenue" check at line 652 is unaffected. The "opex as % of revenue" check (if any — verify) might want to include subscriptions.

### `YearlySummary` schema change
`types.ts:828-845` — add:
```typescript
/** Phase 57: forecasted subscription spend (Σ active vendors × 12 × growth^(N-1)). */
subscriptions: number;
```
And update `summary` `useMemo` in `useForecastWizard.ts:1465-1479` to populate it.

### AI narrative
- **`AICFOPanel.tsx`** — long-form narrative text references step numbers and labels at lines 586, 667, 746, 869. **Update strings** per Section A. The `STEP_CONFIG` lookup at line 952 uses `currentStep` as a key — verify the config table at the top of the file enumerates 1-9 by number; if so, swap the entries for keys 5 and 6.
- **`AIAssistant.tsx`** (older panel) — `STEP_PROMPTS[currentStep]` lookup at line 204 — same swap.
- **`/api/ai/forecast-assistant`** and **`/api/ai/forecast-insights`** — verify these consume step numbers from the request body. If yes, semantics change; client should pass the new step number. Phase 56 P1b throttled the narrative; Phase 57 doesn't need to revisit throttling, just the labels.

### Excel export
- **`ExcelExport.tsx:372`** — string "Step 6" → "Step 5". One change.
- The Subscriptions tab itself (look around `subLines = opexLines.filter(l => l.isSubscription)` at line 360) — note that this filters by the **dead `isSubscription` flag** on opex lines. After Phase 57 the subscription bucket is its own data source, not a flag on opex lines. The Excel Subscriptions tab should be rewritten to read from the new state field. **RECOMMEND a small dedicated task** for this — the export is operator-visible and currently produces an empty tab.

### PDF export
**Search reveals no dedicated PDF export in the wizard codebase.** The Excel export is the primary export. PDF is generated by the report-delivery pipeline in Phase 35, not by the wizard itself. If Matt sees a "PDF" option somewhere it's likely in the saved-forecast viewer (`forecast-cfo` directory), which reads `forecast_assumptions` JSON — that path is unaffected by the renumber as long as we don't mutate the JSON shape.

### Save/load assumptions schema
- `assumptions.ts:200,254` — `SubscriptionAuditSummary` already has a slot in `ForecastAssumptions.subscriptions?` BUT the wizard's `buildAssumptions` (`useForecastWizard.ts:1500-1654`) **does not populate it**. Today `subscriptions` is undefined in every saved forecast.
- **RECOMMEND** Phase 57 populates this field during `buildAssumptions`. Format:
  ```typescript
  subscriptions: {
    totalAnnual: state.subscriptions.reduce(..., 0),
    activeVendorCount: state.subscriptions.filter(v => v.isActive).length,
    annualGrowthPct: state.defaultSubscriptionIncreasePct ?? state.defaultOpExIncreasePct,
    vendors: state.subscriptions.map(...)  // shape TBD; can mirror SubscriptionAuditSummary
  }
  ```
  This makes the forecast self-contained — future readers (monthly reports, dashboards, Excel restoration) can rebuild the subscription view without needing to query `subscription_budgets`.

---

## G. Save/load implications

### Today's state of subscription persistence

Two stores:

1. **`subscription_budgets` table** (Postgres, Supabase):
   - Source of truth for vendor-level data
   - Read by `/api/monthly-report/subscription-detail/route.ts:216`
   - Written by `Step6Subscriptions:saveSubscriptionBudgets` on debounce
   - Schema: `(business_id, vendor_key)` unique key — vendors are scoped per business, NOT per forecast (despite `forecast_id` FK existing on the table)
   - All new writes today set `forecast_id: null` (`subscription-budgets/route.ts:100`)

2. **`forecast_assumptions` JSON** (wizard's own save):
   - Field `subscriptions?` exists but is never populated
   - Loaded on draft restore; would be visible to scenario overlays etc.
   - Per-forecast (each forecast version has its own assumptions blob)

### The reconciliation question

When a forecast is restored:
- `subscription_budgets` returns the *current* vendor list for the business
- `forecast_assumptions.subscriptions` (if we populate it in Phase 57) returns the vendor list **at the time the forecast was saved**

If the operator edits subscriptions between forecast versions (which they will — that's the whole point), these two will drift.

**RECOMMEND** treating `subscription_budgets` as the live source-of-truth and `forecast_assumptions.subscriptions` as a **snapshot** taken at save time. On restore:
- Compute the rollup from `state.subscriptions` populated from `subscription_budgets` (live)
- Show the snapshotted total in the saved-forecast comparison view (so operators can see "this forecast was saved when subscriptions were $X/yr; they're now $Y/yr")
- Provide a "refresh from current subscriptions" button if drift exceeds 5%

This mirrors the priorYear refresh pattern at `ForecastWizardV4.tsx:238-340` which also reconciles cached vs. fresh data with a 5%-ish gate.

### Concrete restore path

```
On forecast load:
  1. Read assumptions JSON                  (fast, includes snapshot)
  2. Fetch /api/subscription-budgets         (live)
  3. If both: live data wins; show banner if snapshot diverges by >5%
  4. If only assumptions JSON: rebuild vendors from snapshot (legacy forecasts)
  5. If only live: use as-is (forecasts that pre-date subscription persistence)
```

This is robust against the three legacy data states the codebase will have post-Phase-57:
- Pre-Phase-57 forecasts (no snapshot, may have live subscriptions)
- Pre-Phase-57 forecasts with NO live subscriptions either (just empty)
- Post-Phase-57 forecasts (both snapshot and live, reconcile)

### Should we write subscription totals into `forecast_assumptions`?

**Yes — recommend.** Without the snapshot, restoring an old forecast doesn't tell you what subscriptions were assumed at the time, only what the rollup totals were. Snapshotting is cheap (a few KB of JSON per save) and makes the forecast a self-contained record. This matters for board reporting, where "what were we assuming subscriptions would be when we approved this forecast" is a reasonable audit question.

### Schema bump? — No

The `subscription_budgets` table stays as-is. The change is entirely in:
- The wizard's in-memory state (new `subscriptions` field on `ForecastWizardState`)
- The wizard's assumptions JSON (populate `subscriptions?`)
- The wizard's rollup math
- The wizard's UI flow

No DB migrations are required for Phase 57.

---

## H. Risks and unknowns

### Risk 1: Step renumbering breaks in-flight drafts (HIGH probability, LOW severity if mitigated)

**What can go wrong:** A user opens a draft from yesterday (v10), lands on what they expect to be Step 5 OpEx, but sees Subscriptions instead. Confusion ensues.

**Mitigation:** Soft-migration block at `useForecastWizard.ts:188` (per Section E). Bump `WIZARD_VERSION` to 11. Verify with a unit test that loads a v10 draft fixture.

**Verification test:** `wizard-version-migration.test.ts` — load a fixture with `wizardVersion: 10, currentStep: 5`, assert state has `wizardVersion: 11, currentStep: 6`. Mirror for `currentStep: 6 → 5`.

### Risk 2: Double-counting regression on existing forecasts (MEDIUM probability, MEDIUM severity)

**What can go wrong:** A forecast saved before Phase 57 has `opexLines` covering software accounts AND has `subscription_budgets` rows for the same vendors. After Phase 57, both contribute to net profit and the historical forecast number changes silently.

**Mitigation:** This is the core math change. The exclusion logic (Section B) MUST be applied retroactively when restoring old forecasts, not just to new ones. Snapshot the pre-change net-profit number for 3-5 representative client forecasts before deploying; verify the post-change numbers differ by an explainable amount (specifically, the subscription bucket should now be net-zero impact compared to before, because we're moving spend from one bucket to another, not adding).

**Verification test:** Re-run client forecast for JDS (Matt's reference tenant per memory `reference_xero_reconciliation_verifier`) before and after; net profit at Y1 should be unchanged or differ only by depreciation/timing rounding.

### Risk 3: Step 5 (new) navigates away before subscription auto-save fires (MEDIUM probability, LOW severity)

**What can go wrong:** Operator edits a vendor's monthly budget, immediately clicks "OpEx" in the StepBar, the 1500ms debounce hasn't fired, the edit is lost.

**Mitigation:** Per Section D, the new Step 5 must flush its pending save synchronously before allowing navigation away. Implement via a `useEffect` cleanup or imperative `flushPendingSave()` call in `goToStep`.

**Verification test:** Manual — edit a vendor budget, click another step within 500ms, navigate back, confirm edit is preserved.

### Risk 4: Clickable nav lets operator skip required Step 1 setup (LOW probability, MEDIUM severity)

**What can go wrong:** Future-step gating fails; operator clicks Step 9 Review on a brand-new forecast, sees zero data and renders broken.

**Mitigation:** `maxVisitedStep` gating per Section D — `isClickable = step.step <= state.maxVisitedStep`. New forecasts initialise `maxVisitedStep: 1`.

**Verification test:** Unit test on `StepBar` rendering — given `maxVisitedStep=1`, only step 1 should be clickable; given `maxVisitedStep=4`, steps 1-4 should be clickable, 5-9 disabled.

### Risk 5: Y2/Y3 subscription growth doesn't match real vendor pricing (LOW probability, LOW severity, ACCEPT)

**What can go wrong:** A 3% default underestimates SaaS inflation (often 7-10%) for Y2/Y3.

**Mitigation:** Operator can override `defaultSubscriptionIncreasePct` per forecast. If this turns out to be a real complaint, Phase 58+ can add per-vendor multi-year. For Phase 57 we accept the simplicity tradeoff.

### Risk 6: BudgetTracker component drifts from BudgetFramework formula (LOW probability, MEDIUM severity)

**What can go wrong:** `BudgetTracker.tsx` (a different component, used in Step 6 Subscriptions today) computes its own `availableForExpenses = revenue - cogs - teamCosts - targetProfit` at line 105. After Phase 57, `BudgetFramework` subtracts subscriptions but `BudgetTracker` doesn't, leading to inconsistent ceilings displayed to the operator.

**Mitigation:** Update `BudgetTracker.tsx:105` to also subtract subscriptions. **The planner should explicitly include this file in the rename impact list.** Verification: visually inspect both panels show the same "available" number on the new Step 6 OpEx page.

### Unknown 1: Does the OpEx classifier get the join-key right?
The `accountId` field on `OpExLine` is currently a Xero account NAME or `cat.category`, not a code. Step 6 Subscriptions stores Xero account CODES. **RECOMMEND first task is a 30-min audit by a human or planner to confirm the join key actually works.** If `accountCode` is missing from `OpExLine`, the planner has to add it to the schema bump.

### Unknown 2: Does `forecast_id` on `subscription_budgets` ever get populated?
Today it's always null. If a future feature wants per-forecast subscription scenarios (e.g., "in this scenario we cut Vendor X"), we'd need to start setting it. **Not a blocker for Phase 57** but worth flagging in the plan as a Phase 58+ consideration.

### Unknown 3: Behavior of `Step5OpEx`'s subscription tagging (`isSubscription` flag)
Today the flag exists on the type but nothing writes it. After Phase 57 the flag becomes redundant — subscriptions are tracked separately. **RECOMMEND deprecate-but-don't-delete:** leave the field on the type for back-compat with old assumptions JSON, but stop reading it. The Excel export's `subLines` filter (`ExcelExport.tsx:360`) and the GrowthPlan keyword fallback (`Step8GrowthPlan.tsx:337-343`) should switch to reading from `state.subscriptions` instead.

---

## I. Test/verification surface

### Manual tests that must pass before ship

1. **Open existing FY26 forecast** (e.g. JDS) — verify the wizard renders with Subscriptions at step 5, OpEx at step 6, all data preserved, net profit unchanged or differing only in known/explainable ways.
2. **Walk through new flow on a fresh forecast:**
   - Step 1: Set goals, lock duration to 3yr
   - Step 2: Pull prior year from Xero
   - Step 3: Edit revenue lines
   - Step 4: Confirm team
   - **Step 5 (new): Run subscription audit**, see vendors loaded from `subscription_budgets` if any
   - **Step 6 (new OpEx):** verify `BudgetFramework` shows `Revenue − COGS − Team − Subscriptions − Profit = Available OpEx` and the subscriptions line equals Σ(active vendor monthly × 12)
   - Verify subscription-classified accounts (Xero Software, SaaS, etc. with `accountCode` matched in any active subscription's `accountCodes[]`) are EXCLUDED from the OpEx list, OR show with a "covered by Step 5" badge and zero contribution
   - Step 7: CapEx
   - Step 8: Growth Plan (3yr forecasts only)
   - Step 9: Review — verify the P&L waterfall has a "Subscriptions" line between Team and OpEx
3. **Top-bar nav:**
   - On a new forecast, confirm only Step 1 is clickable
   - Advance to Step 4, confirm Steps 1-4 clickable, Steps 5-9 disabled
   - Click Step 2 (back), edit a goal, click Step 4 (forward), verify edit was saved
   - Edit a vendor budget on Step 5, immediately click Step 6, navigate back, confirm edit preserved
4. **Migration:**
   - Open a forecast last edited yesterday (v10 draft in localStorage)
   - Verify it loads, lands on the correct step, and the migration warning appears in the console
5. **Reporting integration:**
   - Confirm `/api/monthly-report/subscription-detail` still returns the same vendor list as before (we haven't broken its read path)

### Existing tests requiring updates

`src/__tests__/forecast/` has 18 tests, mostly Phase 51-55 step-specific. Tests that touch the affected logic:

| Test file | Likely action |
|-----------|---------------|
| `phase-51-step5-labels.test.tsx` | Step 5 was OpEx; if test asserts step number or label, swap to step 6 / verify new copy |
| `phase-51-step6-sidebar.test.tsx` | Step 6 was Subscriptions; swap to step 5 / verify still passes |
| `phase-51-step6-manual-entry.test.tsx` | Same |
| `phase-51-step6-re-analyze.test.tsx` | Same |
| `wizard-v4-bug-fixes.test.tsx` | Has the canonical $23,200 fixture for legacy planned-spend math; should not be affected by Phase 57 but rerun to confirm |

**RECOMMEND new tests:**
- `phase-57-step-renumber-migration.test.ts` — v10 draft loads correctly into v11 schema
- `phase-57-subscription-rollup.test.ts` — given a state with 3 active vendors @ $100/mo, assert `summary.year1.subscriptions === 3600`, `summary.year2.subscriptions === 3708` (3% growth), netProfit decreases by exactly the subscriptions amount minus what was previously double-counted
- `phase-57-double-count-prevention.test.ts` — given `opexLines` with `accountCode='5100'` and a subscription with `accountCodes=['5100']`, verify the OpEx accumulator skips that line
- `phase-57-clickable-nav.test.tsx` — render `StepBar` with `maxVisitedStep=4`, verify clicks on steps 1-4 fire `goToStep`, clicks on 5-9 do nothing

---

## Project Constraints (from CLAUDE.md and memory)

There is no project-level `CLAUDE.md` at the repo root. From `MEMORY.md`:

- **CFO-grade accuracy expected** (memory: `user_role.md`) — no silent number changes; any net-profit delta from Phase 57 must be explained and approved
- **Trace root cause before deploying fixes** (memory: `feedback_testing.md`) — don't ship the renumber without first running the audit on the join-key (Section B Unknown 1) and the BudgetTracker drift risk (Risk 6)
- **Simplicity over completeness** (memory: `user_design_philosophy.md`) — argues against per-vendor Y2/Y3 forecasting; one global growth % is correct
- **Only push to wisdom-business-intelligence repo** (memory: `feedback_git_remote.md`) — operational note for the planner
- **Phase 53 (Xero connection durability) is a parallel concern** — don't deploy Phase 57 changes that increase Xero API call volume on Step 5/6 while connections are flaky

---

## Open questions (need Matt's call)

1. **Join key:** Should we add `accountCode` to `OpExLine` and use that as the canonical join key, or rely on account-name fuzzy matching as a fallback? (Section B, Unknown 1)
   - **Recommendation:** Add `accountCode`, use it primarily, fall back to name match for legacy drafts. Bumps wizard version to 11.

2. **Y2/Y3 subscription growth:** Single global %, or per-vendor?
   - **Recommendation:** Single global, defaulting to `defaultOpExIncreasePct` (3%). Per-vendor deferred to Phase 58+.

3. **Step 6 (new OpEx) subscription-classified rows:** Hide them entirely, or show with "covered by Step 5" badge and zero contribution?
   - **Recommendation:** Show with badge — operators understand transparency better than hiding. The badge prevents the "wait, where did my $X subscription line go?" support ticket.

4. **Step rename:** "OpEx" → "Discretionary OpEx" — yes/no?
   - **Recommendation:** Yes. Aligns the label with the post-Phase-57 reality.

5. **Snapshot subscriptions into `forecast_assumptions`:** yes/no?
   - **Recommendation:** Yes. Cheap, makes forecasts self-contained, supports historical audit.

6. **`isSubscription` flag on `OpExLine`:** Deprecate or delete?
   - **Recommendation:** Deprecate (leave on type, stop reading). Removes risk of breaking old assumption JSON.

7. **Excel Subscriptions tab** (`ExcelExport.tsx:360`): rewrite to read from new state.subscriptions?
   - **Recommendation:** Yes — small task, makes the export accurate. The current `opexLines.filter(l => l.isSubscription)` returns empty for every forecast.

8. **Effort sizing:** does the planner's effort match Matt's gut? See effort estimate at top.

---

## Effort estimate

**8–12 plan tasks. 5–7 working days.**

Suggested task split:

| # | Task | Day(s) | Risk |
|---|------|--------|------|
| 1 | Audit join key (`accountCode` vs `accountId` vs name) on real Xero data; pick approach | 0.5 | Critical — gates everything |
| 2 | Add `accountCode` to `OpExLine`; populate during Xero ingest; backfill on draft load | 0.5 | LOW |
| 3 | Add `subscriptions: VendorBudget[]` to `ForecastWizardState`; load from `/api/subscription-budgets` on wizard mount; auto-save back | 1.0 | LOW |
| 4 | Update rollup math: `summary.year{N}.subscriptions`, exclude covered OpEx accounts | 1.0 | MEDIUM |
| 5 | Swap step 5↔6 component bindings, labels, `WIZARD_STEPS`, descriptions, YearTabs gate | 0.5 | LOW |
| 6 | `WIZARD_VERSION` 10→11 migration block; unit test | 0.5 | LOW |
| 7 | `BudgetFramework` formula update; subtract subscriptions; relabel | 0.5 | LOW |
| 8 | `BudgetTracker.tsx` parity update | 0.25 | LOW |
| 9 | `StepBar` clickable-nav: `maxVisitedStep`, validation icons, flush-before-jump | 1.0 | MEDIUM |
| 10 | `Step8Review.tsx` waterfall + checklist updates | 0.5 | LOW |
| 11 | `AICFOPanel` / `AIAssistant` step-label updates | 0.25 | LOW |
| 12 | `ExcelExport` subscriptions tab rewrite | 0.5 | LOW |
| 13 | `buildAssumptions` populates `subscriptions?`; load reconciliation | 0.5 | LOW |
| 14 | Manual QA on JDS or another representative tenant; verify net-profit deltas | 0.5 | HIGH (gating) |

Sum: ~7 days. Compress to 5 days if tasks 11-12 are deferred (operator-visible but not blocking).

**Risk drivers:**
- Task 4 (rollup math) is the highest-impact change — needs careful test coverage
- Task 1 (join key audit) gates correctness — must complete before task 4
- Task 14 (QA on real data) is the integrity gate before ship

---

## Sources

### Primary (HIGH confidence)
- `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx` (1902 lines, fully read for nav/render/load)
- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts` (1801 lines, key functions read: state init 121-152, load 158-242, save 244-253, navigation 327-353, summary rollup 1158-1495, buildAssumptions 1500-1654)
- `src/app/finances/forecast/components/wizard-v4/types.ts` (912 lines — types + WIZARD_STEPS + helpers)
- `src/app/finances/forecast/components/wizard-v4/types/assumptions.ts` (focused read on subscriptions section, lines 200-330)
- `src/app/finances/forecast/components/wizard-v4/components/StepBar.tsx` (78 lines, fully read)
- `src/app/finances/forecast/components/wizard-v4/components/BudgetTracker.tsx` (385 lines, fully read for ceiling-formula parity)
- `src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx` (BudgetFramework component lines 50-210, fully read)
- `src/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions.tsx` (1399 lines — read storage path, vendor shape, save/load cycle)
- `src/app/finances/forecast/components/wizard-v4/steps/Step8Review.tsx` (lines 90-110 waterfall, lines 553-660 advisor checks)
- `src/app/finances/forecast/components/wizard-v4/steps/Step8GrowthPlan.tsx` (subscription detection lines 315-343)
- `src/app/finances/forecast/components/wizard-v4/utils/opex-classifier.ts` (689 lines — keyword tables, classifier, suggested-value helpers)
- `src/app/api/subscription-budgets/route.ts` (full GET/POST/DELETE, 184 lines)
- `src/app/api/Xero/chart-of-accounts/route.ts` (subscription detection logic lines 22-58, 165-189)
- `supabase/migrations/00000000000000_baseline_schema.sql:4916-4941` — `subscription_budgets` table schema

### Secondary (MEDIUM confidence)
- Cross-reference greps for `currentStep`, `Step [N]`, `isSubscription`, `subscription_budgets` across `src/`
- `MEMORY.md` for project context (Matt's role, design philosophy, dual-ID system, Xero classification rules)

### Not consulted (deliberately)
- Context7 — not relevant; this is internal application code, no third-party library APIs are at the heart of the change
- Vercel deployment guides — irrelevant (no infra change)
- React/Next.js docs — the patterns used are stable React 18 patterns (`useState`, `useMemo`, `useEffect`, `useCallback`); no SSR/cache-component concerns since the wizard is `'use client'`-only

---

## Metadata

**Confidence breakdown:**
- Current state inventory: HIGH — read every relevant file
- Subscription integration semantics: MEDIUM-HIGH — clear data flow but join-key is genuinely ambiguous (flagged as Unknown 1)
- Budget Framework formula change: HIGH — small, contained edit
- Clickable nav design: HIGH — patterns are obvious; rules are operator-quality decisions
- Migration approach: HIGH — soft-migration pattern already proven in P56 P1 B2
- Cross-step impacts: HIGH — exhaustive grep coverage
- Save/load reconciliation: MEDIUM-HIGH — recommendation is sound but planner should validate against monthly-report consumer behavior on real data
- Risks: HIGH — comprehensive coverage of likely failure modes

**Research date:** 2026-05-07
**Valid until:** 2026-06-06 (30 days; the wizard codebase is actively edited so rerun greps if planning hasn't started by then)
