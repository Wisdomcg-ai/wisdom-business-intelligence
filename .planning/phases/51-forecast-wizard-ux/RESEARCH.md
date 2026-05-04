# Phase 51: Forecast Wizard UX Improvements — Research

**Researched:** 2026-05-04
**Domain:** React/TypeScript wizard UX (forecast-wizard-v4) — additive UI + state changes
**Confidence:** HIGH (working directly off the live code; no library version uncertainty)

## Summary

Phase 51 adds 11 UX improvements across Steps 3, 4, 5, and 6 of `wizard-v4`. Every change is additive: new optional fields on `types.ts`, new optional UI affordances, no schema migrations, no API contract changes. Older saved forecasts are preserved by leaving every new field as `undefined` and falling through to today's behavior — the same backward-compatibility approach Phase 50 used for `lease_type` on `PlannedSpend`.

The architecture and patterns are already established: Step 3 already has the local-pending-state pattern (PR #82, lines 45–84 of `Step3RevenueCOGS.tsx`); Step 4 already has departures in state (`state.departures`) but no obvious UI to add them on the row; Step 5 already has a 4-way `costBehavior` dropdown that the operator finds confusing; Step 6 already has a 3-phase state machine (`select-accounts | analyzing | review`) and even a manual-vendor flow gated behind `isManualMode` (no Xero connection). Phase 51 mostly **promotes hidden capabilities to the UI surface** + adds a few genuinely new features (Step 3 $ entry, Step 3 per-line seasonality, Step 5 simpler "$ vs %" toggle).

**Primary recommendation:** Adopt the Phase 50 Bug 4 "shared lockstep helper" pattern from `getPlannedSpendPLBreakdown` (types.ts:331–438) as the model for every new Phase 51 calculation that's read by both the step UI AND the rollup engine in `useForecastWizard.ts`. Specifically: extract `getRevenueLineMonthlyDistribution(line, yearNum, businessSeasonality)` so the per-line seasonality override (UX-S3-03) can't drift between display and rollup. Same goes for `getOpExLineY1Amount(line, monthlyRevenue)` for the $/% toggle (UX-S5-01).

## Project Constraints (from CLAUDE.md)

No project `./CLAUDE.md` file exists. Constraints derived from auto-memory:

1. **Go deep before deploying fixes** — trace root cause fully, plan before coding, don't ship incremental patches. Applies here: the per-line seasonality override (UX-S3-03) interacts with the rollup engine in three places (`Step3RevenueCOGS.tsx` display, `useForecastWizard.ts` summary, AssumptionsBuilder). Plan the helper extraction before touching any one site.
2. **Phase 50 lockstep-helper precedent** — the gold standard is `getPlannedSpendPLBreakdown` in types.ts:331. It's referenced from both Step6CapEx per-row column AND the rollup engine; both call the same function so they cannot drift. Phase 51's new calculations should follow this exact pattern, not duplicate logic across sites.
3. **Real-hook test harness, not vi.fn() stubs** — established in `wizard-v4-bug-fixes.test.tsx` lines 174–191 (`Step3Harness`). Tests that use `makeStubActions()` (vi.fn() stubs) cannot detect controlled-input round-trip bugs because state never updates between keystrokes; bidirectional sync (UX-S3-01) and any other "type X, observe Y" test MUST use `Step3Harness`-style real-hook rendering.
4. **Backward-compat via undefined fallthrough** — Phase 50's `lease_type` precedent: when the new field is `undefined`, `getPlannedSpendPLBreakdown` calls `getBreakdownLegacy()` and returns identical numbers to pre-Phase-50. Phase 51 follows the same rule: every new field defaults to `undefined`, every consumer of the new field has an `if (newField !== undefined) { ...new behavior } else { ...today's behavior }` branch.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UX-S3-01 | Direct $ entry per line, $ ↔ % parity | Today's `% Split` input is at Step3RevenueCOGS.tsx:776–792 (summary view) and 1073–1089 (monthly view). Local pending-state pattern from PR #82 already proven (Step3RevenueCOGS.tsx:45–46, 65–84). Add a sibling `$ pending` state and a `commitDollarValue` handler that calls the same `handleMixChange` after dollar→percent conversion. |
| UX-S3-02 | Y-on-Y Growth % column for Y2/Y3 | `handleGrowthChange` already exists (Step3RevenueCOGS.tsx:371–430) — calculates from prior-year line total × (1+growth%). Just needs UI surfacing in Y2/Y3 view as a column alongside `% Split` and `$`. Mutually-exclusive UX: edit one column, the others auto-recompute. |
| UX-S3-03 | Per-line seasonality override | New optional field `seasonalityPattern?: number[]` on `RevenueLine` and `COGSLine`. Need a `getEffectiveSeasonality(line, businessSeasonality)` helper called from BOTH the display calculations in Step3 AND the rollup in `useForecastWizard.ts:summary` (lines 1060–1190). Editor: small "edit seasonality" button per row that opens a 12-month modal. |
| UX-S4-01 | "End someone" termination flow | `Departure` already exists in state and rollup (types.ts:168–172, useForecastWizard.ts:1097–1115). UI exists but is buried in a `MonthPicker` with placeholder `"..."` (Step4Team.tsx:1934–1944). Replace with explicit "End employee" button that opens a small modal: choice between "remove from FY entirely" (set endMonth = first month of FY, salary stays at 0 via the rollup math) vs "ends on month X" (current behavior, set endMonth). |
| UX-S4-02 | PT/casual: hours-per-week OR % FTE | Already partial: `PartTimeSalaryInput` (Step4Team.tsx:175–214) takes `hoursPerWeek`. Add a small toggle inside `PartTimeSalaryInput` (and casual equivalent) for "Hours / FTE %" mode. New optional field `hoursMode?: 'hours' \| 'fte'` on `TeamMember` and `NewHire`. When `'fte'`, derive hours from `fte * STANDARD_HOURS` (already declared at Step4Team.tsx:62) before salary calculation. |
| UX-S4-03 | Pay frequency selector (weekly/fortnightly/monthly) | New optional field `payFrequency?: 'weekly' \| 'fortnightly' \| 'monthly'` on `TeamMember` and `NewHire`, plus a business-level default `defaultPayFrequency` on `ForecastWizardState`. Does NOT affect Y1/Y2/Y3 P&L summary (annual salary is annual). DOES affect downstream cashflow timing (Phase 52). For Phase 51: persist to state, display in row, default to `'monthly'` if `undefined` (back-compat). |
| UX-S5-01 | $ vs % toggle per OpEx line + tooltip | Today's `costBehavior` dropdown has 4 options (fixed/variable/seasonal/adhoc) at Step5OpEx.tsx:1339–1356. Operator wants the simpler 2-way "$ per month / % of revenue" mental model. Recommended approach: KEEP `costBehavior` field (don't break old data) and ADD a derived UI presentation that maps `fixed \| seasonal \| adhoc` → `$` and `variable` → `%`. New explainer tooltip on the toggle. Lower-effort alternative: just style the existing dropdown as a 2-button toggle that internally still picks `fixed` or `variable`. |
| UX-S5-02 | Simpler OpEx layout | UI cleanup: clearer column headers, consistent input widths, optional "group by category" collapse, explicit "Year total" + "Monthly avg" columns. Pure presentation — no state model changes. |
| UX-S6-01 | Sidebar with selected accounts | Today's "Re-analyze" button (Step6Subscriptions.tsx:870–875) is the only way to see what's selected. Add a persistent collapsible sidebar that reads `accounts.filter(a => a.isSelected)` and displays name + the `priorFYAmount` / `currentFYAmount` totals from `vendors.filter(v => account_codes contains accountCode)`. |
| UX-S6-02 | "Change selected accounts" link preserves vendor toggles | Today's "Re-analyze" button (Step6Subscriptions.tsx:871) calls `setPhase('select-accounts')` — vendor toggles already preserved in `vendors` state since `setPhase` doesn't reset `vendors`. The bug is: `analyzeSubscriptions` (line 367) does `setVendors(vendorBudgets)` which replaces the array. Fix: when re-analyzing, MERGE existing vendor `isActive` / `monthlyBudget` toggles by `vendorKey` rather than overwriting. |
| UX-S6-03 | Manual subscription entry button (always visible) | `addManualVendor` (Step6Subscriptions.tsx:433–448) and the "+ Add Subscription" button (line 862–867) already exist but are gated behind `isManualMode` (no-Xero fallback). Remove the `isManualMode &&` guard so the button is always visible in `phase === 'review'`. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3.x (project default) | All wizard UI | Already used throughout wizard-v4 |
| TypeScript | strict mode (project default) | Type safety on optional fields | Strict null checks catch back-compat bugs |
| lucide-react | (current project version) | Icons (`X`, `Plus`, `Settings`, `Calendar`, `Edit3`, `ChevronDown`) | Already imported in every step; no new dep |
| Tailwind CSS | (project version) | Styling | Project standard; no new dep |
| Vitest + @testing-library/react + @testing-library/user-event | (current project version) | Test harness | Already used in `wizard-v4-bug-fixes.test.tsx` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | — | All Phase 51 work uses existing project deps |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline 12-month seasonality editor (modal) | A reusable `<SeasonalityEditor>` component | Modal is fine for Phase 51 scope (3 use sites: Step 3 revenue lines, Step 3 COGS lines, future business-level seasonality). Component extraction can wait until a 4th site appears. |
| Custom small modal | shadcn/ui dialog | Project doesn't appear to use shadcn — Step 4 already inline-renders modals via conditional JSX (e.g., `showAddVendor` at Step6Subscriptions.tsx:897). Match existing pattern. |

**Installation:**
```bash
# No new dependencies required
```

**Version verification:** Skipped — no new dependencies introduced.

## Architecture Patterns

### Recommended Project Structure
```
src/app/finances/forecast/components/wizard-v4/
├── steps/
│   ├── Step3RevenueCOGS.tsx       # Existing — touch for UX-S3-01, -02, -03
│   ├── Step4Team.tsx              # Existing — touch for UX-S4-01, -02, -03
│   ├── Step5OpEx.tsx              # Existing — touch for UX-S5-01, -02
│   └── Step6Subscriptions.tsx     # Existing — touch for UX-S6-01, -02, -03
├── components/
│   └── (NEW) SeasonalityEditor.tsx  # Extracted modal for UX-S3-03 (optional — could inline)
├── hooks/                         # NEW directory (or just put helpers in utils/)
│   └── (NEW) useEditableValue.ts  # Reusable pending-state pattern from PR #82
├── utils/
│   └── (NEW) line-distribution.ts # Shared rollup helpers for revenue/cogs distribution
├── types.ts                       # Add optional fields here (additive only)
└── useForecastWizard.ts           # Update summary calculation to use shared helpers
```

### Pattern 1: Shared Lockstep Helper (Phase 50 Bug 4 precedent)

**What:** Calculations referenced from BOTH the step UI AND the rollup engine MUST be extracted to a single function that both sites call. Prevents the rollup and the on-screen total from drifting.

**When to use:** Any time a new field (e.g., per-line seasonality, $-vs-%) changes how a line's value is computed.

**Example (verified — types.ts:331–438):**
```typescript
// Source: src/app/finances/forecast/components/wizard-v4/types.ts:331
export function getPlannedSpendPLBreakdown(
  item: PlannedSpend,
  yearNum: 1 | 2 | 3,
): PlannedSpendPLBreakdown {
  if (item.lease_type) {
    return getBreakdownWithTaxonomy(item, yearNum);  // NEW behavior
  }
  return getBreakdownLegacy(item, yearNum);          // FALLTHROUGH
}
```

Phase 51 should add similar helpers:

```typescript
// utils/line-distribution.ts (new)
export function getEffectiveSeasonality(
  line: { seasonalityPattern?: number[] },
  businessSeasonality: number[],
): number[] {
  return line.seasonalityPattern ?? businessSeasonality;
}

export function getRevenueLineMonthlyDistribution(
  line: RevenueLine,
  annualTarget: number,
  businessSeasonality: number[],
  monthKeys: string[],
  isActualMonth: (key: string) => boolean,
  actualValues: MonthlyData,
): MonthlyData {
  // Single source of truth — called from Step 3 handlers AND from rollup
}
```

### Pattern 2: Local Pending-State Input (PR #82)

**What:** Controlled inputs whose displayed value is DERIVED from upstream state (rounded, residual-fixed) cannot use the derived value as `value=` directly — every keystroke would rerender to a different number. Hold the typed string in local state until blur/Enter, then commit.

**When to use:** UX-S3-01 ($ entry), UX-S3-02 (Growth %), and any future field that's computed bidirectionally.

**Example (verified — Step3RevenueCOGS.tsx:45–84):**
```typescript
const [pendingMixPcts, setPendingMixPcts] = useState<Record<string, string>>({});

const commitMixPct = (lineId: string, raw: string | undefined, kind: 'revenue' | 'cogs') => {
  if (raw === undefined) return;
  const parsed = parseInt(raw, 10);
  const clamped = Math.max(0, Math.min(100, isNaN(parsed) ? 0 : parsed));
  if (kind === 'revenue') handleMixChange(lineId, clamped);
  else handleCogsMixChange(lineId, clamped);
  setPendingMixPcts(prev => { const n = { ...prev }; delete n[lineId]; return n; });
};

// In JSX:
<input
  type="number"
  value={pendingMixPcts[line.id] !== undefined ? pendingMixPcts[line.id] : currentMixPct}
  onChange={(e) => setPendingMixPcts(prev => ({ ...prev, [line.id]: e.target.value }))}
  onBlur={() => commitMixPct(line.id, pendingMixPcts[line.id], 'revenue')}
  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
/>
```

**Recommended extraction:** A `useEditableValue<T>(committedValue, commitFn)` hook in `hooks/useEditableValue.ts` that returns `{ display, onChange, onBlur, onKeyDown }`. Same code is duplicated for `pendingMixPcts` (revenue) and `pendingCogsMixPcts` (COGS) today; UX-S3-01 will add `pendingDollarValues` (revenue) and would benefit from extraction. Step 5 $/% toggle can also reuse it.

### Pattern 3: Backward-Compat via Undefined Fallthrough (Phase 50 lease_type)

**What:** New optional fields default to `undefined`. Every consumer checks `if (field !== undefined) { ...new behavior } else { ...legacy behavior }`. Old saved forecasts never have the new field set, so they continue producing identical numbers.

**Verified at:** types.ts:283 (`lease_type?: LeaseType`), types.ts:335–339 (dispatch logic).

**Phase 51 application:** Every new field on `RevenueLine`, `COGSLine`, `TeamMember`, `NewHire`, `OpExLine` is `?:` (optional) and every consumer in `useForecastWizard.ts` summary checks for `undefined` first.

### Pattern 4: 3-Phase State Machine (Step 6 precedent)

**What:** `phase: 'select-accounts' | 'analyzing' | 'review'` (Step6Subscriptions.tsx:88) drives which UI block renders. Transitions are explicit `setPhase()` calls. Vendor data persists across phase transitions (good).

**Phase 51 implication:** UX-S6-02 fix is just to MERGE `vendors` state on re-analyze rather than replace it. Don't change the phase machine.

### Anti-Patterns to Avoid

- **Duplicating distribution logic between display and rollup:** If Step 3 calculates per-month distribution one way and `useForecastWizard.ts` summary calculates it another way, they will drift. Phase 50 Bug 4 was this exact bug. Always extract to `utils/line-distribution.ts` and call from both sites.
- **Mocking actions in bidirectional-sync tests:** `makeStubActions()` (vi.fn() everywhere) prevents state updates between keystrokes. UX-S3-01's $ ↔ % round-trip test MUST use `Step3Harness` (real `useForecastWizard` hook + `setRevenueLines` seeding) — see Phase 50 Bug 1 test (wizard-v4-bug-fixes.test.tsx:174–223) for the canonical example.
- **Hard-coding seasonality in calculation sites:** Today's seasonality reads as `priorYear?.seasonalityPattern || Array(12).fill(8.33)` in 7+ different places (Step3RevenueCOGS.tsx:183, 210, 249, 379, 462, 603 + useForecastWizard.ts:304, 366, 890, 934). UX-S3-03 will multiply this by ~12 sites if not extracted. **Extract `getEffectiveSeasonality(line, businessSeasonality)` BEFORE adding the override field.**
- **Removing `isManualMode` block in Step 6:** The `isManualMode` flag (Step6Subscriptions.tsx:139) is the no-Xero fallback. UX-S6-03 makes the "+ Add Subscription" button visible in Xero mode too — but DO NOT delete the `isManualMode` branches. They handle the case where Xero is disconnected entirely.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pending-state controlled input | New custom hook from scratch | Extract `useEditableValue` from existing `pendingMixPcts` pattern (Step3RevenueCOGS.tsx:45–84) | Pattern is already proven and ships with Phase 50; just extract |
| Modal/dialog primitive | New `<Modal>` component | Inline conditional render with backdrop div, matching `showAddVendor` (Step6Subscriptions.tsx:897) and `showAddRevenue` (Step3RevenueCOGS.tsx:673) patterns | Project doesn't use a modal lib; matches existing UI |
| Month picker | New month-picker component | `MonthPicker` already used in Step4Team.tsx (line 1912 / 1925 / 1938) — reuse it for UX-S4-01 termination date | Already exists |
| Currency input | New currency input | `CurrencyInput` (Step4Team.tsx:100–128) — reuse for UX-S6-03 manual subscription `$ amount` field | Already exists with proper formatting + focus handling |
| Per-line salary calc for PT/casual | New salary-from-FTE function | `STANDARD_HOURS = 38` constant + `calculateFTE(hours)` helper already exist at Step4Team.tsx:62, 65–67 | Already built; UX-S4-02 just inverts the call: `salary = baseFullTimeSalary * (fte / 1)` |
| Pay-frequency cashflow distribution (Phase 52 territory) | Pay-period schedule generator | NOTHING in Phase 51 — just persist `payFrequency` to state. Cashflow distribution lands in Phase 52. | Out of scope per PHASE.md |

**Key insight:** Most of Phase 51's "build" work is actually "surface what's already in state." Departures, manual vendors, and per-line seasonality calculations all already exist as concepts in the codebase — they just need clearer UI affordances and (for seasonality) one new state field.

## Runtime State Inventory

> Phase 51 is additive UI + state changes. Verifying that nothing else in the runtime stores forecast state in a format that would break.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `financial_forecasts` table — JSON columns hold the whole `ForecastWizardState`. Adding optional fields is safe (older rows have them as `undefined` after rehydration). | None — no migration needed. Phase 50 added `lease_type` the same way without a migration. |
| **localStorage** | `useForecastWizard.ts:171` does `localStorage.setItem(key, JSON.stringify({ ...state, wizardVersion: WIZARD_VERSION }))`. New optional fields are persisted automatically. `WIZARD_VERSION = 10` (line 51) — bumping it would force a re-init from API and lose unsaved drafts. | Do NOT bump `WIZARD_VERSION` for Phase 51. New fields are additive — old caches with `undefined` for new fields work fine. |
| **Live service config** | None — wizard state lives only in localStorage + `financial_forecasts` JSON. | None. |
| **OS-registered state** | None. | None. |
| **Secrets/env vars** | None — no new external deps. | None. |
| **Build artifacts / installed packages** | None — no new packages. | None. |

## Common Pitfalls

### Pitfall 1: Per-line seasonality not threaded into the rollup engine
**What goes wrong:** Operator sets a custom seasonality on revenue line A; Step 3 display shows the new monthly distribution; but `useForecastWizard.ts` summary still calculates revenue using `priorYear.seasonalityPattern` for everything. Annual total stays correct (sum of months), but monthly forecasts in downstream views (cashflow, monthly P&L preview) are wrong.
**Why it happens:** Seasonality is read as `priorYear?.seasonalityPattern` at 7+ sites. Per-line override only takes effect at sites that read `getEffectiveSeasonality(line, businessSeasonality)` instead.
**How to avoid:** Phase 51 plan 51-03 MUST start with extracting `getEffectiveSeasonality()` and replacing every existing call site BEFORE adding the override UI. Without this, the override silently does nothing (or worse, agrees with display but disagrees with rollup).
**Warning signs:** Sum of `Object.values(line.year1Monthly)` doesn't equal the goals.year1.revenue split when override is set; downstream reports show a different monthly distribution than Step 3 display.

### Pitfall 2: $ ↔ % bidirectional sync flickers or loses keystrokes
**What goes wrong:** Operator types "50000" in $; sees the % auto-update; types into %; the $ field rerenders to a rounded version of the typed-into-% value, losing characters mid-edit.
**Why it happens:** Both fields are derived from the same canonical value (annual line total). Without local pending state on BOTH inputs, each keystroke triggers a rerender that overwrites the other input.
**How to avoid:** Use the PR #82 pattern on both inputs. The committed value is monthly distribution; both `$` and `%` are derived. While EITHER field is being edited (has a value in `pending*`), the other is locked to "display the just-committed value, no derived recalc."
**Warning signs:** Vitest assertion "type 50000 in $, expect % to be 5" fails because the % input value is `'5'` for 1ms then back to old value due to rerender race.

### Pitfall 3: Step 5 $/% toggle silently changes existing line behavior
**What goes wrong:** Operator opens an existing forecast where line "Marketing" was `costBehavior: 'seasonal'`; new $/% UI shows it as "$" (because non-variable maps to $); operator confirms "$"; the seasonal-pattern math is dropped, line total changes by $X.
**Why it happens:** Mapping 4 behaviors → 2 UI options is lossy. Picking the "$" preset on a previously-seasonal line replaces `costBehavior: 'seasonal'` with `costBehavior: 'fixed'` and discards `seasonalGrowthPct` / `seasonalTargetAmount`.
**How to avoid:** Two options. (a) The toggle is **display-only** — it visually groups behaviors but doesn't write to state until the operator explicitly changes a value (using the existing `handleBehaviorChange` flow). (b) Add a confirmation modal "This will change how Marketing is calculated. Today: seasonal pattern. New: fixed monthly. Continue?" Recommend (a) — simpler and zero-impact on existing data.
**Warning signs:** Loading an old forecast and immediately seeing the YearlySummary change without any user input.

### Pitfall 4: Step 6 vendor toggles wiped on re-analyze
**What goes wrong:** Operator selects 5 accounts → analyzes → reviews 20 vendors → toggles 5 of them off → clicks "Change selected accounts" → adds a 6th account → re-analyzes → all 20 (now 22) vendors come back with `isActive: true`.
**Why it happens:** `analyzeSubscriptions` (Step6Subscriptions.tsx:343–367) does `setVendors(vendorBudgets)` — replaces the array.
**How to avoid:** Build a merge function: for each newly-fetched vendor, if `vendorKey` exists in current `vendors`, preserve `isActive` and `monthlyBudget` from the existing entry. New vendors default to `isActive: true`.
**Warning signs:** Test for UX-S6-02 fails: select 3 accounts, toggle vendor X off, re-analyze same 3 accounts, expect X.isActive to still be false; today it'll be true.

### Pitfall 5: Termination flow zeros YTD actuals
**What goes wrong:** Operator clicks "End someone" → picks "remove from FY entirely" → expects salary to be 0 from FY start; but the team member had real Xero-reported salary actuals for Jul–Mar that should be preserved.
**Why it happens:** Today's rollup (`useForecastWizard.ts:1107–1115`) uses `getDepartureMonthsInFY(endMonth, fy)` which returns `fyMonth = getFiscalMonthIndex(month)` — for July (`endMonth = '2026-07'`), `fyMonth = 1`, so `monthsWorked = 1`. Setting endMonth = '2026-06' (last month of prior FY) returns 0 months. The "remove from FY entirely" UX needs to set endMonth correctly.
**How to avoid:** "Remove from FY entirely" sets `endMonth` to one month BEFORE Y1's first month (e.g., '2026-06' for FY2027). This zeroes out the salary in Y1 onward. YTD Xero actuals are stored elsewhere (`currentYTD.revenue_by_month`, not in `teamMembers`), so they're untouched.
**Warning signs:** Test asserts: setting departure to "FY start" + 1 month yields one month of salary in summary; setting to FY start - 1 month yields zero.

### Pitfall 6: New optional field renders as `undefined` in input
**What goes wrong:** Operator opens an existing forecast that doesn't have `payFrequency` set; the dropdown renders with no selection; selecting "Monthly" works but visiting the row again shows the dropdown is empty again (because re-fetched state hasn't been re-saved yet).
**Why it happens:** `<select value={member.payFrequency}>` with `payFrequency === undefined` shows nothing.
**How to avoid:** Default in the JSX: `value={member.payFrequency ?? 'monthly'}`. The state isn't mutated; the display defaults. When the operator picks a value, it gets persisted.
**Warning signs:** Default fallback rendering inconsistent with persisted value.

## Code Examples

Verified patterns from existing codebase:

### Adding a new optional field with backward-compat
```typescript
// Source: src/app/finances/forecast/components/wizard-v4/types.ts:283 (lease_type precedent)
export interface RevenueLine {
  id: string;
  name: string;
  year1Monthly: MonthlyData;
  year2Monthly?: MonthlyData;
  year3Monthly?: MonthlyData;
  // Phase 51 (UX-S3-03): Per-line seasonality override.
  // When undefined, falls through to business-level seasonality (current behavior).
  // When set, must be 12 percentages summing to 100.
  seasonalityPattern?: number[];
}
```

### Real-hook test harness (UX-S3-01 bidirectional sync test)
```typescript
// Adapted from wizard-v4-bug-fixes.test.tsx:174–191
function Step3Harness({ businessId, initialRevLine }: { businessId: string; initialRevLine?: { id: string; name: string; monthly?: Record<string, number> } }) {
  const wizard = useForecastWizard(FY_START_YEAR, businessId);
  React.useEffect(() => {
    if (initialRevLine && wizard.state.revenueLines.length === 0) {
      wizard.actions.setRevenueLines([{
        id: initialRevLine.id,
        name: initialRevLine.name,
        year1Monthly: initialRevLine.monthly || emptyMonthly(),
      }]);
    }
  }, []);
  if (wizard.state.revenueLines.length === 0) return null;
  return <Step3RevenueCOGS state={wizard.state} actions={wizard.actions} fiscalYear={FISCAL_YEAR_END} />;
}

// Then in the test:
it('UX-S3-01 — typing $50000 updates % column to that line\'s share', async () => {
  // Set up state with goals.year1.revenue = 200000 → 50k = 25%
  // Find the $ input, type 50000, blur, assert % input shows 25
});
```

### Surfacing a hidden state action in UI (UX-S6-03 manual subscription)
```typescript
// Source: Step6Subscriptions.tsx:860–868 — already exists, just remove the gate
{phase === 'review' && (        // CHANGED: was `isManualMode &&`
  <button
    onClick={() => setShowAddVendor(true)}
    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand-navy rounded-lg hover:bg-brand-navy-800 transition-colors"
  >
    <Plus className="w-4 h-4" />
    Add Subscription
  </button>
)}
```

### Merge-on-replace for UX-S6-02
```typescript
// Replace Step6Subscriptions.tsx:367 setVendors(vendorBudgets) with:
setVendors(prev => {
  const prevByKey = new Map(prev.map(v => [v.vendorKey, v]));
  return vendorBudgets.map(newV => {
    const existing = prevByKey.get(newV.vendorKey);
    if (!existing) return newV;
    // Preserve operator's isActive toggle and monthlyBudget edits
    return { ...newV, isActive: existing.isActive, monthlyBudget: existing.monthlyBudget };
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline derived `value=` on controlled inputs | Local pending state with blur-commit | PR #82 (pre-Phase-50) | Prevents keystroke loss on bidirectional inputs |
| Duplicated rollup logic between display and summary | Single shared helper (`getPlannedSpendPLBreakdown`) | Phase 50 Bug 4 | Eliminates display↔rollup drift class of bugs |
| `vi.fn()` mocked actions in tests | Real `useForecastWizard` hook in `Step3Harness` | Phase 50 Bug 1 test | Catches controlled-input round-trip bugs |
| Add fields with required defaults | Add as optional, fallthrough to legacy behavior | Phase 50 `lease_type` | No migration needed; old forecasts unchanged |

**Deprecated/outdated:** Nothing in the wizard-v4 area is deprecated for Phase 51 work.

## Open Questions

1. **Should UX-S5-01 ($/% toggle) replace the `costBehavior` dropdown or live alongside it?**
   - What we know: Operator wants simpler 2-way mental model. Existing dropdown has 4 options used by saved forecasts.
   - What's unclear: Whether "seasonal" and "ad-hoc" are still visible / accessible.
   - Recommendation: Keep `costBehavior` dropdown but visually demote it (e.g., behind a "Show advanced" toggle). The new $/% toggle is the primary control. When operator picks "$", `costBehavior = 'fixed'`. When they pick "%", `costBehavior = 'variable'`. Seasonal/ad-hoc remain available via the demoted dropdown for power users. **Confirm with operator before implementation.**

2. **For UX-S4-01 termination, what does "remove from FY entirely" do to YTD Xero salary actuals if any are stored?**
   - What we know: `state.teamMembers` is wizard-managed (not tied to YTD Xero actuals). YTD revenue actuals are at `state.currentYTD.revenue_by_month` — separate path.
   - What's unclear: Whether team-cost YTD is fetched anywhere and overlaid in Step 4. Skim of Step 4 (lines 1418–1455) shows it reads from `teamMembers` / `newHires` / `departures` only — no YTD overlay.
   - Recommendation: Implement "remove from FY entirely" as `endMonth = month before FY start` (e.g., '2026-06' for FY2027) and add a comment that YTD Xero actuals (if any) are not currently overlaid in Step 4. If operator reports YTD salary still showing after termination, that's a separate Phase 52 issue.

3. **Per-line seasonality on COGS lines — does the operator actually want this, or just on revenue lines?**
   - What we know: PHASE.md UX-S3-03 says "each revenue line and each COGS line".
   - What's unclear: COGS variable lines compute as `% of revenue`, so seasonality is implicit (follows revenue). Per-line seasonality on a variable-COGS line is meaningless. Only fixed-COGS or per-month-data COGS lines benefit.
   - Recommendation: Implement seasonality field on `COGSLine` for completeness, but only show the "edit seasonality" button when `costBehavior === 'fixed'` OR the line has explicit per-month data. Hide for `variable` lines (where it's redundant).

## Environment Availability

> Skipped — Phase 51 is pure code/state changes, no new external dependencies, services, or runtime requirements. All work uses libraries already installed in the project.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + @testing-library/react + @testing-library/user-event (current project versions) |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npx vitest run src/__tests__/forecast/wizard-v4-ux-phase51.test.tsx` (new file per plan) |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UX-S3-01 | $ ↔ % bidirectional sync round-trips cleanly | unit (real-hook harness) | `npx vitest run src/__tests__/forecast/phase-51-step3-dollar-percent.test.tsx -t "UX-S3-01"` | ❌ Wave 0 — new file |
| UX-S3-02 | Y2 line total = Y1 total × (1 + growth%); monthly distribution uses business seasonality | unit (real-hook) | `npx vitest run src/__tests__/forecast/phase-51-step3-growth.test.tsx -t "UX-S3-02"` | ❌ Wave 0 |
| UX-S3-03 | Per-line seasonality override changes monthly distribution; annual total preserved; rollup agrees with display | unit (real-hook + summary assertion) | `npx vitest run src/__tests__/forecast/phase-51-step3-seasonality.test.tsx -t "UX-S3-03"` | ❌ Wave 0 — most critical test |
| UX-S4-01 | Termination zeros costs from chosen month onward; "remove from FY" sets endMonth to month before FY start | unit (rollup summary assertion) | `npx vitest run src/__tests__/forecast/phase-51-step4-termination.test.tsx -t "UX-S4-01"` | ❌ Wave 0 |
| UX-S4-02 | Toggle PT to FTE-mode with 0.6 FTE → salary = full-time × 0.6 | unit (real-hook) | `npx vitest run src/__tests__/forecast/phase-51-step4-pt-casual.test.tsx -t "UX-S4-02"` | ❌ Wave 0 |
| UX-S4-03 | Setting business default = 'fortnightly' applies to new hires; per-employee override persists | unit (state assertion) | `npx vitest run src/__tests__/forecast/phase-51-step4-pay-frequency.test.tsx -t "UX-S4-03"` | ❌ Wave 0 |
| UX-S5-01 | Toggle line to "%" sets `costBehavior: 'variable'`; rollup uses % of revenue | unit (real-hook + rollup) | `npx vitest run src/__tests__/forecast/phase-51-step5-dollar-percent.test.tsx -t "UX-S5-01"` | ❌ Wave 0 |
| UX-S5-02 | Visual layout — covered by manual operator approval on deployed preview | manual-only | (none) | N/A |
| UX-S6-01 | Sidebar lists selected account names with totals | RTL render assertion | `npx vitest run src/__tests__/forecast/phase-51-step6-sidebar.test.tsx -t "UX-S6-01"` | ❌ Wave 0 |
| UX-S6-02 | Re-analyze with same accounts preserves vendor `isActive` toggle | unit (state assertion across phase transitions) | `npx vitest run src/__tests__/forecast/phase-51-step6-re-analyze.test.tsx -t "UX-S6-02"` | ❌ Wave 0 |
| UX-S6-03 | "+ Add Subscription" button visible in xero mode; manual entry adds vendor with correct totals | RTL interaction | `npx vitest run src/__tests__/forecast/phase-51-step6-manual-entry.test.tsx -t "UX-S6-03"` | ❌ Wave 0 |
| (cross-cutting) | Loading an old forecast (no new fields set) produces identical YearlySummary as before Phase 51 | unit (snapshot of summary numbers) | `npx vitest run src/__tests__/forecast/phase-51-backward-compat.test.tsx` | ❌ Wave 0 — REQUIRED |

### Sampling Rate
- **Per task commit:** `npx vitest run src/__tests__/forecast/phase-51-*.test.tsx` (the per-plan file)
- **Per wave merge:** `npx vitest run src/__tests__/forecast/` (all forecast tests including Phase 50 regression)
- **Phase gate:** `npx vitest run` + `npm run lint` + `npm run typecheck` + `npm run build` all green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/forecast/phase-51-step3-dollar-percent.test.tsx` — covers UX-S3-01
- [ ] `src/__tests__/forecast/phase-51-step3-growth.test.tsx` — covers UX-S3-02
- [ ] `src/__tests__/forecast/phase-51-step3-seasonality.test.tsx` — covers UX-S3-03 (highest risk; lockstep helper test)
- [ ] `src/__tests__/forecast/phase-51-step4-termination.test.tsx` — covers UX-S4-01
- [ ] `src/__tests__/forecast/phase-51-step4-pt-casual.test.tsx` — covers UX-S4-02
- [ ] `src/__tests__/forecast/phase-51-step4-pay-frequency.test.tsx` — covers UX-S4-03
- [ ] `src/__tests__/forecast/phase-51-step5-dollar-percent.test.tsx` — covers UX-S5-01
- [ ] `src/__tests__/forecast/phase-51-step6-sidebar.test.tsx` — covers UX-S6-01
- [ ] `src/__tests__/forecast/phase-51-step6-re-analyze.test.tsx` — covers UX-S6-02
- [ ] `src/__tests__/forecast/phase-51-step6-manual-entry.test.tsx` — covers UX-S6-03
- [ ] `src/__tests__/forecast/phase-51-backward-compat.test.tsx` — REQUIRED safety net: load fixture without new fields, assert summary unchanged
- [ ] No new shared fixtures needed — reuse `Step3Harness`, `makeStubState`, `makeStubActions`, `emptyMonthly`, `targetFYKeys` from `wizard-v4-bug-fixes.test.tsx` (extract them to a shared `__tests__/forecast/_helpers.ts` if duplication grows)

## Plans

This section confirms / revises the 6 plans proposed in PHASE.md.

### Recommended plan list (revised)

The proposed 6 plans are about right in count, but plan **51-04 (Step 4 termination + PT/casual + pay frequency bundled)** is too big — it spans 3 separate UX requirements with different code surfaces and risk profiles. Recommend splitting it into 2 plans (51-04a, 51-04b). Net change: 7 plans instead of 6.

| Plan | Requirements | Files Touched | Estimated Risk | Estimated Effort |
|------|--------------|---------------|---------------|-----------------|
| **51-00** (NEW) | Shared helpers | `utils/line-distribution.ts` (new), `hooks/useEditableValue.ts` (new), tests for helpers | Low | Small (pre-work for 51-01 and 51-03) |
| **51-01** | UX-S3-01 ($/% parity) | `Step3RevenueCOGS.tsx`, `types.ts` (none for this plan), test file | Low | Medium |
| **51-02** | UX-S3-02 (Growth % column) | `Step3RevenueCOGS.tsx`, test file | Low | Small (handler `handleGrowthChange` already exists) |
| **51-03** | UX-S3-03 (Per-line seasonality) | `Step3RevenueCOGS.tsx`, `types.ts` (add `seasonalityPattern?` to RevenueLine + COGSLine), `useForecastWizard.ts` (use `getEffectiveSeasonality`), `utils/line-distribution.ts` (extend), seasonality editor modal, test file | **MEDIUM** (rollup interaction) | Large |
| **51-04a** | UX-S4-01 (termination flow) + UX-S4-02 (PT/casual hours mode) | `Step4Team.tsx`, `types.ts` (add `hoursMode?` to TeamMember + NewHire), test files | Low–Medium | Medium |
| **51-04b** | UX-S4-03 (pay frequency selector) | `Step4Team.tsx`, `types.ts` (add `payFrequency?` to TeamMember + NewHire + business-level default to ForecastWizardState), test file | Low (no rollup impact in Phase 51) | Small |
| **51-05** | UX-S5-01 ($/% toggle) + UX-S5-02 (simpler layout) | `Step5OpEx.tsx`, possibly `useEditableValue` for $/% pending state, test file | Low–Medium | Medium |
| **51-06** | UX-S6-01 (sidebar) + UX-S6-02 (preserve toggles on re-analyze) + UX-S6-03 (manual entry button always visible) | `Step6Subscriptions.tsx`, test file | Low | Medium |

### Why 51-00 is its own plan

Both 51-01 ($/% parity) and 51-03 (per-line seasonality) want the same two helpers:
- `useEditableValue` hook (extracted from PR #82 pending-state pattern) — used by both 51-01's $ input and (potentially) 51-05's $/% toggle
- `getEffectiveSeasonality(line, businessSeasonality)` and `getRevenueLineMonthlyDistribution(...)` — used by 51-03 (override) AND ALSO retroactively useful in 51-01 (when typing $, recompute monthly distribution)

Shipping these as 51-00 first means 51-01 through 51-05 can call them. If we don't extract first, 51-01 and 51-03 will duplicate logic and we'll have to refactor in 51-03 anyway.

### Why split 51-04

| Sub-plan | Why separable |
|----------|---------------|
| 51-04a (termination + PT/casual) | Touches the row-level Status column and salary-input components. Same render path. Same test file pattern. |
| 51-04b (pay frequency) | Touches a new column AND a business-level setting. Pure persistence — no rollup math in Phase 51. Cleanly orthogonal to 51-04a. |

Splitting reduces PR review burden and makes rollback finer-grained (if pay-frequency UI causes a layout issue, revert just 51-04b).

### Why bundle 51-05 (not split S5-01 from S5-02)

UX-S5-02 is "simpler layout" — by definition, it should ship as part of the same PR that introduces the $/% toggle (S5-01). Shipping S5-02 without S5-01 is an incomplete UX redesign; shipping S5-01 without S5-02 introduces a control into a layout that wasn't designed for it. Bundle them.

### Why bundle 51-06 (S6-01, -02, -03 together)

All three Step 6 changes are localized to `Step6Subscriptions.tsx` and don't share state or logic with the rest of the wizard. They're naturally one PR. Splitting them would introduce 3 PRs for maybe 80 lines of changes total. Bundle.

### Cross-plan dependencies

| Dependency | Direction | Mitigation |
|------------|-----------|------------|
| 51-01, 51-03, 51-05 → `useEditableValue` hook | Need 51-00 merged first | 51-00 is the first plan; all others wait |
| 51-03 → `getEffectiveSeasonality` helper | Need 51-00 merged first | Same — 51-00 ships the helpers |
| 51-04a (termination) → existing Departure state/rollup | None — already in place | None |
| 51-06 (re-analyze toggle preservation) → no shared deps | None | None |
| 51-04b (pay frequency) → Phase 52 (cashflow distribution) | Phase 52 will read `payFrequency` field; 51-04b just persists it | Phase 52 problem; 51-04b only needs to ship the field |

### Execution order

1. **51-00** (helpers) — must merge first
2. **51-01, 51-02** (parallel-able after 51-00) — Step 3 $/% parity + Growth %
3. **51-03** (after 51-01 to avoid rebase pain on Step3RevenueCOGS.tsx) — per-line seasonality
4. **51-04a, 51-04b** (parallel-able with each other and with 51-03; different files) — Step 4 termination + pay frequency
5. **51-05** (parallel-able with 51-04) — Step 5 $/% toggle + layout
6. **51-06** (parallel-able with anything; isolated file) — Step 6 sidebar + re-analyze + manual entry

Suggested merge sequence: 51-00 → 51-01 → 51-02 → 51-03 → 51-04a → 51-04b → 51-05 → 51-06.

## Sentinels (preview-branch verification before merge)

Per Phase 49 precedent, run these on the deployed preview branch before merging each plan PR. Operator (Matt) manually walks through the wizard for the canonical client (JDS or Envisage) and verifies:

| Plan | Sentinel | What to check |
|------|----------|---------------|
| 51-00 | Build green; existing tests pass | No regressions from helper extraction. `npx vitest run src/__tests__/forecast/wizard-v4-bug-fixes.test.tsx` MUST stay green. |
| 51-01 | $/% round-trip in JDS forecast Step 3 | Open existing JDS Y1 forecast → Step 3 → type "$50000" in any revenue line → see % update → type "30%" in same line → see $ update. Annual total stays at goals.year1.revenue. |
| 51-02 | Y2 Growth % in Envisage 3-yr forecast | Open existing Envisage forecast → switch to Y2 → Growth % column visible → type "20%" on a line → Y2 total = Y1 total × 1.20. |
| 51-03 | Per-line seasonality + summary agreement | Open JDS forecast → Step 3 → click "edit seasonality" on revenue line A → set Q1 to 50% (heavy front-load) → close editor → Step 3 monthly distribution shifts → navigate to Step 9 (Review) → annual revenue total UNCHANGED → monthly preview shifts to match new seasonality. **Critical: rollup agrees with display.** |
| 51-04a | Termination flow on existing employee | Open JDS forecast (has 12 team members) → Step 4 → click "End employee" on row Y → pick "Ends 2026-12" → save → Step 9 summary: that employee's Y1 cost = 6 months of salary (Jul–Dec). |
| 51-04b | Pay frequency dropdown persists across save | Open Envisage forecast → Step 4 → set business default = "Fortnightly" → save → close → reopen → "Fortnightly" still selected. |
| 51-05 | OpEx $/% toggle on existing forecast | Open JDS forecast → Step 5 → loaded with `costBehavior: 'variable'` line "Marketing" → toggle UI shows "%" → toggle to "$" → confirm modal (or just changes value) → line now reads "$/mo". Loading old forecast: no spontaneous YearlySummary change. |
| 51-06 | Sidebar + re-analyze + manual entry | Open JDS forecast → Step 6 → analyze 5 accounts → review 20 vendors → toggle 3 off → click "Change selected accounts" → add a 6th account → re-analyze → 3 originally-toggled vendors STILL off → click "+ Add Subscription" → fill modal → vendor appears in list. |

Each sentinel is run by the operator on the deployed preview URL. Plan PR is merged only when sentinel passes + CI green.

## Sources

### Primary (HIGH confidence) — direct code reads
- `src/app/finances/forecast/components/wizard-v4/PHASE.md` (Phase 51 spec)
- `src/app/finances/forecast/components/wizard-v4/types.ts` (1–719) — state shapes, lockstep helper precedent
- `src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx` (1–1418) — pending-state pattern, growth handler, summary/monthly views
- `src/app/finances/forecast/components/wizard-v4/steps/Step4Team.tsx` (1–2099 reviewed) — Departure UI, PartTimeSalaryInput, Status column
- `src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx` (1–1180 reviewed) — costBehavior dropdown, BudgetFramework, isMonthly toggle precedent
- `src/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions.tsx` (1–950 reviewed) — phase machine, manual vendor flow, account selection, re-analyze button
- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts` (1–1290 reviewed) — summary calculation, departure rollup, OpEx behavior dispatch
- `src/__tests__/forecast/wizard-v4-bug-fixes.test.tsx` (1–370 reviewed) — Step3Harness real-hook test pattern, makeStubState/Actions helpers
- `src/app/finances/forecast/components/wizard-v4/utils/opex-classifier.ts` (referenced) — isTeamCost, classifyExpense

### Secondary (MEDIUM confidence)
- (none — all findings come from direct code reads)

### Tertiary (LOW confidence)
- (none)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing libs already in project
- Architecture: HIGH — patterns are already established (Phase 50 lockstep helper, PR #82 pending state, real-hook test harness)
- Pitfalls: HIGH — derived from reading the actual code paths each new field has to traverse
- Per-line seasonality interaction with rollup: MEDIUM — confidence in the *approach* (extract `getEffectiveSeasonality`) is HIGH, but the test plan needs to assert summary agreement explicitly because there are 7+ existing call sites

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (30 days; wizard-v4 codebase changes infrequently outside dedicated phases)
