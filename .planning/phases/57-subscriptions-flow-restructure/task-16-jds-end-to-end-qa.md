# Task 16 — JDS end-to-end manual QA (gating ship checkpoint)

**Ship batch:** B6 (Sign-off) · **Wave:** 7 · **Dependencies:** ALL prior tasks · **Risk:** **HIGH** (gate)

## Goal

Verify on a real client forecast (JDS — Matt's reference tenant per memory `user_role.md` and `reference_xero_reconciliation_verifier`) that:

1. The new wizard flow loads, walks, and saves without data loss
2. Y1 net profit on JDS matches the pre-Phase-57 baseline (modulo explainable rounding)
3. The subscription detail report (`/api/monthly-report/subscription-detail/route.ts:216`) returns the same vendor list as before
4. No console errors on opening a v10 draft (validates T03 migration)
5. StepBar clickable nav works for jumps both directions
6. Excel export Subscriptions tab is populated

This is the **ship gate**. If ANY criterion fails, document the gap, file as Phase 57.1 follow-up, and decide whether to revert or hot-fix.

## Variance threshold (pinned)

**Threshold for "matches baseline":** Y1 net profit must be within **$10 OR 0.05% of revenue, whichever is greater**. This single number is applied consistently across all baseline comparisons in this task. Replaces previous mentions of $1, $5, or other thresholds.

Example: a forecast with Y1 revenue of $2M tolerates `max($10, 0.0005 × $2M) = max($10, $1000) = $1000` of variance. A forecast with Y1 revenue of $100k tolerates `max($10, $50) = $50`.

## Pre-deploy baseline capture (BEFORE B1 ships) — owner: Matt

**This is a hard gate on B1 merge.** If `jds-baseline-pre-phase-57.json` is not committed to the phase directory at B1 review, **BLOCK the B1 merge** until it lands.

### Step 0: Verify baseline script existence

Before B1 PR opens, run:

```bash
grep -i 'forecast\|net.profit\|y1.*np' scripts/verify-production-migration.ts
```

**If hits exist** AND the existing script outputs forecast P&L for a single tenant (Y1 net profit, Y1 OpEx total, Y1 subscription_budgets sum), use it directly:

```bash
node scripts/verify-production-migration.ts --tenant=JDS --output=.planning/phases/57-subscriptions-flow-restructure/jds-baseline-pre-phase-57.json
```

**If no forecast P&L output exists** (the script only handles BS/P&L verification, not forecast snapshotting), write a new helper:

`scripts/snapshot-forecast-baseline.ts`:
- Loads JDS's saved forecast (most recent active forecast for the tenant)
- Outputs structured JSON with these fields:
  - `tenant`: "JDS"
  - `forecastId`: the forecast row id
  - `capturedAt`: ISO timestamp
  - `y1NetProfit`: Y1 net profit (exact dollar)
  - `y1Revenue`: Y1 revenue (for variance threshold computation)
  - `y1OpExTotal`: Y1 OpEx total (used for delta investigation in step 6)
  - `y1SubscriptionBudgetsSum`: Σ(monthlyBudget × 12) for active rows in `subscription_budgets`
  - `y2NetProfit`: Y2 net profit (if duration ≥ 2)
  - `y3NetProfit`: Y3 net profit (if duration ≥ 3)
- Saves output to `.planning/phases/57-subscriptions-flow-restructure/jds-baseline-pre-phase-57.json`
- Commits the JSON to the repo (so the baseline is auditable)

### Step 0.5: Capture and commit

```bash
node scripts/snapshot-forecast-baseline.ts --tenant=JDS
# Or, if existing script supports it:
node scripts/verify-production-migration.ts --tenant=JDS --output=.planning/phases/57-subscriptions-flow-restructure/jds-baseline-pre-phase-57.json

git add .planning/phases/57-subscriptions-flow-restructure/jds-baseline-pre-phase-57.json
git commit -m "chore(57): capture JDS forecast baseline pre-Phase-57"
```

**Owner: Matt.** Capture baseline before B1 PR is opened. If `jds-baseline-pre-phase-57.json` is not committed at B1 review, BLOCK B1 merge.

## Intermediate checkpoint (post-B2) — 5-min sanity check

After B2 deploys (rollup math + type field), before B3 PR opens:

1. Load JDS forecast in the wizard (don't walk all steps, just open it)
2. Read Y1 net profit from the Step 9 Review screen (or the summary panel)
3. Compare against `jds-baseline-pre-phase-57.json` `y1NetProfit`
4. **Variance check:** delta within `max($10, 0.05% × y1Revenue)` per the pinned threshold above

If pass → B2 is safe, proceed to B3.
If fail → STOP. Investigate. T07 rollup math has a bug — likely the no-op assumption is wrong (e.g., `state.subscriptions` is not actually empty for JDS, or the OpEx accumulator skip logic mis-fires).

This 5-min check costs nothing and catches the highest-risk regression early.

## Post-deploy verification (AFTER B5 ships)

### Step 1: Open JDS forecast as a coach

1. Log in to production (or staging if available) as Matt's coach account
2. Navigate to JDS's forecast
3. **Verify:** wizard loads on the correct step (the step JDS was last edited on)
4. **Verify:** no `console.error` (open DevTools → Console)
5. **Verify:** the migration log line appears in console: `[ForecastWizard] Phase 57 migration: currentStep N → M`

### Step 2: Walk through every step

For each step 1-9:
- Click into the step
- Verify all data is populated (revenue lines, COGS, team, etc.)
- Verify nothing has changed from the operator's last save
- Take a screenshot (filename: `step-N-after-phase-57.png`)

Specifically for **Step 5 (Subscriptions, new)**:
- Verify vendor list loads from `subscription_budgets`
- Verify vendor budgets match historical
- Verify gap warning banner state matches expectations (does/doesn't show based on actual ratio)

For **Step 6 (OpEx, new)**:
- Verify BudgetFramework shows Subscriptions line
- Verify "Available OpEx" decreases by exactly the subscriptions amount vs. pre-Phase-57 (manually compute)
- Verify any OpEx line with an accountCode covered by Step 5 has the "Covered by Step 5" badge
- **Verify the legacy "Refresh from Xero" nudge banner appears** if `state.needsAccountCodeRefresh === true` (likely YES for JDS, since their saved forecast predates Phase 57). Click "Refresh from Xero", verify banner disappears, verify opexLines now have populated accountCodes.

For **Step 9 (Review)**:
- Verify P&L waterfall has Subscriptions line between Team and OpEx
- **Verify Y1 net profit matches the pre-Phase-57 baseline within $10 OR 0.05% of revenue, whichever is greater (per the pinned threshold)**
- Verify scenario adjustments (if any) still produce sensible outputs

### Step 3: Test clickable nav

1. From step 9, click step 2 → wizard navigates back, all step 9 state preserved
2. From step 2, click step 7 → wizard navigates forward (since 7 was previously visited)
3. Edit a vendor on step 5, immediately click step 6 → verify edit persisted (T12 flush)
4. Disconnect network, edit a vendor, click step 6 → verify toast "Could not save your changes. Please try again." and currentStep stays on 5

### Step 4: Subscription detail report regression

Hit `/api/monthly-report/subscription-detail?business_id=<JDS-id>&period=...` (or visit the corresponding UI page).

Verify the response contains the same vendor list (count, names, totals) as pre-Phase-57. If a `jds-baseline-pre-phase-57.json` field captured this, diff against current.

### Step 5: Excel export

Click "Export Excel" on JDS. Open the resulting file:
- Subscriptions tab populated with real vendor rows
- Summary numbers match Step 9 Review

### Step 6: Variance investigation

If Y1 net profit differs from baseline by more than the pinned threshold (`max($10, 0.05% × y1Revenue)`), investigate:

1. Get the pre-Phase-57 baseline opex value (call it `opex_old` from `jds-baseline-pre-phase-57.json:y1OpExTotal`)
2. Get the post-Phase-57 opex value (`opex_new`) — this should be lower if any lines were excluded
3. Get the post-Phase-57 subscriptions value (`subs_new`)
4. Expected: `opex_old ≈ opex_new + subs_new` (modulo Y2/Y3 growth math)

If they don't match within rounding:
- Was the Step 6 vendor list updated since the forecast was saved? (`subscription_budgets` is live; may have drifted)
- Are there OpExLines with `accountCode === undefined` covering accounts that ARE in vendor accountCodes? (The exclusion fall-through skips them — correct behavior, but creates a real Δ if the operator should have refreshed via the T11 nudge banner)
- Are there OpExLines with codes that DON'T match any vendor accountCode? (Then they correctly contribute to opex; no change)

Document findings in QA report. If the variance is "live data drift since last save," that's expected Phase-57 behavior — operator can re-run the wizard and re-save to refresh. If the variance is unexpected, file Phase 57.1.

## Acceptance criteria

- [ ] **Pre-B1: `jds-baseline-pre-phase-57.json` exists and is committed to phase directory. If absent, BLOCK B1 merge.** Owner: Matt.
- [ ] Pre-B1: ran `grep -i 'forecast\|net.profit\|y1.*np' scripts/verify-production-migration.ts` to confirm baseline script existence; wrote `scripts/snapshot-forecast-baseline.ts` if needed.
- [ ] Post-B2 (5-min sanity check): JDS Y1 net profit within `max($10, 0.05% × y1Revenue)` of baseline. Pass before B3 opens.
- [ ] JDS forecast loads, walks all 9 steps without data loss
- [ ] **Y1 net profit matches pre-Phase-57 baseline within $10 OR 0.05% of revenue, whichever is greater** (pinned threshold, applied consistently)
- [ ] Subscription detail report returns same vendor list
- [ ] StepBar clickable nav works in all directions
- [ ] Step 5 → Step 6 navigation flushes vendor edits
- [ ] Network failure during nav shows toast + stays on current step
- [ ] No console errors on draft load
- [ ] Excel Subscriptions tab populated
- [ ] AI narrative panel shows correct step labels (no "Step 5: Operating Expenses" or "Step 8: Final Review") AND content matches the new ordering (subscriptions narrative on step 5, OpEx classification narrative on step 6)
- [ ] Legacy "Refresh from Xero" nudge banner works on JDS (assuming JDS forecast predates Phase 57): banner appears, click triggers refresh, opexLines get populated accountCodes, banner disappears
- [ ] QA report saved to `.planning/phases/57-subscriptions-flow-restructure/57-QA-REPORT.md`

## Regression risks

- **R2 from PLAN risk register:** rollup math regression. T16 catches this. If Y1 NP changes by more than the pinned threshold, ship is blocked.
- **R10 — baseline script doesn't exist or doesn't capture forecast P&L:** mitigated by Step 0 above (grep + write helper if needed). Owner: Matt.
- **JDS-specific edge cases** (e.g., manual OpExLines without Xero ingest): document, decide whether to ship or hot-fix.

## Estimated effort

0.75 day total:
- 0.25d to write `scripts/snapshot-forecast-baseline.ts` (if needed) and capture JDS baseline before B1
- 0.5d for the post-B5 walkthrough + screenshots + variance investigation if any

## Output

Write `.planning/phases/57-subscriptions-flow-restructure/57-QA-REPORT.md` capturing:
- Pre-Phase-57 baseline numbers (from `jds-baseline-pre-phase-57.json`)
- Post-B2 5-min sanity-check result
- Post-Phase-57 numbers
- Pass/fail on each acceptance criterion
- Screenshots of each step
- Any deferred items for Phase 57.1
- Sign-off signature (Matt's approval)
