# 53-05 Plan Check

**Verdict:** FLAG — execution-ready with 3 issues to address. Issue C is the only meaningful one (double-capture); A and B are wording / threshold tuning.

## Goal restated
Dead Xero connections detected within minutes via:
1. Sentry capture on every system-detected `is_active=false` flip, exactly once, never user-initiated.
2. Coach dashboard per-business pill with click-to-reconnect.

## Issues

### Issue A — FLAG (cosmetic): "per-route captures are deleted" framing
must_haves.truths[2] says per-route captures are deleted. Reality: there were never per-route Sentry captures, only redundant DB writes (`employees/route.ts:187` survives). Truth's *outcome* is correct (one Sentry event per failure); only framing is wrong.

**Fix:** reword to "Per-route deactivation writes survive but emit no Sentry — only the token-manager site captures."

### Issue B — FLAG: 24h "verified" threshold vs 53-04's 6h cron
24h means a connection where 53-04 cron has FAILED 3× in a row still shows verified. Tightening to 12h gives defense-in-depth against one missed cron run.

**Fix:** consciously choose 12h vs 24h; document rationale.

### Issue C — FLAG (the real one): double-Sentry-capture between 53-04 and 53-05
- 53-04's cron loop fires `Sentry.captureException` with `invariant=cron_refresh_xero_tokens_deactivated` when `result.shouldDeactivate === true`.
- 53-05 adds centralized capture inside `token-manager.ts` with `invariant=xero_connection_deactivated`.
- Cron-triggered deactivations produce **two events** per single root deactivation, violating must_haves.truths[2] ("exactly ONE event per failure").

**Fix:** add step to 53-05 Task 1 (or new Task 4) editing `src/app/api/cron/refresh-xero-tokens/route.ts` to remove the per-connection `cron_refresh_xero_tokens_deactivated` capture (token-manager fires that one centrally). Cron retains aggregate + non-deactivation per-connection captures.

Alternative: explicitly accept "two events with different invariants" as a feature (one for root cause, one for cron context). Document in must_haves.truths[2] if so.

## Dimension scorecard
9/10 PASS, 1 FLAG (Issue C — cross-plan data contracts).

## Bottom line
**FLAG — proceed to execution with the 3 adjustments.**

Plan WILL deliver the user story. Issue C requires a small Task 1 addition to remove 53-04's per-connection deactivation capture — easy fix during execution, no replan needed.

Recommended execution adjustment for 53-05 Task 1:
- Add to action steps: "Edit `src/app/api/cron/refresh-xero-tokens/route.ts` to remove per-connection `cron_refresh_xero_tokens_deactivated` Sentry capture. Token-manager fires this centrally; cron retains only aggregate + non-deactivation per-connection captures."
- Add corresponding test verifying cron route does NOT call `Sentry.captureException` when `getValidAccessToken` returns `shouldDeactivate=true`.
