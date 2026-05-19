# 65-04-PLAN-CHECK

**Verdict:** PASS (with two FLAGs)

Plan 65-04 ships three ENFORCE-mode integration tests + the env-var cutover runbook + the human-executed flip. No production code changes (all behavior change goes through the env var read at module load on the next deploy).

## Coverage analysis

Delivers:
- 3 ENFORCE-mode test files (Tests A 403 / B owner-allowed-200 / C LOG_ONLY-regression-guard) on the same 3 representative routes as 65-02
- `65-04-ENFORCE-CUTOVER.md` runbook with exact Vercel CLI commands for flip + kill-switch
- Human-executed flip with cutover record (timestamps, first `enforced:true` Sentry event, rollback if used)

This satisfies precision-pattern items 5 (env-var-gated toggle), 11 (manual `vercel promote`), 12 (24h Sentry monitoring — implicitly via the 5-60 min post-flip watch), and 13 (rollback recipe).

## Precision compliance

- ✅ Env var name is exactly `SECTION_PERMISSION_ENFORCE` — single source.
- ✅ Test C (regression guard) pins the LOG_ONLY behavior so a future refactor cannot silently disable rollback.
- ✅ Kill-switch documented as `vercel env rm SECTION_PERMISSION_ENFORCE production && vercel --prod` — matches CONTEXT.md item 10.
- ✅ Code-level rollback (revert 65-02 PR) documented as the second-line fallback.
- ✅ `git diff --stat HEAD -- src/lib src/app/api/*/route.ts | grep -v __tests__` empty — no production code changes in this plan.

## Test coverage assessment

3 ENFORCE-mode files × 3 tests each = 9 tests. Matches the planner's CONTEXT.md claim ("3 integration tests + regression guard").

The test plan correctly defers the env-var-at-module-load problem to executor discretion (FLAG 3 from planner). Two viable approaches are spelled out (`vi.mock` of the config module OR `vi.stubEnv` + `vi.resetModules` + dynamic import). The recommended `vi.mock` approach is more robust because it bypasses the module-load-timing issue entirely; the alternative is documented as a fallback.

## Specific issues found

**FLAG 1** — Post-flip verification step 3 ("If NO `enforced: true` events appear within 60 minutes... possible: the env var didn't propagate") gives the operator three diagnosis paths but no concrete "how to confirm the env var is live at runtime." Today the only sure-fire way is to look at a Sentry event — but if there's no traffic, there's no event. Suggested addition: have one of the integration tests add a synthetic `?_env_probe=1` query param handler in dev, OR document a one-off curl from the operator's machine (logged in as a known `finances:false` test member) to FORCE one event in the watch window. Without this, the "no events ≠ broken" branch is unverifiable in low-traffic windows.

**FLAG 2** — The cutover runbook's "Code-level rollback" step uses `git revert <65-02-merge-sha>` but the SUMMARY for 65-02 doesn't pin the merge SHA. Recommend Task 1 of 65-04 backfill the SHA into the runbook (or instruct the operator to fill it in during Task 3 step 1's pre-flight check). Currently it's a `<65-02-merge-commit-sha>` placeholder which an operator at 2am might not know how to resolve quickly.

## Required revisions

None. Both items are FLAGs.

## Notes for the executor

- Tests should use the existing project mock pattern (planner left this open — fine; both `vi.mock` examples exist in the codebase).
- Test C (regression guard) is the unsung hero — pins that the kill-switch path actually returns 200 + logs an info event. Don't drop it under "let's speed up the test file".
- `<resume-signal>` block at the end correctly differentiates "ENFORCE is live", "rolled back", and "no signal yet" — three distinct states matching reality.
