# Phase 44.3: Forecast Step 3 — Year-1 Target Wiring — Research

**Researched:** 2026-05-02
**Domain:** Forecast wizard state initialization (client-side React hook)
**Confidence:** HIGH (all evidence direct-from-source, no library guessing)

## Summary

The bug is a **single-branch oversight** in `initializeFromXero` (`useForecastWizard.ts:763-770`). When prior-year `byLine` data exists (the common case for any Xero-connected business), the code copies prior-year monthly values verbatim into `revenueLines[].year1Monthly` and never touches `data.goals.year1.revenue` (which it does read at line 758 — then ignores). The "correct" target-aware logic exists ONLY in the else-if branch (lines 771-819), which fires solely when `byLine` is empty.

Option B2 (full per-line YTD with target scaling) is achievable as a **single-function change** with one supporting change at three call sites in `ForecastWizardV4.tsx` that currently strip the per-line YTD breakdown when constructing the `currentYTD` arg. The data the fix needs (`current_ytd.revenue_lines[].by_month`) is already produced by `historical-pl-summary.aggregatePeriod` at `src/lib/services/historical-pl-summary.ts:289-296` and shipped over the wire by `/api/Xero/pl-summary`.

**Primary recommendation:** Extend the `currentYTD` shape on both `WizardState` (`types.ts:387`) and the `initializeFromXero` arg (`types.ts:494`) to embed the full `PeriodSummary['revenue_lines']` array (`PLLineItem[]`). Rewrite the `byLine.length > 0` branch in `initializeFromXero` to: (1) compute per-line prior-year share, (2) scale target by share to get `lineYearTarget`, (3) lock YTD months from `currentYTD.revenue_lines[].by_month` matched by case-insensitive trimmed `account_name`, (4) distribute `(lineYearTarget − lineYtdTotal)` across remaining months by that line's prior-year monthly seasonality, (5) absorb rounding residue in the last future month so each line sums to its target exactly, (6) append YTD-only lines (no prior-year match) as fresh revenueLines.

---

## 1. The bug location, exact

**File:** `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts`

**Function signature (current, lines 745-755):**
```typescript
const initializeFromXero = useCallback(
  (data: {
    priorYear: PriorYearData;
    team: TeamMember[];
    goals?: Goals;
    currentYTD?: {
      revenue_by_month: Record<string, number>;
      total_revenue: number;
      months_count: number;
    };
  }) => {
```

**Line 758 — target read but immediately abandoned in the buggy branch:**
```typescript
const targetRevenue = data.goals?.year1?.revenue || 0;
```

**Lines 763-770 — THE BUG. Prior-year monthlies copied verbatim. `targetRevenue` not referenced. `currentYTD` not referenced:**
```typescript
if (data.priorYear.revenue.byLine.length > 0) {
  revenueLines = data.priorYear.revenue.byLine.map((line) => ({
    id: line.id,
    name: line.name,
    year1Monthly: remapMonthKeysToForecastYear(line.byMonth, prev.fiscalYearStart),
    year2Monthly: {},
    year3Monthly: {},
  }));
}
```

**Lines 771-819 — the "correct" else-if branch (only fires when there are NO prior-year line items, e.g. CSV-import-without-line-detail or fresh tenants):** uses `targetRevenue`, `ytdMonths`, `seasonality`. Everything Option B2 needs is already prototyped here for the aggregate-only path. Option B2 is "do this same thing, but per line."

**Downstream consumers of `revenueLines[].year1Monthly`** (no other code changes needed):
- `Step3RevenueCOGS.tsx:67-145` reads `Object.values(line.year1Monthly).reduce(...)` for line totals, percentage-of-revenue calcs, and per-month displays.
- `useForecastWizard.ts:917` (`getRevenueLineYearTotal(line, 1)`) — feeds the wizard `summary.year1.revenue` shown in the Review step.
- COGS in Step 3 derives from `revenue × percentOfRevenue` (Step3 lines 138-145 + the COGS calc helper); fixing revenue automatically fixes COGS. **No COGS code change in scope** (PHASE.md explicitly out of scope).

**Lines 851-872 — COGS construction (for context only).** Reads `priorYear.cogs.byLine[].percentOfRevenue`. The percent_of_revenue field was hot-fixed in Phase 44.2. **Do not touch.**

---

## 2. The data already available from the API

**Wire format (`/api/Xero/pl-summary` → `summary.current_ytd`):**

`src/app/api/Xero/pl-summary/route.ts:65-69` returns the full `summary` object verbatim — no field stripping at the API boundary:
```typescript
const summary = await getHistoricalSummary(supabase, businessId, fiscalYear)
return NextResponse.json({ summary })
```

**`HistoricalPLSummary.current_ytd` shape** (`src/app/finances/forecast/types.ts:562-570`):
```typescript
current_ytd?: PeriodSummary & {
  run_rate_revenue: number
  run_rate_opex: number
  run_rate_net_profit: number
  revenue_vs_prior_percent: number
  opex_vs_prior_percent: number
}
```

**`PeriodSummary` includes `revenue_lines`** (`src/app/finances/forecast/types.ts:512-537`):
```typescript
export interface PeriodSummary {
  // ... totals + by_month maps ...
  revenue_lines?: PLLineItem[]
  cogs_lines?: PLLineItem[]
}
```

**`PLLineItem` shape** (`src/app/finances/forecast/types.ts:503-509`):
```typescript
export interface PLLineItem {
  account_name: string
  category: string
  total: number
  by_month: Record<string, number>
  percent_of_revenue?: number
}
```

**Production confirmed:** `historical-pl-summary.ts:289-296` builds each `revenueLines` entry with the YTD-window `by_month` map:
```typescript
if (line.account_type === 'revenue' && lineTotal !== 0) {
  revenueLines.push({
    account_name: line.account_name,
    category: 'Revenue',
    total: lineTotal,
    by_month: Object.fromEntries(monthKeys.map(mk => [mk, values[mk] || 0])),
    percent_of_revenue: 100,
  })
}
```

The field is on the wire. No service changes required. PHASE.md claim verified.

---

## 3. The wizard state type that needs extending

**Two type locations to extend** (kept in sync):

**A. `ForecastWizardState.currentYTD` — `types.ts:387-391`:**
```typescript
currentYTD: {
  revenue_by_month: Record<string, number>;
  total_revenue: number;
  months_count: number;
} | null;
```

**B. `initializeFromXero` arg — `types.ts:490-499`:**
```typescript
initializeFromXero: (data: {
  priorYear: PriorYearData;
  team: TeamMember[];
  goals?: Goals;
  currentYTD?: {
    revenue_by_month: Record<string, number>;
    total_revenue: number;
    months_count: number;
  };
}) => void;
```

The same anonymous shape is duplicated in `useForecastWizard.ts:750-754`. **Three places to keep in sync.**

### Recommendation: narrow projection, not full `PeriodSummary` import

Add ONE field — `revenue_lines?: PLLineItem[]` — and import `PLLineItem` from `@/app/finances/forecast/types`.

Justification:
1. **Minimal blast radius.** Step 3, Step 2 display, and AI insight payloads currently read only `revenue_by_month`, `total_revenue`, `months_count`. Adding fields breaks nothing; replacing the whole shape would require auditing every read.
2. **Avoids importing `PeriodSummary`** which carries 18+ unrelated fields (cogs_by_month, opex_by_month, gross_margin_percent, etc.) into wizard state — false coupling.
3. **`PLLineItem` is already a stable forecast type** (no other phase touches it) and its `by_month` semantics for a YTD window are exactly what Option B2 needs (only completed-FY-month keys present, future months absent — so the planner uses "key absent" as the lock signal).

**Final shape (apply to all three locations):**
```typescript
currentYTD: {
  revenue_by_month: Record<string, number>;
  total_revenue: number;
  months_count: number;
  revenue_lines?: PLLineItem[];  // ← NEW
} | null;
```

---

## 4. The fetch-pass-through chain

**Trace: API → wizard state → `initializeFromXero` arg.**

### Call site map (3 callers of `initializeFromXero`):

**Caller 1 — `ForecastWizardV4.tsx:293-301`** (refresh-on-mount when cached prior-year revenue is stale):
```typescript
const currentYTDData = plData.summary?.current_ytd;
actionsRef.current.initializeFromXero({
  priorYear: freshPriorYear,
  team: state.teamMembers || [],
  currentYTD: currentYTDData ? {
    revenue_by_month: currentYTDData.revenue_by_month,
    total_revenue: currentYTDData.total_revenue,
    months_count: currentYTDData.months_count,
  } : undefined,
});
```

**Caller 2 — `ForecastWizardV4.tsx:845-862`** (initial wizard mount):
```typescript
const currentYTD = currentPlData.summary?.current_ytd ? {
  revenue_by_month: roundedYtdRevenueByMonth,
  total_revenue: Math.round(currentPlData.summary.current_ytd.total_revenue || 0),
  months_count: currentPlData.summary.current_ytd.months_count || 0,
} : undefined;
// ...
actionsRef.current.initializeFromXero({ priorYear: effectivePriorYear, team, goals, currentYTD });
```

**Caller 3 — `ForecastWizardV4.tsx:1375-1382`** (manual "Sync from Xero" click):
```typescript
const currentYTD = plData.summary?.current_ytd ? {
  revenue_by_month: roundedYtdRevenueByMonth,
  total_revenue: Math.round(plData.summary.current_ytd.total_revenue || 0),
  months_count: plData.summary.current_ytd.months_count || 0,
} : undefined;
// ...
actionsRef.current.initializeFromXero({ priorYear, team, currentYTD });
```

### CRITICAL: All three call sites STRIP `revenue_lines`

The wizard receives the full `current_ytd` from the API (which includes `revenue_lines[].by_month`) but each call site rebuilds a narrow object literal with **only three fields**. The per-line YTD breakdown is dropped on the floor before reaching `initializeFromXero`.

**Plan must update all three call sites** to forward `revenue_lines: currentYTDData.revenue_lines` (no transformation needed — pass the array straight through). Without this change, extending the type alone is insufficient.

### Step 2's `currentYTD` is irrelevant to this fix

`Step2PriorYear.tsx:158-172` declares its own local `useState<{...}>(null)` for display purposes only. It is **never** routed to `initializeFromXero` (verified via grep — `Step2PriorYear.tsx` doesn't call any wizard action that ferries `currentYTD`). All three live paths come from `ForecastWizardV4.tsx`. **No Step 2 change needed.**

### TypeScript safety

Once the `currentYTD` arg type is extended (Section 3), TypeScript will silently accept the existing call sites because the extra field is optional. The plan must include explicit edits at all three call sites — the compiler will not flag the omission. Recommend a CI-visible test that asserts `revenue_lines` survives the round-trip.

---

## 5. Existing test patterns to follow

### Test directory & framework

- **Framework:** Vitest 3.x with `jsdom` environment, `@testing-library/react` 16.3.x, `@testing-library/jest-dom` 6.9.x.
- **Config:** `vitest.config.ts` (uses `@vitejs/plugin-react`, includes `src/__tests__/**/*.test.{ts,tsx}` and co-located `src/**/*.test.{ts,tsx}`).
- **Setup:** `src/__tests__/setup.ts` (one line: `import '@testing-library/jest-dom'`).
- **Quick run:** `npx vitest run src/__tests__/components/<file>.test.tsx`
- **Full suite:** `npm run test` (project script).

### Recommended test file paths

1. **`src/__tests__/components/useForecastWizard-initializeFromXero.test.tsx`** — direct unit tests of the hook, calling `renderHook(() => useForecastWizard(...))` then invoking `result.current.initializeFromXero({...})` and asserting on `result.current.revenueLines`.
2. **Optional companion:** `src/__tests__/components/Step3RevenueCOGS.test.tsx` already exists as a `it.todo` scaffold (Phase 44 Wave 0). A follow-up plan could fill in the integration tests there, but unit tests on the hook are sufficient for FCST-01..05.

### `renderHook` precedent in this codebase

`src/__tests__/goals/plan-period-coach-owner-equivalence.test.ts` uses `renderHook` for `useStrategicPlanning`. Pattern:
- Mock every external service the hook touches (supabase client, fetches) via `vi.mock(...)` at the top of the file.
- Use `await act(async () => {...})` around state-mutating calls so React state updates settle before assertions.
- Assert on `result.current.<field>` shape.

`src/app/finances/monthly-report/hooks/__tests__/usePDFLayout.test.tsx` is the second `renderHook` example — co-located with the hook (alternative location pattern).

### Mock surface for `useForecastWizard` tests

The hook's only side effects are `localStorage` (`getItem`/`setItem`) and a `setTimeout` debounce inside `useEffect`. **No supabase, no fetch.** Tests need only:
- `vi.stubGlobal('localStorage', {...})` or pass a fresh `businessId` per test so the `loadStateFromStorage` returns null.
- No `vi.useFakeTimers()` necessary unless asserting on the localStorage debounce — `initializeFromXero` is synchronous-ish (single `setState`).

This makes hook-level testing **far simpler** than the supabase-chain mocks in `historical-pl-summary-cogs-percent.test.ts`. The percent test's complex `makeMockSupabase` chain is **not** needed here.

### Existing pattern callout

`historical-pl-summary-cogs-percent.test.ts` documents intent over coverage — it has a 2nd test that's effectively `expect(true).toBe(true)` because the supabase mocking environment couldn't reach the composite path. **Avoid that anti-pattern** for FCST-01..05. Each success criterion in PHASE.md is a precise, deterministic input/output assertion on a pure-ish state hook — every test should make a real numeric assertion.

---

## 6. Distribution-by-seasonality math

### Where seasonality lives per-line

Each `priorYear.revenue.byLine[]` entry has its own `byMonth: MonthlyData` map (`types.ts:331`):
```typescript
byLine: { id: string; name: string; total: number; byMonth: MonthlyData }[];
```

**Per-line seasonality = each line's own `byMonth`, normalized to ratios.** Do NOT use the aggregate `priorYear.seasonalityPattern` (line 357) for per-line distribution — that's the revenue-totals seasonality and would distribute every line by the same shape, which is wrong (the bug case where Hardware peaks in Q2 but Service peaks in Q4 would distribute both by the blended pattern).

### Recommended math

```
For each priorYear.revenue.byLine[]:
  lineShareOfPriorYear = line.total / priorYear.revenue.total       (guard: total > 0)
  lineYearTarget = targetRevenue * lineShareOfPriorYear
  ytdLine = currentYTD.revenue_lines.find(case-insensitive trimmed match on account_name)
  lineYtdTotal = ytdLine ? sum(ytdLine.by_month) : 0
  ytdMonthsForLine = ytdLine ? Object.keys(ytdLine.by_month) : []   (only keys with non-undefined values)
  remainingTarget = max(0, lineYearTarget - lineYtdTotal)

  // Per-line seasonality: normalize line.byMonth to ratios over FUTURE months only
  futureMonthsTotal = sum(line.byMonth[m] for m in lineFutureMonthsAfterRemap)
  for each future-month key in remappedTargetFY:
    if futureMonthsTotal > 0:
      monthRatio = line.byMonth[priorEquivMonth] / futureMonthsTotal
    else:
      monthRatio = 1 / numFutureMonths  (fallback: equal split)
    year1Monthly[key] = round(remainingTarget * monthRatio)

  // Lock YTD months
  for each ytd month key in target FY:
    year1Monthly[key] = ytdLine.by_month[matchingKey]   (the cent-exact actual)

  // Cents-residue: ensure sum equals lineYearTarget exactly
  computedSum = sum(year1Monthly values)
  residue = round(lineYearTarget) - computedSum
  if residue != 0 and there is at least one future month:
    year1Monthly[lastFutureMonthKey] += residue
```

### Rounding policy

- **Per-month: `Math.round`** to whole dollars (matches existing line 803, 806, 841, 883 idiom).
- **Residue absorption: last future month** so coaches never see "$1,999,999" for a $2M target. If there are zero future months (entire year is YTD), assert the YTD total IS the target — if it diverges, that's a real-world divergence and we leave it (a coach in month 12 with $1.8M actuals can't be told the target is $2M).

### YTD month key matching

The wizard uses target-FY keys (e.g. `2025-07`). The API's `current_ytd.revenue_lines[].by_month` keys are calendar-month keys for the YTD window (e.g. `2025-07` through `2026-04` for an Australian FY in May). They already align. **No remapping needed** for YTD lock — keys already match the target FY directly because YTD is the *current* FY (i.e., the forecast's Year 1).

Compare to `priorYear.revenue.byLine[].byMonth` which uses prior-FY keys (e.g. `2024-07`) and needs `remapMonthKeysToForecastYear` (line 53-74). This is why the bug branch only does the remap step — there's no YTD logic at all.

---

## 7. Edge cases worth specifying for the planner

| Case | Behavior | PHASE.md SC |
|------|----------|-------------|
| **a. Stable mix, no YTD, growth target** | `lineYtdTotal = 0`, `remainingTarget = lineYearTarget`, distribute by line's prior-year seasonality. Hardware $400k → $480k @ target $1.2M (line ratio 0.4). | SC #3 |
| **b. Stable mix, partial YTD, growth target** | YTD months locked exactly; `remainingTarget` distributed across future months by line seasonality. Sum to target. | SC #2 |
| **c. New line in YTD not in prior year** | No prior match → `lineShareOfPriorYear = 0` → `lineYearTarget = 0`. Append as fresh `RevenueLine` with YTD months populated, future months = 0. The line surfaces in Step 3 with its YTD revenue but contributes $0 to remaining-year target. **Coach sees the line and decides whether to extrapolate it.** | SC #4 |
| **d. Discontinued line** (in prior year, zero in YTD) | Prior-year match found but `ytdLine.by_month[m] === 0` for all completed months. Math.round(0) = 0, locks $0 for completed months. Future months distribute `remainingTarget = lineYearTarget` per line seasonality — i.e. the line "comes back" in remaining months. **Out of scope per PHASE.md, but flag in plan: this is the default behavior; if a client complains, follow-up phase to mark line discontinued.** | (out of scope) |
| **e. Target = 0 / undefined / Step 1 skipped** | `if (targetRevenue <= 0) → fall through to current behavior` (the existing `byLine.length > 0` straight-copy). Critical: **early return before the new logic** so flows that skip Step 1 don't break. | SC #5 |
| **f. YTD line name doesn't match prior-year name** | **Recommend case-insensitive trim match:** `priorLine.name.trim().toLowerCase() === ytdLine.account_name.trim().toLowerCase()`. No fuzzy match (Levenshtein, etc.) — silent renames belong to the deferred follow-up PHASE.md mentions. If no match → treat as new line per case (c). Document in plan as the matching algorithm. | (PHASE.md "out of scope" allows this) |
| **g. Floating-point residue** | `Math.round` per month → sum may be off by ±$N where N = future month count. Plan: compute `residue = round(lineYearTarget) - sum(allMonths)`, add to last future month. Result: per-line annual sums to target exactly. | SC #3 (asserts $480k exactly) |

### Additional case the planner should think about

**h. `priorYear.revenue.total === 0` but `byLine.length > 0`** (every line is zero — degenerate import). Division by zero in `lineShareOfPriorYear`. Guard: if `priorYear.revenue.total <= 0`, fall through to existing behavior (case e). Planner should add this guard alongside the `targetRevenue <= 0` guard as a single early-return condition.

---

## 8. Risks the planner should design around

### Risk 1: Re-init triggers wipe user-customized line splits

`ForecastWizardV4.tsx:286-304` already gates the refresh-init path behind `Math.abs((cachedRevenue || 0) - freshRevenue) > 1 || !state.priorYear` — a comment explicitly notes this prevents overwriting user-customized splits. The new logic preserves this gate (it lives at the call-site, not inside the hook). **No change in trigger semantics.** But the manual "Sync from Xero" path (caller 3, line 1382) is **unguarded** — it always re-inits. That's already the case today; not a regression but worth noting in the plan: a coach who edits Step 3 then clicks Sync will lose edits, target-aware or not.

### Risk 2: `currentYTD` is optional — must keep working when undefined

All three call sites pass `currentYTD: undefined` when there are no YTD actuals (e.g. start-of-FY or businesses with no recent sync). The new logic must handle `currentYTD === undefined` and `currentYTD.revenue_lines === undefined` — treat as "no YTD lock, distribute full `lineYearTarget` across all 12 months."

### Risk 3: YTD line name → prior-year line name mismatch is asymmetric

If a client renamed an account in Xero mid-FY, the prior-year history is under the OLD name and the YTD lines come back under the NEW name. The match-by-name approach treats this as "new line in YTD + zero-YTD line in prior year," which is wrong (they're the same revenue stream). PHASE.md "Out of scope" explicitly defers this. **The plan must surface this in the test rationale** so the engineer doesn't try to "fix" it.

### Risk 4: Caller 1 (refresh-on-mount) doesn't pass `goals`

Line 293-301 omits `goals` from the `initializeFromXero` call — so the function falls back to `data.goals?.year1?.revenue || 0 = 0` and the new target-aware path skips entirely (case e). On refresh-mount, the wizard re-inits using prior-year copy semantics, NOT target-aware. **Recommend the plan add `goals: state.goals` to caller 1's payload** so refresh-mount also respects the target. Otherwise the bug returns silently the moment a coach reloads the wizard.

### Risk 5: TypeScript won't catch the call-site strip

Adding `revenue_lines?: PLLineItem[]` as an optional field means the existing 3 call sites compile cleanly without forwarding it. Plan must include explicit call-site edits AND a regression test that asserts `revenue_lines.length > 0` survives initialization (e.g. after `initializeFromXero({...with revenue_lines})`, the resulting `revenueLines[0].year1Monthly` for completed months matches the YTD per-line value, not the prior-year value).

### Risk 6: Stripped `currentYTD` shape used elsewhere

`useForecastWizard.ts:96, 901` stores `currentYTD: data.currentYTD || null` straight into `state.currentYTD`. The current narrow shape is read by `Step3RevenueCOGS.tsx:17` (destructured) and others. Extending the shape to add an optional field is **additive** — no existing reader breaks. Verified by grep across all wizard-v4 step files: every reader uses dot access on the existing three fields. Safe.

---

## Plan-ready signals

- **One bug, one branch:** the entire fix is rewriting `useForecastWizard.ts:763-770` (the buggy branch). Lines 771-819 (the fallback branch) already have the right pattern at aggregate granularity — the new code is "do that, but per line."
- **Three call sites must forward `revenue_lines`:** `ForecastWizardV4.tsx:293-301`, `:845-849`, `:1375-1379`. Type extension alone is silently insufficient. AND caller 1 should forward `goals: state.goals` so refresh-mount honors the target.
- **Three type definitions must stay in sync:** `types.ts:387-391` (`WizardState.currentYTD`), `types.ts:494-498` (`initializeFromXero` action sig), and `useForecastWizard.ts:750-754` (the `useCallback` arg). Adding `revenue_lines?: PLLineItem[]` to all three is the cleanest extension.
- **Tests are easy:** `useForecastWizard` has no supabase/fetch deps — `renderHook` + direct `act(() => result.current.initializeFromXero({...}))` + assertions on `result.current.revenueLines[i].year1Monthly`. No `makeMockSupabase` chain needed. Five FCST-01..05 unit tests are the right target.
- **Most likely to bite:** the YTD line-name match (case f). Case-insensitive trim is the floor; anything more (fuzzy match, account-id matching) drags us into PHASE.md "out of scope" territory. The planner should write a test that explicitly covers the trim/case insensitivity (e.g. prior `"Hardware Sales"` matches YTD `"hardware sales"`) to lock the contract. If we don't, an engineer will "improve" it to substring match next quarter and break the demo.

---

## Sources

### Primary (HIGH — direct source read)
- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts:1-911`
- `src/app/finances/forecast/components/wizard-v4/types.ts:1-549`
- `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx:285-309, 585-635, 840-862, 1370-1383`
- `src/app/finances/forecast/components/wizard-v4/steps/Step2PriorYear.tsx:158-198`
- `src/app/finances/forecast/components/wizard-v4/steps/Step3RevenueCOGS.tsx:17, 61-145`
- `src/app/finances/forecast/types.ts:500-575`
- `src/lib/services/historical-pl-summary.ts:140-372`
- `src/app/api/Xero/pl-summary/route.ts:1-85`
- `src/__tests__/services/historical-pl-summary-cogs-percent.test.ts:1-143`
- `src/__tests__/components/Step3RevenueCOGS.test.tsx:1-22`
- `src/__tests__/goals/plan-period-coach-owner-equivalence.test.ts:1-50`
- `vitest.config.ts:1-25`
- `package.json` (testing-library/react 16.3.2, jest-dom 6.9.1)

### Not consulted (intentionally)
- Library docs (React, Vitest) — no API surface in question. Patterns are already established in this codebase.
- Phase 44 / 44.2 prior research — referenced in PHASE.md context only; not load-bearing for the fix.

## Metadata

- **Confidence — Bug location:** HIGH (line numbers + code excerpts cited).
- **Confidence — Data on wire:** HIGH (read service + API route + types verified).
- **Confidence — Type extension:** HIGH (3 type definitions identified; additive change only).
- **Confidence — Call-site strip:** HIGH (all 3 sites read; pattern identical and consistent).
- **Confidence — Test pattern:** HIGH (renderHook precedent in repo; vitest config inspected).
- **Confidence — Math recommendation:** MEDIUM-HIGH (math is straightforward; rounding-residue policy is a judgment call that the planner may revisit).

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (30 days — slow-moving wizard internals; the only thing that would invalidate this is a refactor of `useForecastWizard.ts` or the API response shape, neither planned)
