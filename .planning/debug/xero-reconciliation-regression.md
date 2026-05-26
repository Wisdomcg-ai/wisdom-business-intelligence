---
status: diagnosed
trigger: "Xero data is not reconciling 100% - it was prior to all these last changes - what has changed?"
created: 2026-05-07T00:00:00Z
updated: 2026-05-07T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — PR #136 (`b0dcffb0`) split the always-on Xero refresh into a "display-only" path that updates `state.priorYear` from fresh Xero data but no longer rebuilds `state.revenueLines / cogsLines / opexLines`. Step 5's `BudgetFramework` and the rollup compute revenue/COGS/OpEx from the line arrays (now stale) while Step 2 banners and the rollup's seasonality come from the fresh `priorYear`. The two diverge on any tenant whose Xero P&L has changed (late journal entries, period closes, account additions/renames) since the forecast was first created.
test: read both setPriorYear (line 591) and setPriorYearDisplay (line 725) in useForecastWizard.ts; read the always-on refresh in ForecastWizardV4.tsx (line 244-334); diff PR #136
expecting: confirm setPriorYearDisplay only writes priorYear; confirm Step 5 actualRevenue/actualCOGS read from line arrays; confirm pre-#136 path called setPriorYear (full init) — done, all confirmed
next_action: write diagnosis, do NOT fix

## Symptoms

expected: forecast wizard shows Xero data reconciling 100% (priorYear totals match line-level sums), as it did before tonight's PRs
actual: divergence between fresh Xero priorYear totals and stale line-array sums — visible wherever both are rendered side-by-side or feed the same calculation
errors: none — silent numeric divergence
reproduction: open any forecast that was first created BEFORE Xero data shifted (any tenant with late journals, period close, or account changes since creation) → wizard hard-refresh runs → BudgetFramework Revenue / COGS / Implied Net Profit no longer match what Step 2 banners show
started: tonight (PR #136 / commit b0dcffb0 — "fix(forecast): stop rebuilding lines on hard-refresh; preserve operator customizations")

## Eliminated

- hypothesis: PR #130 covered-account-codes exclusion misfires (case/whitespace/format mismatch on accountCode)
  evidence: useForecastWizard.ts:1614-1622 trims and explicitly rejects empty strings; .has() is exact-string against trimmed values; opexLine.accountCode is also `.trim()`d at ingestion (useForecastWizard.ts:660-662); zero ambiguity. AND legacy v10 forecasts where opexLines lack accountCode "fall through and contribute to opex as before" (#130's intentional fallback). Could only contribute to error in narrow new-Step-5 setup, NOT to the reconciliation gap Matt is reporting on existing forecasts before he configures any subscriptions.
  timestamp: 2026-05-07T00:00:00Z

- hypothesis: PR #134 normalizedPct revert inflated/deflated percentages
  evidence: PR #134 RESTORES correct sub-1% behavior — at worst it changes computed forecast values, but it doesn't introduce a divergence between Xero priorYear and line arrays. Both already-reconciled and now-broken numbers read through the same percentage math.
  timestamp: 2026-05-07T00:00:00Z

## Evidence

- timestamp: 2026-05-07T00:00:00Z
  checked: src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx:244-334 (always-on Xero refresh path) and `git show b0dcffb0` (PR #136 diff)
  found: PRE-#136, the always-on refresh did TWO things on every wizard mount:
    1. `actions.setPriorYear(freshPriorYear)` — rebuilt revenueLines/cogsLines/opexLines from the fresh Xero `pl-summary` payload (full init).
    2. If `|cachedRevenue − freshRevenue| > 1`, additionally called `actions.initializeFromXero({ priorYear: freshPriorYear, team, goals, currentYTD })` — re-ran the target-aware seasonal split.
  POST-#136, the always-on refresh calls ONLY `actionsRef.current.setPriorYearDisplay(freshPriorYear)` (line 334). Line arrays are no longer touched on hard-refresh.
  implication: whenever a forecast's stored line arrays were first captured at time T, and Xero P&L composition has changed at time T+δ (late journal posts, period close adjustments, new accounts, account renames), reopening the wizard at T+δ produces a state where priorYear ≠ Σ(lines).

- timestamp: 2026-05-07T00:00:00Z
  checked: src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts:725-727 (`setPriorYearDisplay`)
  found: ```ts
  const setPriorYearDisplay = useCallback((data: PriorYearData) => {
    setState((prev) => ({ ...prev, priorYear: data }));
  }, []);
  ```
  Touches `state.priorYear` only. revenueLines/cogsLines/opexLines deliberately untouched (this was the bug fix for "operator customizations destroyed on refresh").
  implication: by design, fresh Xero `revenue_lines`, `cogs_lines`, `operating_expenses_by_category` from the `pl-summary` payload (built into `freshPriorYear.revenue.byLine` etc. at ForecastWizardV4.tsx:256-266) are computed, packed into `freshPriorYear`, then thrown away at the receiver — `setPriorYearDisplay` keeps only totals + byMonth + other_income/expense + seasonality.

- timestamp: 2026-05-07T00:00:00Z
  checked: src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx:807-828 (`actualRevenue`) and 830-848 (`actualCOGS`)
  found: BudgetFramework's "Revenue" and "COGS" lines come from `actualRevenue` / `actualCOGS`, both `useMemo`'d off `revenueLines` / `cogsLines`:
    `actualRevenue.y1 = revenueLines.reduce((t, line) => t + Σ(line.year1Monthly), 0)`
    `actualCOGS.y1 = cogsLines.reduce(... priorYearTotal | percentOfRevenue × revenue ...)`
  Meanwhile Step 2's revenue/cogs banners (Step2PriorYear.tsx:840, 879) read from `priorYear.revenue.total` / `priorYear.cogs.percentOfRevenue` — fresh Xero post-#136.
  implication: BudgetFramework's "Revenue" panel can show a different number from Step 2's "Total revenue: $X" banner. The operator sees this side-by-side as Xero "not reconciling 100%."

- timestamp: 2026-05-07T00:00:00Z
  checked: src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts:1606-1639 (rollup OpEx accumulator)
  found: rollup computes `opex` by iterating `state.opexLines` and applying each line's `costBehavior` math against current revenue. `priorYearAnnual` is referenced for seasonal lines (line 1675). `state.priorYear.opex.total` is NOT used here — the rollup is line-driven.
  implication: even if priorYear.opex.total updates to fresh Xero on refresh, the rollup's actual OpEx number stays anchored to the stale line snapshot. Implied Net Profit and Available OpEx in BudgetFramework are derived from these stale lines too. JDS-style "OpEx changed in Xero but my forecast didn't update" is the exact failure mode.

- timestamp: 2026-05-07T00:00:00Z
  checked: src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx:1095 (`totalPriorYear` for OpEx)
  found: `const totalPriorYear = activeOpexLines.reduce((sum, line) => sum + line.priorYearAnnual, 0);`
  This is the "Prior year total" comparison on Step 5. It sums the stale line arrays. The fresh `priorYear.opex.total` from Xero is never compared against this.
  implication: another concrete reconciliation surface — Step 5's "prior year" header total uses stale data; the same step's downstream UI references priorYear via state for other displays, creating an internal inconsistency.

- timestamp: 2026-05-07T00:00:00Z
  checked: PR #136 commit message authored by the previous fix
  found: The PR explicitly acknowledges that the FIX traded one bug for another:
    - Pre-#136: every refresh rebuilt lines → wiped operator customizations on Steps 3/5/6.
    - Post-#136: customizations preserved, but lines never re-sync to Xero composition changes either.
  The commit's "Why a display refresh is still needed" paragraph addresses summary fields (other_income, opex total) but does NOT address the line-array side of the same problem.
  implication: this is a known trade-off whose Xero-side has now become the active regression. The right fix is "smart merge" — refresh fresh Xero values into lines that have NOT been operator-customized; leave customized lines alone. PR #136 punted on that by removing the line update entirely.

## Resolution

root_cause: PR #136 (commit b0dcffb0, "fix(forecast): stop rebuilding lines on hard-refresh; preserve operator customizations") changed the always-on Xero refresh in `ForecastWizardV4.tsx` (line 334) from `actions.setPriorYear(freshPriorYear)` (full init — rebuilds revenueLines/cogsLines/opexLines from fresh Xero) to `actions.setPriorYearDisplay(freshPriorYear)` (display-only — only updates `state.priorYear`). The line arrays now stay anchored to whatever Xero composition existed at forecast-creation time, while `state.priorYear` updates to current Xero. Anywhere both are rendered side-by-side (Step 5 BudgetFramework Revenue/COGS panels vs Step 2 totals banner) or anywhere they should agree (Step 5 `totalPriorYear` line sum vs Step 2's `priorYear.opex.total`) shows a visible numeric mismatch — the "not reconciling 100%" the operator reports.

fix: NOT APPLIED — diagnosis only per brief. See "Proposed fix direction" below.

verification: NOT APPLIED — diagnosis only.

files_changed: []

---

## Diagnosis Summary (for parent agent / handoff)

### 1. Confirmed root cause (with file:line evidence)

- `src/app/finances/forecast/components/wizard-v4/ForecastWizardV4.tsx:334` — always-on refresh now calls `setPriorYearDisplay`, not `setPriorYear`.
- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts:725-727` — `setPriorYearDisplay` only writes `state.priorYear`; revenueLines/cogsLines/opexLines untouched.
- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts:591-715` — `setPriorYear` (the destructive but Xero-correct variant) is now bypassed on hard-refresh.
- `src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx:807-848` — BudgetFramework's `actualRevenue` / `actualCOGS` derive from `revenueLines` / `cogsLines` (stale).
- `src/app/finances/forecast/components/wizard-v4/steps/Step5OpEx.tsx:1095` — Step 5 `totalPriorYear` sums `opexLines[].priorYearAnnual` (stale).
- `src/app/finances/forecast/components/wizard-v4/useForecastWizard.ts:1606-1639` — rollup computes `opex` from `state.opexLines` (stale); rollup's `revenue` / `cogs` likewise derive from the line arrays.
- Git: commit `b0dcffb0` ("fix(forecast): stop rebuilding lines on hard-refresh; preserve operator customizations (#136)") is the introducing commit. PR #136.

### 2. Reproducer

1. Pick any tenant whose forecast was created at time T (any time before the most recent Xero P&L change).
2. After T, Xero data changes — either real (late journals, period close, new account, renamed account) or simulated (run a script that posts a journal to Xero or modifies P&L composition).
3. Open the forecast in the wizard at T+δ.
4. Look at:
   - **Step 2** "Revenue" banner total → reads `state.priorYear.revenue.total` (fresh Xero, post-#136 refresh).
   - **Step 5** BudgetFramework "Revenue" line in OpEx Budget table → reads `actualRevenue.y1 = Σ(revenueLines[].year1Monthly)` (stale, snapshotted at creation).
5. The two will diverge by exactly the amount Xero changed since T. Same divergence visible for COGS, OpEx total, Implied Net Profit, Available OpEx.

A more targeted reproducer: any tenant that just had a period close or month-end batch posted post-creation. Common candidates: Envisage, JDS, IICT-HK if any of them had recent journal activity since their forecast was created.

### 3. Proposed fix direction (NOT IMPLEMENTED — separate PR)

The right fix is a **smart merge** in `setPriorYearDisplay` (or a new `setPriorYearAndMergeLines`):

- For each line in `freshPriorYear.revenue.byLine` / `cogs.byLine` / `opex.byLine`:
  - Find the matching existing line by `accountId` (or `accountCode` for OpEx).
  - If the existing line is **uncustomized** (matches the prior Xero snapshot byte-for-byte — e.g. tracked via `_xeroFingerprint` like the Phase 52-02 team-import reconciliation already does for `TeamMember`), replace it with the fresh Xero values.
  - If it has been customized (operator changed seasonality split, costBehavior, monthlyAmount override, etc.), keep the customization and surface a "Xero data drifted" banner so the operator can opt in to a refresh.
- For lines that no longer exist in Xero (account closed/renamed), keep them but mark `_xeroOrphan: true` and surface in the banner.
- For new lines in Xero that don't exist in state, append them.

This preserves both invariants:
- Operator customizations survive a hard-refresh (PR #136's intent).
- Xero data composition changes propagate so reconciliation holds (pre-#136's behavior).

The Phase 52-02 helpers in `src/app/finances/forecast/components/wizard-v4/utils/xero-payroll-mapping.ts:469+` are a working template for "fingerprint + merge" — the same shape applies to revenue/COGS/OpEx lines. (Comment header at types.ts:32 already notes the fingerprint pattern is intended to generalize.)

A simpler interim fix: add an explicit operator-triggered "Refresh from Xero" button at the wizard level (Step 2 already has one for parsed P&L files; extend it to invalidate line arrays + replay `setPriorYear`). This re-uses the existing destructive path but only when the operator explicitly asks for it.

### 4. Severity assessment

**HIGH** — visible to every operator on every hard-refresh of any pre-existing forecast where Xero composition has shifted since creation. Failure mode is silent numeric divergence (no error message, no banner), which makes it WORSE than a crash because the operator may not notice and may make decisions on inconsistent numbers.

Affected blast radius:
- **Every tenant** with at least one saved forecast and any Xero activity since forecast creation.
- The reconciliation gap grows with time since creation and with frequency of Xero adjustments.
- Most acute for: month-end period closes, year-end audit adjustments, tenants with active accountants posting late journals, any tenant whose chart of accounts has changed (account renames or new accounts added).

Workaround until the fix lands: operator can delete and re-create the forecast, which forces a fresh `setPriorYear` via the no-cache `initializeFromXero` path (line 332). But this destroys all wizard customizations — exactly the work PR #136 was protecting.

### 5. What was NOT the cause (negative findings worth keeping)

- **PR #130 covered-account-codes exclusion** is correctly defensive (trim, exact match, explicit fallback for legacy v10 lines). No misfire risk on existing forecasts.
- **PR #134 normalizedPct revert** is a correctness restoration; can change computed forecast values but does not create source divergence.
- **PR #131 step swap (5↔6) + WIZARD_VERSION 11** doesn't touch line arrays. The soft-mismatch handling at useForecastWizard.ts:217 keeps user data on version bump.
- **PR #132 BudgetFramework subscriptions line + covered badge** added new visible columns but they're computed from `state.subscriptions` and accountCode set membership — not relevant to the priorYear↔lines divergence axis.
- **Step 6 Subscriptions reconciliation badge** (Step6Subscriptions.tsx:970+, "isReconciled" label) is computed in the API at `src/app/api/Xero/subscription-transactions/route.ts:1003+` against the live Xero P&L Report; it's NOT affected by `setPriorYearDisplay` and would not have been the surface where Matt saw the mismatch (unless he was specifically on Step 6 looking at the badge — possible but Step 5's BudgetFramework is the more visible surface for "Xero data not reconciling").

