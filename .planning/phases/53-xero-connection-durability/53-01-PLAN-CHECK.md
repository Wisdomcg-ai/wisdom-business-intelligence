# 53-01 Plan Check

**Verdict:** PASS — execution-ready. 3 advisory flags, 0 blockers.

## Critical questions verified

| Q | Answer |
|---|---|
| Dual-ID delete fires both directions? | YES — `idsToDelete = [canonical, profile].filter(Boolean)` then `.in('business_id', idsToDelete)`. Test 5 captures the array. |
| Avoids `resolveXeroBusinessId` correctly? | YES — that helper short-circuits to ONE id and filters `is_active=true`; both wrong for disconnect. Plan inlines the correct dual-resolve. |
| `deleted_count === 0` is soft-failure? | YES — server returns `success: false, error: 'nothing_to_delete'` at HTTP 200. FE gates state mutation on `res.ok && data.success && (data.deleted_count ?? 0) > 0`. Test 7 covers. |
| FK constraints? | VERIFIED — only `forecasts.xero_connection_id` references with `ON DELETE SET NULL` (`baseline_schema.sql:8785`). No other FKs. Hard delete safe. |
| RBAC mirrors reactivate? | YES — same `getUser` → 401, same owner/coach/super_admin chain → 403. Test 6 exercises coach-acting-as-client. |
| Out-of-scope hygiene? | CLEAN — `files_modified` exactly: disconnect/route.ts (NEW), integrations/page.tsx (handler only), test file (NEW). No edits to other plans' domains. |

## Goal-backward truth trace
All 11 goal truths covered. JDS dual-stale-row scenario blocked by truths #5 + #7 jointly.

## Dimensions
All 10 dimensions PASS or N/A.

## Flags (advisory, non-blocking)

| # | Severity | Issue |
|---|---|---|
| F1 | info | Mention `pending_xero_connections` in route comments — not modified by disconnect (keyed by user_id, self-expires 10 min). Closes tiny audit gap. |
| F2 | info | Disconnect's business lookup is intentionally more permissive than reactivate's (FE may pass either ID form). "Mirrors reactivate" claim is true for auth + RBAC, not business lookup. Already documented but reaffirm. |
| F3 | info | Test 1 should explicitly assert `expect(mockAdminFrom).not.toHaveBeenCalled()`. Prose says "no admin client calls" but snippet doesn't show the assertion. |

## Bottom line
**PASS.** Proceed to execution. RED → GREEN → CHECKPOINT structure is correct. Flags are polish only.
