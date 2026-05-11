# Phase 60 — Subscription Step UX Fixes

## Goal

Close three rough edges in Step 5 (Subscriptions) of the forecast wizard that surfaced during JDS testing on 2026-05-11:

1. **Fresh forecasts should surface previously-classified vendors with an explicit "Confirm" affirmation** — currently the vendor list loads from `subscription_budgets` but never explicitly invites the operator to confirm. Coaches manually re-classify the same vendors year after year (or worse, skip the step entirely thinking it's pre-confirmed).

2. **Per-vendor "Re-analyze" affordance** — for any vendor with empty `account_codes` (legacy data, or rows written by older code paths), give the operator a one-click way to backfill that vendor's transaction history without re-running the entire chart-of-accounts dance.

3. **Visible error surfacing** — when lazy-fetch of transactions fails (currently silent — operator sees a vendor expand to a blank area), show a clear inline error with the actionable next step ("Re-analyze this vendor" CTA).

## Why now

Direct follow-up to PR #165 (`fix(subscriptions): write per-vendor accountCodes, not stale summary`, merged 2026-05-11 as `0a6f4b03`). That fix corrected the save-path race that was zeroing `account_codes`, but:
- It doesn't fix the existing broken rows in prod (JDS 47, Envisage 44, PEG 12 — all `account_codes = []`)
- It doesn't change the "load → silently use stale state" UX where the operator never sees an explicit confirmation step
- It doesn't make the lazy-fetch failure visible — when account_codes are empty, the expand shows a blank area with no explanation or recovery path

CFO-grade accuracy means these silent failure modes are unacceptable. An operator should always know what data is being used and have a clear path to correct it.

## Scope (2 plans)

### 60-01 — Visible error + per-vendor re-analyze (recovery path)

**Files modified:** `src/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions.tsx`

1. When vendor.isExpanded === true AND transactions are missing AND `txnFetchErrorKeys` contains this vendor's key → render an inline error box: "Couldn't load transactions — account codes missing. [Re-analyze this vendor]"

2. Wire the "Re-analyze this vendor" button to a new handler that:
   - Calls `/api/Xero/subscription-transactions` scoped to this vendor's known accountCodes IF non-empty
   - If accountCodes is empty too: prompts the operator to "Re-run full subscription analysis" (existing flow) — single click, no chart-of-accounts re-selection
   - On success: writes back to subscription_budgets with the now-correct accountCodes (using the fix from PR #165)
   - Local state updates so the expand panel populates without a page reload

3. The "no account codes recorded" guard at line 548 should set `txnFetchErrorKeys` AND not silently bail — the UI then renders the error inline.

### 60-02 — Fresh-forecast confirm UX (proactive path)

**Files modified:** `src/app/finances/forecast/components/wizard-v4/steps/Step6Subscriptions.tsx`

1. Detect "fresh forecast with restored subscriptions" state: on mount, if `vendors.length > 0` AND the wizard's `currentStep` was just entered (i.e. operator hasn't interacted with this step in the current session) AND no `confirmed_at` flag → render a header banner: "We loaded {N} subscriptions from your previous forecast. Review the list, then click Confirm to use these for FY{target}."

2. Add a top-level "Confirm subscriptions" CTA that:
   - On click, marks the step's local state as confirmed (transient — not persisted to DB; resets per wizard session)
   - Hides the banner and shows a small "Confirmed for FY{target}" pill instead
   - Operator can still un-confirm to make further changes (toggles the banner back)

3. The "Skip" / proceed-to-next-step affordance should be gated on either (a) confirmation OR (b) explicit "Skip subscriptions" — never let a fresh-forecast operator walk through Step 5 without acknowledging that the data was pre-loaded.

## Out of scope

- **Backfilling the 47/44/12 broken rows server-side** — operator can re-run analyze via 60-01's per-vendor path or via Step 5's existing "Re-analyze all" flow now that PR #165 is in. Defer a bulk migration unless this becomes painful.
- **Persisting `confirmed_at` to DB** — the confirm flag is per-session only. If we want it persistent (e.g. so coaches can see "FY27 subscriptions confirmed 2026-05-15"), that's a follow-up.
- **Adding new vendor detection** — Phase 60 doesn't surface "new vendors found in Xero since last forecast" prompts. Could be a Phase 61 follow-up.
- **Multi-business batch tooling** — if coaches want to bulk-confirm subscriptions across all their businesses, that's separate UX work.

## Dependencies

- PR #165 (`0a6f4b03`) — save-path fix must be on main first so that any re-analyze triggered by 60-01 persists correctly. ✓ on main.
- Phase 51 (UX-S6-01) — established `accountCodes` per-vendor field on `subscription_budgets`. ✓ shipped.
- Phase 57 — established subscription_budgets table as year-agnostic with mount-time fetch into wizard state. ✓ shipped.

## Success criteria

After this phase ships:

1. **JDS (47-row broken case)** — coach opens Step 5, sees vendor list, expands "Fusion Signage" (113 txns). Instead of a blank area, sees an inline error: "Couldn't load transactions — account codes missing." Clicks "Re-analyze this vendor" → transactions appear within seconds.

2. **Fresh forecast (e.g. seeded FY27 from FY26)** — coach lands on Step 5, sees a banner "We loaded 47 subscriptions from your previous forecast. Review the list, then click Confirm." Cannot proceed past Step 5 without either confirming or explicitly skipping.

3. **Confirmation flag** — once "Confirm" clicked, the banner disappears and a small "Confirmed for FY27" pill is shown. Operator can still toggle vendor.isActive freely.

4. **Build + typecheck + vitest + lint all green.**

5. **Manual smoke**: confirmed against JDS preview deploy that:
   - Per-vendor re-analyze fixes one vendor at a time
   - Confirm CTA works as expected on fresh forecast
   - Error banner displays correctly when accountCodes missing
   - Step 5 can be skipped (per the "explicit skip" gate) without crashing the wizard

## Risk + rollback

**Risk:** Step 5 is heavily used and complex (`Step6Subscriptions.tsx` is ~900+ lines). Adding two UI affordances could introduce regressions to the existing analyze/save flow. Mitigation: per-batch commits, run existing Step6 tests after each change.

**Risk:** "Confirm" gating could be too aggressive — operators who legitimately want to skip Step 5 with no subscriptions need a clear path. Mitigation: explicit "Skip subscriptions" button alongside Confirm.

**Rollback:** purely additive UI changes. Revert the PR → existing Step 5 behavior returns. Save-path fix from PR #165 is unaffected.
